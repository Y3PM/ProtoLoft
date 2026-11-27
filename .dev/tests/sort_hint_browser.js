const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require('assert');
const path = require('path');
const fixture = JSON.parse(process.env.SORT_HINT_FIXTURE);

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

        await page.goto(fixture.base + '/index.php');
        await page.locator('#adminLoginUser').fill('admin@test.com');
        await page.locator('#adminLoginPwd').fill(fixture.password);
        await page.locator('#btnAdminLogin').click();
        await page.locator('.user-badge').waitFor();

        await page.evaluate(() => openAdminConsole('overview'));
        await page.locator('#panel-overview.active').waitFor();
        await page.waitForTimeout(260);

        const btnProj = page.locator('#projectSortHintBtn');
        const tipProj = page.locator('#projectSortHintTip');
        await btnProj.waitFor({ state: 'visible' });

        // 1. Check alignment and sizing with filter trigger
        const geom = await page.evaluate(() => {
            const btn = document.getElementById('projectSortHintBtn');
            const selWrap = document.querySelector('#overviewActionsProjects .ver-picker-wrap');
            const bRect = btn.getBoundingClientRect();
            const sRect = selWrap.getBoundingClientRect();
            return {
                btnW: btn.offsetWidth,
                btnH: btn.offsetHeight,
                selH: selWrap.offsetHeight,
                centerDeltaY: Math.abs((bRect.top + bRect.height / 2) - (sRect.top + sRect.height / 2)),
                gap: Math.round(sRect.left - bRect.right),
                isLeftOfSelect: bRect.right <= sRect.left
            };
        });
        check('project sort hint button is 28x28 and aligned left of folder select', geom.btnW === 28 && geom.btnH === 28 && geom.selH === 32 && geom.isLeftOfSelect && geom.centerDeltaY <= 1.5 && geom.gap === 6);

        // 2. Hover shows tooltip with default copy
        await btnProj.hover();
        await tipProj.waitFor({ state: 'visible' });
        const defaultText = (await tipProj.textContent()).trim();
        check('hovering project sort hint displays product-grade copy', defaultText === '选定文件夹后，可调整项目顺序');

        const tipGeom = await page.evaluate(() => {
            const btn = document.getElementById('projectSortHintBtn').getBoundingClientRect();
            const tip = document.getElementById('projectSortHintTip').getBoundingClientRect();
            return {
                aboveBtn: tip.bottom <= btn.top + 1,
                inViewport: tip.left >= 8 && tip.right <= window.innerWidth - 8 && tip.top >= 8
            };
        });
        check('tooltip sits cleanly above icon within viewport', tipGeom.aboveBtn && tipGeom.inViewport);
        await page.screenshot({ path: path.join(fixture.shotDir, '01-projects-default-hover.png') });

        // 3. Moving pointer onto tooltip keeps it open (WCAG 1.4.13 Hoverable)
        await tipProj.hover();
        await page.waitForTimeout(220);
        check('tooltip stays visible when hovered directly', await tipProj.isVisible());

        // 4. Pressing Escape closes tooltip ONLY, keeps admin console open
        await page.keyboard.press('Escape');
        await page.waitForTimeout(120);
        check('Escape dismisses tooltip without closing admin console', !(await tipProj.isVisible()) && await page.locator('#adminConsoleModal').isVisible());

        // 5. Selecting a folder activates blue state, row reorder buttons, and active copy
        const pickerTrigger = page.locator('#overviewActionsProjects .linear-select-trigger');
        await pickerTrigger.click();
        await page.locator('.ver-popover-menu:not([hidden]) .ver-popover-item', { hasText: '核心业务线' }).click();
        await page.waitForTimeout(100);

        const activeCheck = await page.evaluate(() => {
            const btn = document.getElementById('projectSortHintBtn');
            const orderBtn = document.querySelector('#overviewTableProjects .project-order-btn');
            return {
                hasActiveClass: btn.classList.contains('is-active'),
                orderVisible: orderBtn && getComputedStyle(orderBtn).display !== 'none'
            };
        });
        check('selecting folder marks hint icon active and shows row reorder buttons', activeCheck.hasActiveClass && activeCheck.orderVisible);

        await btnProj.hover();
        await tipProj.waitFor({ state: 'visible' });
        const activeText = (await tipProj.textContent()).trim();
        check('active folder hover copy guides row arrows', activeText === '已选定文件夹，可点击右侧箭头调整顺序');
        await page.screenshot({ path: path.join(fixture.shotDir, '02-projects-active-hover.png') });

        // 6. Resetting to all folders restores default state
        await pickerTrigger.click();
        await page.locator('.ver-popover-menu:not([hidden]) .ver-popover-item', { hasText: '全部文件夹' }).click();
        await page.waitForTimeout(100);
        const resetCheck = await page.evaluate(() => {
            const btn = document.getElementById('projectSortHintBtn');
            const tip = document.getElementById('projectSortHintTip');
            return !btn.classList.contains('is-active') && tip.textContent.trim() === '选定文件夹后，可调整项目顺序';
        });
        check('resetting to all folders restores default state and copy', resetCheck);

        // 7. Switch to External Links subtab and verify
        await page.locator('#btnSubtabLinks').click();
        const btnLink = page.locator('#linkSortHintBtn');
        const tipLink = page.locator('#linkSortHintTip');
        await btnLink.waitFor({ state: 'visible' });
        await btnLink.hover();
        await tipLink.waitFor({ state: 'visible' });
        check('links tab sort hint shows link-specific guidance', (await tipLink.textContent()).trim() === '选定文件夹后，可调整链接顺序');
        await page.screenshot({ path: path.join(fixture.shotDir, '03-links-default-hover.png') });

        await page.locator('#overviewActionsLinks .linear-select-trigger').click();
        await page.locator('.ver-popover-menu:not([hidden]) .ver-popover-item', { hasText: '核心业务线' }).click();
        await btnLink.hover();
        await tipLink.waitFor({ state: 'visible' });
        check('links tab active folder updates state and copy', (await tipLink.textContent()).trim() === '已选定文件夹，可点击右侧箭头调整顺序' && await btnLink.evaluate(el => el.classList.contains('is-active')));

        check('zero console or page errors during browser checks', errors.length === 0);
        console.log(JSON.stringify({ passed, scope: 'sort hint icon and popover browser verification' }));
    } finally {
        await browser.close();
    }
})();
