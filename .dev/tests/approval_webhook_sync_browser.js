/* Real UI/HTTP: member saves must update approval recipient status without reload. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const assert=require('assert');
const path=require('path');
const fixture=JSON.parse(process.env.APPROVAL_SYNC_FIXTURE);
let passed=0;
function check(label,value){assert(value,label);passed++;console.log('PASS '+label);}
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  context.setDefaultTimeout(10000);
  function observe(target){target.on('pageerror',error=>errors.push(error.message));target.on('console',message=>{if(message.type()==='error')errors.push(message.text());});}
  async function login(target,email){
   await target.goto(fixture.base+'/index.php');
   await target.locator('#adminLoginUser').fill(email);
   await target.locator('#adminLoginPwd').fill(fixture.password);
   await target.locator('#btnAdminLogin').click();
   await target.locator('.user-badge').waitFor();
  }
  observe(page);
  let navigations=0,settingsWrites=0,holdLists=false,releaseLists=[];
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  page.on('request',request=>{if((request.postData()||'').includes('save_settings'))settingsWrites++;});
  await page.route('**/api.php?action=user_list',async route=>{
   if(holdLists)await new Promise(resolve=>releaseLists.push(resolve));
   await route.continue();
  });
  await login(page,'admin@test.com');
  await page.locator('button[title="控制中心"]').click();
  async function recipients(){
   await page.locator('#nav-brand').click();
   await page.locator('#adminMultiSelectTrigger').scrollIntoViewIfNeeded();
   if(!await page.locator('#adminMultiSelectMenu').isVisible())await page.locator('#adminMultiSelectTrigger').click();
  }
  const option=id=>page.locator('#adminMultiSelectOptions label').filter({has:page.locator('input[value="'+id+'"]')});
  const status=id=>option(id).locator('[data-admin-webhook-status]');
  const chosen=()=>page.locator('input[name="visitor_notify_admin_ids[]"]:checked').evaluateAll(nodes=>nodes.map(node=>node.value).sort());
  const responseFor=action=>page.waitForResponse(response=>response.request().method()==='POST' && (response.request().postData()||'').includes(action));
  await recipients();
  check('初始未配置状态与页面内容正确',page.url().startsWith(fixture.base) && (await page.title()).includes('立象') && (await status(fixture.other).innerText()).includes('未配置机器人'));
  const saving=responseFor('save_settings');
  await option(fixture.other).locator('input').uncheck();
  check('通知名单初始选择保存成功',(await (await saving).json()).success);
  const selected=JSON.stringify(await chosen()),savedWrites=settingsWrites,initialNavigations=navigations;
  async function edit(id,url,delayRefresh=false,email=null){
   await page.locator('#nav-users').click();
   await page.waitForFunction(id=>cachedUsersMap[id],id);
   await page.locator('#userTableBody button[onclick="openEditUserModal('+id+')"]').click();
   await page.locator('#editUserWebhook').fill(url);
   if(email!==null)await page.locator('#editUserEmail').fill(email);
   if(delayRefresh)holdLists=true;
   const response=responseFor('user_update');
   await page.locator('#btnUserUpdateSubmit').click();
   const result=await (await response).json();
   if(result.success)await page.locator('#editUserModal').waitFor({state:'hidden'});
   return result;
  }
  const valid='https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=synthetic-sync';
  check('成员管理保存其他管理员 Webhook 成功',(await edit(fixture.other,valid,true)).success);
  await recipients();
  check('成员列表刷新尚未完成时，已配置标识已同步',holdLists && await status(fixture.other).locator('.ri-robot-line').isVisible());
  check('添加 Webhook 不改变通知人勾选',JSON.stringify(await chosen())===selected);
  await page.screenshot({path:path.join(fixture.artifacts,'configured-without-reload.png')});
  holdLists=false;releaseLists.splice(0).forEach(release=>release());
  await page.waitForFunction(({id,url})=>cachedUsersMap[id].webhook_url===url,{id:fixture.other,url:valid});
  check('成员管理清除其他管理员 Webhook 成功',(await edit(fixture.other,'')).success);
  await recipients();
  check('清除后立即恢复未配置状态',(await status(fixture.other).innerText()).includes('未配置机器人') && await status(fixture.other).locator('.ri-robot-line').count()===0);
  check('成员资料冲突被服务端拒绝',!(await edit(fixture.other,valid,false,'admin@test.com')).success);
  await page.locator('#editUserModal button[title="关闭"]').click();
  await recipients();
  check('保存失败不伪造已配置状态',(await status(fixture.other).innerText()).includes('未配置机器人'));
  check('成员管理保存本人 Webhook 成功',(await edit(fixture.owner,valid)).success);
  await recipients();
  check('本人状态立即同步',await status(fixture.owner).locator('.ri-robot-line').isVisible());
  check('成员管理清除本人 Webhook 成功',(await edit(fixture.owner,'')).success);
  await recipients();
  check('本人清除后状态立即同步',(await status(fixture.owner).innerText()).includes('未配置机器人'));
  async function profileWebhook(target,value){
   await target.evaluate(()=>openProfileModal());
   await target.locator('#myWebhookUrl').fill(value);
   const response=target.waitForResponse(response=>response.request().method()==='POST' && (response.request().postData()||'').includes('profile_update_webhook'));
   await target.locator('#btnSaveProfileWebhook').click();
   const result=await (await response).json();
   await target.waitForFunction(value=>CURRENT_USER.webhook_url===value,value);
   await target.locator('#profileModal button[title="关闭"]').click();
   return result;
  }
  check('个人通知入口保存成功',(await profileWebhook(page,valid)).success);
  await recipients();
  check('个人通知入口也同步审批下拉状态',await status(fixture.owner).locator('.ri-robot-line').isVisible());
  check('个人通知入口清除成功',(await profileWebhook(page,'')).success);
  await recipients();
  check('个人通知清除后恢复未配置状态',(await status(fixture.owner).innerText()).includes('未配置机器人'));
  check('所有状态同步均保留勾选且不触发设置自动保存',JSON.stringify(await chosen())===selected && settingsWrites===savedWrites);
  check('整个切换和保存过程未刷新页面',navigations===initialNavigations);
  await page.screenshot({path:path.join(fixture.artifacts,'cleared-without-reload.png')});
  for(const role of ['editor','viewer']){
   const roleContext=await browser.newContext(),rolePage=await roleContext.newPage();
   roleContext.setDefaultTimeout(10000);observe(rolePage);
   await login(rolePage,role+'-sync@test.com');
   check(role+' 未获得管理员编辑表单',await rolePage.locator('#editUserModal').count()===0);
   check(role+' 个人通知仍可保存且没有缺失函数错误',(await profileWebhook(rolePage,valid)).success);
   await roleContext.close();
  }
  check('没有应用脚本异常',errors.length===0);
  console.log(JSON.stringify({passed,errors,viewports:['1440x1000'],scope:'temporary real Chrome and HTTP; member/profile Webhook status sync'}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
