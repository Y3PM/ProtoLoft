#!/usr/bin/env python3
"""Actual dashboard HTML/data in a disposable PHP installation; no production data."""
import argparse
import json
import re
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import time
from pathlib import Path
from security_regression import ROOT, Client, PASS, zipped, uuid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    parser.add_argument('--keep', action='store_true')
    args = parser.parse_args()
    fixture = Path(tempfile.mkdtemp(prefix='protoloft-dashboard-test-', dir='/tmp'))
    for path in ROOT.glob('*.php'): shutil.copy2(path, fixture / path.name)
    for name in ('includes', 'assets'): shutil.copytree(ROOT / name, fixture / name)
    (fixture / 'data').mkdir()
    (fixture / 'router.php').write_text("<?php if(preg_match('#^/(data|includes|\\.dev|\\.git)(/|$)#',rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)))){http_response_code(403);exit;} return false;")
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    log = open(fixture / 'server.log', 'w')
    server = subprocess.Popen([args.php, '-S', '127.0.0.1:' + str(port), '-t', str(fixture), str(fixture / 'router.php')], stdout=log, stderr=log)
    checks = []
    db = None

    def check(name, condition):
        assert condition, name
        checks.append(name); print('PASS', name, flush=True)

    def ok(action, fields, files=None):
        result = owner.api(action, fields, files)
        assert result['success'], (action, result)
        return result['data']

    def dashboard():
        status, body, _ = owner.request('/index.php')
        assert status == 200
        html = body.decode()
        bars = {name: int(width) for name, width in re.findall(r'class="cat-stat-name" title="([^"]+)".*?class="cat-stat-bar-fill" style="width:(\d+)%;"', html, re.S)}
        cats = json.loads(re.search(r'window.DASHBOARD_DATA\s*=\s*\{\s*cats:\s*(\[[^\n]*\])', html).group(1))
        return bars, {row['name']: row for row in cats}, html

    def publish(item, name):
        ident = uuid.uuid4().hex
        ok('upload_chunk', {'upload_id': ident, 'file_type': 'zip', 'chunk_index': 0, 'chunk_total': 1}, {'chunk_data': ('part', zipped())})
        ok('version_publish', {'item_id': item, 'version_name': name, 'zip_upload_id': ident})

    try:
        guest = Client('http://127.0.0.1:' + str(port))
        for _ in range(50):
            try: guest.request('/install.php'); break
            except OSError:
                if server.poll() is not None: raise RuntimeError('PHP server startup failed')
                time.sleep(.1)
        _, body, _ = guest.request('/install.php')
        token = re.search(rb'name="csrf_token" value="([^"]+)"', body).group(1).decode()
        token_file = (fixture / 'data/install_token.php') if (fixture / 'data/install_token.php').exists() else (fixture / 'data/install_token.txt')
        install_token = token_file.read_text().splitlines()[-1].strip()
        guest.request('/install.php', {'csrf_token': token, 'install_token': install_token, 'site_title': 'Dashboard Check', 'admin_email': 'owner@example.com', 'admin_name': 'Owner', 'admin_password': PASS, 'admin_password_confirm': PASS})
        owner = Client(guest.base); owner.login('owner@example.com')
        db = sqlite3.connect(fixture / 'data/database.sqlite')
        bars, cats, html = dashboard()
        check('empty installation renders category empty state', not bars and not cats and '暂无文件夹分类' in html)
        ids = {name: ok('category_save', {'name': name})['id'] for name in ['Four', 'One', 'Zero']}
        bars, cats, _ = dashboard()
        check('all-zero categories render safely', bars == {'Four': 8, 'One': 8, 'Zero': 8} and all(row['pv_count'] == 0 for row in cats.values()))
        items = {}
        for name, count in [('Four', 4), ('One', 1)]:
            items[name] = [ok('item_save', {'name': name + str(i), 'category_id': ids[name], 'type': 'project'})['id'] for i in range(count)]
        bars, cats, _ = dashboard()
        check('project bar ratios remain accurate', bars == {'Four': 100, 'One': 25, 'Zero': 8})
        check('category project counts remain accurate', [cats[n]['proj_count'] for n in ['Four', 'One', 'Zero']] == [4, 1, 0])
        for i in range(5): publish(items['Four'][0], 'Review ' + str(i))
        db.execute('INSERT INTO access_logs(item_id,ip) VALUES(?,?)', (items['Four'][0], '127.0.0.1')); db.commit()
        _, cats, _ = dashboard()
        check('one visit to a five-version project counts once', cats['Four']['pv_count'] == 1)
        check('multiple versions do not inflate project or version counts', cats['Four']['proj_count'] == 4 and cats['Four']['ver_count'] == 5)
        for item in [items['Four'][0], items['Four'][0], items['Four'][1], items['One'][0]]:
            db.execute('INSERT INTO access_logs(item_id,ip) VALUES(?,?)', (item, '127.0.0.1'))
        db.commit()
        _, cats, _ = dashboard()
        check('distinct visits by the same IP are preserved', cats['Four']['pv_count'] == 4)
        check('visits to projects without versions are counted', cats['One']['pv_count'] == 1)
        check('categories without visits remain zero', cats['Zero']['pv_count'] == 0)
        publish(items['Four'][0], 'Another review')
        _, cats, _ = dashboard()
        check('adding a version does not change past visit counts', cats['Four']['ver_count'] == 6 and cats['Four']['pv_count'] == 4)
        for role in ['editor', 'viewer']:
            ok('user_add', {'email': role + '@example.com', 'name': role, 'password': PASS, 'role': role})
            client = Client(guest.base); client.login(role + '@example.com')
            check(role + ' retains its existing dashboard access', (b'window.DASHBOARD_DATA' in client.request('/index.php')[1]) == (role == 'editor'))
        check('guest does not receive admin dashboard data', b'window.DASHBOARD_DATA' not in guest.request('/index.php')[1])
        log.flush()
        check('no PHP warnings or errors during rendering', not re.search(r'PHP (Warning|Fatal error|Parse error|Notice)', (fixture / 'server.log').read_text()))
        print(json.dumps({'passed': len(checks), 'scope': 'fresh isolated installation, actual dashboard HTTP rendering'}))
    finally:
        if db is not None: db.close()
        server.terminate()
        try: server.wait(timeout=5)
        except subprocess.TimeoutExpired: server.kill(); server.wait()
        log.close()
        if args.keep: print('Fixture retained:', fixture)
        else: shutil.rmtree(fixture)


if __name__ == '__main__': main()
