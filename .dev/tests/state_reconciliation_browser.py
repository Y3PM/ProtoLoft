#!/usr/bin/env python3
"""Test recovered UI in an isolated install using installed Chrome, never the workspace DB."""
import argparse
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import uuid

from guest_permissions_regression import sandbox_server, TestClient, PASS_WORD, make_proto_zip


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    parser.add_argument('--playwright-module', required=True, help='Existing Playwright module; no dependency installation')
    args = parser.parse_args()
    with sandbox_server(args.php) as (base, temporary):
        admin = TestClient(base).login('admin@test.com', PASS_WORD)

        def ok(action, fields):
            result = admin.api(action, fields)
            assert result['success'], (action, result)
            return result.get('data')

        category = ok('category_save', {'name': '恢复验证'})['id']
        projects = [int(ok('item_save', {'name': name, 'category_id': category, 'type': 'project'})['id'])
                    for name in ['审阅原型', '发布原型']]
        for role in ['editor', 'viewer']:
            ok('user_add', {'name': role, 'email': role + '@test.com', 'password': PASS_WORD, 'role': role})
        upload_id = uuid.uuid4().hex
        uploaded = admin.api('upload_chunk', {'upload_id': upload_id, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1},
                             files={'chunk_data': ('part', make_proto_zip())})
        assert uploaded['success'], uploaded
        review_version = int(ok('version_publish', {'item_id': projects[0], 'version_name': '评审稿', 'zip_upload_id': upload_id})['id'])
        root = Path(temporary)
        folder = root / 'fixture-folder' / 'nested'
        folder.mkdir(parents=True)
        (folder / 'index.html').write_text('<!doctype html><html><head><title>文件夹验收</title></head><body>Folder recovered</body></html>')
        (folder / 'style.css').write_text('body { color: black; }')
        (folder / '.DS_Store').write_bytes(b'ignored')
        db = sqlite3.connect(root / 'data/database.sqlite')
        for status in [0, 1]:
            db.execute('INSERT INTO annotations(item_id,ver_id,page_path,page_title,author_name,content,status) VALUES(?,?,?,?,?,?,?)',
                       (projects[0], review_version, 'index.html', '评审页', '合成成员', '合成批注', status))
        for role in ['viewer', 'editor', 'admin', 'share']:
            db.execute("INSERT INTO access_logs(item_id,ip,role,created_at) VALUES(?,?,?,datetime('now'))", (projects[0], '127.0.0.1', role))
        db.commit()
        db.close()
        environment = dict(os.environ, PLAYWRIGHT_MODULE=args.playwright_module,
                           PROTOLOFT_REVIEW_DATA=json.dumps({'base': base, 'projects': projects, 'reviewVersion': review_version, 'folder': str(folder.parent), 'password': PASS_WORD}))
        subprocess.run(['node', str(Path(__file__).with_suffix('.js'))], env=environment, check=True, timeout=120)
        with sqlite3.connect(root / 'data/database.sqlite') as connection:
            row = connection.execute('SELECT COUNT(*),MAX(version_name) FROM versions WHERE item_id=?', (projects[1],)).fetchone()
            assert row == (1, '恢复版'), row
            print('PASS database confirms same-name overwrite retains one version', flush=True)


if __name__ == '__main__':
    main()
