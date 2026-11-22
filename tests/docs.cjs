const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Run after a build: the pages are generated from VYLK's docs/ into dist/docs/.
const docs = path.resolve(__dirname, '../dist/docs');
const pages = ['index.html', 'how-to.html', 'concepts.html', 'encryption.html', 'cli-reference.html'];
const legacy = {
  'end-to-end-encryption': 'encryption.html',
  install: 'index.html#install-vylk',
  config: 'cli-reference.html#environment-variables',
  security: 'how-to.html#keep-your-notes-safe',
};
const url = target => {
  const [file, anchor] = target.split('#');
  return pathToFileURL(path.join(docs, file)).href + (anchor ? '#' + anchor : '');
};

async function checkDocument(page) {
  const brokenAnchors = await page.locator('a[href^="#"]').evaluateAll(links =>
    links.map(link => link.getAttribute('href')).filter(href =>
      href.length > 1 && !document.getElementById(decodeURIComponent(href.slice(1)))));
  assert.deepEqual(brokenAnchors, [], 'Every local section link must resolve');
  assert.ok(await page.evaluate(() =>
    document.documentElement.scrollWidth <= innerWidth + 1), 'No page-wide horizontal overflow');
  assert.doesNotMatch(await page.locator('main').textContent(), /__VYLK_VERSION__|\{\{/);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      for (const file of pages) {
        await page.goto(url(file));
        await page.evaluate(() => document.fonts.ready);
        assert.equal(await page.locator('h1').count(), 1, `${file} has one h1`);
        assert.equal(await page.locator(`.toc a[href="${file}"][aria-current="page"]`).count(), 2, `${file} marks itself in both outlines`);
        await checkDocument(page);
        await page.screenshot({ path: `/tmp/vylk-docs-${file.replace('.html', '')}-${width}.png`, fullPage: false });
      }

      for (const [anchor, target] of Object.entries(legacy)) {
        await page.goto(url('index.html') + '#' + anchor);
        await page.waitForURL(url(target));
      }

      await page.goto(url('encryption.html'));
      const encryption = await page.locator('main').textContent();
      assert.match(encryption, /is not a secure context/);
      assert.match(encryption, /lose both the encryption password and the recovery key/);
      assert.match(encryption, /A wrapper or vault key that someone copied earlier still works/);

      await page.goto(url('cli-reference.html'));
      const variables = await page.locator('#environment-variables tbody tr td:first-child').allTextContents();
      for (const variable of ['VYLK_PASSWORD_FILE', 'VYLK_NO_BROWSER', 'VYLK_DISABLE_VAULT_CHANGES']) {
        assert.ok(variables.includes(variable), `${variable} is documented`);
      }
      assert.ok(!variables.some(variable => /^VYLK_(ENCRYPTION|MIGRATE_ENCRYPTION)/.test(variable)));

      await page.goto(url('index.html'));
      assert.match(await page.locator('#install-vylk').textContent(), /toxdes\/vylk:\d+\.\d+\.\d+/);

      await page.goto(pathToFileURL(path.resolve(docs, '../index.html')).href);
      assert.equal(await page.locator('.why a[href="docs/encryption.html"]').count(), 1, 'Homepage encryption feature links to the guide');
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('Documentation pages, legacy anchors, and feature links passed at desktop and mobile sizes.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
