/* Omid Ardalani — site behavior.
   Motion respects prefers-reduced-motion everywhere: if the user asks for less
   motion, every animation below degrades to its final state immediately. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE = function (t) { return 1 - Math.pow(1 - t, 4); }; // expo-ish out

  /* ---------------------------------------------------------------- theme */
  var root = document.documentElement;
  var toggle = document.getElementById('theme-toggle');

  function applyTheme(mode) {
    root.setAttribute('data-theme', mode);
    var toLight = mode === 'dark';
    toggle.setAttribute('aria-label', 'Switch to ' + (toLight ? 'light' : 'dark') + ' theme');
    toggle.setAttribute('aria-pressed', String(mode === 'light'));
  }

  // Dark is the designed default (the design system calls for dark-primary), so a
  // first-time visitor always gets the intended look. A visitor's explicit choice
  // is remembered and always wins.
  var stored = null;
  try { stored = localStorage.getItem('theme'); } catch (e) { /* private mode */ }
  applyTheme(stored === 'light' || stored === 'dark' ? stored : 'dark');

  toggle.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem('theme', next); } catch (e) { /* ignore */ }
  });

  /* --------------------------------------------------------------- reveal */
  var revealables = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));

  revealables.forEach(function (el) {
    var d = el.getAttribute('data-reveal-delay');
    if (d) el.style.setProperty('--reveal-delay', d + 'ms');
  });

  var pending = [];

  if (reduced || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    pending = revealables.slice();

    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    revealables.forEach(function (el) { revealObserver.observe(el); });
  }

  /* Safety net. An IntersectionObserver only fires for elements that are actually
     intersecting when it samples, so a jump (anchor link, restored scroll position,
     find-in-page) can vault clean over a band of content and leave it stuck at
     opacity 0 -- invisible, permanently. Content must never depend on an animation
     succeeding, so sweep anything already scrolled into range and force it visible. */
  function sweepReveal() {
    if (!pending.length) return;
    var limit = window.innerHeight * 0.95;
    pending = pending.filter(function (el) {
      if (el.getBoundingClientRect().top > limit) return true;
      el.classList.add('is-in');
      return false;
    });
  }

  /* ------------------------------------------------------------- counters */
  var counters = Array.prototype.slice.call(document.querySelectorAll('[data-count]'));

  function renderCount(el, value) {
    var suffix = el.getAttribute('data-suffix') || '';
    el.textContent = value.toLocaleString('en-US') + suffix;
  }

  function runCount(el) {
    var target = parseInt(el.getAttribute('data-count'), 10);
    if (reduced) { renderCount(el, target); return; }

    var duration = 1500;
    var start = null;

    function step(ts) {
      if (start === null) start = ts;
      var p = Math.min((ts - start) / duration, 1);
      renderCount(el, Math.round(target * EASE(p)));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  if (!('IntersectionObserver' in window)) {
    counters.forEach(function (el) { renderCount(el, parseInt(el.getAttribute('data-count'), 10)); });
  } else {
    var countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        runCount(entry.target);
        countObserver.unobserve(entry.target);
      });
    }, { threshold: 0.6 });

    counters.forEach(function (el) { countObserver.observe(el); });
  }

  /* -------------------------------------------------------------- filters */
  var chips = Array.prototype.slice.call(document.querySelectorAll('.chip'));
  var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      var filter = chip.getAttribute('data-filter');

      chips.forEach(function (c) {
        var on = c === chip;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-selected', String(on));
      });

      cards.forEach(function (card, i) {
        var show = filter === 'all' || card.getAttribute('data-cat') === filter;
        card.classList.toggle('is-hidden', !show);

        if (show && !reduced) {
          // re-run the entrance so filtering feels like content arriving
          card.classList.remove('is-in');
          card.style.setProperty('--reveal-delay', Math.min(i * 40, 240) + 'ms');
          // force reflow so the class removal takes effect before re-adding
          void card.offsetWidth;
          card.classList.add('is-in');
        } else if (show) {
          card.classList.add('is-in');
        }
      });
    });
  });

  /* ------------------------------------------------------ nav: stuck state */
  var nav = document.getElementById('nav');
  var ticking = false;

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      nav.classList.toggle('is-stuck', window.scrollY > 8);
      sweepReveal();
      ticking = false;
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  window.addEventListener('load', onScroll);
  onScroll();

  /* ----------------------------------------------------------- scroll spy */
  var sections = ['work', 'papers', 'about', 'experience', 'contact']
    .map(function (id) { return document.getElementById(id); })
    .filter(Boolean);
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav-links a'));

  if ('IntersectionObserver' in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        navLinks.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });

    sections.forEach(function (s) { spy.observe(s); });
  }

  /* ------------------------------------------------------------------ misc */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
