#!/usr/bin/env python3
"""Architecture review witnesses against a disposable real HTTP installation.

Usage: python3 -B .dev/tests/architecture_review_http_probe.py --php /path/to/php
Exit 1: at least one issue reproduced; exit 2: probe/setup failed.
No production access or outbound messages. The only injected failure is a SQLite
trigger in the disposable database, used to test filesystem/DB rollback behavior.
"""
import argparse
import json
from pathlib import Path
import sqlite3
import sys
import urllib.parse
import urllib.request
import uuid

from guest_permissions_regression import sandbox_server, TestClient, PASS_WORD, make_proto_zip


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    args = parser.parse_args()
    findings = []

    def record(identifier, observed, detail):
        findings.append({'id': identifier, 'issue_reproduced': bool(observed), 'detail': detail})
        print(json.dumps(findings[-1], ensure_ascii=False), flush=True)

    with sandbox_server(args.php) as (base, temporary):
        temp = Path(temporary)
        owner = TestClient(base).login('admin@test.com', PASS_WORD)

        def ok(action, fields):
            result = owner.api(action, fields)
            assert result.get('success'), (action, result)
            return result.get('data')

        def read(client, action, **fields):
            _, body, _ = client.request('/api.php?' + urllib.parse.urlencode(dict(action=action, **fields)))
            return json.loads(body)

        def upload(data, kind):
            uid = uuid.uuid4().hex
            result = owner.api('upload_chunk', {'upload_id': uid, 'file_type': kind,
                'chunk_index': 0, 'chunk_total': 1}, {'chunk_data': ('part.bin', data)})
            assert result.get('success'), result
            return uid

        def publish(item, name, rp=None):
            fields = {'item_id': item, 'version_name': name, 'is_default': 1,
                'zip_upload_id': upload(make_proto_zip(), 'zip')}
            if rp is not None:
                fields['rp_upload_id'] = upload(rp, 'rp')
            return ok('version_publish', fields)['id']

        folder = ok('category_save', {'name': 'Audit fixture'})['id']
        item = int(ok('item_save', {'category_id': folder, 'type': 'project', 'name': 'Scoped fixture'})['id'])
        other = int(ok('item_save', {'category_id': folder, 'type': 'project', 'name': 'Other fixture'})['id'])
        previous = publish(item, 'V1')
        previous_anno = ok('add_annotation', {'item_id': item, 'ver_id': previous,
            'page_path': 'index.html', 'content': 'PRIVATE PREVIOUS VERSION FIXTURE'})['id']
        current = publish(item, 'V2', b'ORIGINAL RP FIXTURE')
        current_anno = ok('add_annotation', {'item_id': item, 'ver_id': current,
            'page_path': 'index.html', 'content': 'CURRENT ANNOTATION FIXTURE'})['id']
        db = sqlite3.connect(temp / 'data/database.sqlite')
        try:
            share = ok('share_code_create', {'item_id': item, 'ver_id': current, 'label': 'V2 only'})['code']
            guest = TestClient(base)
            status, _, _ = guest.request('/share.php?s=' + share)
            assert status == 200, status
            direct_old = read(guest, 'list_annotations', item_id=item, ver_id=previous)
            indirect_old = read(guest, 'previous_annotations', ver_id=current)
            leaked_ids = [row['id'] for row in (indirect_old.get('data') or {}).get('list', [])]
            record('guest_previous_version_boundary', not direct_old['success']
                and indirect_old['success'] and previous_anno in leaked_ids,
                {'old_version_direct_allowed': direct_old['success'],
                 'previous_endpoint_allowed': indirect_old['success'], 'previous_annotation_returned': previous_anno in leaked_ids})
            direct_current = read(guest, 'list_annotations', item_id=item, ver_id=current)
            target_current = read(guest, 'annotation_target', id=current_anno)
            record('guest_annotation_switch_boundary', not direct_current['success'] and target_current['success'],
                {'guest_annotation_enabled': False, 'list_allowed': direct_current['success'],
                 'target_allowed': target_current['success']})

            secret = ok('mcp_token_create', {'project_id': item, 'can_publish': 0})['secret']

            def rpc_projects():
                request = urllib.request.Request(base + '/mcp.php', data=json.dumps({
                    'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call',
                    'params': {'name': 'list_projects', 'arguments': {}}
                }).encode(), headers={'Content-Type': 'application/json', 'Authorization': 'Bearer ' + secret})
                with urllib.request.urlopen(request, timeout=20) as response:
                    result = json.load(response)['result']
                assert not result['isError'], result
                return [int(p['id']) for p in result['structuredContent']['projects']]

            before = rpc_projects()
            ok('mcp_permission_update', {'project_id': 0, 'can_publish': 0})
            after = rpc_projects()
            assert set(before) == {item} and set(after) == {item, other}
            print(json.dumps({'id': 'empty_mcp_scope_defaults_to_authorized_projects',
                'expected_behavior': True, 'projects_before': before, 'projects_after': after}))

            rp_path = temp / 'data/prototypes' / db.execute('SELECT storage_dir FROM versions WHERE id=?', (current,)).fetchone()[0] / 'prototype.rp'
            db.execute("CREATE TRIGGER audit_fail_rp BEFORE UPDATE OF rp_file ON versions BEGIN SELECT RAISE(ABORT, 'audit injected DB failure'); END")
            db.commit()
            failed_replace = owner.api('version_update_rp', {'id': current, 'rp_upload_id': upload(b'REPLACED RP FIXTURE', 'rp')})
            record('rp_replace_failure_preserves_old_file', not failed_replace['success'] and rp_path.read_bytes() != b'ORIGINAL RP FIXTURE',
                {'request_success': failed_replace['success'], 'old_file_preserved': rp_path.read_bytes() == b'ORIGINAL RP FIXTURE'})
            failed_remove = owner.api('version_remove_rp', {'id': current})
            db_rp = db.execute('SELECT rp_file FROM versions WHERE id=?', (current,)).fetchone()[0]
            record('rp_remove_failure_preserves_file', not failed_remove['success'] and bool(db_rp) and not rp_path.exists(),
                {'request_success': failed_remove['success'], 'db_still_references_rp': bool(db_rp), 'file_exists': rp_path.exists()})
            db.execute('DROP TRIGGER audit_fail_rp')
            db.commit()

            ok('save_settings', {'global_webhook_url': 'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=audit-not-sent'})
            _, page, _ = owner.request('/index.php')
            record('global_webhook_ui_uses_wrong_setting', b'var SYS_HAS_GLOBAL_WEBHOOK = false;' in page,
                {'global_webhook_configured': True, 'ui_says_available': b'var SYS_HAS_GLOBAL_WEBHOOK = true;' in page})
        finally:
            db.close()
    print(json.dumps({'observations': len(findings), 'issues_reproduced': sum(x['issue_reproduced'] for x in findings)}))
    return 1 if any(x['issue_reproduced'] for x in findings) else 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception as error:
        print(type(error).__name__ + ': ' + str(error), file=sys.stderr)
        sys.exit(2)
