(function () {
  'use strict';
  const physics = window.PaperPhysics;
  const notes = [...document.querySelectorAll('.sticky-note')];
  if (!physics || !notes.length) return;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const svgNS = 'http://www.w3.org/2000/svg';
  const layer = document.createElement('div');
  layer.className = 'paper-game';
  layer.innerHTML = `
    <div class="game-guide" aria-hidden="true">
      <span class="game-tether"></span>
      <span class="game-origin"></span>
    </div>
    <div class="game-bin" aria-hidden="true">
      <div class="bin-art">
        <span class="bin-label">Aim here</span>
        <svg class="bin-drawing" viewBox="0 0 150 160" fill="none">
          <ellipse cx="75" cy="150" rx="52" ry="5" fill="#303c38" opacity=".12"/>
          <path d="M28 52 37 140Q76 153 113 139L122 52" fill="#d4ded5" stroke="#48584d" stroke-width="2.5" stroke-linejoin="round"/>
          <ellipse cx="75" cy="52" rx="47" ry="9" fill="#637268" stroke="#48584d" stroke-width="2.5"/>
          <path d="m31 56 7 80q37 13 73 0l8-80q-43 12-88 0Z" fill="#d4ded5"/>
          <path d="m46 72 5 57m22-55 1 58m27-61-5 59" stroke="#809184" stroke-width="2.5" stroke-linecap="round"/>
          <path d="m41 68 5 62m32-60 1 61m27-63-5 63" stroke="#eff3ea" stroke-width="2" stroke-linecap="round"/>
          <path d="m34 60 4 76q37 15 73 0l8-76" stroke="#48584d" stroke-width="2.5" stroke-linecap="round"/>
          <g class="bin-lid">
            <path d="m62 34 1-12q11-6 24 0l1 12" stroke="#48584d" stroke-width="3" stroke-linecap="round"/>
            <path d="M20 43q54-16 110 0l1 10q-56 12-112 0Z" fill="#e8eee2" stroke="#48584d" stroke-width="2.5" stroke-linejoin="round"/>
            <path d="M27 46q48-10 97 0" stroke="#a3b2a2" stroke-width="2" stroke-linecap="round"/>
          </g>
        </svg>
      </div>
    </div>
    <p class="game-status" role="status" aria-live="polite"></p>`;
  document.body.append(layer);
  const bin = layer.querySelector('.game-bin');
  const label = layer.querySelector('.bin-label');
  const guide = layer.querySelector('.game-guide');
  const tether = layer.querySelector('.game-tether');
  const originDot = layer.querySelector('.game-origin');
  const status = layer.querySelector('.game-status');
  let active = null;
  let frameId = 0;
  let dragFrameId = 0;
  let score = 0;
  let finishingRound = false;
  let lidOpenedAt = 0;
  let binRect = null;
  let noteClicked = false;
  let hadPaperBalls = false;
  let decorationPauseTimer = 0;
  const invitation = document.createElement('span');
  invitation.className = 'note-invitation';
  invitation.textContent = 'What if you clicked on a note?';
  invitation.setAttribute('role', 'status');
  invitation.setAttribute('aria-live', 'polite');
  invitation.setAttribute('aria-atomic', 'true');
  document.querySelector('.hero-notes').append(invitation);

  const paperSVG = `<svg class="paper-drawing" viewBox="0 0 64 64" aria-hidden="true">
    <path d="m16 6 13-3 11 4 10 1 6 11-1 9 5 12-8 12-12 4-10 5-13-5-7-9-6-10 3-13 1-9Z" fill="var(--ball-paper)" stroke="var(--ball-ink)" stroke-width="1.4" stroke-linejoin="round"/>
    <path d="m16 6 6 17 18-16-6 24 22-12-12 24 8 9-22-11-13 15 3-24-16 5 18-14Z" fill="#fff" opacity=".25"/>
    <path d="m34 31 10 12 8 9-12 4-10 5 2-16-15 11 3-24-10 15-6-10 16-5 2-9Z" fill="#46362f" opacity=".13"/>
    <path d="m16 6 6 17 18-16-6 24 22-12M22 23l-2 9-16 5m16-5 12 13-15 11m17-25 10 12 8 9m-22 9 2-16 12-2M10 15l12 8m28-15-10-1" fill="none" stroke="var(--ball-ink)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity=".48"/>
  </svg>`;
  // Parse artwork once, outside the click/throw/celebration paths.
  const paperTemplate = document.createElement('template');
  paperTemplate.innerHTML = paperSVG;
  const crumbleAnimations = new WeakMap();
  const puffTemplate = document.createElementNS(svgNS, 'svg');
  puffTemplate.setAttribute('viewBox', '0 0 60 50');
  puffTemplate.classList.add('bin-puff');
  puffTemplate.innerHTML = '<path d="M12 37C-2 36 0 19 12 18C8 4 27 0 33 11C45 2 57 15 49 24C64 34 45 48 37 40C28 50 14 46 12 37Z" fill="#fafaf3" stroke="#94a091" stroke-width="1.5"/>';
  const center = el => {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  };
  function world(currentNote) {
    const rect = binRect || (binRect = bin.getBoundingClientRect());
    return {
      width: document.documentElement.clientWidth,
      floor: window.innerHeight - 8,
      gravity: Math.max(700, window.innerHeight * 1.25),
      bin: { left: rect.left + 28, right: rect.left + 122, top: rect.top + 52, bottom: rect.top + 145 },
      bodies: notes.flatMap((note, id) => {
        if (note === currentNote || !note.classList.contains('paper-ready') || note.classList.contains('paper-discarded')) return [];
        const position = center(note);
        if (position.x < 24 || position.x > innerWidth - 24 || position.y < 24 || position.y > innerHeight - 24) return [];
        return [{ ...position, homeX: position.x, homeY: position.y, id, vx: 0, vy: 0, radius: 24, angle: 0, spin: 0, time: 0, bounces: 0, awake: false }];
      })
    };
  }
  function announce(text) { if (status.textContent !== text) status.textContent = text; }
  function setLid(open) {
    if (bin.classList.contains('is-open') === open) return;
    if (open) lidOpenedAt = performance.now();
    bin.classList.toggle('is-open', open);
  }
  function updateHelp() {
    const remaining = notes.some(note => note.classList.contains('paper-ready') && !note.classList.contains('paper-discarded'));
    const uncrumpledNotes = notes.filter(note => !note.classList.contains('paper-discarded') && !note.classList.contains('paper-ready')).length;
    if (hadPaperBalls && !remaining) noteClicked = false;
    hadPaperBalls = remaining;
    const text = remaining ? 'Drag and release to launch'
      : uncrumpledNotes === 1 ? 'Yo can you do three bounces?'
      : noteClicked ? 'What if you clicked more?' : 'What if you clicked on a note?';
    if (invitation.textContent !== text) invitation.textContent = text;
    return remaining;
  }
  function pauseDecorations() {
    document.documentElement.classList.add('paper-game-active');
    clearTimeout(decorationPauseTimer);
    decorationPauseTimer = setTimeout(() => {
      if (!active) document.documentElement.classList.remove('paper-game-active');
    }, 280);
  }
  function showBin() {
    const remaining = updateHelp();
    if (bin.classList.contains('is-visible') !== remaining) bin.classList.toggle('is-visible', remaining);
    if (layer.classList.contains('has-balls') !== remaining) layer.classList.toggle('has-balls', remaining);
  }
  function paint(shot) {
    const { x, y, angle } = shot.ball;
    if (shot.paintedX !== x || shot.paintedY !== y) {
      shot.sprite.style.transform = `translate3d(${x - 28}px,${y - 28}px,0)`;
      shot.paintedX = x;
      shot.paintedY = y;
    }
    if (shot.paintedAngle !== angle) {
      shot.sprite.firstElementChild.style.transform = `rotate(${angle}deg)`;
      shot.paintedAngle = angle;
    }
  }
  function updatePull() {
    const shot = active;
    if (shot.paintedPullX === shot.pull.x && shot.paintedPullY === shot.pull.y) return;
    shot.ball = physics.launch(shot.origin, shot.pull, shot.world, 24);
    paint(shot);
    // A fixed-size line transformed from its origin avoids SVG path layout.
    tether.style.transform = `translate3d(${shot.origin.x}px,${shot.origin.y}px,0) rotate(${Math.atan2(shot.pull.y, shot.pull.x)}rad) scaleX(${Math.hypot(shot.pull.x, shot.pull.y)})`;
    shot.paintedPullX = shot.pull.x;
    shot.paintedPullY = shot.pull.y;
  }
  function queuePull() {
    if (dragFrameId) return;
    dragFrameId = requestAnimationFrame(() => {
      dragFrameId = 0;
      if (active?.phase === 'aim') updatePull();
    });
  }
  function makeSprite(note) {
    const sprite = document.createElement('div');
    sprite.className = 'flying-paper';
    sprite.append(paperTemplate.content.firstElementChild.cloneNode(true));
    sprite.style.setProperty('--ball-paper', note.style.getPropertyValue('--ball-paper'));
    sprite.style.setProperty('--ball-ink', note.style.getPropertyValue('--ball-ink'));
    layer.append(sprite);
    return sprite;
  }
  function begin(note, pointerId, pointer) {
    if (active) return false;
    // Measure before appending the moving sprite or changing classes.
    const origin = center(note), scene = world(note);
    const sprite = makeSprite(note);
    active = {
      note, sprite, pointerId, pointer, origin, world: scene,
      pull: { x: 0, y: 0 }, phase: 'aim', keyboard: pointerId === null
    };
    active.members = [active];
    note.classList.add('ball-in-play');
    note.setAttribute('aria-grabbed', 'true');
    layer.classList.add('is-playing');
    document.documentElement.classList.add('paper-game-active');
    originDot.style.transform = `translate3d(${origin.x - 4}px,${origin.y - 4}px,0)`;
    guide.classList.add('is-visible');
    updateHelp();
    if (active.keyboard) announce('Arrow keys to aim. Enter to throw. Esc to cancel.');
    updatePull();
    return true;
  }
  function drag(event) {
    if (!active || active.phase !== 'aim' || active.pointerId !== event.pointerId) return;
    const dx = event.clientX - active.pointer.x, dy = event.clientY - active.pointer.y;
    const length = Math.hypot(dx, dy);
    const maxPull = innerWidth < 600 ? 100 : 140;
    const ratio = length > maxPull ? maxPull / length : 1;
    active.pull = { x: dx * ratio, y: dy * ratio };
    queuePull();
  }
  function cleanup(shot) {
    const owner = shot.owner || shot;
    shot.sprite.remove();
    shot.note.classList.remove('ball-in-play');
    shot.note.removeAttribute('aria-grabbed');
    shot.phase = 'done';
    if (shot.keyboard && !shot.note.classList.contains('paper-discarded')) shot.note.focus({ preventScroll: true });
    if (owner.members.every(member => member.phase === 'done')) {
      layer.classList.remove('is-playing');
      document.documentElement.classList.remove('paper-game-active');
      setLid(false);
      guide.classList.remove('is-visible');
      active = null;
      showBin();
      if (score === notes.length) {
        finishRound();
      }
    }
  }
  async function returnHome(shot) {
    if (shot.phase === 'return') return;
    shot.phase = 'return';
    shot.ball.retired = true;
    guide.classList.remove('is-visible');
    // Normal returns use the position measured before launch. Geometry-change
    // cancellation refreshes all return positions together, before DOM writes.
    const home = shot.origin;
    const animation = shot.sprite.animate([
      { transform: shot.sprite.style.transform, opacity: 1 },
      { transform: `translate3d(${home.x - 28}px,${home.y - 28}px,0)`, opacity: 1 }
    ], { duration: reducedMotion.matches ? 120 : 520, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
    await animation.finished.catch(() => {});
    cleanup(shot);
  }
  function smoke() {
    if (reducedMotion.matches) return;
    const rect = binRect || (binRect = bin.getBoundingClientRect());
    const fragment = document.createDocumentFragment();
    const puffs = [];
    for (let i = 0; i < 7; i++) {
      const puff = puffTemplate.cloneNode(true);
      puff.style.left = rect.left + 45 + (i % 3) * 14 + 'px';
      puff.style.top = rect.top + 22 + 'px';
      fragment.append(puff);
      puffs.push(puff);
    }
    layer.append(fragment);
    puffs.forEach((puff, i) => {
      const side = i < 3 ? -1 : 1;
      const animation = puff.animate([
        { transform: 'translate(0,0) scale(.25) rotate(0)', opacity: 0 },
        { offset: .2, opacity: .9 },
        { transform: `translate(${side * (35 + i * 8)}px,${-35 - i * 8}px) scale(${.8 + i * .07}) rotate(${side * 22}deg)`, opacity: 0 }
      ], { duration: 620 + i * 45, delay: i * 25, easing: 'ease-out', fill: 'both' });
      animation.finished.then(() => puff.remove());
    });
  }
  async function catchBall(shot) {
    shot.phase = 'catch';
    shot.ball.retired = true;
    shot.sprite.dataset.phase = 'catch';
    setLid(true);
    shot.sprite.classList.add('is-caught');
    const destination = shot.world.bin;
    const animation = shot.sprite.animate([
      { transform: shot.sprite.style.transform },
      { transform: `translate3d(${(destination.left + destination.right) / 2 - 28}px,${destination.top + 58 - 28}px,0) scale(.65)` }
    ], { duration: reducedMotion.matches ? 100 : 300,
      // A very close/fast shot may arrive before the lid finishes opening.
      // Keep it at the lip until the opening is clear instead of drawing it
      // through a closed lid. The catch is already committed in the simulation.
      delay: reducedMotion.matches ? 0 : Math.max(0, 180 - (performance.now() - lidOpenedAt)),
      easing: 'cubic-bezier(.4,0,1,1)', fill: 'both' });
    await animation.finished.catch(() => {});
    shot.note.classList.add('paper-discarded');
    updateHelp();
    shot.note.setAttribute('tabindex', '-1');
    shot.sprite.style.opacity = '0';
    shot.phase = 'celebrate';
    const owner = shot.owner || shot;
    setLid(owner.members.some(member => member.phase === 'catch') || physics.incoming(owner.ball, owner.world));
    bin.classList.add('is-celebrating');
    score++;
    const praise = shot.ball.bounces >= 2
      ? ['Any Angle!', 'Trick shot!'][Math.floor(Math.random() * 2)]
      : 'Nice shot!';
    const message = score === notes.length ? 'All clear!' : praise;
    label.textContent = message;
    announce(`${message} ${score} of ${notes.length} notes cleared.`);
    setTimeout(smoke, reducedMotion.matches ? 0 : 110);
    await new Promise(resolve => setTimeout(resolve, reducedMotion.matches ? 180 : 650));
    bin.classList.remove('is-celebrating');
    cleanup(shot);
    if (score < notes.length) {
      label.textContent = 'Aim here';
      if (shot.keyboard) notes.find(n => !n.classList.contains('paper-discarded')).focus({ preventScroll: true });
    }
  }
  function launch() {
    const shot = active;
    if (!shot || shot.phase !== 'aim') return;
    cancelAnimationFrame(dragFrameId);
    dragFrameId = 0;
    // Flush the final pointer position before using it for the launch.
    updatePull();
    guide.classList.remove('is-visible');
    if (Math.hypot(shot.pull.x, shot.pull.y) < 5) { returnHome(shot); return; }
    shot.phase = 'flight';
    updateHelp();
    shot.sprite.dataset.phase = 'flight';
    shot.ball = physics.launch(shot.origin, shot.pull, shot.world, 24);
    let last = performance.now(), accumulator = 0;
    function frame(now) {
      if (active !== shot) return;
      // Keep the simulation in real time. Dropping accumulated time makes the
      // ball visibly slow down after a busy frame and feels worse than a short
      // catch-up pass.
      accumulator += (now - last) / 1000;
      last = now;
      while (accumulator >= physics.DT) {
        physics.advance(shot.ball, shot.world);
        accumulator -= physics.DT;
        for (const body of shot.world.bodies) {
          if (!body.awake || shot.members.some(member => member.ball === body)) continue;
          const note = notes[body.id], sprite = makeSprite(note);
          note.classList.add('ball-in-play');
          shot.members.push({ owner: shot, note, sprite, ball: body, origin: { x: body.homeX, y: body.homeY }, phase: 'flight', world: shot.world, keyboard: false });
        }
        for (const member of shot.members) {
          if (member.phase !== 'flight') continue;
          const event = member.ball.event;
          if (event === 'catch') { paint(member); catchBall(member); continue; }
          // A slow apex is not rest. Let rebounds and transferred momentum finish.
          const grounded = member.ball.y >= shot.world.floor - member.ball.radius - 2;
          member.restTime = grounded && Math.hypot(member.ball.vx, member.ball.vy) < 65
            ? (member.restTime || 0) + physics.DT : 0;
          if (member.ball.time > 8 || member.restTime > .35) {
            paint(member);
            announce('Missed! Your paper is back for another try.');
            returnHome(member);
          }
        }
      }
      const approaching = shot.members.some(member => member.phase === 'catch' || nearBin(member.ball, shot.world.bin));
      setLid(approaching);
      let inFlight = false;
      for (const member of shot.members) {
        if (member.phase !== 'flight') continue;
        paint(member);
        inFlight = true;
      }
      if (inFlight) frameId = requestAnimationFrame(frame);
    }
    frameId = requestAnimationFrame(frame);
  }
  // This cheap local check runs every paint frame. It opens the lid as a ball
  // enters the basket's neighborhood without cloning and simulating the whole
  // world ahead of time; the real swept collision remains the sole scorer.
  function nearBin(ball, basket) {
    if (!basket || ball.retired || ball.vy < -100) return false;
    const lead = .22;
    const futureX = ball.x + ball.vx * lead;
    const left = basket.left - ball.radius;
    const right = basket.right + ball.radius;
    const crossesMouth = (ball.x >= left && ball.x <= right) || (futureX >= left && futureX <= right) ||
      (ball.x < left && futureX > right) || (ball.x > right && futureX < left);
    // Side/body impacts are deliberately not a lid cue: only a descending ball
    // still above the mouth can be a valid top-entry candidate.
    return crossesMouth && ball.y >= basket.top - 180 && ball.y <= basket.top;
  }
  function cancel(event) {
    if (!active) return;
    cancelAnimationFrame(dragFrameId);
    dragFrameId = 0;
    cancelAnimationFrame(frameId);
    const returning = active.members.filter(member => member.phase === 'aim' || member.phase === 'flight');
    if (event?.type === 'resize' || event?.type === 'scroll' || event?.type === 'loadingdone') {
      for (const member of returning) member.origin = center(member.note);
    }
    returning.forEach(returnHome);
  }
  notes.forEach(note => {
    note.setAttribute('role', 'button');
    note.tabIndex = 0;
    note.dataset.crumples = '0';
    const name = note.querySelector('b').textContent;
    note.setAttribute('aria-label', name + '. Click to crumple this note.');
    function crumble() {
      if (note.classList.contains('paper-ready') || active) return;
      const count = Number(note.dataset.crumples) + 1;
      // Read all geometry/colors before mutations, avoiding a forced layout
      // immediately after removing the previous crumple state.
      let from, parent, paperColor, inkColor;
      if (count === 5) {
        from = note.getBoundingClientRect();
        parent = note.parentElement.getBoundingClientRect();
        const color = getComputedStyle(note);
        paperColor = color.backgroundColor;
        inkColor = color.color;
      }
      crumbleAnimations.get(note)?.cancel();
      noteClicked = true;
      note.dataset.crumples = String(count);
      note.classList.remove('crumble-1', 'crumble-2', 'crumble-3', 'crumble-4');
      // Freeze the six decorative wobble layers while the note changes shape.
      // This is especially important for the very first interaction, before a
      // ball has entered the active game state.
      pauseDecorations();
      if (count < 5) {
        note.classList.add('crumble-' + count);
        updateHelp();
        if (!reducedMotion.matches) crumbleAnimations.set(note,
          note.animate([{ scale: .94 }, { scale: 1 }], { duration: 160, easing: 'ease-out' }));
        return;
      }
      note.style.setProperty('--ball-paper', paperColor);
      note.style.setProperty('--ball-ink', inkColor);
      note.style.left = ((from.left + from.width / 2 - parent.left - 28) / parent.width * 100) + '%';
      note.style.top = (from.top + from.height / 2 - parent.top - 28) + 'px';
      // Clone the cached parsed SVG for every round; moving the same node would
      // leave later reset rounds without an illustration.
      note.append(paperTemplate.content.firstElementChild.cloneNode(true));
      note.classList.add('paper-ready');
      note.setAttribute('aria-label', name + ' paper ball. Drag back and release to throw. Or press Enter to aim with arrow keys.');
      showBin();
      if (!reducedMotion.matches) crumbleAnimations.set(note, note.animate([
        { scale: 1.65, rotate: '-12deg' }, { scale: .86, rotate: '7deg', offset: .7 }, { scale: 1, rotate: '0deg' }
      ], { duration: 350, easing: 'ease-out' }));
    }
    note.addEventListener('click', crumble);
    note.addEventListener('pointerdown', event => {
      if (!note.classList.contains('paper-ready') || note.classList.contains('paper-discarded') || (event.pointerType === 'mouse' && event.button !== 0)) return;
      if (!begin(note, event.pointerId, { x: event.clientX, y: event.clientY })) return;
      note.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    note.addEventListener('pointermove', drag);
    note.addEventListener('pointerup', event => {
      if (!active || active.pointerId !== event.pointerId || active.note !== note || active.phase !== 'aim') return;
      drag(event);
      if (note.hasPointerCapture(event.pointerId)) note.releasePointerCapture(event.pointerId);
      launch();
    });
    note.addEventListener('pointercancel', cancel);
    note.addEventListener('lostpointercapture', () => { if (active?.phase === 'aim' && !active.keyboard) cancel(); });
    note.addEventListener('keydown', event => {
      if (event.key === 'Escape') { cancel(); return; }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (!note.classList.contains('paper-ready')) crumble();
        else if (!active) {
          begin(note, null, null);
          active.pull = { x: 55, y: 35 };
          updatePull();
        } else if (active.note === note && active.keyboard) launch();
      }
      if (active?.note === note && active.keyboard && active.phase === 'aim' && event.key.startsWith('Arrow')) {
        event.preventDefault();
        const delta = event.shiftKey ? 1 : 6;
        if (event.key === 'ArrowLeft') active.pull.x += delta;
        if (event.key === 'ArrowRight') active.pull.x -= delta;
        if (event.key === 'ArrowUp') active.pull.y += delta;
        if (event.key === 'ArrowDown') active.pull.y -= delta;
        const length = Math.hypot(active.pull.x, active.pull.y), max = innerWidth < 600 ? 100 : 140;
        if (length > max) { active.pull.x *= max / length; active.pull.y *= max / length; }
        updatePull();
      }
    });
  });
  function resetRound() {
    notes.forEach(note => {
      note.classList.remove('paper-ready', 'paper-discarded');
      note.removeAttribute('style');
      note.querySelector('.paper-drawing')?.remove();
      note.dataset.crumples = '0';
      note.tabIndex = 0;
      note.setAttribute('aria-label', note.querySelector('b').textContent + '. Click to crumple this note.');
    });
    score = 0;
    noteClicked = false;
    hadPaperBalls = false;
    bin.classList.remove('is-visible', 'is-complete');
    layer.classList.remove('has-balls');
    document.documentElement.classList.remove('paper-game-active');
    updateHelp();
    label.textContent = 'Aim here';
    finishingRound = false;
    announce('All clear! Six fresh notes, ready for another round.');
  }
  async function finishRound() {
    if (finishingRound) return;
    finishingRound = true;
    announce('All six notes cleared! A fresh round is on its way.');
    if (!reducedMotion.matches) {
      const colors = ['#ae2448', '#dfb646', '#729b85', '#83adbf', '#b69ac9'];
      const viewportWidth = innerWidth;
      const start = { x: 92, y: innerHeight - 110 };
      const fragment = document.createDocumentFragment();
      const pieces = [];
      for (let i = 0; i < 28; i++) {
        const piece = document.createElement('i');
        piece.className = 'game-confetti';
        piece.style.backgroundColor = colors[i % colors.length];
        fragment.append(piece);
        pieces.push(piece);
      }
      layer.append(fragment);
      pieces.forEach((piece, i) => {
        const endX = 12 + (i / 27) * (viewportWidth - 24);
        const peakY = Math.max(24, start.y - 170 - (i % 6) * 65);
        const animation = piece.animate([
          { transform: `translate(${start.x}px,${start.y}px) rotate(0deg)`, opacity: 0 },
          { offset: .18, opacity: 1 },
          { offset: .55, transform: `translate(${endX * .8}px,${peakY}px) rotate(${i * 43}deg)`, opacity: 1 },
          { transform: `translate(${endX}px,${peakY + 190}px) rotate(${i * 71}deg)`, opacity: 0 }
        ], { duration: 1100, delay: (i % 5) * 30, easing: 'linear', fill: 'both' });
        animation.finished.then(() => piece.remove());
      });
    }
    await new Promise(resolve => setTimeout(resolve, reducedMotion.matches ? 700 : 1400));
    const keyboardFocus = notes.includes(document.activeElement);
    resetRound();
    if (!reducedMotion.matches) notes.forEach((note, index) => {
      note.animate([{ opacity: 0, scale: .86 }, { opacity: 1, scale: 1 }],
        { duration: 300, delay: index * 35, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'backwards' });
    });
    if (keyboardFocus) notes[0].focus({ preventScroll: true });
  }
  function geometryChanged(event) {
    binRect = null;
    cancel(event);
  }
  window.addEventListener('resize', geometryChanged);
  window.addEventListener('scroll', geometryChanged, { passive: true });
  document.fonts?.addEventListener('loadingdone', geometryChanged);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    entry.target.style.animationPlayState = entry.isIntersecting ? 'running' : 'paused';
  }));
  notes.forEach(note => observer.observe(note));
})();
