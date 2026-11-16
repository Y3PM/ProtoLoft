#!/usr/bin/env python3
"""Guest link annotation browser regression test:
Verify that an unauthenticated guest on a link project's share page
can open the annotation drawer, see enabled input controls, and successfully publish a note.
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

        # 1. 开启访客批注权限
        owner.api('save_role_permissions', {'perm_guest_annotate': '1'})

        # 2. 创建分类与外链项目
        cat = owner.api('category_save', {'name': '外链协作验收'})['data']['id']
        link_item = owner.api('item_save', {
            'category_id': cat,
            'type': 'link',
            'name': '双十一营销活动落地页',
            'link_url': 'https://example.com/campaign-page',
            'link_target': 'myFrame'
        })['data']['id']

        # 3. 开启分享并获取短码
        owner.api('item_save_share', {'id': link_item, 'share_enabled': '1'})
        share_code = owner.api('item_get_share', {'id': link_item})['data']['share_code']

        environment = dict(os.environ, PLAYWRIGHT_MODULE=args.playwright_module,
                           LINK_ANNO_FIXTURE=json.dumps({
                               'base': base,
                               'share_code': share_code,
                               'link_item': link_item
                           }))
        subprocess.run(['node', str(Path(__file__).with_name('test_guest_link_annotation_browser.js'))],
                       env=environment, check=True, timeout=120)


if __name__ == '__main__':
    main()
