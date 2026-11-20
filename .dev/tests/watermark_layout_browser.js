const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const path = require('path'), fs = require('fs'), assert = require('assert');
const f = JSON.parse(process.env.WATERMARK_FIXTURE), checks = [], errors = [], knownWarnings = [];
function check(name, passed, detail) {
  checks.push({ name, passed: !!passed, detail });
  console.log((passed ? 'PASS ' : 'FAIL ') + name + (detail ? ' ' + JSON.stringify(detail) : ''));
  assert(passed, name);
}
async function verify(page, selector, label) {
  await page.locator(selector).waitFor();
  const before = await page.locator(selector).evaluate(el => ({ image: el.style.backgroundImage,
    size: el.style.backgroundSize, pointer: getComputedStyle(el).pointerEvents }));
  check(label + ' paints a repeating tile and permits pointer events through',
    before.image.startsWith('url("data:image/png') && before.pointer === 'none');
  const pitchOk = await page.locator(selector).evaluate((el, size) => {
    const nextMin = new Date(Date.now() + 60000);
    if (el.id === 'watermarkOverlay' && typeof updateWorkspaceWatermarkImage === 'function') {
      updateWorkspaceWatermarkImage(nextMin);
    } else if (el.id === 'shareWatermarkOverlay' && typeof updateShareWatermarkImage === 'function') {
      updateShareWatermarkImage(nextMin);
    }
    return el.style.backgroundImage !== '' && el.style.backgroundSize === size;
  }, before.size);
  const afterImage = await page.locator(selector).evaluate(el => el.style.backgroundImage);
  check(label + ' refreshes minutes without changing tile pitch',
    pitchOk && afterImage !== before.image);
  const pixels = await page.locator(selector).evaluate(el => {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, img.width, img.height).data;
        const rows = [{ alpha: 0, phase: 0 }, { alpha: 0, phase: 0 }];
        for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
          const a = data[(y * img.width + x) * 4 + 3], r = rows[y < img.height / 2 ? 0 : 1];
          r.alpha += a; r.phase += a * Math.cos(2 * Math.PI * x / img.width);
        }
        resolve(rows.map(r => ({ alpha: r.alpha, phase: r.phase / r.alpha })));
      };
      img.src = el.style.backgroundImage.slice(5, -2);
    });
  });
  check(label + ' pixels show alternating half-pitch rows without losing seam fragments',
    pixels[0].phase < -0.15 && pixels[1].phase > 0.15 &&
    Math.abs(pixels[0].alpha / pixels[1].alpha - 1) < 0.05, pixels);
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const role of ['admin', 'editor', 'viewer', 'guest']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: role === 'admin' ? 2 : 1 });
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      page.on('pageerror', e => errors.push(role + ': ' + e.message));
      page.on('console', m => {
        if (m.type() === 'warning' && m.text() === 'An iframe which has both allow-scripts and allow-same-origin for its sandbox attribute can escape its sandboxing.') {
          // 项目明确采用受信内部原型同源脚本；记录既有浏览器提示。
          knownWarnings.push(role + ': ' + m.text());
        } else if (['error', 'warning'].includes(m.type())) errors.push(role + ': ' + m.text());
      });
      if (role !== 'guest') {
        await page.goto(f.base + '/index.php');
        await page.locator('#adminLoginUser').fill(role + '@test.com');
        await page.locator('#adminLoginPwd').fill(f.password);
        await page.locator('#btnAdminLogin').click(); await page.locator('.user-badge').waitFor();
        await page.locator('#item-node-' + f.item).click();
        await page.frameLocator('#myFrame').locator('#testAction').waitFor();
        check(role + ' workspace identity and nonempty content', /index\.php/.test(page.url()) &&
          (await page.title()).length > 0 && await page.frameLocator('#myFrame').locator('h1').innerText() === '项目概览');
        await verify(page, '#watermarkOverlay', role + ' workspace');
        await page.frameLocator('#myFrame').locator('#testAction').click();
        check(role + ' workspace prototype button is clickable', await page.frameLocator('#myFrame').locator('#testAction').innerText() === '已确认');
        if (role === 'admin') {
          await page.screenshot({ path: path.join(f.output, 'workspace-b.png'), scale: 'css' });
          await page.evaluate(() => { renderWorkspaceWatermark(false); renderWorkspaceWatermark(false); });
          check('workspace disabling clears timer and hides overlay', await page.evaluate(() =>
            workspaceWatermarkTimer === null && getComputedStyle(document.getElementById('watermarkOverlay')).display === 'none'));
          await page.evaluate(() => { renderWorkspaceWatermark(true); renderWorkspaceWatermark(true); });
          await verify(page, '#watermarkOverlay', 'workspace re-enabled');
          const long = await page.evaluate(() => {
            const el = document.getElementById('watermarkOverlay');
            window.CURRENT_USER.name = '张陈王李赵钱孙周吴郑冯朱秦许何吕施孔曹严';
            updateWorkspaceWatermarkImage();
            return { size: el.style.backgroundSize, width: workspaceWatermarkCanvas.width / Math.min(devicePixelRatio, 2) };
          });
          check('long Chinese name expands pitch rather than truncating', long.width > 340, long);
          await verify(page, '#watermarkOverlay', 'long name workspace');
          await page.screenshot({ path: path.join(f.output, 'workspace-long-name.png'), scale: 'css' });
        }
      }
      await page.goto(f.base + '/share.php?s=' + f.share);
      check(role + ' share identity and nonempty content', /share\.php/.test(page.url()) &&
        (await page.title()).includes('方案评审') && await page.frameLocator('#shareFrame').locator('h1').innerText() === '项目概览');
      await verify(page, '#shareWatermarkOverlay', role + ' share');
      await page.frameLocator('#shareFrame').locator('#testAction').click();
      check(role + ' share prototype button is clickable', await page.frameLocator('#shareFrame').locator('#testAction').innerText() === '已确认');
      if (role === 'guest') {
        await page.screenshot({ path: path.join(f.output, 'share-b.png') });
        await page.setViewportSize({ width: 390, height: 844 });
        await verify(page, '#shareWatermarkOverlay', '390px guest share');
        await page.screenshot({ path: path.join(f.output, 'share-b-mobile.png') });
        check('390px share has no horizontal page overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      await context.close();
    }
    check('all pages have no app runtime or console errors', errors.length === 0, errors);
    fs.writeFileSync(path.join(f.output, 'results.json'), JSON.stringify({ checks, errors, knownWarnings }, null, 2));
    console.log(JSON.stringify({ passed: checks.length, knownWarnings: knownWarnings.length,
      browser: await browser.version(), fallback: 'Browser plugin not available' }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
