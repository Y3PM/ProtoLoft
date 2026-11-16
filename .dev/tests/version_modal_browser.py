#!/usr/bin/env python3
"""Real version-modal regression in an isolated installation; no workspace data writes."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import shutil
import uuid

from guest_permissions_regression import sandbox_server, TestClient, PASS_WORD, make_proto_zip


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    parser.add_argument('--playwright-module', required=True)
    parser.add_argument('--baseline-source', type=Path, help='Optional source snapshot for reproducing the previous UI')
    args = parser.parse_args()
    with sandbox_server(args.php) as (base, temporary):
        if args.baseline_source:
            baseline = args.baseline_source
            for name in ['assets/js/admin.js', 'assets/css/app.css', 'includes/modals.php']:
                shutil.copy2(baseline / name, Path(temporary) / name)
        owner = TestClient(base).login('admin@test.com', PASS_WORD)

        def ok(action, fields, files=None):
            result = owner.api(action, fields, files=files)
            assert result['success'], (action, result)
            return result.get('data')

        category = ok('category_save', {'name': '弹窗恢复验收'})['id']
        item = int(ok('item_save', {'name': '协同平台原型', 'category_id': category, 'type': 'project'})['id'])
        empty = int(ok('item_save', {'name': '未发布项目', 'category_id': category, 'type': 'project'})['id'])
        ok('user_add', {'name': '只读协作者', 'email': 'reader@test.com', 'password': PASS_WORD, 'role': 'editor'})
        versions = []
        for i in range(1, 13):
            ident = uuid.uuid4().hex
            ok('upload_chunk', {'upload_id': ident, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1},
               {'chunk_data': ('part', make_proto_zip())})
            fields = {'item_id': item, 'version_name': 'V2.' + str(i) + (' · 交互评审与研发交付确认稿' if i == 12 else ''),
                      'zip_upload_id': ident, 'is_default': 1,
                      'changelog': '同步导航和权限反馈。\n' + ('补充多角色协作说明、边界校验与版本署名，确保长更新说明可以自然换行。' * 5 if i == 12 else '修订原型交互。')}
            if i == 12:
                rp_id = uuid.uuid4().hex
                ok('upload_chunk', {'upload_id': rp_id, 'file_type': 'rp', 'chunk_index': 0, 'chunk_total': 1},
                   {'chunk_data': ('part', b'isolated RP fixture')})
                fields['rp_upload_id'] = rp_id
            versions.append(int(ok('version_publish', fields)['id']))
        environment = dict(os.environ, PLAYWRIGHT_MODULE=args.playwright_module,
                           VERSION_MODAL_FIXTURE=json.dumps({'base': base, 'item': item, 'empty': empty, 'versions': versions,
                                                             'password': PASS_WORD, 'baseline': bool(args.baseline_source)}))
        subprocess.run(['node', str(Path(__file__).with_suffix('.js'))], env=environment, check=True, timeout=120)


if __name__ == '__main__':
    main()
