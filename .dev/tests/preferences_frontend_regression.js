/* Production autosave + real apiFetch with controlled pending network responses. */
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.join(__dirname,'../..');
const app=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
const admin=fs.readFileSync(path.join(root,'assets/js/admin.js'),'utf8');
let passed=0;const check=(name,condition)=>{assert(condition,name);passed++;console.log('PASS '+name)};
const turn=()=>new Promise(resolve=>setImmediate(resolve));
function harness(){
  const requests=[],nodes={};
  for(const prefix of ['settings','roles']){
    nodes[prefix+'SaveStatus']={textContent:'',classList:{toggle(){}}};
    nodes[prefix+'SaveRetry']={hidden:true};
  }
  const toasts=[];
  const c={FormData,Promise,Error,JSON,String,window:{},getCsrfToken:()=>'',document:{getElementById:id=>nodes[id]||null},
    showToast:(msg,type)=>toasts.push({msg,type}),isAdminConsoleOpen:()=>true,markAdminConsoleChanged(){},
    fetch:(url,opts)=>new Promise((resolve,reject)=>requests.push({fd:opts.body,resolve,reject}))};
  vm.createContext(c);
  vm.runInContext(app.slice(app.indexOf('var _pendingRequests'),app.indexOf('function togglePasswordVisibility')),c);
  c.adminFetch=(action,fd)=>c.apiFetch(action,fd,false);
  vm.runInContext(admin.slice(admin.indexOf('var autoSaveQueues'),admin.indexOf('// 绑定角色权限监听')),c);
  const send=(value,action='save_settings',saved=()=>{})=>{const fd=new FormData();fd.set('site_title',value);return c.queueAutoSave(action,fd,saved)};
  const finish=async(index,ok=true)=>{requests[index].resolve({text:()=>Promise.resolve(JSON.stringify({success:ok,message:ok?'':'synthetic failure'}))});await turn()};
  return {c,nodes,requests,toasts,send,finish};
}
(async()=>{
  let h=harness(),ack=[];
  let first=h.send('A','save_settings',fd=>ack.push(fd.get('site_title')));
  h.send('B');h.send('C');
  check('later snapshots wait behind the in-flight request',h.requests.length===1 && h.requests[0].fd.get('site_title')==='A');
  await h.finish(0);
  check('only latest queued snapshot is sent after acknowledgement',h.requests.length===2 && h.requests[1].fd.get('site_title')==='C');
  check('acknowledged callback receives actual saved payload',ack[0]==='A');
  check('queued save is not reported complete early',h.nodes.settingsSaveStatus.textContent==='保存中…');
  h.send('D');await h.finish(1);
  check('changes during the second request also drain',h.requests.length===3 && h.requests[2].fd.get('site_title')==='D');
  await h.finish(2);await first;
  check('latest request completion marks saved exactly once',h.nodes.settingsSaveStatus.textContent==='已保存' && !h.c.autoSaveQueues.save_settings.running);
  check('latest request completion emits success toast',h.toasts.filter(t=>t.msg==='系统设置已保存' && t.type==='success').length===1);
  await h.send('D');check('unchanged acknowledged snapshot is not resubmitted',h.requests.length===3);

  h=harness();first=h.send('A');h.send('B');h.send('A');await h.finish(0);await first;
  check('returning to in-flight value cancels obsolete queued edit',h.requests.length===1 && h.nodes.settingsSaveStatus.textContent==='已保存');

  h=harness();first=h.send('Retry');await h.finish(0,false);await first;
  check('business failure stays visible with retry',h.nodes.settingsSaveStatus.textContent==='synthetic failure' && !h.nodes.settingsSaveRetry.hidden);
  check('business failure emits error toast',h.toasts.some(t=>t.msg==='synthetic failure' && t.type==='error'));
  first=h.send('Retry');await h.finish(1);await first;
  check('retry sends failed snapshot and clears error',h.requests.length===2 && h.nodes.settingsSaveRetry.hidden && h.nodes.settingsSaveStatus.textContent==='已保存');

  h=harness();first=h.send('First');h.send('Latest');h.requests[0].reject(new Error('offline'));await turn();
  check('newer full snapshot is retained after transport failure',h.requests.length===2 && h.requests[1].fd.get('site_title')==='Latest');
  await h.finish(1);await first;
  check('newest successful retry completes the queue',h.nodes.settingsSaveStatus.textContent==='已保存');

  h=harness();first=h.send('Accepted');h.send('Obsolete');h.c.blockAutoSave('save_settings','邮箱域名格式有误');
  await h.finish(0);await first;
  check('invalid latest draft cancels pending older snapshot',h.requests.length===1);
  check('old success cannot overwrite latest validation error',h.nodes.settingsSaveStatus.textContent==='邮箱域名格式有误' && !h.nodes.settingsSaveRetry.hidden);
  first=h.send('Corrected');await h.finish(1);await first;
  check('correcting invalid draft unblocks normal saving',h.nodes.settingsSaveStatus.textContent==='已保存');

  h=harness();first=h.send('Settings');const role=h.send('Permission','save_role_permissions');
  check('settings and permission queues are independent',h.requests.length===2);
  await h.finish(0);await first;await h.finish(1);await role;
  check('each queue reports its own outcome',h.nodes.rolesSaveStatus.textContent==='已保存' && h.nodes.settingsSaveStatus.textContent==='已保存');
  h=harness();first=h.send('Network failure');h.requests[0].reject(new Error('offline'));await first;
  check('network failure releases queue while keeping retry available',!h.c.autoSaveQueues.save_settings.running && !h.nodes.settingsSaveRetry.hidden);

  // Exercise actual dropdown placement against viewport and scroll-container bounds.
  const start=admin.indexOf('function toggleAdminDropdown(');
  const dropdownSource=admin.slice(start,admin.indexOf('\n}',start)+2);
  const panel={top:100,bottom:800},position={top:700};
  const trigger={offsetTop:30,offsetHeight:38,expanded:'false',
    closest:()=>({getBoundingClientRect:()=>panel}),
    setAttribute(name,value){if(name==='aria-expanded')this.expanded=value;},
    getBoundingClientRect:()=>({top:position.top,bottom:position.top+38})};
  const menu={style:{display:'none'},offsetHeight:82,
    getBoundingClientRect(){const top=position.top-trigger.offsetTop+parseFloat(this.style.top);return {top,bottom:top+82,height:82};}};
  const dropdown={Math,window:{innerHeight:1000},document:{getElementById:id=>id==='adminMultiSelectMenu'?menu:trigger}};
  vm.createContext(dropdown);vm.runInContext(dropdownSource,dropdown);
  let stopped=false;
  dropdown.toggleAdminDropdown({stopPropagation(){stopped=true;}});
  check('dropdown opens above the trigger when the scroll container would clip it',menu.getBoundingClientRect().bottom<=position.top && menu.getBoundingClientRect().top>=panel.top);
  check('opening the dropdown preserves click isolation and expanded state',stopped && trigger.expanded==='true' && menu.style.display==='block');
  dropdown.toggleAdminDropdown();
  check('dropdown still closes and resets expanded state',menu.style.display==='none' && trigger.expanded==='false');
  position.top=200;
  dropdown.toggleAdminDropdown();
  check('reopening with enough space uses the area below the trigger',menu.getBoundingClientRect().top>=trigger.getBoundingClientRect().bottom && menu.getBoundingClientRect().bottom<=panel.bottom);
  dropdown.toggleAdminDropdown();position.top=700;panel.bottom=1200;dropdown.window.innerHeight=760;
  dropdown.toggleAdminDropdown();
  check('dropdown placement also respects the viewport bottom',menu.getBoundingClientRect().bottom<=position.top && menu.getBoundingClientRect().top>=panel.top);
  console.log(JSON.stringify({passed,scope:'actual autosave and shared transport with controlled network'}));
})().catch(e=>{console.error(e);process.exitCode=1});
