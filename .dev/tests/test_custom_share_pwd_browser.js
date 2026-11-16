/* Custom share code password display and combo copy browser verification */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fixture = JSON.parse(process.env.SHARE_PWD_FIXTURE);

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
            viewport: { width: 1280, height: 860 },
            permissions: ['clipboard-read', 'clipboard-write']
        });
        context.setDefaultTimeout(12000);
        const page = await context.newPage();

        // 访问首页并以管理员登录
        await page.goto(fixture.base + '/index.php');
        await page.locator('#adminLoginForm').waitFor({ state: 'visible' });
        await page.locator('#adminLoginUser').fill(fixture.email);
        await page.locator('#adminLoginPwd').fill(fixture.password);
        await page.locator('#btnAdminLogin').click();

        // 等待进入工作台大盘
        await page.locator('.user-badge').waitFor({ state: 'visible' });

        // 劫持 copyTextToClipboard，精准记录复制的内容与次数
        await page.evaluate(() => {
            window.__copiedHistory = [];
            const origCopy = window.copyTextToClipboard;
            window.copyTextToClipboard = function(text, cb) {
                window.__copiedHistory.push(text);
                window.__lastCopied = text;
                return origCopy(text, cb);
            };
        });

        console.log('=== [1/3] 打开项目的分享弹窗并创建加密专属外发短链 ===');
        await page.evaluate((itemId) => {
            window.openShareModal(itemId);
        }, fixture.itemId);

        const modal = page.locator('#shareManageModal');
        await modal.waitFor({ state: 'visible' });
        check('分享管理弹窗成功打开', await modal.isVisible());

        // 展开创建面板
        await page.locator('#btnToggleNewCustomShare').click();
        const createPanel = page.locator('#customShareCreatePanel');
        await createPanel.waitFor({ state: 'visible' });

        // 填写表单：备注“客户技术评审”，密码“sec6688”
        await page.locator('#customShareLabelInput').fill('客户技术评审');
        await page.locator('#customSharePwdInput').fill('sec6688');
        await page.locator('#btnSubmitCustomShare').click();

        // 等待列表渲染出该记录
        await page.waitForTimeout(500);
        const pwdBadge = page.locator('.btn-copy-share-pwd');
        await pwdBadge.waitFor({ state: 'visible' });

        check('专属外发列表中显式渲染出密码徽标', await pwdBadge.isVisible());
        const badgeText = await pwdBadge.innerText();
        check('密码微徽标包含“密码: sec6688”', badgeText.includes('密码:') && badgeText.includes('sec6688'));

        const badgeData = await pwdBadge.getAttribute('data-copy-pwd-only');
        check('密码微徽标包含属性 data-copy-pwd-only="sec6688"', badgeData === 'sec6688');

        // 验证创建成功时自动组合复制入剪贴板
        const createdCopied = await page.evaluate(() => window.__lastCopied);
        check('创建加密短链时自动一键组合复制（链接+访问密码）', 
              createdCopied && createdCopied.includes('链接：') && createdCopied.includes('访问密码：sec6688'));

        console.log('=== [2/3] 测试点击复制与单拷密码交互 ===');
        // 1. 点击密码微徽标，单拷密码
        await pwdBadge.click();
        await page.waitForTimeout(100);
        const singleCopied = await page.evaluate(() => window.__lastCopied);
        check('点击密码微徽标单独复制真实密码本身', singleCopied === 'sec6688');

        // 2. 点击右侧复制按钮，整包复制（组合链接与密码）
        const copyRowBtn = page.locator('#activeShareListContainer [data-copy-url]');
        await copyRowBtn.click();
        await page.waitForTimeout(100);
        const comboCopied = await page.evaluate(() => window.__lastCopied);
        check('点击列表右侧复制按钮智能组合复制链接与访问密码', 
              comboCopied && comboCopied.includes('链接：') && comboCopied.includes('访问密码：sec6688'));
        check('按钮变为“已复制”状态反馈', (await copyRowBtn.innerText()).includes('已复制'));

        console.log('=== [3/3] 创建免密外发短链并验证免密行为 ===');
        await page.locator('#btnToggleNewCustomShare').click();
        await createPanel.waitFor({ state: 'visible' });
        await page.locator('#customShareLabelInput').fill('公开免密预览');
        await page.locator('#customSharePwdInput').fill('');
        await page.locator('#btnSubmitCustomShare').click();
        await page.waitForTimeout(500);

        const freeBadges = page.locator('#activeShareListContainer .badge-neutral');
        const freeBadgeCount = await freeBadges.count();
        check('列表中包含免密专属外发短链', freeBadgeCount > 0);

        const lastFreeCopied = await page.evaluate(() => window.__lastCopied);
        check('创建免密专属短链复制纯链接（无访问密码文字）', 
              lastFreeCopied && lastFreeCopied.startsWith('http') && !lastFreeCopied.includes('访问密码：'));

        // 高清截取弹窗实景图
        const artifactDir = process.env.ARTIFACT_DIR || path.join(__dirname, '../tmp');
        if (!fs.existsSync(artifactDir)) fs.mkdirSync(artifactDir, { recursive: true });
        const modalBox = page.locator('#shareManageModal .modal-dialog-box');
        await modalBox.screenshot({
            path: path.join(artifactDir, 'custom_share_pwd_modal.png'),
            animations: 'disabled'
        });
        console.log('[*] 截图已生成并保存: custom_share_pwd_modal.png');

        console.log(`\n[✓] 真实浏览器端到端全链路验证通过！累计验证通过 ${passed} 项断言！`);
    } finally {
        await browser.close();
    }
})();
