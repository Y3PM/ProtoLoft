#!/usr/bin/env python3
"""Review diagnostics against disposable HTTP data; never send robot messages.

Exit 1 means a product expectation failed. Inspect results.json for observations.
"""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import uuid

from guest_permissions_regression import sandbox_server, TestClient, PASS_WORD, make_proto_zip

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    parser.add_argument('--playwright-module', required=True)
    parser.add_argument('--output', type=Path, default=ROOT / '.dev/tmp/deep-fix-recheck-20261110')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    checks = []

    def record(name, passed, detail):
        checks.append({'name': name, 'passed': bool(passed), 'detail': detail})
        print(('PASS ' if passed else 'FAIL ') + name + ': ' + json.dumps(detail, ensure_ascii=False), flush=True)

    with sandbox_server(args.php) as (base, temporary):
        root = Path(temporary)
        webhook = root / 'includes/webhook.php'
        source = webhook.read_text()
        needle = '    public static function send($url, $eventType, $data) {'
        assert source.count(needle) == 1
        webhook.write_text(source.replace(needle, needle + "\n        return ['success' => true];\n", 1))
        owner = TestClient(base).login('admin@test.com', PASS_WORD)

        def ok(action, fields, files=None):
            result = owner.api(action, fields, files=files)
            assert result['success'], (action, result)
            return result.get('data')

        ok('save_settings', {'visitor_register_enabled': 1, 'visitor_notify_admin_ids[]': ''})
        guest = TestClient(base)
        guest.token = guest.api('get_session')['data']['csrfToken']
        registrations = [guest.api('register_visitor', {
            'email': 'quota%d@test.com' % number, 'name': '申请测试%d' % number, 'password': PASS_WORD
        }) for number in range(1, 7)]
        with sqlite3.connect(root / 'data/database.sqlite') as db:
            quota_rows = db.execute("SELECT COUNT(*) FROM settings WHERE key LIKE 'throttle_%'").fetchone()[0]
            pending = db.execute("SELECT COUNT(*) FROM users WHERE status = 0").fetchone()[0]
        record('same IP sixth visitor application is throttled',
               not registrations[-1]['success'] and '频繁' in registrations[-1].get('message', ''),
               {'accepted': sum(bool(r['success']) for r in registrations), 'pending': pending,
                'throttle_rows': quota_rows, 'sixth_message': registrations[-1].get('message')})

        # Normal rejection releases the email; unrelated settings preserve recipients.
        denied_id = registrations[0]['data']['id']
        ok('reject_user', {'id': denied_id})
        recreated = ok('user_add', {'email': 'quota1@test.com', 'name': '重新建号',
                                    'password': PASS_WORD, 'role': 'viewer'})
        record('rejected email can be reused by administrator', bool(recreated), {})
        ok('save_settings', {'visitor_notify_admin_ids[]': owner.user['id']})
        ok('save_settings', {'site_title': '深度修复审查'})
        with sqlite3.connect(root / 'data/database.sqlite') as db:
            recipients = json.loads(db.execute("SELECT value FROM settings WHERE key = 'visitor_notify_admin_ids'").fetchone()[0])
        record('partial settings save preserves approval recipients', recipients == [int(owner.user['id'])], recipients)

        category = ok('category_save', {'name': '深度修复审查'})['id']
        item = int(ok('item_save', {'name': '撤销并发样本', 'category_id': category, 'type': 'project'})['id'])
        upload = uuid.uuid4().hex
        zip_bytes = make_proto_zip()
        ok('upload_chunk', {'upload_id': upload, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1},
           {'chunk_data': ('part', zip_bytes)})
        version = int(ok('version_publish', {'item_id': item, 'version_name': 'V1', 'zip_upload_id': upload,
                                             'notify_item': 0, 'notify_global': 0})['id'])
        codes = [ok('share_code_create', {'item_id': item, 'ver_id': version, 'label': label,
                                          'expire_preset': 'forever'})['code'] for label in ['外发 A', '外发 B']]
        ok('user_add', {'email': 'viewer@test.com', 'name': '复制测试审阅人', 'password': PASS_WORD, 'role': 'viewer'})
        link = int(ok('item_save', {'name': '审阅人外链', 'category_id': category, 'type': 'link',
                                    'link_url': 'https://example.invalid/review'})['id'])

        svg = ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg" '
               'width="480" height="80"><rect width="480" height="80" fill="white"/>'
               '<text x="12" y="35">SVG review fixture</text>'
               '<s:script>document.documentElement.setAttribute("data-review-executed","yes");'
               'document.getElementsByTagName("text")[0].appendChild(document.createTextNode(" / script executed"));'
               '</s:script></svg>')
        uploaded = owner.api('save_settings', {}, {'custom_logo': ('namespace-script.svg', svg.encode())})
        with sqlite3.connect(root / 'data/database.sqlite') as db:
            logo_row = db.execute("SELECT value FROM settings WHERE key = 'site_logo'").fetchone()
            logo = logo_row[0] if logo_row else None
        record('namespaced SVG script is rejected by real upload endpoint', not uploaded['success'],
               {'upload_success': uploaded['success'], 'message': uploaded.get('message')})

        fixture = {'base': base, 'password': PASS_WORD, 'item': item, 'codes': codes,
                   'link': link, 'logo': logo if uploaded['success'] else None,
                   'zip': list(zip_bytes), 'output': str(args.output.resolve())}
        run = subprocess.run(['node', str(Path(__file__).with_suffix('.js'))],
                             env=dict(os.environ, PLAYWRIGHT_MODULE=args.playwright_module,
                                      PRERELEASE_RECHECK_FIXTURE=json.dumps(fixture)),
                             text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=150)
        print(run.stdout, end='', flush=True)
        (args.output / 'browser.log').write_text(run.stdout)
        assert run.returncode == 0, 'Browser diagnostics did not complete'
        browser_result = json.loads((args.output / 'browser.json').read_text())
        checks.extend(browser_result['checks'])
        with sqlite3.connect(root / 'data/database.sqlite') as db:
            statuses = [db.execute('SELECT status FROM share_codes WHERE code = ?', (code,)).fetchone()[0] for code in codes]
        record('both confirmed share revocations reach persistence', statuses == [0, 0], {'statuses': statuses})
        result = {'baseline': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                  'checks': checks, 'browser': browser_result,
                  'passed': sum(c['passed'] for c in checks), 'failed': sum(not c['passed'] for c in checks)}
        (args.output / 'results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps({'passed': result['passed'], 'failed': result['failed']}, ensure_ascii=False))
    return 1 if result['failed'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
