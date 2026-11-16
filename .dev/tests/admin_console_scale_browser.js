/* Real UI/HTTP: admin console modal scale and responsive table verification across 2K, 1080P and laptop viewports. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require('assert');
const path = require('path');
const fixture = JSON.parse(process.env.CONSOLE_SCALE_FIXTURE);

let passed = 0;
function check(label, value) {
    assert(value, label);
    passed++;
    console.log('PASS ' + label);
}

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const viewports = [
            { width: 2560, height: 1440, name: '2K (2560x1440)', expectedWidth: 1240 },
            { width: 1920, height: 1080, name: '1080P (1920x1080)', expectedWidth: 1190 },
            { width: 1440, height: 900,  name: 'Laptop (1440x900)',  expectedWidth: 1040 }
        ];

        for (const vp of viewports) {
            const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
            const page = await context.newPage();
            const errors = [];
            page.on('pageerror', err => errors.push(err.message));
            page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

            // 登录
            await page.goto(fixture.base + '/index.php');
            await page.locator('#adminLoginUser').fill('admin@test.com');
            await page.locator('#adminLoginPwd').fill(fixture.password);
            await page.locator('#btnAdminLogin').click();
            await page.locator('.user-badge').waitFor();

            // 打开控制中心
            await page.locator('button[title="控制中心"]').click();
            await page.locator('#adminConsoleModal').waitFor({ state: 'visible' });
            // 等待进场缩放动画 (180ms) 稳定
            await page.waitForTimeout(250);

            const actualWidth = await page.locator('.admin-console-box').evaluate(el => Math.round(parseFloat(getComputedStyle(el).width)));
            check(`${vp.name} 下控制中心弹窗宽度符合预期 (期望 ${vp.expectedWidth}px, 实际 ${actualWidth}px)`,
                Math.abs(actualWidth - vp.expectedWidth) <= 2);

            // 验证 6 个面板切换及表格无意外横向滚动
            const tabs = ['dashboard', 'overview', 'users', 'roles', 'brand', 'logs'];
            for (const tab of tabs) {
                await page.locator(`#nav-${tab}`).click();
                await page.waitForTimeout(100);

                // 检查当前激活面板中的所有 table
                const activePanel = page.locator('.admin-panel.active');
                await activePanel.waitFor({ state: 'visible' });

                const overflowCheck = await activePanel.evaluate(panel => {
                    const tables = panel.querySelectorAll('table');
                    const issues = [];
                    tables.forEach((tbl, idx) => {
                        const parent = tbl.parentElement;
                        // parent 容器如果设置了 overflow-x，检查 scrollWidth 与 clientWidth
                        if (parent && parent.scrollWidth > parent.clientWidth + 5) {
                            issues.push(`Table ${idx} in container overflowed: scrollWidth=${parent.scrollWidth}, clientWidth=${parent.clientWidth}`);
                        }
                    });
                    return issues;
                });

                check(`${vp.name} - 面板 ${tab} 内容完整无横向溢出`, overflowCheck.length === 0);
            }

            // 针对 2K 屏截图留存作为实景凭证
            if (vp.width === 2560 && fixture.artifacts) {
                await page.locator('#nav-dashboard').click();
                await page.waitForTimeout(200);
                await page.screenshot({ path: path.join(fixture.artifacts, 'admin-console-2k-dashboard.png') });

                await page.locator('#nav-overview').click();
                await page.waitForTimeout(100);
                await page.screenshot({ path: path.join(fixture.artifacts, 'admin-console-2k-overview.png') });

                await page.locator('#nav-users').click();
                await page.waitForTimeout(100);
                await page.screenshot({ path: path.join(fixture.artifacts, 'admin-console-2k-users.png') });
            }

            // 关闭弹窗
            await page.locator('.admin-content-header .close-x').click();
            await page.locator('#adminConsoleModal').waitFor({ state: 'hidden' });
            check(`${vp.name} - 成功关闭控制中心`, true);

            check(`${vp.name} - 无脚本运行报错`, errors.length === 0);
            await context.close();
        }

        console.log(JSON.stringify({
            passed,
            errors: [],
            viewports: viewports.map(v => v.name),
            scope: 'Admin console responsive width and table fitting verification'
        }));
    } finally {
        await browser.close();
    }
})().catch(err => {
    console.error(err);
    process.exit(1);
});
