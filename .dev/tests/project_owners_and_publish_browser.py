#!/usr/bin/env python3
"""Chrome E2E: 方案 A：协作权限模式、成员多选与发版入口验证"""
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

    with sandbox_server(args.php) as (base, _):
        admin = TestClient(base).login('admin@test.com', PASS_WORD)
        cat_res = admin.api('category_save', {'name': '核心产品线'})
        assert cat_res.get('success'), cat_res
        cat_id = int(cat_res['data']['id'])

        ed_a = admin.api('user_add', {
            'email': 'editora@test.com',
            'name': '协作者A',
            'password': PASS_WORD,
            'role': 'editor'
        })
        ed_b = admin.api('user_add', {
            'email': 'editorb@test.com',
            'name': '协作者B',
            'password': PASS_WORD,
            'role': 'editor'
        })
        assert ed_a.get('success') and ed_b.get('success')

        artifact_dir = ROOT / '.dev' / 'tmp' / 'collaboration-scope-a-verify'
        artifact_dir.mkdir(parents=True, exist_ok=True)
        fixture = {
            'base': base,
            'password': PASS_WORD,
            'catId': cat_id,
            'adminId': int(admin.user['id']),
            'editorAId': int(ed_a['data']),
            'editorBId': int(ed_b['data']),
            'artifacts': str(artifact_dir)
        }
        env = dict(os.environ, PLAYWRIGHT_MODULE=args.playwright_module, OWNERS_FIXTURE=json.dumps(fixture))
        run = subprocess.run(
            ['node', str(Path(__file__).with_suffix('.js'))],
            env=env,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=180
        )
        print(run.stdout, end='')
        run.check_returncode()


if __name__ == '__main__':
    main()
