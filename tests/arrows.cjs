const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const source = pathToFileURL(path.resolve(process.cwd(), 'index.html')).href;

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

async function checkTransition(page, arrow, label) {
  await arrow.evaluate(element => {
    element.arrowTransitions = element.getAnimations({subtree: true});
    if (!element.arrowTransitions.length) throw new Error('Expected an arrow transition');
    for (const animation of element.arrowTransitions) animation.pause();
  });
  // Measure intermediate geometry as well as the finished state: the shaft
  // must touch the tip throughout entry and exit transitions.
  for (const time of [0, 40, 80, 120, 159.999]) {
    const gap = await arrow.evaluate(async (element, time) => {
      for (const animation of element.arrowTransitions) {
        animation.currentTime = Math.min(time, animation.effect.getTiming().duration - .001);
      }
      await new Promise(requestAnimationFrame);
      const shaft = element.querySelector('.arrow-shaft');
      const head = element.querySelector('.arrow-head');
      const end = shaft.getPointAtLength(shaft.getTotalLength()).matrixTransform(shaft.getCTM());
      const tip = head.getPointAtLength(head.getTotalLength() / 2).matrixTransform(head.getCTM());
      return Math.hypot(end.x - tip.x, end.y - tip.y);
    }, time);
    assert.ok(gap < .05, `${label}: shaft/tip gap ${gap}px at ${time}ms`);
  }
  const before = await arrow.screenshot();
  await arrow.evaluate(async element => {
    for (const animation of element.arrowTransitions) animation.finish();
    await new Promise(requestAnimationFrame);
    await new Promise(requestAnimationFrame);
  });
  const after = await arrow.screenshot();
  const difference = await pixelDifference(page, before, after);
  // The reported snap changed edge pixels by 47/255 at 125% scaling despite
  // identical final coordinates. Allow up to 16/255 for subpixel edge
  // rounding; intermediate geometry is checked independently above.
  assert.ok(difference <= 16, `${label}: end-of-transition pixel jump ${difference}/255`);
}

(async () => {
  const browser = await chromium.launch({executablePath: '/usr/bin/google-chrome', headless: true});
  try {
    for (const width of [1440, 390]) {
      for (const deviceScaleFactor of [1, 1.25, 2]) {
        const page = await browser.newPage({viewport: {width, height: 1000}, deviceScaleFactor});
        await page.goto(source);
        await page.evaluate(() => document.fonts.ready);
        // Isolate geometry/rasterization from the button's color transition.
        await page.addStyleTag({content: '.cta-arrow { color: black !important; background: white; }'});
        for (const selector of ['.hero .primary', '.hero .secondary', '.statement .primary']) {
          const link = page.locator(selector);
          const arrow = link.locator('.cta-arrow');
          const label = `${width}px / DPR ${deviceScaleFactor} / ${selector}`;
          await page.mouse.move(0, 0);
          await page.evaluate(() => document.activeElement.blur());
          await page.waitForTimeout(180);
          await link.hover();
          await checkTransition(page, arrow, `${label} hover`);
          await page.mouse.move(0, 0);
          await checkTransition(page, arrow, `${label} exit`);
        }
        await page.emulateMedia({reducedMotion: 'reduce'});
        const link = page.locator('.statement .primary');
        await link.hover();
        assert.equal(await link.locator('.arrow-shaft').evaluate(element => getComputedStyle(element).opacity), '1');
        assert.equal(await link.locator('svg').evaluate(element => element.getAnimations({subtree: true}).length), 0);
        await page.close();
      }
    }
    console.log('Arrow entry/exit geometry, endpoint pixels, and reduced motion passed at desktop/mobile and 100%, 125%, 200% display scales.');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
