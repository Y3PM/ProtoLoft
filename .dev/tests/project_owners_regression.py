#!/usr/bin/env python3
"""Real HTTP owner scope, version ownership and handover checks in a disposable install."""
import argparse
import json
from pathlib import Path
import sqlite3
import uuid

from guest_permissions_regression import sandbox_server, TestClient, PASS_WORD, make_proto_zip


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    args = parser.parse_args()
    passed = 0

    def check(label, value):
        nonlocal passed
        assert value, label
        passed += 1
        print('PASS', label, flush=True)

    def ok(client, action, fields, files=None):
        result = client.api(action, fields, files)
        assert result.get('success'), (action, result)
        return result.get('data')

    def upload(client, kind, body):
        ident = uuid.uuid4().hex
        ok(client, 'upload_chunk', {'upload_id': ident, 'file_type': kind, 'chunk_index': 0, 'chunk_total': 1},
           {'chunk_data': ('part', body)})
        return ident

    def publish(client, item, name, rp=False):
        fields = {'item_id': item, 'version_name': name, 'zip_upload_id': upload(client, 'zip', make_proto_zip()),
                  'notify_item': 0, 'notify_global': 0}
        if rp:
            fields['rp_upload_id'] = upload(client, 'rp', b'original RP')
        pre = ok(client, 'version_check_name', {'item_id': item, 'version_name': name})
        fields['overwrite_token'] = pre['overwrite_token']
        return ok(client, 'version_publish', fields)['id']

    with sandbox_server(args.php) as (base, directory):
        admin = TestClient(base).login('admin@test.com', PASS_WORD)
        users = {}
        ids = {}
        for who, role in [('a', 'editor'), ('b', 'editor'), ('c', 'editor'), ('viewer', 'viewer')]:
            ids[who] = int(ok(admin, 'user_add', {'email': who + '@test.com', 'name': who,
                                                'role': role, 'password': PASS_WORD}))
            users[who] = TestClient(base).login(who + '@test.com', PASS_WORD)
        a, b, c, viewer = (users[x] for x in ['a', 'b', 'c', 'viewer'])
        guest = TestClient(base)
        folder = ok(admin, 'category_save', {'name': 'Owners'})['id']

        def project(client, name, owners=None):
            fields = {'category_id': folder, 'name': name, 'type': 'project'}
            if owners is not None:
                fields['collaborators'] = owners
            return int(ok(client, 'item_save', fields)['id'])

        def save(client, item, **fields):
            return client.api('item_save', dict(id=item, category_id=folder, name='Owners', type='project', **fields))

        db = sqlite3.connect(Path(directory) / 'data/database.sqlite')
        db.row_factory = sqlite3.Row
        def row(item):
            return dict(db.execute('SELECT * FROM items WHERE id=?', (item,)).fetchone())

        open_id = project(a, 'Open')
        check('new project defaults to all collaborators', row(open_id)['collaborators'] == '')
        version = publish(b, open_id, 'B version', rp=True)
        check('another collaborator can publish to open project', version > 0)
        check('another collaborator can manage open project sharing', b.api('item_save_share', {'id': open_id, 'access_password': '123'})['success'])
        check('another collaborator cannot delete open project', not b.api('item_delete', {'id': open_id})['success'])
        check('another collaborator cannot narrow open project scope', not save(b, open_id, collaborators=str(ids['b']))['success'])
        check('another collaborator cannot overwrite version', not a.api('version_check_name', {'item_id': open_id, 'version_name': 'B version'})['success'])
        check('another collaborator cannot delete version', not a.api('version_delete', {'id': version})['success'])
        check('another collaborator cannot remove version RP', not a.api('version_remove_rp', {'id': version})['success'])
        rp_id = upload(a, 'rp', b'unauthorized RP')
        check('another collaborator cannot replace version RP', not a.api('version_update_rp', {'id': version, 'rp_upload_id': rp_id})['success'])
        check('rejected RP mutation preserves source', b.request('/api.php?action=download_rp&ver_id=' + str(version))[1] == b'original RP')
        check('publisher can replace own version', publish(b, open_id, 'B version', rp=True) == version)
        rp_id = upload(b, 'rp', b'updated RP')
        check('publisher can replace own RP', b.api('version_update_rp', {'id': version, 'rp_upload_id': rp_id})['success'])
        check('publisher can remove own RP', b.api('version_remove_rp', {'id': version})['success'])
        check('publisher can delete own version', b.api('version_delete', {'id': version})['success'])

        limited = project(a, 'Limited', str(ids['b']))
        check('creator outside selected scope cannot publish', not a.api('version_check_name', {'item_id': limited, 'version_name': 'V1'})['success'])
        check('selected owner can publish', publish(b, limited, 'V1') > 0)
        check('creator can retain control of scope', save(a, limited, collaborators=str(ids['b']))['success'])
        check('selected owner can edit basic config', save(b, limited)['success'])
        check('basic config save preserves scope', row(limited)['collaborators'] == str(ids['b']))
        check('selected owner cannot change scope', not save(b, limited, collaborators='')['success'])
        check('selected owner cannot delete entire project', not b.api('item_delete', {'id': limited})['success'])
        check('creator can reopen project', save(a, limited, collaborators='')['success'])
        check('reopened project permits creator publishing', a.api('version_check_name', {'item_id': limited, 'version_name': 'V2'})['success'])
        for raw in ['bad', '0', '-1', str(ids['b']) + ',bad', str(ids['viewer']), '999999']:
            check('invalid owner scope rejected: ' + raw, not save(a, limited, collaborators=raw)['success'])
        check('invalid owner scope leaves project unchanged', row(limited)['collaborators'] == '')
        for who, client in [('viewer', viewer), ('guest', guest)]:
            check(who + ' cannot publish open project', not client.api('version_check_name', {'item_id': open_id, 'version_name': 'V2'})['success'])
            check(who + ' cannot alter project scope', not save(client, open_id, collaborators='')['success'])

        link = int(ok(a, 'item_save', {'category_id': folder, 'name': 'Link', 'type': 'link', 'link_url': 'https://example.com'})['id'])
        check('external link share settings remain creator-controlled', not b.api('item_save_share', {'id': link, 'access_password': '123'})['success'])

        assigned = project(admin, 'Assigned only', str(ids['c']))
        overlapping = project(c, 'Created and assigned', str(ids['c']) + ',' + str(ids['b']))
        open_c = project(c, 'Created open')
        snapshot_version = publish(c, assigned, 'Historical author')
        member = next(u for u in admin.api('user_list')['data'] if int(u['id']) == ids['c'])
        check('responsibility count includes assigned-only projects and deduplicates', member['item_count'] == 3)
        check('assigned owner cannot be deleted before handover', not admin.api('user_delete', {'id': ids['c']})['success'])
        handover = ok(admin, 'user_handover', {'from_user_id': ids['c'], 'to_user_id': ids['b'], 'deactivate_from': 1})
        check('handover covers all responsible projects once', handover == 3)
        check('handover replaces assigned-only owner without changing creator', row(assigned)['collaborators'] == str(ids['b']) and row(assigned)['created_by'] == admin.user['id'])
        check('handover deduplicates target already in scope', row(overlapping)['collaborators'] == str(ids['b']) and row(overlapping)['created_by'] == ids['b'])
        check('handover preserves all-collaborator mode', row(open_c)['collaborators'] == '' and row(open_c)['created_by'] == ids['b'])
        author = db.execute('SELECT author_name, created_by FROM versions WHERE id=?', (snapshot_version,)).fetchone()
        check('handover preserves historical publisher snapshot', author['author_name'] == 'c' and author['created_by'] == ids['c'])
        check('new owner can publish assigned-only project', b.api('version_check_name', {'item_id': assigned, 'version_name': 'V2'})['success'])
        check('departed account can be deleted after complete handover', admin.api('user_delete', {'id': ids['c']})['success'])
        check('creator can delete restricted project', a.api('item_delete', {'id': limited})['success'])
        db.close()
    print(json.dumps({'passed': passed, 'scope': 'disposable HTTP installation, all roles, no production access'}))


if __name__ == '__main__':
    main()
