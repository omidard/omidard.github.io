/* ============================================================================
   "From binary to biology" — a scroll-scrubbed canvas in three acts.

   The three acts are the actual pipeline this work runs on:
     I.   bits pair off into bases and assemble a double helix   (sequence)
     II.  100,000 genomes compress into one pangenome            (core/accessory/cloud)
     III. the pangenome resolves into a metabolic network        (real BiGG IDs, flux)

   Vanilla canvas, no dependencies. Reads its colors from the CSS theme tokens so
   it follows the light/dark toggle. Runs only while on screen. Under
   prefers-reduced-motion it draws a single static frame of the finished network
   and never starts a rAF loop.
   ========================================================================== */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext('2d');
  var section = document.getElementById('pipeline');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, u) { return a + (b - a) * u; };
  var easeOut = function (u) { return 1 - Math.pow(1 - u, 3); };
  var easeInOut = function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
  // ramp from 0 to 1 across [e0,e1]
  var band = function (v, e0, e1) { return clamp((v - e0) / (e1 - e0), 0, 1); };

  /* ---------------------------------------------------------------- theme */
  var C = {};
  function readTheme() {
    var s = getComputedStyle(document.documentElement);
    var g = function (n) { return s.getPropertyValue(n).trim(); };
    C.fg = g('--fg');
    C.mute = g('--fg-mute');
    C.primary = g('--primary');
    C.accent = g('--accent');
    C.border = g('--border');
    C.dark = document.documentElement.getAttribute('data-theme') === 'dark';
  }
  readTheme();
  new MutationObserver(readTheme).observe(document.documentElement, {
    attributes: true, attributeFilter: ['data-theme']
  });

  /* --------------------------------------------------------------- sizing */
  var W = 0, H = 0, S = 0, small = false;

  function resize() {
    var r = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    if (!W || !H) return;
    S = Math.min(W, H);
    small = W < 860;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* -------------------------------------------------- act I: bits -> helix */
  var RUNGS = 24;
  var PAIRS = [['A', 'T'], ['T', 'A'], ['G', 'C'], ['C', 'G']];
  var bits = [];

  function seedBits() {
    bits = [];
    for (var i = 0; i < RUNGS; i++) {
      var pr = PAIRS[(Math.sin(i * 12.9898) * 43758.5453 | 0) & 3];
      for (var s = 0; s < 2; s++) {
        bits.push({
          rung: i,
          strand: s,
          base: pr[s],
          glyph: (i * 7 + s * 3) % 2 ? '1' : '0',
          // deterministic scatter origin, spread around the frame
          ox: Math.cos(i * 2.4 + s * 3.1) * 0.9,
          oy: Math.sin(i * 1.7 + s * 2.2) * 0.9,
          delay: (i / RUNGS) * 0.55 + s * 0.02
        });
      }
    }
  }
  seedBits();

  var TURNS = 2.4;

  function helixGeom() {
    return {
      cx: small ? W * 0.5 : W * 0.66,
      cy: H * 0.5,
      span: Math.min(H * 0.78, 620),
      amp: Math.min(W * (small ? 0.17 : 0.105), 118)
    };
  }
  // point on strand s at fraction f along the helix; d is depth, +1 toward viewer
  function strandAt(g, f, s, t) {
    var ph = f * TURNS * Math.PI * 2 + t * 0.55 + s * Math.PI;
    return {
      x: g.cx + g.amp * Math.sin(ph),
      y: g.cy - g.span / 2 + f * g.span,
      d: Math.cos(ph)
    };
  }

  function drawHelix(p, t, alpha) {
    if (alpha <= 0.001) return;
    var g = helixGeom();
    ctx.save();
    ctx.lineCap = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ambient binary rain: the information exists before the molecule does
    var rain = 0.30 * alpha * (1 - p * 0.55);
    if (rain > 0.01) {
      ctx.globalAlpha = rain;
      ctx.fillStyle = C.mute;
      ctx.font = '600 12px "Roboto Mono", monospace';
      for (var r = 0; r < 46; r++) {
        var rx = (Math.sin(r * 91.7) * 0.5 + 0.5) * W;
        var ry = (((Math.cos(r * 47.3) * 0.5 + 0.5) * H) + t * (18 + (r % 5) * 9)) % H;
        ctx.fillText((r % 2) ? '1' : '0', rx, ry);
      }
    }

    // ---- rungs (base pairs), behind the backbone
    var landed = [];
    for (var i = 0; i < RUNGS; i++) {
      var f = i / (RUNGS - 1);
      var u = easeOut(clamp((p - (f * 0.5)) / 0.42, 0, 1));
      landed[i] = u;
      if (u < 0.985) continue;
      var s0 = strandAt(g, f, 0, t), s1 = strandAt(g, f, 1, t);
      ctx.globalAlpha = alpha * (0.10 + 0.32 * (s0.d * 0.5 + 0.5));
      ctx.strokeStyle = C.fg;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(s0.x, s0.y);
      ctx.lineTo(s1.x, s1.y);
      ctx.stroke();
    }

    // ---- the two sugar-phosphate backbones. Without these it is a ladder,
    // not a helix. Drawn as depth-shaded segments so the strands cross over
    // and under each other the way a real double helix does.
    var SEG = 170;
    var reveal = easeOut(clamp(p / 0.80, 0, 1));
    for (var s = 0; s < 2; s++) {
      for (var k = 0; k < SEG; k++) {
        var f0 = k / SEG, f1 = (k + 1) / SEG;
        if (f0 > reveal) break;
        var a = strandAt(g, f0, s, t), b = strandAt(g, f1, s, t);
        var d = a.d * 0.5 + 0.5;                    // 0 back .. 1 front
        ctx.globalAlpha = alpha * (0.14 + 0.66 * d) * clamp((reveal - f0) * 8, 0, 1);
        ctx.strokeStyle = s ? C.accent : C.primary;
        ctx.lineWidth = 1.1 + d * 2.2;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // ---- the bits themselves: 0/1 in flight, then a base once they land
    ctx.font = '600 12px "Roboto Mono", monospace';
    for (var bi = 0; bi < bits.length; bi++) {
      var bit = bits[bi];
      var ff = bit.rung / (RUNGS - 1);
      var tgt = strandAt(g, ff, bit.strand, t);
      var uu = landed[bit.rung];

      if (uu < 0.985) {
        var fx = lerp(g.cx + bit.ox * W * 0.55, tgt.x, uu);
        var fy = lerp(g.cy + bit.oy * H * 0.62, tgt.y, uu);
        ctx.globalAlpha = alpha * (0.25 + 0.6 * uu);
        ctx.fillStyle = C.mute;
        ctx.fillText(bit.glyph, fx, fy);
      } else {
        var dd = tgt.d * 0.5 + 0.5;
        ctx.globalAlpha = alpha * (0.5 + 0.5 * dd);
        ctx.fillStyle = bit.strand ? C.accent : C.primary;
        ctx.beginPath();
        ctx.arc(tgt.x, tgt.y, 2.2 + dd * 2.2, 0, Math.PI * 2);
        ctx.fill();
        if (tgt.d > 0.45 && !small) {          // label only front-facing bases
          ctx.globalAlpha = alpha * 0.85;
          ctx.fillStyle = C.fg;
          ctx.font = '700 10px "Roboto Mono", monospace';
          ctx.fillText(bit.base, tgt.x + (bit.strand ? 14 : -14), tgt.y);
          ctx.font = '600 12px "Roboto Mono", monospace';
        }
      }
    }
    ctx.restore();
  }

  /* ------------------------------------------- act II: genomes -> pangenome */
  var NG = 620;
  var genomes = [];
  function seedGenomes() {
    genomes = [];
    for (var i = 0; i < NG; i++) {
      var h1 = Math.sin(i * 12.9898) * 43758.5453;
      var h2 = Math.sin(i * 78.233) * 12345.6789;
      var h3 = Math.sin(i * 39.425) * 24634.6345;
      var f1 = h1 - Math.floor(h1), f2 = h2 - Math.floor(h2), f3 = h3 - Math.floor(h3);
      // gene-frequency classes: core is small and dense, cloud is the long tail
      var cls = f3 < 0.17 ? 0 : f3 < 0.55 ? 1 : 2;
      genomes.push({
        cls: cls,
        ang: f1 * Math.PI * 2,
        jit: (f2 - 0.5),
        sx: (f1 - 0.5) * 2.1,
        sy: (f2 - 0.5) * 2.1,
        spin: 0.06 + f2 * 0.10,
        delay: f1 * 0.35
      });
    }
  }
  seedGenomes();

  var RING_LABEL = ['core', 'accessory', 'cloud'];

  function drawPangenome(p, t, alpha) {
    if (alpha <= 0.001) return;
    var cx = small ? W * 0.5 : W * 0.66;
    var cy = H * 0.5;
    var base = Math.min(S * 0.40, 300);
    var radii = [base * 0.34, base * 0.68, base * 1.0];

    ctx.save();
    ctx.globalAlpha = alpha;

    // ring guides come in as the structure resolves
    var guide = band(p, 0.45, 0.85);
    if (guide > 0.01) {
      ctx.setLineDash([2, 5]);
      ctx.lineWidth = 1;
      for (var g = 0; g < 3; g++) {
        ctx.globalAlpha = alpha * guide * 0.35;
        ctx.strokeStyle = C.border;
        ctx.beginPath();
        ctx.arc(cx, cy, radii[g], 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    var cols = [C.accent, C.primary, C.mute];
    for (var i = 0; i < genomes.length; i++) {
      var d = genomes[i];
      var u = easeInOut(clamp((p - d.delay) / 0.55, 0, 1));
      var r = radii[d.cls] + d.jit * (d.cls === 0 ? 9 : 18);
      var a = d.ang + t * d.spin;
      var tx = cx + Math.cos(a) * r;
      var ty = cy + Math.sin(a) * r;
      var fx = lerp(cx + d.sx * W * 0.52, tx, u);
      var fy = lerp(cy + d.sy * H * 0.60, ty, u);

      ctx.globalAlpha = alpha * (0.30 + 0.55 * u) * (d.cls === 2 ? 0.6 : 1);
      ctx.fillStyle = cols[d.cls];
      ctx.beginPath();
      ctx.arc(fx, fy, d.cls === 0 ? 2.3 : 1.7, 0, Math.PI * 2);
      ctx.fill();
    }

    // ring labels, once the structure has actually formed
    var lab = band(p, 0.72, 0.95);
    if (lab > 0.02 && !small) {
      ctx.font = '600 11px "Roboto Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var k = 0; k < 3; k++) {
        ctx.globalAlpha = alpha * lab * 0.9;
        ctx.fillStyle = k === 2 ? C.mute : cols[k];
        ctx.fillText(RING_LABEL[k], cx, cy - radii[k] - 12);
      }
    }
    ctx.restore();
  }

  /* ------------------------------ act III: pangenome -> metabolic network */
  // Real central carbon metabolism, real BiGG identifiers.
  var N = {};
  function node(id, x, y) { N[id] = { id: id, x: x, y: y }; }

  node('glc__D_e', 0.08, 0.05); node('g6p_c', 0.08, 0.20);
  node('f6p_c', 0.08, 0.35);    node('fdp_c', 0.08, 0.50);
  node('g3p_c', 0.08, 0.65);    node('pep_c', 0.10, 0.80);
  node('pyr_c', 0.17, 0.94);    node('accoa_c', 0.37, 0.94);
  node('ac_e', 0.28, 0.73);     node('co2_e', 0.50, 0.07);

  // The TCA cycle, laid out as an actual circle so it reads as a cycle.
  // Order round the ring is the real one: cit -> icit -> akg -> succoa ->
  // succ -> fum -> mal -> oaa -> back to cit.
  var TCA_C = { x: 0.74, y: 0.45, rx: 0.22, ry: 0.32 };
  var TCA = ['cit_c', 'icit_c', 'akg_c', 'succoa_c', 'succ_c', 'fum_c', 'mal__L_c', 'oaa_c'];
  var inRing = {};
  for (var q = 0; q < TCA.length; q++) {
    var rad = (180 + q * 45) * Math.PI / 180;
    node(TCA[q], TCA_C.x + Math.cos(rad) * TCA_C.rx, TCA_C.y + Math.sin(rad) * TCA_C.ry);
    inRing[TCA[q]] = true;
  }

  var EDGES = [
    ['glc__D_e', 'g6p_c', 'GLCpts', 1.00], ['g6p_c', 'f6p_c', 'PGI', 0.92],
    ['f6p_c', 'fdp_c', 'PFK', 0.92], ['fdp_c', 'g3p_c', 'FBA', 0.92],
    ['g3p_c', 'pep_c', 'ENO', 0.95], ['pep_c', 'pyr_c', 'PYK', 0.80],
    ['pyr_c', 'accoa_c', 'PDH', 0.74], ['accoa_c', 'cit_c', 'CS', 0.62],
    ['cit_c', 'icit_c', 'ACONTb', 0.60], ['icit_c', 'akg_c', 'ICDHyr', 0.58],
    ['akg_c', 'succoa_c', 'AKGDH', 0.50], ['succoa_c', 'succ_c', 'SUCOAS', 0.50],
    ['succ_c', 'fum_c', 'SUCDi', 0.48], ['fum_c', 'mal__L_c', 'FUM', 0.48],
    ['mal__L_c', 'oaa_c', 'MDH', 0.48], ['oaa_c', 'cit_c', 'CS', 0.44],
    ['accoa_c', 'ac_e', 'ACKr', 0.34], ['icit_c', 'co2_e', 'CO2t', 0.30]
  ];

  function netXY(n) {
    var bw = Math.min(W * (small ? 0.86 : 0.52), 620);
    var bh = Math.min(H * 0.74, 560);
    var ox = small ? (W - bw) / 2 : W * 0.66 - bw / 2;
    var oy = (H - bh) / 2;
    return { x: ox + n.x * bw, y: oy + n.y * bh };
  }

  function qbez(p0, c, p1, u) {
    var m = 1 - u;
    return {
      x: m * m * p0.x + 2 * m * u * c.x + u * u * p1.x,
      y: m * m * p0.y + 2 * m * u * c.y + u * u * p1.y
    };
  }

  /* Control point for an edge.
     Inside the TCA ring the chord must bow OUT to the circle, or the cycle
     collapses into a crossed mess. Push the chord midpoint radially away from
     the ring centre by twice the sagitta, and the quadratic lands on the arc.
     Everything else gets a gentle, length-independent bow. */
  function control(ida, idb, a, b) {
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (inRing[ida] && inRing[idb]) {
      var c = netXY({ x: TCA_C.x, y: TCA_C.y });
      var vx = mx - c.x, vy = my - c.y;
      var d = Math.hypot(vx, vy) || 1;
      var rr = netXY({ x: TCA_C.x + TCA_C.rx, y: TCA_C.y });
      var R = Math.hypot(rr.x - c.x, rr.y - c.y);
      var out = 2 * (R - d);
      return { x: mx + (vx / d) * out, y: my + (vy / d) * out };
    }
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.hypot(dx, dy) || 1;
    return { x: mx - (dy / len) * len * 0.05, y: my + (dx / len) * len * 0.05 };
  }

  function drawNetwork(p, t, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';

    // edges draw themselves in, staggered
    for (var e = 0; e < EDGES.length; e++) {
      var ed = EDGES[e];
      var a = netXY(N[ed[0]]), b = netXY(N[ed[1]]);
      var flux = ed[3];
      var grow = clamp((p - (e / EDGES.length) * 0.42) / 0.30, 0, 1);
      if (grow <= 0) continue;

      var c0 = control(ed[0], ed[1], a, b);

      ctx.globalAlpha = alpha * (0.16 + 0.30 * flux) * grow;
      ctx.strokeStyle = C.fg;
      ctx.lineWidth = 0.9 + flux * 1.5;
      ctx.beginPath();
      var steps = 20;
      for (var i = 0; i <= steps; i++) {
        var pt = qbez(a, c0, b, (i / steps) * easeOut(grow));
        if (i === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      // flux: particles moving through the reaction, faster where flux is higher
      if (grow > 0.96) {
        var per = 2;
        for (var k = 0; k < per; k++) {
          var u = ((t * (0.10 + flux * 0.18) + k / per + e * 0.13) % 1);
          var fp = qbez(a, c0, b, u);
          ctx.globalAlpha = alpha * (0.5 + 0.5 * Math.sin(u * Math.PI)) * 0.95;
          ctx.fillStyle = C.accent;
          ctx.beginPath();
          ctx.arc(fp.x, fp.y, 1.5 + flux * 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // reaction id, on the higher-flux reactions only, so it never turns to soup.
      // Sits on the outside of the curve, not on top of it.
      if (!small && grow > 0.99 && flux >= 0.58) {
        var lp = qbez(a, c0, b, 0.5);
        var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        var ox = lp.x - mx, oy = lp.y - my;
        var ol = Math.hypot(ox, oy);
        var nx, ny;
        if (ol > 1) { nx = ox / ol; ny = oy / ol; }
        else {
          var ex = b.x - a.x, ey = b.y - a.y, el = Math.hypot(ex, ey) || 1;
          nx = -ey / el; ny = ex / el;
        }
        ctx.globalAlpha = alpha * 0.62;
        ctx.fillStyle = C.mute;
        ctx.font = '500 10px "Roboto Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ed[2], lp.x + nx * 11, lp.y + ny * 11);
      }
    }

    // metabolite nodes
    var pop = band(p, 0.08, 0.60);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    var ids = Object.keys(N);
    for (var n = 0; n < ids.length; n++) {
      var nd = N[ids[n]];
      var pt = netXY(nd);
      var u2 = easeOut(clamp((pop - (n / ids.length) * 0.35) / 0.5, 0, 1));
      if (u2 <= 0) continue;
      var ext = ids[n].slice(-2) === '_e';
      var rr = (ext ? 5.4 : 4.2) * u2;
      var pulse = 1 + Math.sin(t * 1.6 + n) * 0.08;

      ctx.globalAlpha = alpha * u2 * 0.22;
      ctx.fillStyle = ext ? C.accent : C.primary;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, rr * 2.6 * pulse, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = alpha * u2;
      ctx.fillStyle = ext ? C.accent : C.primary;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, rr, 0, Math.PI * 2);
      ctx.fill();

      var lab = band(p, 0.42, 0.75);
      if (lab > 0.02 && !small) {
        // Ring labels go radially OUTWARD. Anchoring them all to the right
        // pushes the left-hand ones into the cycle, on top of the reaction ids.
        var lx = pt.x + rr + 6;
        ctx.textAlign = 'left';
        if (inRing[ids[n]]) {
          var rc = netXY({ x: TCA_C.x, y: TCA_C.y });
          if (pt.x < rc.x - 1) { lx = pt.x - rr - 6; ctx.textAlign = 'right'; }
        }
        ctx.globalAlpha = alpha * lab * 0.92;
        ctx.fillStyle = C.fg;
        ctx.font = '500 10px "Roboto Mono", monospace';
        ctx.fillText(ids[n], lx, pt.y);
      }
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------- captions */
  var kicker = document.getElementById('act-kicker');
  var body = document.getElementById('act-body');
  var statA = document.querySelector('[data-stat="a"]');
  var statB = document.querySelector('[data-stat="b"]');
  var steps = document.querySelectorAll('.scrolly-steps li');
  var bar = document.getElementById('scrolly-bar');

  var ACTS = [
    {
      k: 'Act I · Sequence',
      b: 'It starts as bits. Zeros and ones stream in, pair off into bases, and a genome assembles itself out of pure information.',
      a: 'binary stream', bl: '1 genome'
    },
    {
      k: 'Act II · Pangenome',
      b: 'One genome tells you almost nothing. Compress a hundred thousand of them and the species itself comes into focus: the genes every strain carries, the genes only some do, and the long tail almost nobody has.',
      a: '100,000 genomes', bl: '1 pangenome'
    },
    {
      k: 'Act III · Metabolism',
      b: 'Then every gene becomes a reaction and the pangenome becomes a cell you can run. Flux moves through glycolysis and the TCA cycle, and the model predicts what the organism eats, what it secretes, and which genes it cannot live without.',
      a: '1 pangenome', bl: '12,000 in-silico cells'
    }
  ];

  var shown = -1;
  function setAct(i, p) {
    if (i !== shown) {
      shown = i;
      kicker.textContent = ACTS[i].k;
      body.textContent = ACTS[i].b;
      statB.textContent = ACTS[i].bl;
      for (var s = 0; s < steps.length; s++) steps[s].classList.toggle('is-on', s === i);
    }
    // in act II the genome counter actually counts, which is the whole point
    if (i === 1) {
      var c = Math.round(easeOut(clamp((p - 0.34) / 0.26, 0, 1)) * 100000);
      statA.textContent = c.toLocaleString('en-US') + ' genomes';
    } else if (statA.textContent !== ACTS[i].a) {
      statA.textContent = ACTS[i].a;
    }
  }

  /* ------------------------------------------------------------------ loop */
  function progress() {
    var runway = section.offsetHeight - window.innerHeight;
    if (runway <= 0) return 1;                       // reduced-motion: static end state
    return clamp(-section.getBoundingClientRect().top / runway, 0, 1);
  }

  function frame(p, t) {
    ctx.clearRect(0, 0, W, H);
    // overlapping cross-fades, so the acts transform into each other
    drawHelix(clamp(p / 0.32, 0, 1), t, 1 - band(p, 0.28, 0.38));
    drawPangenome(clamp((p - 0.32) / 0.32, 0, 1), t,
      band(p, 0.28, 0.38) * (1 - band(p, 0.62, 0.72)));
    drawNetwork(clamp((p - 0.62) / 0.38, 0, 1), t, band(p, 0.62, 0.72));

    var act = p < 0.34 ? 0 : p < 0.66 ? 1 : 2;
    setAct(act, p);
    if (bar) bar.style.height = (p * 100).toFixed(1) + '%';
  }

  var visible = false, running = false, start = null;

  function tick(ts) {
    if (!running) return;
    if (start === null) start = ts;
    frame(progress(), (ts - start) / 1000);
    requestAnimationFrame(tick);
  }

  function play() {
    if (running || reduced) return;
    running = true; start = null;
    requestAnimationFrame(tick);
  }
  function pause() { running = false; }

  resize();
  window.addEventListener('resize', function () { resize(); if (reduced) frame(1, 0); });

  if (reduced) {
    // one static frame of the finished network; no loop, no scrub, no dead scroll
    setTimeout(function () { resize(); frame(1, 0); }, 60);
  } else if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      visible = es[0].isIntersecting;
      if (visible) play(); else pause();
    }, { rootMargin: '120px' }).observe(section);
  } else {
    play();
  }
})();
