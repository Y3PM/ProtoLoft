#!/usr/bin/env python3
"""Runner for comprehensive dropdown and state sync browser regression."""
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
        admin = TestClient(base).login('admin@test.com', PASS_WORD)

        # 预先添加一个常驻文件夹，确保始终有分类用于项目创建
        admin.api('category_save', {'name': '默认业务线'})

        # 预先添加一个管理员账号 admin2，用于测试改名/降级/删除等
        res = admin.api('user_add', {
            'name': '超管二号',
            'email': 'admin2@test.com',
            'password': PASS_WORD,
            'role': 'admin'
        })
        assert res['success'], res
        admin2_id = int(res['data'])

        fixture = {
            'base': base,
            'password': PASS_WORD,
            'admin2Id': admin2_id
        }

        env = os.environ.copy()
        env['PLAYWRIGHT_MODULE'] = str(Path(args.playwright_module).resolve())
        env['DROPDOWN_SYNC_FIXTURE'] = json.dumps(fixture)

        script_js = Path(__file__).resolve().with_suffix('.js')
        proc = subprocess.run(['node', str(script_js)], env=env, check=True)
        assert proc.returncode == 0, proc


if __name__ == '__main__':
    main()
