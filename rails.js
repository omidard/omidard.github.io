/* ── Margin rails: two vortices ───────────────────────────────────────────────
   The hero scrollytelling stops at the pipeline. From "01 — Work" down, the page
   has two empty margins, and they carry it on. Not as decoration — as the same
   story, still running.

   LEFT.  A tornado of information. Binary digits spiral in from the outer margin,
          descending and tightening around an axis. Partway down they MORPH: the
          glyph flickers and 0/1 resolves into A, G, T or C. The base keeps
          spiralling in, and when its radius reaches the backbone it LOCKS on with
          a flash and becomes part of the molecule. The helix itself spins, and its
          phase is a function of height, so scrolling screws you down through it.

   RIGHT. A metabolic network built in CYLINDRICAL space, not flat. Every node has
          a radius and an angle about a vertical axis, so the whole network rotates
          as a solid: branches swing toward you and away, growing and dimming with
          depth. It widens as it descends, and flux runs down every branch it has
          finished growing.

   Both are a WINDOW onto a long virtual strip: the canvas is pinned to the
   viewport, the strip is anchored to the page. Scrolling moves you down it and
   scrolling back retracts it — the same scrub the hero uses, which is why it reads
   as one animation continuing rather than a second one starting.

   PERFORMANCE. Every beginPath/stroke is a rasterisation, so nothing is drawn one
   segment at a time. Depth is quantised into bands and A BAND IS A PAINT ORDER:
   bin by depth, stroke each band as a single path, back to front. That gives real
   over-and-under for a couple of dozen canvas calls instead of two thousand.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var host = document.querySelector('.rails');
  var cL = document.getElementById('rail-dna');
  var cR = document.getElementById('rail-net');
  var work = document.getElementById('work');
  if (!host || !cL || !cR || !work || !cL.getContext) return;

  var xL = cL.getContext('2d');
  var xR = cR.getContext('2d');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var TAU = Math.PI * 2;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, u) { return a + (b - a) * u; };
  var easeOut = function (u) { return 1 - Math.pow(1 - u, 3); };
  var easeIn = function (u) { return u * u * u; };
  var frac = function (v) { return v - Math.floor(v); };

  function rng(seed) {                       // deterministic: the same tree every reload
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---------------------------------------------------------------- theme */
  var C = {};
  function readTheme() {
    var s = getComputedStyle(document.documentElement);
    var g = function (n) { return s.getPropertyValue(n).trim(); };
    C.fg = g('--fg');
    C.mute = g('--fg-mute');
    C.primary = g('--primary');
    C.accent = g('--accent');
  }
  readTheme();
  new MutationObserver(readTheme)
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* --------------------------------------------------------------- sizing */
  var W = 0, H = 0, live = false, zTop = 0, zLen = 1;

  function measure() {
    var r = cL.getBoundingClientRect();
    W = Math.round(r.width); H = Math.round(r.height);
    live = W >= 92 && H > 0 && getComputedStyle(host).display !== 'none';
    if (!live) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    [[cL, xL], [cR, xR]].forEach(function (p) {
      p[0].width = Math.round(W * dpr);
      p[0].height = Math.round(H * dpr);
      p[1].setTransform(dpr, 0, 0, dpr, 0, 0);
    });
    zTop = work.getBoundingClientRect().top + window.scrollY;
    zLen = Math.max(1200, document.documentElement.scrollHeight - zTop);
    buildNet();
  }

  /* ═══════════════════ LEFT: the information tornado ═══════════════════════ */
  var PITCH = 260;                 // virtual px per full turn of the helix
  var RUNG = PITCH / 10;
  var SLICE = 5;
  var SPIN = 0.42;                 // rad/s of idle spin, so it lives when you stop
  var BASES = ['A', 'T', 'G', 'C'];
  var PAIR = { A: 'T', T: 'A', G: 'C', C: 'G' };

  var MOTES = [];
  function seedMotes() {
    var R = rng(4242);
    MOTES = [];
    for (var i = 0; i < 54; i++) {
      MOTES.push({
        u0: R(),                                 // phase through its own life
        spd: 0.55 + R() * 0.75,                  // how fast it falls
        ang0: R() * TAU,                         // where on the funnel it enters
        turns: 1.1 + R() * 1.5,                  // how many times it goes round on the way down
        base: (R() * 4) | 0,
        bit: R() < 0.5 ? '0' : '1',
        wob: 0.6 + R() * 0.8
      });
    }
  }
  seedMotes();

  function drawDNA(s, t, alpha) {
    var x = xL;
    x.clearRect(0, 0, W, H);
    if (alpha <= 0.004) return;

    var axis = W * 0.62;
    var amp = Math.min(W * 0.20, 38);            // the backbone radius
    var rOut = Math.min(W * 0.55, axis - 6);     // where the funnel is widest
    var spin = t * SPIN;

    var strand = function (vy, k) {
      var ph = (vy / PITCH) * TAU + spin + k * Math.PI;
      return { x: axis + amp * Math.sin(ph), d: Math.cos(ph) };
    };

    x.save();
    x.lineCap = 'round';
    x.textAlign = 'center';
    x.textBaseline = 'middle';

    /* ---- the helix, batched by depth band (a band IS a paint order) ---- */
    var NB = 6, bands = [];
    for (var i0 = 0; i0 < NB; i0++) bands.push([[], []]);
    for (var yy = -SLICE; yy < H + SLICE; yy += SLICE) {
      var v0 = s + yy, v1 = v0 + SLICE;
      for (var k0 = 0; k0 < 2; k0++) {
        var pa = strand(v0, k0), pb = strand(v1, k0);
        var dm = (pa.d + pb.d) / 2;
        bands[clamp(((dm + 1) / 2 * NB) | 0, 0, NB - 1)][k0].push(pa.x, yy, pb.x, yy + SLICE);
      }
    }
    var strokeBand = function (bi) {
      var dep = (bi + 0.5) / NB;
      for (var k1 = 0; k1 < 2; k1++) {
        var run = bands[bi][k1];
        if (!run.length) continue;
        x.beginPath();
        for (var j = 0; j < run.length; j += 4) {
          x.moveTo(run[j], run[j + 1]); x.lineTo(run[j + 2], run[j + 3]);
        }
        x.strokeStyle = k1 === 0 ? C.primary : C.fg;
        x.globalAlpha = alpha * (0.14 + 0.66 * dep);
        x.lineWidth = 0.9 + 2.1 * dep;
        x.stroke();
      }
    };
    strokeBand(0); strokeBand(1); strokeBand(2);          // behind the rungs

    // ---- rungs: two paths, one per base-pair family
    var rAT = [], rGC = [], names = [];
    var kA = Math.ceil((s - SLICE) / RUNG), kB = Math.floor((s + H + SLICE) / RUNG);
    for (var rk = kA; rk <= kB; rk++) {
      var ry = rk * RUNG, rsy = ry - s;
      var r0 = strand(ry, 0), r1 = strand(ry, 1);
      var bi2 = ((rk % 4) + 4) % 4;
      (bi2 < 2 ? rAT : rGC).push(r0.x, rsy, r1.x, rsy);
      if (W > 130 && rk % 3 === 0) names.push(BASES[bi2], r0.x, r1.x, rsy, r0.d);
    }
    [[rAT, C.accent, 0.26], [rGC, C.primary, 0.24]].forEach(function (G) {
      if (!G[0].length) return;
      x.beginPath();
      for (var j = 0; j < G[0].length; j += 4) {
        x.moveTo(G[0][j], G[0][j + 1]); x.lineTo(G[0][j + 2], G[0][j + 3]);
      }
      x.strokeStyle = G[1]; x.globalAlpha = alpha * G[2]; x.lineWidth = 1.1; x.stroke();
    });

    strokeBand(3); strokeBand(4); strokeBand(5);          // in front of the rungs

    // ---- the base letters already on the molecule
    if (names.length) {
      x.font = '700 8.5px "Roboto Mono", ui-monospace, monospace';
      for (var L = 0; L < names.length; L += 5) {
        var b1 = names[L], dd = names[L + 4];
        x.fillStyle = (b1 === 'A' || b1 === 'T') ? C.accent : C.primary;
        x.globalAlpha = alpha * 0.42 * ((dd + 1) / 2);
        x.fillText(b1, names[L + 1], names[L + 3]);
        x.globalAlpha = alpha * 0.42 * ((-dd + 1) / 2);
        x.fillText(PAIR[b1], names[L + 2], names[L + 3]);
      }
    }

    /* ---- the tornado: bits spiralling in, morphing, and locking on ----
       u is a mote's whole life. It falls the height of the rail while its radius
       collapses from the outer margin onto the backbone and its angle winds round.
       At u≈0.5 the glyph resolves: 0/1 stops flickering and becomes a base. */
    /* A mote's PATH, not just its position. Without a trail the vortex only exists in
       the difference between two frames, and a still of it reads as scattered letters;
       with one, the spiral is there in a single glance. Batched into two paths. */
    var motePos = function (M, u) {
      var uu = clamp(u, 0, 1);
      var msy = uu * (H + 60) - 30;
      var mvy = s + msy;
      var mrad = amp + (rOut - amp) * Math.pow(1 - uu, 1.8);
      var msnap = easeOut(clamp((uu - 0.62) / 0.34, 0, 1));
      var mfree = M.ang0 + uu * M.turns * TAU + spin * M.wob;
      var mlock = (mvy / PITCH) * TAU + spin + (M.base & 1) * Math.PI;
      var mang = lerp(mfree, mlock + Math.round((mfree - mlock) / TAU) * TAU, msnap);
      return { x: axis + mrad * Math.sin(mang), y: msy, d: (Math.cos(mang) + 1) / 2 };
    };

    var trailNear = [], trailFar = [];
    for (var tm = 0; tm < MOTES.length; tm++) {
      var TM = MOTES[tm];
      var tu = frac(TM.u0 + (s * 0.0012 + t * 0.055) * TM.spd);
      if (tu < 0.05) continue;
      var pp = motePos(TM, tu);
      var into = pp.d > 0.5 ? trailNear : trailFar;
      var prev = pp;
      for (var st = 1; st <= 5; st++) {
        var q = motePos(TM, tu - st * 0.016);
        into.push(prev.x, prev.y, q.x, q.y);
        prev = q;
      }
    }
    [[trailFar, 0.10, 0.7], [trailNear, 0.22, 1.1]].forEach(function (T) {
      if (!T[0].length) return;
      x.beginPath();
      for (var j = 0; j < T[0].length; j += 4) {
        x.moveTo(T[0][j], T[0][j + 1]); x.lineTo(T[0][j + 2], T[0][j + 3]);
      }
      x.strokeStyle = C.primary;
      x.globalAlpha = alpha * T[1];
      x.lineWidth = T[2];
      x.stroke();
    });

    for (var m = 0; m < MOTES.length; m++) {
      var M = MOTES[m];
      var u = frac(M.u0 + (s * 0.0012 + t * 0.055) * M.spd);
      var sy = u * (H + 60) - 30;
      var vy = s + sy;

      /* The funnel. An earlier version eased IN (cubic), so the radius barely moved
         until the last few percent of life: the letters drifted around out wide and
         faded before they ever reached the molecule. This collapses hard and early,
         then hugs the backbone for the last third — which is what a tornado does. */
      var rad = amp + (rOut - amp) * Math.pow(1 - u, 1.8);

      /* And it LANDS. Past u=0.62 the mote's own angle is blended into the phase of
         the strand it is heading for, so it does not merely pass near the backbone,
         it arrives on it, at the right depth, turning with it. */
      var snap = easeOut(clamp((u - 0.62) / 0.34, 0, 1));
      var free = M.ang0 + u * M.turns * TAU + spin * M.wob;
      var lock = (vy / PITCH) * TAU + spin + (M.base & 1) * Math.PI;
      var ang = lerp(free, lock + Math.round((free - lock) / TAU) * TAU, snap);

      var mx = axis + rad * Math.sin(ang);
      var dep = (Math.cos(ang) + 1) / 2;                  // 0 behind .. 1 toward you

      var morph = clamp((u - 0.26) / 0.16, 0, 1);         // 0/1 ....... A G T C
      var landed = clamp((u - 0.95) / 0.05, 0, 1);        // and now it is the molecule
      var glyph, col;

      if (morph < 1) {
        // mid-morph the glyph flickers between the digit and the base it is becoming
        var flick = morph > 0 && frac(t * 11 + m * 0.37) < morph;
        glyph = flick ? BASES[M.base] : M.bit;
        col = flick ? ((M.base < 2) ? C.accent : C.primary) : C.mute;
      } else {
        glyph = BASES[M.base];
        col = (M.base < 2) ? C.accent : C.primary;
      }

      var pop = 1 + 0.9 * morph * (1 - morph) * 4;        // it swells as it resolves
      var size = (8 + 4.2 * dep) * pop;
      x.font = (morph < 1 ? '600 ' : '700 ') + size.toFixed(1) + 'px "Roboto Mono", ui-monospace, monospace';
      x.fillStyle = col;
      x.globalAlpha = alpha * (0.20 + 0.68 * dep) * (1 - landed) *
                      Math.min(1, u / 0.05) * (0.45 + 0.55 * morph);
      x.fillText(glyph, mx, sy);

      if (landed > 0) {                                   // the flash as it joins
        x.beginPath();
        x.arc(mx, sy, 2 + 13 * landed, 0, TAU);
        x.strokeStyle = col;
        x.globalAlpha = alpha * 0.7 * (1 - landed);
        x.lineWidth = 1.4;
        x.stroke();
      }
    }
    x.restore();
  }

  /* ═══════════════════ RIGHT: the metabolic tornado ════════════════════════
     Cylindrical, not flat. Every node holds a radius and an angle about a vertical
     axis, so the whole network turns as one solid body: branches swing toward the
     reader and away again, brightening and dimming with depth. It widens as it
     falls, and flux runs down every branch the growth front has finished. */
  var NODES = [], EDGES = [];
  var NSPIN = 0.20;                 // rad/s
  var NTWIST = 0.0032;              // rad per virtual px: the network itself is a helix
  var BIGG = ['glc__D_e', 'g6p_c', 'f6p_c', 'fdp_c', 'g3p_c', 'pep_c', 'pyr_c',
              'accoa_c', 'cit_c', 'akg_c', 'succ_c', 'mal__L_c', 'oaa_c', 'atp_c',
              'nadh_c', 'co2_e', 'ac_e', 'etoh_e', 'lac__D_e', 'for_e'];

  function buildNet() {
    NODES = []; EDGES = [];
    var R = rng(20260713);
    var STEP = 56;
    var total = zLen + H;
    var li = 0;

    function push(rad, ang, y, d, hub, label) {
      var n = { rad: clamp(rad, 0, 1), ang: ang, y: y, d: d, i: NODES.length,
                hub: !!hub, label: label || null };
      NODES.push(n); return n;
    }
    function link(a, b, w, cross) {
      EDGES.push({ a: a.i, b: b.i, y0: a.y, y1: b.y, w: w, cross: !!cross,
                   flux: cross ? 0 : (w >= 1.9 ? 2 : 1) });
    }

    var root = push(0.05, R() * 6.283, 0, 0, true, BIGG[li++]);
    var tips = [root];
    var y = 0;

    while (y < total) {
      y += STEP;
      var p = y / total;
      var cap = clamp(2 + Math.round(4 * Math.min(1, p / 0.5)), 2, 6);
      var next = [];

      for (var k = 0; k < tips.length; k++) {
        var T = tips[k];
        // a tip carries on, easing outward: the funnel opens as it descends
        var a = push(T.rad + (0.35 - T.rad) * 0.10 + (R() - 0.5) * 0.05,
                     T.ang + (R() - 0.5) * 0.22,
                     y, T.d + 1, R() < 0.09, null);
        link(T, a, T.d === 0 ? 2.1 : (T.d < 4 ? 1.5 : 1.1));
        next.push(a);

        // and sometimes it forks, throwing a branch out and RIGHT ROUND. A small
        // angular offset leaves every branch in the same sector and the cylinder
        // reads as a flat ribbon crammed against one wall; it has to be a big one.
        if (next.length < cap && R() < 0.5) {
          var b = push(T.rad + 0.18 + R() * 0.18,
                       T.ang + (R() < 0.5 ? -1 : 1) * (1.2 + R() * 1.7),
                       y, T.d + 1, R() < 0.22, null);
          link(T, b, 1.35);
          next.push(b);
          T.hub = true;                                   // a fork is a branch point
        }
      }

      // twigs: short side branches that run out and stop. They thicken with depth,
      // and they are what makes it read as a metabolism rather than a river delta.
      var twig = 0.34 + 0.42 * p;
      for (var k2 = 0; k2 < next.length; k2++) {
        if (R() > twig) continue;
        var prev = next[k2];
        var dir = R() < 0.5 ? -1 : 1;
        var len = 1 + ((R() * 3) | 0);
        for (var q = 0; q < len; q++) {
          var tw = push(prev.rad + 0.07 + R() * 0.08,
                        prev.ang + dir * (0.32 + R() * 0.3),
                        prev.y + STEP * (0.5 + R() * 0.55),
                        prev.d + 1, false,
                        (R() < 0.15) ? BIGG[(li++) % BIGG.length] : null);
          link(prev, tw, 0.85);
          prev = tw;
        }
      }

      if (next.length > 1 && R() < 0.34) {                // a loop closing back
        var i1 = (R() * next.length) | 0;
        link(next[i1], next[(i1 + 1) % next.length], 0.8, true);
      }
      if (!next.length) next.push(push(0.1, 0, y, 0, false, null));
      tips = next.slice(0, cap);
    }
  }

  function drawNet(s, t, alpha) {
    var x = xR;
    x.clearRect(0, 0, W, H);
    if (alpha <= 0.004) return;

    var cx = W * 0.5;
    var rx = W * 0.5 - 16;                        // how far out the widest branch reaches
    var front = s + H * 0.72;                     // growth happens just ahead of the reader
    var spin = t * NSPIN;

    // project a node into the rotating cylinder
    var PX = [], PY = [], PD = [], PA = [];
    var lo = s - 70, hi = s + H + 70;
    for (var i = 0; i < NODES.length; i++) {
      var n = NODES[i];
      if (n.y < lo || n.y > hi) { PA[i] = -1; continue; }
      var th = n.ang + spin + n.y * NTWIST;
      PX[i] = cx + n.rad * rx * Math.sin(th);
      PY[i] = n.y - s;
      PD[i] = (Math.cos(th) + 1) / 2;             // 0 = far side, 1 = near side
      PA[i] = clamp((front - n.y) / 95, 0, 1);    // how grown it is
    }

    x.save();
    x.lineCap = 'round';

    /* ---- edges, binned by depth. A band is a paint order, so the far side of the
            cylinder is drawn first and the near side last, and the network reads as
            a solid turning body rather than a flat tangle. */
    var EB = 5, eb = [];
    for (var q0 = 0; q0 < EB; q0++) eb.push({ line: [], cross: [], live: [] });
    var flux = [];
    for (var q1 = 0; q1 < EB; q1++) flux.push([]);

    for (var e = 0; e < EDGES.length; e++) {
      var E = EDGES[e];
      if (E.y1 < lo || E.y0 > hi) continue;
      var A = E.a, B = E.b;
      if (PA[A] === undefined || PA[A] < 0 || PA[B] === undefined || PA[B] < 0) continue;
      var g = clamp((front - E.y0) / Math.max(1, E.y1 - E.y0 || 40), 0, 1);
      if (g <= 0) continue;

      var ax = PX[A], ay = PY[A], bx = PX[B], by = PY[B];
      var dep = (PD[A] + PD[B]) / 2;
      var bi = clamp((dep * EB) | 0, 0, EB - 1);

      if (g >= 0.999) {
        (E.cross ? eb[bi].cross : eb[bi].line).push(ax, ay, bx, by, E.w);
        // ---- flux: every finished branch carries it, as streaks running downstream
        for (var f = 0; f < E.flux; f++) {
          var u = frac(t * (0.34 + 0.05 * E.w) + e * 0.37 + f / E.flux);
          var u2 = Math.max(0, u - 0.26);            // a longer, thinner streak reads as flow
          flux[bi].push(lerp(ax, bx, u2), lerp(ay, by, u2), lerp(ax, bx, u), lerp(ay, by, u));
        }
      } else {
        eb[bi].live.push(ax, ay, bx, by, E.w, g, E.cross ? 1 : 0);
      }
    }

    // nodes, binned the same way
    var nb = [];
    for (var q2 = 0; q2 < EB; q2++) nb.push({ hub: [], dot: [], grow: [] });
    var lbl = [];
    for (var i2 = 0; i2 < NODES.length; i2++) {
      if (PA[i2] === undefined || PA[i2] < 0) continue;
      var a2 = PA[i2];
      if (a2 <= 0) continue;
      var N2 = NODES[i2], bi2 = clamp((PD[i2] * EB) | 0, 0, EB - 1);
      if (a2 >= 0.999) (N2.hub ? nb[bi2].hub : nb[bi2].dot).push(PX[i2], PY[i2], PD[i2]);
      else nb[bi2].grow.push(PX[i2], PY[i2], PD[i2], a2, N2.hub ? 1 : 0);
      if (N2.label && W > 130 && a2 > 0.6 && PD[i2] > 0.62) lbl.push(N2.label, PX[i2], PY[i2], PD[i2]);
    }

    // ---- paint back to front
    var curve = function (ax, ay, bx, by) {
      x.moveTo(ax, ay);
      x.bezierCurveTo(ax, ay + (by - ay) * 0.45, (ax + bx) / 2, by - (by - ay) * 0.2, bx, by);
    };

    for (var b = 0; b < EB; b++) {
      var dep2 = (b + 0.5) / EB;
      var vis = 0.18 + 0.82 * dep2;               // the far side of the cylinder recedes

      // three weights, one path each
      var byW = [[], [], []];
      var L0 = eb[b].line;
      for (var j = 0; j < L0.length; j += 5) {
        byW[L0[j + 4] >= 1.9 ? 0 : (L0[j + 4] >= 1.25 ? 1 : 2)].push(L0[j], L0[j + 1], L0[j + 2], L0[j + 3]);
      }
      [[0, 2.1, 0.72], [1, 1.45, 0.56], [2, 0.9, 0.40]].forEach(function (Wt) {
        var arr = byW[Wt[0]];
        if (!arr.length) return;
        x.beginPath();
        for (var j2 = 0; j2 < arr.length; j2 += 4) curve(arr[j2], arr[j2 + 1], arr[j2 + 2], arr[j2 + 3]);
        x.strokeStyle = C.primary;
        x.globalAlpha = alpha * Wt[2] * vis;
        x.lineWidth = Wt[1] * (0.55 + 0.45 * dep2);
        x.stroke();
      });

      if (eb[b].cross.length) {                   // loops closing back on the network
        var X0 = eb[b].cross;
        x.beginPath();
        for (var j3 = 0; j3 < X0.length; j3 += 5) {
          x.moveTo(X0[j3], X0[j3 + 1]);
          x.quadraticCurveTo((X0[j3] + X0[j3 + 2]) / 2, X0[j3 + 1] - 16, X0[j3 + 2], X0[j3 + 3]);
        }
        x.strokeStyle = C.accent; x.globalAlpha = alpha * 0.26 * vis; x.lineWidth = 0.9; x.stroke();
      }

      // the few still extending at the growth front
      var V0 = eb[b].live;
      for (var j4 = 0; j4 < V0.length; j4 += 7) {
        var g2 = V0[j4 + 5], eg = easeOut(g2);
        var tx = lerp(V0[j4], V0[j4 + 2], eg), ty = lerp(V0[j4 + 1], V0[j4 + 3], eg);
        x.beginPath();
        if (V0[j4 + 6]) {
          x.moveTo(V0[j4], V0[j4 + 1]);
          x.quadraticCurveTo((V0[j4] + tx) / 2, V0[j4 + 1] - 16, tx, ty);
          x.strokeStyle = C.accent; x.globalAlpha = alpha * 0.26 * g2 * vis; x.lineWidth = 0.9;
        } else {
          curve(V0[j4], V0[j4 + 1], tx, ty);
          x.strokeStyle = C.primary;
          x.globalAlpha = alpha * (V0[j4 + 4] > 1.5 ? 0.6 : 0.4) * (0.3 + 0.7 * g2) * vis;
          x.lineWidth = V0[j4 + 4] * (0.55 + 0.45 * dep2);
        }
        x.stroke();
      }

      // ---- FLUX. One path per depth band: streaks running downstream.
      if (flux[b].length) {
        var F0 = flux[b];
        x.beginPath();
        for (var j5 = 0; j5 < F0.length; j5 += 4) {
          x.moveTo(F0[j5], F0[j5 + 1]); x.lineTo(F0[j5 + 2], F0[j5 + 3]);
        }
        x.strokeStyle = C.accent;
        x.globalAlpha = alpha * (0.20 + 0.48 * dep2);
        x.lineWidth = 0.8 + 1.0 * dep2;
        x.stroke();
        // a bright head on the leading edge of each streak
        x.beginPath();
        for (var j6 = 0; j6 < F0.length; j6 += 4) {
          x.moveTo(F0[j6 + 2] + 1.1, F0[j6 + 3]);
          x.arc(F0[j6 + 2], F0[j6 + 3], 0.9 + 0.7 * dep2, 0, TAU);
        }
        x.fillStyle = C.accent;
        x.globalAlpha = alpha * (0.30 + 0.55 * dep2);
        x.fill();
      }

      // ---- nodes in this band
      var Nb = nb[b];
      if (Nb.hub.length) {
        x.beginPath();
        for (var h = 0; h < Nb.hub.length; h += 3) {
          x.moveTo(Nb.hub[h] + 5.5, Nb.hub[h + 1]); x.arc(Nb.hub[h], Nb.hub[h + 1], 5.5, 0, TAU);
        }
        x.fillStyle = C.accent; x.globalAlpha = alpha * 0.10 * vis; x.fill();
        x.beginPath();
        for (var h2 = 0; h2 < Nb.hub.length; h2 += 3) {
          var rr = 1.8 + 1.6 * Nb.hub[h2 + 2];
          x.moveTo(Nb.hub[h2] + rr, Nb.hub[h2 + 1]); x.arc(Nb.hub[h2], Nb.hub[h2 + 1], rr, 0, TAU);
        }
        x.fillStyle = C.accent; x.globalAlpha = alpha * 0.95 * vis; x.fill();
      }
      if (Nb.dot.length) {
        x.beginPath();
        for (var d3 = 0; d3 < Nb.dot.length; d3 += 3) {
          var r3 = 1.2 + 1.5 * Nb.dot[d3 + 2];
          x.moveTo(Nb.dot[d3] + r3, Nb.dot[d3 + 1]); x.arc(Nb.dot[d3], Nb.dot[d3 + 1], r3, 0, TAU);
        }
        x.fillStyle = C.primary; x.globalAlpha = alpha * 0.7 * vis; x.fill();
      }
      for (var w2 = 0; w2 < Nb.grow.length; w2 += 5) {
        var isH = Nb.grow[w2 + 4] === 1, ga = Nb.grow[w2 + 3], gd = Nb.grow[w2 + 2];
        x.beginPath();
        x.arc(Nb.grow[w2], Nb.grow[w2 + 1], (isH ? 1.8 + 1.6 * gd : 1.2 + 1.5 * gd) * easeOut(ga), 0, TAU);
        x.fillStyle = isH ? C.accent : C.primary;
        x.globalAlpha = alpha * (isH ? 0.95 : 0.7) * ga * vis;
        x.fill();
      }
    }

    // ---- labels, only on the near face, and never half off the edge
    x.textBaseline = 'middle';
    x.font = '500 9.5px "Roboto Mono", ui-monospace, monospace';
    x.fillStyle = C.mute;
    for (var m2 = 0; m2 < lbl.length; m2 += 4) {
      var tw = x.measureText(lbl[m2]).width;
      var lx = lbl[m2 + 1] + 8, right = false;
      if (lx + tw > W - 3) { right = true; lx = lbl[m2 + 1] - 8; }
      if (right && lx - tw < 2) continue;
      x.textAlign = right ? 'right' : 'left';
      x.globalAlpha = alpha * 0.55 * (lbl[m2 + 3] - 0.62) / 0.38;
      x.fillText(lbl[m2], lx, lbl[m2 + 2]);
    }
    x.textAlign = 'left';
    x.restore();
  }

  /* ------------------------------------------------------------------ loop */
  var raf = 0, t0 = performance.now(), vis = true, cleared = false;

  function frame(now) {
    raf = 0;
    if (!live || !vis) return;
    var y = window.scrollY || window.pageYOffset;
    var s = y - zTop + H;
    var alpha = clamp((y - (zTop - H * 0.9)) / (H * 0.55), 0, 1);

    if (alpha <= 0.004) {
      if (!cleared) { xL.clearRect(0, 0, W, H); xR.clearRect(0, 0, W, H); cleared = true; }
      if (!reduced) raf = requestAnimationFrame(frame);
      return;
    }
    cleared = false;
    var t = (now - t0) / 1000;
    drawDNA(Math.max(0, s), t, alpha);
    drawNet(Math.max(0, s), t, alpha);
    if (!reduced) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && live && vis) raf = requestAnimationFrame(frame); }

  /* A canvas repainting behind a hidden tab, or 4000px above the reader, is heat. */
  new IntersectionObserver(function (es) {
    vis = es[0].isIntersecting;
    if (vis) kick(); else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }, { rootMargin: '200px' }).observe(work);

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; } } else kick();
  });

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { measure(); kick(); }, 140);
  }, { passive: true });
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('load', function () { measure(); kick(); });

  measure();
  kick();
})();
