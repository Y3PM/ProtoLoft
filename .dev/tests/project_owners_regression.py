#!/usr/bin/env python3
"""Real HTTP owner scope, version ownership and handover checks in a disposable install."""
import argparse
import json
from html.parser import HTMLParser
from pathlib import Path
import sqlite3
import uuid

from guest_permissions_regression import sandbox_server, TestClient, PASS_WORD, make_proto_zip


class PublishOptions(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_upload = False
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'select':
            self.in_upload = attrs.get('id') == 'uploadItemSelect'
        elif tag == 'option' and self.in_upload and attrs.get('value', '').isdigit():
            self.ids.add(int(attrs['value']))

    def handle_endtag(self, tag):
        if tag == 'select':
            self.in_upload = False


def publishable_ids(client):
    parser = PublishOptions()
    parser.feed(client.request('/index.php')[1].decode())
    return parser.ids


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

        def member_rows():
            return {int(user['id']): user for user in admin.api('user_list')['data']}

        check('empty installation reports no publishable projects', all(user['publishable_project_count'] == 0 for user in member_rows().values()))
        check('anonymous cannot read team statistics', not guest.api('user_list')['success'])
        check('viewer cannot read management team statistics', not viewer.api('user_list')['success'])

        open_id = project(a, 'Open')
        check('new project defaults to all collaborators', row(open_id)['collaborators'] == '')
        counts = member_rows()
        check('open project counts for every active collaborator', all(counts[ids[who]]['publishable_project_count'] == 1 for who in ['a', 'b', 'c']))
        check('viewer reports zero despite open projects', counts[ids['viewer']]['publishable_project_count'] == 0)
        check('editor read-only directory includes same publishable counts', {int(u['id']): u['publishable_project_count'] for u in b.api('user_list')['data']} == {uid: u['publishable_project_count'] for uid, u in counts.items()})
        empty_selection = save(a, open_id, collaboration_scope='selected', collaborators='')
        check('explicit selected scope requires a member', not empty_selection['success'] and '至少选择一位' in empty_selection['message'])
        check('invalid selection preserves existing open scope', row(open_id)['collaborators'] == '')
        check('invalid collaboration mode rejected', not save(a, open_id, collaboration_scope='invalid')['success'])
        new_empty = a.api('item_save', {'category_id': folder, 'name': 'Empty selection', 'type': 'project', 'collaboration_scope': 'selected'})
        check('new project cannot silently open an empty selected scope', not new_empty['success'])
        check('explicit selected scope saves the chosen members', save(a, open_id, collaboration_scope='selected', collaborators=str(ids['a']))['success'] and row(open_id)['collaborators'] == str(ids['a']))
        check('another editor cannot clear explicit selected scope', not save(b, open_id, collaboration_scope='all')['success'])
        check('explicit all scope clears stale selected members', save(a, open_id, collaboration_scope='all', collaborators=str(ids['a']))['success'] and row(open_id)['collaborators'] == '')
        ok(admin, 'save_role_permissions', {'perm_editor_share': '0'})
        admin_home = admin.request('/index.php')[1].decode()
        editor_home = b.request('/index.php')[1].decode()
        check('disabled editor sharing removes sharing from admin-facing copy', '<option value="all">所有协作者可管理版本</option>' in admin_home and '所有协作者可管理版本和分享' not in admin_home)
        check('disabled editor sharing removes sharing from editor-facing copy', '<option value="selected">仅指定成员可管理版本</option>' in editor_home and '仅指定成员可管理版本和分享' not in editor_home)
        check('disabled sharing also updates project tooltip', 'title="版本：所有协作者"' in admin_home)
        check('disabled editor sharing is still enforced by API', not b.api('item_save_share', {'id': open_id})['success'])
        check('administrator retains sharing privilege', admin.api('item_save_share', {'id': open_id})['success'])
        ok(admin, 'save_role_permissions', {'perm_editor_share': '1'})
        enabled_home = b.request('/index.php')[1].decode()
        check('enabled editor sharing restores sharing copy and operation', '所有协作者可管理版本和分享' in enabled_home and b.api('item_save_share', {'id': open_id})['success'])
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
        counts = member_rows()
        check('restricted creator outside scope is not counted as publishable', counts[ids['a']]['publishable_project_count'] == 1)
        check('restricted project counts only for its selected collaborator', counts[ids['b']]['publishable_project_count'] == 2 and counts[ids['c']]['publishable_project_count'] == 1)
        check('administrator counts all actual projects', counts[int(admin.user['id'])]['publishable_project_count'] == 2)
        check('creator still has handover records outside publishing scope', counts[ids['a']]['item_count'] == 2)
        check('empty selected edit preserves a restricted project', not save(a, limited, collaboration_scope='selected', collaborators='')['success'] and row(limited)['collaborators'] == str(ids['b']))
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
        counts = member_rows()
        check('external link does not inflate any publishable count', all(counts[uid]['publishable_project_count'] == 2 for uid in [int(admin.user['id']), ids['a'], ids['b'], ids['c']]))
        check('external link remains in independent handover count', counts[ids['a']]['item_count'] == 3)

        assigned = project(admin, 'Assigned only', str(ids['c']))
        overlapping = project(c, 'Created and assigned', str(ids['c']) + ',' + str(ids['b']))
        open_c = project(c, 'Created open')
        snapshot_version = publish(c, assigned, 'Historical author')
        member = next(u for u in admin.api('user_list')['data'] if int(u['id']) == ids['c'])
        check('responsibility count includes assigned-only projects and deduplicates', member['item_count'] == 3)
        counts = member_rows()
        check('publishing scope differs from handover count', counts[ids['c']]['publishable_project_count'] == 5 and counts[ids['c']]['item_count'] == 3)
        for label, client in [('admin', admin), ('a', a), ('b', b), ('c', c)]:
            check(label + ' team count equals real publishing dropdown', counts[int(client.user['id'])]['publishable_project_count'] == len(publishable_ids(client)))
        check('assigned owner cannot be deleted before handover', not admin.api('user_delete', {'id': ids['c']})['success'])
        handover = ok(admin, 'user_handover', {'from_user_id': ids['c'], 'to_user_id': ids['b'], 'deactivate_from': 1})
        check('handover covers all responsible projects once', handover == 3)
        check('handover replaces assigned-only owner without changing creator', row(assigned)['collaborators'] == str(ids['b']) and row(assigned)['created_by'] == admin.user['id'])
        check('handover deduplicates target already in scope', row(overlapping)['collaborators'] == str(ids['b']) and row(overlapping)['created_by'] == ids['b'])
        check('handover preserves all-collaborator mode', row(open_c)['collaborators'] == '' and row(open_c)['created_by'] == ids['b'])
        author = db.execute('SELECT author_name, created_by FROM versions WHERE id=?', (snapshot_version,)).fetchone()
        check('handover preserves historical publisher snapshot', author['author_name'] == 'c' and author['created_by'] == ids['c'])
        check('new owner can publish assigned-only project', b.api('version_check_name', {'item_id': assigned, 'version_name': 'V2'})['success'])
        check('deactivated collaborator reports no publishable projects', member_rows()[ids['c']]['publishable_project_count'] == 0)
        check('departed account can be deleted after complete handover', admin.api('user_delete', {'id': ids['c']})['success'])
        # Publishing access must never become the criterion for retaining or transferring accounts.
        free_id = int(ok(admin, 'user_add', {'email': 'free@test.com', 'name': 'free', 'role': 'editor', 'password': PASS_WORD}))
        free_row = member_rows()[free_id]
        check('open-scope collaborator can have publishing access with no handover records', free_row['publishable_project_count'] > 0 and free_row['item_count'] == 0)
        check('publishing access alone does not block member deletion', admin.api('user_delete', {'id': free_id})['success'])
        paused_id = int(ok(admin, 'user_add', {'email': 'paused@test.com', 'name': 'paused', 'role': 'editor', 'password': PASS_WORD}))
        paused_project = project(admin, 'Paused assignment', str(paused_id))
        ok(admin, 'user_update', {'id': paused_id, 'status': 3})
        paused = member_rows()[paused_id]
        check('disabled assignee retains handover records with zero publishing access', paused['publishable_project_count'] == 0 and paused['item_count'] == 1)
        check('zero publishing count does not bypass member deletion guard', not admin.api('user_delete', {'id': paused_id})['success'])
        check('zero publishing count still permits required handover', ok(admin, 'user_handover', {'from_user_id': paused_id, 'to_user_id': ids['b']}) == 1)
        check('handover of disabled assignee replaces selected scope', row(paused_project)['collaborators'] == str(ids['b']))
        check('disabled assignee can be deleted after handover', admin.api('user_delete', {'id': paused_id})['success'])
        ok(admin, 'user_update', {'id': ids['b'], 'role': 'viewer'})
        check('downgraded viewer has no publishable projects but retains handover guard', member_rows()[ids['b']]['publishable_project_count'] == 0 and member_rows()[ids['b']]['item_count'] > 0 and not admin.api('user_delete', {'id': ids['b']})['success'])
        ok(admin, 'user_update', {'id': ids['b'], 'role': 'editor'})
        check('restored collaborator count matches publishing dropdown', member_rows()[ids['b']]['publishable_project_count'] == len(publishable_ids(b)))
        extra_admin = int(ok(admin, 'user_add', {'email': 'second-admin@test.com', 'name': 'second admin', 'role': 'admin', 'password': PASS_WORD}))
        check('active administrator counts every project and no external links', member_rows()[extra_admin]['publishable_project_count'] == db.execute("SELECT COUNT(*) FROM items WHERE type='project'").fetchone()[0])
        ok(admin, 'user_update', {'id': extra_admin, 'status': 3})
        check('disabled administrator reports no publishable projects', member_rows()[extra_admin]['publishable_project_count'] == 0)
        check('creator can delete restricted project', a.api('item_delete', {'id': limited})['success'])
        db.close()
    print(json.dumps({'passed': passed, 'scope': 'disposable HTTP installation, all roles, no production access'}))


if __name__ == '__main__':
    main()
