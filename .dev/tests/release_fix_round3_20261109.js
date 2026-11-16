/* Default share navigation is distinct from an annotation deep link. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const fixture=JSON.parse(process.env.RELEASE_ROUND3_FIXTURE);
const path=require('path'),fs=require('fs');
const output=path.resolve(__dirname,'../screenshots/release-fix-round3-20261109');
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const observations=[],errors=[];
  const guestContext=await browser.newContext({viewport:{width:1280,height:800}});
  const guest=await guestContext.newPage();
  guest.on('pageerror',error=>errors.push(error.message));
  await guest.goto(fixture.base+'/share.php?s='+fixture.code);
  await guest.locator('#shareFrame').waitFor();
  const guestSrc=await guest.locator('#shareFrame').getAttribute('src');
  const guestResponse=await guestContext.request.get(new URL(guestSrc,fixture.base).href);
  const correctResponse=await guestContext.request.get(fixture.base+'/asset.php/v'+fixture.versions[1]+'/index.html');
  observations.push({id:'plain_guest_share',iframe_src:guestSrc,iframe_http:guestResponse.status(),
    actual_asset_http:correctResponse.status(),actual_asset_contains_prototype:(await correctResponse.text()).includes('Proto Home')});
  await guest.screenshot({path:path.join(output,'default-share-empty.png')});
  const ownerContext=await browser.newContext({viewport:{width:1440,height:1000}});
  const owner=await ownerContext.newPage();
  owner.on('pageerror',error=>errors.push(error.message));
  await owner.goto(fixture.base+'/index.php');
  await owner.locator('#adminLoginUser').fill('admin@test.com');
  await owner.locator('#adminLoginPwd').fill(fixture.password);
  await owner.locator('#btnAdminLogin').click();
  await owner.locator('.user-badge').waitFor();
  await owner.goto(fixture.base+'/share.php?s='+fixture.code);
  const initialSrc=await owner.locator('#shareFrame').getAttribute('src');
  const initial=await ownerContext.request.get(new URL(initialSrc,fixture.base).href);
  await owner.locator('#shareVerSelect').selectOption({index:1});
  const changedSrc=await owner.locator('#shareFrame').getAttribute('src');
  const changed=await ownerContext.request.get(new URL(changedSrc,fixture.base).href);
  observations.push({id:'manager_share_version_switch',initial_src:initialSrc,initial_http:initial.status(),changed_src:changedSrc,changed_http:changed.status()});
  console.log(JSON.stringify({round3_browser_observations:observations,errors},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
