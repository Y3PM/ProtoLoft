/* Harmless markers in real uploaded SVG documents, with no external navigation. */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE);
const path = require('path');
const fixture = JSON.parse(process.env.SVG_SEMANTIC_FIXTURE);
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 240 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(fixture.url);
    const before = await page.locator('svg').getAttribute('data-review-executed');
    if (fixture.name === 'encoded_protocol') await page.locator('a').click();
    const observed = await page.locator('svg').evaluate(element => ({
      after: element.getAttribute('data-review-executed'), text: element.querySelector('text').textContent,
      tags: Array.from(element.children).map(node => ({ name: node.localName, namespace: node.namespaceURI }))
    }));
    await page.locator('svg').screenshot({ path: path.join(fixture.output, fixture.name + '-executed.png') });
    console.log(JSON.stringify({ before, ...observed, errors, browser: browser.version() }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
