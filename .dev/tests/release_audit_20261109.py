#!/usr/bin/env python3
"""Release audit probes in a disposable installation. Observations are not fixes.

The JSON output records expected vs actual behavior, including known failures.
No production data or external webhook is used. See the matching review report.
"""
import argparse
import base64
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import uuid

from guest_permissions_regression import sandbox_server, TestClient, PASS_WORD, make_proto_zip


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    parser.add_argument('--playwright-module')
    args = parser.parse_args()
    with sandbox_server(args.php) as (base, temporary):
        owner = TestClient(base).login('admin@test.com', PASS_WORD)
        observations = []

        def ok(client, action, fields, files=None):
            result = client.api(action, fields, files=files)
            assert result['success'], (action, result)
            return result.get('data')

        editor_id = ok(owner, 'user_add', {'email': 'editor@test.com', 'name': '项目负责人', 'password': PASS_WORD, 'role': 'editor'})
        ok(owner, 'user_add', {'email': 'viewer@test.com', 'name': '审阅人员', 'password': PASS_WORD, 'role': 'viewer'})
        editor = TestClient(base).login('editor@test.com', PASS_WORD)
        viewer = TestClient(base).login('viewer@test.com', PASS_WORD)
        category = int(ok(owner, 'category_save', {'name': '定版审查样本'})['id'])
        item = int(ok(editor, 'item_save', {'category_id': category, 'type': 'project', 'name': '多版本协同样本'})['id'])
        link = int(ok(editor, 'item_save', {'category_id': category, 'type': 'link', 'name': '外链协同样本', 'link_url': '/assets/images/logo.svg', 'link_target': '_blank'})['id'])
        read_only_item = int(ok(owner, 'item_save', {'category_id': category, 'type': 'project', 'name': '其他成员负责的项目'})['id'])

        def upload(kind, content):
            ident = uuid.uuid4().hex
            ok(owner, 'upload_chunk', {'upload_id': ident, 'file_type': kind, 'chunk_index': 0, 'chunk_total': 1}, {'chunk_data': ('part', content)})
            return ident

        versions = []
        for name in ['V1', 'V2']:
            data = ok(owner, 'version_publish', {'item_id': item, 'version_name': name, 'changelog': name + ' 原始更新说明', 'zip_upload_id': upload('zip', make_proto_zip()), 'rp_upload_id': upload('rp', b'original RP'), 'is_default': 1})
            versions.append(int(data['id']))
        added = ok(owner, 'add_annotation', {'item_id': item, 'ver_id': versions[-1], 'page_path': 'index.html', 'page_title': '原型首页', 'content': '正常的原型批注'})
        annotation = int(added['id'])
        listed = ok(owner, 'list_annotations', {'item_id': item, 'ver_id': versions[-1]})['list'][0]
        observations.append({'id': 'annotation_timestamp', 'expected': 'same timestamp before and after reload', 'create_response': added['created_at'], 'list_response': listed['created_at']})
        link_annotation = int(ok(owner, 'add_annotation', {'item_id': link, 'ver_id': 0, 'page_path': 'link', 'page_title': '外链页面', 'content': '来自外链的审查反馈'})['id'])
        share = ok(owner, 'item_get_share', {'id': item})['share_code']
        link_share = ok(owner, 'item_get_share', {'id': link})['share_code']

        for viewer_permission, guest_permission in [(1, 0), (0, 1)]:
            ok(owner, 'save_role_permissions', {'perm_viewer_download_rp': viewer_permission, 'perm_guest_download_rp': guest_permission, 'perm_guest_annotate': 1})
            _, html, _ = viewer.request('/share.php?s=' + share)
            download_status = viewer.request('/api.php?action=download_rp&ver_id=' + str(versions[-1]))[0]
            observations.append({'id': 'share_download_permission', 'viewer_permission': viewer_permission, 'guest_permission': guest_permission,
                                 'expected_button': bool(viewer_permission), 'actual_button': b'id="btnShareDownloadRp"' in html, 'download_http': download_status})

        guest = TestClient(base)
        guest.request('/share.php?s=' + link_share)
        guest.token = guest.api('get_session')['data']['csrfToken']
        notes = [guest.api('add_annotation', {'item_id': link, 'ver_id': 0, 'page_path': 'link', 'content': '限流样本 ' + str(i), 'guest_name': '审查访客'}) for i in range(16)]
        replies = [guest.api('reply_annotation', {'annotation_id': link_annotation, 'content': '限流回复 ' + str(i), 'guest_name': '审查访客'}) for i in range(16)]
        observations.append({'id': 'guest_throttle', 'expected_maximum_per_minute': 15, 'accepted_notes': sum(bool(x['success']) for x in notes), 'accepted_replies': sum(bool(x['success']) for x in replies)})

        if args.playwright_module:
            fixture = {'base': base, 'password': PASS_WORD, 'category': category, 'item': item, 'editor_id': editor_id,
                       'versions': versions, 'annotation': annotation, 'link': link, 'link_annotation': link_annotation, 'link_share': link_share, 'read_only_item': read_only_item,
                       'zip_base64': base64.b64encode(make_proto_zip()).decode('ascii')}
            environment = dict(os.environ, PLAYWRIGHT_MODULE=args.playwright_module, RELEASE_AUDIT_FIXTURE=json.dumps(fixture))
            subprocess.run(['node', str(Path(__file__).with_suffix('.js'))], env=environment, check=True, timeout=120)

        # Fault injection only into the disposable asset directory: force rename
        # failure to observe whether the API reports success and consumes input.
        with sqlite3.connect(Path(temporary) / 'data/database.sqlite') as db:
            storage = db.execute('SELECT storage_dir FROM versions WHERE id=?', (versions[0],)).fetchone()[0]
            destination = Path(temporary) / 'data/prototypes' / storage / 'prototype.rp'
            destination.unlink()
            destination.mkdir()
            rp_result = owner.api('version_update_rp', {'id': versions[0], 'rp_upload_id': upload('rp', b'replacement RP bytes')})
            observations.append({'id': 'known_rp_save_failure', 'fault': 'destination is directory; rename must fail', 'api_success': rp_result['success'],
                                 'download_http': owner.request('/api.php?action=download_rp&ver_id=' + str(versions[0]))[0],
                                 'metadata': db.execute('SELECT rp_file,rp_size FROM versions WHERE id=?', (versions[0],)).fetchone()})
        print(json.dumps({'http_observations': observations}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
