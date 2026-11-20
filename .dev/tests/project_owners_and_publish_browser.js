const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require('assert');
const path = require('path');

const fixture = JSON.parse(process.env.OWNERS_FIXTURE);
let passed = 0;
function check(label, value) {
    assert(value, label);
    passed++;
    console.log('PASS ' + label);
}

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    try {
        const errors = [];
        const warnings = [];
        async function newUserPage(email) {
            const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 } });
            ctx.setDefaultTimeout(10000);
            const page = await ctx.newPage();
            page.on('pageerror', err => errors.push(err.message));
            page.on('console', msg => {
                if (msg.type() === 'error') errors.push(msg.text());
                if (msg.type() === 'warning') warnings.push(msg.text());
            });
            await page.goto(fixture.base + '/index.php');
            await page.locator('#adminLoginUser').fill(email);
            await page.locator('#adminLoginPwd').fill(fixture.password);
            await page.locator('#btnAdminLogin').click();
            await page.locator('.user-badge').waitFor();
            check('页面身份正确且工作台有内容', page.url().startsWith(fixture.base + '/index.php') && (await page.title()).includes('立象') && (await page.locator('#btnQuickAdd').count()) === 1);
            return { ctx, page };
        }

        async function openProjects(page) {
            await page.locator('button[title="控制中心"]').click();
            await page.locator('#nav-overview').click();
            await page.locator('#btnSubtabProjects').click();
        }
        async function saveModal(page) {
            const response = page.waitForResponse(r => r.url().includes('api.php') && (r.request().postData() || '').includes('item_save'));
            await page.locator('#btnItemSubmit').click();
            check('项目保存请求成功', (await (await response).json()).success);
            await page.locator('#itemModal').waitFor({ state: 'hidden' });
        }

        // 1. 管理员创建「默认开放项目」与「指定多选负责人项目」
        const adminSession = await newUserPage('admin@test.com');
        const adminPage = adminSession.page;

        await adminPage.locator('#btnQuickAdd').click();
        await adminPage.locator('#quickAddMenu button:has-text("新建项目")').click();
        await adminPage.locator('#itemModal').waitFor({ state: 'visible' });
        const defaultOwnersText = await adminPage.locator('#itemOwnersTags').innerText();
        check('新建项目默认负责人显示「全部协作者」', defaultOwnersText.includes('全部协作者'));
        await adminPage.screenshot({ path: path.join(fixture.artifacts, '01-admin-new-project-default.png') });

        await adminPage.locator('#itemName').fill('全员开放原型');
        await Promise.all([
            adminPage.waitForNavigation({ waitUntil: 'load' }),
            adminPage.locator('#btnItemSubmit').click()
        ]);
        await adminPage.locator('.user-badge').waitFor();

        // 打开新建项目弹窗，测试多选指定负责人 [主管理员, 协作者A]
        await adminPage.locator('#btnQuickAdd').click();
        await adminPage.locator('#quickAddMenu button:has-text("新建项目")').click();
        await adminPage.locator('#itemModal').waitFor({ state: 'visible' });
        await adminPage.locator('#itemName').fill('专属锁定原型');
        await adminPage.locator('#itemOwnersTrigger').click();
        await adminPage.locator('#itemOwnersMenu').waitFor({ state: 'visible' });
        await adminPage.locator(`#itemOwnersOptions input[value="${fixture.adminId}"]`).check();
        await adminPage.locator(`#itemOwnersOptions input[value="${fixture.editorAId}"]`).check();
        const selectedBadges = await adminPage.locator('#itemOwnersTags').innerText();
        check('多选项目负责人触发框实时渲染名字胶囊', selectedBadges.includes('测试超管') && selectedBadges.includes('协作者A'));
        await adminPage.screenshot({ path: path.join(fixture.artifacts, '02-admin-multi-owners-dropdown.png') });
        await adminPage.locator('#itemModalTitle').click();
        await Promise.all([
            adminPage.waitForNavigation({ waitUntil: 'load' }),
            adminPage.locator('#btnItemSubmit').click()
        ]);
        await adminPage.locator('.user-badge').waitFor();

        // 验证管理员控制中心表格展示
        await openProjects(adminPage);
        await adminPage.locator('#adminConsoleModal').waitFor({ state: 'visible' });
        const openRowText = await adminPage.locator('#overviewTableProjects tr:has-text("全员开放原型")').innerText();
        const lockRowText = await adminPage.locator('#overviewTableProjects tr:has-text("专属锁定原型")').innerText();
        check('控制中心表格正确展示「全部协作者」及创建者兜底', openRowText.includes('全部协作者') && openRowText.includes('测试超管'));
        check('控制中心表格正确展示多选指定负责人姓名', lockRowText.includes('测试超管、协作者A'));
        await adminPage.screenshot({ path: path.join(fixture.artifacts, '03-admin-console-owners-table.png') });
        await adminSession.ctx.close();

        // 2. 协作者 B 登录，测试悬浮上传、发布版本弹窗与受保护项目隔离
        const bSession = await newUserPage('editorb@test.com');
        const bPage = bSession.page;

        const openNode = bPage.locator('li.item-row:has-text("全员开放原型")');
        const lockNode = bPage.locator('li.item-row:has-text("专属锁定原型")');
        await openNode.hover();
        const openUploadBtn = openNode.locator('.admin-controls .btn-act[title="发布版本"]');
        check('协作者B悬浮在「全员开放原型」上可见上传按钮', await openUploadBtn.isVisible());
        check('协作者B在「专属锁定原型」上无上传按钮', (await lockNode.locator('.admin-controls .btn-act').count()) === 0);

        // 点击全员开放原型的悬浮上传按钮 -> 直接进入发布版本弹窗
        await openUploadBtn.click();
        await bPage.locator('#uploadModal').waitFor({ state: 'visible' });
        const uploadOptionsText = await bPage.locator('#uploadItemSelect').innerText();
        check('悬浮点击上传直达发布版本弹窗且下拉包含开放项目、排除他人锁定项目',
            uploadOptionsText.includes('全员开放原型') && !uploadOptionsText.includes('专属锁定原型'));
        await bPage.screenshot({ path: path.join(fixture.artifacts, '04-editor-b-open-project-upload.png') });
        await bPage.locator('#uploadModal .close-x').click();

        // 点击左上角 + -> 发布版本 -> 直接打开 uploadModal，不再误跳新建项目
        await bPage.locator('#btnQuickAdd').click();
        await bPage.locator('#quickAddMenu button:has-text("发布版本")').click();
        await bPage.locator('#uploadModal').waitFor({ state: 'visible' });
        check('协作者B点击「发布版本」正确打开 uploadModal 且不打开新建项目',
            !(await bPage.locator('#itemModal').isVisible()));
        await bPage.locator('#uploadModal .close-x').click();

        // 点击他人锁定的空项目 -> 画布不应展示报错的「发布原型」按钮
        await lockNode.click();
        await bPage.locator('#noVersionPlaceholder').waitFor({ state: 'visible' });
        check('协作者B选中他人锁定的空项目时画布不显示发布原型按钮',
            (await bPage.locator('#noVersionPlaceholder .empty-state-btn').count()) === 0);

        // 协作者B打开控制中心，核对表格按钮权限
        await openProjects(bPage);
        await bPage.locator('#adminConsoleModal').waitFor({ state: 'visible' });
        const bOpenRow = bPage.locator('#overviewTableProjects tr:has-text("全员开放原型")');
        const bLockRow = bPage.locator('#overviewTableProjects tr:has-text("专属锁定原型")');
        check('协作者B在控制中心对开放项目仅可见上传按钮、不可见编辑和删除',
            (await bOpenRow.locator('button[title="发布新版本"]').count()) === 1
            && (await bOpenRow.locator('button[title="编辑属性"]').count()) === 0
            && (await bOpenRow.locator('button[title="删除"]').count()) === 0);
        check('协作者B在控制中心对锁定项目显示「受保护」且无上传按钮',
            (await bLockRow.locator('button[title="发布新版本"]').count()) === 0
            && (await bLockRow.innerText()).includes('受保护'));
        await bPage.screenshot({ path: path.join(fixture.artifacts, '05-editor-b-console-permissions.png') });
        await bPage.locator('#adminConsoleModal .close-x').click();

        // 3. 当管理员把唯一开放项目也锁定为仅 [协作者A] 后，协作者B点击「发布版本」提示不可发版而不误跳新建项目
        const adminEditSession = await newUserPage('admin@test.com');
        const adminEditPage = adminEditSession.page;
        await openProjects(adminEditPage);
        await adminEditPage.locator('#overviewTableProjects tr:has-text("全员开放原型") button[title="编辑属性"]').click();
        await adminEditPage.locator('#itemModal').waitFor({ state: 'visible' });
        await adminEditPage.locator('#itemOwnersTrigger').click();
        await adminEditPage.locator(`#itemOwnersOptions input[value="${fixture.editorAId}"]`).check();
        await adminEditPage.locator('#itemModalTitle').click();
        await adminEditPage.locator('#btnItemSubmit').click();
        await adminEditPage.locator('.toast-item:has-text("修改保存成功")').waitFor({ state: 'visible' });
        await adminEditSession.ctx.close();

        await bPage.reload({ waitUntil: 'load' });
        await bPage.locator('.user-badge').waitFor();
        await bPage.locator('#btnQuickAdd').click();
        await bPage.locator('#quickAddMenu button:has-text("发布版本")').click();
        await bPage.waitForTimeout(300);
        check('全站项目均锁定给他人时，协作者B点「发布版本」不误开「新建项目」而是给出提示',
            !(await bPage.locator('#itemModal').isVisible())
            && (await bPage.locator('.toast-item').innerText()).includes('暂无可发布版本的项目'));
        await bPage.screenshot({ path: path.join(fixture.artifacts, '06-editor-b-no-editable-project-toast.png') });
        await bSession.ctx.close();

        // 4. 创建者指定他人后，即时收回发版入口；恢复全部协作者后即时恢复。
        const aSession = await newUserPage('editora@test.com');
        const aPage = aSession.page;
        await openProjects(aPage);
        await aPage.locator('#overviewActionsProjects button.btn-primary').click();
        await aPage.locator('#itemName').fill('即时负责人同步');
        await saveModal(aPage);
        const aRow = aPage.locator('#overviewTableProjects tr:has-text("即时负责人同步")');
        check('协作者在控制中心新建开放项目后立即可发版', await aRow.locator('button[title="发布新版本"]').count() === 1);
        await aPage.reload();
        await openProjects(aPage);
        await aRow.locator('button[title="编辑属性"]').click();
        await aPage.locator('#itemOwnersTrigger').click();
        await aPage.locator(`#itemOwnersOptions input[value="${fixture.editorBId}"]`).check();
        await aPage.locator('#itemModalTitle').click();
        await saveModal(aPage);
        const aId = await aRow.getAttribute('data-item-id');
        check('创建者不在名单时，无刷新移除表格、侧栏和发布下拉入口',
            await aRow.getAttribute('data-can-edit') === '0'
            && await aRow.locator('button[title="发布新版本"]').count() === 0
            && await aPage.locator(`#item-node-${aId} .admin-controls`).count() === 0
            && await aPage.locator(`#uploadItemSelect option[value="${aId}"]`).count() === 0);
        check('创建者仍保留编辑负责人和删除项目入口',
            await aRow.locator('button[title="编辑属性"]').count() === 1 && await aRow.locator('button[title="删除"]').count() === 1);
        await aRow.locator('button[title="编辑属性"]').click();
        await aPage.locator('#itemOwnersTrigger').click();
        await aPage.locator('#itemOwnersMenu button:has-text("全部协作者")').click();
        await saveModal(aPage);
        check('切回全部协作者后，无刷新恢复表格、侧栏和发布下拉入口',
            await aRow.getAttribute('data-can-edit') === '1'
            && await aRow.locator('button[title="发布新版本"]').count() === 1
            && await aPage.locator(`#item-node-${aId} .admin-controls`).count() === 1
            && await aPage.locator(`#uploadItemSelect option[value="${aId}"]`).count() === 1);

        // 外链保持单独的创建者语义。
        await aPage.locator('#btnSubtabLinks').click();
        await aPage.locator('#overviewActionsLinks button.btn-primary').click();
        check('新建外链不展示项目负责人选择', !(await aPage.locator('#itemOwnersGroup').isVisible()));
        await aPage.locator('#itemName').fill('外部演示');
        await aPage.locator('#itemLinkUrl').fill('https://example.com');
        await saveModal(aPage);
        const linkRow = aPage.locator('#overviewTableLinks tr:has-text("外部演示")');
        check('外链列表展示创建者且不混入全部协作者', (await linkRow.innerText()).includes('协作者A') && !(await linkRow.innerText()).includes('全部协作者'));

        // 保留唯一已停用的负责人，不得因候选名单重绘而静默切为全员开放。
        await aPage.locator('#btnSubtabProjects').click();
        await aRow.locator('button[title="编辑属性"]').click();
        await aPage.locator('#itemOwnersTrigger').click();
        await aPage.locator(`#itemOwnersOptions input[value="${fixture.editorBId}"]`).check();
        await aPage.locator('#itemModalTitle').click();
        await saveModal(aPage);
        const adminFinalSession = await newUserPage('admin@test.com');
        const adminFinalPage = adminFinalSession.page;
        check('停用测试负责人成功', await adminFinalPage.evaluate(async id => {
            const fd = new FormData(); fd.append('id', id); fd.append('status', '3');
            return (await adminFetch('user_update', fd)).success;
        }, fixture.editorBId));
        await aPage.reload();
        await openProjects(aPage);
        await aRow.locator('button[title="编辑属性"]').click();
        check('已停用负责人以选中状态保留', await aPage.locator('#itemCollaborators').inputValue() === String(fixture.editorBId));
        await aPage.evaluate(() => loadUserList());
        await aPage.waitForFunction(id => cachedUsersMap[id] && cachedUsersMap[id].status === 3, fixture.editorBId);
        check('重绘成员候选不清空已停用负责人', await aPage.locator('#itemCollaborators').inputValue() === String(fixture.editorBId));
        await aPage.setViewportSize({ width: 1024, height: 768 });
        await aPage.locator('#itemOwnersTrigger').click();
        const menuBounds = await aPage.locator('#itemOwnersMenu').boundingBox();
        check('1024 屏幕负责人菜单位于可视范围', menuBounds.x >= 0 && menuBounds.y >= 0 && menuBounds.x + menuBounds.width <= 1024 && menuBounds.y + menuBounds.height <= 768);
        await aPage.screenshot({ path: path.join(fixture.artifacts, '07-inactive-owner-preserved-1024.png') });
        await aPage.locator('#itemModalTitle').click();
        await saveModal(aPage);

        // 指定负责人交接不改写创建者，当前页面编辑数据与侧栏同步。
        await openProjects(adminFinalPage);
        await adminFinalPage.locator('#nav-users').click();
        const handoverButton = adminFinalPage.locator('#userTableBody tr:has-text("editorb@test.com") button[title="工作交接"]');
        await handoverButton.click();
        await adminFinalPage.locator('#userHandoverModal').waitFor({ state: 'visible' });
        await adminFinalPage.locator('#handoverToUserId').selectOption(String(fixture.adminId));
        const handed = adminFinalPage.waitForResponse(r => r.url().includes('api.php') && (r.request().postData() || '').includes('user_handover'));
        await adminFinalPage.locator('#btnHandoverSubmit').click();
        check('仅被指定的负责人也可从成员界面完成交接', (await (await handed).json()).success);
        await adminFinalPage.locator('#userHandoverModal').waitFor({ state: 'hidden' });
        await adminFinalPage.locator('#nav-overview').click();
        const finalRow = adminFinalPage.locator('#overviewTableProjects tr:has-text("即时负责人同步")');
        check('交接即时更新负责人且保持原创建者', await finalRow.getAttribute('data-collaborators') === String(fixture.adminId) && await finalRow.getAttribute('data-created-by') === String(fixture.editorAId));
        check('交接同步侧栏指定负责人', await adminFinalPage.locator(`#item-node-${aId}`).getAttribute('data-collaborators') === String(fixture.adminId));
        await finalRow.locator('button[title="编辑属性"]').click();
        check('交接后的编辑弹窗不恢复原负责人', await adminFinalPage.locator('#itemCollaborators').inputValue() === String(fixture.adminId));
        await adminFinalPage.screenshot({ path: path.join(fixture.artifacts, '08-handover-owner-synced.png') });
        await aSession.ctx.close();
        await adminFinalSession.ctx.close();

        check('Chrome 全流程零未捕获脚本错误', errors.length === 0);
        const unexpectedWarnings = warnings.filter(message => !message.includes('An iframe which has both allow-scripts and allow-same-origin'));
        console.log(JSON.stringify({ errors, warnings, unexpectedWarnings }));
        check('Chrome 无应用警告，仅保留受信同源原型 iframe 提示', unexpectedWarnings.length === 0);
        console.log(JSON.stringify({ passed, errors, warnings }));
    } finally {
        await browser.close();
    }
})();
