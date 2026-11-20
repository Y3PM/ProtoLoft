/* Execute the production renderer: guards against restoring only the modal shell. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert');
const root=path.resolve(__dirname,'../..');
const admin=fs.readFileSync(path.join(root,'assets/js/admin.js'),'utf8');
const app=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
const extract=(source,name)=>{const start=source.indexOf('function '+name+'(');assert(start>=0,name);return source.slice(start,source.indexOf('\n}',start)+2);};
let passed=0;
const check=(name,condition)=>{assert(condition,name);passed++;console.log('PASS '+name);};
const records=Array.from({length:12},(_,i)=>({id:i+1,version_name:'V'+(i+1),is_default:i===0?1:0,
 created_by:i===1?99:7,creator_name:i===1?'李明':'王华',created_at:'2026-11-07 12:00:00',
 file_size:1024,rp_file:i===0?'available':'',rp_size:i===0?42:0,changelog:i===2?'修复权限边界':'常规修订'}));
const nodes={};
const $=selector=>nodes[selector]||(nodes[selector]={value:'',visible:false,empty(){this.value='';return this;},append(value){this.value+=value;return this;},text(value){this.value=value;return this;},html(value){this.value=value;return this;},show(){this.visible=true;return this;},hide(){this.visible=false;return this;}});
const c={$,Math,parseInt,String,formatBytes:value=>value+' B',CURRENT_USER:{id:7,role:'admin'},
 currentVerManageItemId:20,currentVerManageCanEdit:true,currentVerManageAllVersions:records,
 currentVerManageFilteredVersions:[],currentVerManageSearchKeyword:'',currentVerManagePage:1,VER_MANAGE_PAGE_SIZE:10};
vm.createContext(c);vm.runInContext(extract(app,'esc'),c);vm.runInContext(extract(admin,'renderVersionManageView'),c);
const render=()=>{c.renderVersionManageView();return nodes['#verManageTableBody'].value;};
let html=render();
check('production renderer produces ten cards on the first page',(html.match(/class="ver-card /g)||[]).length===10);
check('card container is not populated with legacy table rows',!/<\/?(?:tr|td)\b/.test(html));
check('default version has a protected delete action',/disabled title="默认版本受保护/.test(html));
check('RP actions remain inside the RP asset group',html.includes('ver-asset-rp') && html.includes('triggerRpUploadForVersion(1, 20, true)') && html.includes('handleRemoveRp(1, 20)'));
check('other versions retain upload and set-default actions',html.includes('triggerRpUploadForVersion(2, 20, false)') && html.includes('handleSetDefaultVersion(2, 20)'));
check('cards consume shared controls without inline component styles',html.includes('btn-cancel btn-sm') && html.includes('m-badge m-badge-success') && !html.includes('style='));
check('pagination targets the existing modal container',nodes['#verPaginationBtns'].value.includes('title="下一页"') && !nodes['#verPaginationNav']);
c.currentVerManagePage=2;html=render();
check('second page contains the remaining versions',(html.match(/class="ver-card /g)||[]).length===2 && html.includes('V12'));
c.currentVerManageSearchKeyword='李明';html=render();
check('author search resets an out-of-range page',html.includes('V2') && !html.includes('V12') && c.currentVerManagePage===1);
c.currentVerManageSearchKeyword='权限边界';html=render();
check('changelog search preserves the matching card',html.includes('V3') && (html.match(/class="ver-card /g)||[]).length===1);
c.currentVerManageSearchKeyword='missing-record';render();
check('unmatched search retains the clear-filter empty state',nodes['#verManageEmpty'].value.includes('清空筛选') && !nodes['#verManageTable'].visible);
c.currentVerManageAllVersions=[{...records[0],version_name:'<img src=x onerror=alert(1)>',creator_name:'<svg>',changelog:'</div><script>alert(1)</script>'}];
c.currentVerManageSearchKeyword='';html=render();
check('name, author and changelog remain escaped text',html.includes('&lt;img') && html.includes('&lt;svg') && html.includes('&lt;script') && !/<(?:img|svg|script)\b/.test(html));
c.currentVerManageAllVersions=records;c.currentVerManageCanEdit=false;c.CURRENT_USER={id:33,role:'editor'};html=render();
check('non-owner reader receives no mutation handler',!html.includes('onclick="handleDeleteVersion') && !html.includes('onclick="triggerRpUploadForVersion') && !html.includes('onclick="handleSetDefaultVersion'));
c.currentVerManageCanEdit=true;c.CURRENT_USER={id:7,role:'editor'};html=render();
check('project collaborator cannot delete another publisher version',!html.includes('handleDeleteVersion(2,') && html.includes('handleDeleteVersion(3,'));
check('project collaborator cannot replace another publisher RP',!html.includes('triggerRpUploadForVersion(2,') && !html.includes('handleRemoveRp(2,'));
c.currentVerManageAllVersions=[];render();
check('unpublished project retains the first-publish path',nodes['#verManageEmpty'].value.includes('quickOpenUploadFromVersionManage()') && !nodes['#verManagePagination'].visible);
console.log(JSON.stringify({passed,scope:'production version renderer with controlled view state'}));
