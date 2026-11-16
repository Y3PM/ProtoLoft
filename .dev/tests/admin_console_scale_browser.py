#!/usr/bin/env python3
"""Browser regression test for admin console modal responsive scale on 2K, 1080P and laptop displays."""
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

        # 预先添加几个测试成员和分类/项目，让表格有真实内容
        admin.api('user_add', {'name': '张三协作者', 'email': 'zhangsan@test.com', 'password': PASS_WORD, 'role': 'editor'})
        admin.api('user_add', {'name': '李四审阅人', 'email': 'lisi@test.com', 'password': PASS_WORD, 'role': 'viewer'})
        cat_res = admin.api('category_save', {'name': '核心业务线'})
        cat_id = cat_res['data']['id'] if cat_res.get('data') else 1
        admin.api('item_save', {'name': '立象原型工作台设计', 'category_id': cat_id, 'type': 'project'})
        admin.api('item_save', {'name': 'Figma 设计资源外链', 'category_id': cat_id, 'type': 'link', 'link_url': 'https://figma.com/@test'})

        artifact_dir = ROOT / '.dev/screenshots/admin-console-scale'
        artifact_dir.mkdir(parents=True, exist_ok=True)

        fixture = {
            'base': base,
            'password': PASS_WORD,
            'artifacts': str(artifact_dir)
        }

        env = os.environ.copy()
        env['PLAYWRIGHT_MODULE'] = str(Path(args.playwright_module).resolve())
        env['CONSOLE_SCALE_FIXTURE'] = json.dumps(fixture)

        script_js = Path(__file__).resolve().with_suffix('.js')
        proc = subprocess.run(['node', str(script_js)], env=env, check=True)
        assert proc.returncode == 0, proc


if __name__ == '__main__':
    main()
