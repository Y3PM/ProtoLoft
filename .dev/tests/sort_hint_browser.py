#!/usr/bin/env python3
"""Browser verification for folder sort hint icon and popover in Admin Console."""
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
    parser.add_argument('--shot-dir', required=True)
    args = parser.parse_args()

    shot_dir = Path(args.shot_dir).resolve()
    shot_dir.mkdir(parents=True, exist_ok=True)

    with sandbox_server(args.php) as (base, _tmp):
        admin = TestClient(base).login('admin@test.com', PASS_WORD)
        cat_res = admin.api('category_save', {'name': '核心业务线'})
        assert cat_res['success'], cat_res
        cat_data = cat_res['data']
        cat_id = int(cat_data['id'] if isinstance(cat_data, dict) else cat_data)
        p1 = admin.api('item_save', {'category_id': cat_id, 'name': '订单工作台', 'type': 'project'})
        p2 = admin.api('item_save', {'category_id': cat_id, 'name': '结算收银台', 'type': 'project'})
        l1 = admin.api('item_save', {'category_id': cat_id, 'name': 'Figma 规范库', 'type': 'link', 'link_url': 'https://example.com/design'})
        assert p1['success'] and p2['success'] and l1['success'], (p1, p2, l1)

        fixture = {
            'base': base,
            'password': PASS_WORD,
            'catId': cat_id,
            'shotDir': str(shot_dir),
        }
        env = os.environ.copy()
        env['PLAYWRIGHT_MODULE'] = str(Path(args.playwright_module).resolve())
        env['SORT_HINT_FIXTURE'] = json.dumps(fixture)
        js_path = Path(__file__).resolve().with_suffix('.js')
        subprocess.run(['node', str(js_path)], env=env, check=True)


if __name__ == '__main__':
    main()
