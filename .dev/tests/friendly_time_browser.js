const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require('assert');
const path = require('path');
const fixture = JSON.parse(process.env.FRIENDLY_TIME_FIXTURE);

let passed = 0;
function check(label, cond) {
    assert(cond, 'FAILED: ' + label);
    passed++;
    console.log('PASS ' + label);
}

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));
        page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

        // 1. Login and check workspace topbar friendly time & tooltip flipping downward
        await page.goto(fixture.base + '/index.php');
        await page.locator('#adminLoginUser').fill('admin@test.com');
        await page.locator('#adminLoginPwd').fill(fixture.password);
        await page.locator('#btnAdminLogin').click();
        await page.locator('.user-badge').waitFor();

        const barTimeEl = page.locator('#barTime time.friendly-time');
        await barTimeEl.waitFor({ state: 'visible' });
        const barTimeText = (await barTimeEl.textContent()).trim();
        const barExact = await barTimeEl.getAttribute('data-exact-time');
        check('workspace topbar renders friendly updated time', /刚刚更新|分钟前更新/.test(barTimeText) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(barExact));

        await barTimeEl.hover();
        const tip = page.locator('#plExactTimeTooltip');
        await tip.waitFor({ state: 'visible' });
        const tipInfo = await page.evaluate(() => {
            const target = document.querySelector('#barTime time.friendly-time').getBoundingClientRect();
            const pop = document.getElementById('plExactTimeTooltip').getBoundingClientRect();
            return {
                text: document.getElementById('plExactTimeTooltip').textContent.trim(),
                belowTarget: pop.top >= target.bottom - 1,
                inViewport: pop.top >= 8 && pop.left >= 8 && pop.right <= window.innerWidth - 8
            };
        });
        check('topbar exact-time tooltip flips below trigger cleanly', tipInfo.text === barExact && tipInfo.belowTarget && tipInfo.inViewport);
        await page.screenshot({ path: path.join(fixture.shotDir, '01-workspace-topbar-time-hover.png') });

        // 2. Open annotation drawer and check card time + exact-time tooltip within viewport
        await page.locator('#btnToggleAnnotation').click();
        await page.locator('#annoFilterAllPages').click();
        const annoTime = page.locator('.anno-card-time time.friendly-time').first();
        await annoTime.waitFor({ state: 'visible' });
        const annoText = (await annoTime.textContent()).trim();
        const annoExact = await annoTime.getAttribute('data-exact-time');
        check('annotation card renders friendly time with exact timestamp', /刚刚|分钟前/.test(annoText) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(annoExact));
        await annoTime.hover();
        await tip.waitFor({ state: 'visible' });
        const annoTipRect = await tip.evaluate(el => {
            const r = el.getBoundingClientRect();
            return { text: el.textContent.trim(), inViewport: r.left >= 8 && r.right <= window.innerWidth - 8 && r.top >= 8 };
        });
        check('annotation exact-time tooltip matches and stays inside viewport', annoTipRect.text === annoExact && annoTipRect.inViewport);
        await page.evaluate(() => toggleAnnotationDrawer(false));

        // 3. Open version manage modal and check version card friendly time
        await page.evaluate(id => openVersionManageModal(id), fixture.itemId);
        const verTime = page.locator('.ver-card-time time.friendly-time').first();
        await verTime.waitFor({ state: 'visible' });
        const verText = (await verTime.textContent()).trim();
        const verExact = await verTime.getAttribute('data-exact-time');
        check('version card renders friendly time and exact tooltip', /刚刚|分钟前/.test(verText) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(verExact));
        await verTime.hover();
        await tip.waitFor({ state: 'visible' });
        check('version card tooltip shows exact timestamp', (await tip.textContent()).trim() === verExact);
        await page.screenshot({ path: path.join(fixture.shotDir, '02-version-card-time-hover.png') });
        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
        if (await page.locator('#verManageModal').isVisible()) {
            await page.locator('#verManageModal .close-x').click();
        }

        // 4. Open admin console: check dashboard recent upload, active member date-only, pending application
        await page.evaluate(() => openAdminConsole('dashboard'));
        await page.locator('#panel-dashboard.active').waitFor();
        const dashTime = page.locator('.recent-upload-row .upload-time time.friendly-time').first();
        await dashTime.waitFor({ state: 'visible' });
        check('dashboard recent upload renders friendly time with exact timestamp', /刚刚|分钟前/.test((await dashTime.textContent()).trim()) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(await dashTime.getAttribute('data-exact-time')));

        await page.locator('#nav-users').click();
        await page.locator('#panel-users.active').waitFor();
        await page.locator('#subtab-btn-pending-users').click();
        const pendingTime = page.locator('#pendingUsersTbody time.friendly-time').first();
        await pendingTime.waitFor({ state: 'visible' });
        const pendingText = (await pendingTime.textContent()).trim();
        const pendingExact = await pendingTime.getAttribute('data-exact-time');
        check('pending application renders friendly time with exact tooltip', /刚刚|分钟前/.test(pendingText) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(pendingExact));
        await pendingTime.hover();
        await tip.waitFor({ state: 'visible' });
        check('pending application tooltip matches exact timestamp', (await tip.textContent()).trim() === pendingExact);
        await page.screenshot({ path: path.join(fixture.shotDir, '03-pending-users-time-hover.png') });

        await page.locator('#subtab-btn-active-users').click();
        const memberTime = page.locator('#userTableBody time.friendly-time').first();
        await memberTime.waitFor({ state: 'visible' });
        const memberText = (await memberTime.textContent()).trim();
        const memberExact = await memberTime.getAttribute('data-exact-time');
        check('active member joined time renders YYYY-MM-DD with full exact tooltip', /^\d{4}-\d{2}-\d{2}$/.test(memberText) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(memberExact));

        // 5. Verify share sandbox topbar friendly time & tooltip
        const sharePage = await context.newPage();
        sharePage.on('pageerror', err => errors.push('share: ' + err.message));
        sharePage.on('console', msg => { if (msg.type() === 'error') errors.push('share: ' + msg.text()); });
        await sharePage.goto(fixture.base + '/share.php?s=' + encodeURIComponent(fixture.shareCode));
        const shareTime = sharePage.locator('#shareUpdateTime time.friendly-time');
        await shareTime.waitFor({ state: 'visible' });
        const shareText = (await shareTime.textContent()).trim();
        const shareExact = await shareTime.getAttribute('data-exact-time');
        check('share topbar renders friendly updated time', /刚刚更新|分钟前更新/.test(shareText) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(shareExact));
        await shareTime.hover();
        await sharePage.locator('#plExactTimeTooltip').waitFor({ state: 'visible' });
        check('share topbar tooltip matches exact timestamp', (await sharePage.locator('#plExactTimeTooltip').textContent()).trim() === shareExact);
        await sharePage.screenshot({ path: path.join(fixture.shotDir, '04-share-topbar-time-hover.png') });
        await sharePage.close();

        check('zero console or page errors', errors.length === 0);
        console.log(JSON.stringify({ passed, scope: 'friendly time browser verification across all 7 UI surfaces' }));
    } finally {
        await browser.close();
    }
})();
