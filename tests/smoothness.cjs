const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// A 90 Hz display does not divide the 120 Hz physics step evenly. Drawn paper
// must still move at its true speed every frame instead of alternating jumps.
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await page.addInitScript(() => {
      window.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 1000 / 90);
      window.cancelAnimationFrame = id => clearTimeout(id);
    });
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => { for (let i = 0; i < 5; i++) document.querySelector('.sticky-note').click(); });
    await page.waitForTimeout(500);
    const box = await page.locator('.sticky-note').first().boundingBox();
    await page.mouse.move(box.x + 28, box.y + 28);
    await page.mouse.down();
    await page.mouse.move(box.x - 60, box.y + 90, { steps: 8 });
    await page.evaluate(() => {
      window.paints = [];
      new MutationObserver(() => {
        const sprite = document.querySelector('.flying-paper[data-phase="flight"]');
        const match = sprite?.style.transform.match(/translate3d\(([-\d.]+)px/);
        if (match) window.paints.push([performance.now(), +match[1]]);
      }).observe(document.querySelector('.paper-game'), { subtree: true, attributes: true, attributeFilter: ['style'] });
    });
    await page.mouse.up();
    await page.waitForTimeout(400);
    // Airborne and before any impact, horizontal speed is constant.
    const paints = (await page.evaluate(() => window.paints)).slice(2, 24);
    const speeds = paints.slice(1).map(([t, x], i) => (x - paints[i][1]) / (t - paints[i][0]));
    const sorted = [...speeds].sort((a, b) => a - b), median = sorted[sorted.length >> 1];
    const worst = Math.max(...speeds.map(v => Math.abs(v / median - 1)));
    assert.ok(Math.abs(median) > .3, `paper must be moving sideways (${median.toFixed(2)} px/ms)`);
    assert.ok(worst < .25, `per-frame speed strays ${(worst * 100).toFixed(0)}% from the true speed at 90 Hz`);
    console.log('PASS 90 Hz paper speed stays within', (worst * 100).toFixed(0) + '% over', speeds.length, 'frames');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
