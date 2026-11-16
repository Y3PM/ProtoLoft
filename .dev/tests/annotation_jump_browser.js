/* Production DOM/HTTP, installed Chrome and synthetic disposable records. */
const {chromium} = require(process.env.PLAYWRIGHT_MODULE);
const assert = require('assert'), fs = require('fs'), path = require('path');
const fixture = JSON.parse(process.env.ANNOTATION_JUMP_FIXTURE);
const output = path.resolve(__dirname, '../screenshots/annotation-jump-fixed');
fs.mkdirSync(output, {recursive: true});
let passed = 0;
function check(mode, label, condition) {
    assert(condition, mode + ': ' + label);
    passed++;
    console.log('PASS ' + mode + ': ' + label);
}

(async () => {
    const browser = await chromium.launch({channel: 'chrome', headless: true});
    const errors = [];
    try {
        for (const mode of ['admin', 'editor', 'viewer', 'guest']) {
            const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
            const page = await context.newPage();
            page.setDefaultTimeout(10000);
            page.on('pageerror', error => errors.push({mode, message: error.message}));
            const entry = fixture.base + (mode === 'guest' ? '/share.php?s=' + fixture.code : '/index.php');
            const frameId = mode === 'guest' ? 'shareFrame' : 'myFrame';
            const frame = page.locator('#' + frameId);
            const button = id => page.locator('#annoCard_' + id + ' .anno-page-link');
            const frameUrl = () => frame.evaluate(node => node.contentWindow.location.href);
            const waitPage = (version, name) => page.waitForFunction(({id, suffix}) => {
                const frame = document.getElementById(id);
                return frame && frame.contentWindow.location.pathname.endsWith(suffix)
                    && frame.contentDocument.readyState === 'complete';
            }, {id: frameId, suffix: '/asset.php/v' + version + '/' + name});

            await page.goto(entry);
            if (mode !== 'guest') {
                await page.locator('#adminLoginUser').fill(mode === 'admin' ? 'admin@test.com' : mode + '@test.com');
                await page.locator('#adminLoginPwd').fill(fixture.password);
                await page.locator('#btnAdminLogin').click();
                await page.locator('.user-badge').waitFor();
            }
            async function reset() {
                await page.goto(entry);
                await page.reload(); // Clearing only a hash may otherwise retain the current iframe document.
                if (mode !== 'guest') await page.locator('#item-node-' + fixture.item).click();
                await waitPage(fixture.version, 'index.html');
                await page.locator('#btnToggleAnnotation').click();
                await page.locator('#annoFilterAllPages').click();
                await button(fixture.annos[2]).waitFor();
            }
            async function holdOldResponse() {
                let release, started, delivered;
                const gate = new Promise(resolve => { release = resolve; });
                const start = new Promise(resolve => { started = resolve; });
                const done = new Promise(resolve => { delivered = resolve; });
                const pattern = '**/api.php?action=annotation_target&id=' + fixture.annos[1];
                await page.route(pattern, async route => {
                    const response = await route.fetch();
                    started();
                    await gate;
                    await route.fulfill({response});
                    delivered();
                });
                await button(fixture.annos[1]).click();
                async function bounded(promise) {
                    let timer;
                    try {
                        return await Promise.race([promise, new Promise((resolve, reject) => {
                            timer = setTimeout(() => reject(new Error(mode + ': delayed response did not settle')), 10000);
                        })]);
                    } finally { clearTimeout(timer); }
                }
                await bounded(start);
                return async () => {
                    release();
                    await bounded(done);
                    await page.waitForTimeout(200);
                    await page.unroute(pattern);
                };
            }

            await reset();
            check(mode, 'page identity and annotation controls render', (await page.title()).includes('立象') && await button(fixture.annos[0]).isVisible());
            const semantics = await button(fixture.annos[0]).evaluate(node => ({tag: node.tagName, tab: node.tabIndex, height: node.getBoundingClientRect().height}));
            check(mode, 'page entry is a keyboard-focusable shared 28px button', semantics.tag === 'BUTTON' && semantics.tab === 0 && semantics.height === 28);
            await page.frameLocator('#' + frameId).locator('#draft').fill('keep unsaved interaction');
            await button(fixture.annos[0]).focus();
            await button(fixture.annos[0]).press('Enter');
            await page.waitForFunction(id => document.getElementById(id).contentWindow.location.hash === '#p=details', frameId);
            check(mode, 'keyboard navigation resolves the Axure hash', new URL(await frameUrl()).hash === '#p=details');
            check(mode, 'hash navigation preserves the current document state', await page.frameLocator('#' + frameId).locator('#draft').inputValue() === 'keep unsaved interaction');
            // Wait for the drawer's existing delayed composer focus before the next keyboard action.
            await page.waitForTimeout(250);
            const samePageResponse = page.waitForResponse(response => response.url().includes('action=annotation_target&id=' + fixture.annos[0]));
            await button(fixture.annos[0]).press('Space');
            await samePageResponse;
            await page.waitForTimeout(100);
            check(mode, 'repeated same-page activation preserves interaction state', await page.frameLocator('#' + frameId).locator('#draft').inputValue() === 'keep unsaved interaction');
            await page.screenshot({path: path.join(output, mode + '-hash.png')});

            await button(fixture.annos[1]).click();
            await waitPage(fixture.version, 'page1.html');
            check(mode, 'ordinary cross-file navigation works', (await frameUrl()).endsWith('/page1.html'));

            await reset();
            let releaseOld = await holdOldResponse();
            await button(fixture.annos[2]).click();
            await waitPage(fixture.version, 'page2.html');
            const latestUrl = await frameUrl();
            await releaseOld();
            check(mode, 'late response cannot replace the latest page', await frameUrl() === latestUrl);
            check(mode, 'late response cannot replace the latest annotation route', new URL(page.url()).hash === '#annotation=' + fixture.annos[2]);
            await page.screenshot({path: path.join(output, mode + '-latest-page.png')});

            await reset();
            releaseOld = await holdOldResponse();
            await page.frameLocator('#' + frameId).locator('#next-page').click();
            await waitPage(fixture.version, 'page2.html');
            const manualUrl = await frameUrl(), manualRoute = page.url();
            await releaseOld();
            check(mode, 'manual prototype navigation cancels the pending jump', await frameUrl() === manualUrl && page.url() === manualRoute);

            if (mode !== 'guest') {
                await reset();
                releaseOld = await holdOldResponse();
                await page.locator('#item-node-' + fixture.other).click();
                await waitPage(fixture.other_version, 'index.html');
                const otherUrl = await frameUrl(), otherRoute = page.url();
                await releaseOld();
                check(mode, 'project switch invalidates the old response', await frameUrl() === otherUrl && page.url() === otherRoute);

                await reset();
                releaseOld = await holdOldResponse();
                await page.locator('#barVerSelect').selectOption({label: 'V0'});
                await waitPage(fixture.old_version, 'index.html');
                const oldUrl = await frameUrl(), oldRoute = page.url();
                await releaseOld();
                check(mode, 'version switch invalidates the old response', await frameUrl() === oldUrl && page.url() === oldRoute);
            } else {
                await page.setViewportSize({width: 390, height: 844});
                const fits = await page.locator('.anno-page-link').evaluateAll(nodes => nodes.every(node =>
                    node.getBoundingClientRect().width <= node.closest('.anno-card').clientWidth
                    && node.scrollWidth <= node.clientWidth + 1));
                check(mode, 'long page names fit the narrow annotation drawer', fits);
                await page.screenshot({path: path.join(output, 'guest-mobile.png')});
            }
            await context.close();
        }
        check('all roles', 'no application script errors', errors.length === 0);
        console.log(JSON.stringify({passed, roles: ['admin', 'editor', 'viewer', 'guest'], errors}));
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
