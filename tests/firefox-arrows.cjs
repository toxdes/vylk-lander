const {firefox} = require('playwright');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const {mkdtempSync} = require('node:fs');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');

const source = process.env.VYLK_URL || pathToFileURL(path.resolve(process.cwd(), 'index.html')).href;
const recordings = mkdtempSync(path.join(tmpdir(), 'vylk-firefox-arrows-'));

function decode(video, crop) {
  return execFileSync('ffmpeg', ['-v', 'error', '-i', video, '-vf', crop, '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1']);
}

function verticalCenter(frame, foreground, columns) {
  const background = [...frame.subarray(0, 3)];
  const direction = foreground.map((channel, index) => channel - background[index]);
  const magnitude = direction.reduce((sum, channel) => sum + channel * channel, 0);
  let weight = 0;
  let center = 0;
  for (let y = 0; y < 14; y++) {
    for (const x of columns) {
      const offset = (y * 18 + x) * 3;
      const alpha = direction.reduce((sum, channel, index) => sum + channel * (frame[offset + index] - background[index]), 0) / magnitude;
      // Discard low-level WebM compression noise in the flat background.
      if (alpha < .15) continue;
      weight += alpha;
      center += (y + .5) * alpha;
    }
  }
  return weight > 0 ? center / weight : null;
}

(async () => {
  const browser = await firefox.launch({headless: true});
  try {
    for (const width of [1440, 390]) {
      for (const deviceScaleFactor of [1, 1.25, 2]) {
        const viewport = {width, height: 1000};
        const context = await browser.newContext({viewport, deviceScaleFactor, recordVideo: {dir: recordings, size: viewport}});
        const page = await context.newPage();
        await page.goto(source);
        await page.evaluate(() => document.fonts.ready);
        const link = page.locator('.hero .primary');
        await link.scrollIntoViewIfNeeded();
        const bounds = await link.locator('.cta-arrow').boundingBox();
        await link.evaluate(element => {
          const marker = document.createElement('i');
          marker.style.cssText = 'position:fixed;left:0;top:0;width:8px;height:8px;background:#ff0000;z-index:999999;pointer-events:none';
          document.body.append(marker);
          element.addEventListener('mouseenter', () => {marker.style.background = '#00ff00';}, {once: true});
          const group = element.querySelector('.arrow-group');
          group.addEventListener('transitionend', event => {
            if (event.target !== group || event.propertyName !== 'transform') return;
            marker.style.background = '#0000ff';
            window.arrowNaturalEnd = true;
          });
        });
        await page.waitForTimeout(300);
        await link.hover();
        await page.waitForFunction(() => window.arrowNaturalEnd === true);
        await page.waitForTimeout(1200);
        const foreground = await link.locator('.cta-arrow').evaluate(element => getComputedStyle(element).color.match(/[\d.]+/g).slice(0, 3).map(Number));
        const video = page.video();
        await context.close();
        const videoPath = await video.path();
        const pixels = decode(videoPath, `crop=18:14:${Math.floor(bounds.x) - 2}:${Math.floor(bounds.y) - 2}`);
        const markers = decode(videoPath, 'crop=8:8:0:0');
        const approaching = [];
        const settled = [];
        for (let index = 0; index < pixels.length / (18 * 14 * 3); index++) {
          const offset = index * 8 * 8 * 3 + (3 * 8 + 3) * 3;
          const [r, g, b] = markers.subarray(offset, offset + 3);
          const green = g > 150 && r < 80 && b < 80;
          const blue = b > 150 && r < 80 && g < 80;
          if (!green && !blue) continue;
          const frame = pixels.subarray(index * 18 * 14 * 3, (index + 1) * 18 * 14 * 3);
          // Keep the shaft sample away from the chevron and clip edge; the
          // rightmost columns isolate the chevron tip without the shaft.
          const sample = {
            shaft: verticalCenter(frame, foreground, [4, 5, 6]),
            head: verticalCenter(frame, foreground, [12, 13]),
          };
          // Early in entry the chevron has not reached the tip sample columns.
          if (green && (sample.shaft === null || sample.head === null)) continue;
          assert.ok(sample.shaft !== null && sample.head !== null, 'The settled arrow must be visible');
          (green ? approaching : settled).push(sample);
        }
        const label = `Firefox ${width}px / DPR ${deviceScaleFactor}`;
        assert.ok(approaching.length >= 1 && settled.length >= 10, `${label}: missing natural transition frames (${approaching.length} approaching, ${settled.length} settled); ${videoPath}`);
        const late = settled.slice(-4);
        const shifts = {};
        const mean = (frames, part) => frames.reduce((sum, frame) => sum + frame[part], 0) / frames.length;
        const before = approaching.slice(-2);
        // There is no intended vertical motion. Allow 0.1 CSS px for video
        // encoding; average adjacent video frames to reduce compression noise.
        // Firefox's roughly 0.5px chevron snap must still fail this check.
        for (const part of ['shaft', 'head']) {
          shifts[part] = Math.abs(mean(late, part) - mean(before, part));
          assert.ok(shifts[part] <= .1, `${label}: ${part} jumped vertically by ${shifts[part].toFixed(3)}px at the endpoint; ${videoPath}`);
        }
        const alignment = Math.abs((mean(late, 'head') - mean(late, 'shaft')) - (mean(before, 'head') - mean(before, 'shaft')));
        assert.ok(alignment <= .1, `${label}: chevron/shaft alignment changed by ${alignment.toFixed(3)}px; ${videoPath}`);
        console.log(`PASS ${label}: head ${shifts.head.toFixed(3)}px, shaft ${shifts.shaft.toFixed(3)}px, alignment ${alignment.toFixed(3)}px`);
      }
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
