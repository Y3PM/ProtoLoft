#!/usr/bin/env python3
"""Staggered watermark browser regression on a disposable real installation."""
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
    parser.add_argument('--output', type=Path,
                        default=Path(__file__).resolve().parents[2] / '.dev/tmp/watermark-layout-b-20261110')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with sandbox_server(args.php) as (base, temporary):
        hook = Path(temporary) / 'includes/webhook.php'
        source = hook.read_text()
        needle = '    public static function send($url, $eventType, $data) {'
        assert source.count(needle) == 1
        hook.write_text(source.replace(needle, needle + "\n        return ['success' => true];\n", 1))
        owner = TestClient(base).login('admin@test.com', PASS_WORD)

        def ok(action, fields, files=None):
            result = owner.api(action, fields, files=files)
            assert result['success'], (action, result)
            return result.get('data')

        for role in ['editor', 'viewer']:
            ok('user_add', {'email': role + '@test.com', 'name': '陈工' if role == 'editor' else '审阅同事',
                            'password': PASS_WORD, 'role': role})
        category = ok('category_save', {'name': '水印验收'})['id']
        item = ok('item_save', {'name': '方案评审', 'category_id': category, 'type': 'project'})['id']
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as zipped:
            zipped.writestr('index.html', '''<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<title>方案评审</title><style>body{margin:0;padding:48px;font:15px sans-serif;color:#182230;background:white}
h1{font-size:26px;margin:0 0 12px}p{color:#667085}button{margin-top:28px;padding:10px 18px}</style>
<h1>项目概览</h1><p>版本 V1.0 · 方案评审</p>
<button id="testAction" onclick="this.textContent='已确认'">确认方案</button></html>''')
        upload = uuid.uuid4().hex
        ok('upload_chunk', {'upload_id': upload, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1},
           {'chunk_data': ('part', archive.getvalue())})
        ok('version_publish', {'item_id': item, 'version_name': 'V1.0', 'zip_upload_id': upload,
                               'is_default': 1, 'notify_item': 0, 'notify_global': 0})
        share = ok('item_get_share', {'id': item})['share_code']
        ok('save_settings', {'global_watermark_enabled': 1})
        fixture = {'base': base, 'password': PASS_WORD, 'item': item, 'share': share,
                   'output': str(args.output.resolve())}
        run = subprocess.run(['node', str(Path(__file__).with_suffix('.js'))],
                             env=dict(os.environ, PLAYWRIGHT_MODULE=args.playwright_module,
                                      WATERMARK_FIXTURE=json.dumps(fixture)), text=True,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=150)
        print(run.stdout, end='')
        (args.output / 'browser.log').write_text(run.stdout)
        run.check_returncode()


if __name__ == '__main__':
    main()
