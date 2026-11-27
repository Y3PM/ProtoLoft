#!/usr/bin/env python3
"""Browser verification for friendly time displays and exact-time hover tooltips."""
import argparse
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess

from guest_permissions_regression import sandbox_server, TestClient, PASS_WORD
from security_regression import zipped


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    parser.add_argument('--playwright-module', required=True)
    parser.add_argument('--shot-dir', required=True)
    args = parser.parse_args()

    shot_dir = Path(args.shot_dir).resolve()
    shot_dir.mkdir(parents=True, exist_ok=True)

    with sandbox_server(args.php) as (base, temp):
        admin = TestClient(base).login('admin@test.com', PASS_WORD)
        cat_res = admin.api('category_save', {'name': '核心产品线'})
        cat_data = cat_res['data']
        cat_id = int(cat_data['id'] if isinstance(cat_data, dict) else cat_data)

        item_res = admin.api('item_save', {'category_id': cat_id, 'name': '统一工作台', 'type': 'project'})
        item_id = int(item_res['data']['id'] if isinstance(item_res['data'], dict) else item_res['data'])

        # Upload a minimal prototype zip
        data = zipped('<h1>ProtoLoft Time Test</h1>')
        up_id = 'up_time_test_1'
        up_res = admin.api('upload_chunk', {
            'upload_id': up_id, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1
        }, files={'chunk_data': ('proto.zip', data)})
        assert up_res['success'], up_res

        pub_res = admin.api('version_publish', {
            'item_id': item_id,
            'version_name': 'V2.1',
            'zip_upload_id': up_id,
            'changelog': '调整交互细节',
            'notify_item': '0',
            'notify_global': '0',
        })
        assert pub_res['success'], pub_res
        ver_id = int(pub_res['data']['id'])

        # Add an annotation for drawer tooltip verification
        anno_res = admin.api('add_annotation', {
            'item_id': item_id,
            'ver_id': ver_id,
            'page_path': 'index.html',
            'page_title': '首页',
            'content': '请核对更新时间展示',
        })
        assert anno_res['success'], anno_res

        # Create a pending user and a share link
        guest = TestClient(base)
        _, html, _ = guest.request('/index.php')
        m = re.search(r'<meta name="csrf-token" content="([^"]+)"', html.decode('utf-8', 'replace'))
        assert m, 'missing csrf-token on login page'
        guest.token = m.group(1)
        reg = guest.api('register_visitor', {
            'name': '待审新成员',
            'email': 'pending_time@test.com',
            'password': PASS_WORD,
            'role': 'viewer',
            'department': '产品部'
        })
        assert reg['success'], reg

        share_res = admin.api('share_code_create', {
            'item_id': item_id,
            'ver_id': ver_id,
            'label': '体验链接',
            'expire_preset': 'forever',
        })
        assert share_res['success'], share_res
        share_code = share_res['data']['code']

        # Read expected exact timestamps directly from sqlite
        db = sqlite3.connect(str(Path(temp) / 'data/database.sqlite'))
        ver_updated = db.execute('SELECT updated_at FROM versions WHERE id = ?', (ver_id,)).fetchone()[0]
        db.close()

        fixture = {
            'base': base,
            'password': PASS_WORD,
            'itemId': item_id,
            'shareCode': share_code,
            'verUpdatedUtc': ver_updated,
            'shotDir': str(shot_dir),
        }
        env = os.environ.copy()
        env['PLAYWRIGHT_MODULE'] = str(Path(args.playwright_module).resolve())
        env['FRIENDLY_TIME_FIXTURE'] = json.dumps(fixture)
        js_path = Path(__file__).resolve().with_suffix('.js')
        subprocess.run(['node', str(js_path)], env=env, check=True)


if __name__ == '__main__':
    main()
