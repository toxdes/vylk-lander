const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../physics.js');
const world = { width: 1440, floor: 992, gravity: 1250, bin: { left: 46, right: 140, top: 874, bottom: 967 } };
const ball = overrides => ({ x: 500, y: 200, vx: 0, vy: 0, radius: 24, angle: 0, spin: 0, time: 0, bounces: 0, ...overrides });

test('release velocity points opposite the pull and has no drag easing', () => {
  const shot = P.launch({ x: 1000, y: 200 }, { x: 100, y: 60 }, world, 24);
  assert.ok(shot.vx < 0 && shot.vy < 0);
  assert.equal(shot.x, 1100);
});
test('free flight agrees with the analytic gravity equation after one second', () => {
  const shot = ball({ vx: 120, vy: -100 });
  for (let i = 0; i < 120; i++) P.step(shot, world);
  assert.ok(Math.abs(shot.x - 620) < 1e-8);
  assert.ok(Math.abs(shot.y - 725) < 1e-8);
});
test('a fast descending ball crossing the mouth cannot tunnel through it', () => {
  const shot = ball({ x: 93, y: 840, vy: 9000 });
  assert.equal(P.step(shot, world), 'catch');
  assert.equal(shot.y, 850, 'Capture at the leading edge, before solid-bin contact');
});
test('touching the bin from the side is a rebound, never a catch', () => {
  const shot = ball({ x: 164, y: 910, vx: -1200 });
  assert.equal(P.step(shot, world), 'rim');
  assert.ok(shot.vx > 0);
});
test('rim clips are not silently promoted to successful shots', () => {
  const shot = ball({ x: 50, y: 848, vy: 1000 });
  assert.equal(P.step(shot, world), 'rim');
  assert.ok(shot.vy < 0);
});
test('the visible opening accepts paper across its width, not just the center slot', () => {
  for (const x of [53, 65, 69, 70, 93, 116, 120, 128, 133]) {
    const shot = ball({ x, y: 848, vy: 400 });
    assert.equal(P.step(shot, world), 'catch', `Paper above the opening at x=${x} must not bounce off an invisible lid`);
    assert.equal(shot.y, 850);
  }
});
test('diagonal top entries cannot slip past the catch sensor', () => {
  for (const initial of [
    { x: 135, y: 842, vx: -800, vy: 1500 },
    { x: 51, y: 842, vx: 800, vy: 1500 },
    { x: 120, y: 850, vx: 0, vy: 400 }
  ]) assert.equal(P.step(ball(initial), world), 'catch');
});
test('side hits below the opening and upward passes are not catches', () => {
  for (const initial of [
    { x: 164, y: 898, vx: -1200, vy: 300 },
    { x: 22, y: 898, vx: 1200, vy: 300 },
    { x: 93, y: 848, vx: 0, vy: -300 }
  ]) assert.notEqual(P.step(ball(initial), world), 'catch');
});
test('fast side hits cannot tunnel through the trashcan', () => {
  const scene = { ...world, bin: { left: 200, right: 294, top: 500, bottom: 650 } };
  for (const initial of [{ x: 340, y: 560, vx: -12000 }, { x: 160, y: 560, vx: 12000 }]) {
    const shot = ball(initial);
    assert.equal(P.step(shot, scene), 'rim');
    assert.ok(shot.vx * initial.vx < 0, 'Side impact must reflect the velocity');
    assert.ok(shot.x <= scene.bin.left - shot.radius || shot.x >= scene.bin.right + shot.radius);
  }
});
test('the underside is solid, even at high velocity', () => {
  const scene = { ...world, bin: { left: 200, right: 294, top: 500, bottom: 650 } };
  const shot = ball({ x: 247, y: 700, vy: -12000 });
  assert.equal(P.step(shot, scene), 'rim');
  assert.ok(shot.vy > 0);
  assert.equal(shot.y, 674);
});
test('crossing into the mouth sideways below its top-contact plane is not a catch', () => {
  for (const initial of [
    { x: 144, y: 858, vx: -1200, vy: 50 },
    { x: 42, y: 858, vx: 1200, vy: 50 }
  ]) assert.notEqual(P.step(ball(initial), world), 'catch');
});
test('floor bounce loses energy', () => {
  const shot = ball({ x: 600, y: 967, vx: 300, vy: 900 });
  assert.equal(P.step(shot, world), 'floor');
  assert.ok(shot.vy < 0 && Math.abs(shot.vy) < 900);
  assert.ok(Math.abs(shot.vx) < 300);
});
test('two paper balls exchange momentum and separate on contact', () => {
  const a = ball({ x: 200, y: 200, vx: 800, awake: true });
  const b = ball({ x: 240, y: 200, vx: 0, awake: false });
  const momentum = a.vx + b.vx;
  assert.equal(P.collide(a, b), true);
  assert.ok(b.awake);
  assert.ok(b.vx > a.vx && a.vx > 0);
  assert.ok(Math.abs(a.vx + b.vx - momentum) < 1e-8);
  assert.ok(b.x - a.x >= 48);
});
test('preview simulates a collision without moving the actual resting ball', () => {
  const resting = ball({ x: 250, y: 230, awake: false, id: 1 });
  const scene = { ...world, bodies: [resting] };
  const copy = { ...resting };
  P.predict(ball({ x: 200, y: 230, vx: 800 }), scene);
  assert.deepEqual(resting, copy);
});
test('preview endpoint is the physical first landing, including wall bounces', () => {
  for (const pull of [{ x: 90, y: 20 }, { x: -100, y: 40 }, { x: 50, y: 90 }]) {
    const initial = P.launch({ x: 1080, y: 260 }, pull, world, 24);
    const predicted = P.predict(initial, world);
    const actual = { ...initial };
    let event;
    for (let i = 0; i < 720; i++) {
      event = P.step(actual, world);
      if (event === 'catch' || event === 'floor') break;
    }
    assert.equal(actual.x, predicted.end.x);
    assert.equal(actual.y, predicted.end.y);
    assert.equal(event, predicted.event);
  }
});
test('modest pulls can reach a basket across the desktop without bank shots', () => {
  let reachable = false;
  for (let x = 50; x <= 100; x += 2) for (let y = -20; y <= 70; y += 2) {
    const result = P.predict(P.launch({ x: 1080, y: 260 }, { x, y }, world, 24), world);
    if (result.event === 'catch' && result.end.bounces === 0) reachable = true;
  }
  assert.ok(reachable);
});

test('a wall and floor bank shot opens the lid and still counts', () => {
  const shot = P.launch({ x: 1080, y: 260 }, { x: -137, y: -11 }, world, 24);
  const events = new Set();
  let anticipated = false;
  for (let i = 0; i < 960; i++) {
    anticipated ||= P.incoming(shot, world);
    const event = P.advance(shot, world);
    if (event) events.add(event);
    if (event === 'catch') break;
  }
  assert.ok(events.has('wall') && events.has('floor') && events.has('catch'));
  assert.ok(anticipated);
});

test('a ball awakened by another ball is forecast and caught independently', () => {
  const resting = ball({ x: 280, y: 550, awake: false });
  const scene = { ...world, bodies: [resting] };
  const shot = P.launch({ x: 500, y: 500 }, { x: 10, y: 76 }, scene, 24);
  let anticipated = false;
  for (let i = 0; i < 960; i++) {
    const before = JSON.stringify({ shot, scene });
    anticipated ||= P.incoming(shot, scene);
    assert.equal(JSON.stringify({ shot, scene }), before, 'Forecast never mutates live bodies');
    P.advance(shot, scene);
    if (resting.event === 'catch') break;
  }
  assert.ok(resting.awake && resting.retired && resting.event === 'catch');
  assert.ok(anticipated);
});

test('a secondary ball can score after the launched ball has already retired', () => {
  const primary = ball({ retired: true });
  const secondary = ball({ x: 93, y: 800, vy: 300, awake: true });
  const scene = { ...world, bodies: [secondary] };
  assert.ok(P.incoming(primary, scene));
  for (let i = 0; i < 120 && !secondary.retired; i++) P.advance(primary, scene);
  assert.equal(secondary.event, 'catch');
});
