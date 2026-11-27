/* seopt-efecto-caida.js  |  Versión 1.1.1 (2026-11-27)  |  Seoptimizan
   Custom element <seopt-fall>. Sin librerías ni globales. */
(function () {
  if (customElements.get('seopt-fall')) return;

  var STORAGE_KEY = 'seopt-fall-paused';
  var SEEN_KEY = 'seopt-fall-seen';

  function num(el, name, fallback) {
    var n = parseFloat(el.getAttribute('data-' + name));
    return isNaN(n) ? fallback : n;
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function inWindow(start, end) {
    var now = Date.now();
    var s = start ? Date.parse(start) : NaN;
    var e = end ? Date.parse(end) : NaN;
    if (!isNaN(s) && now < s) return false;
    if (!isNaN(e) && now > e) return false;
    return true;
  }

  class SeoptFall extends HTMLElement {
    connectedCallback() {
      if (this.started) return;
      this.layer = this.querySelector('[data-seopt-layer]');
      this.toggle = this.querySelector('[data-seopt-toggle]');
      if (!this.layer) return;
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      var preview = this.getAttribute('data-preview') === 'true';
      if (!preview && !inWindow(this.getAttribute('data-start'), this.getAttribute('data-end'))) return;

      if (!preview && this.getAttribute('data-once') === 'true') {
        var seen = false;
        try { seen = window.sessionStorage.getItem(SEEN_KEY) === '1'; } catch (e) { seen = false; }
        if (seen) return;
        try { window.sessionStorage.setItem(SEEN_KEY, '1'); } catch (e) { /* sin almacenamiento: se muestra */ }
      }

      this.started = true;
      this.timer = 0;
      this.start = this.start.bind(this);
      var go = this.start;
      window.setTimeout(function () {
        if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 1500 });
        else go();
      }, 600);
    }

    disconnectedCallback() {
      if (this.timer) window.clearTimeout(this.timer);
    }

    start() {
      var mobile = window.matchMedia && window.matchMedia('(max-width: 749px)').matches;
      var count = Math.round(mobile ? num(this, 'count-mobile', 12) : num(this, 'count', 24));
      var sizeMin = num(this, 'size-min', 14);
      var sizeMax = Math.max(sizeMin, num(this, 'size-max', 34));
      var fallMin = num(this, 'fall-min', 9);
      var fallMax = Math.max(fallMin, num(this, 'fall-max', 18));
      var sway = num(this, 'sway', 40);
      var opacity = Math.max(0.05, num(this, 'opacity', 45) / 100);
      var shape = this.getAttribute('data-shape') || 'text';
      var text = this.getAttribute('data-text') || '%';
      var image = this.getAttribute('data-image') || '';
      var colors = (this.getAttribute('data-colors') || '').split(',').filter(Boolean);
      if (shape === 'image' && !image) shape = 'text';

      var frag = document.createDocumentFragment();
      for (var i = 0; i < count; i++) {
        var size = rand(sizeMin, sizeMax);
        var depth = sizeMax === sizeMin ? 1 : (size - sizeMin) / (sizeMax - sizeMin);
        var item = document.createElement('span');
        item.className = 'seopt-fall__item';
        var style = item.style;
        style.setProperty('--seopt-fall-x', rand(2, 98).toFixed(1) + '%');
        style.setProperty('--seopt-fall-dur', rand(fallMin, fallMax).toFixed(1) + 's');
        style.setProperty('--seopt-fall-delay', '-' + rand(0, fallMax).toFixed(1) + 's');
        style.setProperty('--seopt-fall-size', size.toFixed(0) + 'px');
        style.setProperty('--seopt-fall-o', (opacity * (0.35 + 0.65 * depth)).toFixed(2));
        style.setProperty('--seopt-fall-sway', rand(sway * 0.4, sway).toFixed(0) + 'px');
        style.setProperty('--seopt-fall-sway-dur', rand(4, 8).toFixed(1) + 's');
        style.setProperty('--seopt-fall-rot', rand(10, 60).toFixed(0) + 'deg');
        if (colors.length) style.setProperty('--seopt-fall-color', colors[i % colors.length]);

        var inner;
        if (shape === 'image') {
          inner = document.createElement('img');
          inner.src = image;
          inner.alt = '';
          inner.setAttribute('loading', 'lazy');
          inner.className = 'seopt-fall__inner seopt-fall__inner--image';
        } else if (shape === 'confetti') {
          inner = document.createElement('span');
          inner.className = 'seopt-fall__inner seopt-fall__inner--confetti';
        } else {
          inner = document.createElement('span');
          inner.className = 'seopt-fall__inner';
          inner.textContent = text;
        }
        item.appendChild(inner);
        frag.appendChild(item);
      }
      this.layer.appendChild(frag);

      var paused = false;
      try { paused = window.sessionStorage.getItem(STORAGE_KEY) === '1'; } catch (e) { paused = false; }
      this.setPaused(paused);

      if (this.toggle) {
        this.toggle.hidden = false;
        this.toggle.addEventListener('click', function () {
          this.setPaused(!this.paused);
          try { window.sessionStorage.setItem(STORAGE_KEY, this.paused ? '1' : '0'); } catch (e) { /* sin almacenamiento */ }
        }.bind(this));
      }

      var run = num(this, 'run', 0);
      if (run > 0) {
        this.timer = window.setTimeout(this.finish.bind(this), run * 1000);
      }
    }

    setPaused(value) {
      this.paused = value;
      this.layer.style.setProperty('--seopt-fall-state', value ? 'paused' : 'running');
      if (!this.toggle) return;
      var pauseIcon = this.toggle.querySelector('[data-seopt-pause-icon]');
      var playIcon = this.toggle.querySelector('[data-seopt-play-icon]');
      if (pauseIcon) pauseIcon.hidden = value;
      if (playIcon) playIcon.hidden = !value;
      this.toggle.setAttribute('aria-label', this.getAttribute(value ? 'data-play-label' : 'data-pause-label') || '');
    }

    finish() {
      this.layer.classList.add('seopt-fall__layer--off');
      if (this.toggle) this.toggle.hidden = true;
      window.setTimeout(function () {
        if (this.layer) this.layer.textContent = '';
      }.bind(this), 2200);
    }
  }

  customElements.define('seopt-fall', SeoptFall);
})();
