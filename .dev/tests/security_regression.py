#!/usr/bin/env python3
"""Real HTTP regression in a disposable installation. No production access.
Usage: python3 .dev/tests/security_regression.py --php /path/to/php [--keep]
"""
import argparse
import contextlib
import hashlib
import hmac
import http.cookiejar
import io
import json
from pathlib import Path
import re
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[2]
PASS = 'Test-password-123'

class Client:
    def __init__(self, base):
        self.base = base
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.token = ''
    def request(self, path, fields=None, files=None, headers=None):
        headers = dict(headers or {})
        data = None
        if files is not None:
            boundary = 'protoloft' + uuid.uuid4().hex
            parts = []
            for key, value in (fields or {}).items():
                parts.append(('--' + boundary + '\r\nContent-Disposition: form-data; name="' + key + '"\r\n\r\n' + str(value) + '\r\n').encode())
            for key, (name, value) in files.items():
                parts.extend([('--' + boundary + '\r\nContent-Disposition: form-data; name="' + key + '"; filename="' + name + '"\r\nContent-Type: application/octet-stream\r\n\r\n').encode(), value, b'\r\n'])
            parts.append(('--' + boundary + '--\r\n').encode())
            data = b''.join(parts)
            headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary
        elif fields is not None:
            data = urllib.parse.urlencode(fields).encode()
            headers['Content-Type'] = 'application/x-www-form-urlencoded'
        req = urllib.request.Request(self.base + path, data=data, headers=headers)
        try:
            response = self.opener.open(req, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        return response.code, response.read(), response.headers
    def api(self, action, fields=None, files=None, csrf=True, headers=None):
        headers = dict(headers or {})
        if fields is None and files is None:
            status, body, _ = self.request('/api.php?' + urllib.parse.urlencode({'action': action}), headers=headers)
        else:
            fields = dict(fields or {})
            fields['action'] = action
            if csrf: fields['csrf_token'] = self.token
            status, body, _ = self.request('/api.php', fields, files, headers)
        try: result = json.loads(body)
        except Exception: raise AssertionError('Non-JSON %s response (%s): %s' % (action, status, body[:300]))
        return result
    def login(self, email):
        result = self.api('login', {'email': email, 'password': PASS})
        assert result['success'], result
        session = self.api('get_session')['data']
        self.token = session['csrfToken']
        return session


def zipped(text='original', nested=False):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as z:
        prefix = 'export/' if nested else ''
        z.writestr(prefix + 'index.html', '<html><head><title>Synthetic</title></head><body>' + text + '<script src="resources/app.js"></script></body></html>')
        z.writestr(prefix + 'resources/app.js', 'window.fixture = "' + text + '";')
    return stream.getvalue()


def response_cookie(headers, prefix):
    for header in headers.get_all('Set-Cookie', []):
        pair, *attributes = (part.strip() for part in header.split(';'))
        if pair.startswith(prefix):
            return pair, {attribute.lower() for attribute in attributes}
    return '', set()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    parser.add_argument('--keep', action='store_true')
    args = parser.parse_args()
    temp = Path(tempfile.mkdtemp(prefix='protoloft-http-test-', dir='/tmp'))
    for p in ROOT.glob('*.php'): shutil.copy2(p, temp / p.name)
    shutil.copytree(ROOT / 'includes', temp / 'includes')
    shutil.copytree(ROOT / 'assets', temp / 'assets')
    (temp / 'data').mkdir()
    # PHP's development server ignores .htaccess; this router enforces the
    # repository's private-directory rules for this isolated test only.
    (temp / 'test-router.php').write_text('''<?php
    $path = rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));
    if (preg_match('#^/(data|includes|\\.dev|\\.git)(/|$)#', $path)) { http_response_code(403); exit; }
    if (!empty($_SERVER['HTTP_X_STRIP_PATH_INFO']) && strpos($path, '/asset.php/') === 0) {
        unset($_SERVER['PATH_INFO'], $_SERVER['ORIG_PATH_INFO']);
        $_SERVER['SCRIPT_NAME'] = '/asset.php';
        require __DIR__ . '/asset.php';
        exit;
    }
    return false;
    ''')
    with contextlib.closing(socket.socket()) as sock:
        sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    base = 'http://127.0.0.1:%d' % port
    log = open(temp / 'php-server.log', 'w+')
    server = subprocess.Popen([args.php, '-S', '127.0.0.1:%d' % port, '-t', str(temp), str(temp / 'test-router.php')], stdout=log, stderr=log)
    checks = []
    def check(name, value):
        assert value, name
        checks.append(name)
        print('PASS', name, flush=True)
    def ok(client, action, fields, files=None):
        response = client.api(action, fields, files)
        assert response['success'], (action, response)
        return response.get('data')
    try:
        guest = Client(base)
        for _ in range(40):
            try: guest.request('/install.php'); break
            except (OSError, urllib.error.URLError):
                if server.poll() is not None: raise RuntimeError('PHP server could not start: ' + (temp / 'php-server.log').read_text())
                time.sleep(.1)
        _, body, _ = guest.request('/install.php')
        token = re.search(rb'name="csrf_token" value="([^"]+)"', body).group(1).decode()
        token_p = (temp / 'data/install_token.php') if (temp / 'data/install_token.php').exists() else (temp / 'data/install_token.txt')
        install_token = token_p.read_text().splitlines()[-1].strip()
        _, installed, _ = guest.request('/install.php', {'csrf_token': token, 'install_token': install_token, 'site_title': 'Synthetic Hub', 'site_subtitle': '', 'allowed_email_domains': '', 'admin_email': 'owner@example.com', 'admin_name': 'Owner Test', 'admin_password': PASS, 'admin_password_confirm': PASS})
        check('fresh installation completes', (temp / 'data/install.lock').is_file())
        owner = Client(base); session = owner.login('owner@example.com')
        check('real owner login and CSRF issuance', session['isOwner'] and len(owner.token) == 64)
        forged = Client(base)
        forged.request('/api.php?action=get_session', headers={'Cookie': 'ue_admin_auth=1'})
        check('fixed authentication cookie rejected', forged.api('get_session')['data']['user'] is None)
        check('missing CSRF rejected for owner', not owner.api('category_save', {'name':'blocked'}, csrf=False)['success'])
        check('wrong CSRF rejected for owner', not owner.api('category_save', {'name':'blocked','csrf_token':'bad'}, csrf=False)['success'])
        check('same hostname different port origin rejected', not owner.api('category_save', {'name':'blocked'}, headers={'Origin':'http://127.0.0.1:1'})['success'])
        check('cross-domain origin rejected', not owner.api('category_save', {'name':'blocked'}, headers={'Origin':'https://evil.invalid'})['success'])
        check('multi-hop X-Forwarded-Proto https accepted', owner.api('get_session', headers={'Host':'proxy.example.com','Origin':'https://proxy.example.com','X-Forwarded-Proto':'https, http'})['success'])
        check('X-Forwarded-Ssl on accepted', owner.api('get_session', headers={'Host':'proxy.example.com','Origin':'https://proxy.example.com','X-Forwarded-Ssl':'on'})['success'])
        check('http origin rejected when proxy declares https', not owner.api('category_save', {'name':'blocked'}, headers={'Host':'proxy.example.com','Origin':'http://proxy.example.com','X-Forwarded-Proto':'https'})['success'])
        proxy_guest = Client(base)
        _, login_html, _ = proxy_guest.request('/index.php', headers={'Host':'proxy.example.com'})
        login_csrf_m = re.search(rb'<meta name="csrf-token" content="([^"]+)"', login_html)
        check('standalone login page emits csrf meta token', bool(login_csrf_m))
        proxy_guest.token = login_csrf_m.group(1).decode()
        check('proxy https-to-http login without csrf rejected', not proxy_guest.api('login', {'email':'owner@example.com','password':PASS}, csrf=False, headers={'Host':'proxy.example.com','Origin':'https://proxy.example.com'})['success'])
        login_code, login_body, login_hdrs = proxy_guest.request('/api.php', {'action':'login','email':'owner@example.com','password':PASS,'csrf_token':proxy_guest.token,'remember_me':1}, headers={'Host':'proxy.example.com','Origin':'https://proxy.example.com'})
        login_cookies = [v.lower() for k, v in login_hdrs.items() if k.lower() == 'set-cookie']
        check('proxy https-to-http login with page csrf succeeds', json.loads(login_body)['success'])
        check('proxy https-to-http login issues Secure PHPSESSID and ue_admin_auth', any('phpsessid=' in c and 'secure' in c for c in login_cookies) and any('ue_admin_auth=' in c and 'secure' in c for c in login_cookies) and all('secure' in c for c in login_cookies))
        remember_pair = next(v.split(';', 1)[0] for k, v in login_hdrs.items() if k.lower() == 'set-cookie' and v.lower().startswith('ue_admin_auth='))
        _, restored_html, restored_hdrs = Client(base).request('/index.php', headers={'Host':'proxy.example.com','Cookie':remember_pair})
        restored_cookies = [v.lower() for k, v in restored_hdrs.items() if k.lower() == 'set-cookie']
        check('proxy headerless remember-me GET restores authenticated session with Secure PHPSESSID', b'class="user-badge"' in restored_html and any('phpsessid=' in c and 'secure' in c for c in restored_cookies) and all('secure' in c for c in restored_cookies if 'phpsessid=' in c))
        check('spoofed X-Forwarded-Scheme header cannot mark cookies Secure', all('secure' not in v.lower() for k, v in Client(base).request('/index.php', headers={'X-Forwarded-Scheme':'https'})[2].items() if k.lower() == 'set-cookie'))
        check('mismatched site_base_url domain rejected in settings', not owner.api('save_settings', {'site_base_url':'https://other-domain.invalid'})['success'])
        check('mismatched site_base_url port rejected in settings', not owner.api('save_settings', {'site_base_url':'http://127.0.0.1:1'})['success'])
        check('matching site_base_url saved and forces https app_url', owner.api('save_settings', {'site_base_url':'https://proxy.example.com/'}, headers={'Host':'proxy.example.com','Origin':'https://proxy.example.com'})['success'])
        _, s_hdrs = Client(base).request('/index.php', headers={'Host':'proxy.example.com'})[1:3]
        check('saved https site_base_url marks fresh session cookie Secure', any('phpsessid=' in v.lower() and 'secure' in v.lower() for k, v in s_hdrs.items() if k.lower() == 'set-cookie'))
        http_guest = Client(base)
        _, h_html, _ = http_guest.request('/index.php', headers={'Host':'proxy.example.com'})
        http_guest.token = re.search(rb'<meta name="csrf-token" content="([^"]+)"', h_html).group(1).decode()
        check('fresh http login still succeeds after https site_base_url saved', http_guest.api('login', {'email':'owner@example.com','password':PASS}, headers={'Host':'proxy.example.com','Origin':'http://proxy.example.com'})['success'])
        check('reset site_base_url from http origin succeeds without origin lockout', owner.api('save_settings', {'site_base_url':''}, headers={'Host':'proxy.example.com','Origin':'http://proxy.example.com'})['success'])
        _, owner_page, _ = owner.request('/index.php')
        check('dashboard renders complete page', b'window.DASHBOARD_DATA' in owner_page and b'assets/js/app.js' in owner_page and b'assets/js/admin.js' in owner_page)
        check('owner flag delivered to UI', b'"is_owner":1' in owner_page)
        def empty_action(page):
            return re.search(rb'<div class="empty-state-actions">([\s\S]*?)</div>',page).group(1).decode()
        check('empty workspace offers one actionable folder step',empty_action(owner_page).count('<button ')==1 and '新建文件夹' in empty_action(owner_page))
        check('profile has three accessible tabs and initially hidden secondary panels', all(('id="profileTab'+key+'"').encode() in owner_page for key in ['Data','Password','Mcp']) and b'aria-labelledby="profileTabMcp" class="mcp-panel" hidden' in owner_page)
        basic_panel = owner_page.split(b'id="profilePageData"',1)[1].split(b'id="profilePagePassword"',1)[0]
        check('basic settings groups independent name and notification forms beneath persistent account summary', b'id="profileForm"' in basic_panel and b'id="profileWebhookForm"' in basic_panel and owner_page.index(b'class="profile-account"') < owner_page.index(b'class="profile-tabs"'))
        check('settings controls have bound names and native navigation',b'for="settingSiteTitle"' in owner_page and b'for="settingTimezone"' in owner_page and b'<button type="button" class="admin-nav-item"' in owner_page)

        user_ids = {}
        clients = {}
        for who, role in [('editor','editor'),('other','editor'),('viewer','viewer'),('admin','admin'),('stranger','editor')]:
            user_ids[who] = ok(owner, 'user_add', {'email':who+'@example.com','name':who, 'password':PASS,'role':role})
            clients[who] = Client(base); clients[who].login(who+'@example.com')
        editor, other, viewer, admin = [clients[k] for k in ('editor','other','viewer','admin')]
        folder = ok(owner, 'category_save', {'name':'Synthetic Folder'})['id']
        folder2 = ok(owner, 'category_save', {'name':'Second Folder'})['id']
        _,folder_page,_=owner.request('/index.php')
        check('new folder appears at top of sidebar list', folder_page.index(b'Second Folder') < folder_page.index(b'Synthetic Folder'))
        check('folder without project offers project creation only',empty_action(folder_page).count('<button ')==1 and '新建项目' in empty_action(folder_page))

        item = ok(editor, 'item_save', {'category_id':folder,'name':'Same Name','type':'project','collaborators':str(user_ids['editor']) + ',' + str(user_ids['other'])})['id']
        top_item = ok(editor, 'item_save', {'category_id':folder,'name':'Top Created Project','type':'project'})['id']
        item2 = ok(other, 'item_save', {'category_id':folder2,'name':'Same Name','type':'project','collaborators':user_ids['other']})['id']
        open_item = ok(other, 'item_save', {'category_id':folder2,'name':'Open Project','type':'project'})['id']
        _,project_page,_=owner.request('/index.php')
        check('new project appears at top of folder list', project_page.index(('id="item-node-%d"' % int(top_item)).encode()) < project_page.index(('id="item-node-%d"' % int(item)).encode()))
        ok(editor, 'item_delete', {'id':top_item})
        check('project selection supplies a version-empty placeholder',b'id="noVersionPlaceholder"' in project_page and b'id="item-node-' in project_page)

        def upload(client, content, kind='zip', total=1, index=0, ident=None):
            ident = ident or uuid.uuid4().hex
            ok(client,'upload_chunk', {'upload_id':ident,'file_type':kind,'chunk_index':index,'chunk_total':total}, {'chunk_data':('part',content)})
            return ident
        def publish(client, iid, name, content, rp=None):
            zid = upload(client, content)
            fields = {'item_id':iid, 'version_name':name, 'zip_upload_id':zid, 'is_default':1}
            preflight = client.api('version_check_name', {'item_id':iid,'version_name':name})
            if preflight['success']: fields['overwrite_token'] = preflight['data']['overwrite_token']
            if rp: fields['rp_upload_id'] = upload(client, rp, 'rp')
            return client.api('version_publish', fields)
        first = publish(editor,item,'V1',zipped(nested=True),b'Synthetic RP')
        assert first['success'], first
        v1 = first['data']['id']
        second = publish(other,item2,'V1',zipped('second'))
        assert second['success'], second
        v2 = second['data']['id']
        db = sqlite3.connect(temp / 'data/database.sqlite')
        # Copy/validation consistency: disposable users and projects only.
        sample_fields = {'category_id':folder, 'name':'Metadata fixture', 'type':'project',
                         'collaborators':user_ids['other'], 'watermark_enabled':1}
        preserved_id = ok(editor, 'item_save', sample_fields)['id']
        basic_edit = {'id':preserved_id,'category_id':folder,'name':'Renamed fixture','type':'project'}
        ok(editor,'item_save',basic_edit)
        preserved = db.execute('SELECT collaborators,watermark_enabled FROM items WHERE id=?',(preserved_id,)).fetchone()
        check('metadata edit preserves omitted collaborators and watermark', str(preserved[0]) == str(user_ids['other']) and preserved[1] == 1)
        check('viewer cannot edit metadata', not viewer.api('item_save',basic_edit)['success'])
        check('unrelated editor cannot edit metadata', not clients['stranger'].api('item_save',basic_edit)['success'])
        check('anonymous cannot create links', not guest.api('item_save',{'category_id':folder,'name':'Blocked','type':'link','link_url':'https://example.com'})['success'])
        for who in [owner,editor]:
            for empty_url in ['', '   ']:
                rejected = who.api('item_save',{'category_id':folder,'name':'Empty link','type':'link','link_url':empty_url})
                check('blank link rejected with actionable instruction', not rejected['success'] and rejected['message']=='请输入链接地址')
        check('unsafe link remains rejected', not editor.api('item_save',{'category_id':folder,'name':'Unsafe','type':'link','link_url':'javascript:alert(1)'})['success'])
        for url in ['https://example.com/prototype','/index.php']:
            link_id=ok(editor,'item_save',{'category_id':folder,'name':'Valid link','type':'link','link_url':url})['id']
            ok(editor,'item_delete',{'id':link_id})
        check('HTTPS and site-relative links remain supported', True)
        check('invalid project owner is rejected', not owner.api('item_save',{**basic_edit,'created_by':user_ids['viewer']})['success'])
        ok(editor,'item_save',{**basic_edit,'collaborators':'','watermark_enabled':0})
        cleared=db.execute('SELECT collaborators,watermark_enabled FROM items WHERE id=?',(preserved_id,)).fetchone()
        check('explicit clearing remains supported for authorized calls', cleared[0]=='' and cleared[1]==0)
        ok(editor,'item_delete',{'id':preserved_id})
        reg_fields={'email':'copy-applicant@example.com','name':'Applicant','password':PASS,'department':''}
        pending_result=guest.api('register_visitor',reg_fields)
        check('optional department permits a new application',pending_result['success'])
        duplicate=guest.api('register_visitor',reg_fields)
        check('pending applicant is told to wait instead of login',not duplicate['success'] and '等待管理员' in duplicate['message'] and '登录' not in duplicate['message'])
        duplicate=guest.api('register_visitor',{**reg_fields,'email':'viewer@example.com'})
        check('enabled member is directed to login',not duplicate['success'] and duplicate['message']=='该邮箱已注册，请登录')
        pending_id=pending_result['data']['id']
        for status in [2,3]:
            db.execute('UPDATE users SET status=? WHERE id=?',(status,pending_id));db.commit()
            duplicate=guest.api('register_visitor',reg_fields)
            check('rejected or disabled applicant is directed to administrator',not duplicate['success'] and '请联系管理员' in duplicate['message'])
        db.execute("INSERT OR REPLACE INTO settings (key,value) VALUES ('allowed_email_domains','example.com')");db.commit()
        denied_domain=guest.api('register_visitor',{**reg_fields,'email':'external@outside.example'})
        check('full email input does not bypass allowed domain policy',not denied_domain['success'] and '允许的后缀' in denied_domain['message'])
        db.execute("INSERT OR REPLACE INTO settings (key,value) VALUES ('allowed_email_domains','')");db.commit()
        def row(vid):
            db.row_factory = sqlite3.Row
            return dict(db.execute('SELECT * FROM versions WHERE id=?',(vid,)).fetchone())
        initial = row(v1)
        check('same named projects use different storage', initial['storage_dir'] != row(v2)['storage_dir'])
        asset1 = '/asset.php/v%d/export/index.html' % v1
        resource1 = '/asset.php/v%d/export/resources/app.js' % v1
        check('internal preview and nested resources work', editor.request(asset1)[0] == 200 and editor.request(resource1)[0] == 200)
        strip_code, strip_body, _ = editor.request(asset1, headers={'X-Strip-Path-Info': '1'})
        strip_res_code, _, _ = editor.request(resource1, headers={'X-Strip-Path-Info': '1'})
        strip_trav_code, _, _ = editor.request('/asset.php/v%d/../../database.sqlite' % v1, headers={'X-Strip-Path-Info': '1'})
        check('preview works via REQUEST_URI fallback when PATH_INFO is stripped', strip_code == 200 and b'original' in strip_body and strip_res_code == 200 and strip_trav_code in (403, 404))
        check('anonymous preview requires sharing grant', guest.request(asset1)[0] == 403)
        check('private disk path cannot be downloaded', guest.request('/data/prototypes/'+initial['storage_dir']+'/prototype.rp')[0] == 403)
        check('RP cannot be downloaded through preview gateway', editor.request('/asset.php/v%d/prototype.rp' % v1)[0] == 403)
        check('unauthorized RP download rejected', guest.request('/api.php?action=download_rp&ver_id=%d' % v1)[0] == 403)
        check('authorized RP download works', editor.request('/api.php?action=download_rp&ver_id=%d' % v1)[1] == b'Synthetic RP')
        check('old direct upload route disabled', not other.api('version_upload', {'item_id':item})['success'])
        check('unrelated editor cannot publish to restricted project', not publish(editor,item2,'V2',zipped())['success'])
        check('editor can publish to default open project', publish(editor,open_item,'V1',zipped())['success'])
        check('non-creator editor cannot rename default open project', not editor.api('item_save',{'id':open_item,'category_id':folder2,'name':'Tampered','type':'project'})['success'])
        check('non-creator editor cannot delete default open project', not editor.api('item_delete',{'id':open_item})['success'])
        check('co-manager cannot overwrite other author', not publish(other,item,'V1',zipped('forbidden'))['success'])
        check('rejected overwrite keeps old assets', row(v1)['storage_dir'] == initial['storage_dir'] and b'original' in editor.request(asset1)[1])
        check('invalid ZIP rejected', not publish(editor,item,'V1',b'not a zip')['success'])
        def unsafe_zip(entry_name, entry_data='x'):
            s = io.BytesIO()
            with zipfile.ZipFile(s, 'w') as z:
                z.writestr('index.html', '<html><body>safe</body></html>')
                z.writestr(entry_name, entry_data)
            return s.getvalue()
        hidden_res = publish(editor, item, 'V1', unsafe_zip('.mimosa/hook-state/sess.json', '{}'))
        check('ZIP with hidden directory rejected with explicit path', not hidden_res['success'] and '隐藏文件或目录' in hidden_res['message'] and '.mimosa/hook-state/sess.json' in hidden_res['message'])
        trav_res = publish(editor, item, 'V1', unsafe_zip('../evil.html', '<h1>x</h1>'))
        check('ZIP with path traversal rejected with explicit path', not trav_res['success'] and '路径穿越' in trav_res['message'] and '../evil.html' in trav_res['message'])
        script_res = publish(editor, item, 'V1', unsafe_zip('scripts/shell.php', '<?php echo 1;'))
        check('ZIP with server script rejected with explicit path', not script_res['success'] and '服务端脚本' in script_res['message'] and 'scripts/shell.php' in script_res['message'])
        check('failed ZIP keeps default and original files', row(v1)['is_default'] == 1 and row(v1)['storage_dir'] == initial['storage_dir'] and b'original' in editor.request(asset1)[1])
        incomplete = upload(editor, zipped(), total=2)
        check('missing chunks rejected', not editor.api('version_publish', {'item_id':item,'version_name':'V1','zip_upload_id':incomplete,'overwrite_token':editor.api('version_check_name',{'item_id':item,'version_name':'V1'})['data']['overwrite_token']})['success'])
        stolen = upload(editor,zipped())
        check('upload ownership enforced', not other.api('version_publish', {'item_id':item,'version_name':'V3','zip_upload_id':stolen})['success'])
        check('folder deletion cannot bypass child project permission', not editor.api('category_delete', {'id':folder2})['success'])
        check('blocked folder deletion keeps other project', db.execute('SELECT COUNT(*) FROM items WHERE id=?',(item2,)).fetchone()[0] == 1)
        check('sort cannot move unrelated project', not editor.api('item_sort', {'ids':json.dumps([item2]),'category_id':folder})['success'])
        check('invalid target folder rejected', not editor.api('item_sort', {'ids':json.dumps([item]),'category_id':999999})['success'])
        check('rejected sorting leaves category unchanged', db.execute('SELECT category_id FROM items WHERE id=?',(item2,)).fetchone()[0] == int(folder2))
        check('ordinary admin cannot reject owner', not admin.api('reject_user', {'id':1})['success'])
        check('ordinary admin cannot hand over owner projects', not admin.api('user_handover', {'from_user_id':1,'to_user_id':user_ids['editor']})['success'])
        # GET route includes actual parameters rather than encoding them into action.
        def annotations(client, iid, vid):
            _, body, _ = client.request('/api.php?action=list_annotations&item_id=%s&ver_id=%s' % (iid,vid))
            return json.loads(body)
        check('anonymous real annotation request rejected', not annotations(guest,item,v1)['success'])
        check('cross-project annotation version rejected', not viewer.api('add_annotation', {'item_id':item,'ver_id':v2,'content':'wrong'})['success'])
        anno = ok(viewer,'add_annotation', {'item_id':item,'ver_id':v1,'content':'Synthetic annotation'})
        ok(viewer,'reply_annotation', {'annotation_id':anno['id'],'content':'Synthetic reply'})
        check('authenticated annotation list works', len(annotations(viewer,item,v1)['data']['list']) == 1)
        check('unrelated editor cannot resolve annotation', not clients['stranger'].api('toggle_annotation_status', {'id':anno['id']})['success'])
        ok(editor,'item_toggle_visibility', {'id':item})
        check('hidden annotations unavailable to viewer', not annotations(viewer,item,v1)['success'])
        check('hidden preview unavailable to viewer', viewer.request(asset1)[0] == 403)
        ok(owner,'save_role_permissions', {'feature_annotation_enabled':1,'feature_share_enabled':1,'perm_editor_share':1,'perm_viewer_share':1,'perm_viewer_download_rp':1})
        _, hidden_share, _ = viewer.request('/api.php?action=item_get_share&id='+str(item))
        check('hidden sharing settings unavailable to viewer', not json.loads(hidden_share)['success'])
        ok(editor,'item_toggle_visibility', {'id':item})
        ok(editor,'item_save_share', {'id':item,'access_password':'secret1','share_enabled':1})
        _, data, _ = viewer.request('/api.php?action=item_get_share&id='+str(item)); data=json.loads(data)['data']
        check('viewer share response strips passwords and management', 'access_password' not in data and not data['can_manage'] and data['active_shares'] == [])
        _, viewer_page, _ = viewer.request('/index.php')
        check('viewer receives no management forms', b'id="uploadModal"' not in viewer_page and b'id="adminConsoleModal"' not in viewer_page)
        check('viewer uses public scripts without admin bundle', b'assets/js/admin.js' not in viewer_page and b'assets/js/share.js' in viewer_page and b'assets/js/app.js' in viewer_page)
        check('viewer receives complete personal MCP controls without management bundle', b'id="profileTabMcp"' in viewer_page and b'id="mcpProjectScope"' in viewer_page and b'id="mcpCopyAiButton"' in viewer_page and b'assets/js/mcp.js' in viewer_page)
        share_path='/share.php?s='+data['share_code']
        ext=Client(base)
        _, locked, _=ext.request(share_path)
        check('share password gate has no iframe asset', b'id="shareFrame"' not in locked)
        check('share asset blocked before password', ext.request(asset1)[0] == 403)
        _, unlocked, _=ext.request(share_path, {'project_password':'secret1'})
        check('share password grants preview', b'id="shareFrame"' in unlocked and ext.request(asset1)[0] == 200 and ext.request(resource1)[0] == 200)
        class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl): return None
        proxy_share = Client(base)
        proxy_share.opener = urllib.request.build_opener(NoRedirectHandler(), urllib.request.HTTPCookieProcessor(proxy_share.jar))
        _, _, ps_get_hdrs = proxy_share.request(share_path, headers={'Host':'proxy.example.com'})
        old_share_sid = next(v.split(';', 1)[0] for k, v in ps_get_hdrs.items() if k.lower() == 'set-cookie' and v.lower().startswith('phpsessid='))
        ps_code, _, ps_hdrs = proxy_share.request(share_path, {'project_password':'secret1'}, headers={'Host':'proxy.example.com','Origin':'https://proxy.example.com'})
        ps_cookies = [v.lower() for k, v in ps_hdrs.items() if k.lower() == 'set-cookie']
        check('proxy headerless share password grant issues Secure PHPSESSID and ue_item_auth cookies', ps_code == 302 and any('phpsessid=' in c and 'secure' in c for c in ps_cookies) and any('ue_item_auth_' in c and 'secure' in c for c in ps_cookies) and all('secure' in c for c in ps_cookies))
        stale_client = Client(base)
        _, stale_page, _ = stale_client.request(share_path, headers={'Host':'proxy.example.com','Cookie':old_share_sid})
        stale_asset_code = stale_client.request(asset1, headers={'Cookie':old_share_sid})[0]
        check('pre-unlock PHPSESSID invalidated after share password grant', b'id="shareFrame"' not in stale_page and stale_asset_code == 403)

        proxy_host = {'Host': 'proxy.example.com'}
        secure_grant, _ = response_cookie(ps_hdrs, 'ue_item_auth_')
        _, recovered_page, recovered_headers = Client(base).request(share_path, headers={**proxy_host, 'Cookie': secure_grant})
        recovered_sid, recovered_attrs = response_cookie(recovered_headers, 'PHPSESSID=')
        check('headerless share recovery from a Secure grant issues a Secure session',
              b'id="shareFrame"' in recovered_page and 'secure' in recovered_attrs and
              Client(base).request(asset1, headers={**proxy_host, 'Cookie': recovered_sid})[0] == 200)

        _, _, anonymous_headers = Client(base).request(share_path, headers=proxy_host)
        anonymous_sid, _ = response_cookie(anonymous_headers, 'PHPSESSID=')
        _, recovered_page, recovered_headers = Client(base).request(
            share_path, headers={**proxy_host, 'Cookie': anonymous_sid + '; ' + secure_grant})
        recovered_sid, recovered_attrs = response_cookie(recovered_headers, 'PHPSESSID=')
        check('restoring share authorization also rotates an existing anonymous session',
              b'id="shareFrame"' in recovered_page and recovered_sid != anonymous_sid and 'secure' in recovered_attrs and
              Client(base).request(asset1, headers={**proxy_host, 'Cookie': anonymous_sid})[0] == 403)

        plain_grant = next(cookie.name + '=' + cookie.value for cookie in ext.jar if cookie.name.startswith('ue_item_auth_'))
        _, plain_page, plain_headers = Client(base).request(share_path, headers={'Cookie': plain_grant})
        plain_sid, plain_attrs = response_cookie(plain_headers, 'PHPSESSID=')
        check('ordinary HTTP can still restore a password-protected share',
              b'id="shareFrame"' in plain_page and plain_sid and 'secure' not in plain_attrs and
              Client(base).request(asset1, headers={'Cookie': plain_sid})[0] == 200)

        grant_name, secure_value = secure_grant.split('=', 1)
        tampered_value = secure_value.replace('v1.s.', 'v1.h.', 1)
        _, tampered_page, _ = Client(base).request(share_path, headers={**proxy_host, 'Cookie': grant_name + '=' + tampered_value})
        check('a share grant cannot be downgraded by changing its transport flag',
              tampered_value != secure_value and b'id="shareFrame"' not in tampered_page)

        legacy_secret = db.execute("SELECT value FROM settings WHERE key = 'share_cookie_secret'").fetchone()[0]
        share_suffix = hashlib.md5(data['share_code'].encode()).hexdigest()[:8]
        legacy_value = hmac.new(legacy_secret.encode(), f'item_{item}_secret1_{share_suffix}'.encode(), hashlib.sha256).hexdigest()
        _, legacy_page, _ = Client(base).request(share_path, headers={**proxy_host, 'Cookie': grant_name + '=' + legacy_value})
        check('legacy share cookie without signed transport state requires the password again',
              b'id="shareProjPwdInput"' in legacy_page and b'id="shareFrame"' not in legacy_page)

        check('share grant does not expose other version', ext.request('/asset.php/v%d/index.html' % v2)[0] == 403)
        ok(editor,'item_save_share', {'id':item,'access_password':'secret2','share_enabled':1})
        check('password change revokes existing preview grant', ext.request(asset1)[0] == 403)
        _, locked_again, _=ext.request(share_path)
        check('password change invalidates old session approval', b'id="shareFrame"' not in locked_again)
        ext.request(share_path, {'project_password':'secret2'})
        ok(editor,'item_save_share', {'id':item,'access_password':'secret2','share_enabled':0})
        check('disabling main link revokes grant', ext.request(asset1)[0] == 403)
        custom=ok(editor,'share_code_create',{'item_id':item,'label':'','expire_preset':'forever','access_password':''})
        external2=Client(base); _,custom_page,_=external2.request('/share.php?s='+custom['code'])
        check('custom link independently works while main paused', b'id="shareFrame"' in custom_page and external2.request(asset1)[0] == 200)
        ok(editor,'share_code_revoke',{'item_id':item,'code':custom['code']})
        check('revoked custom link stops existing asset grant', external2.request(asset1)[0] == 403)
        check('webhook rejects loopback without network call', not viewer.api('test_webhook', {'url':'http://127.0.0.1:1/robot/send'})['success'])
        check('webhook rejects lookalike host', not viewer.api('test_webhook', {'url':'https://qyapi.weixin.qq.com.example.org/cgi-bin/webhook/send'})['success'])
        check('item and global webhook settings enforce allowed hosts', not editor.api('item_save', {'id':item,'category_id':folder,'name':'Same Name','type':'project','webhook_url':'http://127.0.0.1:1/hook'})['success'] and not owner.api('save_settings', {'global_webhook_url':'http://127.0.0.1:1/hook'})['success'])
        check('viewer profile update works with CSRF', viewer.api('profile_update', {'name':'Updated Viewer','webhook_url':''})['success'])
        second_viewer = Client(base); second_viewer.login('viewer@example.com')
        check('viewer password update works on fresh schema', viewer.api('change_my_password', {'old_password':PASS,'new_password':PASS+'x','confirm_password':PASS+'x'})['success'])
        check('changing password preserves current authenticated session', viewer.api('get_session')['data']['user'] is not None)
        check('password change invalidates other sessions and persistent tokens', second_viewer.api('get_session')['data']['user'] is None)
        check('logged-in disabled account resolves to anonymous without recursion', owner.api('user_update', {'id':user_ids['viewer'],'status':0})['success'] and viewer.api('get_session')['data']['user'] is None)
        check('reenable account with original credentials is possible', owner.api('user_update', {'id':user_ids['viewer'],'status':1})['success'])
        # A separate disposable member exercises handover and author snapshots.
        hand = ok(owner,'user_handover', {'from_user_id':user_ids['editor'],'to_user_id':user_ids['other'],'deactivate_from':1})
        check('handover deactivation uses disabled state', db.execute('SELECT status FROM users WHERE id=?',(user_ids['editor'],)).fetchone()[0] == 3)
        pending=owner.api('pending_user_list')['data']
        check('disabled member stays outside pending approvals', all(int(u['id']) != user_ids['editor'] for u in pending))
        ok(owner,'user_delete',{'id':user_ids['editor']})
        check('deleted member historical version retains attribution', row(v1)['author_name'] == 'editor')
        # Owner can overwrite after handover. The failed build never touched old assets.
        replaced=publish(owner,item,'V1',zipped('replacement', nested=True))
        check('authorized overwrite succeeds', replaced['success'])
        check('overwrite changes immutable generation and preserves RP', row(v1)['storage_dir'] != initial['storage_dir'] and owner.request('/api.php?action=download_rp&ver_id=%d'%v1)[1] == b'Synthetic RP')
        check('old generation cleaned after successful commit', not (temp/'data/prototypes'/initial['storage_dir']).exists())
        before_failure = row(v1)
        db.execute("CREATE TRIGGER test_publish_failure BEFORE UPDATE ON versions WHEN NEW.storage_dir != OLD.storage_dir BEGIN SELECT RAISE(ABORT, 'synthetic commit failure'); END")
        db.commit()
        failed_commit = publish(owner,item,'V1',zipped('must not activate',nested=True))
        check('database failure during publish returns failure', not failed_commit['success'])
        check('database failure preserves old generation and default', row(v1)['storage_dir'] == before_failure['storage_dir'] and row(v1)['is_default'] == before_failure['is_default'] and b'replacement' in owner.request(asset1)[1])
        db.execute('DROP TRIGGER test_publish_failure'); db.commit()
        temp_item=ok(owner,'item_save',{'category_id':folder,'name':'Delete Version Test','type':'project'})['id']
        temp_ver=publish(owner,temp_item,'Nested',zipped(nested=True),b'Temporary RP')['data']['id']
        temp_root=temp/'data/prototypes'/row(temp_ver)['storage_dir']
        temp_anno=ok(owner,'add_annotation',{'item_id':temp_item,'ver_id':temp_ver,'content':'Delete with version'})['id']
        ok(owner,'reply_annotation',{'annotation_id':temp_anno,'content':'Reply'})
        ok(owner,'version_delete',{'id':temp_ver})
        check('single version deletion removes entire nested generation and RP', not temp_root.exists())
        check('single version deletion removes annotation replies', db.execute('SELECT COUNT(*) FROM annotation_replies WHERE annotation_id=?',(temp_anno,)).fetchone()[0] == 0)
        pending_response=guest.api('register_visitor',{'email':'pending@example.com','name':"P');__probe=1;//",'password':PASS})
        check('new visitor request enters approval flow', pending_response['success'])
        pending_rows=owner.api('pending_user_list')['data']
        pending_id=next(u['id'] for u in pending_rows if u['email']=='pending@example.com')
        for label, client in [('owner', owner), ('administrator', admin)]:
            count_only = client.api('pending_user_list', {'count_only': '1'})
            check(label + ' can fetch the live approval count without applicant details',
                  count_only['success'] and count_only['data'] == {'count': len(pending_rows)})
        for label, client in [('anonymous', guest), ('viewer', viewer), ('editor', other)]:
            _, count_reply, _ = client.request('/api.php?action=pending_user_list&count_only=1')
            check(label + ' cannot fetch the approval count', not json.loads(count_reply)['success'])
        check('approval can assign editor role', owner.api('approve_user',{'id':pending_id,'role':'editor'})['success'])
        check('live approval count drops after approval',
              owner.api('pending_user_list', {'count_only': '1'})['data'] == {'count': len(pending_rows) - 1})
        check('already approved member cannot be rejected as an application', not owner.api('reject_user',{'id':pending_id})['success'])
        ok(owner,'user_update',{'id':user_ids['stranger'],'new_password':PASS+'reset'})
        check('admin password reset revokes old active session', clients['stranger'].api('get_session')['data']['user'] is None)
        current_root=temp/'data/prototypes'/row(v1)['storage_dir']
        ok(owner,'category_delete',{'id':folder})
        check('folder deletion cleans all annotations and replies', db.execute('SELECT COUNT(*) FROM annotations WHERE item_id=?',(item,)).fetchone()[0] == 0 and db.execute('SELECT COUNT(*) FROM annotation_replies').fetchone()[0] == 0)
        check('folder deletion cleans shares and nested assets including RP', db.execute('SELECT COUNT(*) FROM share_codes WHERE item_id=?',(item,)).fetchone()[0] == 0 and not current_root.exists())
        check('deleting one same-named project preserves the other', other.request('/asset.php/v%d/index.html'%v2)[0] == 200)
        # Free-form names and explicit, generation-bound replacement confirmation.
        name_item=ok(owner,'item_save',{'category_id':folder2,'name':'Name Rules','type':'project','collaborators':1})['id']
        publisher=owner
        assert viewer.api('login',{'email':'viewer@example.com','password':PASS+'x'})['success']
        viewer.token=viewer.api('get_session')['data']['csrfToken']
        for label,client in [('anonymous',guest),('viewer',viewer),('unrelated editor',clients['other'])]:
            check(label+' cannot preflight an unrelated managed version',not client.api('version_check_name',{'item_id':name_item,'version_name':'Free name'})['success'])
        check('name preflight requires CSRF',not owner.api('version_check_name',{'item_id':name_item,'version_name':'Free'},csrf=False)['success'])
        for name in ['首次评审','交互调整版 2','V1.2-beta','2026.11.01','客户确认稿（A/B）','🧭'*30]:
            result=publish(publisher,name_item,name,zipped('free name'))
            check('free-form version accepted: '+name[:18],result['success'] and result['data']['version_name']==name)
        for name in ['', '   ', 'a\nb', 'a\rb','a\tb','a\x00b','a\x7fb','a\u0085b','a\u2028b','a\u2029b','中'*31,'🧭'*31]:
            check('invalid version name rejected before upload: '+repr(name[:10]),not owner.api('version_publish',{'item_id':name_item,'version_name':name,'zip_upload_id':'unused'})['success'])
        spaced=publish(owner,name_item,'　 客户确认稿 　',zipped('original free name'))
        check('Unicode boundary spaces are removed without altering inner text',spaced['success'] and spaced['data']['version_name']=='客户确认稿')
        named_id=spaced['data']['id'];before=row(named_id);preflight=ok(owner,'version_check_name',{'item_id':name_item,'version_name':' 客户确认稿 '})
        check('existing name returns a replacement confirmation token',preflight['exists'] and len(preflight['overwrite_token'])==64 and 'storage_dir' not in preflight)
        untouched=owner.api('version_publish',{'item_id':name_item,'version_name':'客户确认稿','zip_upload_id':'unused'})
        check('missing replacement confirmation cannot overwrite assets',not untouched['success'] and untouched['data']['requires_confirmation'] and row(named_id)['storage_dir']==before['storage_dir'])
        wrong=owner.api('version_publish',{'item_id':name_item,'version_name':'客户确认稿','zip_upload_id':'unused','overwrite_token':'0'*64})
        check('forged replacement confirmation rejected',not wrong['success'] and row(named_id)['storage_dir']==before['storage_dir'])
        replacement=publish(owner,name_item,'客户确认稿',zipped('new free name'))
        check('confirmed replacement updates same version safely',replacement['success'] and replacement['data']['id']==named_id and row(named_id)['storage_dir']!=before['storage_dir'])
        stale=owner.api('version_publish',{'item_id':name_item,'version_name':'客户确认稿','zip_upload_id':'unused','overwrite_token':preflight['overwrite_token']})
        check('stale confirmation cannot replace a newer generation',not stale['success'] and '重新确认' in stale['message'])
        check('replacement token cannot be reused for a different name',not owner.api('version_publish',{'item_id':name_item,'version_name':'New name','zip_upload_id':'unused','overwrite_token':preflight['overwrite_token']})['success'])
        case1=publish(owner,name_item,'review',zipped('lower'));case2=publish(owner,name_item,'Review',zipped('upper'))
        check('free-form names preserve case instead of rewriting it',case1['success'] and case2['success'] and case1['data']['id']!=case2['data']['id'])
        ok(owner,'item_delete',{'id':name_item})
        log.flush()
        php_log_text = (temp / 'php-server.log').read_text(encoding='utf-8', errors='replace')
        check('php server log emits zero PHP Warning or session cookie param warnings', 'PHP Warning' not in php_log_text and 'session_set_cookie_params()' not in php_log_text)
        db.close()
        print(json.dumps({'passed':len(checks),'scope':'disposable PHP HTTP installation','php':subprocess.check_output([args.php,'-r','echo PHP_VERSION;'],text=True),'fixture':str(temp)},ensure_ascii=False),flush=True)
    finally:
        server.terminate()
        try: server.wait(timeout=5)
        except subprocess.TimeoutExpired: server.kill();server.wait()
        log.close()
        if args.keep: print('Fixture retained:',temp,flush=True)
        else: shutil.rmtree(temp)

if __name__ == '__main__': main()
