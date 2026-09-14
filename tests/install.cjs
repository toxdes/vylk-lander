const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: async text => { window.copiedText = text; } }, configurable: true });
      });
      const section = page.locator('#install');
      await section.scrollIntoViewIfNeeded();
      assert.equal(await page.locator('[data-os-tab="linux"]').getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('[data-linux-tab="ubuntu"]').getAttribute('aria-selected'), 'true');
      assert.equal(await page.locator('.command-row:visible').count(), 2);
      await section.screenshot({ path: '/tmp/vylk-install-concise-' + width + '.png' });
      assert.equal(await section.locator('select,[role="combobox"]').count(), 0, 'No installation dropdowns');
      await page.locator('[data-linux-tab="binary"]').click();
      const arm = page.locator('[data-linux-download="arm64"]');
      assert.match(await arm.getAttribute('href'), /arm64.tar.gz$/);
      // Exercise the real link handler without downloading a release in a UI test.
      await arm.evaluate(el => el.addEventListener('click', event => event.preventDefault(), { once: true }));
      await arm.click();
      assert.match(await page.locator('[data-linux-install]').textContent(), /arm64.tar.gz \| sudo tar xzC \/$/);
      await page.locator('.copy-button:visible').first().click();
      assert.equal(await page.evaluate(() => window.copiedText), 'curl -fsSL https://packages.toxdes.com/releases/vylk_3.0.0_arm64.tar.gz | sudo tar xzC /');
      for (const method of ['ubuntu', 'fedora', 'arch', 'binary', 'linux-docker', 'source']) {
        await page.locator('[data-linux-tab="' + method + '"]').click();
        const panel = page.locator('[data-linux-panel="' + method + '"]');
        assert.ok(await panel.isVisible());
        if (['ubuntu', 'fedora'].includes(method)) {
          await panel.locator('summary').click();
          assert.equal(await panel.locator('details .command-row').count(), 1, 'Repository setup copies in one click');
          if (method === 'ubuntu') assert.equal((await panel.locator('details code').textContent()).split(' && ').length, 5);
          if (method === 'ubuntu') {
            assert.match(await panel.locator('details code').textContent(), /toxdes-archive-keyring\.gpg/);
            assert.match(await panel.locator('details code').textContent(), /sources\.list\.d\/toxdes\.list/);
            assert.doesNotMatch(await panel.locator('details code').textContent(), /vylk-archive-keyring|sources\.list\.d\/vylk\.list/);
          }
          if (method === 'fedora') {
            assert.match(await panel.locator('details code').textContent(), /\[toxdes\]/);
            assert.match(await panel.locator('details code').textContent(), /yum\.repos\.d\/toxdes\.repo/);
            assert.doesNotMatch(await panel.locator('details code').textContent(), /\[vylk\]|yum\.repos\.d\/vylk\.repo/);
          }
          assert.ok(await panel.locator('details .command-row').first().isVisible());
          await panel.locator('details .copy-button').first().click();
          assert.equal(await page.evaluate(() => window.copiedText), await panel.locator('details code').first().textContent());
        }
      }
      await page.locator('[data-linux-tab="source"]').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('[data-linux-tab="ubuntu"]').getAttribute('aria-selected'), 'true');
      await page.locator('[data-os-tab="windows"]').click();
      assert.ok(await page.locator('[data-os-panel="windows"]').isVisible());
      assert.equal(await page.locator('[data-windows-tab="binary"]').getAttribute('aria-selected'), 'true');
      assert.ok(await page.locator('[data-windows-panel="binary"]').isVisible());
      assert.match(await page.locator('[data-os-panel="windows"]').textContent(), /executable/i);
      assert.match(await page.locator('[data-release-asset="vylk_windows_amd64_{version}.exe"]').getAttribute('href'), /vylk_windows_amd64_3\.0\.0\.exe$/);
      assert.match(await page.locator('[data-windows-panel="binary"] code').last().textContent(), /vylk_windows_amd64_3\.0\.0\.exe$/);
      assert.equal(await page.locator('.command-row:visible').count(), 2);
      await page.locator('[data-windows-tab="docker"]').click();
      assert.equal(await page.locator('[data-windows-tab="docker"]').getAttribute('aria-selected'), 'true');
      assert.ok(await page.locator('[data-windows-panel="docker"]').isVisible());
      assert.equal(await page.locator('.command-row:visible').count(), 1);
      await section.screenshot({ path: '/tmp/vylk-install-windows-' + width + '.png' });
      await page.locator('[data-os-tab="macos"]').click();
      assert.equal(await page.locator('[data-os-tab="macos"]').getAttribute('aria-selected'), 'true');
      assert.match(await page.locator('[data-os-panel="macos"]').textContent(), /Homebrew/);
      assert.equal(await page.locator('[data-macos-tab="homebrew"]').getAttribute('aria-selected'), 'true');
      assert.ok(await page.locator('[data-macos-panel="homebrew"]').isVisible());
      assert.equal(await page.locator('.command-row:visible').count(), 1, 'Homebrew install command is available');
      assert.match(await page.locator('[data-macos-panel="homebrew"] code').textContent(), /brew install toxdes\/tap\/vylk/);
      await page.locator('[data-macos-tab="zip"]').click();
      assert.ok(await page.locator('[data-macos-panel="zip"]').isVisible());
      assert.match(await page.locator('[data-macos-panel="zip"]').textContent(), /Apple Silicon/);
      assert.match(await page.locator('[data-release-asset="vylk-{version}-macos-amd64.zip"]').getAttribute('href'), /macos-amd64\.zip$/);
      await page.locator('[data-macos-tab="docker"]').click();
      assert.equal(await page.locator('[data-macos-tab="docker"]').getAttribute('aria-selected'), 'true');
      assert.ok(await page.locator('[data-macos-panel="docker"]').isVisible());
      assert.equal(await page.locator('.command-row:visible').count(), 1);
      await page.locator('[data-macos-tab="homebrew"]').click();
      assert.ok(await page.locator('[data-macos-panel="homebrew"]').isVisible());
      assert.equal(await page.locator('.command-row:visible').count(), 1);
      assert.ok(!(await page.locator('.setup-finish').isVisible()));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.goto(pathToFileURL(path.resolve(__dirname, '../docs/index.html')).href);
      assert.ok(await page.locator('#macos').count());
      assert.ok(await page.locator('#windows').count());
      assert.equal(await page.locator('#docker,#release').count(), 0, 'Docker and release details stay out of the docs outline');
      assert.equal(await page.locator('.docs-hero > img').count(), 0, 'Docs hero does not repeat the product screenshot');
      const broken = await page.locator('a[href^="#"]').evaluateAll(links => links.filter(a => !document.getElementById(a.hash.slice(1))).map(a => a.hash));
      assert.deepEqual(broken, []);
      assert.deepEqual(errors, []);
      console.log('PASS', width, 'concise install, processor-aware download and copy, all methods, OS keyboard tabs, Windows executable/Homebrew, docs anchors');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
