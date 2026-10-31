const {chromium, firefox} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const source = process.env.VYLK_URL || pathToFileURL(path.resolve(process.cwd(), 'index.html')).href;

async function pixelDifference(page, before, after) {
  return page.evaluate(async images => {
    async function pixels(encoded) {
      const image = new Image();
      image.src = `data:image/png;base64,${encoded}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d', {willReadFrequently: true});
      context.drawImage(image, 0, 0);
      return {width: image.width, height: image.height, data: context.getImageData(0, 0, image.width, image.height).data};
    }
    const first = await pixels(images.before);
    const last = await pixels(images.after);
    if (first.width !== last.width || first.height !== last.height) return 255;
    let maximum = 0;
    for (let index = 0; index < first.data.length; index++) {
      maximum = Math.max(maximum, Math.abs(first.data[index] - last.data[index]));
    }
    return maximum;
  }, {before: before.toString('base64'), after: after.toString('base64')});
}

async function checkNaturalSettling(page, link, arrow, label) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement.blur());
  await page.waitForTimeout(350);
  const session = await page.context().newCDPSession(page);
  const frames = [];
  const receive = frame => {
    frames.push({data: frame.data, timestamp: frame.metadata.timestamp});
    if (frames.length > 90) frames.shift();
    void session.send('Page.screencastFrameAck', {sessionId: frame.sessionId});
  };
  session.on('Page.screencastFrame', receive);
  try {
    await arrow.evaluate(svg => {
      window.arrowNaturalEnd = null;
      const group = svg.querySelector('.arrow-group');
      const ended = event => {
        if (event.target !== group || event.propertyName !== 'transform') return;
        window.arrowNaturalEnd = Date.now() / 1000;
        group.removeEventListener('transitionend', ended);
      };
      group.addEventListener('transitionend', ended);
      // Keep frames arriving after the arrow stops, so deferred layer release
      // is measured too. The marker is outside the button and removed below.
      const marker = document.createElement('i');
      marker.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;background:black;pointer-events:none';
      marker.animate([{opacity: 0}, {opacity: 1}], {duration: 500, iterations: Infinity});
      document.body.append(marker);
      window.arrowFrameMarker = marker;
    });
    await session.send('Page.startScreencast', {format: 'png', everyNthFrame: 1});
    await link.hover();
    await page.waitForFunction(() => window.arrowNaturalEnd !== null);
    await page.waitForTimeout(350);
    await session.send('Page.stopScreencast');
    const end = await page.evaluate(() => window.arrowNaturalEnd);
    const settled = frames.filter(frame => frame.timestamp >= end);
    assert.ok(settled.length >= 2, `${label}: missing natural endpoint frames`);
    assert.ok(settled.at(-1).timestamp - end >= .2, `${label}: missing delayed layer-release frame`);
    const bounds = await arrow.boundingBox();
    const positions = await page.evaluate(async ({frames, bounds, viewportWidth, foreground}) => {
      return Promise.all(frames.map(async frame => {
        const image = new Image();
        image.src = `data:image/png;base64,${frame.data}`;
        await image.decode();
        const scale = image.width / viewportWidth;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(18 * scale);
        canvas.height = Math.round(14 * scale);
        const context = canvas.getContext('2d');
        context.drawImage(image, Math.floor(bounds.x - 2) * scale, Math.floor(bounds.y - 2) * scale, 18 * scale, 14 * scale, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const background = [...pixels.slice(0, 3)];
        const direction = foreground.map((channel, index) => channel - background[index]);
        const magnitude = direction.reduce((sum, channel) => sum + channel * channel, 0);
        function center(columns) {
          let weight = 0;
          let position = 0;
          for (let y = 0; y < canvas.height; y++) {
            for (const column of columns) {
              const x = Math.floor(column * canvas.width / 18);
              const offset = (y * canvas.width + x) * 4;
              const alpha = direction.reduce((sum, channel, index) => sum + channel * (pixels[offset + index] - background[index]), 0) / magnitude;
              if (alpha < .15) continue;
              weight += alpha;
              position += (y + .5) * 14 / canvas.height * alpha;
            }
          }
          if (!weight) throw new Error('Missing arrow pixels in the natural endpoint capture');
          return position / weight;
        }
        return {shaft: center([4, 5, 6]), head: center([12, 13])};
      }));
    }, {
      frames: [settled[0], settled.at(-1)], bounds, viewportWidth: page.viewportSize().width,
      foreground: await arrow.evaluate(element => getComputedStyle(element).color.match(/[\d.]+/g).slice(0, 3).map(Number)),
    });
    // Measure vertical position rather than tiny residual color differences.
    for (const part of ['head', 'shaft']) {
      const shift = Math.abs(positions[0][part] - positions[1][part]);
      assert.ok(shift <= .1, `${label}: ${part} moved ${shift.toFixed(3)}px after natural transition end`);
    }
    const alignment = Math.abs((positions[0].head - positions[0].shaft) - (positions[1].head - positions[1].shaft));
    assert.ok(alignment <= .1, `${label}: chevron/shaft alignment changed ${alignment.toFixed(3)}px after natural transition end`);
  } finally {
    session.off('Page.screencastFrame', receive);
    await session.detach();
    await page.evaluate(() => window.arrowFrameMarker?.remove());
  }
}

async function checkTransition(page, arrow, label) {
  await arrow.evaluate(element => {
    element.arrowTransitions = element.getAnimations({subtree: true});
    if (!element.arrowTransitions.length) throw new Error('Expected an arrow transition');
    for (const animation of element.arrowTransitions) animation.pause();
  });
  // Measure intermediate geometry as well as the finished state: the shaft
  // must touch the tip throughout entry and exit transitions.
  for (const time of [0, 75, 150, 225, 299.999]) {
    const gap = await arrow.evaluate(async (element, time) => {
      for (const animation of element.arrowTransitions) {
        animation.currentTime = Math.min(time, animation.effect.getTiming().duration - .001);
      }
      await new Promise(requestAnimationFrame);
      const shaft = element.querySelector('.arrow-shaft');
      const head = element.querySelector('.arrow-head');
      const bounds = shaft.getBoundingClientRect();
      const headBounds = head.getBoundingClientRect();
      const end = {x: bounds.right, y: bounds.top + bounds.height / 2};
      const tip = {x: headBounds.left + 2.99316, y: headBounds.top + 4.24902};
      return Math.hypot(end.x - tip.x, end.y - tip.y);
    }, time);
    assert.ok(gap < .05, `${label}: shaft/tip gap ${gap}px at ${time}ms`);
  }
  const bounds = await arrow.boundingBox();
  // The SVG deliberately overflows its 5px rest width during the 6px advance.
  const capture = () => page.screenshot({clip: {x: bounds.x, y: bounds.y - .5, width: 12, height: 9}});
  const before = await capture();
  await arrow.evaluate(async element => {
    for (const animation of element.arrowTransitions) animation.finish();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  const after = await capture();
  const difference = await pixelDifference(page, before, after);
  // The reported snap changed edge pixels by 47/255 at 125% scaling despite
  // identical final coordinates. Allow up to 16/255 for subpixel edge
  // rounding; intermediate geometry is checked independently above.
  assert.ok(difference <= 16, `${label}: end-of-transition pixel jump ${difference}/255`);
}

(async () => {
  const engine = process.env.VYLK_BROWSER === 'firefox' ? firefox : chromium;
  const browser = await engine.launch(engine === firefox ? {headless: true} : {executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true});
  try {
    for (const width of [1440, 390]) {
      for (const deviceScaleFactor of [1, 1.25, 2]) {
        const page = await browser.newPage({viewport: {width, height: 1000}, deviceScaleFactor});
        await page.goto(source);
        await page.evaluate(() => document.fonts.ready);
        for (const selector of ['.hero .primary', '.hero .secondary', '.statement .primary']) {
          const link = page.locator(selector);
          const arrow = link.locator('.cta-arrow');
          const label = `${width}px / DPR ${deviceScaleFactor} / ${selector}`;
          if (engine === chromium) await checkNaturalSettling(page, link, arrow, label);
          // Normalize colors only for the paused geometry checks. Natural
          // recordings above keep the real page, position, and compositing.
          const colors = await page.addStyleTag({content: '.cta-arrow { color: black !important; } .hero-actions a { background: white !important; transition: none !important; }'});
          await page.mouse.move(0, 0);
          await page.evaluate(() => document.activeElement.blur());
          await page.waitForTimeout(350);
          await link.hover();
          await checkTransition(page, arrow, `${label} hover`);
          await page.mouse.move(0, 0);
          await checkTransition(page, arrow, `${label} exit`);
          await colors.evaluate(element => element.remove());
          await page.keyboard.press('Tab');
          await link.focus();
          await arrow.evaluate(async element => {
            await Promise.all(element.getAnimations({subtree: true}).map(animation => animation.finished.catch(() => {})));
          });
          assert.equal(await arrow.locator('.arrow-shaft').evaluate(element => getComputedStyle(element).opacity), '1', `${label}: keyboard shaft reveal`);
          assert.equal(await arrow.locator('.arrow-group').evaluate(element => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41), 6, `${label}: keyboard arrow advance`);
        }
        await page.emulateMedia({reducedMotion: 'reduce'});
        const link = page.locator('.statement .primary');
        await link.hover();
        assert.equal(await link.locator('.arrow-shaft').evaluate(element => getComputedStyle(element).opacity), '1');
        assert.equal(await link.locator('.cta-arrow').evaluate(element => element.getAnimations({subtree: true}).length), 0);
        await page.close();
      }
    }
    console.log(`${engine.name()}: arrow entry/exit geometry, endpoint pixels, and reduced motion passed at desktop/mobile and 100%, 125%, 200% display scales.`);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
