(function () {
  var releaseVersion = String(window.VYLK_VERSION || 'dev');
  var osButtons = document.querySelectorAll('[data-os-tab]');
  var osPanels = document.querySelectorAll('[data-os-panel]');
  var linuxButtons = document.querySelectorAll('[data-linux-tab]');
  var linuxPanels = document.querySelectorAll('[data-linux-panel]');
  var windowsButtons = document.querySelectorAll('[data-windows-tab]');
  var windowsPanels = document.querySelectorAll('[data-windows-panel]');
  var macosButtons = document.querySelectorAll('[data-macos-tab]');
  var macosPanels = document.querySelectorAll('[data-macos-panel]');
  var copyButtons = document.querySelectorAll('.copy-button');

  function detectLinuxMethod() {
    var platform = '';
    if (typeof navigator !== 'undefined') {
      platform = [
        navigator.userAgentData && navigator.userAgentData.platform,
        navigator.platform,
        navigator.userAgent
      ].filter(Boolean).join(' ').toLowerCase();
    }
    if (/\b(fedora|red hat|rhel|centos|rocky|alma)\b/.test(platform)) return 'fedora';
    if (/\b(arch linux|archlinux|manjaro|endeavour|endeavouros|garuda)\b/.test(platform)) return 'arch';
    return 'ubuntu';
  }

  function select(buttons, panels, button, key, value) {
    buttons.forEach(function (item) {
      var selected = item === button;
      item.classList.toggle('active', selected);
      item.setAttribute('aria-selected', selected ? 'true' : 'false');
      item.tabIndex = selected ? 0 : -1;
    });
    panels.forEach(function (panel) {
      panel.classList.toggle('active', panel.dataset[key] === value);
    });
  }

  var detectedLinux = document.querySelector('[data-linux-tab="' + detectLinuxMethod() + '"]');
  if (detectedLinux) select(linuxButtons, linuxPanels, detectedLinux, 'linuxPanel', detectedLinux.dataset.linuxTab);

  osButtons.forEach(function (button) {
    var panel = document.querySelector('[data-os-panel="' + button.dataset.osTab + '"]');
    button.id = 'os-' + button.dataset.osTab;
    button.setAttribute('aria-controls', 'panel-' + button.dataset.osTab);
    button.tabIndex = button.classList.contains('active') ? 0 : -1;
    panel.id = 'panel-' + button.dataset.osTab;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', button.id);
    button.addEventListener('click', function () {
      select(osButtons, osPanels, button, 'osPanel', button.dataset.osTab);
      var finish = document.querySelector('.setup-finish');
      if (finish) finish.hidden = button.dataset.osTab === 'macos';
    });
    button.addEventListener('keydown', function (event) {
      var buttons = Array.from(osButtons), index = buttons.indexOf(button);
      if (event.key === 'ArrowRight') index = (index + 1) % buttons.length;
      else if (event.key === 'ArrowLeft') index = (index + buttons.length - 1) % buttons.length;
      else if (event.key === 'Home') index = 0;
      else if (event.key === 'End') index = buttons.length - 1;
      else return;
      event.preventDefault();
      buttons[index].click();
      buttons[index].focus();
    });
  });

  function setupMethodTabs(buttons, panels, buttonKey, panelKey, idPrefix) {
    buttons.forEach(function (button) {
      var attribute = panelKey.replace(/[A-Z]/g, function (letter) { return '-' + letter.toLowerCase(); });
      var panel = document.querySelector('[data-' + attribute + '="' + button.dataset[buttonKey] + '"]');
      if (!panel) return;
      button.id = idPrefix + '-' + button.dataset[buttonKey];
      button.setAttribute('aria-controls', panel.id);
      button.tabIndex = button.classList.contains('active') ? 0 : -1;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
      button.addEventListener('click', function () {
        select(buttons, panels, button, panelKey, button.dataset[buttonKey]);
      });
      button.addEventListener('keydown', function (event) {
        var items = Array.from(buttons), index = items.indexOf(button);
        if (event.key === 'ArrowRight') index = (index + 1) % items.length;
        else if (event.key === 'ArrowLeft') index = (index + items.length - 1) % items.length;
        else if (event.key === 'Home') index = 0;
        else if (event.key === 'End') index = items.length - 1;
        else return;
        event.preventDefault();
        items[index].click();
        items[index].focus();
      });
    });
  }

  setupMethodTabs(linuxButtons, linuxPanels, 'linuxTab', 'linuxPanel', 'linux');
  setupMethodTabs(windowsButtons, windowsPanels, 'windowsTab', 'windowsPanel', 'windows');
  setupMethodTabs(macosButtons, macosPanels, 'macosTab', 'macosPanel', 'macos');

  function releaseUrl(asset) {
    return 'https://packages.toxdes.com/releases/' + asset.replace('{version}', releaseVersion);
  }

  document.querySelectorAll('[data-release-asset]').forEach(function (link) {
    link.href = releaseUrl(link.dataset.releaseAsset);
    if (link.dataset.releaseLabel) link.textContent = link.dataset.releaseLabel.replace('{version}', releaseVersion);
  });
  document.querySelectorAll('[data-vylk-version]').forEach(function (element) {
    element.textContent = releaseVersion;
  });
  document.querySelectorAll('[data-version-template]').forEach(function (element) {
    element.textContent = element.textContent.replaceAll('{version}', releaseVersion);
  });

  document.querySelectorAll('[data-linux-download]').forEach(function (link) {
    link.addEventListener('click', function () {
      var archive = 'vylk_' + releaseVersion + '_' + link.dataset.linuxDownload + '.tar.gz';
      document.querySelector('[data-linux-install]').textContent = 'curl -fsSL https://packages.toxdes.com/releases/' + archive + ' | sudo tar xzC /';
    });
  });

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    var area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    var copied = document.execCommand('copy');
    area.remove();
    return copied ? Promise.resolve() : Promise.reject(new Error('Copy was not available'));
  }

  copyButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var command = button.parentElement.querySelector('code').textContent;
      copyText(command).then(function () {
        button.textContent = 'Copied';
        button.classList.add('copied');
        window.setTimeout(function () {
          button.textContent = 'Copy';
          button.classList.remove('copied');
        }, 1400);
      }).catch(function () {
        button.textContent = 'Select text';
        var range = document.createRange();
        range.selectNodeContents(button.parentElement.querySelector('code'));
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        window.setTimeout(function () { button.textContent = 'Copy'; }, 1800);
      });
    });
  });

})();

(function () {
  var carousel = document.querySelector('.screen-carousel');
  if (!carousel) return;
  var slides = Array.from(carousel.querySelectorAll('.stage-preview'));
  var previous = carousel.querySelector('[data-screen-prev]');
  var next = carousel.querySelector('[data-screen-next]');
  var current = 0;
  var timer = 0;
  var transitionTimer = 0;
  var transitionFrame = 0;
  var paused = false;
  var visible = true;
  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var motionClasses = ['is-entering-from-left', 'is-entering-from-right', 'is-settling', 'is-leaving-to-left', 'is-leaving-to-right'];

  function updateLabels() {
    slides.forEach(function (slide, slideIndex) {
      var active = slideIndex === current;
      slide.setAttribute('aria-hidden', active ? 'false' : 'true');
      slide.setAttribute('aria-label', slide.getAttribute('aria-label').replace(/, slide \d+ of \d+$/, '') + ', slide ' + (slideIndex + 1) + ' of ' + slides.length);
    });
  }

  function clearMotion() {
    window.clearTimeout(transitionTimer);
    transitionTimer = 0;
    window.cancelAnimationFrame(transitionFrame);
    transitionFrame = 0;
    slides.forEach(function (slide) {
      motionClasses.forEach(function (className) { slide.classList.remove(className); });
      slide.classList.toggle('is-active', slide === slides[current]);
    });
  }

  function show(index, direction) {
    var nextIndex = (index + slides.length) % slides.length;
    if (nextIndex === current && direction !== 0) return;
    clearMotion();
    var outgoing = slides[current];
    var incoming = slides[nextIndex];
    current = nextIndex;
    if (direction === 0 || reducedMotion) {
      slides.forEach(function (slide, slideIndex) {
        slide.classList.toggle('is-active', slideIndex === current);
      });
      updateLabels();
      return;
    }
    var forward = direction > 0;
    outgoing.classList.add(forward ? 'is-leaving-to-left' : 'is-leaving-to-right');
    incoming.classList.add('is-active', forward ? 'is-entering-from-right' : 'is-entering-from-left');
    current = nextIndex;
    updateLabels();
    transitionFrame = window.requestAnimationFrame(function () {
      transitionFrame = window.requestAnimationFrame(function () {
        incoming.classList.add('is-settling');
        transitionFrame = 0;
      });
    });
    transitionTimer = window.setTimeout(function () {
      incoming.classList.remove(forward ? 'is-entering-from-right' : 'is-entering-from-left', 'is-settling');
      outgoing.classList.remove('is-active', forward ? 'is-leaving-to-left' : 'is-leaving-to-right');
      transitionTimer = 0;
    }, 620);
  }

  function schedule() {
    window.clearTimeout(timer);
    if (paused || !visible || reducedMotion) return;
    timer = window.setTimeout(function () {
      show(current + 1, 1);
      schedule();
    }, 5200);
  }

  function pause() { paused = true; window.clearTimeout(timer); }
  function resume() { paused = false; schedule(); }

  previous.addEventListener('click', function () { show(current - 1, -1); schedule(); });
  next.addEventListener('click', function () { show(current + 1, 1); schedule(); });
  carousel.addEventListener('mouseenter', pause);
  carousel.addEventListener('mouseleave', resume);
  carousel.addEventListener('focusin', pause);
  carousel.addEventListener('focusout', function (event) {
    if (!carousel.contains(event.relatedTarget)) resume();
  });
  carousel.addEventListener('keydown', function (event) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    var direction = event.key === 'ArrowRight' ? 1 : -1;
    show(current + direction, direction);
    schedule();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) pause();
    else resume();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = Boolean(entries[0] && entries[0].isIntersecting);
      if (visible) resume(); else pause();
    }, { threshold: 0.15 }).observe(carousel);
  }
  show(0, 0);
  schedule();
})();

(function () {
  var hero = document.querySelector('.hero');
  if (!hero) return;

  var svgNS = 'http://www.w3.org/2000/svg';
  var guideSpacing = 49;
  var scheduled = false;

  function makeSVGElement(name, attributes) {
    var element = document.createElementNS(svgNS, name);
    Object.keys(attributes || {}).forEach(function (attribute) {
      element.setAttribute(attribute, attributes[attribute]);
    });
    return element;
  }

  var svg = makeSVGElement('svg', {
    'class': 'hero-guides',
    'aria-hidden': 'true',
    'focusable': 'false',
    'preserveAspectRatio': 'none'
  });
  var defs = makeSVGElement('defs');
  var blur = makeSVGElement('filter', {
    id: 'vylk-guide-fade',
    x: '-30%',
    y: '-80%',
    width: '160%',
    height: '260%',
    'color-interpolation-filters': 'sRGB'
  });
  blur.appendChild(makeSVGElement('feGaussianBlur', { stdDeviation: '10' }));

  var mask = makeSVGElement('mask', {
    id: 'vylk-guide-mask',
    maskUnits: 'userSpaceOnUse',
    maskContentUnits: 'userSpaceOnUse'
  });
  var maskBase = makeSVGElement('rect', { x: '0', y: '0', fill: '#fff' });
  var cutouts = makeSVGElement('g', { fill: '#000', filter: 'url(#vylk-guide-fade)' });
  mask.appendChild(maskBase);
  mask.appendChild(cutouts);
  defs.appendChild(blur);
  defs.appendChild(mask);

  var lines = makeSVGElement('g', {
    mask: 'url(#vylk-guide-mask)',
    stroke: '#62676a',
    'stroke-opacity': '.12',
    'stroke-width': '1',
    'shape-rendering': 'crispEdges'
  });
  svg.appendChild(defs);
  svg.appendChild(lines);
  hero.insertBefore(svg, hero.firstChild);

  function addCutout(rect, heroRect, paddingX, paddingY) {
    if (!rect.width || !rect.height) return;
    cutouts.appendChild(makeSVGElement('rect', {
      x: (rect.left - heroRect.left - paddingX).toFixed(2),
      y: (rect.top - heroRect.top - paddingY).toFixed(2),
      width: (rect.width + paddingX * 2).toFixed(2),
      height: (rect.height + paddingY * 2).toFixed(2),
      rx: Math.min(8, rect.height / 4).toFixed(2)
    }));
  }

  function addTextCutouts(element, heroRect) {
    if (!element || element.offsetParent === null) return;
    var walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    var textNode;
    while ((textNode = walker.nextNode())) {
      if (!textNode.nodeValue.trim()) continue;
      var range = document.createRange();
      range.selectNodeContents(textNode);
      Array.prototype.forEach.call(range.getClientRects(), function (rect) {
        addCutout(rect, heroRect, 18, 10);
      });
      range.detach();
    }
  }

  function renderGuides() {
    scheduled = false;
    var heroRect = hero.getBoundingClientRect();
    var width = Math.round(heroRect.width);
    var height = Math.round(heroRect.height);
    if (!width || !height) return;

    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    maskBase.setAttribute('width', width);
    maskBase.setAttribute('height', height);
    lines.replaceChildren();
    cutouts.replaceChildren();

    for (var y = 0.5; y < height; y += guideSpacing) {
      lines.appendChild(makeSVGElement('line', { x1: '0', y1: y, x2: width, y2: y }));
    }

    [
      hero.querySelector('.hero-side p'),
      hero.querySelector('.hero-content h1'),
      hero.querySelector('.hero-content > p'),
      hero.querySelector('.note-invitation')
    ].forEach(function (element) {
      addTextCutouts(element, heroRect);
    });

    hero.querySelectorAll('.hero-actions a').forEach(function (button) {
      if (button.offsetParent !== null) addCutout(button.getBoundingClientRect(), heroRect, 16, 12);
    });
  }

  function scheduleRender() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(renderGuides);
  }

  var resizeObserver = 'ResizeObserver' in window ? new ResizeObserver(scheduleRender) : null;
  if (resizeObserver) {
    resizeObserver.observe(hero);
    hero.querySelectorAll('.hero-side p, .hero-content h1, .hero-content > p, .hero-actions a').forEach(function (element) {
      resizeObserver.observe(element);
    });
  } else {
    window.addEventListener('resize', scheduleRender, { passive: true });
  }

  var invitationObserver = new MutationObserver(function () {
    var invitation = hero.querySelector('.note-invitation');
    if (invitation && resizeObserver) resizeObserver.observe(invitation);
    scheduleRender();
  });
  var notes = hero.querySelector('.hero-notes');
  if (notes) invitationObserver.observe(notes, { childList: true, subtree: true, characterData: true });

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleRender);
  window.addEventListener('load', scheduleRender, { once: true });
  scheduleRender();
})();
