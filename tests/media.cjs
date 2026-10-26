const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const root = path.resolve(__dirname, '..');
const review = path.join(root, '.impeccable/review');
const home = pathToFileURL(path.join(root, 'index.html')).href;
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'assets/workflows.json'), 'utf8'));
assert.equal(manifest.playback_speed, 1.5);

(async () => {
  fs.mkdirSync(review, {recursive: true});
  const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', headless: true});
  try {
    for (const width of [1440, 768, 390]) {
      const page = await browser.newPage({viewport: {width, height: width === 390 ? 844 : 1000}, reducedMotion: 'reduce'});
      const errors = [];
      const videoRequests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        if (/\.mp4(?:$|\?)/.test(request.url())) videoRequests.push(request.url());
      });
      await page.goto(home);
      await page.evaluate(() => document.fonts.ready);
      const label = width === 1440 ? 'desktop' : width === 390 ? 'mobile' : null;
      if (label) await page.screenshot({path: path.join(review, `${label}.png`)});
      const names = ['dashboard', 'editor', 'preferences', 'focus'];
      for (const name of names) {
        const slide = page.locator(`.stage-preview#screen-${name}`);
        assert.equal(await slide.getAttribute('aria-hidden'), 'false');
        const image = await slide.locator('img').evaluate(async element => {
          await element.decode();
          return {width: element.naturalWidth, height: element.naturalHeight, source: element.currentSrc};
        });
        assert.equal(image.width, width <= 560 ? 390 : 1440);
        assert.equal(image.height, width <= 560 ? 844 : 900);
        assert.ok(image.source.endsWith(`vylk-${name}-${width <= 560 ? 'mobile' : 'desktop'}.webp`));
        if (name !== 'focus') await page.locator('[data-screen-next]').click();
      }
      if (label) await page.locator('.screen-stage').screenshot({path: path.join(review, `gallery-${label}.png`)});
      await page.locator('[data-screen-next]').focus();
      await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('#screen-dashboard').getAttribute('aria-hidden'), 'false');
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.locator('#screen-focus').getAttribute('aria-hidden'), 'false');

      const workflows = ['walkthrough'];
      assert.equal(await page.locator('[data-walkthrough]').count(), 1);
      assert.equal(manifest.single_instance, true);
      assert.equal(manifest.grab_cursor, true);
      assert.equal(manifest.real_offline_reload, true);
      assert.deepEqual(videoRequests, [], 'No video is requested before opening a demo');
      for (const workflow of workflows) {
        const disclosure = page.locator(`[data-walkthrough="${workflow}"]`);
        const video = disclosure.locator('video');
        assert.ok((await video.getAttribute('src')).endsWith(`vylk-demo-${workflow}.mp4`));
        assert.equal(await video.getAttribute('preload'), 'none');
        assert.equal(await video.getAttribute('autoplay'), null);
        assert.equal(await video.evaluate(element => element.paused), true);
        await disclosure.locator('summary').focus();
        await page.keyboard.press('Enter');
        await page.waitForFunction(key => document.querySelector(`[data-walkthrough="${key}"] video`).getAttribute('src'), workflow);
        assert.ok((await video.getAttribute('src')).endsWith(`vylk-demo-${workflow}.mp4`));
        assert.equal(await video.evaluate(element => element.paused), true, 'Opening does not autoplay');
        await video.evaluate(element => element.play());
        await page.waitForFunction(key => document.querySelector(`[data-walkthrough="${key}"] video`).currentTime > 0, workflow);
        const metadata = await video.evaluate(element => ({width: element.videoWidth, height: element.videoHeight, duration: element.duration}));
        assert.equal(metadata.width, 1920);
        assert.equal(metadata.height, 1080);
        const recording = manifest.recordings.find(item => item.name === workflow);
        assert.ok(metadata.duration >= 80 && metadata.duration <= 155, `Short continuous walkthrough: ${metadata.duration}s`);
        assert.ok(Math.abs(metadata.duration - recording.original_duration / manifest.playback_speed) < 0.15, `${workflow}: speed-adjusted duration ${metadata.duration}s`);
        await video.evaluate(async element => {
          element.pause();
          const ready = new Promise(resolve => element.addEventListener('seeked', resolve, {once: true}));
          element.currentTime = Math.min(20, element.duration / 2);
          await ready;
        });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        if (label) await disclosure.screenshot({path: path.join(review, `${workflow}-${label}.png`)});
        await video.evaluate(element => element.play());
        await disclosure.locator('summary').click();
        await page.waitForFunction(key => document.querySelector(`[data-walkthrough="${key}"] video`).paused, workflow);
      }
      assert.deepEqual(errors, []);
      console.log('PASS', width, 'one responsive 1080p walkthrough: keyboard access, lazy loading, duration, playback and pause');
      await page.close();
    }
    const context = await browser.newContext({javaScriptEnabled: false});
    const page = await context.newPage();
    await page.goto(home);
    for (const workflow of ['walkthrough']) {
      const disclosure = page.locator(`[data-walkthrough="${workflow}"]`);
      await disclosure.locator('summary').click();
      const fallback = disclosure.locator('video');
      assert.equal(await fallback.isVisible(), true);
      assert.ok((await fallback.getAttribute('src')).endsWith(`vylk-demo-${workflow}.mp4`));
    }
    await context.close();
    console.log('PASS walkthrough remains available without JavaScript');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
