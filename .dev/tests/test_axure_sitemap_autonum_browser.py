#!/usr/bin/env python3
"""Verify zero-based roots and one-based children in Chrome using a synthetic
Axure DOM fixture, published through a disposable installation. No private
prototype package is required; this does not verify the full Axure runtime.
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

ROOT = Path(__file__).resolve().parents[2]


def make_axure_zip():
    buf = io.BytesIO()
    html = '''<!doctype html><html><head><title>Axure 页面树编号回归</title></head><body>
<div id="sitemapHost"><h3>页面</h3><div id="sitemapTreeContainer"><ul class="sitemapTree">
<li class="sitemapNode"><span class="sitemapPageName">版本说明</span><ul>
  <li class="sitemapNode"><span class="sitemapPageName">更新日志</span><ul>
    <li class="sitemapNode"><span class="sitemapPageName">修订历史</span></li>
  </ul></li>
</ul></li>
<li class="sitemapNode"><span class="sitemapPageName">1 一休运营</span><ul>
  <li class="sitemapNode"><span class="sitemapPageName">1.1 首页</span><ul>
    <li class="sitemapNode"><span class="sitemapPageName">1.1.1 项目概览</span></li>
  </ul></li>
  <li class="sitemapNode"><span class="sitemapPageName">1.3 统计</span></li>
  <li class="sitemapNode"><span class="sitemapPageName">1.4 我的</span><ul>
    <li class="sitemapNode"><span class="sitemapPageName">1.4.1 修改密码</span></li>
    <li class="sitemapNode"><span class="sitemapPageName">订阅消息</span></li>
  </ul></li>
</ul></li>
<li class="sitemapNode"><span class="sitemapPageName">封面</span></li>
</ul></div></div></body></html>'''
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('index.html', html)
    return buf.getvalue()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    parser.add_argument('--playwright-module', required=True)
    args = parser.parse_args()

    with sandbox_server(args.php) as (base, temporary):
        owner = TestClient(base).login('admin@test.com', PASS_WORD)

        # 创建分类和项目
        cat = owner.api('category_save', {'name': 'Axure原型验证分类'})['data']['id']
        item = owner.api('item_save', {
            'category_id': cat,
            'name': '一休运营原型项目',
            'type': 'project'
        })['data']['id']

        # 经真实上传/发布路径注入增强脚本，样本不依赖本地业务数据。
        zip_bytes = make_axure_zip()
        chunk_size = 1024 * 1024
        chunks = [zip_bytes[i:i + chunk_size] for i in range(0, len(zip_bytes), chunk_size)]
        chunk_total = len(chunks)
        upload_id = uuid.uuid4().hex

        for idx, chk in enumerate(chunks):
            upload_res = owner.api('upload_chunk', {
                'upload_id': upload_id,
                'file_type': 'zip',
                'chunk_index': idx,
                'chunk_total': chunk_total
            }, files={'chunk_data': (f'chunk_{idx}.bin', chk)})
            assert upload_res['success'], (idx, upload_res)

        pub_res = owner.api('version_publish', {
            'item_id': item,
            'version_name': 'V1.0.0',
            'zip_upload_id': upload_id,
            'is_default': 1,
            'changelog': '页面树编号合成样本',
            'notify_item': 0,
            'notify_global': 0
        })
        assert pub_res['success'], pub_res
        ver_id = pub_res['data']['id']
        share = owner.api('share_code_create', {'item_id': item, 'ver_id': ver_id,
                                               'label': '编号回归', 'expire_preset': 'forever'})
        assert share['success'], share
        artifact_dir = ROOT / '.dev/screenshots/axure-numbering'
        artifact_dir.mkdir(parents=True, exist_ok=True)

        environment = dict(
            os.environ,
            PLAYWRIGHT_MODULE=args.playwright_module,
            AUTONUM_FIXTURE=json.dumps({
                'base': base,
                'email': 'admin@test.com',
                'password': PASS_WORD,
                'itemId': item,
                'verId': ver_id,
                'shareCode': share['data']['code'],
                'artifactDir': str(artifact_dir)
            })
        )
        subprocess.run(['node', str(Path(__file__).with_name('test_axure_sitemap_autonum_browser.js'))],
                       env=environment, check=True, timeout=120)


if __name__ == '__main__':
    main()
