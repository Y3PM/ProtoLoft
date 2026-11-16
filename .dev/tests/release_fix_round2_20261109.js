/* Only synthetic HTML: exercise URL fragments and out-of-order target responses. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const fixture=JSON.parse(process.env.RELEASE_ROUND2_FIXTURE);
const path=require('path'),fs=require('fs');
const output=path.resolve(__dirname,'../screenshots/release-fix-round2-20261109');
fs.mkdirSync(output,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:800},timezoneId:'Asia/Singapore'});
  context.setDefaultTimeout(10000);
  const page=await context.newPage(),observations=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  async function capture(name){
   await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
   await page.screenshot({path:path.join(output,name)});
  }
  await page.goto(fixture.base+'/share.php?s='+fixture.code+'#annotation='+fixture.annos[0]);
  await page.locator('#annoCard_'+fixture.annos[0]+'.anno-focus').waitFor();
  const actualHash=await page.locator('#shareFrame').evaluate(node=>node.contentWindow.location.hash);
  observations.push({id:'shared_same_file_fragment',expected:'#p=details',actual:actualHash,focused_card:true});
  await capture('fragment-not-followed.png');

  let releaseOld,oldFetched;
  const held=new Promise(resolve=>{releaseOld=resolve;});
  const arrived=new Promise(resolve=>{oldFetched=resolve;});
  await page.route('**/api.php?action=annotation_target*',async route=>{
   const id=new URL(route.request().url()).searchParams.get('id');
   const response=await route.fetch();
   if(id===String(fixture.annos[1])) {oldFetched();await held;}
   await route.fulfill({response});
  });
  await page.evaluate(id=>{location.hash='annotation='+id;},fixture.annos[1]);
  await arrived;
  await page.evaluate(id=>{location.hash='annotation='+id;},fixture.annos[2]);
  await page.waitForFunction(()=>document.getElementById('shareFrame').getAttribute('src').includes('/page2.html'));
  const latest=await page.locator('#shareFrame').getAttribute('src');
  const staleResponse=page.waitForResponse(response=>response.url().includes('action=annotation_target&id='+fixture.annos[1]));
  releaseOld();
  await staleResponse;
  await page.waitForTimeout(300);
  observations.push({id:'shared_out_of_order_navigation',expected_annotation:fixture.annos[2],actual_hash:await page.evaluate(()=>location.hash),
    latest_target_before_old_response:latest,actual_frame_after_old_response:await page.locator('#shareFrame').getAttribute('src')});
  await capture('stale-response-navigation.png');
  console.log(JSON.stringify({round2_browser_observations:observations,errors},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
