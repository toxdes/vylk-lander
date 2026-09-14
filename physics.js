/* Screen pixels, seconds, and one fixed step for flight and lid anticipation. */
(function (root) {
  'use strict';
  const DT = 1 / 120;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function launch(origin, pull, world, radius) {
    const gain = Math.max(7, world.width / 115);
    return { x: origin.x + pull.x, y: origin.y + pull.y,
      vx: -pull.x * gain, vy: -pull.y * gain, radius,
      angle: 0, spin: -pull.x * 2, time: 0, bounces: 0 };
  }

  function mouthEntry(oldX, oldY, ball, bin) {
    const surface = bin.top - ball.radius;
    if (ball.vy <= 0 || oldY > surface || ball.y < surface) return null;
    // Paper compresses at the lip: use its center across the actual opening,
    // not a sphere-radius inset that leaves only half the visible mouth usable.
    // Vertically, capture on first contact (bottom of paper meets the rim).
    const inset = Math.min(6, (bin.right - bin.left) * .1);
    const fraction = (surface - oldY) / (ball.y - oldY);
    const x = oldX + (ball.x - oldX) * fraction;
    return x >= bin.left + inset && x <= bin.right - inset ? { x, y: surface } : null;
  }

  function step(ball, world) {
    const oldX = ball.x, oldY = ball.y, r = ball.radius;
    ball.x += ball.vx * DT;
    ball.y += ball.vy * DT + 0.5 * world.gravity * DT * DT;
    ball.vy += world.gravity * DT;
    ball.angle += ball.spin * DT;
    ball.time += DT;
    let event = null;
    const bin = world.bin;

    // Test the swept opening sensor BEFORE any solid-bin response. This is
    // shared by every moving body and the lid forecast, including bank shots.
    const entry = bin && mouthEntry(oldX, oldY, ball, bin);
    if (entry) {
      ball.x = entry.x;
      ball.y = entry.y;
      return 'catch';
    }

    // The rim and sides are solid; touching the side is not a basket.
    if (bin) {
      // Sweep the side faces too: a fast shot cannot tunnel through the body
      // and accidentally become a basket on the next step.
      const sideX = ball.vx < 0 ? bin.right + r : bin.left - r;
      const crossedSide = ball.vx < 0 ? oldX >= sideX && ball.x <= sideX : oldX <= sideX && ball.x >= sideX;
      if (ball.vx && crossedSide) {
        const fraction = (sideX - oldX) / (ball.x - oldX);
        const sideY = oldY + (ball.y - oldY) * fraction;
        if (sideY >= bin.top && sideY <= bin.bottom) {
          ball.x = sideX;
          ball.y = sideY;
          ball.vx *= -.5;
          event = 'rim';
        }
      }
      if (oldY >= bin.bottom + r && ball.y <= bin.bottom + r && ball.vy < 0) {
        const fraction = (bin.bottom + r - oldY) / (ball.y - oldY);
        const bottomX = oldX + (ball.x - oldX) * fraction;
        if (bottomX >= bin.left && bottomX <= bin.right) {
          ball.x = bottomX;
          ball.y = bin.bottom + r;
          ball.vy *= -.5;
          event = 'rim';
        }
      }
      const px = clamp(ball.x, bin.left, bin.right);
      const py = clamp(ball.y, bin.top, bin.bottom);
      const dx = ball.x - px, dy = ball.y - py;
      const distance = Math.hypot(dx, dy);
      const inMouth = ball.x >= bin.left + 6 && ball.x <= bin.right - 6 && ball.y <= bin.top;
      if (distance < r && !inMouth) {
        let nx = distance ? dx / distance : (oldX < bin.left ? -1 : 1);
        let ny = distance ? dy / distance : 0;
        ball.x += nx * (r - distance);
        ball.y += ny * (r - distance);
        const normalSpeed = ball.vx * nx + ball.vy * ny;
        if (normalSpeed < 0) {
          ball.vx -= 1.5 * normalSpeed * nx;
          ball.vy -= 1.5 * normalSpeed * ny;
          event = 'rim';
        }
      }
    }
    if (ball.x < r || ball.x > world.width - r) {
      ball.x = clamp(ball.x, r, world.width - r);
      ball.vx = -ball.vx * 0.62;
      ball.spin *= -0.7;
      event = 'wall';
    }
    if (ball.y < r) {
      ball.y = r;
      ball.vy = Math.abs(ball.vy) * 0.45;
      event = 'ceiling';
    }
    if (ball.y >= world.floor - r && ball.vy > 0) {
      ball.y = world.floor - r;
      ball.vy *= -0.48;
      ball.vx *= 0.74;
      ball.spin = ball.vx * 1.5;
      event = 'floor';
    }
    if (event) ball.bounces++;
    return event;
  }

  function predict(initial, world) {
    world = { ...world, bodies: (world.bodies || []).map(body => ({ ...body })) };
    const ball = { ...initial }, points = [{ x: ball.x, y: ball.y }];
    let event;
    for (let i = 0; i < 720; i++) {
      event = advance(ball, world);
      if (i % 6 === 0 || event) points.push({ x: ball.x, y: ball.y });
      if (event === 'catch' || event === 'floor') break;
    }
    points.push({ x: ball.x, y: ball.y });
    return { points, end: ball, event };
  }
  function collide(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const distance = Math.hypot(dx, dy), diameter = a.radius + b.radius;
    if (distance >= diameter) return false;
    const nx = distance ? dx / distance : 1, ny = distance ? dy / distance : 0;
    const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (closing >= 0) return false;
    // Equal paper masses, inelastic contact. Momentum transfers to both balls.
    const impulse = -(1 + .62) * closing / 2;
    a.vx -= impulse * nx; a.vy -= impulse * ny;
    b.vx += impulse * nx; b.vy += impulse * ny;
    const separation = (diameter - distance + .01) / 2;
    a.x -= separation * nx; a.y -= separation * ny;
    b.x += separation * nx; b.y += separation * ny;
    a.spin += (a.vy * nx - a.vx * ny) * .35;
    b.spin += (b.vy * nx - b.vx * ny) * .35;
    a.awake = b.awake = true;
    a.bounces++; b.bounces++;
    return true;
  }
  function advance(primary, world) {
    const balls = [primary, ...(world.bodies || [])];
    for (const ball of balls) {
      ball.event = null;
      if (ball.retired || (ball !== primary && !ball.awake)) continue;
      ball.event = step(ball, world);
      if (ball.event === 'catch') ball.retired = true;
    }
    for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
      const a = balls[i], b = balls[j];
      if (a.retired || b.retired || (!a.awake && !b.awake && a !== primary)) continue;
      if (collide(a, b)) {
        if (!a.event) a.event = 'ball';
        if (!b.event) b.event = 'ball';
      }
    }
    return primary.event;
  }
  // Internal only: anticipate entry after walls, floor, rim, or another ball.
  // Clone every body so opening the lid cannot alter the live simulation.
  function incoming(primary, world, horizon = .28) {
    const future = { ...primary };
    const futureWorld = { ...world, bodies: (world.bodies || []).map(body => ({ ...body })) };
    for (let i = 0; i < Math.ceil(horizon / DT); i++) {
      advance(future, futureWorld);
      if (future.event === 'catch' || futureWorld.bodies.some(body => body.event === 'catch')) return true;
    }
    return false;
  }
  const api = { DT, launch, step, advance, collide, predict, incoming, clamp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PaperPhysics = api;
})(typeof window === 'undefined' ? globalThis : window);
