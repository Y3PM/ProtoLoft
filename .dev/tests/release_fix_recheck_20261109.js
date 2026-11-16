/* Browser recheck: inspect adverse paths beyond the original happy-path probes. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const fixture=JSON.parse(process.env.RELEASE_RECHECK_FIXTURE);
const path=require('path'),fs=require('fs');
const output=path.resolve(__dirname,'../screenshots/release-fix-recheck-20261109');
fs.mkdirSync(output,{recursive:true});
const observations=[];
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Singapore'});
  context.setDefaultTimeout(10000);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(fixture.base+'/index.php');
  await page.locator('#adminLoginUser').fill('editor@test.com');
  await page.locator('#adminLoginPwd').fill(fixture.password);
  await page.locator('#btnAdminLogin').click();
  await page.locator('.user-badge').waitFor();
  await page.locator('#item-node-'+fixture.item).click();
  const topBefore=await page.locator('#barTime').innerText();
  await page.locator('#barBtnVerManage').click();
  await page.evaluate(id=>openEditVersionModal(id),fixture.v1);
  await page.locator('#editVerName').fill('V1-renamed');
  await page.locator('#editVerChangelog').fill('Only V1 changed');
  await page.locator('#btnSaveVerEdit').click();
  await page.locator('#versionEditModal').waitFor({state:'hidden'});
  await page.locator('#versionManageModal').getByTitle('关闭',{exact:true}).click();
  await page.locator('#barChangelogBtn').click();
  observations.push({id:'F4_non_current_version_edit',selected_version:await page.locator('#barVerSelect option:checked').innerText(),
    active_log:await page.locator('#topChangelogBody').innerText(),passed:(await page.locator('#topChangelogBody').innerText())==='V2 原始说明'});
  await page.locator('#barChangelogBtn').click();
  await page.locator('#barBtnVerManage').click();
  const card=page.locator('#ver-row-'+fixture.v2);
  const timeBefore=await page.evaluate(({item,id})=>$('#item-node-'+item).data('versions').find(v=>Number(v.id)===id).updated_at,{item:fixture.item,id:fixture.v2});
  await card.getByTitle('移除此版本的 RP 底稿',{exact:true}).click();
  await page.getByRole('button',{name:'移除底稿',exact:true}).click();
  await card.getByTitle('为此版本补传 Axure RP 底稿',{exact:true}).waitFor();
  const timeAfter=await page.evaluate(({item,id})=>$('#item-node-'+item).data('versions').find(v=>Number(v.id)===id).updated_at,{item:fixture.item,id:fixture.v2});
  observations.push({id:'F1_rp_update_local_time',before:timeBefore,after:timeAfter,topBefore,
    delta_seconds:(Date.parse(timeAfter.replace(' ','T')+'Z')-Date.parse(timeBefore.replace(' ','T')+'Z'))/1000});
  await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
  await page.screenshot({path:path.join(output,'rp-time-shift.png')});
  await page.goto(fixture.base+'/index.php?review=link#item='+fixture.link);
  await page.waitForFunction(id=>Number(currentSelectedItemId)===id,fixture.link);
  const linkAuthorBefore=await page.locator('#barTime').innerText();
  await page.locator('.user-badge').click();
  await page.locator('#myDisplayName').fill('改名后的负责人');
  await page.locator('#btnSaveProfile').click();
  await page.waitForFunction(()=>CURRENT_USER.name==='改名后的负责人');
  await page.locator('#profileModal .close-x').click();
  observations.push({id:'F5_link_owner_name_sync',before:linkAuthorBefore,after:await page.locator('#barTime').innerText(),expected:'改名后的负责人'});

  const guestContext=await browser.newContext({viewport:{width:1280,height:800},timezoneId:'Asia/Singapore'});
  const guest=await guestContext.newPage();
  guest.on('pageerror',error=>errors.push(error.message));
  await guest.addInitScript(()=>{
   window.copyWrites=[];
   Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>window.copyWrites.push(text)}});
  });
  await guest.goto(fixture.base+'/share.php?s='+fixture.pinned+'#annotation='+fixture.a2);
  await guest.locator('#annoCard_'+fixture.a2+'.anno-focus').waitFor();
  await guest.locator('#shareFrame').evaluate(node=>new Promise(resolve=>{
   if(node.contentDocument?.readyState==='complete')resolve();else node.addEventListener('load',resolve,{once:true});
  }));
  observations.push({id:'F8_shared_annotation_page',expected_page:'page1.html',actual_page:await guest.locator('#shareFrame').getAttribute('src'),
    focused_card:await guest.locator('#annoCard_'+fixture.a2+'.anno-focus').isVisible()});
  await guest.locator('#annoCard_'+fixture.a2).getByRole('button',{name:'复制链接',exact:true}).click();
  await guest.waitForFunction(()=>window.copyWrites.length===1);
  const copied=await guest.evaluate(()=>window.copyWrites[0]);
  observations.push({id:'F8_copy_preserves_authorization',copied_path:new URL(copied).pathname,code_preserved:new URL(copied).searchParams.get('s')===fixture.pinned,
    annotation_preserved:new URL(copied).hash==='#annotation='+fixture.a2});
  await guest.screenshot({path:path.join(output,'share-wrong-page.png')});
  await guest.goto(fixture.base+'/share.php?s='+fixture.pinned+'#annotation='+fixture.a1);
  await guest.locator('#annotationDrawer').waitFor({state:'visible'});
  await guest.locator('#annoCard_'+fixture.a2).waitFor();
  const denied=await guest.request.get(fixture.base+'/api.php?action=annotation_target&id='+fixture.a1);
  observations.push({id:'share_cross_version_scope',old_card_absent:await guest.locator('#annoCard_'+fixture.a1).count()===0,
    old_annotation_denied:!(await denied.json()).success});
  await guest.goto(fixture.base+'/share.php?s='+fixture.protected+'#annotation='+fixture.a2);
  observations.push({id:'share_password_gate',password_required:await guest.locator('[name="project_password"]').isVisible(),
    prototype_frame_absent:await guest.locator('#shareFrame').count()===0});
  console.log(JSON.stringify({browser_recheck_observations:observations,errors},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
