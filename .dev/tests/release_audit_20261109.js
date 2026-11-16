/* Real Chrome diagnostic companion. Each observation states expected vs actual. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE);
const fixture = JSON.parse(process.env.RELEASE_AUDIT_FIXTURE);
const observations = [];
const screenshotDir = require('path').resolve(__dirname, '../screenshots/release-audit-20261109');
require('fs').mkdirSync(screenshotDir, {recursive:true});
(async () => {
    const browser = await chromium.launch({channel:'chrome', headless:true});
    try {
        const context = await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Singapore'});
        context.setDefaultTimeout(8000);
        const page = await context.newPage(), errors = [], warnings = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {if(message.type()==='warning') warnings.push(message.text());});
        async function capture(name) {
            await page.evaluate(() => Promise.all(document.getAnimations().filter(animation => animation.effect.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
            await page.screenshot({path:require('path').join(screenshotDir,name)});
        }
        async function login(email) {
            await page.goto(fixture.base + '/index.php');
            await page.locator('#adminLoginUser').fill(email);
            await page.locator('#adminLoginPwd').fill(fixture.password);
            await page.locator('#btnAdminLogin').click();
            await page.locator('.user-badge').waitFor();
        }
        await login('editor@test.com');
        await page.locator('button[title="控制中心"]').click();
        await page.locator('#nav-overview').click();
        await page.locator('#btnSubtabProjects').click();
        await page.locator('#admin-item-row-' + fixture.read_only_item + ' .btn-table-ver').click();
        observations.push({id:'read_only_project_publish_button', expected_visible:false,
            actual:await page.locator('#btnVerManagePublish').evaluate(node => ({inline_display:node.style.display,computed_display:getComputedStyle(node).display})),
            can_edit:await page.evaluate(() => currentVerManageCanEdit)});
        if (await page.locator('#btnVerManagePublish').isVisible()) {
            await page.locator('#btnVerManagePublish').click();
            observations.push({id:'read_only_publish_click', upload_modal_visible:await page.locator('#uploadModal').isVisible(),feedback:await page.locator('#toastContainer').innerText()});
        } else {
            observations.push({id:'read_only_publish_click', upload_modal_visible:false, feedback:'button hidden as expected'});
        }
        if (await page.locator('#versionManageModal').isVisible()) {
            await page.locator('#versionManageModal').getByTitle('关闭', {exact:true}).click();
        }
        // Open the existing application handler, then use the actual form/HTTP.
        await page.evaluate(cat => openItemModal(0, cat, 'project'), fixture.category);
        await page.locator('#itemName').fill('本次新建的协作项目');
        const saved = page.waitForResponse(response => response.url().endsWith('/api.php') && response.request().postData()?.includes('item_save'));
        await page.locator('#btnItemSubmit').click();
        const newId = Number((await (await saved).json()).data.id);
        await page.locator('#admin-item-row-' + newId).waitFor();
        await page.locator('#admin-item-row-' + newId + ' .btn-table-ver').click();
        await page.locator('#versionManageModal').waitFor({state:'visible'});
        observations.push({id:'new_editor_project_permissions', newId, expected_can_edit:true,
            actual_can_edit:await page.evaluate(() => currentVerManageCanEdit),
            publish_visible:await page.locator('#btnVerManagePublish').isVisible(),
            empty_state:await page.locator('#verManageEmpty').innerText()});
        await page.locator('#btnVerManagePublish').click();
        await page.locator('#uploadVerName').fill('V1');
        await page.locator('#uploadZipFile').setInputFiles({name:'audit.zip',mimeType:'application/zip',buffer:Buffer.from(fixture.zip_base64,'base64')});
        await page.locator('#btnUploadSubmit').click();
        await page.locator('#uploadModal').waitFor({state:'hidden'});
        await page.locator('#admin-item-row-' + newId + ' .btn-table-ver').click();
        await page.locator('#versionManageModal .ver-card').waitFor();
        observations.push({id:'new_editor_project_after_publish', expected_edit_controls:1, actual_edit_controls:await page.locator('#versionManageModal .btn-ver-edit').count(),
            actual_rp_upload_controls:await page.locator('#versionManageModal .btn-table-rp-add').count()});
        await capture('new-editor-project.png');
        await page.reload();
        await page.locator('#item-node-' + fixture.item).click();
        await page.locator('#btnToggleAnnotation').click();
        await page.locator('#annoCard_' + fixture.annotation).waitFor();
        observations.push({id:'annotation_timezone_render', expected:'刚刚', actual:await page.locator('#annoCard_' + fixture.annotation + ' .anno-card-time').innerText()});
        await page.locator('#btnToggleAnnotation').click();
        const authorBefore = await page.locator('#barTime').innerText();
        await page.locator('.user-badge').click();
        await page.locator('#myDisplayName').fill('已改名的项目负责人');
        await page.locator('#btnSaveProfile').click();
        await page.waitForFunction(() => CURRENT_USER.name === '已改名的项目负责人');
        await page.locator('#profileModal .close-x').click();
        observations.push({id:'historical_author_hot_sync', expected_author:'测试超管', before:authorBefore, after:await page.locator('#barTime').innerText()});
        await capture('author-snapshot.png');

        await page.locator('#barBtnVerManage').click();
        await page.evaluate(id => openEditVersionModal(id), fixture.versions[1]);
        await page.locator('#editVerName').fill('V2-已修改名称');
        await page.locator('#editVerChangelog').fill('已修改后的更新说明');
        await page.locator('#btnSaveVerEdit').click();
        await page.locator('#versionEditModal').waitFor({state:'hidden'});
        await page.locator('#versionManageModal').getByTitle('关闭', {exact:true}).click();
        observations.push({id:'rename_top_version', expected:'V2-已修改名称', actual:await page.locator('#barVerSelect option:checked').innerText(),
            optionData:await page.locator('#barVerSelect option:checked').evaluate(node => ({attribute:node.getAttribute('data-ver-id'), cached:$(node).data('ver-id')}))});
        await page.locator('#barChangelogBtn').click();
        observations.push({id:'rename_top_changelog', expected:'已修改后的更新说明', actual:await page.locator('#topChangelogBody').innerText()});
        await capture('version-rename.png');
        await page.reload();
        await page.locator('#item-node-' + fixture.item).click();
        await page.locator('#barBtnVerManage').click();
        const rpCard = page.locator('#ver-row-' + fixture.versions[1]);
        await rpCard.getByTitle('移除此版本的 RP 底稿', {exact:true}).click();
        await page.getByRole('button', {name:'移除底稿',exact:true}).click();
        await rpCard.getByTitle('为此版本补传 Axure RP 底稿', {exact:true}).waitFor();
        await page.locator('#versionManageModal').getByTitle('关闭', {exact:true}).click();
        await page.locator('#barVerSelect').selectOption({index:1});
        await page.locator('#barVerSelect').selectOption({index:0});
        const rpResponse = await context.request.get(fixture.base + '/api.php?action=download_rp&ver_id=' + fixture.versions[1]);
        observations.push({id:'removed_rp_reappears_after_version_switch', expected_download_button:false,
            actual_download_button:await page.locator('#btnDownloadRp').isVisible(), download_http:rpResponse.status()});
        await capture('rp-stale-option.png');
        await page.goto(fixture.base + '/index.php#annotation=' + fixture.link_annotation);
        await page.waitForFunction(() => document.body.innerText.includes('版本已删除或不可访问') || document.querySelector('#annoCard_' + location.hash.split('=')[1]));
        observations.push({id:'link_annotation_deeplink', expected:'show exact external-link annotation',
            error_toast:(await page.locator('#toastContainer').innerText()).trim(),
            selected_item:await page.evaluate(() => currentSelectedItemId), expected_item:fixture.link});
        await capture('link-annotation-route.png');

        const guestContext = await browser.newContext({viewport:{width:1280,height:800},timezoneId:'Asia/Singapore'});
        const guest = await guestContext.newPage();
        await guest.addInitScript(() => {
            window.auditClipboardWrites = [];
            Object.defineProperty(navigator, 'clipboard', {value:{writeText:async text => window.auditClipboardWrites.push(text)}});
        });
        await guest.goto(fixture.base + '/share.php?s=' + fixture.link_share);
        await guest.locator('#btnToggleAnnotation').click();
        await guest.locator('.anno-card').first().waitFor();
        await guest.locator('.anno-card').first().getByRole('button', {name:'复制链接',exact:true}).click();
        observations.push({id:'share_annotation_copy', expected_clipboard_writes:1, actual:await guest.evaluate(() => ({writes:window.auditClipboardWrites,copy_function:typeof window.copyMcpText}))});
        console.log(JSON.stringify({browser_observations:observations, browser:'installed Chrome', url:page.url(), title:await page.title(), errors, warnings:[...new Set(warnings)]},null,2));
    } finally {await browser.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
