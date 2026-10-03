const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const fs = require('node:fs');

const root = path.resolve(__dirname, '../dist');
const spec = JSON.parse(fs.readFileSync(path.join(root, 'docs/api/openapi.json'), 'utf8'));
const operationCount = Object.values(spec.paths).reduce((count, item) => count + Object.keys(item).length, 0);

(async () => {
  const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', headless: true});
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({viewport: {width, height: 1000}});
      await page.goto(pathToFileURL(path.join(root, 'docs/api/index.html')).href);
      await page.evaluate(() => document.fonts.ready);
      for (const item of Object.values(spec.paths)) {
        for (const operation of Object.values(item)) {
          assert.equal(await page.locator(`#${operation.operationId}`).count(), 1);
        }
      }
      assert.equal(await page.locator('.api-operation').count(), operationCount);
      assert.equal(await page.locator('script').count(), 0, 'No runtime reference bundle');
      const style = await page.evaluate(() => ({
        bodyFont: getComputedStyle(document.body).fontFamily,
        codeFont: getComputedStyle(document.querySelector('code')).fontFamily,
        background: getComputedStyle(document.body).backgroundColor,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      }));
      assert.match(style.bodyFont, /Rubik/);
      assert.match(style.codeFont, /JetBrains Mono/);
      assert.equal(style.background, 'rgb(244, 245, 243)');
      assert.equal(style.overflow, false, 'No page-wide horizontal overflow');
      if (width === 390) {
        const outline = page.locator('.api-mobile-outline');
        await outline.locator('summary').focus();
        await page.keyboard.press('Enter');
        assert.equal(await outline.getAttribute('open'), '');
        assert.equal(await outline.locator('a[href="#commitEncryptionMigration"]').isVisible(), true);
        await outline.locator('summary').click();
      }
      await page.screenshot({path: `/tmp/vylk-api-${width}.png`});
      await page.locator('#saveNote').scrollIntoViewIfNeeded();
      assert.ok(await page.locator('#saveNote pre code').evaluate(element => parseFloat(getComputedStyle(element).fontSize)) >= 12);
      await page.screenshot({path: `/tmp/vylk-api-operation-${width}.png`});
      await page.goto(pathToFileURL(path.join(root, 'docs/api/client-protocol.html')).href);
      assert.match(await page.locator('main').textContent(), /not textual deltas/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.screenshot({path: `/tmp/vylk-api-guide-${width}.png`});
      await page.goto(pathToFileURL(path.join(root, 'docs/index.html')).href);
      assert.equal(await page.locator('.docs-nav a[href="api/"]').isVisible(), true);
      await page.close();
    }
    console.log('API reference and protocol guide passed at desktop and mobile sizes.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
