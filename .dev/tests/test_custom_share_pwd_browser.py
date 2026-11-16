#!/usr/bin/env python3
"""Custom share code password display and combo copy browser verification:
1. Open share modal for an item;
2. Create custom share link with password;
3. Verify password badge displays explicitly with '密码: <code';
4. Verify clicking password badge copies password only;
5. Verify clicking copy button copies combo format (link + password);
6. Create custom share link without password, verify '免密' badge and pure link copy.
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
        cat = owner.api('category_save', {'name': '分享功能验证分类'})
        cat_id = cat['data']['id']
        item = owner.api('item_save', {
            'category_id': cat_id,
            'name': '专属外发加密项目',
            'type': 'project'
        })
        item_id = item['data']['id']

        environment = dict(
            os.environ,
            PLAYWRIGHT_MODULE=args.playwright_module,
            SHARE_PWD_FIXTURE=json.dumps({
                'base': base,
                'email': 'admin@test.com',
                'password': PASS_WORD,
                'itemId': item_id
            })
        )
        subprocess.run(['node', str(Path(__file__).with_name('test_custom_share_pwd_browser.js'))],
                       env=environment, check=True, timeout=120)


if __name__ == '__main__':
    main()
