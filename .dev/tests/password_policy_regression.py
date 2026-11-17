#!/usr/bin/env python3
"""Exercise account password writes across normal HTTP entry points."""

import argparse
from pathlib import Path
import sqlite3
import subprocess

from guest_permissions_regression import PASS_WORD, TestClient, sandbox_server


def check(label, condition):
    assert condition, label
    print('PASS', label, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', default='php')
    args = parser.parse_args()

    weak = '123456'
    capped = '字' * 21 + 'a'
    invalid = [('字' * 5, '6 个字符'), (capped + 'a', '64 字节'), ('abcdef\0', '有效的密码')]

    with sandbox_server(args.php) as (base, directory):
        owner = TestClient(base).login('admin@test.com', PASS_WORD)
        guest = TestClient(base)
        registration = {'email': 'apply@example.com', 'name': '待审成员', 'role': 'viewer'}
        member = {'email': 'added@example.com', 'name': '测试成员', 'role': 'editor'}

        for password, message in invalid:
            for action, actor, fields in (
                ('register_visitor', guest, registration),
                ('user_add', owner, member),
            ):
                response = actor.api(action, dict(fields, password=password))
                check(f'{action} rejects invalid input with {message}',
                      not response['success'] and message in response['message'])

        pending = guest.api('register_visitor', dict(registration, password=weak))
        check('visitor registration accepts a six-character low-score password', pending['success'])
        approved = owner.api('approve_user', {'id': pending['data']['id'], 'role': 'viewer'})
        check('approved viewer can log in with the unchanged low-score password',
              approved['success'] and TestClient(base).login(registration['email'], weak).user['role'] == 'viewer')

        added = owner.api('user_add', dict(member, password=capped))
        check('administrator creates a member with exactly 64 UTF-8 bytes', added['success'])
        editor = TestClient(base).login(member['email'], capped)

        unchanged = owner.api('user_update', {'id': added['data'], 'department': '设计', 'new_password': ''})
        check('editing with an empty password preserves the existing credential',
              unchanged['success'] and TestClient(base).login(member['email'], capped).user['role'] == 'editor')

        for password, message in invalid:
            updated = owner.api('user_update', {'id': added['data'], 'new_password': password})
            check(f'administrator password change rejects invalid input with {message}',
                  not updated['success'] and message in updated['message'])
            changed = editor.api('change_my_password', {'old_password': capped, 'new_password': password,
                                                         'confirm_password': password})
            check(f'self-service password change rejects invalid input with {message}',
                  not changed['success'] and message in changed['message'])

        update = owner.api('user_update', {'id': added['data'], 'new_password': '      '})
        check('administrator can set a six-space password as supplied', update['success'])
        editor = TestClient(base).login(member['email'], '      ')
        change = editor.api('change_my_password', {'old_password': '      ', 'new_password': weak,
                                                     'confirm_password': weak})
        check('self-service can save a low-score password and log back in',
              change['success'] and TestClient(base).login(member['email'], weak).user['role'] == 'editor')

        # The previous byte-based policy accepted this two-character password.
        legacy = '汉字'
        old_hash = subprocess.check_output([args.php, '-r', 'echo password_hash($argv[1], PASSWORD_DEFAULT);', legacy]).decode()
        with sqlite3.connect(Path(directory) / 'data/database.sqlite') as db:
            db.execute('UPDATE users SET password_hash = ? WHERE id = ?', (old_hash, added['data']))
        check('existing passwords still authenticate under the legacy length rules',
              TestClient(base).login(member['email'], legacy).user['role'] == 'editor')

        # Single-character surname and apostrophe email remain editable (e.g., department-only updates).
        special = owner.api('user_add', {'email': "o'connor@test.com", 'name': '王', 'role': 'viewer', 'password': weak})
        check('single-character name and apostrophe email can be created', special['success'])
        dept_only = owner.api('user_update', {'id': special['data'], 'name': '王', 'email': "o'connor@test.com",
                                              'role': 'viewer', 'status': 1, 'department': '产品部'})
        check('editing only department for single-char name and apostrophe email succeeds', dept_only['success'])
        bad_email = owner.api('user_update', {'id': special['data'], 'email': 'account@example.123'})
        check('editing a member rejects an invalid email instead of silently succeeding',
              not bad_email['success'] and '邮箱' in bad_email['message'])


if __name__ == '__main__':
    main()
