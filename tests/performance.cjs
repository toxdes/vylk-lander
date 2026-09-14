const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function report(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = percentile => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percentile))] || 0;
  return { frames: samples.length, p95: at(.95), p99: at(.99), max: sorted.at(-1) || 0, over25: samples.filter(v => v > 25).length };
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    // Four-times CPU throttling gives a stable low-end-device signal in CI.
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, hasTouch: viewport.width < 600 });
      const session = await page.context().newCDPSession(page);
      await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => {
        window.frameTimes = [];
        let previous = performance.now();
        const sample = now => {
          window.frameTimes.push(now - previous);
          previous = now;
          if (window.frameTimes.length < 260) requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        // Build two real, collidable balls. The public interaction then drives
        // their actual physics, bin forecasting, and draw work.
        for (const note of document.querySelectorAll('.sticky-note')) for (let i = 0; i < 5; i++) note.click();
      });
      await page.waitForTimeout(500);
      const origin = await page.locator('.sticky-note').first().boundingBox();
      await page.mouse.move(origin.x + 28, origin.y + 28);
      await page.mouse.down();
      await page.mouse.move(origin.x - 105, origin.y + 35, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(4300);
      const result = report(await page.evaluate(() => window.frameTimes.slice(12)));
      // We can not promise a particular display refresh rate, but a 4x-throttled
      // 60Hz emulation should not accrue a sustained long-frame tail.
      assert.ok(result.p95 <= 17, `${viewport.width}px p95 ${result.p95.toFixed(1)}ms`);
      assert.ok(result.over25 <= 3, `${viewport.width}px ${result.over25} long frames`);
      console.log('PASS', viewport.width, JSON.stringify(result));
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
