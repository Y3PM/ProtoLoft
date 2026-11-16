#!/usr/bin/env python3
"""Real browser regression for annotation navigation in a disposable installation."""
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

        def ok(action, fields, files=None):
            result = owner.api(action, fields, files=files)
            assert result['success'], (action, result)
            return result.get('data')

        for role in ['editor', 'viewer']:
            ok('user_add', {'email': role + '@test.com', 'name': role, 'password': PASS_WORD, 'role': role})
        category = ok('category_save', {'name': '批注跳转回归'})['id']
        item = int(ok('item_save', {'category_id': category, 'name': '批注原型', 'type': 'project'})['id'])
        other = int(ok('item_save', {'category_id': category, 'name': '另一个项目', 'type': 'project'})['id'])
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, 'w') as z:
            z.writestr('index.html', '''<!doctype html><html><head><title>Hash home</title></head><body>
<h1 id="route"></h1><label>未提交内容<input id="draft"></label><a id="next-page" href="page2.html">Page two</a>
<script>function render(){document.getElementById('route').textContent=location.hash||'home';}
addEventListener('hashchange',render);render();</script></body></html>''')
            for number in [1, 2]:
                name = 'Page ' + str(number)
                z.writestr('page%d.html' % number, '<!doctype html><html><head><title>' + name + '</title></head><body><h1>' + name + '</h1></body></html>')

        def publish(project, name):
            upload = uuid.uuid4().hex
            ok('upload_chunk', {'upload_id': upload, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1},
               {'chunk_data': ('part', archive.getvalue())})
            return int(ok('version_publish', {'item_id': project, 'version_name': name, 'zip_upload_id': upload,
                                             'is_default': 1, 'changelog': 'Synthetic annotation fixture',
                                             'notify_item': 0, 'notify_global': 0})['id'])

        old_version = publish(item, 'V0')
        version = publish(item, 'V1')
        other_version = publish(other, 'Other')
        annotations = [int(ok('add_annotation', {'item_id': item, 'ver_id': version, 'page_path': page,
                                                'page_title': title, 'content': '请在目标页面复核'})['id'])
                       for page, title in [('index.html#page_details', 'Hash Details'), ('page1.html', 'Page one'),
                                           ('page2.html', 'Page two · ' + '长页面名称用于检查按钮省略与窄屏布局' * 6)]]
        ok('save_role_permissions', {'perm_guest_annotate': 1})
        code = ok('share_code_create', {'item_id': item, 'ver_id': version, 'label': '临时回归链接', 'expire_preset': 'forever'})['code']
        fixture = {'base': base, 'password': PASS_WORD, 'item': item, 'other': other, 'version': version,
                   'old_version': old_version, 'other_version': other_version, 'annos': annotations, 'code': code}
        env = dict(os.environ, PLAYWRIGHT_MODULE=args.playwright_module, ANNOTATION_JUMP_FIXTURE=json.dumps(fixture))
        run = subprocess.run(['node', str(Path(__file__).with_suffix('.js'))], env=env, text=True,
                             stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=180)
        print(run.stdout, end='')
        run.check_returncode()
        summary = json.loads(run.stdout.strip().splitlines()[-1])
        assert summary['roles'] == ['admin', 'editor', 'viewer', 'guest'] and not summary['errors'], summary


if __name__ == '__main__':
    main()
