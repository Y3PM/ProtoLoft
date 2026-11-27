#!/usr/bin/env python3
"""Second-review fixes: isolated HTTP, SQLite failures and controlled processes.
Usage: python3 .dev/tests/security_round2_regression.py --php /path/to/php [--keep]
No production services or data; only synthetic accounts and temporary files.
"""
import argparse
import contextlib
import json
from pathlib import Path
import re
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import time
import urllib.parse
import urllib.error
from security_regression import ROOT, PASS, Client, zipped, uuid


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    parser.add_argument('--keep', action='store_true')
    args = parser.parse_args()
    temp = Path(tempfile.mkdtemp(prefix='protoloft-round2-test-', dir='/tmp'))
    for p in ROOT.glob('*.php'): shutil.copy2(p, temp / p.name)
    for name in ('includes', 'assets'): shutil.copytree(ROOT / name, temp / name)
    (temp / 'data').mkdir()
    (temp / 'router.php').write_text("<?php if (preg_match('#^/(data|includes|\\.dev|\\.git)(/|$)#', rawurldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH)))) {http_response_code(403);exit;} return false;")
    with contextlib.closing(socket.socket()) as sock:
        sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    base = 'http://127.0.0.1:%d' % port
    log = open(temp / 'server.log', 'w')
    server = subprocess.Popen([args.php, '-S', '127.0.0.1:%d' % port, '-t', str(temp), str(temp / 'router.php')], stdout=log, stderr=log)
    checks = []
    worker = None
    db = None
    def check(name, condition):
        assert condition, name
        checks.append(name); print('PASS', name, flush=True)
    def ok(client, action, fields, files=None):
        result = client.api(action, fields, files)
        assert result['success'], (action, result)
        return result.get('data')
    def upload(client, content):
        ident = uuid.uuid4().hex
        ok(client, 'upload_chunk', {'upload_id':ident, 'file_type':'zip', 'chunk_index':0, 'chunk_total':1}, {'chunk_data':('part', content)})
        return ident
    def publish(client, item, name, text):
        preflight=client.api('version_check_name',{'item_id':item,'version_name':name})
        token=preflight['data']['overwrite_token'] if preflight['success'] else ''
        return client.api('version_publish', {'item_id':item, 'version_name':name, 'zip_upload_id':upload(client,zipped(text)), 'is_default':1,'overwrite_token':token})
    def share(client, code, query=''):
        return client.request('/share.php?s=' + code + query)[1]
    def settings(): return dict(db.execute('SELECT key,value FROM settings').fetchall())
    def files(): return {p.name:p.read_bytes() for p in (temp/'uploads/branding').glob('*') if p.is_file()}
    def blob_file(vid):
        h = db.execute('SELECT stored_hash FROM version_files WHERE version_id=? LIMIT 1', (vid,)).fetchone()[0]
        return temp / 'data/blobs' / h[:2] / h[2:4] / h
    def login_choice(email, remember):
        client = Client(base)
        _, body, headers = client.request('/api.php', {'action':'login','email':email,'password':PASS,'remember_me':str(remember)})
        assert json.loads(body)['success']
        client.token = client.api('get_session')['data']['csrfToken']
        return client, headers.get_all('Set-Cookie') or []
    def close_browser(client):
        # CookieJar's discard flag models session-cookie removal, not browser UI acceptance.
        for cookie in list(client.jar):
            if cookie.discard: client.jar.clear(cookie.domain, cookie.path, cookie.name)
    try:
        guest = Client(base)
        for _ in range(60):
            try: guest.request('/install.php'); break
            except (OSError, urllib.error.URLError):
                if server.poll() is not None: raise RuntimeError((temp/'server.log').read_text())
                time.sleep(.1)
        _, body, _ = guest.request('/install.php')
        token = re.search(rb'name="csrf_token" value="([^"]+)"',body).group(1).decode()
        token_p = (temp / 'data/install_token.php') if (temp / 'data/install_token.php').exists() else (temp / 'data/install_token.txt')
        install_token = token_p.read_text().splitlines()[-1].strip()
        guest.request('/install.php', {'csrf_token':token,'install_token':install_token,'site_title':'Round 2 Hub','admin_email':'owner@example.com','admin_name':'Owner Test','admin_password':PASS,'admin_password_confirm':PASS})
        owner = Client(base); owner.login('owner@example.com')
        db = sqlite3.connect(temp/'data/database.sqlite')
        ids, clients = {}, {}
        for who, role in [('admin2','admin'),('admin3','admin'),('editor','editor'),('viewer','viewer'),('once','viewer'),('remember','viewer')]:
            ids[who] = ok(owner,'user_add',{'email':who+'@example.com','name':who,'password':PASS,'role':role})
            clients[who] = Client(base); clients[who].login(who+'@example.com')
        folder = ok(owner,'category_save',{'name':'Round 2 Folder'})['id']
        item = ok(clients['editor'],'item_save',{'name':'Round 2 Project','category_id':folder,'type':'project'})['id']
        old = publish(clients['editor'],item,'V1','OLD-SENSITIVE-CONTENT')['data']['id']
        _, body, _ = owner.request('/api.php?action=item_get_share&id='+str(item))
        code = json.loads(body)['data']['share_code']
        follow = ok(owner,'share_code_create',{'item_id':item,'expire_preset':'forever','label':'Follow'})['code']
        pinned = ok(owner,'share_code_create',{'item_id':item,'ver_id':old,'expire_preset':'forever','label':'Pinned'})['code']
        main_guest, follow_guest, pinned_guest = Client(base), Client(base), Client(base)
        for client, link in [(main_guest,code),(follow_guest,follow),(pinned_guest,pinned)]:
            share(client,link)
            assert client.request('/asset.php/v%d/index.html'%old)[0]==200
        new = publish(clients['editor'],item,'V2','CURRENT-CONTENT')['data']['id']
        check('old default grant expires when main default changes', main_guest.request('/asset.php/v%d/index.html'%old)[0]==403)
        check('follow-default custom grant expires on default change', follow_guest.request('/asset.php/v%d/index.html'%old)[0]==403)
        check('pinned historical grant survives default change', pinned_guest.request('/asset.php/v%d/index.html'%old)[0]==200)
        for label,client,link in [('main',main_guest,code),('follow',follow_guest,follow),('viewer',clients['viewer'],code)]:
            for query in ['&vid='+str(old),'&v=V1']:
                page = share(client,link,query)
                check(label+' ignores history selector '+query, ('asset.php/v%d/'%new).encode() in page and ('asset.php/v%d/'%old).encode() not in page)
            if label!='viewer': check(label+' history asset remains forbidden',client.request('/asset.php/v%d/index.html'%old)[0]==403)
        check('pinned link ignores conflicting version selector', ('asset.php/v%d/'%old).encode() in share(pinned_guest,pinned,'&vid='+str(new)))
        check('internal manager retains historical preview', ('asset.php/v%d/'%old).encode() in share(owner,code,'&vid='+str(old)))
        check('current default resource remains accessible', main_guest.request('/asset.php/v%d/index.html'%new)[0]==200)

        note_a=ok(clients['viewer'],'add_annotation',{'item_id':item,'ver_id':new,'page_path':'section-a/index.html','page_title':'Page A','content':'Round 2 A'})
        note_b=ok(clients['viewer'],'add_annotation',{'item_id':item,'ver_id':new,'page_path':'section-b/index.html','page_title':'Page B','content':'Round 2 B'})
        check('new annotation response preserves its full page context',note_a.get('page_path')=='section-a/index.html' and note_a.get('page_title')=='Page A' and note_b.get('page_path')=='section-b/index.html')
        _,body,_=clients['viewer'].request('/api.php?action=list_annotations&item_id=%s&ver_id=%s'%(item,new))
        notes=json.loads(body)['data']['list']
        check('annotation list preserves distinct same-basename page identities',{n['page_path'] for n in notes}=={'section-a/index.html','section-b/index.html'})

        # Full settings preflight plus a failure after new images have been moved.
        for label,client in [('guest',guest),('viewer',clients['viewer']),('editor',clients['editor'])]:
            check(label+' cannot save system settings', not client.api('save_settings',{'site_title':'Blocked'})['success'])
        baseline, baseline_files = settings(), files()
        result = owner.api('save_settings',{'site_title':'Must rollback','allowed_email_domains':'invalid@domain'})
        check('invalid domain leaves every setting unchanged', not result['success'] and settings()==baseline)
        bad = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        good = b'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="blue"/></svg>'
        result = owner.api('save_settings',{'site_title':'Must rollback','reset_logo':1},{'custom_logo':('bad.svg',bad)})
        check('invalid logo leaves configuration and old images unchanged', not result['success'] and settings()==baseline and files()==baseline_files)
        result = owner.api('save_settings',{'site_title':'Must rollback','allowed_email_domains':'invalid@domain'},{'custom_logo':('good.svg',good)})
        check('valid logo plus invalid domain never partially saves', not result['success'] and settings()==baseline and files()==baseline_files)
        db.execute("CREATE TRIGGER test_settings_failure BEFORE INSERT ON settings WHEN NEW.key='global_webhook_url' BEGIN SELECT RAISE(ABORT,'synthetic failure'); END"); db.commit()
        try:
            result=owner.api('save_settings',{'site_title':'Must rollback','global_webhook_url':'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=fail'},{'custom_logo':('good.svg',good)})
            check('database failure rolls back settings and newly placed image',not result['success'] and settings()==baseline and files()==baseline_files)
        finally:
            db.execute('DROP TRIGGER test_settings_failure');db.commit()
        ok(owner,'save_settings',{'site_title':'Round 2 Hub'},{'custom_logo':('good.svg',good)})
        first_logo=settings()['site_logo']
        check('successful logo upload stores one immutable file',(temp/first_logo).read_bytes()==good)
        saved, saved_files = settings(), files()
        result=owner.api('save_settings',{'site_title':'Must rollback','reset_logo':1},{'custom_logo':('bad.svg',bad)})
        check('failed reset with existing images preserves all old references and bytes',not result['success'] and settings()==saved and files()==saved_files)
        branding=temp/'uploads/branding';branding.chmod(0o555)
        try:
            result=owner.api('save_settings',{'site_title':'Must rollback'},{'custom_logo':('good.svg',good)})
            check('image placement failure preserves previous settings and files',not result['success'] and settings()==saved and files()==saved_files)
        finally:branding.chmod(0o755)
        ok(owner,'save_settings',{'site_title':'Round 2 Hub'},{'custom_logo':('good.svg',good)})
        second_logo=settings()['site_logo']
        check('replacing logo removes unreferenced previous logo',second_logo!=first_logo and not (temp/first_logo).exists() and (temp/second_logo).is_file())
        ok(owner,'save_settings',{'reset_logo':1})
        check('reset logo removes retired branding file and restores default logo',not (temp/second_logo).exists() and settings()['site_logo']=='assets/images/logo.png' and not files())

        # Filesystem failure must not change a committed operation into failure.
        garbage_item=ok(owner,'item_save',{'category_id':folder,'name':'Cleanup Test','type':'project'})['id']
        delete_ver=publish(owner,garbage_item,'Delete','delete')['data']['id']; delete_blob=blob_file(delete_ver); delete_bucket=delete_blob.parent
        delete_bucket.chmod(0o500)
        try:
            result=owner.api('version_delete',{'id':delete_ver})
            check('unreadable cleanup reports successful version deletion',result['success'] and '清理待重试' in result['message'])
            check('deletion committed and failed cleanup remains queued',db.execute('SELECT COUNT(*) FROM versions WHERE id=?',(delete_ver,)).fetchone()[0]==0 and db.execute('SELECT COUNT(*) FROM asset_gc').fetchone()[0]==1)
        finally: delete_bucket.chmod(0o700)
        ok(owner,'version_set_default',{'id':new})
        check('later operation retries and clears queued cleanup',not delete_blob.exists() and db.execute('SELECT COUNT(*) FROM asset_gc').fetchone()[0]==0)
        replace_ver=publish(owner,garbage_item,'Replace','before')['data']['id']; replace_blob=blob_file(replace_ver); replace_bucket=replace_blob.parent
        replace_bucket.chmod(0o500)
        try:
            result=publish(owner,garbage_item,'Replace','after')
            check('overwrite succeeds despite retired generation cleanup failure',result['success'] and '清理待重试' in result['message'] and b'after' in owner.request('/asset.php/v%d/index.html'%replace_ver)[1])
        finally: replace_bucket.chmod(0o700)
        ok(owner,'version_set_default',{'id':new})
        check('retired generation cleanup can be retried safely',not replace_blob.exists() and blob_file(replace_ver).exists())
        for action,label in [('item_delete','project'),('category_delete','folder')]:
            category=ok(owner,'category_save',{'name':'Temporary '+label})['id']
            iid=ok(owner,'item_save',{'category_id':category,'name':'Temporary','type':'project'})['id']
            vid=publish(owner,iid,'V1','temporary-'+label)['data']['id']; path=blob_file(vid); bucket=path.parent; bucket.chmod(0o500)
            try:
                result=owner.api(action,{'id':iid if action=='item_delete' else category})
                check(label+' deletion succeeds with cleanup queued',result['success'] and '清理待重试' in result['message'] and db.execute('SELECT COUNT(*) FROM items WHERE id=?',(iid,)).fetchone()[0]==0)
            finally:bucket.chmod(0o700)
            ok(owner,'version_set_default',{'id':new})
            check(label+' queued directory is removed on retry',not path.exists())

        once,headers=login_choice('once@example.com',0)
        session_headers=[h for h in headers if h.startswith('PHPSESSID=')]
        check('unremembered login has session-only PHP cookie',session_headers and all('expires=' not in h.lower() and 'max-age=' not in h.lower() for h in session_headers))
        check('unremembered login issues no persistent auth cookie',not any(h.startswith('ue_admin_auth=') and 'Max-Age=2592000' in h for h in headers))
        _,body,headers=once.request('/api.php',{'action':'change_my_password','csrf_token':once.token,'old_password':PASS,'new_password':PASS+'x','confirm_password':PASS+'x'})
        check('password rotation preserves session-only preference',json.loads(body)['success'] and any(h.startswith('PHPSESSID=') for h in headers.get_all('Set-Cookie') or []) and all('expires=' not in h.lower() and 'max-age=' not in h.lower() for h in headers.get_all('Set-Cookie') or [] if h.startswith('PHPSESSID=')))
        check('session-only user remains logged in until simulated close',once.api('get_session')['data']['user'] is not None)
        close_browser(once)
        check('discarding session cookies removes unremembered login',once.api('get_session')['data']['user'] is None)
        remembered,headers=login_choice('remember@example.com',1)
        check('remembered login has persistent session and auth cookies',all(any(h.startswith(name+'=') and 'Max-Age=2592000' in h for h in headers) for name in ['PHPSESSID','ue_admin_auth']))
        close_browser(remembered)
        check('remembered login survives simulated browser close',remembered.api('get_session')['data']['user'] is not None)
        # Expire only the server Session to exercise persistent-token recovery.
        for cookie in list(remembered.jar):
            if cookie.name=='PHPSESSID': remembered.jar.clear(cookie.domain,cookie.path,cookie.name)
        check('remembered token recovers a persistent server session',remembered.api('get_session')['data']['user'] is not None and any(c.name=='PHPSESSID' and not c.discard for c in remembered.jar))
        _,body,headers=remembered.request('/api.php',{'action':'change_my_password','csrf_token':remembered.api('get_session')['data']['csrfToken'],'old_password':PASS,'new_password':PASS+'x','confirm_password':PASS+'x'})
        check('remembered password rotation retains persistent PHP session',json.loads(body)['success'] and any(h.startswith('PHPSESSID=') and 'Max-Age=2592000' in h for h in headers.get_all('Set-Cookie') or []))

        # Schema invariant works even for direct writes; normal transfer temporarily clears Owner inside a transaction.
        try:
            db.execute('UPDATE users SET is_owner=1 WHERE id=?',(ids['admin2'],));db.commit();blocked=False
        except sqlite3.IntegrityError:db.rollback();blocked=True
        check('schema prevents a second owner through UPDATE',blocked)
        try:
            db.execute("INSERT INTO users(email,name,password_hash,role,is_owner) VALUES('extra@example.com','Extra','unused','admin',1)");db.commit();blocked=False
        except sqlite3.IntegrityError:db.rollback();blocked=True
        check('schema prevents a second owner through INSERT',blocked)
        check('wrong password cannot transfer ownership',not owner.api('transfer_ownership',{'target_user_id':ids['admin2'],'password':'wrong'})['success'])
        check('non-admin target cannot receive ownership',not owner.api('transfer_ownership',{'target_user_id':ids['viewer'],'password':PASS})['success'])
        check('ordinary admin cannot transfer ownership',not clients['admin2'].api('transfer_ownership',{'target_user_id':ids['admin3'],'password':PASS})['success'])
        (temp/'owner_worker.php').write_text('''<?php
        require __DIR__.'/includes/auth.php';
        $_SESSION['user_id']=1; $_SESSION['auth_version']=0;
        Auth::getCurrentUser();
        file_put_contents(__DIR__.'/ready','1');
        while (!file_exists(__DIR__.'/resume')) usleep(10000);
        echo json_encode(Auth::transferOwnership((int)$argv[1],$argv[2]));
        ''')
        worker=subprocess.Popen([args.php,str(temp/'owner_worker.php'),str(ids['admin3']),PASS],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        for _ in range(100):
            if (temp/'ready').exists():break
            time.sleep(.02)
        assert (temp/'ready').exists(),'worker ready timeout'
        first=owner.api('transfer_ownership',{'target_user_id':ids['admin2'],'password':PASS})
        (temp/'resume').write_text('1')
        out,err=worker.communicate(timeout=15);second=json.loads(out)
        check('first valid transfer succeeds',first['success'])
        check('in-flight request with cached former Owner is rejected',not second['success'] and '权限已变更' in second['message'])
        check('concurrent transfer leaves exactly the intended Owner',db.execute('SELECT id FROM users WHERE is_owner=1').fetchall()==[(ids['admin2'],)])
        check('new Owner can transfer ownership back normally',clients['admin2'].api('transfer_ownership',{'target_user_id':1,'password':PASS})['success'] and db.execute('SELECT id FROM users WHERE is_owner=1').fetchall()==[(1,)])
        (temp/'fixture.json').write_text(json.dumps({'base':base,'item':item,'old':old,'new':new,'code':code,'follow':follow,'pinned':pinned,'folder':folder},indent=2))
        print(json.dumps({'passed':len(checks),'scope':'isolated HTTP / SQLite / controlled process regression','fixture':str(temp),'php':subprocess.check_output([args.php,'-r','echo PHP_VERSION;'],text=True)},ensure_ascii=False),flush=True)
    finally:
        if worker and worker.poll() is None: worker.kill();worker.communicate()
        if db: db.close()
        server.terminate(); server.wait(timeout=5);log.close()
        if args.keep:print('Fixture retained:',temp,flush=True)
        else:shutil.rmtree(temp)

if __name__=='__main__':main()
