#!/usr/bin/env python3
"""Targeted second-round review. Fault injection only touches a disposable copy."""
import argparse
from datetime import datetime
import io
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import uuid
import zipfile
from zoneinfo import ZoneInfo

from guest_permissions_regression import sandbox_server, TestClient, PASS_WORD


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--php',required=True)
    parser.add_argument('--playwright-module',required=True)
    args=parser.parse_args()
    observations=[]
    with sandbox_server(args.php) as (base,temporary):
        root=Path(temporary)
        owner=TestClient(base).login('admin@test.com',PASS_WORD)
        def ok(action,fields,files=None):
            result=owner.api(action,fields,files=files)
            assert result['success'],(action,result)
            return result.get('data')
        def upload(kind,content):
            ident=uuid.uuid4().hex
            ok('upload_chunk',{'upload_id':ident,'file_type':kind,'chunk_index':0,'chunk_total':1},{'chunk_data':('part',content)})
            return ident
        buf=io.BytesIO()
        with zipfile.ZipFile(buf,'w') as archive:
            archive.writestr('index.html','''<!doctype html><html><head><title>Hash routing fixture</title></head><body><h1 id="route"></h1><script>function render(){document.getElementById('route').textContent=location.hash||'home';}addEventListener('hashchange',render);render();</script></body></html>''')
            archive.writestr('page1.html','<!doctype html><html><head><title>Page one</title></head><body><h1>Page one</h1></body></html>')
            archive.writestr('page2.html','<!doctype html><html><head><title>Page two</title></head><body><h1>Page two</h1></body></html>')
        category=int(ok('category_save',{'name':'第二轮边界复核'})['id'])
        item=int(ok('item_save',{'category_id':category,'name':'分享与回滚边界','type':'project'})['id'])
        ver=int(ok('version_publish',{'item_id':item,'version_name':'V1','zip_upload_id':upload('zip',buf.getvalue()),'rp_upload_id':upload('rp',b'original confidential RP'),'is_default':1})['id'])
        annos=[]
        for page in ['index.html#page_details','page1.html','page2.html']:
            annos.append(int(ok('add_annotation',{'item_id':item,'ver_id':ver,'page_path':page,'page_title':page,'content':'Boundary annotation: '+page})['id']))
        ok('save_role_permissions',{'perm_guest_annotate':1,'perm_guest_download_rp':1})
        code=ok('share_code_create',{'item_id':item,'ver_id':ver,'label':'Boundary share','expire_preset':'forever'})['code']
        env=dict(os.environ,PLAYWRIGHT_MODULE=args.playwright_module,RELEASE_ROUND2_FIXTURE=json.dumps({'base':base,'item':item,'ver':ver,'annos':annos,'code':code}))
        subprocess.run(['node',str(Path(__file__).with_suffix('.js'))],env=env,check=True,timeout=90)

        db=sqlite3.connect(root/'data/database.sqlite')
        row=db.execute('SELECT storage_dir FROM versions WHERE id=?',(ver,)).fetchone()
        stage=root/'data/prototypes'/row[0]
        historical='2026-10-20 12:00:00'
        expected=datetime.fromisoformat(historical.replace(' ','T')+'+00:00').astimezone(ZoneInfo('America/New_York')).strftime('%Y-%m-%d %H:%M:%S')
        db.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('system_timezone','America/New_York')")
        db.execute('UPDATE versions SET created_at=?,updated_at=? WHERE id=?',(historical,historical,ver))
        db.commit()
        _,index,_=owner.request('/index.php')
        _,share,_=owner.request('/share.php?s='+code)
        observations.append({'id':'historical_version_site_share_time','expected':expected,
                             'workbench_correct':expected.encode() in index,'share_correct':expected.encode() in share,
                             'share_uses_current_offset_time':b'2026-10-20 07:00:00' in share})

        # Namespace only the disposable action copy to simulate a failed restore
        # rename without changing the production source or relying on root-owned
        # files. All normal filesystem calls delegate to PHP's actual functions.
        action_file=root/'includes/actions/versions.php'
        source=action_file.read_text()
        instrumentation='''<?php
namespace AuditRestoreFault;
use \\Auth; use \\Storage; use \\ZipHandler; use \\McpAccess;
use \\DomainException; use \\Throwable;
use \\RecursiveIteratorIterator; use \\RecursiveDirectoryIterator; use \\FilesystemIterator;
function rename($from,$to) {
    if (strpos($from,'.bak.')!==false && substr($to,-13)==='/prototype.rp') {
        file_put_contents(\\ROOT_PATH.'/restore-failure-observed','1');
        return false;
    }
    return \\rename($from,$to);
}
'''
        action_file.write_text(instrumentation+source[len('<?php'):])
        db.execute("CREATE TRIGGER audit_abort BEFORE UPDATE OF rp_file ON versions WHEN NEW.id=%d BEGIN SELECT RAISE(ABORT,'injected DB failure'); END" % ver)
        db.commit()
        result=owner.api('version_update_rp',{'id':ver,'rp_upload_id':upload('rp',b'new RP that must be rolled back')})
        backups=list(stage.glob('prototype.rp.bak.*'))
        current=(stage/'prototype.rp').read_bytes()
        download_status,download_body,_=owner.request('/api.php?action=download_rp&ver_id='+str(ver))
        observations.append({'id':'K1_restore_failure_preserves_backup','api_success':result['success'],
                             'restore_failure_reached':(root/'restore-failure-observed').exists(),
                             'backup_count':len(backups),'original_bytes_preserved':current==b'original confidential RP' or any(p.read_bytes()==b'original confidential RP' for p in backups),
                             'download_http':download_status,'download_is_failed_replacement':download_body==b'new RP that must be rolled back'})
        db.close()
    print(json.dumps({'round2_http_observations':observations},ensure_ascii=False,indent=2))


if __name__=='__main__':main()
