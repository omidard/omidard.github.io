/* ── Margin rails ─────────────────────────────────────────────────────────────
   The hero scrollytelling stops at the pipeline. From "01 — Work" down, the page
   has two empty margins and 256px of clear space between every section, and all of
   it carries the story on.

   LEFT — THE DNA IS BUILT AS YOU SCROLL. It does not exist ahead of you. There is a
   construction FRONT tied to the scroll: above it, finished double helix; below it,
   a field of raw binary that has not been read yet. At the front, the vortex: digits
   spiral in, their radius collapsing, and MORPH — the glyph flickers and 0/1 resolves
   into A, G, T or C — and the base locks onto the growing tip. Scroll down and the
   front advances, eats the raw information, and extrudes more molecule behind you.
   Each mote is anchored to a fixed point on the PAGE, so it is the front sweeping
   over them that converts them. That is what makes scrolling build it.

   RIGHT — A METABOLISM, NOT A TANGLE. Random branching is noise. This is built from
   the motifs a metabolism actually has: a spine running down the axis, and hanging
   off it, cycles (a closed ring of eight, with flux circulating round it), chains out
   to an exchange metabolite, symmetric pairs, and bypasses that split and rejoin. The
   whole thing lives in CYLINDRICAL space and turns as one solid body, so the rings
   swing edge-on and face-on as they pass.

   MIDDLE — AT EVERY SECTION BOUNDARY THEY MEET. As the gap between two sections
   crosses the middle of the screen, bases stream in from the left and metabolites and
   flux from the right, converge on a point, and fuse: a turning core, a shockwave.
   Then they separate and go back to their margins for the next section. Which is the
   whole argument of the site — genome and metabolism are the same story — said once
   per chapter, without a word.

   PERFORMANCE. Every beginPath/stroke is a rasterisation, so nothing is drawn one
   segment at a time. Depth is quantised into bands and A BAND IS A PAINT ORDER: bin
   by depth, stroke each band as a single path, back to front.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var host = document.querySelector('.rails');
  var cv = document.getElementById('rails-canvas');
  var work = document.getElementById('work');
  if (!host || !cv || !work || !cv.getContext) return;

  var g = cv.getContext('2d');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var TAU = Math.PI * 2;
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, u) { return a + (b - a) * u; };
  var easeOut = function (u) { return 1 - Math.pow(1 - u, 3); };
  var frac = function (v) { return v - Math.floor(v); };
  var smooth = function (u) { u = clamp(u, 0, 1); return u * u * (3 - 2 * u); };

  function rng(seed) {                     // deterministic: the same molecule every reload
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
    C.fg = s.getPropertyValue('--fg').trim();
    C.mute = s.getPropertyValue('--fg-mute').trim();
    C.primary = s.getPropertyValue('--primary').trim();
    C.accent = s.getPropertyValue('--accent').trim();
  }
  readTheme();
  new MutationObserver(readTheme)
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* --------------------------------------------------------------- sizing */
  var W = 0, H = 0, RW = 0, live = false, zTop = 0, zLen = 1;
  var TOTAL = 0;                            // how far down the virtual strip has been built
  var BOUNDS = [];                          // document y of each section boundary

  function measure() {
    var r = host.getBoundingClientRect();
    W = Math.round(r.width); H = Math.round(r.height);
    live = H > 0 && getComputedStyle(host).display !== 'none';
    if (!live) return;

    var wrap = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--wrap'), 10) || 1140;
    RW = clamp((W - wrap) / 2, 0, 268);
    if (RW < 92) { live = false; return; }

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    zTop = work.getBoundingClientRect().top + window.scrollY;
    zLen = Math.max(1200, document.documentElement.scrollHeight - zTop);

    // the boundaries are the gaps BETWEEN sections: 128px of padding either side of each
    BOUNDS = [];
    var secs = document.querySelectorAll('main .section');
    for (var i = 1; i < secs.length; i++) {
      BOUNDS.push(secs[i].getBoundingClientRect().top + window.scrollY);
    }

    /* The page GROWS after load: the figures are lazy, so scrollHeight at load time is
       short and the strip built from it runs out before the real bottom. Only ever grow
       it, and never rebuild what is already there — the generators are seeded, so a
       longer run emits the identical prefix and simply appends. No pop. */
    var want = zLen + H * 1.4;
    if (want > TOTAL + 40) { TOTAL = want; buildMotes(); buildNet(); }
  }

  /* ═════════════════════ LEFT: the DNA is built as you scroll ══════════════ */
  var PITCH = 250;                 // virtual px per turn
  var RUNG = PITCH / 10;
  var SLICE = 5;
  var SPIN = 0.40;                 // rad/s of idle spin, so it lives when you stop
  var ASSEMBLE = 300;              // how far ahead of the front a mote starts being drawn in
  var BASES = ['A', 'T', 'G', 'C'];
  var PAIR = { A: 'T', T: 'A', G: 'C', C: 'G' };

  var MOTES = [];
  function buildMotes() {
    var R = rng(4242);
    MOTES = [];
    var total = TOTAL;
    // A FIELD of raw information anchored to the page. The front sweeps over it.
    for (var vy = -200; vy < total; vy += 16) {
      MOTES.push({
        vy: vy + (R() - 0.5) * 26,
        ang0: R() * TAU,
        rad0: R(),                                    // spread across the margin, not on one circle
        turns: 0.9 + R() * 1.6,
        base: (R() * 4) | 0,
        bit: R() < 0.5 ? '0' : '1',
        drift: 0.5 + R(),
        wob: R() * TAU
      });
    }
  }

  function drawDNA(ox, s, t, alpha, mrg, bsy) {
    var axis = ox + RW * 0.60;
    var amp = Math.min(RW * 0.20, 38);
    var rOut = Math.min(RW * 0.38, ox + RW - 6 - axis);   // never past the rail's inner edge
    var spin = t * SPIN;
    var front = s + H * 0.60;                   // the growing tip
    var tipY = front - s;                       // ...on screen

    var strand = function (vy, k) {
      var ph = (vy / PITCH) * TAU + spin + k * Math.PI;
      return { x: axis + amp * Math.sin(ph), d: Math.cos(ph) };
    };

    g.save();
    g.lineCap = 'round';
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    /* ---- the finished molecule: only ABOVE the front, and fading in at the tip ---- */
    var NB = 6, bands = [], soft = [];
    for (var i0 = 0; i0 < NB; i0++) bands.push([[], []]);
    var yEnd = Math.min(H + SLICE, tipY);
    for (var yy = -SLICE; yy < yEnd; yy += SLICE) {
      var build = clamp((tipY - yy) / 110, 0, 1);           // 0 at the tip, 1 well behind it
      for (var k0 = 0; k0 < 2; k0++) {
        var pa = strand(s + yy, k0), pb = strand(s + yy + SLICE, k0);
        var dm = (pa.d + pb.d) / 2;
        if (build > 0.985) {
          bands[clamp(((dm + 1) / 2 * NB) | 0, 0, NB - 1)][k0].push(pa.x, yy, pb.x, yy + SLICE);
        } else {
          soft.push(pa.x, yy, pb.x, yy + SLICE, (dm + 1) / 2, build, k0);   // the forming turns
        }
      }
    }
    var strokeBand = function (bi) {
      var dep = (bi + 0.5) / NB;
      for (var k1 = 0; k1 < 2; k1++) {
        var run = bands[bi][k1];
        if (!run.length) continue;
        g.beginPath();
        for (var j = 0; j < run.length; j += 4) { g.moveTo(run[j], run[j + 1]); g.lineTo(run[j + 2], run[j + 3]); }
        g.strokeStyle = k1 === 0 ? C.primary : C.fg;
        g.globalAlpha = alpha * (0.14 + 0.66 * dep);
        g.lineWidth = 0.9 + 2.1 * dep;
        g.stroke();
      }
    };
    strokeBand(0); strokeBand(1); strokeBand(2);

    // rungs, also only above the front
    var rAT = [], rGC = [], names = [];
    var kA = Math.ceil((s - SLICE) / RUNG), kB = Math.floor(Math.min(s + H, front) / RUNG);
    for (var rk = kA; rk <= kB; rk++) {
      var ry = rk * RUNG, rsy = ry - s;
      var bld = clamp((tipY - rsy) / 110, 0, 1);
      if (bld <= 0.02) continue;
      var r0 = strand(ry, 0), r1 = strand(ry, 1);
      var b4 = ((rk % 4) + 4) % 4;
      (b4 < 2 ? rAT : rGC).push(r0.x, rsy, r1.x, rsy, bld);
      if (RW > 130 && rk % 3 === 0 && bld > 0.6) names.push(BASES[b4], r0.x, r1.x, rsy, r0.d);
    }
    [[rAT, C.accent, 0.30], [rGC, C.primary, 0.28]].forEach(function (Gp) {
      if (!Gp[0].length) return;
      // split into two alpha classes rather than one path per rung
      [[0.55, 1.01, 1.0], [0.0, 0.55, 0.45]].forEach(function (cls) {
        g.beginPath(); var any = false;
        for (var j = 0; j < Gp[0].length; j += 5) {
          if (Gp[0][j + 4] < cls[0] || Gp[0][j + 4] >= cls[1]) continue;
          g.moveTo(Gp[0][j], Gp[0][j + 1]); g.lineTo(Gp[0][j + 2], Gp[0][j + 3]); any = true;
        }
        if (!any) return;
        g.strokeStyle = Gp[1]; g.globalAlpha = alpha * Gp[2] * cls[2]; g.lineWidth = 1.1; g.stroke();
      });
    });

    strokeBand(3); strokeBand(4); strokeBand(5);

    // the turns still forming, right at the tip
    for (var sf = 0; sf < soft.length; sf += 7) {
      var dep2 = soft[sf + 4], bld2 = soft[sf + 5];
      g.beginPath();
      g.moveTo(soft[sf], soft[sf + 1]); g.lineTo(soft[sf + 2], soft[sf + 3]);
      g.strokeStyle = soft[sf + 6] === 0 ? C.primary : C.fg;
      g.globalAlpha = alpha * (0.14 + 0.66 * dep2) * bld2;
      g.lineWidth = (0.9 + 2.1 * dep2) * (0.4 + 0.6 * bld2);
      g.stroke();
    }

    if (names.length) {
      g.font = '700 8.5px "Roboto Mono", ui-monospace, monospace';
      for (var L = 0; L < names.length; L += 5) {
        var b1 = names[L], dd = names[L + 4];
        g.fillStyle = (b1 === 'A' || b1 === 'T') ? C.accent : C.primary;
        g.globalAlpha = alpha * 0.42 * ((dd + 1) / 2);
        g.fillText(b1, names[L + 1], names[L + 3]);
        g.globalAlpha = alpha * 0.42 * ((-dd + 1) / 2);
        g.fillText(PAIR[b1], names[L + 2], names[L + 3]);
      }
    }

    /* ---- the assembly glow, where the molecule is actually being made ---- */
    if (tipY > -30 && tipY < H + 30) {
      var pulse = 0.55 + 0.45 * Math.sin(t * 3.1);
      var grd = g.createRadialGradient(axis, tipY, 0, axis, tipY, 46 + 8 * pulse);
      grd.addColorStop(0, C.accent);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = alpha * 0.16 * pulse;
      g.fillStyle = grd;
      g.beginPath(); g.arc(axis, tipY, 46 + 8 * pulse, 0, TAU); g.fill();
    }

    /* ---- the motes. Each is a FIXED point on the page; the front sweeping over it is
            what converts it. Raw and far out ahead of the front, spiralling in and
            morphing as the front nears, locked onto the tip when it arrives. ---- */
    var pos = function (M, p) {
      var pp = clamp(p, 0, 1);
      var vy = lerp(M.vy, front, pp * 0.42);              // drawn toward the tip as it goes
      var sy = vy - s;
      var radRaw = rOut * (0.5 + 0.5 * M.rad0);
      var rad = amp + (radRaw - amp) * Math.pow(1 - pp, 1.55);
      var snapv = easeOut(clamp((pp - 0.55) / 0.45, 0, 1));
      var free = M.ang0 + pp * M.turns * TAU + spin * M.drift
                 + Math.sin(t * 0.55 + M.wob) * (0.10 + 0.22 * (1 - pp));
      var lockA = (vy / PITCH) * TAU + spin + (M.base & 1) * Math.PI;
      var ang = lerp(free, lockA + Math.round((free - lockA) / TAU) * TAU, snapv);
      return { x: axis + rad * Math.sin(ang), y: sy, d: (Math.cos(ang) + 1) / 2 };
    };

    var trailN = [], trailF = [];
    var glyphs = [];
    for (var m = 0; m < MOTES.length; m++) {
      var M = MOTES[m];
      var p = (front - M.vy) / ASSEMBLE;
      if (p >= 1.02 || p < -2.4) continue;                 // absorbed, or too far ahead to matter
      var P = pos(M, p);
      if (P.y < -40 || P.y > H + 40) continue;

      if (p > 0.05 && p < 1) {                             // its path, so the spiral is visible
        var into = P.d > 0.5 ? trailN : trailF;
        var prev = P;
        for (var st = 1; st <= 5; st++) {
          var q = pos(M, p - st * 0.035);
          into.push(prev.x, prev.y, q.x, q.y);
          prev = q;
        }
      }
      glyphs.push(M, p, P.x, P.y, P.d, m);
    }
    [[trailF, 0.09, 0.7], [trailN, 0.20, 1.1]].forEach(function (T) {
      if (!T[0].length) return;
      g.beginPath();
      for (var j = 0; j < T[0].length; j += 4) { g.moveTo(T[0][j], T[0][j + 1]); g.lineTo(T[0][j + 2], T[0][j + 3]); }
      g.strokeStyle = C.primary; g.globalAlpha = alpha * T[1]; g.lineWidth = T[2]; g.stroke();
    });

    for (var q2 = 0; q2 < glyphs.length; q2 += 6) {
      var MO = glyphs[q2], pr = glyphs[q2 + 1];
      var gx = glyphs[q2 + 2], gy = glyphs[q2 + 3], gd = glyphs[q2 + 4], gi = glyphs[q2 + 5];
      var pc = clamp(pr, 0, 1);
      var morph = clamp((pc - 0.30) / 0.20, 0, 1);         // 0/1 ....... A G T C
      var landed = clamp((pc - 0.93) / 0.07, 0, 1);
      var glyph, col;
      if (morph < 1) {
        var flick = morph > 0 && frac(t * 12 + gi * 0.41) < morph;
        glyph = flick ? BASES[MO.base] : MO.bit;
        col = flick ? ((MO.base < 2) ? C.accent : C.primary) : C.mute;
      } else {
        glyph = BASES[MO.base];
        col = (MO.base < 2) ? C.accent : C.primary;
      }
      var pop = 1 + 0.85 * morph * (1 - morph) * 4;
      g.font = (morph < 1 ? '600 ' : '700 ') + ((7.5 + 4 * gd) * pop).toFixed(1) +
               'px "Roboto Mono", ui-monospace, monospace';
      g.fillStyle = col;
      g.globalAlpha = alpha * (0.18 + 0.68 * gd) * (1 - landed) *
                      (pr < 0 ? clamp(1 + pr / 2.4, 0, 1) * 0.80 : 0.45 + 0.55 * morph);
      g.fillText(glyph, gx, gy);

      if (landed > 0) {
        g.beginPath(); g.arc(gx, gy, 2 + 13 * landed, 0, TAU);
        g.strokeStyle = col; g.globalAlpha = alpha * 0.7 * (1 - landed); g.lineWidth = 1.4; g.stroke();
      }
    }
    g.restore();
  }

  /* ═════════════════════ RIGHT: a metabolism, not a tangle ═════════════════ */
  var NODES = [], EDGES = [];
  var NSPIN = 0.19, NTWIST = 0.0026;
  var BIGG = ['glc__D_e', 'g6p_c', 'f6p_c', 'fdp_c', 'g3p_c', 'pep_c', 'pyr_c', 'accoa_c',
              'cit_c', 'icit_c', 'akg_c', 'succoa_c', 'succ_c', 'fum_c', 'mal__L_c', 'oaa_c',
              'atp_c', 'nadh_c', 'co2_e', 'ac_e', 'etoh_e', 'lac__D_e', 'for_e', 'o2_e'];

  function buildNet() {
    NODES = []; EDGES = [];
    var R = rng(20260713);
    var total = TOTAL;
    var SP = 40;
    var li = 0;

    function push(rad, ang, y, hub, label, term) {
      var n = { rad: clamp(rad, 0, 1), ang: ang, y: y, i: NODES.length,
                hub: !!hub, label: label || null, term: !!term };
      NODES.push(n); return n;
    }
    function link(a, b, w, kind) {
      EDGES.push({ a: a.i, b: b.i, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y),
                   w: w, kind: kind, flux: kind === 'spine' ? 2 : 1 });
    }
    var lbl = function () { return BIGG[(li++) % BIGG.length]; };

    /* 1 ── the spine: the main pathway, running down the axis of the vortex */
    var spine = [push(0.09, 0, 0, true, lbl())];
    for (var y = SP; y < total; y += SP) {
      var n = push(0.09 + (R() - 0.5) * 0.03, spine[spine.length - 1].ang + (R() - 0.5) * 0.10,
                   y, false, null);
      link(spine[spine.length - 1], n, 2.2, 'spine');
      spine.push(n);
    }

    /* 2 ── the motifs a metabolism actually has, hung off it in a repeating sequence.
            This is what makes it pattern rather than tangle. */
    var SEQ = ['chain', 'cycle', 'pair', 'chain', 'bypass', 'cycle'];
    var mi = 0;

    for (var si = 2; si < spine.length - 5; si += 2) {
      var root = spine[si];
      var a0 = R() * TAU;
      var kind = SEQ[mi++ % SEQ.length];

      if (kind === 'cycle') {
        /* A CLOSED RING of eight, and the most recognisable thing on the rail: the TCA
           cycle, with flux circulating round it.

           Its plane is TANGENTIAL, not radial. A ring in the radial plane collapses to a
           vertical line exactly when it swings to the front of the cylinder — so the ring
           nearest the reader is the one they cannot see, which is precisely backwards. In
           the tangential plane it is a full circle when it is nearest, and edges away as
           it turns to the side, which is how a ring in space actually behaves. */
        var K = 8, radC = 0.48, rr = 0.30, ryC = 54, yC = root.y + 64;
        var Xc = radC * Math.cos(a0), Zc = radC * Math.sin(a0);
        var sa = Math.sin(a0), ca = Math.cos(a0);
        var ring = [];
        for (var i = 0; i < K; i++) {
          var phi = Math.PI + (i / K) * TAU;
          var du = rr * Math.cos(phi);                    // along the tangent
          var X = Xc - du * sa, Z = Zc + du * ca;         // ...back into the cylinder
          ring.push(push(Math.sqrt(X * X + Z * Z), Math.atan2(Z, X),
                         yC + ryC * Math.sin(phi), false, (i % 3 === 0) ? lbl() : null));
        }
        for (var i2 = 0; i2 < K; i2++) link(ring[i2], ring[(i2 + 1) % K], 1.3, 'cycle');
        link(root, ring[2], 1.5, 'link');                 // hangs off the spine by its top
        root.hub = true; ring[2].hub = true;

      } else if (kind === 'chain') {
        // a linear pathway out to an exchange metabolite
        var p1 = root;
        for (var j = 0; j < 4; j++) {
          var c1 = push(0.17 + (j + 1) * 0.17, a0 + (R() - 0.5) * 0.22,
                        root.y + (j + 1) * 38, false, j === 3 ? lbl() : null, j === 3);
          link(p1, c1, j === 0 ? 1.5 : 1.1, 'chain');
          p1 = c1;
        }
        root.hub = true;

      } else if (kind === 'pair') {
        // the same pathway on opposite sides: symmetry is pattern
        [0, Math.PI].forEach(function (off) {
          var p2 = root;
          for (var j2 = 0; j2 < 3; j2++) {
            var c2 = push(0.17 + (j2 + 1) * 0.19, a0 + off + (R() - 0.5) * 0.14,
                          root.y + (j2 + 1) * 40, false, j2 === 2 ? lbl() : null, j2 === 2);
            link(p2, c2, j2 === 0 ? 1.4 : 1.05, 'chain');
            p2 = c2;
          }
        });
        root.hub = true;

      } else {
        // a bypass: split off the spine and rejoin it further down
        var end = spine[si + 3];
        [-1, 1].forEach(function (sg) {
          var m1 = push(0.46, a0 + sg * 0.95, root.y + 54, false, null);
          var m2 = push(0.46, a0 + sg * 0.95, root.y + 108, false, null);
          link(root, m1, 1.2, 'chain');
          link(m1, m2, 1.2, 'chain');
          link(m2, end, 1.2, 'chain');
        });
        root.hub = true; end.hub = true;
      }
    }
  }

  function drawNet(ox, s, t, alpha) {
    var cx = ox + RW * 0.5;
    var rx = RW * 0.5 - 9;
    var front = s + H * 0.72;
    var spin = t * NSPIN;
    var lo = s - 90, hi = s + H + 90;

    var PXa = [], PYa = [], PDa = [], PGa = [];
    for (var i = 0; i < NODES.length; i++) {
      var n = NODES[i];
      if (n.y < lo || n.y > hi) { PGa[i] = -1; continue; }
      var th = n.ang + spin + n.y * NTWIST;
      PXa[i] = cx + n.rad * rx * Math.sin(th);
      PYa[i] = n.y - s;
      PDa[i] = (Math.cos(th) + 1) / 2;
      PGa[i] = clamp((front - n.y) / 95, 0, 1);
    }

    g.save();
    g.lineCap = 'round';

    var EB = 5, eb = [], fx = [], nb = [];
    for (var q = 0; q < EB; q++) { eb.push({ w: [[], [], []], cyc: [], live: [] }); fx.push([]); nb.push({ hub: [], dot: [], term: [], grow: [] }); }

    for (var e = 0; e < EDGES.length; e++) {
      var E = EDGES[e];
      if (E.y1 < lo || E.y0 > hi) continue;
      var A = E.a, B = E.b;
      if (PGa[A] === undefined || PGa[A] < 0 || PGa[B] === undefined || PGa[B] < 0) continue;
      var gr = clamp((front - E.y0) / Math.max(1, E.y1 - E.y0 || 40), 0, 1);
      if (gr <= 0) continue;
      var ax = PXa[A], ay = PYa[A], bx = PXa[B], by = PYa[B];
      var bi = clamp((((PDa[A] + PDa[B]) / 2) * EB) | 0, 0, EB - 1);

      if (gr >= 0.999) {
        if (E.kind === 'cycle') eb[bi].cyc.push(ax, ay, bx, by);
        else eb[bi].w[E.w >= 1.9 ? 0 : (E.w >= 1.25 ? 1 : 2)].push(ax, ay, bx, by);
        for (var f = 0; f < E.flux; f++) {
          var u = frac(t * (0.30 + 0.06 * E.w) + e * 0.41 + f / E.flux);
          var u0 = Math.max(0, u - 0.24);
          fx[bi].push(lerp(ax, bx, u0), lerp(ay, by, u0), lerp(ax, bx, u), lerp(ay, by, u));
        }
      } else {
        eb[bi].live.push(ax, ay, bx, by, E.w, gr, E.kind === 'cycle' ? 1 : 0);
      }
    }

    var lblq = [];
    for (var i2 = 0; i2 < NODES.length; i2++) {
      if (PGa[i2] === undefined || PGa[i2] <= 0) continue;
      var N2 = NODES[i2], a2 = PGa[i2], bi2 = clamp((PDa[i2] * EB) | 0, 0, EB - 1);
      if (a2 >= 0.999) {
        (N2.hub ? nb[bi2].hub : (N2.term ? nb[bi2].term : nb[bi2].dot)).push(PXa[i2], PYa[i2], PDa[i2]);
      } else {
        nb[bi2].grow.push(PXa[i2], PYa[i2], PDa[i2], a2, N2.hub ? 1 : 0);
      }
      if (N2.label && RW > 130 && a2 > 0.6 && PDa[i2] > 0.6) lblq.push(N2.label, PXa[i2], PYa[i2], PDa[i2]);
    }

    var curve = function (ax, ay, bx, by) {
      g.moveTo(ax, ay);
      g.bezierCurveTo(ax, ay + (by - ay) * 0.45, (ax + bx) / 2, by - (by - ay) * 0.2, bx, by);
    };

    for (var b = 0; b < EB; b++) {
      var dep = (b + 0.5) / EB, vis = 0.20 + 0.80 * dep;

      [[0, 2.2, 0.74], [1, 1.5, 0.56], [2, 1.0, 0.40]].forEach(function (Wt) {
        var arr = eb[b].w[Wt[0]];
        if (!arr.length) return;
        g.beginPath();
        for (var j = 0; j < arr.length; j += 4) curve(arr[j], arr[j + 1], arr[j + 2], arr[j + 3]);
        g.strokeStyle = C.primary;
        g.globalAlpha = alpha * Wt[2] * vis;
        g.lineWidth = Wt[1] * (0.55 + 0.45 * dep);
        g.stroke();
      });

      if (eb[b].cyc.length) {                      // the rings: straight chords, so they close
        var Cy = eb[b].cyc;
        g.beginPath();
        for (var j2 = 0; j2 < Cy.length; j2 += 4) { g.moveTo(Cy[j2], Cy[j2 + 1]); g.lineTo(Cy[j2 + 2], Cy[j2 + 3]); }
        g.strokeStyle = C.accent;
        g.globalAlpha = alpha * 0.52 * vis;
        g.lineWidth = 1.35 * (0.55 + 0.45 * dep);
        g.stroke();
      }

      var Lv = eb[b].live;
      for (var j3 = 0; j3 < Lv.length; j3 += 7) {
        var gg = Lv[j3 + 5], eg = easeOut(gg);
        var tx = lerp(Lv[j3], Lv[j3 + 2], eg), ty = lerp(Lv[j3 + 1], Lv[j3 + 3], eg);
        g.beginPath();
        if (Lv[j3 + 6]) { g.moveTo(Lv[j3], Lv[j3 + 1]); g.lineTo(tx, ty); g.strokeStyle = C.accent; }
        else { curve(Lv[j3], Lv[j3 + 1], tx, ty); g.strokeStyle = C.primary; }
        g.globalAlpha = alpha * 0.55 * (0.3 + 0.7 * gg) * vis;
        g.lineWidth = Lv[j3 + 4] * (0.55 + 0.45 * dep);
        g.stroke();
      }

      if (fx[b].length) {                          // FLUX
        var F = fx[b];
        g.beginPath();
        for (var j4 = 0; j4 < F.length; j4 += 4) { g.moveTo(F[j4], F[j4 + 1]); g.lineTo(F[j4 + 2], F[j4 + 3]); }
        g.strokeStyle = C.accent;
        g.globalAlpha = alpha * (0.20 + 0.46 * dep);
        g.lineWidth = 0.8 + 1.0 * dep;
        g.stroke();
        g.beginPath();
        for (var j5 = 0; j5 < F.length; j5 += 4) {
          g.moveTo(F[j5 + 2] + 1.1, F[j5 + 3]);
          g.arc(F[j5 + 2], F[j5 + 3], 0.9 + 0.7 * dep, 0, TAU);
        }
        g.fillStyle = C.accent; g.globalAlpha = alpha * (0.30 + 0.55 * dep); g.fill();
      }

      var N = nb[b];
      if (N.hub.length) {
        g.beginPath();
        for (var h = 0; h < N.hub.length; h += 3) { g.moveTo(N.hub[h] + 5.5, N.hub[h + 1]); g.arc(N.hub[h], N.hub[h + 1], 5.5, 0, TAU); }
        g.fillStyle = C.accent; g.globalAlpha = alpha * 0.10 * vis; g.fill();
        g.beginPath();
        for (var h2 = 0; h2 < N.hub.length; h2 += 3) {
          var rr = 1.9 + 1.6 * N.hub[h2 + 2];
          g.moveTo(N.hub[h2] + rr, N.hub[h2 + 1]); g.arc(N.hub[h2], N.hub[h2 + 1], rr, 0, TAU);
        }
        g.fillStyle = C.accent; g.globalAlpha = alpha * 0.95 * vis; g.fill();
      }
      if (N.dot.length) {
        g.beginPath();
        for (var d1 = 0; d1 < N.dot.length; d1 += 3) {
          var r1 = 1.1 + 1.4 * N.dot[d1 + 2];
          g.moveTo(N.dot[d1] + r1, N.dot[d1 + 1]); g.arc(N.dot[d1], N.dot[d1 + 1], r1, 0, TAU);
        }
        g.fillStyle = C.primary; g.globalAlpha = alpha * 0.72 * vis; g.fill();
      }
      if (N.term.length) {                          // exchanges: a ring, not a dot
        g.beginPath();
        for (var d2 = 0; d2 < N.term.length; d2 += 3) {
          var r2 = 2.0 + 1.4 * N.term[d2 + 2];
          g.moveTo(N.term[d2] + r2, N.term[d2 + 1]); g.arc(N.term[d2], N.term[d2 + 1], r2, 0, TAU);
        }
        g.strokeStyle = C.fg; g.globalAlpha = alpha * 0.6 * vis; g.lineWidth = 1.1; g.stroke();
      }
      for (var w2 = 0; w2 < N.grow.length; w2 += 5) {
        var isH = N.grow[w2 + 4] === 1, ga = N.grow[w2 + 3], gd = N.grow[w2 + 2];
        g.beginPath();
        g.arc(N.grow[w2], N.grow[w2 + 1], (isH ? 1.9 + 1.6 * gd : 1.1 + 1.4 * gd) * easeOut(ga), 0, TAU);
        g.fillStyle = isH ? C.accent : C.primary;
        g.globalAlpha = alpha * (isH ? 0.95 : 0.72) * ga * vis;
        g.fill();
      }
    }

    g.textBaseline = 'middle';
    g.font = '500 9.5px "Roboto Mono", ui-monospace, monospace';
    g.fillStyle = C.mute;
    for (var m2 = 0; m2 < lblq.length; m2 += 4) {
      var tw = g.measureText(lblq[m2]).width;
      var lx = lblq[m2 + 1] + 8, right = false;
      if (lx + tw > ox + RW - 3) { right = true; lx = lblq[m2 + 1] - 8; }
      if (right && lx - tw < ox + 2) continue;
      g.textAlign = right ? 'right' : 'left';
      g.globalAlpha = alpha * 0.55 * (lblq[m2 + 3] - 0.6) / 0.4;
      g.fillText(lblq[m2], lx, lblq[m2 + 2]);
    }
    g.textAlign = 'left';
    g.restore();
  }

  /* ══════════════ MIDDLE: at every boundary, the two halves meet ═══════════
     The gap between two sections is 256px of clear page. As it crosses the middle
     of the screen, bases stream in from the left rail and metabolites and flux from
     the right, they converge on a point and fuse, and a shockwave goes out. Then
     they separate and go back to their margins for the next section. */
  var STREAM = [];
  (function () {
    var R = rng(99);
    for (var i = 0; i < 26; i++) {
      STREAM.push({
        side: i % 2,                            // 0 = from the DNA, 1 = from the metabolism
        lag: R() * 0.45,                        // staggered arrival
        arc: (R() - 0.5) * 2,                   // how far it bows on the way in
        base: (R() * 4) | 0,
        orb: R() * TAU,
        spd: 0.8 + R() * 0.6
      });
    }
  })();

  function drawFusion(t, alpha, m, bsy) {
    if (m <= 0.004) return;
    var cxm = W * 0.5;
    var srcL = RW * 0.60, srcR = W - RW * 0.5;

    g.save();
    g.lineCap = 'round';
    g.textAlign = 'center';
    g.textBaseline = 'middle';

    var core = easeOut(clamp((m - 0.25) / 0.75, 0, 1));

    // ---- the streams coming in
    var trail = [];
    for (var i = 0; i < STREAM.length; i++) {
      var S = STREAM[i];
      var u = smooth(clamp((m - S.lag) / (1 - S.lag), 0, 1));
      if (u <= 0.001) continue;
      var sx = S.side ? srcR : srcL;
      var sy = bsy + S.arc * 30;
      var ex = cxm + Math.cos(S.orb + t * S.spd) * 16 * core;
      var ey = bsy + Math.sin(S.orb + t * S.spd) * 11 * core;
      var px = lerp(sx, ex, u);
      var py = lerp(sy, ey, u) - Math.sin(u * Math.PI) * S.arc * 46;   // it bows on the way

      var pu = smooth(clamp((m - S.lag - 0.06) / (1 - S.lag), 0, 1));
      trail.push(px, py, lerp(sx, ex, pu), lerp(sy, ey, pu) - Math.sin(pu * Math.PI) * S.arc * 46);

      if (S.side) {                             // a metabolite, and its flux
        g.beginPath(); g.arc(px, py, 2.2 + 1.4 * u, 0, TAU);
        g.fillStyle = C.accent; g.globalAlpha = alpha * (0.35 + 0.5 * u); g.fill();
      } else {                                  // a base, still legible on its way in
        g.font = '700 ' + (9 + 3 * u).toFixed(1) + 'px "Roboto Mono", ui-monospace, monospace';
        g.fillStyle = (S.base < 2) ? C.accent : C.primary;
        g.globalAlpha = alpha * (0.4 + 0.5 * u);
        g.fillText(BASES[S.base], px, py);
      }
    }
    if (trail.length) {
      g.beginPath();
      for (var j = 0; j < trail.length; j += 4) { g.moveTo(trail[j], trail[j + 1]); g.lineTo(trail[j + 2], trail[j + 3]); }
      g.strokeStyle = C.primary; g.globalAlpha = alpha * 0.22 * m; g.lineWidth = 1.1; g.stroke();
    }

    // ---- the core they fuse into: a turning ring with the material orbiting it
    if (core > 0.01) {
      var rr = 20 + 16 * core;
      g.beginPath(); g.arc(cxm, bsy, rr, 0, TAU);
      g.strokeStyle = C.accent;
      g.globalAlpha = alpha * 0.5 * core;
      g.lineWidth = 1.3;
      g.stroke();

      var grd = g.createRadialGradient(cxm, bsy, 0, cxm, bsy, rr * 1.7);
      grd.addColorStop(0, C.accent);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = alpha * 0.22 * core;
      g.fillStyle = grd;
      g.beginPath(); g.arc(cxm, bsy, rr * 1.7, 0, TAU); g.fill();

      // a short double helix turning inside it: the genome, at the centre of the metabolism
      g.globalAlpha = alpha * 0.8 * core;
      for (var k = 0; k < 2; k++) {
        g.beginPath();
        for (var a = -rr * 0.8; a <= rr * 0.8; a += 3) {
          var ph = (a / 16) + t * 1.6 + k * Math.PI;
          var hx = cxm + a, hy = bsy + Math.sin(ph) * 8;
          if (a === -rr * 0.8) g.moveTo(hx, hy); else g.lineTo(hx, hy);
        }
        g.strokeStyle = k === 0 ? C.primary : C.fg;
        g.lineWidth = 1.5;
        g.stroke();
      }
    }

    // ---- the shockwave, once they are one thing
    var wave = clamp((m - 0.72) / 0.28, 0, 1);
    if (wave > 0.001) {
      g.beginPath();
      g.arc(cxm, bsy, 30 + 92 * easeOut(wave), 0, TAU);   // stays inside the 256px gap
      g.strokeStyle = C.accent;
      g.globalAlpha = alpha * 0.35 * (1 - wave);
      g.lineWidth = 2.4 * (1 - wave) + 0.4;
      g.stroke();
    }
    g.restore();
  }

  /* ------------------------------------------------------------------ loop */
  var raf = 0, t0 = performance.now(), hidden = false;

  function frame(now) {
    raf = 0;
    if (!live || hidden) return;
    var y = window.scrollY || window.pageYOffset;
    var s = y - zTop + H;
    var alpha = clamp((y - (zTop - H * 0.9)) / (H * 0.55), 0, 1);

    g.clearRect(0, 0, W, H);

    /* ABOVE the zone: clear and stop, and let the scroll listener wake us. There is no
       "below the zone" — the strip runs to the bottom of the document — so once we are
       in, we keep drawing all the way down.

       This used to be gated on an IntersectionObserver watching #work, which is only the
       FIRST section: the moment the reader scrolled past it the loop was cancelled and
       everything from Papers down showed a frozen last frame. */
    if (alpha <= 0.004) return;
    var t = (now - t0) / 1000;

    // which boundary is closest to the middle of the screen, and how close?
    var m = 0, bsy = 0;
    for (var i = 0; i < BOUNDS.length; i++) {
      var by = BOUNDS[i] - y;
      var mm = 1 - clamp(Math.abs(by - H * 0.5) / (H * 0.40), 0, 1);
      if (mm > m) { m = mm; bsy = by; }
    }
    m = smooth(m);

    // the rails lean in as the boundary arrives, and stand back up after it
    var pull = m * (RW * 0.30);
    drawDNA(pull, s, t, alpha, m, bsy);
    drawNet(W - RW - pull, s, t, alpha);
    drawFusion(t, alpha, m, bsy);

    if (!reduced) raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf && live && !hidden) raf = requestAnimationFrame(frame); }

  document.addEventListener('visibilitychange', function () {
    hidden = document.hidden;
    if (hidden) { if (raf) { cancelAnimationFrame(raf); raf = 0; } } else kick();
  });

  var rt;
  function remeasure() { clearTimeout(rt); rt = setTimeout(function () { measure(); kick(); }, 160); }
  window.addEventListener('resize', remeasure, { passive: true });
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('load', function () { measure(); kick(); });

  // the lazy figures land as the reader arrives at them, and the document gets taller
  if (window.ResizeObserver) new ResizeObserver(remeasure).observe(document.body);

  measure();
  kick();
})();
