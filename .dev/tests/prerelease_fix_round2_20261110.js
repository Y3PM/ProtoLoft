/* A harmless DOM marker proves execution in a real uploaded SVG document. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const path = require('path');
const fixture = JSON.parse(process.env.SVG_PREFIX_FIXTURE);
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(fixture.url);
    const observed = await page.locator('svg').evaluate(element => {
      const script = Array.from(element.children).find(node => node.localName === 'script');
      return { marker: element.getAttribute('data-prefix-script'), namespace: script && script.namespaceURI,
        text: element.querySelector('text').textContent };
    });
    await page.locator('svg').screenshot({ path: path.join(fixture.output, 'dotted-prefix-script-executed.png') });
    console.log(JSON.stringify({ ...observed, errors, browser: browser.version() }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
