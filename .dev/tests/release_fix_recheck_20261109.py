#!/usr/bin/env python3
"""Independent review probes for the uncommitted Gemini fixes; disposable data only."""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import fcntl
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import time
import uuid
from zoneinfo import ZoneInfo

from guest_permissions_regression import sandbox_server, TestClient, PASS_WORD, make_proto_zip


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--php', required=True)
    parser.add_argument('--playwright-module', required=True)
    args = parser.parse_args()
    observations = []
    with sandbox_server(args.php) as (base, temporary):
        root = Path(temporary)
        owner = TestClient(base).login('admin@test.com', PASS_WORD)

        def ok(client, action, fields, files=None):
            result = client.api(action, fields, files=files)
            assert result['success'], (action, result)
            return result.get('data')

        editor_id = ok(owner, 'user_add', {'email':'editor@test.com','name':'项目负责人','role':'editor','password':PASS_WORD})
        editor = TestClient(base).login('editor@test.com', PASS_WORD)
        category = int(ok(owner, 'category_save', {'name':'修复复核样本'})['id'])
        item = int(ok(editor, 'item_save', {'category_id':category,'type':'project','name':'页面与版本复核'})['id'])
        link = int(ok(editor, 'item_save', {'category_id':category,'type':'link','name':'负责人同步样本','link_url':'/assets/images/logo.svg','link_target':'_blank'})['id'])

        def upload(client, kind, content):
            ident = uuid.uuid4().hex
            ok(client, 'upload_chunk', {'upload_id':ident,'file_type':kind,'chunk_index':0,'chunk_total':1}, {'chunk_data':('part',content)})
            return ident

        def publish(name, rp=b'original RP'):
            fields = {'item_id':item,'version_name':name,'zip_upload_id':upload(owner,'zip',make_proto_zip()),'is_default':1,'changelog':name+' 原始说明'}
            if rp is not None: fields['rp_upload_id'] = upload(owner,'rp',rp)
            return int(ok(owner,'version_publish',fields)['id'])

        v1, v2 = publish('V1'), publish('V2')
        a1 = int(ok(owner,'add_annotation',{'item_id':item,'ver_id':v1,'page_path':'page1.html','page_title':'页面一','content':'旧版授权隔离样本'})['id'])
        a2 = int(ok(owner,'add_annotation',{'item_id':item,'ver_id':v2,'page_path':'page1.html','page_title':'页面一','content':'应同时定位页面一和这条批注'})['id'])
        ok(owner,'save_role_permissions',{'perm_guest_annotate':1,'perm_guest_download_rp':1})
        pinned = ok(owner,'share_code_create',{'item_id':item,'ver_id':v2,'label':'仅V2','expire_preset':'forever'})['code']
        protected = ok(owner,'share_code_create',{'item_id':item,'ver_id':v2,'label':'有口令V2','access_password':'review-pwd','expire_preset':'forever'})['code']
        fixture = {'base':base,'password':PASS_WORD,'item':item,'link':link,'v1':v1,'v2':v2,'a1':a1,'a2':a2,'pinned':pinned,'protected':protected}
        environment = dict(os.environ,PLAYWRIGHT_MODULE=args.playwright_module,RELEASE_RECHECK_FIXTURE=json.dumps(fixture))
        subprocess.run(['node',str(Path(__file__).with_suffix('.js'))],env=environment,check=True,timeout=120)

        db = sqlite3.connect(root/'data/database.sqlite', timeout=10)
        db.row_factory = sqlite3.Row

        def version(vid):
            return dict(db.execute('SELECT * FROM versions WHERE id=?',(vid,)).fetchone())

        def download(vid):
            return owner.request('/api.php?action=download_rp&ver_id='+str(vid))[:2]

        def force_db_failure(vid):
            db.execute("CREATE TRIGGER audit_abort_rp BEFORE UPDATE OF rp_file ON versions WHEN NEW.id=%d BEGIN SELECT RAISE(ABORT, 'injected DB failure'); END" % vid)
            db.commit()

        def drop_failure():
            db.execute('DROP TRIGGER audit_abort_rp');db.commit()

        normal = b'normal replacement RP'
        ok(owner,'version_update_rp',{'id':v1,'rp_upload_id':upload(owner,'rp',normal)})
        observations.append({'id':'K1_normal_replace','passed':download(v1)==(200,normal)})
        before = version(v1)
        force_db_failure(v1)
        result = owner.api('version_update_rp',{'id':v1,'rp_upload_id':upload(owner,'rp',b'rejected replacement')})
        after = version(v1)
        observations.append({'id':'K1_db_failure_existing_rp','api_success':result['success'],'bytes_restored':download(v1)==(200,normal),
                             'metadata_preserved':all(before[k]==after[k] for k in ['rp_file','rp_size','updated_at']),
                             'temporary_backups':len(list((root/'data/prototypes'/before['storage_dir']).glob('prototype.rp.*')))})
        drop_failure()

        no_rp = publish('No-RP',None)
        force_db_failure(no_rp)
        result = owner.api('version_update_rp',{'id':no_rp,'rp_upload_id':upload(owner,'rp',b'failed first RP upload')})
        no_rp_row = version(no_rp)
        observations.append({'id':'K1_db_failure_first_rp','api_success':result['success'],'metadata_rp_file':no_rp_row['rp_file'],
                             'orphan_file_exists':(root/'data/prototypes'/no_rp_row['storage_dir']/'prototype.rp').exists()})
        drop_failure()

        # Pause merging at the existing chunk lock, after the HTTP handler read
        # its version. An open PHP descriptor proves it reached this barrier.
        # Switch the fixture's generation, then let the real handler continue.
        race = publish('RP-race',b'old generation RP')
        race_row = version(race)
        old_stage = root/'data/prototypes'/race_row['storage_dir']
        uploaded = b'uploaded RP must belong to the current generation'
        upload_id = upload(owner,'rp',uploaded)
        lock_path = root/'data/chunks'/('1_'+upload_id)/'lock'
        lock_file = lock_path.open('r+')
        fcntl.flock(lock_file,fcntl.LOCK_EX)
        with ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(owner.api,'version_update_rp',{'id':race,'rp_upload_id':upload_id})
            deadline = time.monotonic()+3
            reached = False
            while time.monotonic()<deadline:
                listing = subprocess.run(['/usr/sbin/lsof','-F','pcfn','--',str(lock_path)],capture_output=True,text=True).stdout
                if any(line.startswith('cphp') for line in listing.splitlines()):
                    reached = True
                    break
                time.sleep(.02)
            if not reached:
                fcntl.flock(lock_file,fcntl.LOCK_UN)
                raise AssertionError('RP request did not reach chunk-lock barrier')
            new_storage = 'p%d/%s' % (item,uuid.uuid4().hex)
            new_stage = root/'data/prototypes'/new_storage
            shutil.copytree(old_stage,new_stage,ignore=shutil.ignore_patterns('*.tmp.*'))
            fresh_rp = b'new generation RP retained by publish'
            (new_stage/'prototype.rp').write_bytes(fresh_rp)
            db.execute('UPDATE versions SET storage_dir=?,rp_size=? WHERE id=?',(new_storage,len(fresh_rp),race))
            db.commit()
            fcntl.flock(lock_file,fcntl.LOCK_UN)
            lock_file.close()
            result = future.result(timeout=15)
        actual_download = download(race)
        observations.append({'id':'K1_generation_changed_during_upload','api_success':result['success'],
                             'api_message':result.get('message'),
                             'returned_rp_size':(result.get('data') or {}).get('rp_size'),'download_matches_uploaded':actual_download==(200,uploaded),
                             'download_matches_new_generation_original':actual_download==(200,fresh_rp),'database_rp_size':version(race)['rp_size'],
                             'physical_rp_size':(new_stage/'prototype.rp').stat().st_size})

        # Historical logs in a DST-observing timezone must use the offset of the
        # stored instant, not the current offset.
        db.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('system_timezone','America/New_York')")
        db.execute("INSERT INTO login_logs(username,ip,status,message,created_at) VALUES('dst@test.com','127.0.0.1',1,'historical DST fixture','2026-10-20 12:00:00')")
        db.commit()
        logs = ok(owner,'log_list',{})['login_logs']
        historical = next(row for row in logs if row['message']=='historical DST fixture')
        expected = datetime.fromisoformat('2026-10-20T12:00:00+00:00').astimezone(ZoneInfo('America/New_York')).strftime('%Y-%m-%d %H:%M:%S')
        observations.append({'id':'F1_historical_dst_log','expected':expected,'actual':historical['created_at']})
        db.close()
    print(json.dumps({'http_recheck_observations':observations},ensure_ascii=False,indent=2))


if __name__=='__main__':main()
