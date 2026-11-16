/* Execute actual application code with a controlled network; no dependencies. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '../../assets/js/app.js'), 'utf8');
const admin = fs.readFileSync(path.join(__dirname, '../../assets/js/admin.js'), 'utf8');
let checks = 0;
function check(name, condition) { assert(condition, name); checks++; console.log('PASS ' + name); }

// 编译守卫：全站所有原生 JS 脚本必须 100% 具备无损语法完整性，防止运行期 ReferenceError
['app.js', 'admin.js', 'share.js', 'annotation.js', 'mcp.js'].forEach(file => {
  const code = fs.readFileSync(path.join(__dirname, '../../assets/js', file), 'utf8');
  assert.doesNotThrow(() => new vm.Script(code), `Syntax error in assets/js/${file}`);
  checks++;
  console.log(`PASS assets/js/${file} passes full compilation and syntax tree check`);
});
const turn = () => new Promise(resolve => setImmediate(resolve));
(async () => {
  const calls = [];
  const context = { FormData, Promise, Error, getCsrfToken: () => 'synthetic-token', fetch: (url, options) => new Promise(resolve => calls.push({ resolve, options })) };
  vm.createContext(context);
  vm.runInContext(app.slice(app.indexOf('var _pendingRequests'), app.indexOf('function togglePasswordVisibility')), context);
  const fd = new FormData(); fd.append('id', '1');
  const first = context.apiFetch('item_save', fd);
  const duplicate = context.apiFetch('item_save', fd);
  check('same pending operation reuses its promise', first === duplicate && calls.length === 1);
  await new Promise(resolve => setTimeout(resolve, 400));
  const laterDuplicate = context.apiFetch('item_save', fd);
  check('pending request remains locked after 400ms', first === laterDuplicate && calls.length === 1);
  const otherFd = new FormData(); otherFd.append('id', '2');
  const second = context.apiFetch('item_save', otherFd);
  check('different business objects can run independently', calls.length === 2);
  calls[0].resolve({ text: () => Promise.resolve('{"success":true}') });
  await first;
  const stillPending = context.apiFetch('item_save', otherFd);
  check('completion of one object does not unlock another', stillPending === second && calls.length === 2);
  check('shared transport sends CSRF in both header and body', calls[0].options.headers['X-CSRF-Token'] === 'synthetic-token' && calls[0].options.body.get('csrf_token') === 'synthetic-token');
  calls[1].resolve({ text: () => Promise.resolve('{"success":false}') });
  await second;
  const retry = context.apiFetch('item_save', otherFd);
  check('failed business response releases operation for retry', calls.length === 3);
  calls[2].resolve({ text: () => Promise.resolve('{"success":true}') }); await retry;

  const nameFdA=new FormData();nameFdA.append('item_id','9');nameFdA.append('version_name','Alpha');
  const nameFdB=new FormData();nameFdB.append('item_id','9');nameFdB.append('version_name','Beta');
  const nameA=context.apiFetch('version_check_name',nameFdA);const nameB=context.apiFetch('version_check_name',nameFdB);
  check('different version names do not reuse an unrelated pending name check',calls.length===5 && nameA!==nameB);
  calls[3].resolve({text:()=>Promise.resolve('{"success":true}')});calls[4].resolve({text:()=>Promise.resolve('{"success":true}')});await Promise.all([nameA,nameB]);

  const focusButton={tagName:'BUTTON',disabled:false,classList:{add(){},remove(){}}};
  context.document={activeElement:focusButton};
  const passiveCheck=context.apiFetch('version_check_name',nameFdA,false);
  check('background name check cannot disable the focused publish button',!focusButton.disabled);
  calls[5].resolve({text:()=>Promise.resolve('{"success":true}')});await passiveCheck;delete context.document;

  const requests = [];
  const frameListeners = {};
  const hashListeners = {};
  const frame = {contentDocument:{title:'Nested A'}, contentWindow:{location:{pathname:'/hub/asset.php/v22/section-a/index.html',hash:''},addEventListener:(name,fn)=>hashListeners[name]=fn},addEventListener:(name,fn)=>frameListeners[name]=fn};
  const anno = { window: {}, console, parseInt, FormData, document: { readyState: 'complete', addEventListener() {}, getElementById: id => id==='myFrame'?frame:null }, fetch: url => new Promise(resolve => requests.push({url, resolve})) };
  vm.createContext(anno);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../../assets/js/annotation.js'), 'utf8'), anno);
  anno.window.updateAnnoContext(1, 11, 'V1');
  anno.window.updateAnnoContext(2, 22, 'V2');
  requests[1].resolve({json: () => Promise.resolve({success:true,data:{list:[],pending_count:0,ver_id:22}})}); await turn();
  requests[0].resolve({json: () => Promise.resolve({success:true,data:{list:[],pending_count:0,ver_id:11}})}); await turn();
  anno.window.loadAnnotations();
  check('stale annotation response cannot change current version', requests[2].url === 'api.php?action=list_annotations&item_id=2&ver_id=22');

  const escContext = {}; vm.createContext(escContext);
  vm.runInContext(app.slice(app.indexOf('function esc(s)'), app.indexOf('function getCsrfToken')), escContext);
  check('HTML attribute encoder covers both quote characters', escContext.esc('"\'<>') === '&quot;&#39;&lt;&gt;');
  const approvalRow = { style: {}, setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k] || null; } };
  const approvalBody = {
    rows: [],
    querySelector: () => null,
    removeChild(r) { const idx = this.rows.indexOf(r); if (idx >= 0) this.rows.splice(idx, 1); },
    insertRow(i) {
      const r = this.rows.length === 0 && !approvalRow._used
        ? (approvalRow._used = true, approvalRow)
        : { style: {}, setAttribute(k, v) { this[k] = v; }, getAttribute(k) { return this[k] || null; } };
      this.rows.splice(i, 0, r);
      return r;
    }
  };
  const injection = { document: { getElementById: () => approvalBody }, esc: escContext.esc, pendingUsersLoaded: false };
  vm.createContext(injection);
  vm.runInContext(admin.slice(admin.indexOf('function renderPendingUsers('), admin.indexOf('function refreshPendingUsers(')), injection);
  injection.renderPendingUsers([{ id: "123');globalThis.__reviewProbe=1;//", name: '<script>probe</script>' }]);
  const handler = approvalRow.innerHTML.match(/onclick="([^"]*)"/)[1];
  check('approval event contains only numeric id and escapes applicant name', handler === 'handleApproveUser(123)' && !approvalRow.innerHTML.includes('<script>'));
  approvalBody.rows = [];
  injection.renderPendingUsers([
    { id: 201, name: '产品申请', role: 'editor' },
    { id: 202, name: '越权探测', role: 'admin' }
  ]);
  const editorRowHtml = approvalBody.rows[0].innerHTML;
  const clampedRowHtml = approvalBody.rows[1].innerHTML;
  check('pending row preselects requested editor role and shows badge', editorRowHtml.includes('badge-role-editor') && editorRowHtml.includes('value="editor" selected'));
  check('pending row clamps invalid role to viewer without exposing admin', clampedRowHtml.includes('badge-role-viewer') && clampedRowHtml.includes('value="viewer" selected') && !clampedRowHtml.includes('admin'));
  const share = fs.readFileSync(path.join(__dirname, '../../assets/js/share.js'), 'utf8');
  check('share URL is stored as data, not executable text', share.includes('data-copy-url=') && !share.includes('onclick="copySpecificShareUrl(\\\''));
  const elements = {
    myDisplayName: {value:'Verified name'}, myWebhookUrl: {value:''}, btnSaveProfile:{disabled:false},
    myProfileHeaderName:{textContent:''}, myOldPassword:{value:'old-password'},
    myNewPassword:{value:'new-password'}, myConfirmPassword:{value:'new-password'},
    btnSaveProfileWebhook:{disabled:false}
  };
  const sidebar = {textContent:''}; const messages = []; const closed = [];
  const profile = {
    FormData, Promise, CURRENT_USER:{id:1,name:'Before'},
    document:{getElementById:id=>elements[id]||null, querySelector:()=>sidebar},
    showToast:(message,type)=>messages.push({message,type}), closeModal:id=>closed.push(id), markProfileSaved(){},
    apiFetch:action=>Promise.resolve({success:true,data:action==='profile_update'?{name:'Verified name'}:{}})
  };
  vm.createContext(profile);
  for (const name of ['handleSaveProfile','handleChangeMyPassword','handleSaveProfileWebhook']) {
    const start=app.indexOf('function '+name+'('); const end=app.indexOf('window.'+name+' =',start);
    vm.runInContext(app.slice(start,end), profile);
  }
  profile.handleSaveProfile(); await turn();
  check('profile callback accepts parsed response and updates current user', profile.CURRENT_USER.name==='Verified name');
  check('profile callback updates visible name and success feedback', sidebar.textContent==='Verified name' && messages.some(m=>m.message==='个人资料已保存' && m.type==='success'));
  profile.handleChangeMyPassword(); await turn();
  check('password callback clears inputs and closes dialog after success', elements.myOldPassword.value==='' && closed.includes('profileModal'));
  elements.myWebhookUrl.value='https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=synthetic';
  profile.handleSaveProfileWebhook(); await turn();
  check('webhook callback accepts parsed response and updates user state', profile.CURRENT_USER.webhook_url===elements.myWebhookUrl.value && messages.every(m=>m.type!=='error'));

  const annoElements={annoNewInput:{value:'Synthetic annotation'},btnSendAnno:{disabled:false},replyInput_100:{value:'Synthetic reply'}};
  const annoMessages=[];
  anno.CURRENT_USER={id:1,role:'viewer'};
  anno.document.getElementById=id=>annoElements[id]||null;
  anno.document.querySelector=()=>null;
  anno.showToast=message=>annoMessages.push(message);
  anno.apiFetch=action=>Promise.resolve({success:true,data:action==='add_annotation'?{id:100,status:0,replies:[]}:{id:101}});
  frameListeners.load();
  anno.window.submitNewAnnotation(); await turn();
  check('annotation callback consumes parsed JSON and clears the composer', annoElements.annoNewInput.value==='' && annoMessages.includes('批注已发布'));
  anno.window.submitReply(100); await turn();
  check('reply callback consumes parsed JSON and clears the reply composer', annoElements.replyInput_100.value==='');
  const submitted=[];
  const deferred=[];
  anno.apiFetch=(action,fd)=>{
    submitted.push({item:fd.get('item_id'),version:fd.get('ver_id'),page:fd.get('page_path'),title:fd.get('page_title')});
    return new Promise(resolve=>deferred.push(resolve));
  };
  function submit(text) { annoElements.annoNewInput.value=text; anno.window.submitNewAnnotation(); }
  function finish(index) { deferred[index]({success:true,data:{id:200+index,status:0,replies:[]}}); }
  submit('A'); finish(0); await turn();
  frame.contentWindow.location.pathname='/hub/asset.php/v22/section-b/index.html';
  frame.contentDocument.title='Nested B'; frameListeners.load(); submit('B');
  check('same basename in different directories has distinct annotation identity', submitted[0].page==='section-a/index.html' && submitted[1].page==='section-b/index.html');
  finish(1); await turn();
  frame.contentWindow.location.pathname='/hub/asset.php/v22/%E4%B8%AD%E6%96%87/index.html'; frameListeners.load();
  submit('Encoded'); finish(2); await turn();
  check('encoded asset path is decoded consistently', submitted[2].page==='中文/index.html');
  frame.contentWindow.location.hash='#p=flow%20one'; hashListeners.hashchange(); submit('Hash'); finish(3); await turn();
  check('Axure hash pages preserve the full asset path', submitted[3].page==='中文/index.html#page_flow one');
  anno.window.updateAnnoContext(3,33,'V3');
  check('project switch disables composer before iframe load', annoElements.annoNewInput.disabled && annoElements.btnSendAnno.disabled);
  submit('Too early');
  check('new project cannot submit with previous page context', submitted.length===4);
  frameListeners.load(); submit('Old load');
  check('late old iframe event cannot authorize new context', submitted.length===4 && annoElements.btnSendAnno.disabled);
  frame.contentWindow.location.pathname='/hub/asset.php/v33/new/index.html'; frame.contentWindow.location.hash=''; frame.contentDocument.title='New project'; frameListeners.load();
  check('matching new iframe enables composer', !annoElements.annoNewInput.disabled && !annoElements.btnSendAnno.disabled);
  submit('New project note');
  check('new annotation uses only freshly loaded project context', submitted[4].item==='3' && submitted[4].version==='33' && submitted[4].page==='new/index.html' && submitted[4].title==='New project');
  submit('Double submit'); check('annotation pending request prevents double submission', submitted.length===5);
  anno.window.updateAnnoContext(4,44,'V4'); annoElements.annoNewInput.value='New draft'; finish(4); await turn();
  check('late submit response preserves new draft and disabled state', annoElements.annoNewInput.value==='New draft' && annoElements.btnSendAnno.disabled);
  const uploadElements={
    uploadVerName:{value:' 首次评审 ',setCustomValidity(message){this.validation=message;},reportValidity(){}},
    uploadVersionHint:{textContent:'',hidden:true},uploadItemId:{value:'9'},
    uploadZipFile:{files:[{name:'synthetic.zip',size:10}]},uploadRpFile:{files:[]},
    uploadChangelog:{value:''},uploadNotifyWebhook:{checked:false},btnUploadSubmit:{disabled:false},
    uploadProgressWrap:{style:{}},uploadProgressBar:{style:{}},uploadProgressText:{},uploadProgressPercent:{}
  };
  const uploads=[],publishCalls=[],confirmationCalls=[],uploadMessages=[];
  let decision=false;
  const uploader={FormData,Promise,Array,Error,encodeURIComponent,document:{getElementById:id=>uploadElements[id],querySelector:()=>({type:'checkbox',checked:true})},
    showToast:message=>uploadMessages.push(message),showConfirm:options=>{confirmationCalls.push(options);return Promise.resolve(decision);},
    adminFetch:(action,fd)=>{
      if(action==='version_check_name')return Promise.resolve({success:true,data:{exists:true,version_name:fd.get('version_name'),overwrite_token:'synthetic-confirmation'}});
      publishCalls.push(fd);return Promise.resolve({success:true});
    },
    $:()=>({is:()=>false}),window:{location:{}},setTimeout(){},sessionStorage:{setItem(){}}
  };
  vm.createContext(uploader);
  vm.runInContext(admin.slice(admin.indexOf('var versionNameCheckSequence'),admin.indexOf('// 通用分片上传辅助函数')),uploader);
  uploader.uploadFileChunks=(file,type)=>{if(file)uploads.push(type);return Promise.resolve();};
  for (const name of ['首次评审','交互调整版 2','V1.2-beta','客户确认稿（A/B）','🧭'.repeat(30)]) {
    check('frontend accepts free-form version '+name.slice(0,12),!uploader.validateVersionName(name).error);
  }
  for (const name of ['', '   ','a\nb','a\tb','a\u0085b','a\u2028b','中'.repeat(31),'🧭'.repeat(31)]) {
    check('frontend rejects invalid name '+JSON.stringify(name.slice(0,5)),!!uploader.validateVersionName(name).error);
  }
  check('frontend trims Unicode boundary spaces only',uploader.validateVersionName('　 首次 评审　 ').name==='首次 评审');
  await uploader.checkUploadVersionName();
  check('existing-name hint appears before uploading',!uploadElements.uploadVersionHint.hidden && uploadElements.uploadVersionHint.textContent.includes('同名版本已存在'));
  await uploader.handleVersionUpload({preventDefault(){}});
  check('cancel replacement never uploads or publishes and preserves inputs',uploads.length===0 && publishCalls.length===0 && uploadElements.uploadVerName.value==='首次评审' && !uploadElements.btnUploadSubmit.disabled);
  check('replacement confirmation identifies the version and consequence',confirmationCalls[0].message.includes('首次评审') && confirmationCalls[0].message.includes('原型文件和更新日志') && confirmationCalls[0].confirmText==='确认替换');
  decision=true;
  await uploader.handleVersionUpload({preventDefault(){}});
  check('confirmed replacement submits the checked name and version token',uploads.length===1 && publishCalls.length===1 && publishCalls[0].get('version_name')==='首次评审' && publishCalls[0].get('overwrite_token')==='synthetic-confirmation');
  const beforeUploads=uploads.length,beforePublishes=publishCalls.length;
  let releaseNameCheck;
  uploader.adminFetch=(action,fd)=>new Promise(resolve=>{releaseNameCheck=resolve;});
  const pendingUpload=uploader.handleVersionUpload({preventDefault(){}});
  uploader.handleVersionUpload({preventDefault(){}});
  uploadElements.uploadVerName.value='Changed while checking';
  releaseNameCheck({success:true,data:{exists:false,overwrite_token:''}});await pendingUpload;
  check('editing during name check prevents publishing the wrong captured form',uploads.length===beforeUploads && publishCalls.length===beforePublishes && uploadMessages.includes('发布内容已变更，请重新提交') && !uploadElements.btnUploadSubmit.disabled);
  uploader.adminFetch=()=>Promise.reject(new Error('synthetic offline'));
  await uploader.handleVersionUpload({preventDefault(){}});
  check('name-check network failure preserves draft and releases submit lock',!uploadElements.btnUploadSubmit.disabled && uploadElements.uploadVerName.value==='Changed while checking' && uploads.length===beforeUploads);
  let releaseTarget;
  const routeMessages=[];const routeSelections=[];let focused=0;
  const routeNode={getAttribute:()=>JSON.stringify([{id:11,version_name:'Original'}])};const routeFrame={};
  const route={window:{location:{hash:'#annotation=1'},history:{replaceState(_state,_title,hash){route.window.location.hash=hash;}},focusAnnotation:id=>focused=id},
    document:{getElementById:id=>id==='item-node-1'?routeNode:routeFrame},
    fetch:()=>new Promise(resolve=>releaseTarget=resolve),showToast:message=>routeMessages.push(message),
    selectItem:(...args)=>routeSelections.push(args),$ :()=>({closest:()=>({removeClass(){}})}),Error,JSON,parseInt,encodeURIComponent};
  vm.createContext(route);vm.runInContext(app.slice(app.indexOf('function openAnnotationLink('),app.indexOf('window.openAnnotationLink =')),route);
  const target={success:true,data:{item_id:1,version_id:11,version_name:'Original',page_url:'/asset.php/v11/nested/index.html',annotation:{needs_review:false}}};
  const staleRoute=route.openAnnotationLink(1);route.window.location.hash='#item=2';releaseTarget({json:()=>Promise.resolve(target)});await staleRoute;
  check('late comment target cannot override a subsequent user navigation',routeSelections.length===0);
  route.window.location.hash='#annotation=1';const validRoute=route.openAnnotationLink(1);releaseTarget({json:()=>Promise.resolve(target)});await validRoute;
  check('comment route selects exact version page and focus',routeSelections[0][0]===1 && routeSelections[0][2]==='Original' && routeFrame.src==='/asset.php/v11/nested/index.html' && focused===1 && route.window.location.hash==='#annotation=1');
  routeSelections.length=0;const deletedRoute=route.openAnnotationLink(2);releaseTarget({json:()=>Promise.resolve({success:true,data:{...target.data,version_id:99}})});await deletedRoute;
  check('missing comment version reports failure without selecting latest',routeSelections.length===0 && routeMessages.includes('版本已删除或不可访问'));
  let versionLabel = {textContent:'客户确认稿（A/B）'};
  const deleteConfirmations=[],deleteMessages=[],deleteRequests=[];
  const deletion={FormData,parseInt,document:{querySelector:()=>versionLabel},
    showConfirm:options=>deleteConfirmations.push(options),
    showToast:(message,type)=>deleteMessages.push({message,type}),
    adminFetch:(action,fd)=>{deleteRequests.push({action,id:fd.get('id')});return Promise.resolve({success:false,message:'Synthetic rejection'});}
  };
  vm.createContext(deletion);
  vm.runInContext(admin.slice(admin.indexOf('function handleDeleteVersion('),admin.indexOf('/* ===================== 原型分享设置弹窗')),deletion);
  deletion.handleDeleteVersion(7,'Old name',9);
  check('delete confirmation uses the displayed version name and requires confirmation',deleteConfirmations[0].message.includes('客户确认稿（A/B）') && deleteConfirmations[0].message.includes('无法撤销') && deleteConfirmations[0].confirmText==='删除版本' && deleteConfirmations[0].isDanger && deleteRequests.length===0);
  deleteConfirmations[0].onConfirm();await turn();
  check('confirming deletion submits the exact version id',deleteRequests.length===1 && deleteRequests[0].action==='version_delete' && deleteRequests[0].id==='7');
  versionLabel=null;
  deletion.handleDeleteVersion(8,'Fallback name',9);
  check('missing version label preserves a supplied name',deleteConfirmations[1].message.includes('Fallback name') && deleteConfirmations[1].confirmText==='删除版本');
  const beforeConfirmations=deleteConfirmations.length,beforeRequests=deleteRequests.length;
  deletion.handleDeleteVersion(8,null,9);
  deletion.handleDeleteVersion(8,'',9);
  versionLabel={textContent:'　 '};
  deletion.handleDeleteVersion(8,'',9);
  check('unavailable or blank version names block confirmation and deletion',deleteConfirmations.length===beforeConfirmations && deleteRequests.length===beforeRequests && deleteMessages.filter(m=>m.message==='无法获取版本名称，请刷新后重试' && m.type==='error').length===3);

  // 待审批入驻申请自动导向与文案校验
  const modalsContent = fs.readFileSync(path.join(__dirname, '../../includes/modals.php'), 'utf8');
  check('pending requests subtab copy simplified to ruzhu shenqing', modalsContent.includes('<span>入驻申请</span>') && !modalsContent.includes('<span>入驻申请待审批</span>'));

  const adminNavContext = {
    CURRENT_USER: { role: 'admin' },
    openModal() {},
    window: { PENDING_USER_COUNT: 3 },
    document: {
      getElementById: (id) => ({
        classList: { add(){}, remove(){} },
        style: {}
      }),
      querySelectorAll: () => [],
      querySelector: () => ({ scrollTop: 0 })
    },
    setTimeout: (fn) => fn(),
    renderDashboardCharts: () => {},
    resizeDashboardCharts: () => {},
    loadUserList: () => {},
    loadLogsData: () => {},
    initSettingsFormListeners: () => {},
    onAdminSelectChange: () => {},
    checkSettingsFormDirty: () => {},
    isSettingsFormDirty: () => false,
    parseInt
  };
  let switchedSubTab = null;
  adminNavContext.switchUserSubTab = (tab) => { switchedSubTab = tab; };
  vm.createContext(adminNavContext);
  vm.runInContext(admin.slice(admin.indexOf('function checkHasPendingUsers('), admin.indexOf('/* ===================== 个人设置与自主改密')), adminNavContext);

  let targetTab = null;
  adminNavContext.switchAdminTab = (tab, subTab) => {
    targetTab = tab;
    if (tab === 'users') {
      if (subTab) adminNavContext.switchUserSubTab(subTab);
      else if (adminNavContext.checkHasPendingUsers()) adminNavContext.switchUserSubTab('pending');
      else adminNavContext.switchUserSubTab('active');
    }
  };

  adminNavContext.openAdminConsole();
  check('admin console opens users-pending when pending requests exist', targetTab === 'users' && switchedSubTab === 'pending');

  switchedSubTab = null;
  adminNavContext.switchAdminTab('users');
  check('navigating to users tab auto-selects pending when requests exist', switchedSubTab === 'pending');

  adminNavContext.window.PENDING_USER_COUNT = 0;
  targetTab = null; switchedSubTab = null;
  adminNavContext.openAdminConsole();
  check('admin console opens dashboard when no pending requests', targetTab === 'dashboard');

  adminNavContext.switchAdminTab('users');
  check('navigating to users tab defaults to active when no pending requests', switchedSubTab === 'active');

  // 项目管理文件夹与排序视图完整性校验
  check('overview panel renders dual subtab switcher', modalsContent.includes('id="btnSubtabProjects"') && modalsContent.includes('id="btnSubtabFolders"'));
  check('overview panel renders folder management table', modalsContent.includes('id="overviewTableFolders"') && modalsContent.includes('moveCategoryOrder'));
  check('overview panel renders project table with category filter and order buttons', modalsContent.includes('id="overviewTableProjects"') && modalsContent.includes('id="filterProjectCategory"') && modalsContent.includes('project-order-btn'));
  check('role permissions and settings form remove legacy floating bar and rely on seamless auto-save', !modalsContent.includes('id="btnSaveRolePermissions"') && !modalsContent.includes('id="settingsFloatingBar"'));
  const adminJsContent = fs.readFileSync(path.join(__dirname, '../../assets/js/admin.js'), 'utf8');
  check('admin auto-save uses serialized snapshots and persistent status', adminJsContent.includes('autoSaveRolePermissions') && adminJsContent.includes('triggerAutoSaveSettings') && adminJsContent.includes('queueAutoSave') && modalsContent.includes('id="settingsSaveStatus"'));

  // 控制中心操作栏规范尺寸阶梯 (统一 32px 高度标准体系) 校验
  const cssContent = fs.readFileSync(path.join(__dirname, '../../assets/css/app.css'), 'utf8');
  check('css defines 32px console subtab group and 26px subtab button', cssContent.includes('.console-subtab-group') && cssContent.includes('height: 32px;') && cssContent.includes('.console-subtab-btn') && cssContent.includes('height: 26px;'));
  check('overview panel toolbar elements unified to 32px standard', modalsContent.includes('id="filterProjectCategory" class="m-select-md"') && modalsContent.includes('class="btn-primary btn-md" onclick="openItemModal(0'));
  check('users and logs panel actions unified to 32px standard without inline 34px height', modalsContent.includes('class="btn-primary btn-md" onclick="showAddUserBox()"') && modalsContent.includes('class="btn-cancel btn-md" onclick="loadLogsData()"') && !modalsContent.includes('height:34px'));

  // 版本管理卡片容器、搜索与分页；实际渲染与交互另有专项回归。
  check('version modal exposes card, search and pagination containers', modalsContent.includes('modal-ver') && modalsContent.includes('id="verManageSearchInput"') && modalsContent.includes('class="ver-card-list"') && modalsContent.includes('id="verManagePagination"'));
  check('css defines modal, card and pagination presentation', cssContent.includes('.modal-ver') && cssContent.includes('.ver-card {') && cssContent.includes('.ver-manage-search-wrap') && cssContent.includes('.btn-ver-page'));
  check('admin js defines version management search and pagination helpers', adminJsContent.includes('handleVerManageSearch') && adminJsContent.includes('gotoVerManagePage') && adminJsContent.includes('renderVersionManageView'));

  // 顶部栏权限收紧闭环校验: 必须校验项目级 can-edit 权限
  const indexPhpContent = fs.readFileSync(path.join(__dirname, '../../index.php'), 'utf8');
  check('index.php tree node outputs strict project-level can-edit attribute', indexPhpContent.includes('data-can-edit="<?php echo ($canManage && $canEditThisItem) ? \'1\' : \'0\'; ?>"'));
  check('app.js selects item and updates top buttons with strict can-edit protection', app.includes('canEditProject') && app.includes('barBtnVerManage'));

  // 补传 RP 切片大小必须对齐 512KB 微切片，避免撞上 Nginx 默认 1MB 限制报 HTTP 413
  const rpChunks = [];
  const rpSliceStart = adminJsContent.indexOf('function uploadFileChunks');
  const rpSliceEnd = adminJsContent.indexOf('function getQuickCreateFlow');
  const rpFnStart = adminJsContent.indexOf('function uploadRpForVersion');
  const rpFnEnd = adminJsContent.indexOf('function triggerQuickRpUpload');
  const rpCtx = {
    FormData, Promise, Error, Math, Date,
    UPLOAD_CHUNK_SIZE: 512 * 1024,
    syncVersionRpState() {},
    adminFetch(action, fd) {
      if (action === 'upload_chunk') rpChunks.push(fd.get('chunk_data'));
      return Promise.resolve({ success: true, data: { rp_size: 900 * 1024 } });
    }
  };
  vm.createContext(rpCtx);
  vm.runInContext(adminJsContent.slice(rpSliceStart, rpSliceEnd) + '\n' + adminJsContent.slice(rpFnStart, rpFnEnd), rpCtx);
  const fakeRp = { name: 'demo.rp', size: 900 * 1024, slice(s, e) { return new Blob([new Uint8Array(e - s)]); } };
  await rpCtx.uploadRpForVersion(1, 2, fakeRp);
  check('uploadRpForVersion splits 900KB file into 512KB chunks (<= 512KB each)', rpChunks.length === 2 && rpChunks.every(c => c.size <= 512 * 1024));

  console.log(JSON.stringify({passed:checks,scope:'actual JS with mocked network and DOM'}));
})().catch(error => { console.error(error); process.exitCode=1; });
