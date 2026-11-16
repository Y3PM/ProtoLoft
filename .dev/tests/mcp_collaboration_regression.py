#!/usr/bin/env python3
"""Disposable HTTP installation; MCP bearer access, collaboration links and publishing.
Webhook network transport is replaced only in this fixture with a local capture.
"""
import argparse,base64,contextlib,io,json,os,re,shutil,socket,sqlite3,subprocess,sys,tempfile,time,urllib.request,urllib.error,uuid,zipfile
from pathlib import Path
from security_regression import ROOT,PASS,Client,zipped


def prototype(text='Original page'):
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w') as z:
        z.writestr('index.html','<html><head><title>Home</title></head><body><h1>'+text+'</h1><a href="section/index.html">Details</a><img src="images/pixel.png"><script src="files/home/data.js"></script><script>window.SHOULD_NOT_BE_VISIBLE=true;</script></body></html>')
        z.writestr('section/index.html','<html><head><title>Details</title></head><body>Nested content</body></html>')
        z.writestr('files/home/data.js','window.fixtureInteraction = {event:"click",target:"details",note:"UNTRUSTED_REFERENCE"};/*'+'汉'*22000+'*/')
        z.writestr('images/pixel.png',base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII='))
    return stream.getvalue()


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--php',required=True);parser.add_argument('--keep',action='store_true');args=parser.parse_args()
    temp=Path(tempfile.mkdtemp(prefix='protoloft-mcp-test-',dir='/tmp'))
    for p in ROOT.glob('*.php'):shutil.copy2(p,temp/p.name)
    shutil.copy2(ROOT/'llms.txt',temp/'llms.txt')
    for name in ['includes','assets']:shutil.copytree(ROOT/name,temp/name)
    (temp/'data').mkdir()
    # Capture composition after URL validation; never contact external robots.
    hook=temp/'includes/webhook.php';s=hook.read_text();needle='        $platform = self::detectPlatform($url);'
    s=s.replace(needle,needle+"\n        file_put_contents(ROOT_PATH.'/webhook-capture.json',json_encode(['event'=>$eventType,'data'=>$data,'payload'=>self::buildPayload($platform,$eventType,$data)]));return ['success'=>true];",1);hook.write_text(s)
    (temp/'router.php').write_text("<?php if(preg_match('#^/(data|includes|\\.dev|\\.git)(/|$)#',rawurldecode(parse_url($_SERVER['REQUEST_URI'],PHP_URL_PATH)))){http_response_code(403);exit;}return false;")
    with contextlib.closing(socket.socket()) as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
    base='http://127.0.0.1:'+str(port);log=open(temp/'server.log','w')
    server=subprocess.Popen([args.php,'-S','127.0.0.1:'+str(port),'-t',str(temp),str(temp/'router.php')],stdout=log,stderr=log)
    checks=[];db=None;counter=0;worker=None
    def check(name,value):
        assert value,name
        checks.append(name);print('PASS',name,flush=True)
    def ok(client,action,fields,files=None):
        result=client.api(action,fields,files);assert result['success'],(action,result);return result.get('data')
    def rpc(token,method,params=None,headers=None,ident=True,raw=None,http_method='POST'):
        nonlocal counter
        counter+=1;body={'jsonrpc':'2.0','method':method,'params':params or {}}
        if ident:body['id']=counter
        h={'Content-Type':'application/json','Accept':'application/json, text/event-stream'}
        if token:h['Authorization']='Bearer '+token
        h.update(headers or {})
        req=urllib.request.Request(base+'/mcp.php',data=(raw if raw is not None else json.dumps(body).encode()) if http_method=='POST' else None,headers=h,method=http_method)
        try:r=urllib.request.urlopen(req,timeout=20)
        except urllib.error.HTTPError as e:r=e
        payload=r.read()
        return r.code,json.loads(payload) if payload else None,r.headers
    def tool(token,name,arguments):
        status,res,_=rpc(token,'tools/call',{'name':name,'arguments':arguments})
        assert status==200,(status,res)
        return res.get('result',res)
    def data(token,name,arguments):
        r=tool(token,name,arguments);assert not r.get('isError'),(name,r);return r['structuredContent']
    def key(client,item=0,publish=False,replace=False):return ok(client,'mcp_token_create',{'project_id':item,'can_publish':int(publish),'replace':int(replace)})['secret']
    def publish_web(client,item,name,content):
        ident=uuid.uuid4().hex;ok(client,'upload_chunk',{'upload_id':ident,'file_type':'zip','chunk_index':0,'chunk_total':1},{'chunk_data':('part',content)})
        pre=ok(client,'version_check_name',{'item_id':item,'version_name':name})
        return ok(client,'version_publish',{'item_id':item,'version_name':name,'zip_upload_id':ident,'overwrite_token':pre['overwrite_token'],'is_default':1})['id']
    def upload(token,item,content,kind='zip',total=1,index=0,ident=None):
        ident=ident or uuid.uuid4().hex
        data(token,'upload_chunk',{'item_id':int(item),'upload_id':ident,'file_type':kind,'chunk_index':index,'chunk_total':total,'data_base64':base64.b64encode(content).decode()})
        return ident
    try:
        guest=Client(base)
        for _ in range(50):
            try:guest.request('/install.php');break
            except (OSError,urllib.error.URLError):
                if server.poll() is not None:raise RuntimeError((temp/'server.log').read_text())
                time.sleep(.1)
        _,body,_=guest.request('/install.php');csrf=re.search(rb'name="csrf_token" value="([^"]+)"',body).group(1).decode()
        token_p=(temp/'data/install_token.php') if (temp/'data/install_token.php').exists() else (temp/'data/install_token.txt')
        install_token=token_p.read_text().splitlines()[-1].strip()
        guest.request('/install.php',{'csrf_token':csrf,'install_token':install_token,'site_title':'MCP Fixture','admin_email':'owner@example.com','admin_name':'Owner','admin_password':PASS,'admin_password_confirm':PASS})
        owner=Client(base);owner.login('owner@example.com');clients={};ids={}
        for who,role in [('editor','editor'),('other','editor'),('viewer','viewer'),('admin','admin')]:
            ids[who]=ok(owner,'user_add',{'email':who+'@example.com','name':who,'password':PASS,'role':role});clients[who]=Client(base);clients[who].login(who+'@example.com')
        folder=ok(owner,'category_save',{'name':'MCP Folder'})['id']
        item=int(ok(clients['editor'],'item_save',{'category_id':folder,'name':'Prototype Project','type':'project'})['id'])
        other=int(ok(clients['other'],'item_save',{'category_id':folder,'name':'Other Project','type':'project'})['id'])
        v1=publish_web(clients['editor'],item,'首次评审',prototype())
        v_other=publish_web(clients['other'],other,'V1',prototype('Other'))
        db=sqlite3.connect(temp/'data/database.sqlite')
        check('anonymous cannot create MCP credential',not guest.api('mcp_token_create',{'project_id':item})['success'])
        check('credential creation requires CSRF',not owner.api('mcp_token_create',{'project_id':item},csrf=False)['success'])
        check('viewer cannot grant publishing',not clients['viewer'].api('mcp_token_create',{'project_id':item,'can_publish':1})['success'])
        writer=key(clients['editor'],item,True);reader=key(clients['viewer'],item);administrator=key(owner,item,True);otherkey=key(clients['other'],other,True)
        settings=clients['editor'].api('mcp_settings')['data']
        check('settings exposes endpoint and metadata, never secret or hash',settings['endpoint']==base+'/mcp.php' and writer not in json.dumps(settings) and 'token_hash' not in settings['token'])
        check('database stores only a credential hash',writer not in str(db.execute('SELECT * FROM mcp_tokens').fetchall()))
        check('replacement credential requires explicit reset',not clients['editor'].api('mcp_token_create',{'project_id':item})['success'])
        check('anonymous MCP is rejected despite ordinary browser login elsewhere',rpc(None,'tools/list')[0]==401)
        check('invalid bearer rejected',rpc('plmcp_'+'0'*64,'tools/list')[0]==401)
        check('bad browser Origin rejected',rpc(writer,'tools/list',headers={'Origin':'https://attacker.invalid'})[0]==403)
        check('same-origin request accepted',rpc(writer,'tools/list',headers={'Origin':base})[0]==200)
        check('malformed JSON rejected',rpc(writer,'tools/list',raw=b'{')[0]==400)
        check('unsupported method uses protocol error',rpc(writer,'unknown')[1]['error']['code']==-32601)
        check('modern discovery gets explicit legacy negotiation fallback',rpc(writer,'server/discover')[0]==404)
        check('unsupported protocol rejected',rpc(writer,'tools/list',headers={'MCP-Protocol-Version':'unsupported'})[0]==400)
        check('GET event stream explicitly unavailable',rpc(writer,'tools/list',http_method='GET')[0]==405)
        initialize=rpc(writer,'initialize',{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'fixture','version':'1'}})[1]['result']
        check('initialize advertises tools and context instructions',initialize['protocolVersion']=='2025-11-25' and 'tools' in initialize['capabilities'] and '测试用例' in initialize['instructions'])
        check('initialized notification accepted without a response',rpc(writer,'notifications/initialized',ident=False)[:2]==(202,None))
        check('notifications cannot perform untracked writes',rpc(writer,'tools/call',{'name':'publish_version','arguments':{}},ident=False)[0]==400)
        wt=rpc(writer,'tools/list')[1]['result']['tools'];rt=rpc(reader,'tools/list')[1]['result']['tools']
        check('writer discovers read and publishing tools',len(wt)==10 and any(t['name']=='publish_version' and t['annotations']['destructiveHint'] for t in wt))
        check('reader discovers only read tools',len(rt)==6 and all(t['annotations']['readOnlyHint'] for t in rt))
        check('reader cannot call undisclosed publishing tool',tool(reader,'publish_version',{'item_id':item,'version_name':'blocked','zip_upload_id':'x'})['isError'])
        # 验证动态权限热更新 (无需轮换 Token 即可实时开启/收回发版能力)
        check('anonymous cannot update permissions', not guest.api('mcp_permission_update', {'project_id': item, 'can_publish': 0})['success'])
        check('viewer cannot grant publishing permission', not clients['viewer'].api('mcp_permission_update', {'project_id': item, 'can_publish': 1})['success'])
        up_res = clients['editor'].api('mcp_permission_update', {'project_id': item, 'can_publish': 0})
        check('editor can dynamically revoke publishing permission without changing token', up_res['success'])
        wt_demoted = rpc(writer, 'tools/list')[1]['result']['tools']
        check('same token immediately loses publishing tools without reconnection', len(wt_demoted) == 6)
        up_res2 = clients['editor'].api('mcp_permission_update', {'project_id': item, 'can_publish': 1})
        check('editor can dynamically restore publishing permission', up_res2['success'])
        wt_restored = rpc(writer, 'tools/list')[1]['result']['tools']
        check('same token immediately recovers publishing tools', len(wt_restored) == 10)

        # 多选项目范围与越权发布防御测试
        check('editor cannot grant publish on another user project', not clients['editor'].api('mcp_permission_update', {'project_ids': [item, other], 'can_publish': 1})['success'])
        multi_read = clients['editor'].api('mcp_permission_update', {'project_ids': [item, other], 'can_publish': 0})
        check('editor can grant multi-project read-only scope', multi_read['success'])
        multi_projects = data(writer, 'list_projects', {})['projects']
        multi_ids = set(p['id'] for p in multi_projects)
        check('multi-project scope discovers all authorized projects', item in multi_ids and other in multi_ids)
        check('multi-project scope can access versions of both projects', not tool(writer, 'list_versions', {'item_id': item})['isError'] and not tool(writer, 'list_versions', {'item_id': other})['isError'])
        # 恢复回指定单一项目授权以保证后续断言连续性
        clients['editor'].api('mcp_permission_update', {'project_id': item, 'can_publish': 1})

        check('wrong parameter types rejected',tool(writer,'read_page',{'version_id':str(v1),'page_path':'index.html'})['isError'])
        check('unknown tool parameters rejected',tool(writer,'list_projects',{'unexpected':True})['isError'])
        check('scope filters project discovery',data(administrator,'list_projects',{})['projects'][0]['id']==item and data(administrator,'list_projects',{})['total']==1)
        check('scope rejects another project even for platform owner',tool(administrator,'list_versions',{'item_id':other})['isError'])
        check('scope rejects another project version',tool(writer,'read_page',{'version_id':v_other,'page_path':'index.html'})['isError'])
        versions=data(reader,'list_versions',{'item_id':item})['versions'];check('reader obtains authorized versions',len(versions)==1 and versions[0]['version_name']=='首次评审')
        expiry=db.execute('SELECT expires_at FROM mcp_tokens WHERE user_id=?',(ids['viewer'],)).fetchone()[0]
        db.execute('UPDATE mcp_tokens SET expires_at=? WHERE user_id=?',(int(time.time())-1,ids['viewer']));db.commit()
        check('expired bearer is rejected',rpc(reader,'tools/list')[0]==401)
        db.execute('UPDATE mcp_tokens SET expires_at=? WHERE user_id=?',(expiry,ids['viewer']));db.commit()
        pages=data(reader,'list_pages',{'version_id':v1});check('page directory preserves nested paths',set(p['path'] for p in pages['pages'])=={'index.html','section/index.html'})
        page=data(reader,'read_page',{'version_id':v1,'page_path':'index.html','include_interactions':True})
        check('prototype source extraction excludes executable script text','Original page' in page['text'] and 'SHOULD_NOT_BE_VISIBLE' not in page['text'])
        check('page context supplies bounded links images and unexecuted interaction source',page['links']==['section/index.html'] and page['images']==['images/pixel.png'] and 'UNTRUSTED_REFERENCE' in page['interaction_sources'][0]['source'] and '未执行' in page['coverage'])
        check('truncated Chinese interaction source remains valid JSON',page['interaction_sources'][0]['truncated'] and '汉' in page['interaction_sources'][0]['source'])
        check('read path traversal denied',tool(reader,'read_page',{'version_id':v1,'page_path':'../../includes/auth.php'})['isError'])
        image=tool(reader,'read_image',{'version_id':v1,'path':'images/pixel.png'});check('image returned as native MCP content',image['content'][0]['type']=='image' and image['content'][0]['mimeType']=='image/png')
        check('source files cannot be read as images',tool(reader,'read_image',{'version_id':v1,'path':'prototype.rp'})['isError'])
        prompt=rpc(reader,'prompts/get',{'name':'prototype_test_cases','arguments':{'project':'Prototype Project'}})[1]['result']
        check('test-case template requests source evidence and unknown rules','不要写成已执行测试' in prompt['messages'][0]['content']['text'])
        check('guide resource available after authentication',rpc(reader,'resources/read',{'uri':'protoloft://guide'})[1]['result']['contents'][0]['text'])
        check('stateless MCP never creates a browser login',guest.api('get_session')['data']['user'] is None)
        guide_status,guide_body,guide_headers=guest.request('/mcp.php?guide=1')
        check('public setup guide uses MCP entry with HTML content type',guide_status==200 and guide_headers.get_content_type()=='text/html' and b'YOUR_PERSONAL_TOKEN' in guide_body and b'assets/mcp-upload.py.txt' in guide_body)
        browser_status,browser_body,browser_headers=guest.request('/mcp.php',headers={'Accept':'text/html'})
        check('browser visit renders guide without changing protocol clients',browser_status==200 and browser_headers.get_content_type()=='text/html' and browser_body==guide_body and b'2025-11-25' in guest.request('/llms.txt')[1])
        for role,client in [('owner',owner),*clients.items()]:
            role_settings=client.api('mcp_settings')['data']
            check(role+' receives the consolidated guide URL',role_settings['guide_url']==base+'/mcp.php?guide=1' and client.request('/mcp.php?guide=1')[0]==200)
        # Compose actual notifications with local-only transport capture.
        ok(clients['editor'],'profile_update',{'name':'editor','webhook_url':'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=synthetic'})
        note=ok(clients['viewer'],'add_annotation',{'item_id':item,'ver_id':v1,'page_path':'index.html','page_title':'Home','content':'Review original page'})
        capture=json.loads((temp/'webhook-capture.json').read_text())
        check('webhook comment includes canonical authenticated deep link',capture['data']['link']==base+'/index.php#annotation='+str(note['id']) and capture['data']['link'] in capture['payload']['markdown']['content'])
        _,body,_=clients['viewer'].request('/api.php?action=annotation_target&id='+str(note['id']));target=json.loads(body)['data']
        check('annotation target resolves exact version and page',target['version_id']==v1 and target['page_url']==base+'/asset.php/v%d/index.html'%v1)
        check('missing comment does not silently resolve to latest version',not json.loads(owner.request('/api.php?action=annotation_target&id=999999')[1])['success'])
        check('anonymous cannot dereference comment',not json.loads(guest.request('/api.php?action=annotation_target&id='+str(note['id']))[1])['success'])
        read=data(reader,'read_annotations',{'version_id':v1})['list'][0]
        check('AI reads original page snapshot and source link',read['page_snapshot']=='Home\nOriginal page\nDetails' or ('Original page' in read['page_snapshot'] and read['detail_url'].endswith('annotation='+str(note['id']))))
        # New version starts its own review; previous unresolved comments remain available.
        ok(owner,'save_settings',{'global_webhook_url':'https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=synthetic'})
        zid=upload(writer,item,prototype('New version'))
        prepared=data(writer,'prepare_publish',{'item_id':item,'version_name':'第二轮评审'})
        result=data(writer,'publish_version',{'item_id':item,'version_name':'第二轮评审','zip_upload_id':zid,'changelog':'New round','notify_webhook':True})
        v2=result['id']
        capture=json.loads((temp/'webhook-capture.json').read_text())
        check('published-version webhook links to the exact version ID',capture['data']['link']==base+'/index.php#item='+str(item)+'&vid='+str(v2))
        ok(owner,'save_settings',{'global_webhook_url':''})
        check('MCP publishes new version with actor attribution',db.execute('SELECT author_name FROM versions WHERE id=?',(v2,)).fetchone()[0]=='editor' and result['preview_url'].endswith('vid='+str(v2)))
        check('new version does not silently inherit annotations',data(reader,'read_annotations',{'version_id':v2})['total']==0 and data(reader,'read_annotations',{'version_id':v1})['total']==1)
        previous=json.loads(clients['viewer'].request('/api.php?action=previous_annotations&ver_id='+str(v2))[1])['data']
        check('previous unresolved comments retain original version identity',previous['list'][0]['id']==note['id'] and previous['version_name']=='首次评审')
        carried=ok(clients['viewer'],'carry_annotation',{'id':note['id'],'ver_id':v2})['id'];again=ok(clients['viewer'],'carry_annotation',{'id':note['id'],'ver_id':v2})['id']
        check('explicit carry is idempotent and retains its source',carried==again and db.execute('SELECT source_annotation_id FROM annotations WHERE id=?',(carried,)).fetchone()[0]==note['id'])
        check('cross-project carry rejected',not clients['viewer'].api('carry_annotation',{'id':note['id'],'ver_id':v_other})['success'])
        split_bytes=prototype('Chunked MCP version');split_id=uuid.uuid4().hex;cut=len(split_bytes)//2
        upload(writer,item,split_bytes[:cut],total=2,index=0,ident=split_id)
        incomplete=tool(writer,'publish_version',{'item_id':item,'version_name':'分片验收','zip_upload_id':split_id})
        check('incomplete MCP upload cannot publish',incomplete['isError'])
        upload(writer,item,split_bytes[cut:],total=2,index=1,ident=split_id)
        chunked=data(writer,'publish_version',{'item_id':item,'version_name':'分片验收','zip_upload_id':split_id})
        check('MCP upload can finish missing chunk and retry',chunked['id']>v2)
        # Replace the old version. Comments remain, but their original snapshot never changes.
        prepared=data(writer,'prepare_publish',{'item_id':item,'version_name':'首次评审'});zid=upload(writer,item,prototype('Changed same name'))
        blocked=tool(writer,'publish_version',{'item_id':item,'version_name':'首次评审','zip_upload_id':zid})
        check('MCP refuses same-name replacement without confirmation',blocked['isError'])
        replaced=data(writer,'publish_version',{'item_id':item,'version_name':'首次评审','zip_upload_id':zid,'replace_existing':True,'overwrite_token':prepared['overwrite_token']})
        changed=data(reader,'read_annotations',{'version_id':v1})['list'][0]
        check('same-name replacement marks old comment for review',replaced['id']==v1 and changed['needs_review'] and changed['origin_outdated'])
        check('same-name replacement preserves old text snapshot','Original page' in changed['page_snapshot'] and 'Changed same name' not in changed['page_snapshot'])
        check('unrelated collaborator cannot acknowledge review',not clients['other'].api('review_annotation',{'id':note['id']})['success'])
        ok(clients['viewer'],'review_annotation',{'id':note['id']})
        reviewed=data(reader,'read_annotations',{'version_id':v1})['list'][0]
        check('author review acknowledges current content without resolving',not reviewed['needs_review'] and reviewed['status']==0 and reviewed['origin_outdated'])
        # MCP resolve_annotation 工具闭环解决批注
        resolved_anno = data(writer, 'resolve_annotation', {'annotation_id': note['id'], 'status': 'resolved', 'comment': '自动化测试解决说明'})
        check('MCP resolve_annotation closes annotation and records resolver', resolved_anno['status'] == 'resolved' and resolved_anno['comment'] == '自动化测试解决说明')
        check('MCP read_annotations reflects resolved status', data(writer, 'read_annotations', {'version_id': v1})['list'][0]['status'] == 1)
        # Hidden projects and credential lifecycle are checked against current account state.
        ok(clients['editor'],'item_toggle_visibility',{'id':item})
        check('viewer token cannot read newly hidden project',tool(reader,'read_annotations',{'version_id':v1})['isError'])
        check('hidden comment target denied to viewer',not json.loads(clients['viewer'].request('/api.php?action=annotation_target&id='+str(note['id']))[1])['success'])
        ok(clients['editor'],'item_toggle_visibility',{'id':item})
        rotated=key(clients['editor'],item,True,True)
        check('reset immediately invalidates former credential',rpc(writer,'tools/list')[0]==401 and rpc(rotated,'tools/list')[0]==200)
        check('old credential cannot finish its outstanding upload',tool(rotated,'publish_version',{'item_id':item,'version_name':'Unused','zip_upload_id':zid})['isError'])
        check('invalid base64 rejected',tool(rotated,'upload_chunk',{'item_id':item,'upload_id':'invalid','file_type':'zip','chunk_index':0,'chunk_total':1,'data_base64':'@bad'})['isError'])
        check('out-of-scope upload rejected',tool(rotated,'upload_chunk',{'item_id':other,'upload_id':'cross','file_type':'zip','chunk_index':0,'chunk_total':1,'data_base64':'eA=='})['isError'])
        check('out-of-range chunk rejected',tool(rotated,'upload_chunk',{'item_id':item,'upload_id':'index','file_type':'zip','chunk_index':1,'chunk_total':1,'data_base64':'eA=='})['isError'])
        ok(owner,'user_update',{'id':ids['editor'],'role':'viewer'})
        check('role downgrade removes publish tools immediately',len(rpc(rotated,'tools/list')[1]['result']['tools'])==6 and tool(rotated,'prepare_publish',{'item_id':item,'version_name':'blocked'})['isError'])
        ok(owner,'user_update',{'id':ids['editor'],'role':'editor'})
        ok(owner,'user_update',{'id':ids['viewer'],'status':3})
        check('account deactivation invalidates bearer',rpc(reader,'tools/list')[0]==401)
        ok(owner,'user_update',{'id':ids['viewer'],'status':1})
        ok(owner,'user_update',{'id':ids['viewer'],'new_password':PASS+'reset'})
        check('password reset invalidates existing bearer',rpc(reader,'tools/list')[0]==401)
        worker_path=temp/'mcp-inflight-worker.php'
        worker_path.write_text("""<?php
        define('MCP_REQUEST',true);require __DIR__.'/includes/mcp_access.php';
        $_SERVER['HTTP_AUTHORIZATION']='Bearer '.$argv[1];McpAccess::authenticate();
        file_put_contents(__DIR__.'/mcp-worker-ready','1');
        while(!file_exists(__DIR__.'/mcp-worker-resume'))usleep(10000);
        $db=DB::getInstance();$db->beginTransaction();$db->exec('UPDATE versions SET id=id WHERE 0');
        try {McpAccess::guardWrite((int)$argv[2]);echo json_encode(['allowed'=>true]);}
        catch(DomainException $e){echo json_encode(['allowed'=>false]);}
        finally{$db->rollBack();}
        """)
        worker=subprocess.Popen([args.php,str(worker_path),rotated,str(item)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
        for _ in range(100):
            if(temp/'mcp-worker-ready').exists():break
            time.sleep(.02)
        assert(temp/'mcp-worker-ready').exists(),'MCP in-flight ready timeout'
        ok(clients['editor'],'mcp_token_revoke',{})
        (temp/'mcp-worker-resume').write_text('1')
        out,err=worker.communicate(timeout=10)
        check('revocation blocks an already authenticated in-flight publish at commit',not json.loads(out)['allowed'])
        check('explicit revocation immediately blocks access',rpc(rotated,'tools/list')[0]==401)
        nested=ok(owner,'add_annotation',{'item_id':item,'ver_id':v1,'page_path':'section/index.html#page_flow one','page_title':'Details','content':'Nested deep-link QA'})
        nested_target=json.loads(owner.request('/api.php?action=annotation_target&id='+str(nested['id']))[1])['data']
        check('nested comment target preserves full path and encoded Axure page hash',nested_target['page_url']==base+'/asset.php/v%d/section/index.html#p=flow%%20one'%v1)
        disposable=key(clients['admin'])
        ok(owner,'user_delete',{'id':ids['admin']})
        check('member deletion also removes its MCP credential',rpc(disposable,'tools/list')[0]==401 and db.execute('SELECT COUNT(*) FROM mcp_tokens WHERE user_id=?',(ids['admin'],)).fetchone()[0]==0)
        # Preserve two synthetic tokens only in an ignored /tmp fixture for SDK/browser testing.
        writer=key(clients['editor'],item,True);reader=key(owner,item,False,True)
        helper_zip=temp/'helper-large.zip'
        with zipfile.ZipFile(helper_zip,'w',compression=zipfile.ZIP_STORED) as z:
            z.writestr('index.html','<html><title>Helper</title><body>Local helper version</body></html>')
            z.writestr('notes.txt','Reference data. '*180000)
        helper_args=[sys.executable,str(ROOT/'assets/mcp-upload.py.txt'),'--url',base+'/mcp.php','--project-id',str(item),'--name','上传助手验收','--zip',str(helper_zip)]
        helper_env=dict(os.environ,PROTOLOFT_MCP_TOKEN=writer)
        (temp/'redirect.php').write_text('<?php header("Location: '+base+'/mcp.php");')
        redirect_args=list(helper_args);redirect_args[redirect_args.index('--url')+1]=base+'/redirect.php'
        redirected=subprocess.run(redirect_args,env=helper_env,text=True,capture_output=True,timeout=30)
        check('local uploader never forwards its bearer through redirects',redirected.returncode==2 and 'HTTP 302' in redirected.stderr)
        first_helper=subprocess.run(helper_args,env=helper_env,text=True,capture_output=True,timeout=30)
        assert first_helper.returncode==0,first_helper.stderr
        helper_result=json.loads(first_helper.stdout)
        check('local helper uploads a multi-megabyte ZIP without chat payloads',helper_zip.stat().st_size>2*1024*1024 and helper_result['id']>v2)
        refused_helper=subprocess.run(helper_args,env=helper_env,text=True,capture_output=True,timeout=30)
        check('local helper refuses replacement without explicit flag',refused_helper.returncode==2 and '--replace' in refused_helper.stderr)
        replace_helper=subprocess.run(helper_args+['--replace'],env=helper_env,text=True,capture_output=True,timeout=30)
        check('local helper replaces only with explicit flag',replace_helper.returncode==0 and json.loads(replace_helper.stdout)['id']==helper_result['id'])
        (temp/'fixture-prototype.zip').write_bytes(prototype('SDK version'))
        (temp/'fixture.json').write_text(json.dumps({'base':base,'item':item,'other':other,'v1':v1,'v2':v2,'note':note['id'],'carried':carried,'writer':writer,'reader':reader}))
        print(json.dumps({'passed':len(checks),'scope':'temporary HTTP MCP and collaboration fixture; webhook transport captured locally','fixture':str(temp)},ensure_ascii=False),flush=True)
    finally:
        if worker and worker.poll() is None:worker.kill();worker.communicate()
        if db:db.close()
        server.terminate();server.wait(timeout=5);log.close()
        if args.keep:print('Fixture retained:',temp,flush=True)
        else:shutil.rmtree(temp)

if __name__=='__main__':main()
