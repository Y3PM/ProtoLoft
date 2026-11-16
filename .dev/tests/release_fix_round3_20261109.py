#!/usr/bin/env python3
"""Review default share iframe URLs and historical daily buckets in a disposable site."""
import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import uuid
from zoneinfo import ZoneInfo
from guest_permissions_regression import sandbox_server, TestClient, PASS_WORD, make_proto_zip


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--php',required=True)
    parser.add_argument('--playwright-module',required=True)
    args=parser.parse_args()
    with sandbox_server(args.php) as (base,temporary):
        owner=TestClient(base).login('admin@test.com',PASS_WORD)
        def ok(action,fields,files=None):
            result=owner.api(action,fields,files=files)
            assert result['success'],(action,result)
            return result.get('data')
        category=ok('category_save',{'name':'默认分享验收'})['id']
        item=ok('item_save',{'category_id':category,'name':'默认分享与统计','type':'project'})['id']
        versions=[]
        for name in ['V1','V2']:
            ident=uuid.uuid4().hex
            ok('upload_chunk',{'upload_id':ident,'file_type':'zip','chunk_index':0,'chunk_total':1},{'chunk_data':('part',make_proto_zip())})
            versions.append(int(ok('version_publish',{'item_id':item,'version_name':name,'zip_upload_id':ident,'is_default':1})['id']))
        code=ok('item_get_share',{'id':item})['share_code']
        fixture={'base':base,'password':PASS_WORD,'code':code,'versions':versions}
        env=dict(os.environ,PLAYWRIGHT_MODULE=args.playwright_module,RELEASE_ROUND3_FIXTURE=json.dumps(fixture))
        subprocess.run(['node',str(Path(__file__).with_suffix('.js'))],env=env,check=True,timeout=90)

        with sqlite3.connect(Path(temporary)/'data/database.sqlite') as db:
            db.execute("INSERT OR REPLACE INTO settings(key,value) VALUES('system_timezone','America/New_York')")
            db.execute('DELETE FROM access_logs')
            stored='2026-10-20 04:30:00'
            db.execute('INSERT INTO access_logs(item_id,item_name,ip,role,created_at) VALUES(?,?,?,?,?)',(item,'Synthetic historical visit','127.0.0.1','viewer',stored))
            db.commit()
            _,body,_=owner.request('/index.php')
            html=body.decode()
            trend=html.split('trend30d: {',1)[1].split('}',1)[0]
            dates=json.loads(re.search(r'dates:\s*(\[[^\n]*\])',trend).group(1))
            counts=json.loads(re.search(r'values_total:\s*(\[[^\n]*\])',trend).group(1))
            actual={day:count for day,count in zip(dates,counts) if count}
            expected=datetime.fromisoformat(stored.replace(' ','T')+'+00:00').astimezone(ZoneInfo('America/New_York')).date().isoformat()
            print(json.dumps({'round3_http_observations':[{'id':'historical_daily_bucket','utc_time':stored,'expected_day':expected,'actual_nonzero_buckets':actual}]},ensure_ascii=False,indent=2))


if __name__=='__main__':main()
