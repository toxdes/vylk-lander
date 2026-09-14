const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    for (const scenario of [
      { name: 'wall and floor bank shot', positions: [[1080, 260]], pull: [-137, -11], caught: 0 },
      { name: 'secondary ball catch after collision', positions: [[500, 500], [280, 550]], pull: [10, 76], caught: 1 },
      { name: 'left of the old narrow slot', positions: [[65, 700]], pull: [0, -10], caught: 0 },
      { name: 'right of the old narrow slot', positions: [[128, 700]], pull: [0, -10], caught: 0 },
      { name: 'close shot waits for the lid', positions: [[120, 842]], pull: [0, -6], caught: 0, close: true },
      { name: 'mobile off-center top entry', positions: [[128, 450]], pull: [0, -10], caught: 0, viewport: { width: 390, height: 844 } },
      { name: 'body side hit bounces without scoring', positions: [[200, 900]], pull: [10, 0], caught: null }
    ]) {
      const page = await browser.newPage({ viewport: scenario.viewport || { width: 1440, height: 1000 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
      await page.evaluate(() => document.fonts.ready);
      // Place real crumpled notes at deterministic fixture positions. Input and
      // all subsequent motion, collisions, lid control, and scoring remain real.
      await page.evaluate(positions => {
        positions.forEach(([x, y], i) => {
          const note = document.querySelectorAll('.sticky-note')[i];
          for (let c = 0; c < 5; c++) note.click();
          note.style.position = 'fixed';
          note.style.left = x - 28 + 'px';
          note.style.top = y - 28 + 'px';
        });
        window.evidence = { opened: null, caught: null, smoke: false, moving: 0 };
        new MutationObserver(() => {
          const e = window.evidence;
          e.moving = Math.max(e.moving, document.querySelectorAll('.flying-paper').length);
          if (document.querySelector('.game-bin.is-open') && e.opened === null) e.opened = performance.now();
          if (document.querySelector('.flying-paper.is-caught') && e.caught === null) e.caught = performance.now();
          e.smoke ||= !!document.querySelector('.bin-puff');
        }).observe(document.querySelector('.paper-game'), { subtree: true, attributes: true, childList: true });
      }, scenario.positions);
      await page.waitForTimeout(500);
      const [x, y] = scenario.positions[0];
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + scenario.pull[0], y + scenario.pull[1], { steps: 8 });
      assert.equal(await page.locator('.game-target,.game-trajectory').count(), 0);
      await page.mouse.up();
      if (scenario.caught === null) {
        await page.waitForFunction(() => !document.querySelector('.flying-paper'), null, { timeout: 10000 });
        assert.equal(await page.locator('.paper-discarded').count(), 0);
        assert.equal((await page.evaluate(() => window.evidence)).opened, null, 'A side hit must not open the lid');
        assert.deepEqual(errors, []);
        console.log('PASS', scenario.name);
        await page.close();
        continue;
      }
      await page.waitForFunction(() => !!document.querySelector('.flying-paper.is-caught'), null, { timeout: 6000 });
      if (scenario.close) {
        const delay = await page.locator('.flying-paper.is-caught').evaluate(el => el.getAnimations()[0].effect.getTiming().delay);
        assert.ok(delay > 0, 'Close throw waits for the lid before sinking');
      }
      if (scenario.name === 'right of the old narrow slot' || scenario.viewport) {
        await page.screenshot({ path: '/tmp/vylk-top-entry-' + (scenario.viewport ? 'mobile' : 'desktop') + '.png' });
      }
      await page.waitForFunction(() => !!document.querySelector('.paper-discarded'), null, { timeout: 6000 });
      await page.waitForFunction(() => !document.querySelector('.flying-paper'), null, { timeout: 10000 });
      assert.ok(await page.locator('.sticky-note').nth(scenario.caught).evaluate(n => n.classList.contains('paper-discarded')));
      const evidence = await page.evaluate(() => window.evidence);
      assert.ok(evidence.opened !== null && (scenario.close || evidence.caught - evidence.opened > 100), 'Lid anticipates the incoming ball');
      assert.ok(evidence.smoke);
      if (scenario.caught === 1) assert.equal(evidence.moving, 2);
      assert.deepEqual(errors, []);
      console.log('PASS', scenario.name, 'lid lead:', Math.round(evidence.caught - evidence.opened), 'ms');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
