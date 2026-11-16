/* Real Chrome/HTTP observations; robot transport is intercepted in the test copy. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const fs = require('fs'), path = require('path'), assert = require('assert');
const f = JSON.parse(process.env.PRERELEASE_RECHECK_FIXTURE);
const checks = [], errors = [];
function record(name, passed, detail = {}) {
  checks.push({ name, passed: !!passed, detail });
  console.log((passed ? 'PASS ' : 'FAIL ') + name + ': ' + JSON.stringify(detail));
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Network observation timed out')), 10000);
  })]); } finally { clearTimeout(timer); }
}

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(f.base + '/index.php');
    await page.locator('#adminLoginUser').fill('admin@test.com');
    await page.locator('#adminLoginPwd').fill(f.password);
    await page.locator('#btnAdminLogin').click();
    await page.locator('.user-badge').waitFor();
    record('workbench has expected page identity and real content',
      (await page.title()).includes('深度修复审查') && (await page.locator('body').innerText()).length > 100);

    await page.evaluate(id => openShareModal(id), f.item);
    await page.locator('#shareManageModal').waitFor({ state: 'visible' });
    const started = deferred(), gate = deferred(), delivered = deferred();
    let revokeRequests = 0;
    await page.route('**/api.php', async route => {
      if (!(route.request().postData() || '').includes('share_code_revoke')) return route.continue();
      revokeRequests++;
      const response = await route.fetch();
      started.resolve();
      await gate.promise;
      await route.fulfill({ response });
      delivered.resolve();
    });
    const revokeButton = code => page.locator('[data-share-row]').filter({ hasText: 's=' + code }).locator('button[title="作废吊销此专属短链"]');
    await revokeButton(f.codes[0]).click();
    await page.locator('#btnCustomConfirmOk').click();
    await bounded(started.promise);
    await revokeButton(f.codes[1]).click();
    await page.locator('#btnCustomConfirmOk').click();
    gate.resolve();
    await bounded(delivered.promise);
    await page.waitForFunction(() => !Object.keys(_pendingRequests).some(key => key.startsWith('share_code_revoke:')));
    await page.waitForTimeout(100);
    const active = await page.evaluate(async id => (await (await fetch('api.php?action=item_get_share&id=' + id)).json()).data.active_shares.map(s => s.code), f.item);
    const toasts = await page.locator('.toast-content').allTextContents();
    record('two distinct share revocations send two requests', revokeRequests === 2, { revokeRequests, activeCodes: active, toasts });
    await page.screenshot({ path: path.join(f.output, 'revoke-second-link-remains.png') });
    await page.unroute('**/api.php');
    await page.evaluate(() => closeModal('shareManageModal'));

    // Hold real upload traffic, verify all three close paths and honest busy feedback.
    const uploadStarted = deferred(), uploadGate = deferred();
    await page.route('**/api.php', async route => {
      if (!(route.request().postData() || '').includes('upload_chunk')) return route.continue();
      uploadStarted.resolve();
      await uploadGate.promise;
      await route.continue();
    });
    await page.evaluate(id => openUploadModal(id), f.item);
    await page.locator('#uploadZipFile').setInputFiles({ name: 'review.zip', mimeType: 'application/zip', buffer: Buffer.from(f.zip) });
    await page.locator('#uploadVerName').fill('V2');
    await page.locator('#btnUploadSubmit').click();
    await bounded(uploadStarted.promise);
    const closers = [
      () => page.locator('#uploadModal .close-x').click(),
      () => page.locator('#uploadModal button[onclick="closeModal(\'uploadModal\')"]').filter({ hasText: '取消' }).click(),
      () => page.keyboard.press('Escape')
    ];
    for (let i = 0; i < closers.length; i++) {
      await closers[i]();
      await page.locator('#customConfirmModal').waitFor({ state: 'visible' });
      record('busy upload close path ' + i + ' requires honest confirmation',
        (await page.locator('#customConfirmMessage').innerText()).includes('不会中断'));
      await page.locator('#btnCustomConfirmCancel').click();
      assert(await page.locator('#uploadModal').isVisible());
    }
    await page.evaluate(() => handleVersionUpload({ preventDefault() {} }));
    record('busy duplicate upload provides feedback',
      (await page.locator('body').innerText()).includes('发布任务进行中，请稍候'));
    await page.locator('#uploadModal .close-x').click();
    await page.locator('#btnCustomConfirmOk').click();
    record('confirmed close hides modal while upload remains busy',
      !(await page.locator('#uploadModal').isVisible()) && await page.evaluate(() => versionUploadBusy));
    uploadGate.resolve();
    await page.waitForResponse(response => (response.request().postData() || '').includes('version_publish'));
    await page.waitForFunction(() => versionUploadBusy === false);
    await page.unroute('**/api.php');

    if (f.logo) {
      const svgPage = await context.newPage();
      await svgPage.goto(f.base + '/' + f.logo);
      const executed = await svgPage.locator('svg').getAttribute('data-review-executed');
      record('uploaded SVG does not execute a namespaced script on direct access', executed !== 'yes', { executed });
      await svgPage.screenshot({ path: path.join(f.output, 'svg-script-executed.png') });
      await svgPage.close();
    } else {
      record('uploaded SVG does not execute a namespaced script on direct access', true, { rejected: true });
    }

    const viewer = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const viewerPage = await viewer.newPage();
    viewerPage.on('pageerror', error => errors.push(error.message));
    await viewerPage.goto(f.base + '/index.php');
    await viewerPage.locator('#adminLoginUser').fill('viewer@test.com');
    await viewerPage.locator('#adminLoginPwd').fill(f.password);
    await viewerPage.locator('#btnAdminLogin').click();
    await viewerPage.locator('.user-badge').waitFor();
    // The landing card is reached through a saved project route; a direct tree
    // click intentionally opens _blank links in another tab instead.
    await viewerPage.goto(f.base + '/index.php#item=' + f.link);
    await viewerPage.reload();
    await viewerPage.locator('.btn-copy-link').click();
    await viewerPage.waitForFunction(() => document.body.innerText.includes('链接已复制'));
    const copied = await viewerPage.evaluate(() => navigator.clipboard.readText());
    record('viewer copies external link without loading share or admin scripts', copied === 'https://example.invalid/review' &&
      await viewerPage.evaluate(() => !Array.from(document.scripts).some(s => /\/(share|admin)\.js/.test(s.src))), { copied });
    await viewerPage.screenshot({ path: path.join(f.output, 'viewer-copy-fixed.png') });
    record('application JavaScript has no runtime errors', errors.length === 0, errors);
    fs.writeFileSync(path.join(f.output, 'browser.json'), JSON.stringify({ checks, errors, viewport: '1440x1000', browser: browser.version() }, null, 2));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
