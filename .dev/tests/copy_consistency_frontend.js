/* Exercise production functions for conditional fields and clipboard feedback. */
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const path = require('path');
const read = name => fs.readFileSync(path.join(__dirname, '../../assets/js', name), 'utf8');
const admin = read('admin.js'), share = read('share.js'), app = read('app.js');
const extract = (source, name) => {
  const start = source.indexOf('function ' + name + '(');
  assert(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
};
let passed = 0;
const check = (name, condition) => { assert(condition, name); passed++; console.log('PASS ' + name); };
(async () => {
  const fields = {
    linkFields:{style:{}}, itemLinkUrl:{required:false}, itemWebhookGroup:{style:{}},
    changelogReqStar:{style:{}},changelogOptTag:{style:{}},uploadChangelog:{style:{},focus(){this.focused=true;}},
    customShareDateGroup:{hidden:true}, customShareExpireCustomDate:{required:false,value:'2026-11-10',focus(){this.focused=true;}}
  };
  const state = {document:{getElementById:id=>fields[id]}};
  vm.createContext(state);
  for (const [source,name] of [[admin,'toggleItemType'],[admin,'toggleUploadNotify'],[share,'onCustomShareExpirePresetChange']]) vm.runInContext(extract(source,name),state);
  state.toggleItemType('link');check('link type requires address, displays fields and hides webhook',fields.itemLinkUrl.required && fields.linkFields.style.display==='block' && fields.itemWebhookGroup.style.display==='none');
  state.toggleItemType('project');check('project type releases hidden address validation and shows webhook',!fields.itemLinkUrl.required && fields.linkFields.style.display==='none' && fields.itemWebhookGroup.style.display==='block');
  state.toggleUploadNotify(true);check('notification requires changelog and displays star',fields.uploadChangelog.required && fields.changelogReqStar.style.display==='inline' && fields.changelogOptTag.style.display==='none');
  state.toggleUploadNotify(false);check('disabling notification restores optional changelog',!fields.uploadChangelog.required && fields.changelogReqStar.style.display==='none' && fields.changelogOptTag.style.display==='inline');

  // 双列发版群通知独立控制及日志联动验证
  const notifyState = {
    notifyItemWebhook: {disabled:false, checked:true},
    notifyGlobalWebhook: {disabled:false, checked:false},
    changelogReqStar: {style:{display:'none'}},
    changelogOptTag: {style:{display:'inline'}},
    uploadChangelog: {required:false, placeholder:'', style:{borderColor:''}, classList:{remove(){}}},
  };
  const splitCtx = {document:{getElementById:id=>notifyState[id]||null}};
  vm.createContext(splitCtx);
  vm.runInContext(extract(admin, 'handleNotifyTargetChange'), splitCtx);
  splitCtx.handleNotifyTargetChange();
  check('split notify: checking item webhook alone makes changelog required', notifyState.uploadChangelog.required && notifyState.changelogReqStar.style.display==='inline' && notifyState.changelogOptTag.style.display==='none');

  notifyState.notifyItemWebhook.checked = false;
  notifyState.notifyGlobalWebhook.checked = true;
  splitCtx.handleNotifyTargetChange();
  check('split notify: checking global webhook alone makes changelog required', notifyState.uploadChangelog.required && notifyState.changelogReqStar.style.display==='inline' && notifyState.changelogOptTag.style.display==='none');

  notifyState.notifyItemWebhook.checked = false;
  notifyState.notifyGlobalWebhook.checked = false;
  splitCtx.handleNotifyTargetChange();
  check('split notify: unchecking both releases changelog requirement', !notifyState.uploadChangelog.required && notifyState.changelogReqStar.style.display==='none' && notifyState.changelogOptTag.style.display==='inline');

  notifyState.notifyItemWebhook.disabled = true;
  notifyState.notifyItemWebhook.checked = true;
  notifyState.notifyGlobalWebhook.checked = false;
  splitCtx.handleNotifyTargetChange();
  check('split notify: disabled target does not trigger required changelog', !notifyState.uploadChangelog.required);

  // 测试 M1: updateUploadNotifyState 区分初始化与切换项目，保留用户选择
  const domElements = {
    uploadNotifyItemCard: {classList:{add(){},remove(){}}, title:''},
    notifyItemWebhook: {disabled:true, checked:false},
    uploadNotifyItemSwitchLabel: {classList:{add(){},remove(){}}},
    uploadNotifyItemStatus: {textContent:''},
    uploadNotifyGlobalCard: {classList:{add(){},remove(){}}, title:''},
    notifyGlobalWebhook: {disabled:true, checked:false},
    uploadNotifyGlobalSwitchLabel: {classList:{add(){},remove(){}}},
    uploadNotifyGlobalStatus: {textContent:''},
    changelogReqStar: {style:{}}, changelogOptTag: {style:{}},
    uploadChangelog: {required:false, placeholder:'', classList:{remove(){}}}
  };
  let selectedOptionWebhook = '1';
  const m1Ctx = {
    SYS_HAS_GLOBAL_WEBHOOK: true,
    document: {getElementById: id => domElements[id] || null},
    $: () => ({length: 1, find: () => ({length: 1, attr: () => selectedOptionWebhook})})
  };
  vm.createContext(m1Ctx);
  vm.runInContext(extract(admin, 'handleNotifyTargetChange'), m1Ctx);
  vm.runInContext(extract(admin, 'updateUploadNotifyState'), m1Ctx);

  // 1. 首次打开弹窗 (isInitial = true)：两个已配置的群均默认勾选
  m1Ctx.updateUploadNotifyState(1, true);
  check('M1: modal initial open enables and checks both configured targets', domElements.notifyItemWebhook.checked && domElements.notifyGlobalWebhook.checked);

  // 2. 用户手动取消评审群
  domElements.notifyGlobalWebhook.checked = false;

  // 3. 切换所属项目 (isInitial = false)：评审群依然保持用户取消状态，绝不重新勾选
  selectedOptionWebhook = '0';
  m1Ctx.updateUploadNotifyState(2, false);
  check('M1: switching project preserves user deselection of global webhook and disables unconfigured item', !domElements.notifyGlobalWebhook.checked && domElements.notifyItemWebhook.disabled && !domElements.notifyItemWebhook.checked);

  // 4. 再次切换到已配置项目：评审群依然保持用户主动取消状态
  selectedOptionWebhook = '1';
  m1Ctx.updateUploadNotifyState(3, false);
  check('M1: switching to configured project still respects user deselection of global webhook', !domElements.notifyGlobalWebhook.checked && domElements.notifyItemWebhook.checked);
  state.onCustomShareExpirePresetChange('custom');check('custom expiry displays labeled required date',!fields.customShareDateGroup.hidden && fields.customShareExpireCustomDate.required && fields.customShareExpireCustomDate.focused);
  state.onCustomShareExpirePresetChange('7d');check('preset expiry hides date and releases validation',fields.customShareDateGroup.hidden && !fields.customShareExpireCustomDate.required && fields.customShareExpireCustomDate.value==='');
  const editFields = {editItemId:{value:'7'},itemType:{value:'project'},btnItemSubmit:{disabled:false},itemCatSelect:{value:'1'},itemName:{value:'Updated'},itemWebhookUrl:{value:'https://hook.example.com'}};
  let submitted;
  const saveContext = {FormData,Promise,parseInt,document:{getElementById:id=>editFields[id]},showToast(){},adminFetch:(action,fd)=>{submitted=fd;return Promise.resolve({success:false});}};
  vm.createContext(saveContext);vm.runInContext(extract(admin,'handleItemSave'),saveContext);
  saveContext.handleItemSave({preventDefault(){}});await Promise.resolve();
  check('basic editor leaves separately managed fields out of submission',submitted.get('name')==='Updated' && !submitted.has('collaborators') && !submitted.has('watermark_enabled') && submitted.get('webhook_url')==='https://hook.example.com');
  check('failed save releases the submit button',!editFields.btnItemSubmit.disabled);
  editFields.itemType.value = 'link';
  saveContext.handleItemSave({preventDefault(){}});await Promise.resolve();
  check('link type submission strictly forces empty webhook_url',submitted.get('webhook_url')==='');
  for (const mode of ['modern','fallback-success','fallback-false','fallback-throw','modern-rejected']) {
    let calls=0, removed=0;const notices=[];
    const context={Promise,navigator:mode==='modern'?{clipboard:{writeText:()=>Promise.resolve()}}:mode==='modern-rejected'?{clipboard:{writeText:()=>Promise.reject(new Error('denied'))}}:{},
      showToast:(message,type)=>notices.push({message,type}),document:{
        createElement:()=>({select(){}}),body:{appendChild(){},removeChild(){removed++;}},
        execCommand:()=>{if(mode==='fallback-throw')throw new Error('denied');return mode==='fallback-success';}
      }};
    vm.createContext(context);vm.runInContext(extract(app,'copyTextToClipboard'),context);
    const result=await context.copyTextToClipboard('https://example.com',()=>calls++);
    const success=['modern','fallback-success'].includes(mode);
    check(mode+' reports only actual clipboard outcome',result===success && calls===(success?1:0) && notices.length===(success?0:1) && (success || notices[0].type==='error'));
    check(mode+' cleans fallback element',removed===(mode==='modern'?0:1));
  }
  let annoOptions=null, trendOptions=null, annoResized=0, trendResized=0;
  const annoDom={},detailDom={innerHTML:''},trendDom={};
  const annoChart={setOption(opt){annoOptions=opt;},resize(){annoResized++;}};
  const trendChart={setOption(opt){trendOptions=opt;},resize(){trendResized++;}};
  const chartCtx={Array,Object,parseInt,Math,esc:value=>String(value),
    echarts:{init:dom=>dom===annoDom?annoChart:trendChart,graphic:{LinearGradient:function(){}}},
    document:{getElementById:id=>({chartAnnotationDonut:annoDom,annoDetailBox:detailDom,chartTrend:trendDom}[id]||null)},
    window:{DASHBOARD_DATA:{annos:[{item_id:1,ver_id:2,status:0},{item_id:1,ver_id:3,status:1},{item_id:4,ver_id:5,status:1}],
      trend7d:{labels:['今日'],dates:['2026-11-06'],values_total:[6],values_viewer:[1],values_editor:[2],values_share:[3]}}},
    chartAnnotationDonut:null,chartTrend:null,currentTrendRange:'7d',currentAnnoProjFilter:0,currentAnnoVerFilter:0};
  vm.createContext(chartCtx);
  for(const name of ['renderAnnotationDashboard','renderDashboardCharts','resizeDashboardCharts']) vm.runInContext(extract(admin,name),chartCtx);
  chartCtx.renderDashboardCharts();
  check('review dashboard counts pending and resolved annotations',annoOptions.series[0].data[0].value===1 && annoOptions.series[0].data[1].value===2 && detailDom.innerHTML.includes('3 条'));
  check('role trend uses separate viewer, manager/editor and share series',JSON.stringify(trendOptions.series.map(x=>x.data))===JSON.stringify([[1],[2],[3]]));
  chartCtx.currentAnnoProjFilter=1;chartCtx.currentAnnoVerFilter=2;chartCtx.renderAnnotationDashboard();
  check('project and version filters narrow the review dashboard',annoOptions.series[0].data.length===1 && annoOptions.series[0].data[0].value===1 && detailDom.innerHTML.includes('1 条'));
  chartCtx.resizeDashboardCharts();
  check('review and trend charts resize on viewport changes',annoResized===1 && trendResized===1);
  chartCtx.window.DASHBOARD_DATA.annos=[];chartCtx.renderAnnotationDashboard();
  check('empty review scope renders a calm empty state',annoOptions.series[0].silent && detailDom.innerHTML.includes('暂无批注待办'));

  let watermarkDrawnText = '';
  const mockCanvas = {
    getContext: () => ({
      rotate() {},
      clearRect() {},
      save() {},
      restore() {},
      translate() {},
      setTransform() {},
      measureText(txt) { return { width: txt.length * 7 }; },
      fillText(txt) { watermarkDrawnText = txt; }
    }),
    toDataURL: () => 'data:image/png;base64,mock'
  };
  const overlayStyle = {};
  const mockOverlay = {
    0: { style: overlayStyle },
    length: 1,
    css: (prop, val) => { overlayStyle[prop] = val; return mockOverlay; },
    show: () => mockOverlay,
    hide: () => mockOverlay,
    is: sel => false
  };
  let wmIntervalFn = null, clearedTimers = 0;
  const wmContext = {
    Date,
    setInterval: fn => { wmIntervalFn = fn; return 123; },
    clearInterval: id => { clearedTimers++; },
    CURRENT_USER: { name: '张工', email: 'zhang@example.com' },
    document: { createElement: tag => tag === 'canvas' ? mockCanvas : {}, hidden: false },
    $: sel => sel === '#watermarkOverlay' ? mockOverlay : { length: 0 },
    workspaceWatermarkCanvas: null,
    workspaceWatermarkTimer: null
  };
  vm.createContext(wmContext);
  wmContext.window = wmContext;
  wmContext.getComputedStyle = () => ({ getPropertyValue: () => 'rgba(100, 116, 139, 0.1)' });
  vm.runInContext(read('watermark.js'), wmContext);
  vm.runInContext(extract(app, 'updateWorkspaceWatermarkImage'), wmContext);
  vm.runInContext(extract(app, 'renderWorkspaceWatermark'), wmContext);
  wmContext.renderWorkspaceWatermark(true);
  check('workspace watermark format matches name@datetime without extraneous separators', /^张工@\d{4}-\d{1,2}-\d{1,2} \d{2}:\d{2}:\d{2}$/.test(watermarkDrawnText));
  check('workspace watermark schedules real-time interval timer', typeof wmIntervalFn === 'function');
  wmContext.renderWorkspaceWatermark(false);
  check('disabling watermark cancels interval timer', clearedTimers === 1);

  const modalsPhp = fs.readFileSync(path.join(__dirname, '../../includes/modals.php'), 'utf8');
  check('company name hint removed from system settings', !modalsPhp.includes('留空显示“立象原型”'));
  check('allowed email domains label combines optional tag and delimiter hint', modalsPhp.includes('选填。多个域名用逗号分隔；留空不限制') && !modalsPhp.includes('line-height:1.5;">多个域名用逗号分隔；留空不限制</div>'));
  check('timezone options provide complete UTC-11 to UTC+12 scale', modalsPhp.includes('UTC-11 (中途岛 / 萨摩亚)') && modalsPhp.includes('UTC+8 (北京时间 / 中国标准时间)') && modalsPhp.includes('UTC+12 (斐济 / 马绍尔群岛 / 堪察加)'));

  console.log(JSON.stringify({passed,scope:'production JS functions with mocked DOM and clipboard'}));
})().catch(e=>{console.error(e);process.exitCode=1;});
