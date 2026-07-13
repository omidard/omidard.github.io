/* ── Margin rails ─────────────────────────────────────────────────────────────
   The scrollytelling stopped at the pipeline. From "01 — Work" down the page has
   two empty margins, so they carry the story on:

     left   bits stream in, pair off, and land on a double helix that keeps
            turning as you descend it
     right  a metabolic network that grows: the growth front tracks your scroll,
            so branches sprout ahead of you and the network widens the further
            down you go

   Both are a WINDOW onto a long virtual strip, not a fixed picture. The canvases
   are pinned to the viewport; the strip is anchored to the page, so scrolling
   moves you down it. That is the same scrub the hero uses, which is why it feels
   like the same animation continuing rather than a new one starting.

   Decorative, so: aria-hidden, pointer-events none, only where there is genuinely
   an empty margin to fill, a single static frame under prefers-reduced-motion,
   and nothing runs at all when the rails are off-screen or the tab is hidden.
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

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, u) { return a + (b - a) * u; };
  var easeOut = function (u) { return 1 - Math.pow(1 - u, 3); };

  /* deterministic, so the network is the same tree on every frame and every reload */
  function rng(seed) {
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
    C.dark = document.documentElement.getAttribute('data-theme') === 'dark';
  }
  readTheme();
  new MutationObserver(function () { readTheme(); dirty = true; })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* --------------------------------------------------------------- sizing */
  var W = 0, H = 0, live = false, dirty = true;
  var zTop = 0, zLen = 1;

  function measure() {
    var r = cL.getBoundingClientRect();
    W = Math.round(r.width);
    H = Math.round(r.height);
    live = W >= 92 && H > 0 && getComputedStyle(host).display !== 'none';
    if (!live) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    [[cL, xL], [cR, xR]].forEach(function (p) {
      p[0].width = Math.round(W * dpr);
      p[0].height = Math.round(H * dpr);
      p[1].setTransform(dpr, 0, 0, dpr, 0, 0);
    });

    // the strip runs from where Work begins to the bottom of the document
    zTop = work.getBoundingClientRect().top + window.scrollY;
    zLen = Math.max(1200, document.documentElement.scrollHeight - zTop);
    buildNet();
    dirty = true;
  }

  /* ══════════════════════ right rail: the growing network ══════════════════
     A tree in virtual space, generated once and deterministically. Its growth
     FRONT is the scroll position, a little below the middle of the viewport, so
     branches sprout just ahead of the reader and are complete by the time they
     reach the eye. Scroll back up and it retracts: it is scrubbed, like the hero,
     not played. */
  var NODES = [], EDGES = [];
  var BIGG = ['glc__D_e', 'g6p_c', 'f6p_c', 'fdp_c', 'g3p_c', 'pep_c', 'pyr_c',
              'accoa_c', 'cit_c', 'akg_c', 'succ_c', 'mal__L_c', 'oaa_c', 'atp_c',
              'nadh_c', 'co2_e', 'ac_e', 'etoh_e', 'lac__D_e', 'for_e'];

  function buildNet() {
    NODES = []; EDGES = [];
    var R = rng(20260713);
    var STEP = 58;                                   // virtual px per generation
    var total = zLen + H;
    var li = 0;

    function push(x, y, d, hub, label, lane) {
      var n = { x: clamp(x, 0.12, 0.88), y: y, d: d, i: NODES.length,
                hub: !!hub, label: label || null, lane: lane };
      NODES.push(n); return n;
    }
    function link(a, b, w, cross) {
      EDGES.push({ a: a.i, b: b.i, y0: a.y, y1: b.y, w: w, cross: !!cross });
    }

    var root = push(0.5, 0, 0, true, BIGG[li++], 0.5);
    var tips = [root];
    var y = 0, gen = 0;

    while (y < total) {
      y += STEP; gen++;
      var p = y / total;                              // how far down the page we are

      /* Trunks cap out, because the rail is only ~200px wide and six parallel trunks
         is already a thicket. The sense of an ever-expanding network comes from the
         TWIGS, which get commoner the further down, and from the cross-links. */
      var cap = clamp(2 + Math.round(3 * Math.min(1, p / 0.5)), 2, 5);
      var next = [];

      for (var k = 0; k < tips.length; k++) {
        var t0 = tips[k];

        /* Each trunk holds a LANE and wanders around it. An earlier version drifted
           by (x - 0.5), which is centrifugal: the trunks fled the centre, hit the
           clamp, and ran dead straight down the walls. Mean-reverting to a lane is
           what makes them read as branches rather than fence posts. */
        var wander = (t0.lane - t0.x) * 0.22 + (R() - 0.5) * 0.075;
        var a = push(t0.x + wander, y, t0.d + 1, R() < 0.10, null, t0.lane);
        link(t0, a, t0.d === 0 ? 2.0 : (t0.d < 4 ? 1.45 : 1.1));
        next.push(a);

        // and sometimes it forks, and the new trunk takes a lane of its own
        if (next.length < cap && R() < 0.5) {
          var side = (t0.lane <= 0.5 ? -1 : 1) * (R() < 0.25 ? -1 : 1);
          var lane2 = clamp(t0.lane + side * (0.17 + R() * 0.12), 0.16, 0.84);
          var b = push(t0.x + (lane2 - t0.x) * 0.55, y, t0.d + 1, R() < 0.22, null, lane2);
          link(t0, b, 1.3);
          next.push(b);
          t0.hub = true;                              // a fork is a branch point: show it
        }
      }

      /* Twigs: a short side-branch that runs out and stops. They are what makes it
         read as a metabolism rather than a river delta, and they thicken with depth. */
      var twigChance = 0.30 + 0.45 * p;
      for (var k2 = 0; k2 < next.length; k2++) {
        if (R() > twigChance) continue;
        var from = next[k2];
        var dir = R() < 0.5 ? -1 : 1;
        var prev = from;
        var len = 1 + ((R() * 3) | 0);
        for (var q = 0; q < len; q++) {
          var tw = push(prev.x + dir * (0.07 + R() * 0.06),
                        prev.y + STEP * (0.55 + R() * 0.5),
                        prev.d + 1, false,
                        (R() < 0.16 && li < BIGG.length * 3) ? BIGG[(li++) % BIGG.length] : null,
                        prev.lane);
          link(prev, tw, 0.85);
          prev = tw;
        }
      }

      // metabolism is a network, not a tree: close a loop between neighbours
      if (next.length > 1 && R() < 0.34) {
        var i1 = (R() * next.length) | 0;
        var i2 = (i1 + 1) % next.length;
        if (i1 !== i2) link(next[i1], next[i2], 0.8, true);
      }

      if (!next.length) next.push(push(0.5, y, 0, false, null, 0.5));   // never let it die out
      // anything past the cap simply stops growing, which is what a branch does
      tips = next.slice(0, cap);
    }
    // NOT sorted: edges address nodes by the index they were pushed with, and the
    // draw loop culls on y anyway. Sorting here would silently rewire every edge.
  }

  function drawNet(s, t, alpha) {
    var x = xR;
    x.clearRect(0, 0, W, H);
    if (alpha <= 0.004) return;

    var pad = Math.min(22, W * 0.14);
    var span = W - pad * 2;
    var front = s + H * 0.70;                 // growth happens just ahead of the reader
    var px = function (n) { return pad + n.x * span; };
    var py = function (vy) { return vy - s; };

    x.save();
    x.lineCap = 'round';

    /* Anything the front has finished with is a fixed picture, so it batches: three
       paths for the three edge weights, two for the nodes. Only the handful still
       growing at the front need a path of their own. That is ~25 canvas calls instead
       of one per edge. */
    var doneT = [], doneB = [], doneW = [], doneX = [];   // trunk / branch / twig / cross
    var live = [];
    var hubs = [], dots = [], grow = [];
    var pulses = [];

    for (var e = 0; e < EDGES.length; e++) {
      var E = EDGES[e];
      if (E.y1 < s - 60 || E.y0 > s + H + 60) continue;         // outside the window
      var g = clamp((front - E.y0) / Math.max(1, E.y1 - E.y0 || 40), 0, 1);
      if (g <= 0) continue;

      var A = NODES[E.a], B = NODES[E.b];
      var ax = px(A), ay = py(A.y), bx = px(B), by = py(B.y);

      if (g >= 0.999) {
        var bucket = E.cross ? doneX : (E.w >= 1.9 ? doneT : (E.w >= 1.25 ? doneB : doneW));
        bucket.push(ax, ay, bx, by);
        if (!E.cross && E.w > 1.2 && ((e * 7) % 5 === 0)) {      // flux, on a fifth of them
          var u = ((t * 0.16 + e * 0.13) % 1);
          pulses.push(lerp(ax, bx, u), lerp(ay, by, u), Math.sin(u * Math.PI));
        }
      } else {
        live.push(E, ax, ay, bx, by, g);
      }
    }

    // ---- everything already grown, in one path per weight
    [[doneT, 2.0, 0.62], [doneB, 1.4, 0.48], [doneW, 0.9, 0.34]].forEach(function (B0) {
      if (!B0[0].length) return;
      var arr = B0[0];
      x.beginPath();
      for (var j = 0; j < arr.length; j += 4) {
        x.moveTo(arr[j], arr[j + 1]);
        x.bezierCurveTo(arr[j], arr[j + 1] + (arr[j + 3] - arr[j + 1]) * 0.42,
                        (arr[j] + arr[j + 2]) / 2, arr[j + 3] - (arr[j + 3] - arr[j + 1]) * 0.18,
                        arr[j + 2], arr[j + 3]);
      }
      x.strokeStyle = C.primary;
      x.globalAlpha = alpha * B0[2];
      x.lineWidth = B0[1];
      x.stroke();
    });
    if (doneX.length) {                                        // the loops that close back
      x.beginPath();
      for (var j2 = 0; j2 < doneX.length; j2 += 4) {
        x.moveTo(doneX[j2], doneX[j2 + 1]);
        x.quadraticCurveTo((doneX[j2] + doneX[j2 + 2]) / 2, doneX[j2 + 1] - 16,
                           doneX[j2 + 2], doneX[j2 + 3]);
      }
      x.strokeStyle = C.accent;
      x.globalAlpha = alpha * 0.28;
      x.lineWidth = 0.9;
      x.stroke();
    }

    // ---- the few still extending at the front, each easing out of its parent
    for (var v = 0; v < live.length; v += 6) {
      var LE = live[v], lax = live[v + 1], lay = live[v + 2],
          lbx = live[v + 3], lby = live[v + 4], lg = live[v + 5];
      var eg = easeOut(lg);
      var tx = lerp(lax, lbx, eg), ty = lerp(lay, lby, eg);
      x.beginPath();
      x.moveTo(lax, lay);
      if (LE.cross) {
        x.quadraticCurveTo((lax + lbx) / 2, lay - 16, tx, ty);
        x.strokeStyle = C.accent; x.globalAlpha = alpha * 0.28 * lg; x.lineWidth = 0.9;
      } else {
        x.bezierCurveTo(lax, lay + (lby - lay) * 0.42, (lax + lbx) / 2,
                        ty - (ty - lay) * 0.18, tx, ty);
        x.strokeStyle = C.primary;
        x.globalAlpha = alpha * (LE.w > 1.5 ? 0.62 : 0.40) * (0.35 + 0.65 * lg);
        x.lineWidth = LE.w;
      }
      x.stroke();
    }

    // ---- flux pulses, one path
    if (pulses.length) {
      x.fillStyle = C.accent;
      for (var q = 0; q < pulses.length; q += 3) {
        x.globalAlpha = alpha * 0.7 * pulses[q + 2];
        x.beginPath(); x.arc(pulses[q], pulses[q + 1], 1.7, 0, 6.2832); x.fill();
      }
    }

    // ---- nodes: settled ones batch, the ones still swelling do not
    x.textAlign = 'left';
    x.textBaseline = 'middle';
    x.font = '500 9.5px "Roboto Mono", ui-monospace, monospace';
    var lbl = [];
    for (var i = 0; i < NODES.length; i++) {
      var n = NODES[i];
      if (n.y < s - 30 || n.y > s + H + 30) continue;
      var a = clamp((front - n.y) / 90, 0, 1);
      if (a <= 0) continue;
      var nx = px(n), ny = py(n.y);
      if (a >= 0.999) (n.hub ? hubs : dots).push(nx, ny);
      else grow.push(nx, ny, a, n.hub ? 1 : 0);
      if (n.label && W > 130 && a > 0.55) lbl.push(n.label, nx, ny, a);
    }

    if (hubs.length) {
      x.beginPath();                                            // haloes
      for (var h = 0; h < hubs.length; h += 2) { x.moveTo(hubs[h] + 6.8, hubs[h + 1]); x.arc(hubs[h], hubs[h + 1], 6.8, 0, 6.2832); }
      x.fillStyle = C.accent; x.globalAlpha = alpha * 0.13; x.fill();
      x.beginPath();
      for (var h2 = 0; h2 < hubs.length; h2 += 2) { x.moveTo(hubs[h2] + 3.4, hubs[h2 + 1]); x.arc(hubs[h2], hubs[h2 + 1], 3.4, 0, 6.2832); }
      x.fillStyle = C.accent; x.globalAlpha = alpha * 0.95; x.fill();
    }
    if (dots.length) {
      x.beginPath();
      for (var d2 = 0; d2 < dots.length; d2 += 2) { x.moveTo(dots[d2] + 2, dots[d2 + 1]); x.arc(dots[d2], dots[d2 + 1], 2, 0, 6.2832); }
      x.fillStyle = C.primary; x.globalAlpha = alpha * 0.66; x.fill();
    }
    for (var w = 0; w < grow.length; w += 4) {
      var isHub = grow[w + 3] === 1, ga = grow[w + 2];
      x.beginPath();
      x.arc(grow[w], grow[w + 1], (isHub ? 3.4 : 2.0) * easeOut(ga), 0, 6.2832);
      x.fillStyle = isHub ? C.accent : C.primary;
      x.globalAlpha = alpha * (isHub ? 0.95 : 0.66) * ga;
      x.fill();
    }

    // ---- labels, on whichever side they fit; never half off the edge
    x.fillStyle = C.mute;
    for (var m = 0; m < lbl.length; m += 4) {
      var tw = x.measureText(lbl[m]).width;
      var lx = lbl[m + 1] + 7, right = false;
      if (lx + tw > W - 3) { right = true; lx = lbl[m + 1] - 7; }
      if (right && lx - tw < 2) continue;
      x.textAlign = right ? 'right' : 'left';
      x.globalAlpha = alpha * 0.5 * (lbl[m + 3] - 0.55) / 0.45;
      x.fillText(lbl[m], lx, lbl[m + 2]);
    }
    x.textAlign = 'left';
    x.restore();
  }

  /* ══════════════════════ left rail: bits into a double helix ══════════════
     The helix is anchored to the page, so its phase is a function of virtual y:
     scrolling down it therefore turns it, without any twist term. What falls is
     information; what lands is a base. */
  /* A helix, not a stack of ellipses. Two things make the difference and both were
     missing: the pitch must be long enough that you see two or three turns down a
     viewport rather than eight (the hero uses 2.4 turns), and the strands must be
     painted in DEPTH ORDER, slice by slice — back strand, then the rung, then the
     front strand. Draw strand 0 and then strand 1 as whole polylines and strand 1
     always wins, so the two never cross over and under, and the eye reads loops. */
  var PITCH = 300;                    // virtual px per full turn
  var RUNG = PITCH / 10;              // base pairs per turn
  var SLICE = 4;                      // px per depth-sorted slice
  var PAIRS = [['A', 'T'], ['T', 'A'], ['G', 'C'], ['C', 'G']];

  var BITS = [];
  function seedBits() {
    var R = rng(4242);
    BITS = [];
    for (var i = 0; i < 22; i++) {
      BITS.push({
        u: R(),                     // where across the outer margin it starts
        y: R(),                     // phase down the rail
        v: 0.6 + R() * 0.9,         // fall speed
        c: R() < 0.5 ? '0' : '1',
        b: (R() * 4) | 0            // which base it becomes when it lands
      });
    }
  }
  seedBits();

  function drawDNA(s, t, alpha) {
    var x = xL;
    x.clearRect(0, 0, W, H);
    if (alpha <= 0.004) return;

    var axis = W * 0.66;                        // the helix hugs the content edge...
    var amp = Math.min(W * 0.22, 40);           // ...leaving the outer margin for the bits
    var strand = function (vy, k) {
      var ph = (vy / PITCH) * Math.PI * 2 + k * Math.PI;
      return { x: axis + amp * Math.sin(ph), d: Math.cos(ph) };
    };

    x.save();
    x.lineCap = 'round';
    x.textAlign = 'center';
    x.textBaseline = 'middle';

    /* ---- the helix, batched by depth band ----
       Stroking each 4px segment on its own cost 1,196 canvas calls a frame and ran at
       10fps. The same picture is ten paths, because a DEPTH BAND IS A PAINT ORDER: put
       every segment into the band its depth falls in, then stroke band 0 (furthest),
       the rungs, and bands 1..4 (nearest last). The strands still cross over and under
       each other, because at any height the two are at opposite depths and so land in
       opposite bands. */
    var NB = 5, bands = [];
    for (var i0 = 0; i0 < NB; i0++) bands.push([[], []]);      // [band][strand] = flat run list

    for (var yy = -SLICE; yy < H + SLICE; yy += SLICE) {
      var v0 = s + yy, v1 = v0 + SLICE;
      for (var k0 = 0; k0 < 2; k0++) {
        var pa = strand(v0, k0), pb = strand(v1, k0);
        var dm = (pa.d + pb.d) / 2;                            // -1 away .. +1 toward
        var bi = clamp(Math.floor(((dm + 1) / 2) * NB), 0, NB - 1);
        bands[bi][k0].push(pa.x, yy, pb.x, yy + SLICE);
      }
    }

    var strokeBand = function (bi) {
      var dep = (bi + 0.5) / NB;
      for (var k1 = 0; k1 < 2; k1++) {
        var run = bands[bi][k1];
        if (!run.length) continue;
        x.beginPath();
        for (var j = 0; j < run.length; j += 4) {
          x.moveTo(run[j], run[j + 1]);
          x.lineTo(run[j + 2], run[j + 3]);
        }
        x.strokeStyle = k1 === 0 ? C.primary : C.fg;
        x.globalAlpha = alpha * (0.16 + 0.62 * dep);
        x.lineWidth = 1.0 + 1.8 * dep;
        x.stroke();
      }
    };

    strokeBand(0); strokeBand(1);                              // behind the rungs

    // ---- rungs, batched into two paths (the accented one and the rest)
    var rp = [], ra = [], labels = [];
    var kFirst = Math.ceil((s - SLICE) / RUNG);
    var kLast = Math.floor((s + H + SLICE) / RUNG);
    for (var rk = kFirst; rk <= kLast; rk++) {
      var ry = rk * RUNG, rsy = ry - s;
      var r0 = strand(ry, 0), r1 = strand(ry, 1);
      (rk % 5 === 0 ? ra : rp).push(r0.x, rsy, r1.x, rsy);
      if (W > 130 && rk % 3 === 0) labels.push(rk, r0.x, r1.x, rsy, r0.d);
    }
    [[rp, C.primary, 0.20], [ra, C.accent, 0.26]].forEach(function (g0) {
      if (!g0[0].length) return;
      x.beginPath();
      for (var j = 0; j < g0[0].length; j += 4) {
        x.moveTo(g0[0][j], g0[0][j + 1]);
        x.lineTo(g0[0][j + 2], g0[0][j + 3]);
      }
      x.strokeStyle = g0[1];
      x.globalAlpha = alpha * g0[2];
      x.lineWidth = 1;
      x.stroke();
    });

    strokeBand(2); strokeBand(3); strokeBand(4);               // in front of the rungs

    // ---- the odd base pair, called by name
    if (labels.length) {
      x.font = '700 8.5px "Roboto Mono", ui-monospace, monospace';
      x.fillStyle = C.mute;
      for (var L = 0; L < labels.length; L += 5) {
        var pr = PAIRS[((labels[L] % 4) + 4) % 4], dd = labels[L + 4];
        x.globalAlpha = alpha * 0.34 * ((dd + 1) / 2);
        x.fillText(pr[0], labels[L + 1], labels[L + 3]);
        x.globalAlpha = alpha * 0.34 * ((-dd + 1) / 2);
        x.fillText(pr[1], labels[L + 2], labels[L + 3]);
      }
    }

    /* ---- bits: information falling in from the OUTER edge and landing as bases.
            They start in the empty margin between the screen edge and the helix. */
    x.font = '600 10px "Roboto Mono", ui-monospace, monospace';
    for (var i = 0; i < BITS.length; i++) {
      var B = BITS[i];
      var fy = ((B.y + (s * 0.0018 + t * 0.032) * B.v) % 1 + 1) % 1;
      var sy = fy * H;
      var e = easeOut(clamp(fy / 0.84, 0, 1));
      var target = strand(s + sy, i % 2).x;
      var start = (axis - amp) * (0.06 + B.u * 0.52);          // out toward the screen edge
      var bx = lerp(start, target, e);

      if (fy < 0.84) {
        x.fillStyle = C.mute;
        x.globalAlpha = alpha * 0.45 * Math.sin(clamp(fy / 0.84, 0, 1) * Math.PI);
        x.fillText(B.c, bx, sy);
      } else {                                                  // it has become a base
        var u = (fy - 0.84) / 0.16;
        x.font = '700 10px "Roboto Mono", ui-monospace, monospace';
        x.fillStyle = C.primary;
        x.globalAlpha = alpha * 0.9 * (1 - u);
        x.fillText(PAIRS[B.b][0], bx, sy);
        x.beginPath();                                          // the flash where it joins
        x.arc(bx, sy, 2 + 8 * u, 0, 6.2832);
        x.strokeStyle = C.accent;
        x.globalAlpha = alpha * 0.4 * (1 - u);
        x.lineWidth = 1;
        x.stroke();
        x.font = '600 10px "Roboto Mono", ui-monospace, monospace';
      }
    }
    x.restore();
  }

  /* ------------------------------------------------------------------ loop */
  var raf = 0, t0 = performance.now(), lastY = -1, vis = true;

  function frame(now) {
    raf = 0;
    if (!live || !vis) return;

    var y = window.scrollY || window.pageYOffset;
    var s = y - zTop + H;                                   // depth into the strip
    // fade in as Work arrives, and stay for the rest of the page
    var alpha = clamp((y - (zTop - H * 0.9)) / (H * 0.55), 0, 1);

    if (alpha <= 0.004) {
      if (lastY !== -2) { xL.clearRect(0, 0, W, H); xR.clearRect(0, 0, W, H); lastY = -2; }
      if (!reduced) raf = requestAnimationFrame(frame);
      return;
    }

    var t = (now - t0) / 1000;
    drawDNA(Math.max(0, s), t, alpha);
    drawNet(Math.max(0, s), t, alpha);
    lastY = y;
    dirty = false;

    if (!reduced) raf = requestAnimationFrame(frame);
  }

  function kick() { if (!raf && live && vis) raf = requestAnimationFrame(frame); }

  /* Only run while the rails can actually be seen. A canvas repainting behind a
     hidden tab, or 4000px above the reader, is heat and nothing else. */
  var io = new IntersectionObserver(function (es) {
    vis = es[0].isIntersecting;
    if (vis) kick(); else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }, { rootMargin: '200px' });
  io.observe(work);
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
