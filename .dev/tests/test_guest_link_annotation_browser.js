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
        let nativeDialogCount = 0;
        page.on('pageerror', err => errors.push(err.message));
        page.on('dialog', async dialog => {
            nativeDialogCount++;
            await dialog.dismiss();
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

        // 3. 验证输入框与发送按钮处于启用状态
        const input = page.locator('#annoNewInput');
        await input.waitFor({ state: 'visible' });
        check('批注输入框处于就绪可用状态 (Not Disabled)', !(await input.isDisabled()));

        const btnSend = page.locator('#btnSendAnno');
        check('批注发送按钮处于就绪可用状态 (Not Disabled)', !(await btnSend.isDisabled()));

        // 4. 验证外链标题展示
        const pageTitleEl = page.locator('#annoCurPageTitle');
        const pageTitleText = await pageTitleEl.innerText();
        check('抽屉上下文正确识别为外部链接标题', pageTitleText.includes('双十一营销活动落地页'));

        // 5. 输入批注正文并打开自定义署名弹窗，验证背景 inert、焦点循环与 Esc 取消恢复
        const testContent = '访客反馈：页面首屏倒计时在暗色模式下对比度不足，建议加深底色。';
        await input.fill(testContent);
        await btnSend.focus();
        await btnSend.click();

        const guestModal = page.locator('#annoGuestNameModal');
        await guestModal.waitFor({ state: 'visible' });
        check('未登录访客触发自定义署名弹窗而非原生 prompt', await guestModal.isVisible() && nativeDialogCount === 0);
        check('署名弹窗打开时底层抽屉进入 inert 背景隔离', await drawer.evaluate(el => !!el.closest('[inert]')));

        // 在弹窗内连续按 Tab，焦点应闭环留在弹窗内部
        for (let i = 0; i < 6; i++) {
            await page.keyboard.press('Tab');
            const insideModal = await guestModal.evaluate(el => el.contains(document.activeElement));
            assert(insideModal, 'Tab 循环第 ' + (i + 1) + ' 步焦点必须留在弹窗内');
        }
        check('Tab 焦点循环严格停留在署名弹窗内', true);

        // Shift+Tab 反向同样停留在弹窗内
        await page.keyboard.press('Shift+Tab');
        check('Shift+Tab 反向焦点仍停留在署名弹窗内', await guestModal.evaluate(el => el.contains(document.activeElement)));

        // 按 Escape 取消：保留草稿，焦点回归触发发送按钮
        await page.keyboard.press('Escape');
        await guestModal.waitFor({ state: 'hidden' });
        check('按 Esc 取消后保留批注草稿且焦点恢复至发送按钮',
            (await input.inputValue()) === testContent &&
            await btnSend.evaluate(el => el === document.activeElement));

        // 6. 测试键盘确认“匿名发布”只做当次匿名，且提交后焦点回到原发送按钮（不掉回主体）
        await btnSend.focus();
        await btnSend.click();
        await guestModal.waitFor({ state: 'visible' });
        await page.locator('#annoGuestNameSkip').focus();
        await page.keyboard.press('Enter');
        await guestModal.waitFor({ state: 'hidden' });

        const anonCard = page.locator('.anno-card').filter({ hasText: testContent });
        await anonCard.waitFor({ state: 'visible' });
        check('匿名发布成功以「外部访客」署名展示', (await anonCard.innerText()).includes('外部访客'));
        check('键盘确认匿名发布后焦点回到原触发按钮', await btnSend.evaluate(el => el === document.activeElement));
        check('匿名发布不会持久化覆盖 localStorage 称呼',
            await page.evaluate(() => !localStorage.getItem('protoloft_guest_name')));

        // 6b. 访客首次回复按一次 Enter 必须弹出署名弹窗（不跳过确认直接发表），确认匿名后焦点回到卡片「回复」按钮
        const cardReplyToggle = anonCard.locator('[data-anno-reply-toggle]');
        await cardReplyToggle.click();
        const replyInput = anonCard.locator('input[id^="replyInput_"]');
        await replyInput.waitFor({ state: 'visible' });
        const replyText = '按回车触发回复：先弹出署名确认';
        await replyInput.fill(replyText);
        await replyInput.press('Enter');

        await guestModal.waitFor({ state: 'visible' });
        check('回复框按 Enter 弹出署名弹窗且尚未直接发表',
            await guestModal.isVisible() &&
            !(await anonCard.innerText()).includes(replyText));
        await page.locator('#annoGuestNameSkip').focus();
        await page.keyboard.press('Enter');
        await guestModal.waitFor({ state: 'hidden' });

        await anonCard.locator('.anno-reply-item').filter({ hasText: replyText }).waitFor({ state: 'visible' });
        check('访客回复匿名发布成功展示在回复列表中',
            (await anonCard.locator('.anno-reply-item').filter({ hasText: replyText }).innerText()).includes('外部访客'));
        check('回复匿名发布后焦点回到对应卡片的「回复」按钮',
            await anonCard.locator('[data-anno-reply-toggle]').evaluate(el => el === document.activeElement && el.getClientRects().length > 0));

        // 7. 再次发表批注：依然弹出署名框，填入姓名并发布
        const namedContent = '第二条反馈：希望补充移动端适配。';
        await input.fill(namedContent);
        await btnSend.click();
        await guestModal.waitFor({ state: 'visible' });
        await page.locator('#annoGuestNameInput').fill('外部审阅访客小周');
        await guestModal.locator('button[type="submit"]').click();
        await guestModal.waitFor({ state: 'hidden' });

        const namedCard = page.locator('.anno-card').filter({ hasText: namedContent });
        await namedCard.waitFor({ state: 'visible' });
        check('填名发表成功显示访客填写的署名', (await namedCard.innerText()).includes('外部审阅访客小周'));

        // 8. 多页原型下：打开署名弹窗期间若页面上下文已切换，不误提交到新页面且保留草稿
        if (fixture.proto_share_code) {
            const protoContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
            protoContext.setDefaultTimeout(10000);
            const protoPage = await protoContext.newPage();
            protoPage.on('pageerror', err => errors.push(err.message));
            protoPage.on('dialog', async d => { nativeDialogCount++; await d.dismiss(); });
            await protoPage.goto(fixture.base + '/share.php?s=' + fixture.proto_share_code);
            await protoPage.locator('#shareFrame').waitFor();
            await protoPage.locator('#btnToggleAnnotation').click();
            await protoPage.locator('#annoNewInput').waitFor({ state: 'visible' });

            const driftContent = '首页批注：不能串页保存到第二页';
            await protoPage.locator('#annoNewInput').fill(driftContent);
            await protoPage.locator('#btnSendAnno').click();
            await protoPage.locator('#annoGuestNameModal').waitFor({ state: 'visible' });

            // 模拟在署名期间原型 iframe 跳转到了第二页
            await protoPage.evaluate(() => {
                const f = document.getElementById('shareFrame');
                if (f) f.src = f.src.replace(/index\.html$/, 'page2.html');
            });
            await protoPage.locator('#annoCurPageTitle').filter({ hasText: '第二页' }).waitFor();

            await protoPage.locator('#annoGuestNameInput').fill('防串页访客');
            await protoPage.locator('#annoGuestNameModal button[type="submit"]').click();
            await protoPage.locator('#annoGuestNameModal').waitFor({ state: 'hidden' });

            check('署名期间切页后草稿保留在输入框中不丢失', (await protoPage.locator('#annoNewInput').inputValue()) === driftContent);
            check('署名期间切页后未把首页批注错误保存到第二页列表',
                (await protoPage.locator('.anno-card').filter({ hasText: driftContent }).count()) === 0);
            await protoContext.close();
        }

        check('全流程无原生阻塞对话框且无页面脚本错误', nativeDialogCount === 0 && errors.length === 0);
        console.log(`\n==================================================`);
        console.log(` 外链访客批注端到端验证通过: ${passed} 项断言 PASS`);
        console.log(`==================================================`);
    } finally {
        await browser.close();
    }
})();
