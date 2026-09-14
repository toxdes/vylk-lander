const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await page.locator('.note-invitation').isVisible());
    assert.ok(!(await page.locator('.game-bin').isVisible()));
    for (const selector of ['.note-pink', '.note-yellow']) {
      await page.locator(selector).evaluate(n => { for (let i = 0; i < 5; i++) n.click(); });
    }
    await page.waitForTimeout(500);
    const collision = await page.evaluate(() => {
      const P = PaperPhysics, ns = [...document.querySelectorAll('.paper-ready')];
      const center = el => { const r = el.getBoundingClientRect(); return { x: r.left + 28, y: r.top + 28 }; };
      const origin = center(ns[0]), rest = center(ns[1]);
      for (let x = -120; x <= -6; x += 3) for (let y = -30; y < 100; y += 3) {
        const body = { ...rest, vx: 0, vy: 0, radius: 24, angle: 0, spin: 0, time: 0, bounces: 0, awake: false };
        const world = { width: innerWidth, floor: innerHeight - 8, gravity: innerHeight * 1.25, bodies: [body] };
        const shot = P.launch(origin, { x, y }, world, 24);
        for (let tick = 0; tick < 70; tick++) {
          P.advance(shot, world);
          if (body.awake) return { origin, x, y };
        }
      }
    });
    assert.ok(collision);
    await page.mouse.move(collision.origin.x, collision.origin.y);
    await page.mouse.down();
    await page.mouse.move(collision.origin.x + collision.x, collision.origin.y + collision.y, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelectorAll('.flying-paper').length === 2);
    await page.screenshot({ path: '/tmp/vylk-ball-collision.png' });
    await page.waitForFunction(() => !document.querySelector('.flying-paper'), { timeout: 10000 });
    assert.ok(await page.locator('.game-bin').isVisible());
    console.log('PASS rendered ball-to-ball collision transfers motion');

    // Start a clean round and genuinely throw all six balls into the bin.
    await page.reload();
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      window.roundEvidence = { confetti: false };
      new MutationObserver(() => {
        if (document.querySelector('.game-confetti')) window.roundEvidence.confetti = true;
      }).observe(document.querySelector('.paper-game'), { subtree: true, childList: true });
    });
    for (let i = 0; i < 6; i++) {
      const note = page.locator('.sticky-note').nth(i);
      await note.evaluate(n => { for (let c = 0; c < 5; c++) n.click(); });
      await page.waitForTimeout(400);
      const aim = await note.evaluate(note => {
        const r = note.getBoundingClientRect(), rect = document.querySelector('.game-bin').getBoundingClientRect();
        const origin = { x: r.left + 28, y: r.top + 28 };
        const world = { width: innerWidth, floor: innerHeight - 8, gravity: innerHeight * 1.25,
          bin: { left: rect.left + 28, right: rect.left + 122, top: rect.top + 52, bottom: rect.top + 145 } };
        let best;
        for (let x = -140; x <= 140; x += 3) for (let y = -140; y <= 140; y += 3) {
          if (Math.hypot(x,y) > 140 || origin.x + x < 1 || origin.x + x > innerWidth - 1 || origin.y + y < 1 || origin.y + y > innerHeight - 1) continue;
          const result = PaperPhysics.predict(PaperPhysics.launch(origin, { x, y }, world, 24), world);
          if (result.event !== 'catch') continue;
          const error = Math.abs(result.end.x - (world.bin.left + world.bin.right)/2);
          if (!best || error < best.error) best = { x, y, error, origin };
        }
        return best;
      });
      assert.ok(aim, 'Every note must have a reachable throw');
      await page.mouse.move(aim.origin.x, aim.origin.y);
      await page.mouse.down();
      await page.mouse.move(aim.origin.x + aim.x, aim.origin.y + aim.y, { steps: 10 });
      await page.mouse.up();
      await page.waitForFunction(() => !document.querySelector('.flying-paper'), { timeout: 8000 });
      if (i < 5) assert.equal(await page.locator('.paper-discarded').count(), i + 1);
      assert.ok(!(await page.locator('.game-bin').isVisible()), 'No remaining ball means hidden bin');
    }
    await page.waitForFunction(() => document.querySelectorAll('.paper-ready').length === 0, { timeout: 5000 });
    assert.ok(await page.evaluate(() => window.roundEvidence.confetti));
    assert.equal(await page.locator('.sticky-note').count(), 6);
    assert.ok(await page.locator('.note-invitation').isVisible());
    assert.equal(await page.locator('.bin-puff,.flying-paper,.game-confetti').count(), 0);
    assert.deepEqual(errors, []);
    console.log('PASS full round: six catches, confetti, automatic reset, no stale particles');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
