/* Real UI/HTTP: Comprehensive verification of dropdown and state sync within a single-page session.
   Covers all 5 defect categories identified in dropdown-sync-audit.md.
*/
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const assert = require('assert');
const fixture = JSON.parse(process.env.DROPDOWN_SYNC_FIXTURE);

let passed = 0;
function check(label, value) {
    assert(value, label);
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

        // 登录
        await page.goto(fixture.base + '/index.php');
        await page.locator('#adminLoginUser').fill('admin@test.com');
        await page.locator('#adminLoginPwd').fill(fixture.password);
        await page.locator('#btnAdminLogin').click();
        await page.locator('.user-badge').waitFor();

        const responseFor = action => page.waitForResponse(response =>
            response.request().method() === 'POST' && (response.request().postData() || '').includes(action)
        );

        // 打开控制中心
        await page.locator('button[title="控制中心"]').click();
        await page.locator('#adminConsoleModal').waitFor({ state: 'visible' });

        // ===================== 1. 验证新成员审批通知人下拉动态同步 =====================
        // 切换到系统设置面板
        await page.locator('#nav-brand').click();
        await page.locator('#adminMultiSelectTrigger').scrollIntoViewIfNeeded();

        // 辅助方法：读取当前审批通知人选项中的所有管理员 ID 和姓名
        const getApprovalOptions = async () => {
            return await page.evaluate(() => {
                const labels = document.querySelectorAll('#adminMultiSelectOptions label');
                return Array.from(labels).map(lbl => {
                    const input = lbl.querySelector('input');
                    const span = lbl.querySelector('span');
                    const status = lbl.querySelector('[data-admin-webhook-status]');
                    return {
                        id: input ? input.value : '',
                        name: span ? span.textContent.trim() : '',
                        hasWebhook: status ? status.innerHTML.includes('ri-robot-line') : false
                    };
                });
            });
        };

        // 初始状态下应该包含固定初始管理员 admin@test.com (和 fixture.admin2)
        let approvalOpts = await getApprovalOptions();
        check('1.1 初始审批人下拉正常加载', approvalOpts.some(o => o.id === String(fixture.admin2Id)));

        // 1.2 管理员改名同步
        await page.locator('#nav-users').click();
        await page.waitForFunction(id => window.cachedUsersMap && window.cachedUsersMap[id], fixture.admin2Id);
        await page.locator(`#userTableBody button[onclick="openEditUserModal(${fixture.admin2Id})"]`).click();
        await page.locator('#editUserName').fill('超管二号改名');
        let updateResp = responseFor('user_update');
        await page.locator('#btnUserUpdateSubmit').click();
        await updateResp;
        await page.locator('#editUserModal').waitFor({ state: 'hidden' });
        // 验证用户列表刷新后，审批人下拉已同步新姓名
        await page.locator('#nav-brand').click();
        approvalOpts = await getApprovalOptions();
        const renamedAdmin = approvalOpts.find(o => o.id === String(fixture.admin2Id));
        check('1.2 管理员改名后，审批候选人即时同步显示新姓名', renamedAdmin && renamedAdmin.name === '超管二号改名');

        // 1.3 降级管理员 (admin -> editor)：从候选名单自动剔除
        await page.locator('#nav-users').click();
        await page.locator(`#userTableBody button[onclick="openEditUserModal(${fixture.admin2Id})"]`).click();
        await page.locator('#editUserRole').selectOption('editor');
        updateResp = responseFor('user_update');
        await page.locator('#btnUserUpdateSubmit').click();
        await updateResp;
        await page.locator('#editUserModal').waitFor({ state: 'hidden' });

        await page.locator('#nav-brand').click();
        approvalOpts = await getApprovalOptions();
        check('1.3 管理员降级为协作者后，自动从审批候选名单中剔除', !approvalOpts.some(o => o.id === String(fixture.admin2Id)));

        // 1.4 晋升成员 (editor -> admin)：加入候选名单
        await page.locator('#nav-users').click();
        await page.locator(`#userTableBody button[onclick="openEditUserModal(${fixture.admin2Id})"]`).click();
        await page.locator('#editUserRole').selectOption('admin');
        updateResp = responseFor('user_update');
        await page.locator('#btnUserUpdateSubmit').click();
        await updateResp;
        await page.locator('#editUserModal').waitFor({ state: 'hidden' });

        await page.locator('#nav-brand').click();
        approvalOpts = await getApprovalOptions();
        check('1.4 协作者晋升为管理员后，自动加入审批候选名单', approvalOpts.some(o => o.id === String(fixture.admin2Id)));

        // 1.5 删除管理员：从候选名单自动剔除
        await page.locator('#nav-users').click();
        await page.locator(`#userTableBody button[onclick="handleDeleteUser(${fixture.admin2Id})"]`).click();
        const deleteUserResp = responseFor('user_delete');
        await page.locator('#btnCustomConfirmOk').click();
        await deleteUserResp;

        await page.locator('#nav-brand').click();
        approvalOpts = await getApprovalOptions();
        check('1.5 管理员删除后，自动从审批候选名单中剔除', !approvalOpts.some(o => o.id === String(fixture.admin2Id)));

        // ===================== 2. 验证文件夹筛选框动态同步 =====================
        await page.locator('#nav-overview').click();
        const getFolderOptions = async selectId => {
            return await page.evaluate(sid => {
                const sel = document.getElementById(sid);
                if (!sel) return [];
                return Array.from(sel.options).map(o => ({ value: o.value, text: o.text.trim() }));
            }, selectId);
        };

        // 2.1 新增文件夹
        await page.locator('#btnSubtabFolders').click();
        await page.locator('#overviewActionsFolders button').click(); // 新建文件夹
        await page.locator('#catName').fill('动态研发线A');
        let catSaveResp = responseFor('category_save');
        await page.locator('#categoryModal button[type="submit"]').click();
        const catSaveResult = await (await catSaveResp).json();
        const newCatId = catSaveResult.data.id;
        await page.locator('#categoryModal').waitFor({ state: 'hidden' });

        let pCatOpts = await getFolderOptions('filterProjectCategory');
        let lCatOpts = await getFolderOptions('filterLinkCategory');
        check('2.1 新建文件夹后，项目管理与外链筛选下拉均同步新增该选项',
            pCatOpts.some(o => o.value === String(newCatId) && o.text === '动态研发线A') &&
            lCatOpts.some(o => o.value === String(newCatId) && o.text === '动态研发线A')
        );

        // 2.2 编辑文件夹名称
        await page.locator(`button.btn-edit-cat-trigger[data-cat-id="${newCatId}"]`).click();
        await page.locator('#catName').fill('动态研发线A改名');
        catSaveResp = responseFor('category_save');
        await page.locator('#categoryModal button[type="submit"]').click();
        await catSaveResp;
        await page.locator('#categoryModal').waitFor({ state: 'hidden' });

        pCatOpts = await getFolderOptions('filterProjectCategory');
        lCatOpts = await getFolderOptions('filterLinkCategory');
        check('2.2 文件夹改名后，项目管理与外链筛选下拉均同步更新名称',
            pCatOpts.some(o => o.value === String(newCatId) && o.text === '动态研发线A改名') &&
            lCatOpts.some(o => o.value === String(newCatId) && o.text === '动态研发线A改名')
        );

        // 2.3 删除文件夹
        await page.locator(`tr[data-cat-id="${newCatId}"] button[title="删除文件夹"]`).click();
        const catDelResp = responseFor('category_delete');
        await page.locator('#btnCustomConfirmOk').click();
        await catDelResp;

        pCatOpts = await getFolderOptions('filterProjectCategory');
        lCatOpts = await getFolderOptions('filterLinkCategory');
        check('2.3 文件夹删除后，项目管理与外链筛选下拉均同步移除该选项',
            !pCatOpts.some(o => o.value === String(newCatId)) &&
            !lCatOpts.some(o => o.value === String(newCatId))
        );

        // ===================== 3. 验证发版弹窗的项目下拉同步 =====================
        // 创建一个测试项目
        await page.locator('#btnSubtabProjects').click();
        await page.locator('#overviewActionsProjects button.btn-primary').click();
        await page.locator('#itemModal').waitFor({ state: 'visible' });
        await page.locator('#itemName').fill('待删除发版项目');
        let itemSaveResp = responseFor('item_save');
        await page.locator('#btnItemSubmit').click();
        const itemSaveResult = await (await itemSaveResp).json();
        const tempItemId = itemSaveResult.data.id;
        await page.locator('#itemModal').waitFor({ state: 'hidden' });

        // 检查发版下拉中有该选项
        const hasInUploadSelect = async id => {
            return await page.evaluate(iid => {
                const sel = document.getElementById('uploadItemSelect');
                if (!sel) return false;
                return Array.from(sel.options).some(o => o.value === String(iid));
            }, id);
        };
        check('3.1 创建新项目后，发版所属项目下拉包含该项目', await hasInUploadSelect(tempItemId));

        // 删除该项目
        await page.locator(`tr#admin-item-row-${tempItemId} button[onclick="deleteItem(${tempItemId})"]`).click();
        const itemDelResp = responseFor('item_delete');
        await page.locator('#btnCustomConfirmOk').click();
        await itemDelResp;

        check('3.2 删除项目后，发版所属项目下拉即时移除该项目', !(await hasInUploadSelect(tempItemId)));

        // ===================== 4. 验证评审看板的项目与版本筛选同步 =====================
        // 创建一个新项目
        await page.locator('#overviewActionsProjects button.btn-primary').click();
        await page.locator('#itemModal').waitFor({ state: 'visible' });
        await page.locator('#itemName').fill('看板测试项目');
        itemSaveResp = responseFor('item_save');
        await page.locator('#btnItemSubmit').click();
        const kbItemResult = await (await itemSaveResp).json();
        const kbItemId = kbItemResult.data.id;
        await page.locator('#itemModal').waitFor({ state: 'hidden' });

        // 切换到数据概览 (Dashboard)
        await page.locator('#nav-dashboard').click();
        const getDashboardProjectOptions = async () => {
            return await page.evaluate(() => {
                const sel = document.getElementById('filterAnnoProject');
                if (!sel) return [];
                return Array.from(sel.options).map(o => ({ value: o.value, text: o.text.trim() }));
            });
        };
        let kbOpts = await getDashboardProjectOptions();
        check('4.1 新建项目后，评审看板项目筛选下拉自动包含该项目', kbOpts.some(o => o.value === String(kbItemId) && o.text === '看板测试项目'));

        // 项目改名
        await page.locator('#nav-overview').click();
        await page.locator(`tr#admin-item-row-${kbItemId} button.btn-edit-item-trigger`).click();
        await page.locator('#itemName').fill('看板测试项目改名');
        itemSaveResp = responseFor('item_save');
        await page.locator('#btnItemSubmit').click();
        await itemSaveResp;
        await page.locator('#itemModal').waitFor({ state: 'hidden' });

        await page.locator('#nav-dashboard').click();
        kbOpts = await getDashboardProjectOptions();
        check('4.2 项目改名后，评审看板项目筛选下拉自动同步新名称', kbOpts.some(o => o.value === String(kbItemId) && o.text === '看板测试项目改名'));

        // ===================== 5. 验证发版弹窗的评审群通知状态同步 =====================
        // 先检查初始无评审群时的状态
        await page.locator('.admin-content-header .close-x').click();
        await page.locator('#adminConsoleModal').waitFor({ state: 'hidden' });

        // 打开快速发版弹窗
        await page.evaluate(() => openUploadModal());
        await page.locator('#uploadModal').waitFor({ state: 'visible' });

        const isGlobalChannelConfigured = async () => {
            return await page.evaluate(() => {
                const status = document.getElementById('uploadNotifyGlobalStatus');
                const cb = document.getElementById('notifyGlobalWebhook');
                const card = document.getElementById('uploadNotifyGlobalCard');
                return status && status.textContent.trim() === '已配置' && cb && !cb.disabled && !card.classList.contains('is-disabled');
            });
        };

        check('5.1 初始未配置全站群 Webhook 时，发版评审群通道为未配置且置灰', !(await isGlobalChannelConfigured()));
        await page.evaluate(() => closeModal('uploadModal'));
        await page.locator('#uploadModal').waitFor({ state: 'hidden' });

        // 打开控制中心 -> 系统设置 -> 配置全站评审群 Webhook
        await page.locator('button[title="控制中心"]').click();
        await page.locator('#adminConsoleModal').waitFor({ state: 'visible' });
        await page.locator('#nav-brand').click();

        const globalWebhookInput = page.locator('#settingGlobalWebhook');
        await globalWebhookInput.fill('https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=global-synthetic');
        const saveSettingsResp = responseFor('save_settings');
        await globalWebhookInput.blur();
        await saveSettingsResp;

        // 关闭控制中心，重新打开快速发版弹窗
        await page.locator('.admin-content-header .close-x').click();
        await page.locator('#adminConsoleModal').waitFor({ state: 'hidden' });

        await page.evaluate(() => openUploadModal());
        await page.locator('#uploadModal').waitFor({ state: 'visible' });
        check('5.2 系统设置保存评审群 Webhook 后，发版通道即时同步为已配置且可勾选', await isGlobalChannelConfigured());

        // 清空评审群 Webhook
        await page.evaluate(() => closeModal('uploadModal'));
        await page.locator('#uploadModal').waitFor({ state: 'hidden' });

        await page.locator('button[title="控制中心"]').click();
        await page.locator('#adminConsoleModal').waitFor({ state: 'visible' });
        await page.locator('#nav-brand').click();

        await globalWebhookInput.fill('');
        const saveSettingsResp2 = responseFor('save_settings');
        await globalWebhookInput.blur();
        await saveSettingsResp2;

        await page.locator('.admin-content-header .close-x').click();
        await page.locator('#adminConsoleModal').waitFor({ state: 'hidden' });

        await page.evaluate(() => openUploadModal());
        await page.locator('#uploadModal').waitFor({ state: 'visible' });
        check('5.3 系统设置清空评审群 Webhook 后，发版通道即时恢复为未配置且置灰', !(await isGlobalChannelConfigured()));
        await page.evaluate(() => closeModal('uploadModal'));

        check('全流程无任何未捕获脚本报错', errors.length === 0);

        console.log(JSON.stringify({
            passed,
            errors,
            scope: 'Comprehensive dropdown and state sync verification (5 categories)'
        }));
    } finally {
        await browser.close();
    }
})().catch(err => {
    console.error(err);
    process.exit(1);
});
