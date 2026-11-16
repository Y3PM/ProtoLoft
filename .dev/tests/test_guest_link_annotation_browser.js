/* Production DOM & JS in Chrome: Verify guest link annotation flow on share.php */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require('assert');
const fixture = JSON.parse(process.env.LINK_ANNO_FIXTURE);

let passed = 0;
const check = (label, result) => {
    assert(result, label);
    passed++;
    console.log('PASS ' + label);
};

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        context.setDefaultTimeout(10000);
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));

        // 监听 prompt 对话框，为未登录访客自动提供昵称
        page.on('dialog', async dialog => {
            if (dialog.type() === 'prompt') {
                await dialog.accept('外部审阅访客小周');
            } else {
                await dialog.accept();
            }
        });

        const shareUrl = fixture.base + '/share.php?s=' + fixture.share_code;
        console.log('访问外链分享链接:', shareUrl);
        await page.goto(shareUrl);

        // 1. 验证批注按钮存在
        const btnAnno = page.locator('#btnToggleAnnotation');
        await btnAnno.waitFor({ state: 'visible' });
        check('分享页顶部渲染了批注按钮', await btnAnno.isVisible());

        // 2. 点击批注按钮展开抽屉
        await btnAnno.click();
        const drawer = page.locator('#annotationDrawer');
        await drawer.waitFor({ state: 'visible' });
        check('点击批注按钮成功展开批注抽屉', await drawer.isVisible());

        // 3. 验证输入框与发送按钮处于启用状态（此前因错判为原型且无版本而直接 disabled）
        const input = page.locator('#annoNewInput');
        await input.waitFor({ state: 'visible' });
        check('批注输入框处于就绪可用状态 (Not Disabled)', !(await input.isDisabled()));

        const btnSend = page.locator('#btnSendAnno');
        check('批注发送按钮处于就绪可用状态 (Not Disabled)', !(await btnSend.isDisabled()));

        // 4. 验证外链标题展示
        const pageTitleEl = page.locator('#annoCurPageTitle');
        const pageTitleText = await pageTitleEl.innerText();
        check('抽屉上下文正确识别为外部链接标题', pageTitleText.includes('双十一营销活动落地页'));

        // 5. 输入批注正文并提交
        const testContent = '访客反馈：页面首屏倒计时在暗色模式下对比度不足，建议加深底色。';
        await input.fill(testContent);
        await btnSend.click();

        // 6. 验证批注发表成功并渲染在列表中
        const noteCard = page.locator('.anno-card').filter({ hasText: testContent });
        await noteCard.waitFor({ state: 'visible' });
        check('外部访客发表的外链批注成功出现在列表中', await noteCard.isVisible());

        // 7. 验证署名与标签
        const cardText = await noteCard.innerText();
        check('批注署名为访客填写的姓名', cardText.includes('外部审阅访客小周'));

        await page.screenshot({ path: '/private/tmp/protoloft_guest_link_annotation.png' });
        console.log('已截图: /private/tmp/protoloft_guest_link_annotation.png');

        check('全流程无页面运行时脚本错误', errors.length === 0);
        console.log(`\n==================================================`);
        console.log(` 外链访客批注端到端验证通过: ${passed} 项断言 PASS`);
        console.log(`==================================================`);
    } finally {
        await browser.close();
    }
})();
