#!/usr/bin/env python3
"""Approval recipient Webhook status across member/profile saves, in Chrome.
All accounts and Webhook addresses are synthetic; transport is blocked locally.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess

from guest_permissions_regression import sandbox_server, TestClient, PASS_WORD

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    parser.add_argument('--playwright-module', required=True)
    args = parser.parse_args()
    with sandbox_server(args.php) as (base, temporary):
        root = Path(temporary)
        hook = root / 'includes/webhook.php'
        source = hook.read_text()
        needle = '    public static function send($url, $eventType, $data) {'
        assert source.count(needle) == 1
        hook.write_text(source.replace(needle, needle + '''
        file_put_contents(DATA_PATH . '/unexpected-notification.log', $eventType . "\\n", FILE_APPEND);
        return ['success' => true];
''', 1))
        admin = TestClient(base).login('admin@test.com', PASS_WORD)
        users = {}
        for role in ['admin', 'editor', 'viewer']:
            result = admin.api('user_add', {'name': '同步测试' + role, 'email': role + '-sync@test.com',
                                           'password': PASS_WORD, 'role': role})
            assert result['success'], result
            users[role] = int(result['data'])
        for email in ['editor-sync@test.com', 'viewer-sync@test.com', None]:
            client = TestClient(base)
            if email:
                client.login(email, PASS_WORD)
            else:
                client.token = client.api('get_session')['data']['csrfToken']
            denied = client.api('user_update', {'id': admin.user['id'], 'webhook_url': ''})
            assert not denied['success'], (email, denied)
        print('PASS 协作者、审阅人、未登录访客仍不可修改管理员 Webhook', flush=True)
        artifact_dir = ROOT / '.dev/screenshots/approval-webhook-sync'
        artifact_dir.mkdir(parents=True, exist_ok=True)
        fixture = {'base': base, 'owner': int(admin.user['id']), 'other': users['admin'],
                   'password': PASS_WORD, 'artifacts': str(artifact_dir)}
        env = dict(os.environ, PLAYWRIGHT_MODULE=args.playwright_module,
                   APPROVAL_SYNC_FIXTURE=json.dumps(fixture))
        run = subprocess.run(['node', str(Path(__file__).with_suffix('.js'))], env=env, text=True,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=120)
        print(run.stdout, end='')
        run.check_returncode()
        assert not (root / 'data/unexpected-notification.log').exists()
        print('PASS 保存配置未触发机器人消息发送', flush=True)


if __name__ == '__main__':
    main()
