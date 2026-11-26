const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Clear every level with real keyboard throws, then dismiss the closing dialog.
const INVITES = ['What if you clicked on a note?', ...[2, 3, 4, 5].map(n => `level ${n}: are you "Nah I'd win" guy?`)];

// Aim with the keyboard and release at a planned instant, so the throw can be
// solved against the patrolling bin's clock.
async function throwAt(page) {
  return page.evaluate(() => {
    const P = PaperPhysics, note = document.querySelector('.sticky-note.paper-ready:not(.paper-discarded)');
    const key = (key, shiftKey = false) => note.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
    const before = performance.now();
    key('Enter');
    const live = window.liveWorld, origin = window.liveOrigin, epoch = (before + performance.now()) / 2000 - live.time;
    const max = P.maxPull(live.width), start = performance.now() + 1500;
    for (let k = 0; k < 40; k++) {
      const at = start + k * 90;
      const sim = { ...live, time: at / 1000 - epoch };
      if (sim.patrol) sim.bin = P.binAt(sim.patrol, sim.time);
      let best = null;
      for (let x = -max; x <= max; x += 4) for (let y = -max; y <= max; y += 4) {
        if (Math.hypot(x, y) > max || Math.hypot(x, y) < 6) continue;
        const result = P.predict(window.realLaunch(origin, { x, y }, sim, 24), sim);
        if (result.event !== 'catch') continue;
        const bin = sim.patrol ? P.binAt(sim.patrol, sim.time + result.end.time) : sim.bin;
        const error = Math.abs(result.end.x - (bin.left + bin.right) / 2);
        if (!best || error < best.error) best = { x, y, error };
      }
      if (!best || performance.now() > at - 20) continue;
      for (let i = 0; i < 55; i++) key('ArrowRight', true);
      for (let i = 0; i < 35; i++) key('ArrowDown', true);
      for (let i = 0; i < Math.abs(best.x); i++) key(best.x > 0 ? 'ArrowLeft' : 'ArrowRight', true);
      for (let i = 0; i < Math.abs(best.y); i++) key(best.y > 0 ? 'ArrowUp' : 'ArrowDown', true);
      while (performance.now() < at);
      key('Enter');
      return true;
    }
    key('Escape');
    return false;
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => {
      const P = window.PaperPhysics;
      window.realLaunch = P.launch;
      P.launch = (origin, pull, world, radius) => {
        window.liveWorld = world;
        window.liveOrigin = origin;
        return window.realLaunch(origin, pull, world, radius);
      };
    });
    for (let level = 0; level < INVITES.length; level++) {
      assert.equal(await page.locator('.note-invitation').textContent(), INVITES[level]);
      for (let i = 0; i < 6; i++) await page.locator('.sticky-note').nth(i).evaluate(n => { for (let c = 0; c < 5; c++) n.click(); });
      await page.waitForTimeout(600);
      if (level) {
        // The patrol is drawn every frame at an even pace: no stalls, no jumps.
        const shifts = await page.evaluate(() => new Promise(resolve => {
          const bin = document.querySelector('.game-bin'), seen = [];
          const tick = () => {
            seen.push(+(bin.style.transform.match(/translate3d\(([-\d.]+)px/) || [0, 0])[1]);
            if (seen.length < 40) requestAnimationFrame(tick); else resolve(seen);
          };
          requestAnimationFrame(tick);
        }));
        const steps = shifts.slice(1).map((s, i) => Math.abs(s - shifts[i]));
        assert.ok(Math.abs(shifts.at(-1) - shifts[0]) > 1, `bin patrols on level ${level + 1}`);
        for (let i = 1; i < steps.length; i++) {
          assert.ok(Math.abs(steps[i] - steps[i - 1]) < 2 + steps[i - 1] * .5, `even patrol on level ${level + 1}: ${steps.slice(i - 1, i + 1)}`);
        }
      }
      // A knocked ball may score too, so count what is left rather than throws.
      const left = () => page.locator('.sticky-note.paper-ready:not(.paper-discarded)').count();
      for (let throws = 0, misses = 0; await left(); throws++) {
        assert.ok(throws < 12 && misses < 3, `level ${level + 1}: too many misses`);
        const before = await left();
        assert.ok(await throwAt(page), `level ${level + 1}: a throw must exist`);
        await page.waitForFunction(() => !document.querySelector('.flying-paper'), null, { timeout: 15000 });
        if (await left() === before) misses++;
      }
      if (level < INVITES.length - 1) {
        await page.waitForFunction(() => document.querySelectorAll('.paper-ready').length === 0, null, { timeout: 5000 });
        console.log('PASS level', level + 1);
      }
    }
    const dialog = page.locator('dialog.game-done');
    await dialog.waitFor({ state: 'visible', timeout: 5000 });
    assert.equal(await dialog.locator('h2').textContent(), "I'm done.");
    assert.equal(await dialog.locator('p').textContent(), "holy shit you're this unemployed? you just like me fr fr. But VYLK app is really nice though. give it a try.");
    await dialog.getByRole('button', { name: 'OK' }).click();
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.note-invitation').textContent(), INVITES[0]);
    assert.equal(await page.locator('.game-bin').evaluate(bin => bin.style.transform), '');
    assert.equal(await page.locator('.paper-ready,.paper-discarded').count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS level ${INVITES.length}, closing dialog, back to level 1`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
