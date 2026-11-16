/* Visitor registration flow browser verification script */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require('assert');
const fixture = JSON.parse(process.env.VISITOR_FLOW_FIXTURE);

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
        const errors = [], warnings = [];
        page.on('pageerror', err => errors.push(err.message));
        page.on('console', msg => {
            if (msg.type() === 'error') errors.push(msg.text());
            if (msg.type() === 'warning') warnings.push(msg.text());
        });

        console.log('=== [1/2] 测试独立登录页访客注册动线 ===');
        await page.goto(fixture.base + '/index.php');
        await page.locator('#adminLoginForm').waitFor({ state: 'visible' });

        const adminBadge = page.locator('#adminDomainBadge');
        check('独立登录页输入框域名徽标常驻显示', await adminBadge.isVisible() && (await adminBadge.innerText()).includes('@example.com'));

        // 切换到「申请加入协作」
        await page.locator('#switchRegister').click();
        await page.locator('#visitorRegForm').waitFor({ state: 'visible' });
        check('成功切换至访客申请面板', await page.locator('#adminLoginForm').isHidden());

        const regBadge = page.locator('#regLockDomainBadge');
        check('访客申请面板域名徽标正常展示（修复原显示缺失问题）', await regBadge.isVisible() && (await regBadge.innerText()).includes('@example.com'));

        // 填写表单
        await page.locator('#regName').fill('设计访客小艾');
        await page.locator('#regPwdInput').fill('visitor123456');
        await page.locator('#regRemarkInput').fill('产研中心 · UX');
        await page.locator('#regEmailInput').fill('designer_amy');

        check('输入邮箱名前缀后域名徽标依然保留', await regBadge.isVisible());

        // 提交注册
        await page.locator('#btnVisitorReg').click();

        // 验证自动切回登录页
        await page.locator('#adminLoginForm').waitFor({ state: 'visible' });
        check('注册成功后自动平滑切回账号登录面板', await page.locator('#visitorRegForm').isHidden());

        // 验证顶部提示
        const succTip = page.locator('#adminLoginSuccessTip');
        check('登录面板顶部展示明确的成功通知', await succTip.isVisible() && (await succTip.innerText()).includes('申请已提交，等待管理员审核后即可登录'));

        // 验证邮箱回填与徽标
        const loginUserInput = page.locator('#adminLoginUser');
        check('刚申请的邮箱账号已自动回填至登录框', (await loginUserInput.inputValue()) === 'designer_amy');
        check('回填后登录框的企业域名徽标依然正确展示', await adminBadge.isVisible() && (await adminBadge.innerText()).includes('@example.com'));

        // 验证焦点
        const activeId = await page.evaluate(() => document.activeElement ? document.activeElement.id : '');
        check('光标自动聚焦至密码输入框', activeId === 'adminLoginPwd');

        await page.screenshot({ path: '/private/tmp/protoloft_visitor_reg_success_standalone.png' });
        console.log('已截图: /private/tmp/protoloft_visitor_reg_success_standalone.png');

        console.log('=== [2/2] 测试工作台通用登录弹窗访客注册动线 ===');
        // 先登录管理员以便进入工作台
        await page.locator('#adminLoginUser').fill('admin@test.com');
        await page.locator('#adminLoginPwd').fill(fixture.password);
        await page.locator('#btnAdminLogin').click();
        await page.locator('.user-badge').waitFor();

        // 打开登录/访客通用弹窗
        await page.evaluate(() => openLoginModal());
        const modal = page.locator('#loginModal');
        await modal.waitFor({ state: 'visible' });

        const modalDomainBadge = page.locator('#loginDomainBadge');
        check('弹窗登录输入框域名徽标正常展示', await modalDomainBadge.isVisible() && (await modalDomainBadge.innerText()).includes('@example.com'));

        // 切换到弹窗的「申请加入协作」
        await page.locator('#linkToRegister').click();
        await page.locator('#paneDoRegister').waitFor({ state: 'visible' });
        check('弹窗成功切换至访客申请面板', await page.locator('#paneDoLogin').isHidden());

        const modalRegBadge = page.locator('#regDomainBadge');
        check('弹窗注册表单域名徽标正常展示', await modalRegBadge.isVisible() && (await modalRegBadge.innerText()).includes('@example.com'));

        // 填写表单
        await page.locator('#regName').fill('前端访客小博');
        await page.locator('#regPassword').fill('visitor654321');
        await page.locator('#regDepartment').fill('研发部 · 前端开发');
        await page.locator('#regEmail').fill('developer_bob');

        check('弹窗输入邮箱名前缀后域名徽标依然保留', await modalRegBadge.isVisible());

        // 提交注册
        await page.locator('#btnRegSubmit').click();

        // 验证自动切回弹窗登录页
        await page.locator('#paneDoLogin').waitFor({ state: 'visible' });
        check('弹窗注册成功后自动平滑切回账号登录面板', await page.locator('#paneDoRegister').isHidden());

        // 验证弹窗顶部成功通知
        const modalSuccNotice = page.locator('#loginSuccessNotice');
        check('弹窗登录面板顶部展示明确的成功通知', await modalSuccNotice.isVisible() && (await modalSuccNotice.innerText()).includes('申请已提交，等待管理员审核后即可登录'));

        // 验证弹窗邮箱回填与徽标
        const modalEmailInput = page.locator('#loginEmail');
        check('刚申请的邮箱账号已自动回填至弹窗登录框', (await modalEmailInput.inputValue()) === 'developer_bob');
        check('弹窗回填后登录框的企业域名徽标依然正确展示', await modalDomainBadge.isVisible() && (await modalDomainBadge.innerText()).includes('@example.com'));

        // 验证焦点
        const modalActiveId = await page.evaluate(() => document.activeElement ? document.activeElement.id : '');
        check('弹窗光标自动聚焦至密码输入框', modalActiveId === 'loginPassword');

        await page.screenshot({ path: '/private/tmp/protoloft_visitor_reg_success_modal.png' });
        console.log('已截图: /private/tmp/protoloft_visitor_reg_success_modal.png');

        check('全流程无页面运行时异常或严重警告', errors.length === 0);
        console.log(`\n==================================================`);
        console.log(` 全部浏览器断言已通过: ${passed} 项断言 PASS`);
        console.log(`==================================================`);
    } finally {
        await browser.close();
    }
})();
