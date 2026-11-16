/* Synthetic Axure DOM verification in real Chrome: roots 0+, children 1+. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require('assert');
const path = require('path');
const fixture = JSON.parse(process.env.AUTONUM_FIXTURE);

let passed = 0;
const check = (label, result) => {
    assert(result, label);
    passed++;
    console.log('PASS ' + label);
};

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const context = await browser.newContext({
            viewport: { width: 1440, height: 900 }
        });
        context.setDefaultTimeout(15000);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));

        console.log('=== [1/3] 登录工作台并载入「一休运营」Axure 原型 ===');
        await page.goto(fixture.base + '/index.php');
        await page.locator('#adminLoginForm').waitFor({ state: 'visible' });
        await page.locator('#adminLoginUser').fill(fixture.email);
        await page.locator('#adminLoginPwd').fill(fixture.password);
        await page.locator('#btnAdminLogin').click();

        await page.locator('.user-badge').waitFor({ state: 'visible' });

        // 点击选择本次创建的项目与版本。
        await page.locator('#item-node-' + fixture.itemId).click();
        await page.waitForTimeout(500);

        // 选择本次发布的版本。
        const verSelect = page.locator('#topVerSelect');
        if (await verSelect.isVisible()) {
            await verSelect.selectOption(String(fixture.verId));
        }

        console.log('=== [2/3] 验证 iframe 内部 Axure 页面树全托管自动编号 ===');
        const frame = page.frameLocator('#myFrame');

        // 等待 Axure sitemap 树容器出现
        const treeContainer = frame.locator('#sitemapTreeContainer');
        await treeContainer.waitFor({ state: 'visible', timeout: 12000 });
        check('Axure 原型左侧页面树成功载入', await treeContainer.isVisible());

        await frame.locator('.sitemapPageNameTag[data-sitemap-page-name-tag="0"]').waitFor({ state: 'visible' });

        // 1. 说明页也必须编号，根层从 0 开始，子层从 1 开始。
        const sitemapText = await treeContainer.innerText();
        check('页面树包含“版本说明”', sitemapText.includes('版本说明'));
        async function seq(title, expected, scope = frame) {
            const name = scope.locator('.sitemapPageName', { hasText: title }).first();
            check(title + ' 编号为 ' + expected,
                await name.locator('.sitemapPageNameTag').getAttribute('data-sitemap-page-name-tag') === expected);
        }
        await seq('版本说明', '0');
        await seq('更新日志', '0.1');
        await seq('修订历史', '0.1.1');
        await seq('首页', '1.1');
        await seq('项目概览', '1.1.1');
        await seq('封面', '2');

        // 2. 验证「一休运营」拥有编号徽标
        const rootItem = frame.locator('.sitemapNode', { hasText: '一休运营' }).first();
        const rootTag = rootItem.locator('.sitemapPageNameTag').first();
        check('“一休运营”渲染了层级微标牌', await rootTag.isVisible());
        const rootSeq = await rootTag.getAttribute('data-sitemap-page-name-tag');
        check('“一休运营”作为第一业务模块编号为 1', rootSeq === '1');

        // 3. 验证原图遗漏的「订阅消息」自动补齐了层级序号
        const subMsgName = frame.locator('.sitemapPageName', { hasText: '订阅消息' }).first();
        await subMsgName.waitFor({ state: 'visible' });
        check('页面树包含“订阅消息”节点', await subMsgName.isVisible());

        const subMsgTag = subMsgName.locator('.sitemapPageNameTag');
        check('此前漏掉序号的“订阅消息”自动获得了 .sitemapPageNameTag 微徽标', await subMsgTag.isVisible());
        const subMsgSeq = await subMsgTag.getAttribute('data-sitemap-page-name-tag');
        console.log('[*] 订阅消息自动分配层级序号:', subMsgSeq);
        check('“订阅消息”自动推导出正确的层级编号 1.3.2', subMsgSeq === '1.3.2');

        // 4. 验证「修改密码」与「订阅消息」同属于同一父级且编号严谨递增
        const pwdName = frame.locator('.sitemapPageName', { hasText: '修改密码' }).first();
        const pwdTag = pwdName.locator('.sitemapPageNameTag');
        const pwdSeq = await pwdTag.getAttribute('data-sitemap-page-name-tag');
        console.log('[*] 修改密码自动分配层级序号:', pwdSeq);
        check('修改密码与订阅消息在同一层级且序列相邻', pwdSeq === '1.3.1' && subMsgSeq === '1.3.2');

        console.log('=== [3/3] 高清截取左侧页面树实景截图 ===');
        const artifactDir = fixture.artifactDir;
        
        // 截取 iframe 左侧 sitemap 区域
        const sitemapHost = frame.locator('#sitemapHost');
        if (await sitemapHost.isVisible()) {
            await sitemapHost.screenshot({
                path: path.join(artifactDir, 'axure_sitemap_autonumbering.png'),
                animations: 'disabled'
            });
            console.log('[*] 页面树高清特写截图已保存: axure_sitemap_autonumbering.png');
        } else {
            await treeContainer.screenshot({
                path: path.join(artifactDir, 'axure_sitemap_autonumbering.png'),
                animations: 'disabled'
            });
            console.log('[*] 树容器截图已保存: axure_sitemap_autonumbering.png');
        }

        // 重复执行不会产生重复徽标。
        const first = await treeContainer.innerHTML();
        await page.evaluate(() => window.setupAxureSitemapAutoNumbering(document.getElementById('myFrame').contentWindow));
        check('重复执行保持相同页面树', await treeContainer.innerHTML() === first);
        check('工作台路由正确', page.url().startsWith(fixture.base + '/index.php'));
        check('工作台包含页面标题', !!await page.title());

        // 未登录分享页使用同一编号规则。
        const guest = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const sharePage = await guest.newPage();
        sharePage.on('pageerror', error => errors.push(error.message));
        await sharePage.goto(fixture.base + '/share.php?s=' + fixture.shareCode);
        const sharedFrame = sharePage.frameLocator('#shareFrame');
        await sharedFrame.locator('.sitemapPageNameTag[data-sitemap-page-name-tag="0"]').waitFor({ state: 'visible' });
        await seq('版本说明', '0', sharedFrame);
        await seq('更新日志', '0.1', sharedFrame);
        await seq('首页', '1.1', sharedFrame);
        await seq('封面', '2', sharedFrame);
        check('分享页路由正确', sharePage.url().includes('/share.php?s=' + fixture.shareCode));
        check('分享页包含页面标题', !!await sharePage.title());
        await sharedFrame.locator('#sitemapHost').screenshot({ path: path.join(artifactDir, 'share-numbering.png') });
        await guest.close();
        check('无应用脚本异常', errors.length === 0);

        console.log(`\n[✓] Chrome 合成 Axure DOM 样本验证通过，累计通过 ${passed} 项断言。`);
    } finally {
        await browser.close();
    }
})();
