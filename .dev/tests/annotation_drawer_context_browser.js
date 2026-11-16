const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const fs = require('fs'), path = require('path'), assert = require('assert');
const f = JSON.parse(process.env.DRAWER_CONTEXT_FIXTURE);
const checks = [], errors = [];
function check(role, name, passed, detail = {}) {
  checks.push({ role, name, passed: !!passed, detail });
  console.log((passed ? 'PASS ' : 'FAIL ') + role + ': ' + name + ' ' + JSON.stringify(detail));
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Network gate timed out')), 10000);
  })]); } finally { clearTimeout(timer); }
}
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const role of ['admin', 'editor', 'viewer']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push({ role, message: error.message }));
      await page.goto(f.base + '/index.php');
      await page.locator('#adminLoginUser').fill(role === 'admin' ? 'admin@test.com' : role + '@test.com');
      await page.locator('#adminLoginPwd').fill(f.password);
      await page.locator('#btnAdminLogin').click();
      await page.locator('.user-badge').waitFor();
      async function select(item, version) {
        await page.locator('#item-node-' + item).click();
        if (version) {
          await page.waitForFunction(({ item, version }) => document.getElementById('item-node-' + item) &&
            Array.from(document.getElementById('barVerSelect').options).some(o => Number(o.dataset.verId) === version), { item, version });
          await page.locator('#barVerSelect').selectOption({ value: await page.locator('#barVerSelect option[data-ver-id="' + version + '"]').getAttribute('value') });
          await page.waitForFunction(version => document.getElementById('myFrame').contentWindow.location.pathname.includes('/v' + version + '/'), version);
        }
      }
      const previous = () => page.locator('#annoHistoryToolbar').click();
      async function historyContains(text) { await page.locator('#annoPreviousPanel').getByText(text, { exact: true }).waitFor(); }
      await select(f.a, f.versions.a[2]);
      await page.locator('#btnToggleAnnotation').click();
      await page.locator('#annoCard_' + f.ids.A3).waitFor();
      await previous();
      await historyContains('A2 独立批注');
      const initial = await page.evaluate(() => ({ currentVisible: getComputedStyle(document.getElementById('annoListBody')).display !== 'none',
        historyVisible: getComputedStyle(document.getElementById('annoPreviousPanel')).display !== 'none',
        currentText: document.getElementById('annoListBody').textContent }));
      check(role, 'history view hides the current-version list', !initial.currentVisible && initial.historyVisible, initial);
      if (role === 'admin') {
        await page.screenshot({ path: path.join(f.output, 'history-' + (f.observe ? 'before' : 'after') + '.png') });
        await page.locator('#annotationDrawer').screenshot({ path: path.join(f.output, 'history-cards-desktop.png') });
      }

      await select(f.b, f.versions.b[1]);
      await page.waitForTimeout(250);
      const switched = await page.evaluate(() => ({ all: document.getElementById('annoStatusAll').classList.contains('active'),
        historyHidden: document.getElementById('annoPreviousPanel').hidden,
        bodyVisible: getComputedStyle(document.getElementById('annoListBody')).display !== 'none',
        text: document.getElementById('annoListBody').textContent,
        footer: getComputedStyle(document.getElementById('annoFooter')).display }));
      check(role, 'project switch resets to this project and all current annotations', switched.all && switched.historyHidden &&
        switched.bodyVisible && switched.text.includes('B2 独立批注') && !switched.text.includes('A3 独立批注'), switched);
      // Normalize only the test driver so later baseline observations can run.
      await page.locator('#annoStatusAll').click();
      await previous(); await historyContains('B1 独立批注');
      check(role, 'new project history belongs only to its own preceding version', !(await page.locator('#annoPreviousPanel').innerText()).includes('A2 独立批注'));

      await select(f.a, f.versions.a[2]);
      await page.locator('#annoStatusAll').click(); await previous(); await historyContains('A2 独立批注');
      const changeVersion = async version => {
        const value = await page.locator('#barVerSelect option[data-ver-id="' + version + '"]').getAttribute('value');
        await page.locator('#barVerSelect').selectOption(value);
      };
      await changeVersion(f.versions.a[1]); await page.waitForTimeout(350);
      const versionState = await page.evaluate(() => ({ active: document.getElementById('annoHistoryToolbar').classList.contains('active'),
        text: document.getElementById('annoPreviousPanel').textContent, footer: getComputedStyle(document.getElementById('annoFooter')).display }));
      check(role, 'version switch reloads the preceding version with consistent controls', versionState.active &&
        versionState.text.includes('A1 独立批注') && !versionState.text.includes('A2 独立批注') && versionState.footer === 'none', versionState);
      await changeVersion(f.versions.a[0]); await page.waitForTimeout(250);
      check(role, 'oldest version returns to all and hides unavailable history', await page.evaluate(() =>
        document.getElementById('annoHistoryToolbar').hidden && document.getElementById('annoStatusAll').classList.contains('active') &&
        document.getElementById('annoPreviousPanel').hidden));

      await select(f.a, f.versions.a[2]); await page.locator('#annoStatusAll').click();
      const gate = deferred(), started = deferred(), delivered = deferred();
      const pattern = '**/api.php?action=previous_annotations&ver_id=' + f.versions.a[2];
      await page.route(pattern, async route => {
        const response = await route.fetch(); started.resolve(); await gate.promise;
        await route.fulfill({ response }); delivered.resolve();
      });
      await previous(); await bounded(started.promise);
      await select(f.b, f.versions.b[1]); await page.locator('#annoStatusAll').click();
      await previous(); await historyContains('B1 独立批注');
      gate.resolve(); await bounded(delivered.promise); await page.unroute(pattern); await page.waitForTimeout(100);
      check(role, 'late history from another project cannot overwrite the new project',
        (await page.locator('#annoPreviousPanel').innerText()).includes('B1 独立批注') &&
        !(await page.locator('#annoPreviousPanel').innerText()).includes('A2 独立批注'));

      await select(f.empty); await page.waitForTimeout(600);
      const emptyState = await page.evaluate(() => ({ historyHidden: document.getElementById('annoPreviousPanel').hidden,
        all: document.getElementById('annoStatusAll').classList.contains('active'),
        disabled: document.getElementById('btnSendAnno').disabled,
        text: document.getElementById('annoListBody').textContent }));
      check(role, 'empty project clears old context and disables the composer', emptyState.historyHidden && emptyState.all &&
        emptyState.disabled && !/A[123] 独立批注|B[12] 独立批注/.test(emptyState.text), emptyState);
      await page.evaluate(id => selectItem(id, document.getElementById('item-node-' + id)), f.link);
      await page.locator('#btnToggleAnnotation').click();
      await page.locator('#annoCard_' + f.ids.link).waitFor();
      check(role, 'external link clears history and uses its own comment context', await page.locator('#annoHistoryToolbar').isHidden() &&
        await page.locator('#annoPreviousPanel').isHidden() && !(await page.locator('#btnSendAnno').isDisabled()) &&
        (await page.locator('#annoListBody').innerText()).includes('外链 独立批注'));

      if (!f.observe) {
        await select(f.a, f.versions.a[2]); await previous(); await historyContains('A2 放置四十五天');
        const styles = await page.locator('.anno-history-card').evaluateAll(nodes => nodes.map(n => ({
          classes: n.className, age: n.querySelector('time') && n.querySelector('time').textContent,
          color: getComputedStyle(n).backgroundColor, opacity: getComputedStyle(n).opacity })));
        check(role, 'three ages produce distinct paper treatments and clear age text', styles.length === 3 &&
          new Set(styles.map(s => s.color)).size === 3 && styles.every(s => s.age && s.opacity === '1'), styles);
        check(role, 'page-scope controls are disabled in version-wide history', await page.locator('#annoFilterCurPage').isDisabled() &&
          await page.locator('#annoFilterAllPages').isDisabled());

        // Re-enter history in the same context: an older success must not replace
        // the newer request's network error.
        await page.locator('#annoStatusAll').click();
        const oldGate = deferred(), oldStarted = deferred(), oldDone = deferred(); let requests = 0;
        await page.route(pattern, async route => {
          requests++;
          if (requests > 1) return route.abort('failed');
          const response = await route.fetch(); oldStarted.resolve(); await oldGate.promise;
          await route.fulfill({ response }); oldDone.resolve();
        });
        await previous(); await bounded(oldStarted.promise); await page.locator('#annoStatusAll').click(); await previous();
        await page.locator('#annoPreviousPanel .anno-history-error').waitFor();
        oldGate.resolve(); await bounded(oldDone.promise); await page.waitForTimeout(100); await page.unroute(pattern);
        check(role, 'stale success cannot replace a newer history failure', await page.locator('#annoPreviousPanel .anno-history-error').isVisible());
        await page.locator('#annoStatusAll').click(); await previous(); await historyContains('A2 独立批注');
        const carriedResponse = page.waitForResponse(response => (response.request().postData() || '').includes('carry_annotation'));
        await page.locator('.anno-history-card[data-annotation-id="' + f.ids.A2 + '"] button').click();
        const carried = await (await carriedResponse).json();
        assert(carried.success, JSON.stringify(carried));
        await page.waitForFunction(() => document.getElementById('annoStatusAll').classList.contains('active'));
        await page.locator('#annoCard_' + carried.data.id).waitFor();
        check(role, 'carry switches back to the current list and normal composer', await page.locator('#annoCard_' + carried.data.id).isVisible() &&
          !(await page.locator('#annoPreviousPanel').isVisible()) && await page.locator('#annoFooter').isVisible());
        await page.setViewportSize({ width: 390, height: 844 });
        await page.locator('#annoHistoryToolbar').click(); await historyContains('A2 放置四十五天');
        const narrow = await page.locator('#annoPreviousPanel').evaluate(n => ({ scrollWidth: n.scrollWidth,
          clientWidth: n.clientWidth, left: n.getBoundingClientRect().left, right: n.getBoundingClientRect().right, viewport: innerWidth }));
        check(role, 'history has no internal horizontal overflow at narrow viewport', narrow.scrollWidth <= narrow.clientWidth + 1, narrow);
        if (role === 'admin') await page.screenshot({ path: path.join(f.output, 'history-mobile.png') });
      }
      await context.close();
    }
    // Share visitors have the same drawer lifecycle but no internal history UI.
    const guest = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await guest.newPage(); page.on('pageerror', error => errors.push({ role: 'guest', message: error.message }));
    await page.goto(f.base + '/share.php?s=' + f.share);
    await page.locator('#btnToggleAnnotation').click(); await page.locator('#annoCard_' + f.ids.A3).waitFor();
    check('guest', 'authorized share opens its own current-version comments', (await page.locator('#annoListBody').innerText()).includes('A3 独立批注'));
    check('guest', 'internal history UI is not exposed', await page.locator('#annoHistoryToolbar').count() === 0);
    check('all', 'no application runtime errors', errors.length === 0, errors);
    const summary = { checks, errors, passed: checks.filter(c => c.passed).length, failed: checks.filter(c => !c.passed).length };
    fs.writeFileSync(path.join(f.output, 'results.json'), JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ passed: summary.passed, failed: summary.failed }));
    if (!f.observe) assert(summary.failed === 0, 'Drawer regression expectations failed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
