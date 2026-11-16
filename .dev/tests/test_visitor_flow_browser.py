#!/usr/bin/env python3
"""Visitor registration flow browser verification:
1. Ensure domain badge @example.com displays steadily before and after typing/submitting;
2. Verify smooth transition back to login on successful registration;
3. Verify email auto-fill, domain badge alignment, and green success notification;
4. Repeat for both standalone lock screen (index.php) and workspace login modal (login_modal.php).
"""
import argparse
import json
import os
from pathlib import Path
import subprocess

from guest_permissions_regression import sandbox_server, TestClient, PASS_WORD


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    parser.add_argument('--playwright-module', required=True)
    args = parser.parse_args()
    with sandbox_server(args.php) as (base, temporary):
        owner = TestClient(base).login('admin@test.com', PASS_WORD)
        # 开启访客注册并设置固定企业域名 example.com
        res = owner.api('save_settings', {
            'visitor_register_enabled': '1',
            'allowed_email_domains': 'example.com'
        })
        assert res['success'], res

        environment = dict(os.environ, PLAYWRIGHT_MODULE=args.playwright_module,
                           VISITOR_FLOW_FIXTURE=json.dumps({'base': base, 'password': PASS_WORD}))
        subprocess.run(['node', str(Path(__file__).with_name('test_visitor_flow_browser.js'))],
                       env=environment, check=True, timeout=120)


if __name__ == '__main__':
    main()
