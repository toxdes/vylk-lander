const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const root = path.resolve(__dirname, '../dist');

(async () => {
  const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', headless: true});
  try {
    for (const width of [1440, 390, 320]) {
      const page = await browser.newPage({viewport: {width, height: 1000}, reducedMotion: 'reduce'});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.join(root, 'releases/index.html')).href);
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await page.locator('h1').textContent(), 'Releases');
      assert.deepEqual(await page.locator('.release h2').allTextContents(), ['v3.1.1', 'v3.1.0', 'v3.0.4']);
      assert.equal(await page.locator('script').count(), 0);
      assert.match(await page.locator('#v3\\.1\\.1').textContent(), /Select All.*Delete/);
      assert.match(await page.locator('#v3\\.0\\.4').textContent(), /human friendly code; UI elements touch-up/);
      assert.equal(await page.locator('a[href="https://github.com/toxdes/vylk/pull/28"]').count(), 0);
      assert.equal(await page.locator('.release-latest').count(), 1);
      assert.equal(await page.locator('.release').first().locator('.release-latest').textContent(), 'Latest');
      assert.equal(await page.locator('.release-meta, time').count(), 0);
      assert.doesNotMatch(await page.locator('main').textContent(), /Changes since|Release descriptions, as written/);
      assert.equal(await page.locator('.release h3').filter({hasText: /^Changes$/}).count(), 0);
      assert.match(await page.locator('.release-history').textContent(), /Before v3.0.4.*Changelog was not maintained for older releases/);
      assert.equal(await page.locator('.docs-nav a[href="../index.html#install"]').isVisible(), true);
      assert.equal(await page.locator('.docs-nav a[aria-current="page"]').textContent(), "Releases");
      assert.equal(await page.locator('.docs-nav a[aria-current="page"]').isVisible(), true);
      const styles = await page.evaluate(() => ({
        font: getComputedStyle(document.body).fontFamily,
        background: getComputedStyle(document.body).backgroundColor,
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        motion: getComputedStyle(document.documentElement).scrollBehavior,
      }));
      assert.match(styles.font, /Rubik/);
      assert.equal(styles.background, 'rgb(244, 245, 243)');
      assert.equal(styles.overflow, false, `No overflow at ${width}px`);
      assert.equal(await page.locator('h1').evaluate(element => element.offsetHeight <= parseFloat(getComputedStyle(element).lineHeight) + 1), true, 'The title fits on one line');
      assert.equal(styles.motion, 'auto');
      await page.keyboard.press('Tab');
      assert.equal(await page.locator('.releases-skip').evaluate(element => element === document.activeElement), true);
      await page.keyboard.press('Enter');
      await page.locator('.toc a[href="#v3.0.4"]').click();
      assert.equal(await page.evaluate(() => location.hash), '#v3.0.4');
      await page.screenshot({path: `/tmp/vylk-releases-older-${width}.png`});
      await page.evaluate(() => { location.hash = ''; scrollTo(0, 0); document.activeElement.blur(); });
      await page.screenshot({path: `/tmp/vylk-releases-${width}.png`, fullPage: true});
      await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
      const banner = page.locator('.release-banner');
      assert.match(await banner.textContent(), /vylk v3.1.1 is out/);
      assert.equal(await banner.locator('a').getAttribute('href'), 'releases/#v3.1.1');
      assert.equal(await page.locator('.nav a[href="#install"]').isVisible(), true);
      assert.equal(await page.locator('.nav a[href="releases/"]').isVisible(), true);
      assert.doesNotMatch(await page.locator('.screen-recording').textContent(), /Tasks, writing|One notebook|1080p|Watch or download/);
      assert.equal(await page.locator('.screen-recording [aria-describedby]').count(), 0);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await page.screenshot({path: `/tmp/vylk-home-release-banner-${width}.png`});
      assert.equal(await page.locator('footer a[href="releases/"]').count(), 0);
      await page.goto(pathToFileURL(path.join(root, 'docs/index.html')).href);
      assert.equal(await page.locator('footer a[href="../releases/"]').count(), 0);
      assert.equal(await page.locator('.docs-nav a[href="../index.html#install"]').isVisible(), true);
      await page.goto(pathToFileURL(path.join(root, 'docs/api/index.html')).href);
      assert.equal(await page.locator('a[href="../../releases/"]').count(), 1);
      assert.equal(await page.locator('.docs-nav a[href="../../index.html#install"]').isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('Releases and homepage banner passed at desktop, mobile, and narrow mobile sizes.');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
