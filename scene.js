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
  var easeIn = function (u) { return u * u * u; };
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
    C.bad = g('--bad');
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
  /* The TCA bow has to be computed in whatever space the ring is CURRENTLY drawn in.
     Acts IV to VI carry the same ring into the cytoplasm, and a control point that
     still assumes the act III layout would collapse the cycle into a crossed mess
     the moment the network moves. So the mapper is a parameter. */
  function ctrlM(ida, idb, a, b, map) {
    var mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (inRing[ida] && inRing[idb]) {
      var c = map({ x: TCA_C.x, y: TCA_C.y });
      var vx = mx - c.x, vy = my - c.y;
      var d = Math.hypot(vx, vy) || 1;
      var rr = map({ x: TCA_C.x + TCA_C.rx, y: TCA_C.y });
      var R = Math.hypot(rr.x - c.x, rr.y - c.y);
      var out = 2 * (R - d);
      return { x: mx + (vx / d) * out, y: my + (vy / d) * out };
    }
    var dx = b.x - a.x, dy = b.y - a.y;
    var len = Math.hypot(dx, dy) || 1;
    return { x: mx - (dy / len) * len * 0.05, y: my + (dx / len) * len * 0.05 };
  }

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
      // Front-loaded. The old ramp had the first edge still at 40% when the pangenome
      // had already faded to nothing, so the hand-over landed on a bare canvas.
      var grow = clamp((p - (e / EDGES.length) * 0.30) / 0.22, 0, 1);
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

  /* ══════════════════════════════════════════════════════════════════════════
     ACTS IV-VII. The model stops being a diagram and becomes an organism, and
     then an industrial process. Same network throughout — the same BiGG ids, the
     same TCA ring — because that is the point: one object, followed all the way
     from a stream of bits to a vessel you can buy.
     ═════════════════════════════════════════════════════════════════════════ */

  // deterministic, so a scrub back and forth lands on exactly the same frame
  function hsh(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  function capsule(cx, cy, len, rad, ang) {
    var c = Math.cos(ang), s = Math.sin(ang);
    var P = function (x, y) { return { x: cx + x * c - y * s, y: cy + x * s + y * c }; };
    var a = P(-len / 2, -rad), d = P(-len / 2, rad);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(P(len / 2, -rad).x, P(len / 2, -rad).y);
    var e = P(len / 2, 0);
    ctx.arc(e.x, e.y, rad, ang - Math.PI / 2, ang + Math.PI / 2);
    ctx.lineTo(d.x, d.y);
    var f = P(-len / 2, 0);
    ctx.arc(f.x, f.y, rad, ang + Math.PI / 2, ang + Math.PI * 1.5);
    ctx.closePath();
  }

  /* ─────────────── act IV: the network closes into a cell, and swims ────────
     The nodes do not vanish and get replaced by a drawing of a bacterium. They
     CONDENSE into one: every metabolite is carried from where it sat on the map
     to where it sits in the cytoplasm, a membrane closes around them, and the
     thing swims off into a medium it can eat. */
  var MED = [];
  (function () {
    for (var i = 0; i < 54; i++) {
      MED.push({
        x: hsh(i * 1.7), y: hsh(i * 3.3),
        r: 1.4 + hsh(i * 5.1) * 1.8,
        eat: 0.34 + hsh(i * 7.9) * 0.60,        // when the cell gets to it
        ph: hsh(i * 11.3) * 6.283,
        kind: hsh(i * 13.7) < 0.55 ? 0 : 1      // sugar, or something else
      });
    }
  })();

  /* The heading is deliberately kept away from +-pi. A rod that swims through the
     wrap point of atan2 flips end for end in one frame, and worse, the heading has
     to be interpolated to horizontal at the end of the act so that the cell lines
     up with the membrane act V draws. Forcing dx > 0 keeps the angle inside
     (-pi/2, pi/2), where lerping it to zero is safe and monotone. */
  function cellPose(t, spread, straight) {
    var home = small ? W * 0.5 : W * 0.66;
    var cx = home + Math.sin(t * 0.31) * W * 0.13 * spread;
    var cy = H * 0.5 + Math.sin(t * 0.44 + 1.2) * H * 0.13 * spread;
    var dx = 0.62 + Math.abs(Math.cos(t * 0.31)) * 0.38;
    var dy = Math.cos(t * 0.44 + 1.2) * 0.46;
    return { cx: cx, cy: cy, ang: Math.atan2(dy, dx) * (1 - straight) };
  }

  function drawCell(p, t, alpha) {
    if (alpha <= 0.002) return;
    ctx.save();

    var form = easeInOut(clamp(p / 0.34, 0, 1));         // network -> cytoplasm
    var out = easeInOut(clamp((p - 0.20) / 0.38, 0, 1)); // and it pulls back and swims
    var zin = easeInOut(clamp((p - 0.76) / 0.24, 0, 1)); // ...and then we go back in
    var pose = cellPose(t, out * (1 - zin), zin);

    /* It shrinks away as it swims off, then swells straight at the lens as we dive in —
       and it has to land on EXACTLY the membrane act V draws, or the cross-fade is a
       jump cut between two cells of different sizes. So the dive interpolates to act V's
       own geometry rather than to some round number. capsule() adds a cap of `rad` at
       each end, so the straight run is the total minus the two caps. */
    var vW = Math.min(small ? W * 0.42 : W * 0.285, 500) * 2;   // act V's membrane, exactly
    var vH = Math.min(small ? H * 0.34 : H * 0.40, 420) * 2;
    var swim = lerp(S * 0.62, S * 0.30, out);
    var LEN = lerp(swim, vW - vH, zin);                          // straight section
    var RAD = lerp(swim * 0.30, vH / 2, zin);

    // and the map inside it has to arrive at act V's layout too, not get squashed
    var netW = lerp(LEN * 0.74, Math.min(vW * 0.58, 600), zin);
    var netH = lerp(RAD * 1.30, Math.min(vH * 0.70, 545), zin);

    // where a metabolite ends up once the membrane has closed round it
    var inCell = function (n) {
      var c = Math.cos(pose.ang), s = Math.sin(pose.ang);
      var lx = (n.x - 0.5) * netW;
      var ly = (n.y - 0.5) * netH;
      return { x: pose.cx + lx * c - ly * s, y: pose.cy + lx * s + ly * c };
    };
    var at = function (n) {
      var a = netXY(n), b = inCell(n);
      return { x: lerp(a.x, b.x, form), y: lerp(a.y, b.y, form) };
    };

    // ---- the medium it is swimming in
    var medA = alpha * band(p, 0.30, 0.52);
    if (medA > 0.01) {
      for (var i = 0; i < MED.length; i++) {
        var m = MED[i];
        var u = clamp((p - m.eat) / 0.10, 0, 1);        // being taken up
        var fx = m.x * W + Math.sin(t * 0.5 + m.ph) * 7;
        var fy = m.y * H + Math.cos(t * 0.42 + m.ph) * 7;
        var x = lerp(fx, pose.cx, easeIn(u)), y = lerp(fy, pose.cy, easeIn(u));
        ctx.beginPath();
        ctx.arc(x, y, m.r * (1 - u * 0.75), 0, Math.PI * 2);
        ctx.fillStyle = m.kind ? C.accent : C.primary;
        ctx.globalAlpha = medA * (0.30 + 0.42 * Math.sin((m.ph + t * 0.6) % 6.283) * 0.3 + 0.25) * (1 - u);
        ctx.fill();
      }
    }

    // ---- the membrane closing round it
    var mem = alpha * easeOut(clamp((p - 0.10) / 0.28, 0, 1));
    if (mem > 0.01) {
      ctx.globalAlpha = mem * 0.10;
      capsule(pose.cx, pose.cy, LEN, RAD, pose.ang);
      ctx.fillStyle = C.primary;
      ctx.fill();

      ctx.globalAlpha = mem * 0.85;
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = C.fg;
      capsule(pose.cx, pose.cy, LEN, RAD, pose.ang);
      ctx.stroke();

      ctx.globalAlpha = mem * 0.30;                     // the inner leaflet
      ctx.lineWidth = 1;
      capsule(pose.cx, pose.cy, LEN - 7, RAD - 3.5, pose.ang);
      ctx.stroke();

      // a flagellum, because it is not drifting, it is swimming. It goes as we dive in:
      // once the cell has swollen to fill the frame the tail would trail through the
      // cytoplasm, which is both wrong and visible.
      var c = Math.cos(pose.ang), s = Math.sin(pose.ang);
      ctx.beginPath();
      ctx.globalAlpha = mem * 0.5 * (1 - zin);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = C.mute;
      for (var f = 0; f <= 30; f++) {
        var fu = f / 30;
        var lx = -LEN / 2 - fu * LEN * 0.85;
        var ly = Math.sin(fu * 10 - t * 7) * RAD * 0.42 * fu;
        var px = pose.cx + lx * c - ly * s, py = pose.cy + lx * s + ly * c;
        if (f === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // ---- the network itself, carried into the cytoplasm
    ctx.lineCap = 'round';
    for (var e = 0; e < EDGES.length; e++) {
      var E = EDGES[e], a = at(N[E[0]]), b = at(N[E[1]]);
      var cp = ctrlM(E[0], E[1], a, b, at);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(cp.x, cp.y, b.x, b.y);
      ctx.strokeStyle = C.primary;
      ctx.globalAlpha = alpha * (0.55 - 0.30 * form);
      ctx.lineWidth = (1 + E[3] * 2.2) * (1 - 0.45 * form);
      ctx.stroke();
    }
    for (var k in N) {
      var q = at(N[k]);
      ctx.beginPath();
      ctx.arc(q.x, q.y, (2 + (inRing[k] ? 1.4 : 0)) * (1 - 0.35 * form), 0, Math.PI * 2);
      ctx.fillStyle = inRing[k] ? C.accent : C.primary;
      ctx.globalAlpha = alpha * (0.9 - 0.35 * form);
      ctx.fill();
    }
    ctx.restore();
  }

  /* ───────── acts V + VI: inside the cell — uptake, flux, secretion, design ──
     One continuous view. Nutrients dock at transporters in the membrane and cross
     it, the flux runs through the network, and what comes out the other side is
     secreted. Then we engineer it: knock two reactions out, push three, and the
     reductive branch of the TCA RUNS BACKWARDS — which is not a flourish, it is
     how succinate is actually made. Acetate stops. Succinate starts. */
  node('succ_e', 0.99, 0.60);

  /* Every arrow here has to be one a metabolic modeller would sign. Glucose enters
     on the PTS and lands as G6P. Ammonium is assimilated onto 2-oxoglutarate, which
     is what GDH actually does with it. Oxygen is the one that cannot be drawn as a
     mass-flow arrow into any metabolite on this map, because it is not one: it is
     the terminal electron acceptor. So it gets the complex it really docks at - a
     membrane-bound ETC, fed by a dashed electron line off the cycle - and it enters
     on the right, where respiration lives, instead of being faked into a sugar. */
  var UPT = [
    { to: 'g6p_c', label: 'glucose', side: -1, y: 0.20 },
    { to: 'akg_c', label: 'NH₄⁺', side: -1, y: 0.74 }
  ];
  var SEC = [
    { m: 'co2_e', label: 'CO₂', y: 0.12, base: 1, des: 1 },
    { m: 'ac_e', label: 'acetate', y: 0.82, base: 1, des: 0 },
    { m: 'succ_e', label: 'succinate', y: 0.60, base: 0, des: 1 }
  ];
  var ETC = { y: 0.32, from: 'mal__L_c' };      // O₂ + the electrons that reduce it
  var KO = { PYK: 1, ACKr: 1 };                 // knocked out
  var PUSH = { MDH: 1, FUM: 1, SUCDi: 1 };      // and pushed, backwards
  var DES_E = [['succ_c', 'succ_e', 'SUCCtex', 0.9]];

  function drawInside(p, t, alpha, des) {
    if (alpha <= 0.002) return;
    ctx.save();
    ctx.lineCap = 'round';

    /* The cell sits on the same centre line every other act uses (W*0.66 on desktop),
       because that is the only part of the frame the caption card does not cover. An
       earlier cut spanned the full width and put two of the three transporters
       underneath the card, where nobody could see them. */
    var ccx = small ? W * 0.5 : W * 0.66;
    var halfW = Math.min(small ? W * 0.42 : W * 0.285, 500);
    var halfH = Math.min(small ? H * 0.34 : H * 0.40, 420);
    var mx = ccx - halfW, my = H * 0.5 - halfH;
    var mw = halfW * 2, mh = halfH * 2;
    var mr = mh / 2;      // a stadium, not a rounded box: act VII pulls back from the
                          // same silhouette, so the two must be the same shape or the
                          // cross-fade ghosts one outline over the other

    // the medium it is still sitting in, on the other side of the wall
    for (var mi = 0; mi < MED.length; mi++) {
      var mm = MED[mi];
      var ox = mm.x * W + Math.sin(t * 0.5 + mm.ph) * 9;
      var oy = mm.y * H + Math.cos(t * 0.42 + mm.ph) * 9;
      if (ox > mx - 26 && ox < mx + mw + 26 && oy > my - 26 && oy < my + mh + 26) continue;
      ctx.beginPath();
      ctx.arc(ox, oy, mm.r * 0.85, 0, Math.PI * 2);
      ctx.fillStyle = mm.kind ? C.accent : C.primary;
      ctx.globalAlpha = alpha * 0.30;
      ctx.fill();
    }

    // the membrane we are now standing inside
    var mem = function (inset) {
      var x = mx + inset, y = my + inset, w = mw - inset * 2, h = mh - inset * 2;
      var r = Math.min(mr - inset, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.arcTo(x + w, y, x + w, y + r, r);
      ctx.lineTo(x + w, y + h - r);
      ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
      ctx.lineTo(x + r, y + h);
      ctx.arcTo(x, y + h, x, y + h - r, r);
      ctx.lineTo(x, y + r);
      ctx.arcTo(x, y, x + r, y, r);
      ctx.closePath();
    };
    ctx.globalAlpha = alpha * 0.07; mem(0); ctx.fillStyle = C.primary; ctx.fill();
    ctx.globalAlpha = alpha * 0.80; ctx.lineWidth = 2.4; ctx.strokeStyle = C.fg; mem(0); ctx.stroke();
    ctx.globalAlpha = alpha * 0.30; ctx.lineWidth = 1.1; mem(7); ctx.stroke();   // the bilayer

    /* Fit, do not stretch. The first version mapped the network into the membrane
       box, which is close to 2:1, and glycolysis came out as a flat zigzag along the
       floor while the cycle blew up into an empty hoop. This keeps the proportions
       act III established, so the map you learned two acts ago is the same map. */
    var nw = Math.min(mw * 0.58, 600), nh = Math.min(mh * 0.70, 545);
    var IN = function (n) {
      return { x: ccx + (n.x - 0.5) * nw, y: H * 0.5 + (n.y - 0.5) * nh };
    };

    /* The secreted metabolites are pinned to the inside of the membrane, next to the
       pore each one leaves by. Left in the middle of the cytoplasm where the act III
       layout puts them, the picture came out inside-out: a short reaction and a long
       diagonal transport line slashing across the whole map. Acetate is made by ACKr
       in the middle of the cell and then has to travel to the surface, so the long
       line is the reaction and the short hop is the pore. */
    var TERM = {};
    for (var ti = 0; ti < SEC.length; ti++) {
      TERM[SEC[ti].m] = { x: mx + mw - 62, y: my + mh * SEC[ti].y };
    }
    var pos = function (id) { return TERM[id] || IN(N[id]); };

    // ---- reaction state under engineering
    var edges = EDGES.concat(DES_E);
    var st = function (rxn, base) {
      var ko = KO[rxn] ? des : 0;
      var push = PUSH[rxn] ? des : 0;
      var born = rxn === 'SUCCtex' ? des : 1;
      return { f: base * (1 - ko) * (1 + 1.35 * push) * born, ko: ko, push: push, rev: PUSH[rxn] ? des : 0 };
    };

    // ---- edges. glc__D_e is extracellular; in here glucose arrives through the gate.
    for (var e = 0; e < edges.length; e++) {
      var E = edges[e];
      if (E[0] === 'glc__D_e' || E[1] === 'glc__D_e') continue;
      var a = pos(E[0]), b = pos(E[1]), cp = ctrlM(E[0], E[1], a, b, IN);
      var s = st(E[2], E[3]);
      if (s.f <= 0.001 && !s.ko) continue;

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(cp.x, cp.y, b.x, b.y);
      if (s.ko > 0.05) {
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = C.bad;
        ctx.globalAlpha = alpha * 0.55 * s.ko;
        ctx.lineWidth = 1.4;
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = s.push > 0.05 ? C.accent : C.primary;
        ctx.globalAlpha = alpha * (0.30 + 0.40 * s.f);
        ctx.lineWidth = 1 + s.f * 2.6;
      }
      ctx.stroke();
      ctx.setLineDash([]);

      if (s.ko > 0.35) {                       // an X where the reaction used to be
        var mid = qbez(a, cp, b, 0.5), r = 5;
        ctx.beginPath();
        ctx.moveTo(mid.x - r, mid.y - r); ctx.lineTo(mid.x + r, mid.y + r);
        ctx.moveTo(mid.x + r, mid.y - r); ctx.lineTo(mid.x - r, mid.y + r);
        ctx.strokeStyle = C.bad;
        ctx.globalAlpha = alpha * s.ko;
        ctx.lineWidth = 1.8;
        ctx.stroke();
      }

      // flux. The reductive branch runs the other way once we engineer it.
      if (s.f > 0.02) {
        var np = 1 + Math.round(s.f * 2.2);
        for (var q = 0; q < np; q++) {
          var uu = (t * (0.16 + 0.10 * s.f) + e * 0.31 + q / np) % 1;
          if (s.rev > 0.5) uu = 1 - uu;
          var pt = qbez(a, cp, b, uu);
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 1.5 + 1.3 * s.f, 0, Math.PI * 2);
          ctx.fillStyle = s.push > 0.05 ? C.accent : C.primary;
          ctx.globalAlpha = alpha * (0.55 + 0.4 * s.f);
          ctx.fill();
        }
      }
    }

    // ---- metabolites
    for (var k in N) {
      if (k === 'succ_e' && des < 0.05) continue;
      if (k === 'glc__D_e') continue;
      var q2 = pos(k);
      ctx.beginPath();
      ctx.arc(q2.x, q2.y, inRing[k] ? 3.6 : 2.6, 0, Math.PI * 2);
      ctx.fillStyle = inRing[k] ? C.accent : C.primary;
      ctx.globalAlpha = alpha * 0.92;
      ctx.fill();
    }

    // ---- transporters, and what goes through them
    var gate = function (x, y, on, col, tall) {
      var hh = tall ? 17 : 10;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(x - 5.5, y - hh, 11, hh * 2, 3)
                    : ctx.rect(x - 5.5, y - hh, 11, hh * 2);
      ctx.fillStyle = col;
      ctx.globalAlpha = alpha * (0.24 + 0.5 * on);
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.globalAlpha = alpha * (0.55 + 0.4 * on);
      ctx.lineWidth = 1.3;
      ctx.stroke();
    };
    // a metabolite crossing: outside -> pore -> its node, or the reverse
    var ferry = function (gx, gy, nx, ny, dir, n, ph, col, aa) {
      var away = gx + dir * W * 0.075;
      for (var q = 0; q < n; q++) {
        var v = (t * 0.30 + ph + q / n) % 1;
        var x, y;
        if (dir < 0) {                                   // inbound: medium, pore, network
          if (v < 0.42) { x = lerp(away, gx, v / 0.42); y = gy + Math.sin(v * 9 + ph) * 5; }
          else { var w1 = (v - 0.42) / 0.58; x = lerp(gx, nx, w1); y = lerp(gy, ny, w1); }
        } else {                                         // outbound: network, pore, medium
          if (v < 0.58) { var w2 = v / 0.58; x = lerp(nx, gx, w2); y = lerp(ny, gy, w2); }
          else { var w3 = (v - 0.58) / 0.42; x = lerp(gx, away, w3); y = gy + Math.sin(w3 * 9 + ph) * 5; }
        }
        ctx.beginPath();
        ctx.arc(x, y, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.globalAlpha = aa;
        ctx.fill();
      }
    };

    ctx.font = '600 10px "Roboto Mono", monospace';
    ctx.textBaseline = 'middle';

    for (var u = 0; u < UPT.length; u++) {
      var T = UPT[u];
      var gy = my + mh * T.y, tgt = pos(T.to);
      ctx.beginPath();                            // gate -> the reaction it feeds
      ctx.moveTo(mx + 6, gy);
      ctx.lineTo(tgt.x, tgt.y);
      ctx.strokeStyle = C.primary;
      ctx.globalAlpha = alpha * 0.42;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ferry(mx, gy, tgt.x, tgt.y, -1, 3, u * 0.27, C.primary, alpha * 0.9);
      gate(mx, gy, 1, C.primary);
      if (!small) {                              // no room beside the cell on a phone,
        ctx.textAlign = 'right';                 // and the card underneath names them
        ctx.fillStyle = C.mute;
        ctx.globalAlpha = alpha * 0.8;
        ctx.fillText(T.label, mx - 13, gy);
      }
    }

    // the electron transport chain: oxygen docks here, and the cycle feeds it
    var ey = my + mh * ETC.y, esrc = pos(ETC.from), egx = mx + mw;
    ctx.setLineDash([2, 4]);
    ctx.beginPath();
    ctx.moveTo(esrc.x, esrc.y);
    ctx.lineTo(egx - 7, ey);
    ctx.strokeStyle = C.mute;
    ctx.globalAlpha = alpha * 0.5;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.setLineDash([]);
    for (var ee = 0; ee < 3; ee++) {              // electrons down the chain
      var ev = (t * 0.55 + ee / 3) % 1;
      ctx.beginPath();
      ctx.arc(lerp(esrc.x, egx - 7, ev), lerp(esrc.y, ey, ev), 1.7, 0, Math.PI * 2);
      ctx.fillStyle = C.mute;
      ctx.globalAlpha = alpha * 0.75;
      ctx.fill();
    }
    ferry(egx, ey, egx - 7, ey, -1, 2, 0.5, C.primary, alpha * 0.9);
    gate(egx, ey, 1, C.primary, 1);
    if (!small) {
      ctx.textAlign = 'left';
      ctx.fillStyle = C.mute;
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillText('O₂ · ETC', egx + 13, ey);
    }

    for (var sI = 0; sI < SEC.length; sI++) {
      var Sx = SEC[sI];
      var lvl = lerp(Sx.base, Sx.des, des);       // acetate dies, succinate is born
      if (lvl < 0.03) continue;
      var sy = my + mh * Sx.y, src = pos(Sx.m);
      var isNew = Sx.m === 'succ_e';
      var col = isNew ? C.accent : C.primary;
      ctx.beginPath();
      ctx.moveTo(src.x, src.y);
      ctx.lineTo(mx + mw - 6, sy);
      ctx.strokeStyle = col;
      ctx.globalAlpha = alpha * 0.42 * lvl;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      ferry(mx + mw, sy, src.x, src.y, 1, 1 + Math.round(lvl * 2), sI * 0.4, col, alpha * 0.92 * lvl);
      gate(mx + mw, sy, lvl, col);
      if (!small) {
        ctx.textAlign = 'left';
        ctx.fillStyle = isNew ? C.accent : C.mute;
        ctx.globalAlpha = alpha * (0.4 + 0.5 * lvl);
        ctx.fillText(Sx.label, mx + mw + 13, sy);
      }
    }

    // ---- what we just did to it (the card's stat line carries this on a phone)
    if (des > 0.12 && !small) {
      ctx.textAlign = 'left';
      ctx.font = '600 11px "Roboto Mono", monospace';
      var lines = [
        ['✕ PYK, ACKr', C.bad],
        ['↑ MDH, FUM, SUCDi', C.accent],
        ['flux reversed → succinate', C.accent]
      ];
      // in the clear cytoplasm between the wall and the glycolytic chain — the corner
      // of the membrane box is rounded away, so the top-left is medium, not cell
      for (var li = 0; li < lines.length; li++) {
        var la = alpha * band(des, 0.12 + li * 0.20, 0.30 + li * 0.20);
        if (la <= 0.01) continue;
        ctx.fillStyle = lines[li][1];
        ctx.globalAlpha = la * 0.9;
        ctx.fillText(lines[li][0], mx + 46, my + mh * 0.36 + li * 16);
      }
    }
    ctx.restore();
  }

  /* ───────────── act VII: out of the cell, and the honest six decades ───────
     A rod is 2 micrometres. A fermenter is 2 metres. That is a factor of a
     MILLION, and the zoom is logarithmic and real: the field of view is printed
     on screen the whole way out. By the time the vessel is in frame the cells
     are a small fraction of one pixel across, which is why a bioreactor looks like
     nothing but cloudy water — and why the only way to see what is happening in
     there is to have modelled it. */
  var CELL_UM = 2.0;
  function fmtScale(um) {
    if (um < 1000) return Math.round(um) + ' µm';
    if (um < 1e6) return (um / 1000).toFixed(um < 1e4 ? 1 : 0) + ' mm';
    return (um / 1e6).toFixed(2) + ' m';
  }

  function drawScale(p, t, alpha) {
    if (alpha <= 0.002) return;
    ctx.save();

    var cx = small ? W * 0.5 : W * 0.66, cy = H * 0.5;
    var VES_H = 2.0e6, VES_W = 1.25e6;            // a 2 m vessel, in micrometres
    var FOV1 = W * VES_H / (H * 0.62);            // ...framed so it sits in the page

    /* The zoom starts at exactly the size act VI drew the membrane, so the cut from
       inside the cell to outside it lands on the same object at the same size, and
       reaches the vessel at 72% - leaving the last quarter of the act to hold on it
       rather than arriving on the final pixel of the scroll. */
    var halfW0 = Math.min(small ? W * 0.42 : W * 0.285, 500);   // act VI's membrane
    var halfH0 = Math.min(small ? H * 0.34 : H * 0.40, 420);
    var FOV0 = W * CELL_UM / (halfW0 * 2);
    var u = easeInOut(clamp(p / 0.72, 0, 1));
    var fov = Math.pow(10, lerp(Math.log(FOV0) / Math.LN10, Math.log(FOV1) / Math.LN10, u));
    var ppu = W / fov;                            // px per micrometre
    var cellPx = CELL_UM * ppu;
    var rate = 4 * u * (1 - u);                   // fastest through the middle

    /* capsule() takes the length of the STRAIGHT section and then adds a semicircular
       cap of `rad` at each end, so the drawn length is len + 2*rad. Handing it cellPx
       as the length drew every cell 1.6x longer than the 2 um it claims to be, with a
       scale bar printed underneath saying otherwise — which is precisely the promise
       this act exists to keep. The straight run is backed out of the total instead. */
    var KROD = 0.125;                             // E. coli: 2 um long, 0.5 um across
    var K6 = halfH0 / (halfW0 * 2);               // ...and act VI's cutaway, wider
    var rod = function (px, py, total, k, ang) {
      capsule(px, py, total * (1 - 2 * k), total * k, ang);
    };

    // ---- the culture. Individual rods while they are big enough to be rods;
    //      past that it is turbidity, which is the truth.
    var D = 13;                                   // um between cells: a dense culture
    var seen = fov / D;
    if (cellPx > 1.1 && seen < 46) {
      var n = Math.ceil(seen / 2) + 1;
      for (var i = -n; i <= n; i++) {
        for (var j = -Math.ceil(n * H / W) - 1; j <= Math.ceil(n * H / W) + 1; j++) {
          if (i === 0 && j === 0) continue;       // (0,0) is the hero, drawn below
          var wx = (i + hsh(i * 91.7 + j * 13.1) - 0.5) * D;
          var wy = (j + hsh(i * 47.3 + j * 71.9) - 0.5) * D;
          var sx = cx + wx * ppu, sy = cy + wy * ppu;
          if (sx < -cellPx || sx > W + cellPx || sy < -cellPx || sy > H + cellPx) continue;
          rod(sx, sy, cellPx, KROD,
              hsh(i * 7.1 + j * 3.7) * 6.283 + t * 0.25 * (hsh(i + j * 5) - 0.5));
          ctx.fillStyle = C.primary;
          ctx.globalAlpha = alpha * 0.30;
          ctx.fill();
          ctx.strokeStyle = C.fg;
          ctx.globalAlpha = alpha * Math.min(0.7, cellPx * 0.06);
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }

    /* The hero: the cell we were just standing inside. It sits dead centre, unjittered,
       and it opens as the exact stadium act VI drew, so the cut lands on the same object
       at the same size. It carries its map out with it and relaxes into a real rod as it
       shrinks away. Without a guaranteed cell at the origin the act opened on a blank
       field — the lattice hash threw the only cell in frame off-screen. */
    if (cellPx > 1.1) {
      var hk = lerp(K6, KROD, clamp(u * 4, 0, 1));
      var near = clamp((cellPx - 90) / 420, 0, 1);
      rod(cx, cy, cellPx, hk, 0);
      ctx.fillStyle = C.primary;
      ctx.globalAlpha = alpha * (0.30 - 0.16 * near);   // translucent while it is huge
      ctx.fill();
      ctx.strokeStyle = C.fg;
      ctx.globalAlpha = alpha * Math.min(0.75, cellPx * 0.06);
      ctx.lineWidth = 1.2;
      ctx.stroke();

      if (near > 0.02) {                          // its network, until it is unresolvable
        var hnw = cellPx * 0.58, hnh = cellPx * hk * 2 * 0.68;
        var HM = function (nn) {
          return { x: cx + (nn.x - 0.5) * hnw, y: cy + (nn.y - 0.5) * hnh };
        };
        ctx.lineCap = 'round';
        for (var he = 0; he < EDGES.length; he++) {
          var HE = EDGES[he];
          if (HE[0] === 'glc__D_e' || HE[1] === 'glc__D_e') continue;
          var ha = HM(N[HE[0]]), hb = HM(N[HE[1]]);
          var hc = ctrlM(HE[0], HE[1], ha, hb, HM);
          ctx.beginPath();
          ctx.moveTo(ha.x, ha.y);
          ctx.quadraticCurveTo(hc.x, hc.y, hb.x, hb.y);
          ctx.strokeStyle = C.primary;
          ctx.globalAlpha = alpha * near * 0.45;
          ctx.lineWidth = 1 + HE[3] * 1.6;
          ctx.stroke();
        }
        ctx.beginPath();
        for (var hk2 in N) {
          if (hk2 === 'glc__D_e' || hk2 === 'succ_e') continue;
          var hq = HM(N[hk2]);
          ctx.moveTo(hq.x + 2.2, hq.y);
          ctx.arc(hq.x, hq.y, 2.2, 0, Math.PI * 2);
        }
        ctx.fillStyle = C.accent;
        ctx.globalAlpha = alpha * near * 0.55;
        ctx.fill();
      }
    }

    // ---- the vessel it has been living in all along
    var ves = clamp((fov - VES_H * 0.42) / (VES_H * 0.75), 0, 1);
    var vw = VES_W * ppu, vh = VES_H * ppu;
    var vx = cx - vw / 2, vy = cy - vh / 2;
    var r2 = vw * 0.34;
    var vessel = function () {
      ctx.beginPath();
      ctx.moveTo(vx, vy + r2);
      ctx.quadraticCurveTo(vx, vy, vx + r2, vy);           // domed head
      ctx.lineTo(vx + vw - r2, vy);
      ctx.quadraticCurveTo(vx + vw, vy, vx + vw, vy + r2);
      ctx.lineTo(vx + vw, vy + vh - r2 * 1.2);
      ctx.quadraticCurveTo(vx + vw, vy + vh, vx + vw / 2, vy + vh);  // dished bottom
      ctx.quadraticCurveTo(vx, vy + vh, vx, vy + vh - r2 * 1.2);
      ctx.closePath();
    };

    /* Billions of them, each now smaller than a pixel, so what you see is haze. It
       must NOT fade as we pull back: the number of cells in frame grows exactly as
       fast as each one shrinks, so the projected area is conserved and a dense
       culture stays equally cloudy at every zoom. That is the whole point of the act
       - the broth never stops being full of them, you just stop being able to see
       them. Once the tank is in frame the haze IS its contents, so it clips to it. */
    if (cellPx <= 1.1 || seen >= 46) {
      var hz = alpha * clamp((seen - 25) / 40, 0, 1);
      var hr = Math.max(0.95, Math.min(2.4, cellPx * 0.9));
      ctx.save();
      if (ves > 0.02) { vessel(); ctx.clip(); }
      ctx.beginPath();                              // 900 cells, one fill
      for (var k = 0; k < 900; k++) {
        var hx = hsh(k * 2.3) * W, hy = hsh(k * 5.9) * H;
        var rr = hr * (1 + 0.30 * Math.sin(t * 0.8 + k));
        ctx.moveTo(hx + rr, hy);
        ctx.arc(hx, hy, rr, 0, Math.PI * 2);
      }
      ctx.fillStyle = C.primary;
      ctx.globalAlpha = hz * (0.30 + 0.26 * ves);
      ctx.fill();
      ctx.restore();
    }

    // ---- the wormhole. Pulling back, the field converges on the vanishing point,
    //      so the streaks run radially and they are hardest through the middle. Two
    //      batched passes, bright end outward, rather than 150 per-frame gradients.
    if (rate > 0.06) {
      for (var pass = 0; pass < 2; pass++) {
        ctx.beginPath();
        for (var w = 0; w < 150; w++) {
          var a2 = hsh(w * 3.1) * 6.283;
          var ca = Math.cos(a2), sa = Math.sin(a2);
          var r0 = S * (0.04 + hsh(w * 7.7) * 0.66);
          var L = S * 0.02 + rate * S * (0.12 + hsh(w * 11.3) * 0.30);
          var from = pass ? r0 + L * 0.58 : r0;     // second pass = the bright head
          ctx.moveTo(cx + ca * from, cy + sa * from);
          ctx.lineTo(cx + ca * (r0 + L), cy + sa * (r0 + L));
        }
        ctx.strokeStyle = C.primary;
        ctx.globalAlpha = alpha * (pass ? 0.34 : 0.16) * rate;
        ctx.lineWidth = pass ? 1.5 : 1;
        ctx.stroke();
      }
    }

    if (ves > 0.01) {
      // the broth: turbid, and every one of the billions in there is invisible
      var lq = vy + vh * 0.17;                                // the liquid line
      ctx.save();
      vessel(); ctx.clip();
      var grd = ctx.createLinearGradient(vx, lq, vx + vw, vy + vh);
      grd.addColorStop(0, C.dark ? 'rgba(126,158,199,0.26)' : 'rgba(60,90,140,0.16)');
      grd.addColorStop(1, C.dark ? 'rgba(245,165,36,0.20)' : 'rgba(161,98,7,0.13)');
      ctx.globalAlpha = alpha * ves;
      ctx.fillStyle = grd;
      ctx.fillRect(vx, lq, vw, vh);

      // sparged air, rising through it
      ctx.fillStyle = C.fg;
      for (var bb = 0; bb < 26; bb++) {
        var bx = cx + (hsh(bb * 3.9) - 0.5) * vw * 0.72;
        var brise = (t * 0.22 + hsh(bb * 6.1)) % 1;
        var by = lerp(vy + vh * 0.90, lq + 6, brise);
        ctx.beginPath();
        ctx.arc(bx + Math.sin(brise * 7 + bb) * vw * 0.02, by,
                1 + hsh(bb * 9.3) * 2.2, 0, Math.PI * 2);
        ctx.globalAlpha = alpha * ves * 0.30 * (1 - brise * 0.5);
        ctx.fill();
      }
      ctx.restore();

      ctx.globalAlpha = alpha * ves * 0.5;                    // the liquid surface
      ctx.strokeStyle = C.mute;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(vx + vw * 0.02, lq);
      ctx.lineTo(vx + vw * 0.98, lq);
      ctx.stroke();

      vessel();
      ctx.strokeStyle = C.fg;
      ctx.globalAlpha = alpha * ves * 0.85;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.globalAlpha = alpha * ves * 0.5;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = C.mute;
      ctx.beginPath();                                        // impeller shaft
      ctx.moveTo(cx, vy - vh * 0.055);
      ctx.lineTo(cx, vy + vh * 0.82);
      ctx.stroke();
      for (var im = 0; im < 2; im++) {                        // two Rushton turbines
        var iy = vy + vh * (0.50 + im * 0.24);
        var iw = vw * 0.30;
        var spin = Math.abs(Math.cos(t * 2.4));               // seen edge-on, turning
        ctx.beginPath();
        ctx.moveTo(cx - iw, iy); ctx.lineTo(cx + iw, iy);     // the disc
        ctx.stroke();
        ctx.beginPath();
        for (var bl = -2; bl <= 2; bl++) {                    // and its blades
          var bxx = cx + bl * iw * 0.42 * (0.35 + 0.65 * spin);
          ctx.moveTo(bxx, iy - vh * 0.022);
          ctx.lineTo(bxx, iy + vh * 0.022);
        }
        ctx.stroke();
      }
      ctx.beginPath();                                        // motor, on top
      ctx.rect(cx - vw * 0.11, vy - vh * 0.115, vw * 0.22, vh * 0.06);
      ctx.stroke();
      ctx.beginPath();                                        // sparger ring
      ctx.moveTo(cx - vw * 0.22, vy + vh * 0.885);
      ctx.lineTo(cx + vw * 0.22, vy + vh * 0.885);
      ctx.stroke();
      for (var pt = 0; pt < 3; pt++) {                        // ports
        ctx.beginPath();
        ctx.rect(vx - vw * 0.05, vy + vh * (0.26 + pt * 0.19), vw * 0.05, vh * 0.03);
        ctx.stroke();
      }
      ctx.beginPath();                                        // and it stands on legs
      ctx.moveTo(cx - vw * 0.30, vy + vh * 0.93);
      ctx.lineTo(cx - vw * 0.36, vy + vh * 1.05);
      ctx.moveTo(cx + vw * 0.30, vy + vh * 0.93);
      ctx.lineTo(cx + vw * 0.36, vy + vh * 1.05);
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.font = '600 11px "Roboto Mono", monospace';
      ctx.fillStyle = C.mute;
      ctx.globalAlpha = alpha * ves * 0.8;
      // computed, never asserted: the prose used to claim a hundredth of a pixel and
      // the real figure at this framing is a sixteenth of that
      ctx.fillText('2 m bioreactor · one cell is 1/' +
                   Math.round(1 / cellPx).toLocaleString('en-US') + ' of a pixel',
                   cx, vy + vh * 1.13);
    }

    // ---- the scale, printed the whole way out. This is the honest part.
    var barW = W * 0.16;
    var barUm = barW / ppu;
    var pow = Math.pow(10, Math.floor(Math.log(barUm) / Math.LN10));
    var nice = pow * (barUm / pow >= 5 ? 5 : barUm / pow >= 2 ? 2 : 1);
    var bpx = nice * ppu;
    var bx = W * 0.06, by = H - H * 0.10;

    ctx.globalAlpha = alpha * 0.75;
    ctx.strokeStyle = C.fg;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(bx, by); ctx.lineTo(bx + bpx, by);
    ctx.moveTo(bx, by - 5); ctx.lineTo(bx, by + 5);
    ctx.moveTo(bx + bpx, by - 5); ctx.lineTo(bx + bpx, by + 5);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 11px "Roboto Mono", monospace';
    ctx.fillStyle = C.fg;
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillText(fmtScale(nice), bx, by - 12);
    ctx.fillStyle = C.mute;
    ctx.globalAlpha = alpha * 0.65;
    // the field of view only. The camera's zoom factor and the 2 m / 2 µm object ratio
    // are different numbers that both round to "about a million", and printing the two
    // of them a few centimetres apart just invites the reader to ask which one lies.
    ctx.fillText('field of view  ' + fmtScale(fov), bx, by + 20);
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
    },
    {
      k: 'Act IV · The cell',
      b: 'The map is not the point. A membrane closes around the network and it becomes an organism: it swims, it finds sugar in the medium, and it eats. Everything after this is that same network, still running, inside something alive.',
      a: 'a network', bl: 'an organism'
    },
    {
      k: 'Act V · Uptake and secretion',
      b: 'Inside. Nutrients dock at transporters in the membrane and cross it, the flux runs down glycolysis into the TCA cycle, and what the cell cannot use it throws away. Acetate and carbon dioxide go back out through the surface into the medium.',
      a: 'glucose, O₂, NH₄⁺', bl: 'acetate, CO₂'
    },
    {
      k: 'Act VI · Strain design',
      b: 'Now change it. Knock out pyruvate kinase and acetate kinase, push the reductive branch, and the flux through the bottom of the TCA cycle RUNS BACKWARDS. Acetate stops. Succinate starts. This is what the model is for: it tells you which edits to make before you make them.',
      a: '✕ PYK, ACKr · ↑ MDH, FUM', bl: 'succinate'
    },
    {
      k: 'Act VII · Scale',
      b: 'And then pull back. A cell is two micrometres; the vessel it lives in is two metres. That is a factor of a million, and the zoom out is honest the whole way: the field of view is printed on screen, and by the time the fermenter is in frame a cell is a small fraction of a single pixel. A bioreactor looks like cloudy water. Which is exactly why you have to model what is happening inside it.',
      a: '2 µm', bl: '2 m · ×1,000,000'
    }
  ];

  var shown = -1;
  function setAct(i, lp) {
    if (i !== shown) {
      shown = i;
      kicker.textContent = ACTS[i].k;
      body.textContent = ACTS[i].b;
      statB.textContent = ACTS[i].bl;
      for (var s = 0; s < steps.length; s++) steps[s].classList.toggle('is-on', s === i);
    }
    // in act II the genome counter actually counts, which is the whole point
    if (i === 1) {
      var c = Math.round(easeOut(clamp(lp / 0.82, 0, 1)) * 100000);
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

  /* Where each act sits on the runway. Acts V and VI are ONE view — inside the cell,
     before and after we engineer it — so they are drawn by a single call with a
     `design` parameter, not two overlapping ones that would double-draw the network. */
  var CUE = [0, 0.115, 0.235, 0.365, 0.515, 0.655, 0.800, 1.0];

  function frame(p, t) {
    ctx.clearRect(0, 0, W, H);

    /* An act fades OUT over twice the span it fades IN, so the outgoing one lingers
       under the newcomer instead of clearing the stage for it. Every act builds itself
       from nothing over its first fraction, so a symmetric cross-fade hands the frame
       to something that has not drawn itself yet — which is exactly how the canvas came
       up empty between the pangenome and the network. */
    var L = function (i) { return clamp((p - CUE[i]) / (CUE[i + 1] - CUE[i]), 0, 1); };
    var A = function (i) {
      var a = CUE[i], b = CUE[i + 1], w = (b - a) * 0.13;
      var fi = i === 0 ? 1 : band(p, a - w, a + w);
      var fo = i === 6 ? 1 : 1 - band(p, b - w, b + w * 2.0);
      return fi * fo;
    };

    drawHelix(L(0), t, A(0));
    drawPangenome(L(1), t, A(1));
    drawNetwork(L(2), t, A(2));
    drawCell(L(3), t, A(3));

    var ip = clamp((p - CUE[4]) / (CUE[6] - CUE[4]), 0, 1);
    var des = clamp((p - CUE[5]) / (CUE[6] - CUE[5]), 0, 1);
    var w2 = (CUE[5] - CUE[4]) * 0.13;
    var ia = band(p, CUE[4] - w2, CUE[4] + w2) *          // same asymmetry as A(): the cell
             (1 - band(p, CUE[6] - w2, CUE[6] + w2 * 2)); // lingers while act VII pulls back
    drawInside(ip, t, ia, des);

    drawScale(L(6), t, A(6));

    var act = 0;
    for (var i = 6; i >= 0; i--) if (p >= CUE[i]) { act = i; break; }
    setAct(act, L(act));
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
