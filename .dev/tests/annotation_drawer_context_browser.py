#!/usr/bin/env python3
"""Drawer context, stale history responses and archive styling in real Chrome.

All HTTP writes use a disposable installation. Robot transport is intercepted.
"""
import argparse
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import uuid

from guest_permissions_regression import sandbox_server, TestClient, PASS_WORD, make_proto_zip

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    parser.add_argument('--playwright-module', required=True)
    parser.add_argument('--observe', action='store_true')
    parser.add_argument('--output', type=Path, default=ROOT / '.dev/tmp/annotation-drawer-context-20261110')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    with sandbox_server(args.php) as (base, temporary):
        root = Path(temporary)
        hook = root / 'includes/webhook.php'
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
            ok('user_add', {'email': role + '@test.com', 'name': role, 'password': PASS_WORD, 'role': role})
        folder = ok('category_save', {'name': '抽屉上下文测试'})['id']
        projects = {name: int(ok('item_save', {'name': name, 'category_id': folder, 'type': 'project'})['id'])
                    for name in ['项目 A', '项目 B', '空项目']}
        link = int(ok('item_save', {'name': '外链项目', 'category_id': folder, 'type': 'link',
                                    'link_target': '_blank', 'link_url': 'https://example.invalid/review'})['id'])
        archive = make_proto_zip()

        def publish(item, name):
            upload = uuid.uuid4().hex
            ok('upload_chunk', {'upload_id': upload, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1},
               {'chunk_data': ('part', archive)})
            return int(ok('version_publish', {'item_id': item, 'version_name': name, 'zip_upload_id': upload,
                                              'is_default': 1, 'notify_item': 0, 'notify_global': 0})['id'])

        a, b, empty = [projects[name] for name in ['项目 A', '项目 B', '空项目']]
        versions = {'a': [publish(a, 'A' + str(i)) for i in [1, 2, 3]],
                    'b': [publish(b, 'B' + str(i)) for i in [1, 2]]}

        def annotate(item, version, content):
            return int(ok('add_annotation', {'item_id': item, 'ver_id': version, 'page_path': 'index.html',
                                             'page_title': '首页 · ' + content, 'content': content})['id'])

        ids = {}
        for key, item, names in [('a', a, ['A1', 'A2', 'A3']), ('b', b, ['B1', 'B2'])]:
            for index, name in enumerate(names):
                ids[name] = annotate(item, versions[key][index], name + ' 独立批注')
        ids['link'] = int(ok('add_annotation', {'item_id': link, 'ver_id': 0, 'page_path': 'link',
                                               'page_title': '外链', 'content': '外链 独立批注'})['id'])
        # A2 supplies all three age bands when viewing A3's previous version.
        ages = [ids['A2'], annotate(a, versions['a'][1], 'A2 放置十二天'),
                annotate(a, versions['a'][1], 'A2 放置四十五天')]
        with sqlite3.connect(root / 'data/database.sqlite') as db:
            now = datetime.now(timezone.utc)
            for anno_id, days in zip(ages, [2, 12, 45]):
                db.execute('UPDATE annotations SET created_at = ? WHERE id = ?',
                           ((now - timedelta(days=days)).strftime('%Y-%m-%d %H:%M:%S'), anno_id))
        ok('save_role_permissions', {'perm_guest_annotate': 1})
        share = ok('item_get_share', {'id': a})['share_code']
        fixture = {'base': base, 'password': PASS_WORD, 'a': a, 'b': b, 'empty': empty, 'link': link,
                   'versions': versions, 'ids': ids, 'ages': ages, 'share': share,
                   'observe': args.observe, 'output': str(args.output.resolve())}
        run = subprocess.run(['node', str(Path(__file__).with_suffix('.js'))],
                             env=dict(os.environ, PLAYWRIGHT_MODULE=args.playwright_module,
                                      DRAWER_CONTEXT_FIXTURE=json.dumps(fixture)),
                             text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=240)
        print(run.stdout, end='', flush=True)
        (args.output / 'browser.log').write_text(run.stdout)
        run.check_returncode()


if __name__ == '__main__':
    main()
