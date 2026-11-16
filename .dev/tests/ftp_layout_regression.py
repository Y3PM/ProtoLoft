#!/usr/bin/env python3
"""Copy the FTP site unchanged (excluding .dev/.git), then test a fresh install.
PHP's test router models access rules; production Apache/Nginx is not simulated.
"""
import argparse
import hashlib
import json
import re
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path
from security_regression import ROOT, PASS, Client, zipped, uuid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    args = parser.parse_args()
    if (ROOT / 'data/database.sqlite').exists() or (ROOT / 'data/install.lock').exists():
        raise RuntimeError('Use a clean source checkout, not a site containing user data.')
    checks = []

    def check(name, condition):
        assert condition, name
        checks.append(name)
        print('PASS', name, flush=True)

    def manifest(root):
        return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
                for p in root.rglob('*') if p.is_file()
                and p.relative_to(root).parts[0] not in ('.dev', '.git')}

    original = manifest(ROOT)
    with tempfile.TemporaryDirectory(prefix='protoloft-ftp-layout-', dir='/tmp') as temp:
        temp = Path(temp)
        site = temp / 'site'
        site.mkdir()
        for source in ROOT.iterdir():
            if source.name in ('.dev', '.git'):
                continue
            if source.is_dir():
                shutil.copytree(source, site / source.name)
            else:
                shutil.copy2(source, site / source.name)
        check('FTP copy preserves every deployed file byte for byte', manifest(site) == original)
        check('FTP copy has no development or obsolete entry directories',
              not any((site / name).exists() for name in
                      ('.dev', '.git', 'scratch', 'docs', 'admin.php', 'mcp-guide.php', 'uploads/ux')))
        router = temp / 'router.php'
        router.write_text("""<?php
        $path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
        if (preg_match('#^/(data|includes|\\.dev|\\.git)(/|$)#', $path)
            || preg_match('#^/uploads/.*\\.(rp|php|phtml|phar|py|sh)$#i', $path)) {
            http_response_code(403); exit;
        }
        return false;
        """)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        base = 'http://127.0.0.1:' + str(port)
        with (temp / 'server.log').open('w+') as log:
            server = subprocess.Popen([args.php, '-S', '127.0.0.1:' + str(port),
                                       '-t', str(site), str(router)], stdout=log, stderr=log)
            try:
                guest = Client(base)
                for _ in range(50):
                    try:
                        guest.request('/install.php')
                        break
                    except OSError:
                        if server.poll() is not None:
                            log.seek(0)
                            raise RuntimeError(log.read())
                        time.sleep(.1)
                status, guide, headers = guest.request('/mcp.php?guide=1')
                check('MCP setup page works before installation without development files',
                      status == 200 and headers.get_content_type() == 'text/html'
                      and b'YOUR_PERSONAL_TOKEN' in guide)
                status, page, _ = guest.request('/index.php')
                token = re.search(rb'name="csrf_token" value="([^"]+)"', page).group(1).decode()
                check('unchanged FTP copy opens the installation wizard', status == 200 and bool(token))
                token_p = (site / 'data/install_token.php') if (site / 'data/install_token.php').exists() else (site / 'data/install_token.txt')
                install_token = token_p.read_text().splitlines()[-1].strip()
                guest.request('/install.php', {'csrf_token': token, 'install_token': install_token, 'site_title': 'FTP Copy',
                    'admin_email': 'owner@example.com', 'admin_name': 'Owner',
                    'admin_password': PASS, 'admin_password_confirm': PASS})
                check('fresh installation creates its database and private storage',
                      (site / 'data/database.sqlite').is_file() and (site / 'data/install.lock').is_file()
                      and (site / 'data/prototypes').is_dir() and (site / 'data/chunks').is_dir())
                check('fresh installation does not recreate retired public prototype storage',
                      not (site / 'uploads/ux').exists())
                owner = Client(base)
                owner.login('owner@example.com')

                def ok(client, action, fields, files=None):
                    result = client.api(action, fields, files)
                    assert result['success'], (action, result)
                    return result.get('data')

                clients = {'owner': owner}
                for role in ('admin', 'editor', 'viewer'):
                    ok(owner, 'user_add', {'email': role + '@example.com', 'name': role,
                                         'password': PASS, 'role': role})
                    clients[role] = Client(base)
                    clients[role].login(role + '@example.com')
                for role, client in clients.items():
                    status, page, _ = client.request('/index.php')
                    badge = ('badge-role-' + role).encode()
                    check(role + ' dashboard renders its role and correct script scope',
                          status == 200 and badge in page and b'assets/js/app.js' in page
                          and (b'assets/js/admin.js' in page) == (role != 'viewer'))
                    settings = client.api('mcp_settings')['data']
                    check(role + ' MCP setup points to the consolidated public entry',
                          settings['endpoint'] == base + '/mcp.php'
                          and settings['guide_url'] == base + '/mcp.php?guide=1')
                for path in ('assets/css/app.css', 'assets/js/app.js', 'assets/fonts/remixicon.woff2',
                             'assets/images/favicon.svg', 'assets/mcp-upload.py.txt', 'llms.txt'):
                    status, body, _ = guest.request('/' + path)
                    check('deployed resource available: ' + path, status == 200 and bool(body))
                folder = ok(owner, 'category_save', {'name': 'FTP Folder'})['id']
                item = ok(clients['editor'], 'item_save', {'category_id': folder,
                          'name': 'FTP Prototype', 'type': 'project'})['id']
                ident = uuid.uuid4().hex
                ok(clients['editor'], 'upload_chunk', {'upload_id': ident, 'file_type': 'zip',
                   'chunk_index': 0, 'chunk_total': 1}, {'chunk_data': ('part', zipped('FTP copy works'))})
                version = ok(clients['editor'], 'version_publish', {'item_id': item,
                             'version_name': 'FTP smoke', 'zip_upload_id': ident, 'is_default': 1})['id']
                asset = '/asset.php/v%d/index.html' % version
                check('published prototype works through the existing authenticated asset URL',
                      b'FTP copy works' in clients['viewer'].request(asset)[1])
                check('anonymous users cannot read prototype assets directly', guest.request(asset)[0] == 403)
                custom = ok(owner, 'share_code_create', {'item_id': item, 'label': 'FTP Share',
                            'expire_preset': 'forever', 'access_password': ''})
                external = Client(base)
                _, share, _ = external.request('/share.php?s=' + custom['code'])
                check('external share works without a login after copying the site',
                      b'id="shareFrame"' in share and external.request(asset)[0] == 200)
                for path in ('data/database.sqlite', 'includes/views/mcp-guide.php', '.dev/README.md', '.git/config'):
                    check('private path denied by the test router: ' + path, guest.request('/' + path)[0] == 403)
                check('retired public entry URLs are absent',
                      guest.request('/admin.php')[0] == 404 and guest.request('/mcp-guide.php')[0] == 404)
                check('running the FTP copy leaves source files unchanged', manifest(ROOT) == original
                      and not (ROOT / 'data/database.sqlite').exists())
                print(json.dumps({'passed': len(checks), 'scope': 'exact FTP copy, fresh PHP HTTP installation; test-router access rules'}))
            finally:
                server.terminate()
                server.wait(timeout=10)


if __name__ == '__main__':
    main()
