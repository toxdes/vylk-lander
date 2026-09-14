const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, hasTouch: viewport.width < 600 });
      if (viewport.width < 600) {
        const performanceSession = await page.context().newCDPSession(page);
        await performanceSession.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      }
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(pathToFileURL(path.resolve(__dirname, '../index.html')).href);
      await page.evaluate(() => document.fonts.ready);
      const demo = page.locator('[data-demo-link]');
      assert.equal(await demo.getAttribute('href'), 'https://vylk.onrender.com');
      assert.equal(await demo.getAttribute('target'), '_blank');
      await demo.click();
      const demoDialog = page.locator('#demo-dialog');
      assert.ok(await demoDialog.isVisible());
      assert.match(await demoDialog.textContent(), /You are about to leave VYLK/);
      assert.match(await demoDialog.textContent(), /The demo is temporarily hosted on Render/);
      assert.match(await demoDialog.textContent(), /Password:\s*1234/);
      assert.match(await demoDialog.textContent(), /Add to home screen/);
      assert.equal(await demoDialog.locator('[data-demo-continue]').getAttribute('href'), 'https://vylk.onrender.com/');
      assert.equal(await demoDialog.locator('[data-demo-continue]').getAttribute('target'), '_blank');
      assert.equal(await page.locator(':focus').getAttribute('aria-label'), 'Close demo notice');
      await page.keyboard.press('Escape');
      assert.ok(!(await demoDialog.isVisible()));
      assert.equal(await page.locator(':focus').getAttribute('href'), 'https://vylk.onrender.com');
      assert.equal(await page.locator('.game-help').count(), 0, 'No separate hint box near the bin');
      assert.equal(await page.locator('.note-invitation').textContent(), 'What if you clicked on a note?');
      const github = page.locator('.statement a');
      await github.hover();
      assert.equal(await github.evaluate(e => getComputedStyle(e).color), 'rgb(255, 255, 255)', 'GitHub hover stays white on the accent background');
      assert.equal(await github.locator('.arrow-head').evaluate(e => getComputedStyle(e).stroke), 'rgb(255, 255, 255)');
      await github.focus();
      assert.equal(await github.evaluate(e => getComputedStyle(e).borderBottomColor), 'rgb(255, 255, 255)');
      const primary = page.locator('.primary').first();
      await page.evaluate(() => document.activeElement && document.activeElement.blur());
      await page.mouse.move(viewport.width - 1, viewport.height - 1);
      await page.waitForTimeout(150);
      assert.equal(await primary.locator('.arrow-shaft').evaluate(e => getComputedStyle(e).opacity), '0');
      await primary.hover();
      await page.waitForTimeout(200);
      assert.equal(await primary.locator('.arrow-shaft').evaluate(e => getComputedStyle(e).opacity), '1');
      assert.equal(await primary.locator('.arrow-head').evaluate(e => getComputedStyle(e).transform), 'matrix(1, 0, 0, 1, 3, 0)');
      await primary.screenshot({ path: '/tmp/vylk-arrow-hover-' + viewport.width + '.png' });
      await page.mouse.move(0, 0);
      await page.waitForTimeout(200);
      await primary.screenshot({ path: '/tmp/vylk-arrow-rest-' + viewport.width + '.png' });
      const note = page.locator('.note-pink');
      await note.evaluate(n => n.click());
      assert.equal(await page.locator('.note-invitation').textContent(), 'What if you clicked more?');
      await note.evaluate(n => { for (let i = 0; i < 4; i++) n.click(); });
      await note.scrollIntoViewIfNeeded();
      await page.waitForTimeout(650);
      assert.equal(await page.locator('.paper-ready').count(), 1);
      assert.equal(await page.locator('.note-invitation').textContent(), 'Drag and release to launch');
      const home = await note.boundingBox();
      const origin = { x: home.x + 28, y: home.y + 28 };
      await page.screenshot({ path: '/tmp/vylk-game-' + viewport.width + '.png' });

      // Find a clear, unassisted throw through the actual rendered mouth.
      const solution = await page.evaluate(origin => {
        const P = window.PaperPhysics, rect = document.querySelector('.game-bin').getBoundingClientRect();
        const world = { width: document.documentElement.clientWidth, floor: innerHeight - 8, gravity: Math.max(700, innerHeight * 1.25),
          bin: { left: rect.left + 28, right: rect.left + 122, top: rect.top + 52, bottom: rect.top + 145 } };
        const maxPull = innerWidth < 600 ? 100 : 140;
        let best = null;
        for (let x = -maxPull; x <= maxPull; x += 2) for (let y = -maxPull; y <= maxPull; y += 2) {
          if (Math.hypot(x, y) > maxPull || origin.x + x < 2 || origin.x + x > innerWidth - 2 || origin.y + y < 2 || origin.y + y > innerHeight - 2) continue;
          const result = P.predict(P.launch(origin, { x, y }, world, 24), world);
          if (result.event !== 'catch' || result.end.bounces) continue;
          const error = Math.abs(result.end.x - (world.bin.left + world.bin.right) / 2);
          if (!best || error < best.error) best = { x, y, error, time: result.end.time, end: result.end };
        }
        return best;
      }, origin);
      assert.ok(solution, 'The bin must be reachable with an on-screen drag at ' + viewport.width);

      const touch = viewport.width < 600 ? await page.context().newCDPSession(page) : null;
      if (touch) {
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: origin.x, y: origin.y }] });
        await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: origin.x + solution.x, y: origin.y + solution.y }] });
      } else {
        await page.mouse.move(origin.x, origin.y);
        await page.mouse.down();
        await page.mouse.move(origin.x + solution.x, origin.y + solution.y, { steps: 12 });
      }
      const expected = solution.end;
      assert.equal(await page.locator('.game-target,.game-trajectory').count(), 0, 'No landing hint is rendered');
      await page.screenshot({ path: '/tmp/vylk-aim-' + viewport.width + '.png' });
      await page.evaluate(() => {
        window.catchEvidence = { opened: false, smoke: false, caught: null };
        const observer = new MutationObserver(() => {
          const bin = document.querySelector('.game-bin');
          if (bin.classList.contains('is-open')) window.catchEvidence.opened = true;
          if (document.querySelector('.bin-puff')) window.catchEvidence.smoke = true;
          const ball = document.querySelector('.flying-paper.is-caught');
          if (ball && !window.catchEvidence.caught) {
            const r = ball.getBoundingClientRect();
            window.catchEvidence.caught = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
          }
        });
        observer.observe(document.querySelector('.paper-game'), { subtree: true, attributes: true, childList: true });
      });
      if (touch) await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      else await page.mouse.up();
      await page.waitForFunction(() => document.querySelector('.flying-paper.is-caught'), { timeout: 6000 });
      await page.screenshot({ path: '/tmp/vylk-catch-' + viewport.width + '.png' });
      await page.waitForFunction(() => !document.querySelector('.flying-paper'), { timeout: 6000 });
      const evidence = await page.evaluate(() => window.catchEvidence);
      assert.ok(evidence.opened, 'Lid opens before the catch');
      assert.ok(evidence.smoke, 'Cartoon puff plays after the lid closes');
      assert.ok(Math.hypot(evidence.caught.x - expected.x, evidence.caught.y - expected.y) < 2, JSON.stringify({ expected, evidence }));
      assert.equal(await page.locator('.paper-discarded').count(), 1);
      assert.equal(await page.locator('.note-invitation').textContent(), 'What if you clicked on a note?', 'Catching the only ball resets the shared hint');
      assert.ok(!(await page.locator('.game-bin').evaluate(el => el.classList.contains('is-open'))));

      // A miss must bounce and return to its own original position.
      const other = page.locator('.note-yellow');
      await other.evaluate(n => { for (let i = 0; i < 5; i++) n.click(); });
      await other.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      const before = await other.boundingBox();
      const x = before.x + 28, y = before.y + 28;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 30, y + 10, { steps: 5 });
      await page.mouse.up();
      await page.waitForFunction(() => !document.querySelector('.flying-paper'), { timeout: 8000 });
      const after = await other.boundingBox();
      assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < 1);
      assert.ok(!(await other.evaluate(el => el.classList.contains('paper-discarded'))));
      assert.equal(await page.locator('.note-invitation').textContent(), 'Drag and release to launch');
      // Keyboard cancellation also restores the ball without launching.
      await other.focus();
      await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !document.querySelector('.flying-paper'));
      assert.equal(await page.locator('.note-invitation').textContent(), 'Drag and release to launch');
      assert.deepEqual(errors, []);
      console.log('PASS', viewport.width, 'arrow states, reachable basket, no landing hint, accurate flight, lid, smoke, miss return, keyboard cancellation');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
