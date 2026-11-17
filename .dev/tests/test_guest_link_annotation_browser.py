#!/usr/bin/env python3
"""Guest link annotation browser regression test:
Verify that an unauthenticated guest on a link project's share page
can open the annotation drawer, see enabled input controls, and successfully publish a note.
"""
import argparse
import io
import json
import os
from pathlib import Path
import subprocess
import uuid
import zipfile

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

        # 4. 再准备一个多页原型，验证署名期间切换页面时的上下文防漂移拦截
        proto_item = owner.api('item_save', {
            'category_id': cat,
            'type': 'project',
            'name': '多页原型防串页验证'
        })['data']['id']
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w') as zf:
            zf.writestr('index.html', '<!DOCTYPE html><html><head><title>首页</title></head><body><h1>Page 1</h1></body></html>')
            zf.writestr('page2.html', '<!DOCTYPE html><html><head><title>第二页</title></head><body><h1>Page 2</h1></body></html>')
        uid = uuid.uuid4().hex
        owner.api('upload_chunk', {'upload_id': uid, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1},
                  files={'chunk_data': ('chunk_0', buf.getvalue())})
        owner.api('version_publish', {
            'item_id': proto_item,
            'version_name': 'v1.0',
            'zip_upload_id': uid,
            'is_default': 1,
            'changelog': 'test'
        })
        owner.api('item_save_share', {'id': proto_item, 'share_enabled': '1'})
        proto_share_code = owner.api('item_get_share', {'id': proto_item})['data']['share_code']

        environment = dict(os.environ, PLAYWRIGHT_MODULE=args.playwright_module,
                           LINK_ANNO_FIXTURE=json.dumps({
                               'base': base,
                               'share_code': share_code,
                               'link_item': link_item,
                               'proto_share_code': proto_share_code
                           }))
        subprocess.run(['node', str(Path(__file__).with_name('test_guest_link_annotation_browser.js'))],
                       env=environment, check=True, timeout=120)


if __name__ == '__main__':
    main()
