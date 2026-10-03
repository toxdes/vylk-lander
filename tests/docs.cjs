const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const encryptionAnchor = '#end-to-end-encryption';

async function checkDocument(page) {
  const brokenAnchors = await page.locator('a[href^="#"]').evaluateAll(links =>
    links.map(link => link.getAttribute('href')).filter(href =>
      href.length > 1 && !document.getElementById(decodeURIComponent(href.slice(1)))));
  assert.deepEqual(brokenAnchors, [], 'Every local section link must resolve');
  assert.ok(await page.evaluate(() =>
    document.documentElement.scrollWidth <= innerWidth + 1), 'No page-wide horizontal overflow');
  for (const command of await page.locator('code').allTextContents()) {
    if (command.startsWith('go build')) {
      assert.match(command, /-X vylk\/internal\/server\.version=/);
      assert.match(command, /-o vylk \.\/cmd\/vylk$/);
    }
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.resolve(__dirname, '../docs/index.html')).href + encryptionAnchor);
      await page.evaluate(() => document.fonts.ready);
      const encryption = page.locator(encryptionAnchor);
      assert.equal(await encryption.locator('h2').textContent(), 'End-to-end encryption');
      assert.match(await encryption.textContent(), /Plain HTTP on a LAN IP does not qualify/);
      assert.match(await encryption.textContent(), /lose both the passphrase and recovery key/);
      assert.match(await encryption.textContent(), /not revoke a key or old wrapped-key copy/);
      const variables = await page.locator('#config tbody tr td:first-child').allTextContents();
      assert.ok(variables.includes('VYLK_DISABLE_VAULT_CHANGES'));
      assert.ok(variables.includes('VYLK_NO_BROWSER'));
      assert.ok(variables.includes('VYLK_PASSWORD_FILE'));
      assert.ok(!variables.some(variable => /^VYLK_(ENCRYPTION|MIGRATE_ENCRYPTION)/.test(variable)));
      const offline = await page.locator('#offline').textContent();
      assert.match(offline, /Sign-out retains cached notes and pending edits/);
      assert.match(offline, /Keep changes/);
      assert.match(offline, /Switch permanently discards/);
      assert.doesNotMatch(offline, /sign-out clears|With no pending edits/);
      const features = await page.locator('#features').textContent();
      assert.match(features, /Reduce motion/);
      assert.match(features, /Ctrl\+4/);
      assert.match(features, /Inter at 125%/);
      await checkDocument(page);
      assert.doesNotMatch(await page.locator('main').textContent(), /After the Toxdes tap is published|Until then/);
      await encryption.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/vylk-docs-e2ee-${width}.png` });

      await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
      await page.evaluate(() => document.fonts.ready);
      const help = page.locator('.why a[href="docs/index.html' + encryptionAnchor + '"]');
      assert.equal(await help.count(), 1, 'Homepage encryption feature links to the guide');
      assert.match(await page.locator('.why').textContent(), /end-to-end encryption/);
      assert.doesNotMatch(await page.locator('.why').textContent(), /Titles and tags are stored separately/);
      await checkDocument(page);
      await help.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `/tmp/vylk-home-features-${width}.png` });
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('Documentation and feature links passed at desktop and mobile sizes.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
