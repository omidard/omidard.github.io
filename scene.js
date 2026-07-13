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
  function hex2rgb(h) {
    h = (h || '#000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function readTheme() {
    var s = getComputedStyle(document.documentElement);
    var g = function (n) { return s.getPropertyValue(n).trim(); };
    C.fg = g('--fg');
    C.mute = g('--fg-mute');
    C.primary = g('--primary');
    C.accent = g('--accent');
    C.border = g('--border');
    C.bad = g('--bad');
    C.bg = g('--bg');
    C.dark = document.documentElement.getAttribute('data-theme') === 'dark';
    C.rgb = {                              // parsed once per theme, not once per stroke
      fg: hex2rgb(C.fg), mute: hex2rgb(C.mute), primary: hex2rgb(C.primary),
      accent: hex2rgb(C.accent), bad: hex2rgb(C.bad), bg: hex2rgb(C.bg)
    };
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

  /* ══════════════════════════════════════════════════════════════════════════
     THE MAP  ·  acts III to VII all draw this one object

     A real metabolic map, not a sketch of one. Three things separate the two, and
     the first version had none of them:

       - The TCA cycle is a CIRCLE, drawn as arc segments. It used to be an ellipse
         (rx 0.22, ry 0.32) with bezier bows bolted onto each edge, and a bow whose
         bulge is measured along the +x radius is wrong in every direction except
         horizontal — which is exactly why it rendered as a lumpy polygon.
       - Acetyl-CoA condenses ONTO oxaloacetate as a side input, the way an Escher
         map draws it, instead of being a second arrow into citrate dragged across
         the whole diagram.
       - Every reaction carries the cofactor it actually turns over. The little
         cofactor arcs are most of what makes a metabolic map read as a metabolic
         map rather than a node-link toy.
     ══════════════════════════════════════════════════════════════════════════ */

  var TAU = Math.PI * 2;

  /* tier 2 = a branch point you have to name, 1 = on the path, 0 = leaves the cell */
  var N = {};
  function node(id, x, y, tier, label) {
    N[id] = { id: id, x: x, y: y, tier: tier, label: label };
  }

  /* Laid out WIDE, on purpose. A square map forces a square cell, and a square cell
     is a coccus — the first cut of this drew a 1.2:1 blob and called it a bacillus.
     Glycolysis descends on a diagonal instead of a column, the cycle sits to its
     right, and the whole map comes out near 1.4:1, which a proper rod can hold. */
  node('g6p',    0.05, 0.20, 1, 'G6P');
  node('f6p',    0.11, 0.29, 1, 'F6P');
  node('fdp',    0.17, 0.38, 1, 'FBP');
  node('g3p',    0.23, 0.47, 1, 'G3P');
  node('pep',    0.29, 0.56, 2, 'PEP');
  node('pyr',    0.31, 0.78, 2, 'PYR');
  node('accoa',  0.40, 0.69, 2, 'AcCoA');
  node('ac',     0.34, 0.92, 0, 'acetate');
  node('co2',    0.88, 0.12, 0, 'CO₂');
  node('succ_e', 1.02, 0.72, 0, 'succinate');

  // the cycle: eight nodes, 45° apart, oxaloacetate at nine o'clock, running clockwise
  var RING = ['oaa', 'cit', 'icit', 'akg', 'succoa', 'succ', 'fum', 'mal'];
  var RLAB = ['OAA', 'CIT', 'ICIT', 'αKG', 'SucCoA', 'SUC', 'FUM', 'MAL'];
  var TCA_C = { x: 0.72, y: 0.50, r: 0.235 };
  var ANG = {}, RNEXT = {};
  (function () {
    for (var q = 0; q < RING.length; q++) {
      var a = (180 + q * 45) * Math.PI / 180;     // monotone: mal -> oaa needs no wrap
      ANG[RING[q]] = a;
      RNEXT[RING[q]] = RING[(q + 1) % RING.length];
      node(RING[q], TCA_C.x + Math.cos(a) * TCA_C.r,
                    TCA_C.y + Math.sin(a) * TCA_C.r, 1, RLAB[q]);
    }
  })();

  /* from, to, enzyme, flux, cofactor, which side of the arrow it hangs on, bow */
  var RXN = [
    ['g6p',    'f6p',    'PGI', 0.92, '',       0,  0],
    ['f6p',    'fdp',    'PFK', 0.92, 'ATP',   -1,  0],
    ['fdp',    'g3p',    'FBA', 0.92, '',       0,  0],
    ['g3p',    'pep',    'ENO', 0.95, 'NADH',  -1,  0],
    ['pep',    'pyr',    'PYK', 0.80, 'ATP',   -1,  0],
    ['pyr',    'accoa',  'PDH', 0.74, 'NADH',   1,  0],
    ['accoa',  'ac',     'ACK', 0.34, 'ATP',   -1, -0.05],
    ['pep',    'oaa',    'PPC', 0.00, 'CO₂',   -1,  0.07],
    ['oaa',    'cit',    'CS',  0.62, '',       0,  0],
    ['cit',    'icit',   'ACN', 0.60, '',       0,  0],
    ['icit',   'akg',    'ICD', 0.58, 'NADH',   1,  0],
    ['icit',   'co2',    '',    0.26, '',       0,  0.06],
    ['akg',    'succoa', 'KGD', 0.50, 'NADH',   1,  0],
    ['succoa', 'succ',   'SCS', 0.50, 'ATP',    1,  0],
    ['succ',   'fum',    'SDH', 0.48, 'FADH₂',  1,  0],
    ['fum',    'mal',    'FUM', 0.48, '',       0,  0],
    ['mal',    'oaa',    'MDH', 0.48, 'NADH',   1,  0]
  ];
  var SIDE_IN = [{ from: 'accoa', rxn: 'CS' }];        // acetyl-CoA onto oxaloacetate

  /* The engineering. Knock out pyruvate kinase so PEP cannot drain to pyruvate, and
     acetate kinase so the carbon cannot leak out as overflow. Turn ON PEP carboxylase,
     which carboxylates the PEP straight to oxaloacetate. Then run the reductive arm of
     the cycle BACKWARDS: oaa -> mal -> fum -> succ. That is the textbook succinate
     strain, and it is the reason the bottom-left of the ring reverses on screen. */
  var KO   = { PYK: 1, ACK: 1 };
  var ON   = { PPC: 0.86 };                            // dark in the wild type
  var PUSH = { MDH: 1, FUM: 1, SDH: 1 };               // and these three run the other way
  var DES_RXN = [['succ', 'succ_e', 'SUCCt', 0.88, '', 0, 0]];

  /* ---------------------------------------------------------------- colour */
  function RGBA(name, a) {
    var c = C.rgb[name];
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  /* ------------------------------------------------------------- geometry */
  function qbez(p0, c, p1, u) {
    var m = 1 - u;
    return { x: m * m * p0.x + 2 * m * u * c.x + u * u * p1.x,
             y: m * m * p0.y + 2 * m * u * c.y + u * u * p1.y };
  }

  // the map box is SQUARE, so a circle in map space is a circle on screen
  function netXY(n) {
    var bs = Math.min(W * (small ? 0.95 : 0.58), H * 0.90, 720);
    var ox = (small ? W * 0.5 : W * 0.66) - bs / 2, oy = H * 0.5 - bs / 2;
    return { x: ox + n.x * bs, y: oy + n.y * bs };
  }

  function ringGeom(map) {
    var c = map({ x: TCA_C.x, y: TCA_C.y });
    var e = map({ x: TCA_C.x + TCA_C.r, y: TCA_C.y });
    return { x: c.x, y: c.y, r: Math.hypot(e.x - c.x, e.y - c.y) };
  }

  /* An edge is either an arc of the cycle or a quadratic. Both answer at(u) and
     tan(u), so everything downstream — arrowheads, cofactor arcs, flux comets —
     is written once and does not care which it is looking at. */
  function edgeGeom(R, pos, rg, rot) {
    var ia = R[0], ib = R[1];
    if (RNEXT[ia] === ib && !pos.pinned[ia] && !pos.pinned[ib]) {
      var a0 = ANG[ia] + rot, a1 = a0 + Math.PI / 4;
      return {
        ring: true, c: rg, a0: a0, a1: a1,
        at: function (u) {
          var t = a0 + (a1 - a0) * u;
          return { x: rg.x + Math.cos(t) * rg.r, y: rg.y + Math.sin(t) * rg.r };
        },
        tan: function (u) {
          var t = a0 + (a1 - a0) * u;
          return { x: -Math.sin(t), y: Math.cos(t) };
        }
      };
    }
    var a = pos(ia), b = pos(ib);
    var dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    var bow = R[6] || 0;
    var cp = { x: (a.x + b.x) / 2 - dy * bow, y: (a.y + b.y) / 2 + dx * bow };
    return {
      ring: false, a: a, b: b, cp: cp,
      at: function (u) { return qbez(a, cp, b, u); },
      tan: function (u) {
        var m = 1 - u;
        var tx = 2 * m * (cp.x - a.x) + 2 * u * (b.x - cp.x);
        var ty = 2 * m * (cp.y - a.y) + 2 * u * (b.y - cp.y);
        var l = Math.hypot(tx, ty) || 1;
        return { x: tx / l, y: ty / l };
      }
    };
  }

  function trace(g) {
    if (g.ring) {
      var s = g.at(0);
      ctx.moveTo(s.x, s.y);
      ctx.arc(g.c.x, g.c.y, g.c.r, g.a0, g.a1, false);
    } else {
      ctx.moveTo(g.a.x, g.a.y);
      ctx.quadraticCurveTo(g.cp.x, g.cp.y, g.b.x, g.b.y);
    }
  }

  /* ══════════════════════════════════════════════════════════════════════════
     PAINT  ·  one renderer, every act

     o.map      map-space -> screen
     o.alpha    act opacity
     o.t        clock
     o.size     the map's width on screen, in px: everything scales off this and
                detail drops out as it shrinks, so nothing ever draws at 4px
     o.grow     fn(i) -> 0..1, the build-in (act III)
     o.des      0..1, how far the strain design has been applied
     o.pin      { id: {x,y} } — terminals nailed to the membrane, inside the cell
     ══════════════════════════════════════════════════════════════════════════ */
  function paintMap(o) {
    var al = o.alpha, t = o.t, sc = clamp(o.size / 560, 0.34, 1.15);
    var des = o.des || 0;
    var pin = o.pin || {};
    var pos = function (id) { return pin[id] || o.map(N[id]); };
    pos.pinned = pin;
    var rg = ringGeom(o.map);
    var grow = o.grow || function () { return 1; };

    var lab = o.size > 330 && !small;                  // metabolite names
    var det = o.size > 430 && !small;                  // enzymes and cofactors
    var lit = C.dark ? 'lighter' : 'source-over';      // real additive bloom on dark

    var RX = RXN.concat(des > 0.02 ? DES_RXN : []);
    var geo = [], st = [];
    for (var i = 0; i < RX.length; i++) {
      var R = RX[i], nm = R[2];
      var ko = KO[nm] ? des : 0;
      var pu = PUSH[nm] ? des : 0;
      var born = nm === 'SUCCt' ? des : 1;
      var base = ON[nm] !== undefined ? lerp(R[3], ON[nm], des) : R[3];
      geo.push(edgeGeom(R, pos, rg, o.map.ang || 0));
      st.push({
        f: base * (1 - ko) * (1 + 0.55 * pu) * born,
        ko: ko, push: pu, rev: pu > 0.5 ? 1 : 0,
        g: clamp(grow(i), 0, 1)
      });
    }

    // ── 1. bloom. A wide, soft, additive pass under everything: this is the single
    //       biggest difference between a diagram and something that looks lit.
    ctx.globalCompositeOperation = lit;
    for (var i = 0; i < RX.length; i++) {
      var s = st[i];
      if (s.g <= 0.02 || s.f <= 0.02) continue;
      ctx.beginPath();
      trace(geo[i]);
      ctx.strokeStyle = s.push > 0.05 ? RGBA('accent', 0.10 * al * s.f)
                                      : RGBA('primary', 0.09 * al * s.f);
      ctx.lineWidth = (5 + 9 * s.f) * sc;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // ── 2. the reactions themselves
    for (var i = 0; i < RX.length; i++) {
      var R = RX[i], s = st[i], g = geo[i];
      if (s.g <= 0.02) continue;
      if (s.f <= 0.02 && s.ko < 0.05) continue;

      ctx.beginPath();
      if (s.g >= 0.999) {
        trace(g);
      } else {                                        // drawing itself in
        var steps = 16, e0 = easeOut(s.g);
        for (var k = 0; k <= steps; k++) {
          var q = g.at((k / steps) * e0);
          if (k === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y);
        }
      }
      if (s.ko > 0.05) {
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = RGBA('bad', al * 0.5 * s.ko);
        ctx.lineWidth = 1.3 * sc;
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = s.push > 0.05 ? RGBA('accent', al * (0.55 + 0.4 * s.f))
                                        : RGBA('primary', al * (0.45 + 0.4 * s.f));
        ctx.lineWidth = (1.1 + 2.4 * s.f) * sc;
      }
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── 3. arrowheads. A metabolic map without them is a graph, not a pathway.
    ctx.beginPath();
    var headsPush = [];
    for (var i = 0; i < RX.length; i++) {
      var s = st[i], g = geo[i];
      if (s.g < 0.94 || s.f <= 0.03) continue;
      var u = s.rev ? 0.055 : 0.945;
      var p0 = g.at(u), tg = g.tan(u);
      var dir = s.rev ? -1 : 1;
      var hx = tg.x * dir, hy = tg.y * dir;
      var w = (2.4 + 2.0 * s.f) * sc, ln = (6 + 4 * s.f) * sc;
      var tri = [
        p0.x + hx * ln * 0.5, p0.y + hy * ln * 0.5,
        p0.x - hx * ln * 0.5 - hy * w, p0.y - hy * ln * 0.5 + hx * w,
        p0.x - hx * ln * 0.5 + hy * w, p0.y - hy * ln * 0.5 - hx * w
      ];
      if (s.push > 0.05) { headsPush.push(tri); continue; }
      ctx.moveTo(tri[0], tri[1]); ctx.lineTo(tri[2], tri[3]); ctx.lineTo(tri[4], tri[5]);
      ctx.closePath();
    }
    ctx.fillStyle = RGBA('primary', al * 0.85);
    ctx.fill();
    if (headsPush.length) {
      ctx.beginPath();
      for (var i = 0; i < headsPush.length; i++) {
        var q = headsPush[i];
        ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); ctx.lineTo(q[4], q[5]); ctx.closePath();
      }
      ctx.fillStyle = RGBA('accent', al * 0.9);
      ctx.fill();
    }

    // ── 4. cofactor arcs. NADH coming off a dehydrogenase, ATP off a kinase, CO₂ off
    //       a decarboxylase — drawn as the little half-loops an Escher map hangs on
    //       the arrow. This is the detail that makes it read as a real map.
    if (det) {
      ctx.font = '500 8.5px "Roboto Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (var i = 0; i < RX.length; i++) {
        var R = RX[i], s = st[i], g = geo[i];
        if (!R[4] || s.g < 0.9 || s.f <= 0.04) continue;
        var m = g.at(0.5), tg = g.tan(0.5), sd = R[5];
        var nx = -tg.y * sd, ny = tg.x * sd;
        var r = 7 * sc, bulge = 15 * sc;
        ctx.beginPath();
        ctx.moveTo(m.x - tg.x * r, m.y - tg.y * r);
        ctx.quadraticCurveTo(m.x + nx * bulge, m.y + ny * bulge,
                             m.x + tg.x * r, m.y + tg.y * r);
        ctx.strokeStyle = RGBA('mute', al * 0.45);
        ctx.lineWidth = 1 * sc;
        ctx.stroke();
        ctx.fillStyle = RGBA('mute', al * 0.72);
        ctx.fillText(R[4], m.x + nx * (bulge + 8), m.y + ny * (bulge + 8));
      }
    }

    // ── 5. the acetyl-CoA side input, feeding citrate synthase
    if (des < 0.9) {
      for (var i = 0; i < SIDE_IN.length; i++) {
        var S = SIDE_IN[i], target = -1;
        for (var k = 0; k < RX.length; k++) if (RX[k][2] === S.rxn) target = k;
        if (target < 0 || st[target].g < 0.6) continue;
        var from = pos(S.from), m = geo[target].at(0.5);
        var hx = (from.x + m.x) / 2, hy = (from.y + m.y) / 2;
        var px = -(m.y - from.y), py = (m.x - from.x);
        // point the bow away from the ring centre: straight through, it lands on OAA
        var away = (hx - rg.x) * px + (hy - rg.y) * py < 0 ? -0.26 : 0.26;
        var mid = { x: hx + px * away, y: hy + py * away };
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.quadraticCurveTo(mid.x, mid.y, m.x, m.y);
        ctx.strokeStyle = RGBA('primary', al * 0.30 * st[target].f);
        ctx.lineWidth = 1.2 * sc;
        ctx.stroke();
        for (var k = 0; k < 2; k++) {                  // and it flows
          var u = (t * 0.20 + k / 2) % 1;
          var q = qbez(from, mid, m, u);
          ctx.beginPath();
          ctx.arc(q.x, q.y, 1.6 * sc, 0, TAU);
          ctx.fillStyle = RGBA('primary', al * 0.7);
          ctx.fill();
        }
      }
    }

    // ── 6. flux, as light. Tapered comets, not dots: a streak reads as a direction
    //       even in a still frame, and a dot never does.
    if (o.flux !== false) {
      ctx.globalCompositeOperation = lit;
      for (var pass = 0; pass < 2; pass++) {
        var col = pass ? 'accent' : 'primary';
        ctx.beginPath();
        for (var i = 0; i < RX.length; i++) {
          var s = st[i], g = geo[i];
          if (s.g < 0.9 || s.f <= 0.03) continue;
          if ((s.push > 0.05) !== (pass === 1)) continue;
          var np = 1 + Math.round(s.f * 3);
          for (var k = 0; k < np; k++) {
            var u = (t * (0.13 + 0.09 * s.f) + i * 0.37 + k / np) % 1;
            if (s.rev) u = 1 - u;
            var tail = clamp(u - (s.rev ? -0.07 : 0.07), 0, 1);
            var h = g.at(u), l = g.at(tail);
            var dx = h.x - l.x, dy = h.y - l.y, dl = Math.hypot(dx, dy) || 1;
            var nx = -dy / dl, ny = dx / dl;
            var w = (1.2 + 1.5 * s.f) * sc;
            ctx.moveTo(l.x, l.y);
            ctx.lineTo(h.x + nx * w, h.y + ny * w);
            ctx.lineTo(h.x - nx * w, h.y - ny * w);
            ctx.closePath();
          }
        }
        ctx.fillStyle = RGBA(col, al * 0.85);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // ── 7. metabolites. A disc, a rim, and a specular highlight up and to the left,
    //       which is the whole trick that turns a flat circle into a sphere.
    var ids = Object.keys(N);
    var vis = [];
    for (var i = 0; i < ids.length; i++) {
      var nd = N[ids[i]];
      if (ids[i] === 'succ_e' && des < 0.06) continue;
      if (ids[i] === 'glc__D_e') continue;
      var live = 0;
      for (var k = 0; k < RX.length; k++) {
        if ((RX[k][0] === ids[i] || RX[k][1] === ids[i]) && st[k].g > 0.25) { live = 1; break; }
      }
      if (!live) continue;
      vis.push({ n: nd, p: pos(ids[i]) });
    }

    for (var i = 0; i < vis.length; i++) {             // halo, hubs only
      var v = vis[i];
      if (v.n.tier < 2) continue;
      var R0 = 7 * sc, hr = R0 * 3.4;
      var hg = ctx.createRadialGradient(v.p.x, v.p.y, 0, v.p.x, v.p.y, hr);
      hg.addColorStop(0, RGBA('primary', al * 0.24));
      hg.addColorStop(1, RGBA('primary', 0));
      ctx.beginPath();
      ctx.arc(v.p.x, v.p.y, hr, 0, TAU);
      ctx.fillStyle = hg;
      ctx.fill();
    }

    for (var tier = 0; tier <= 2; tier++) {            // discs, batched per tier
      var rr = (tier === 2 ? 5.6 : tier === 1 ? 3.9 : 3.2) * sc;
      ctx.beginPath();
      var any = 0;
      for (var i = 0; i < vis.length; i++) {
        if (vis[i].n.tier !== tier) continue;
        var v = vis[i];
        ctx.moveTo(v.p.x + rr, v.p.y);
        ctx.arc(v.p.x, v.p.y, rr, 0, TAU);
        any = 1;
      }
      if (!any) continue;
      ctx.fillStyle = C.dark ? 'rgba(11,18,32,0.92)' : 'rgba(255,255,255,0.92)';
      ctx.fill();
      ctx.strokeStyle = tier === 0 ? RGBA('mute', al * 0.8) : RGBA('accent', al * 0.95);
      ctx.lineWidth = 1.5 * sc;
      ctx.stroke();
    }

    ctx.beginPath();                                    // the cores
    for (var i = 0; i < vis.length; i++) {
      var v = vis[i], rr = (v.n.tier === 2 ? 2.6 : v.n.tier === 1 ? 1.8 : 1.4) * sc;
      ctx.moveTo(v.p.x + rr, v.p.y);
      ctx.arc(v.p.x, v.p.y, rr, 0, TAU);
    }
    ctx.fillStyle = RGBA('accent', al * 0.95);
    ctx.fill();

    ctx.beginPath();                                    // and the specular
    for (var i = 0; i < vis.length; i++) {
      var v = vis[i], rr = (v.n.tier === 2 ? 5.6 : v.n.tier === 1 ? 3.9 : 3.2) * sc;
      var q = rr * 0.32;
      ctx.moveTo(v.p.x - rr * 0.3 + q, v.p.y - rr * 0.3);
      ctx.arc(v.p.x - rr * 0.3, v.p.y - rr * 0.3, q, 0, TAU);
    }
    ctx.fillStyle = RGBA('fg', al * 0.55);
    ctx.fill();

    // ── 8. type. Ring labels point radially out of the cycle, which is what stops
    //       them colliding with it; everything else hangs off to the side.
    if (lab) {
      ctx.font = '600 9.5px "Roboto Mono", monospace';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = RGBA('fg', al * 0.80);
      for (var i = 0; i < vis.length; i++) {
        var v = vis[i], id = v.n.id;
        if (!v.n.label) continue;
        if (ANG[id] !== undefined) {
          var a = ANG[id], ox = Math.cos(a), oy = Math.sin(a);
          ctx.textAlign = ox < -0.3 ? 'right' : ox > 0.3 ? 'left' : 'center';
          ctx.fillText(v.n.label, v.p.x + ox * 15 * sc, v.p.y + oy * 15 * sc);
        } else if (!pin[id]) {
          var rt = v.n.x > 0.55;
          ctx.textAlign = rt ? 'left' : 'right';
          ctx.fillText(v.n.label, v.p.x + (rt ? 11 : -11) * sc, v.p.y);
        }
      }
    }
    if (det) {                                          // enzyme names, on the arrow
      ctx.font = '500 8.5px "Roboto Mono", monospace';
      ctx.textAlign = 'center';
      for (var i = 0; i < RX.length; i++) {
        var R = RX[i], s = st[i], g = geo[i];
        if (!R[2] || s.g < 0.92) continue;
        if (s.f <= 0.04 && s.ko < 0.3) continue;
        var m = g.at(0.5), tg = g.tan(0.5);
        var sd = R[5] ? -R[5] : 1;                      // opposite the cofactor arc
        var nx = -tg.y * sd, ny = tg.x * sd;
        ctx.fillStyle = s.ko > 0.3 ? RGBA('bad', al * 0.9)
                      : s.push > 0.05 ? RGBA('accent', al * 0.95)
                      : RGBA('mute', al * 0.85);
        ctx.fillText(R[2], m.x + nx * 11 * sc, m.y + ny * 11 * sc);
      }
    }

    // ── 9. and the two cuts, marked where the reaction used to run
    for (var i = 0; i < RX.length; i++) {
      var s = st[i];
      if (s.ko < 0.35) continue;
      var m = geo[i].at(0.5), r = 5.5 * sc;
      ctx.beginPath();
      ctx.moveTo(m.x - r, m.y - r); ctx.lineTo(m.x + r, m.y + r);
      ctx.moveTo(m.x + r, m.y - r); ctx.lineTo(m.x - r, m.y + r);
      ctx.strokeStyle = RGBA('bad', al * s.ko);
      ctx.lineWidth = 2.1 * sc;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  /* ------------------------------------------------- act III: the map alone */
  function drawNetwork(p, t, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    var bs = Math.min(W * (small ? 0.95 : 0.58), H * 0.90, 720);
    paintMap({
      map: netXY, alpha: alpha, t: t, size: bs,
      grow: function (i) { return clamp((p - (i / RXN.length) * 0.30) / 0.22, 0, 1); }
    });
    ctx.restore();
  }

  /* ══════════════════════════════════════════════════════════════════════════
     THE CELL  ·  acts IV to VI

     The first cut drew the organism as a stroked outline with a seven-percent fill,
     which is a wireframe, not a cell. This one is a rendered object: a lit cytoplasm,
     a supercoiled nucleoid, a cytoplasm full of ribosomes, and a gram-negative
     envelope with two leaflets, phospholipid heads and a rim light. The transporters
     are channel proteins sitting in the curved membrane on their own normals, not
     rounded rectangles parked on a straight line.
     ══════════════════════════════════════════════════════════════════════════ */
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

  /* Walk the envelope. u in [0,1) round the perimeter, and it hands back the outward
     normal as well as the point — which is how the lipid heads sit on the surface and
     how a transporter knows which way is out. */
  function capPt(u, len, rad) {
    var per = 2 * len + TAU * rad, d = (u % 1 + 1) % 1 * per, a;
    if (d < len) return { x: -len / 2 + d, y: -rad, nx: 0, ny: -1 };
    d -= len;
    if (d < Math.PI * rad) {
      a = -Math.PI / 2 + d / rad;
      return { x: len / 2 + Math.cos(a) * rad, y: Math.sin(a) * rad,
               nx: Math.cos(a), ny: Math.sin(a) };
    }
    d -= Math.PI * rad;
    if (d < len) return { x: len / 2 - d, y: rad, nx: 0, ny: 1 };
    d -= len;
    a = Math.PI / 2 + d / rad;
    return { x: -len / 2 + Math.cos(a) * rad, y: Math.sin(a) * rad,
             nx: Math.cos(a), ny: Math.sin(a) };
  }

  // a similarity transform: uniform scale + rotation. Never a shear, so the cycle is
  // still a circle no matter which act is looking at it or how far the morph has run.
  function mapper(cx, cy, size, ang) {
    var ca = Math.cos(ang || 0), sa = Math.sin(ang || 0);
    var m = function (n) {
      var lx = (n.x - 0.5) * size, ly = (n.y - 0.5) * size;
      return { x: cx + lx * ca - ly * sa, y: cy + lx * sa + ly * ca };
    };
    m.ang = ang || 0;
    return m;
  }

  function cellMapSize(len, rad) {   // the map is ~0.94 wide x ~0.66 tall of `size`
    return Math.min(rad * 2.35, (len + 2 * rad) * 0.72, 660);
  }

  /* The organism itself. */
  function capBody(cx, cy, len, rad, ang, al, o) {
    var ca = Math.cos(ang), sa = Math.sin(ang);
    var Wx = function (x, y) { return { x: cx + x * ca - y * sa, y: cy + x * sa + y * ca }; };
    var total = len + 2 * rad;
    var det = o.detail === undefined ? 1 : o.detail;
    var k = o.k === undefined ? 1 : o.k;

    // ---- it glows, faintly, into the medium
    var og = ctx.createRadialGradient(cx, cy, rad * 0.85, cx, cy, total * 0.70);
    og.addColorStop(0, RGBA('primary', 0.14 * al));
    og.addColorStop(1, RGBA('primary', 0));
    ctx.beginPath();
    ctx.arc(cx, cy, total * 0.70, 0, TAU);
    ctx.fillStyle = og;
    ctx.fill();

    // ---- cytoplasm, lit from up and to the left
    capsule(cx, cy, len, rad, ang);
    var lp = Wx(-len * 0.26, -rad * 0.45);
    var cg = ctx.createRadialGradient(lp.x, lp.y, rad * 0.06, cx, cy, total * 0.56);
    if (C.dark) {
      cg.addColorStop(0, 'rgba(52,96,152,' + 0.60 * al + ')');
      cg.addColorStop(0.5, 'rgba(26,52,90,' + 0.52 * al + ')');
      cg.addColorStop(1, 'rgba(12,22,42,' + 0.46 * al + ')');
    } else {
      cg.addColorStop(0, 'rgba(232,242,254,' + 0.96 * al + ')');
      cg.addColorStop(0.5, 'rgba(207,223,243,' + 0.88 * al + ')');
      cg.addColorStop(1, 'rgba(184,203,228,' + 0.80 * al + ')');
    }
    ctx.fillStyle = cg;
    ctx.fill();

    if (det > 0.02 && rad > 10) {
      ctx.save();
      capsule(cx, cy, len, rad, ang);
      ctx.clip();

      // ---- the nucleoid. A bacterium keeps its chromosome loose in the cytoplasm,
      //      supercoiled into a mass roughly here, and drawing it is most of why the
      //      inside stops looking like an empty balloon with a diagram in it.
      var nr = Math.min(rad * 0.58, total * 0.16);
      ctx.beginPath();
      for (var q = 0; q <= 72; q++) {
        var a = (q / 72) * TAU;
        var rr = nr * (1 + 0.30 * Math.sin(a * 5 + o.t * 0.16)
                         + 0.15 * Math.sin(a * 9 - o.t * 0.10));
        var pq = Wx(Math.cos(a) * rr * 1.7, Math.sin(a) * rr);
        if (q === 0) ctx.moveTo(pq.x, pq.y); else ctx.lineTo(pq.x, pq.y);
      }
      ctx.closePath();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = RGBA('primary', 0.05 * al * det);   // it is the backdrop the map
      ctx.lineWidth = Math.max(3, rad * 0.10);              // sits on, NOT the subject:
      ctx.stroke();                                         // at rad*0.22 and 0.11 alpha
      ctx.strokeStyle = RGBA('primary', 0.08 * al * det);   // it was an 88px ribbon that
      ctx.lineWidth = Math.max(0.9, rad * 0.022);           // swallowed the whole cell
      ctx.stroke();

      // ---- ribosomes. Texture is what makes it read as full of machinery.
      var nrb = Math.round(clamp(total * 0.45, 30, 440));
      ctx.beginPath();
      for (var q = 0; q < nrb; q++) {
        var px = (hsh(q * 1.7) - 0.5) * (len + rad * 1.5);
        var edge = Math.min(1, Math.pow(Math.abs(px) / (total * 0.5), 6));
        var py = (hsh(q * 4.3) * 2 - 1) * rad * 0.92 * Math.sqrt(1 - edge);
        var rr = 0.5 + hsh(q * 9.1) * 1.5;
        var pq = Wx(px, py);
        ctx.moveTo(pq.x + rr, pq.y);
        ctx.arc(pq.x, pq.y, rr, 0, TAU);
      }
      ctx.fillStyle = RGBA('fg', 0.17 * al * det);
      ctx.fill();
      ctx.restore();
    }

    // ---- the envelope: outer leaflet, periplasm, inner leaflet. The outer one is
    //      rim lit, because one flat stroke of one flat colour is a wireframe.
    var inset = clamp(rad * 0.11, 2.5, 8);
    var g0 = Wx(-total * 0.42, -rad), g1 = Wx(total * 0.42, rad);
    var rl = ctx.createLinearGradient(g0.x, g0.y, g1.x, g1.y);
    rl.addColorStop(0, RGBA('fg', 0.95 * al));
    rl.addColorStop(0.45, RGBA('fg', 0.58 * al));
    rl.addColorStop(1, RGBA('fg', 0.28 * al));
    capsule(cx, cy, len, rad, ang);
    ctx.strokeStyle = rl;
    ctx.lineWidth = Math.max(1.4, 2.6 * k);
    ctx.stroke();

    capsule(cx, cy, len, rad - inset, ang);
    ctx.strokeStyle = RGBA('primary', 0.45 * al);
    ctx.lineWidth = Math.max(0.9, 1.3 * k);
    ctx.stroke();

    // ---- phospholipid heads, on both leaflets
    if (det > 0.15 && rad > 26) {
      var per = 2 * len + TAU * rad;
      var nh = Math.round(clamp(per / 10, 24, 200));
      ctx.beginPath();
      for (var q = 0; q < nh; q++) {
        var pt = capPt(q / nh, len, rad);
        var o1 = Wx(pt.x + pt.nx * 1.1, pt.y + pt.ny * 1.1);
        var o2 = Wx(pt.x - pt.nx * (inset - 1.1), pt.y - pt.ny * (inset - 1.1));
        ctx.moveTo(o1.x + 1.1, o1.y); ctx.arc(o1.x, o1.y, 1.1, 0, TAU);
        ctx.moveTo(o2.x + 1.0, o2.y); ctx.arc(o2.x, o2.y, 1.0, 0, TAU);
      }
      ctx.fillStyle = RGBA('fg', 0.32 * al * det);
      ctx.fill();
    }
  }

  /* ---------------------------------------------------- the medium it lives in */
  var MED = [];
  (function () {
    for (var i = 0; i < 96; i++) {
      MED.push({
        x: hsh(i * 1.7), y: hsh(i * 3.3),
        r: 1.6 + hsh(i * 5.1) * 2.4,
        eat: 0.34 + hsh(i * 7.9) * 0.58,
        ph: hsh(i * 11.3) * TAU,
        kind: hsh(i * 13.7) < 0.55 ? 0 : 1
      });
    }
  })();

  function paintMedium(al, t, keepOut) {
    if (al <= 0.01) return;
    for (var pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      var any = 0;
      for (var i = 0; i < MED.length; i++) {
        var m = MED[i];
        if (m.kind !== pass) continue;
        var x = m.x * W + Math.sin(t * 0.5 + m.ph) * 9;
        var y = m.y * H + Math.cos(t * 0.42 + m.ph) * 9;
        if (keepOut && keepOut(x, y)) continue;
        var r = m.r * (0.85 + 0.15 * Math.sin(t * 0.9 + m.ph));
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
        any = 1;
      }
      if (!any) continue;
      ctx.fillStyle = RGBA(pass ? 'accent' : 'primary', al * 0.55);
      ctx.fill();
    }
  }

  /* ─────────────── act IV: the map closes into a cell, and the cell swims ──────
     The heading is kept away from +-pi on purpose. A rod that swims through the wrap
     point of atan2 flips end for end in one frame, and the heading also has to be
     interpolated to zero at the end of the act so the cell lines up with the membrane
     act V draws. Forcing dx > 0 keeps the angle inside (-pi/2, pi/2), where lerping it
     to zero is safe and monotone. */
  function cellPose(t, spread, straight) {
    var home = small ? W * 0.5 : W * 0.66;
    var cx = home + Math.sin(t * 0.31) * W * 0.13 * spread;
    var cy = H * 0.5 + Math.sin(t * 0.44 + 1.2) * H * 0.13 * spread;
    var dx = 0.62 + Math.abs(Math.cos(t * 0.31)) * 0.38;
    var dy = Math.cos(t * 0.44 + 1.2) * 0.46;
    return { cx: cx, cy: cy, ang: Math.atan2(dy, dx) * (1 - straight) };
  }

  function insideGeom() {                       // act V's cell, to the pixel
    var ccx = small ? W * 0.5 : W * 0.66;
    var total = Math.min(W * (small ? 0.92 : 0.56), 950);
    var rad = Math.min(total / 3.9, H * 0.31);   // a rod, near 2:1, not a blob
    return { cx: ccx, cy: H * 0.5, rad: rad, len: total - rad * 2, total: total };
  }

  /* Where a channel stands, by the angle it faces. Straight-line perimeter fractions
     are unusable on a capsule: the same u lands somewhere different the moment the
     cell changes shape, and the caps are where all six of these actually sit. */
  function gateU(deg, len, rad) {
    var per = 2 * len + TAU * rad;
    var a = ((deg % 360) + 360) % 360;
    if (a < 90 || a > 270) {                                       // right cap
      var r = (a > 270 ? a - 360 : a) + 90;
      return (len + r * Math.PI / 180 * rad) / per;
    }
    return (2 * len + Math.PI * rad + (a - 90) * Math.PI / 180 * rad) / per;
  }

  function drawCell(p, t, alpha) {
    if (alpha <= 0.002) return;
    ctx.save();

    var form = easeInOut(clamp(p / 0.34, 0, 1));         // map -> cytoplasm
    var out = easeInOut(clamp((p - 0.20) / 0.38, 0, 1)); // it pulls back and swims
    var zin = easeInOut(clamp((p - 0.76) / 0.24, 0, 1)); // and then we go back in
    var pose = cellPose(t, out * (1 - zin), zin);
    var V = insideGeom();

    // it shrinks away as it swims off, then swells straight at the lens as we dive in
    // and lands on EXACTLY the membrane act V draws, or the cross-fade is a jump cut
    var swim = lerp(S * 0.60, S * 0.28, out);
    var LEN = lerp(swim, V.len, zin);
    var RAD = lerp(swim * 0.30, V.rad, zin);

    // the medium: it is eating
    var medA = alpha * band(p, 0.26, 0.50) * (1 - zin);
    if (medA > 0.01) {
      for (var i = 0; i < MED.length; i++) {
        var m = MED[i];
        var u = clamp((p - m.eat) / 0.10, 0, 1);
        var fx = m.x * W + Math.sin(t * 0.5 + m.ph) * 8;
        var fy = m.y * H + Math.cos(t * 0.42 + m.ph) * 8;
        var x = lerp(fx, pose.cx, easeIn(u)), y = lerp(fy, pose.cy, easeIn(u));
        var r = m.r * (1 - u * 0.8);
        var gg = ctx.createRadialGradient(x, y, 0, x, y, r * 3.4);
        gg.addColorStop(0, RGBA(m.kind ? 'accent' : 'primary', medA * 0.55 * (1 - u)));
        gg.addColorStop(1, RGBA(m.kind ? 'accent' : 'primary', 0));
        ctx.beginPath();
        ctx.arc(x, y, r * 3.4, 0, TAU);
        ctx.fillStyle = gg;
        ctx.fill();
      }
    }

    capBody(pose.cx, pose.cy, LEN, RAD, pose.ang, alpha,
            { t: t, detail: easeOut(clamp((p - 0.08) / 0.26, 0, 1)), k: lerp(0.8, 1, zin) });

    // a flagellum, because it is not drifting, it is swimming. It goes as we dive in:
    // once the cell fills the frame the tail would trail through the cytoplasm.
    var fl = alpha * easeOut(clamp((p - 0.12) / 0.24, 0, 1)) * (1 - zin);
    if (fl > 0.01) {
      var c = Math.cos(pose.ang), s = Math.sin(pose.ang);
      ctx.beginPath();
      for (var f = 0; f <= 34; f++) {
        var fu = f / 34;
        var lx = -LEN / 2 - RAD - fu * (LEN + RAD * 2) * 0.75;
        var ly = Math.sin(fu * 11 - t * 7) * RAD * 0.5 * fu;
        var px = pose.cx + lx * c - ly * s, py = pose.cy + lx * s + ly * c;
        if (f === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = RGBA('mute', fl * 0.55);
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    /* The map, riding in. The TRANSFORM is interpolated, not the points: lerping the
       mapped coordinates of two different frames gives a general 2x2 matrix, which
       shears, and a sheared circle is an ellipse — so the cycle's arcs would peel away
       from its own nodes for the whole length of the morph. A similarity transform
       cannot shear. */
    var bs = Math.min(W * (small ? 0.95 : 0.58), H * 0.90, 720);
    var netC = { x: small ? W * 0.5 : W * 0.66, y: H * 0.5 };
    var ms = cellMapSize(LEN, RAD);
    var mv = mapper(lerp(netC.x, pose.cx, form), lerp(netC.y, pose.cy, form),
                    lerp(bs, ms, form), pose.ang * form);
    paintMap({ map: mv, alpha: alpha * (1 - 0.15 * form), t: t,
               size: lerp(bs, ms, form) });
    ctx.restore();
  }

  /* ───────── acts V + VI: inside — uptake, flux, secretion, and the design ──────
     One continuous view. Nutrients dock at channels in the membrane and cross it, the
     flux runs through the map, and what the cell cannot use it throws away. Then we
     engineer it, and the reductive arm of the cycle runs backwards.

     Every arrow is one a modeller would sign. Glucose enters on the PTS and lands as
     G6P. Ammonium is assimilated onto 2-oxoglutarate, which is what GDH does with it.
     Oxygen is the one that cannot be drawn as a mass-flow arrow into any metabolite on
     this map, because it is not one: it is the terminal electron acceptor. So it gets
     the complex it really docks at — a membrane-bound ETC, fed by a dashed electron
     line off the cycle — instead of being faked into a sugar. */
  var GATE = [
    { id: 'glc', label: 'glucose',   deg: 190, to: 'g6p', dir: -1, col: 'primary' },
    { id: 'co2', label: 'CO₂',       deg: -58, of: 'co2', dir: 1,  col: 'primary' },
    { id: 'nh4', label: 'NH₄⁺',      deg: -30, to: 'akg', dir: -1, col: 'primary' },
    { id: 'etc', label: 'O₂ · ETC',  deg: -2,  dir: -1,   col: 'primary', etc: 'succ' },
    { id: 'suc', label: 'succinate', deg: 26,  of: 'succ_e', dir: 1, col: 'accent' },
    { id: 'ace', label: 'acetate',   deg: 56,  of: 'ac',  dir: 1,  col: 'primary' }
  ];

  function drawInside(p, t, alpha, des) {
    if (alpha <= 0.002) return;
    ctx.save();

    var V = insideGeom();
    var cx = V.cx, cy = V.cy, LEN = V.len, RAD = V.rad;
    var pt = function (deg) {
      var q = capPt(gateU(deg, LEN, RAD), LEN, RAD);
      return { x: cx + q.x, y: cy + q.y, nx: q.nx, ny: q.ny };   // ang = 0 in here
    };

    // the medium, on the other side of the wall
    paintMedium(alpha * 0.9, t, function (x, y) {
      return Math.abs(x - cx) < V.total * 0.5 + 30 && Math.abs(y - cy) < RAD + 30;
    });

    capBody(cx, cy, LEN, RAD, 0, alpha, { t: t, detail: 1, k: 1 });

    // ---- terminals pinned just inside the pore each one leaves by. Left in the middle
    //      of the cytoplasm the picture comes out inside-out: a short reaction and a
    //      long diagonal transport line slashing across the whole map.
    var pin = {};
    for (var i = 0; i < GATE.length; i++) {
      var G = GATE[i];
      if (!G.of) continue;
      var q = pt(G.deg);
      pin[G.of] = { x: q.x - q.nx * 40, y: q.y - q.ny * 40 };
    }

    var ms = cellMapSize(LEN, RAD);
    var mv = mapper(cx, cy, ms, 0);
    paintMap({ map: mv, alpha: alpha, t: t, size: ms, des: des, pin: pin });

    // ---- the electron transport chain: the cycle feeds it, oxygen docks at it
    var eg = pt(-2), esrc = mv(N.succ);
    ctx.setLineDash([2, 5]);
    ctx.beginPath();
    ctx.moveTo(esrc.x, esrc.y);
    ctx.lineTo(eg.x - eg.nx * 12, eg.y - eg.ny * 12);
    ctx.strokeStyle = RGBA('mute', alpha * 0.5);
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    for (var e = 0; e < 3; e++) {
      var ev = (t * 0.55 + e / 3) % 1;
      var ex = lerp(esrc.x, eg.x - eg.nx * 12, ev), ey = lerp(esrc.y, eg.y - eg.ny * 12, ev);
      ctx.moveTo(ex + 1.8, ey);
      ctx.arc(ex, ey, 1.8, 0, TAU);
    }
    ctx.fillStyle = RGBA('mute', alpha * 0.8);
    ctx.fill();

    // ---- the channels, standing in the membrane on their own normals
    var channel = function (g, on, col) {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.rotate(Math.atan2(g.ny, g.nx));          // +x now points out of the cell
      var th = 10, lh = 9.5, gap = 5;
      var lg = ctx.createLinearGradient(-th, 0, th, 0);
      lg.addColorStop(0, RGBA(col, (0.12 + 0.20 * on) * alpha));
      lg.addColorStop(0.5, RGBA(col, (0.36 + 0.42 * on) * alpha));
      lg.addColorStop(1, RGBA(col, (0.12 + 0.20 * on) * alpha));
      for (var s = -1; s <= 1; s += 2) {
        var yc = s * (gap + lh / 2);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-th, yc - lh / 2, th * 2, lh, 3.2);
        else ctx.rect(-th, yc - lh / 2, th * 2, lh);
        ctx.fillStyle = lg;
        ctx.fill();
        ctx.strokeStyle = RGBA(col, (0.55 + 0.35 * on) * alpha);
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
      if (on > 0.04) {                              // the pore, lit
        var pg = ctx.createRadialGradient(0, 0, 0, 0, 0, 12);
        pg.addColorStop(0, RGBA(col, 0.55 * on * alpha));
        pg.addColorStop(1, RGBA(col, 0));
        ctx.beginPath();
        ctx.arc(0, 0, 12, 0, TAU);
        ctx.fillStyle = pg;
        ctx.fill();
      }
      ctx.restore();
    };

    ctx.font = '600 10px "Roboto Mono", monospace';
    ctx.textBaseline = 'middle';

    for (var i = 0; i < GATE.length; i++) {
      var G = GATE[i], g = pt(G.deg);
      var on = G.id === 'suc' ? des
             : G.id === 'ace' ? lerp(1, 0, des)
             : 1;
      if (on < 0.03) continue;
      var col = G.col;
      var node = G.to ? mv(N[G.to]) : G.of ? pin[G.of] : null;

      if (node) {                                   // the leg from the pore to the map
        var m0 = { x: g.x - g.nx * 9, y: g.y - g.ny * 9 };
        var bx = (m0.x + node.x) / 2, by = (m0.y + node.y) / 2;
        var vx = bx - cx, vy = (by - cy) * 2.2, vl = Math.hypot(vx, vy) || 1;
        var leg = { x: bx + vx / vl * 26, y: by + vy / vl * 26 };   // bows toward the wall
        ctx.beginPath();
        ctx.moveTo(m0.x, m0.y);
        ctx.quadraticCurveTo(leg.x, leg.y, node.x, node.y);
        ctx.strokeStyle = RGBA(col, alpha * 0.42 * on);
        ctx.lineWidth = 1.3;
        ctx.stroke();

        var away = { x: g.x + g.nx * 62, y: g.y + g.ny * 62 };
        var np = G.dir < 0 ? 3 : 1 + Math.round(on * 2);
        ctx.beginPath();
        for (var q = 0; q < np; q++) {
          var v = (t * 0.30 + i * 0.29 + q / np) % 1;
          var px, py;
          if (G.dir < 0) {                          // in: medium, pore, map
            if (v < 0.42) { px = lerp(away.x, g.x, v / 0.42); py = lerp(away.y, g.y, v / 0.42); }
            else { var q1 = qbez(m0, leg, node, (v - 0.42) / 0.58); px = q1.x; py = q1.y; }
          } else {                                  // out: map, pore, medium
            if (v < 0.58) { var q2 = qbez(node, leg, m0, v / 0.58); px = q2.x; py = q2.y; }
            else { var w3 = (v - 0.58) / 0.42; px = lerp(g.x, away.x, w3); py = lerp(g.y, away.y, w3); }
          }
          ctx.moveTo(px + 2.7, py);
          ctx.arc(px, py, 2.7, 0, TAU);
        }
        ctx.fillStyle = RGBA(col, alpha * 0.92 * on);
        ctx.fill();
      } else if (G.etc) {                           // oxygen arriving at the complex
        var away2 = { x: g.x + g.nx * 62, y: g.y + g.ny * 62 };
        ctx.beginPath();
        for (var q = 0; q < 2; q++) {
          var v2 = (t * 0.34 + q / 2) % 1;
          var ox = lerp(away2.x, g.x, v2), oy = lerp(away2.y, g.y, v2);
          ctx.moveTo(ox + 2.7, oy);
          ctx.arc(ox, oy, 2.7, 0, TAU);
        }
        ctx.fillStyle = RGBA(col, alpha * 0.9);
        ctx.fill();
      }

      channel(g, on, col);

      if (!small) {                                 // no room beside a 390px cell, and
        var lx = g.x + g.nx * 26, ly = g.y + g.ny * 26;   // the card underneath names them
        ctx.textAlign = g.nx < -0.25 ? 'right' : g.nx > 0.25 ? 'left' : 'center';
        ctx.fillStyle = col === 'accent' ? RGBA('accent', alpha * on)
                                         : RGBA('mute', alpha * (0.45 + 0.45 * on));
        ctx.fillText(G.label, lx, ly);
      }
    }

    // ---- what we just did to it
    if (des > 0.12 && !small) {
      ctx.textAlign = 'left';
      ctx.font = '600 11px "Roboto Mono", monospace';
      var lines = [
        ['✕ PYK · ✕ ACK', 'bad'],
        ['↑ PPC', 'accent'],
        ['⇄ MDH · FUM · SDH', 'accent'],
        ['→ succinate', 'accent']
      ];
      var lx0 = cx - V.total * 0.5 + 34, ly0 = cy - RAD * 0.62;
      for (var li = 0; li < lines.length; li++) {
        var la = alpha * band(des, 0.10 + li * 0.16, 0.26 + li * 0.16);
        if (la <= 0.01) continue;
        ctx.fillStyle = RGBA(lines[li][1], la * 0.95);
        ctx.fillText(lines[li][0], lx0, ly0 + li * 17);
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
    var V6 = insideGeom();                                     // act VI's cell, exactly
    var FOV0 = W * CELL_UM / V6.total;
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
    var K6 = V6.rad / V6.total;                   // ...and act VI's cutaway, wider
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

      if (near > 0.02) {                          // its map, until it is unresolvable
        var hms = cellMapSize(cellPx * (1 - 2 * hk), cellPx * hk);
        paintMap({ map: mapper(cx, cy, hms, 0), alpha: alpha * near, t: t, size: hms });
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
  var link = document.getElementById('act-link');
  var steps = document.querySelectorAll('.scrolly-steps li');
  var bar = document.getElementById('scrolly-bar');

  /* Every number in here is read off the live data, not off memory:
       4,659 models and 29 gtdb_species  -> panGEMs/gems_metadata.json
       12,340 media                      -> Media/data/index.json  (the repo README still
                                            says 11,367; the README is the stale one)
       9,706 measured rates              -> GrowthDB/data/index.json (n_total_rates)
     The Input/Output chips annotate what is on screen. The prose says what it is built
     out of, and the link goes to the thing itself. */
  var ACTS = [
    {
      k: 'Act I · Sequence',
      b: 'It starts as bits. Zeros and ones pair off into bases and a genome assembles itself out of information. Everything after this point is rebuilt from public assemblies, so anyone can take the same inputs and get the same answer.',
      a: 'binary stream', bl: '1 genome', l: []
    },
    {
      k: 'Act II · Pangenome',
      b: 'One genome tells you almost nothing. Line up every assembly of a species and the species itself comes into focus: the genes each strain carries, the genes it has lost, and the accessory pool it draws on. Behind this site are 4,659 assemblies across 29 GTDB species.',
      a: '4,659 assemblies', bl: '29 pangenomes', l: []
    },
    {
      k: 'Act III · Metabolism',
      b: 'Then every gene becomes a reaction and the pangenome becomes a cell you can run. That is panGEMs: 4,659 genome-scale models, 2,313 Escherichia coli and 2,346 Lactobacillaceae, each one carved from its own genome and browsable strain by strain.',
      a: '29 pangenomes', bl: '4,659 models',
      l: [['panGEMs', 'https://omidard.github.io/panGEMs/']]
    },
    {
      k: 'Act IV · The cell',
      b: 'The map is not the point. A membrane closes around the network and it becomes an organism: it swims, it finds sugar in the medium, and it eats. Every reaction inside it still traces back to a gene through its GPR rule, which is the only reason a knockout means anything.',
      a: 'a model', bl: 'an organism', l: []
    },
    {
      k: 'Act V · Uptake and secretion',
      b: 'Now feed it. The media it eats are digital copies of real ones: Media holds 12,340 of them, the laboratory broths and the food matrices these organisms are actually cultured in, every component mapped to a BiGG exchange and every entry carrying its citation. GrowthDB adds 9,706 measured uptake and secretion rates to bound them.',
      a: 'glucose, O₂, NH₄⁺', bl: 'acetate, CO₂',
      l: [['Media', 'https://omidard.github.io/Media/'],
          ['GrowthDB', 'https://omidard.github.io/GrowthDB/']]
    },
    {
      k: 'Act VI · Strain design',
      b: 'Now change it. Knock out pyruvate kinase so the PEP cannot drain away to pyruvate, knock out acetate kinase so the carbon cannot leak out as overflow, switch on PEP carboxylase, and the reductive arm of the cycle runs backwards into succinate. Flux Studio does this in your browser, on any of the 4,659 models, with no install and no queue.',
      a: '✕ PYK · ✕ ACK · ↑ PPC', bl: 'succinate',
      l: [['Flux Studio', 'https://omidard.github.io/FluxStudio/']]
    },
    {
      k: 'Act VII · Scale',
      b: 'And then pull back. A cell is two micrometres and the vessel it lives in is two metres, and the zoom out is honest the whole way: the field of view is printed on screen, and by the time the fermenter is in frame a cell is a small fraction of a single pixel. A bioreactor looks like cloudy water. Predicting what is going on inside it is the job.',
      a: '2 µm', bl: '2 m · ×1,000,000', l: []
    }
  ];

  var shown = -1;
  function setAct(i, lp) {
    if (i !== shown) {
      shown = i;
      kicker.textContent = ACTS[i].k;
      body.textContent = ACTS[i].b;
      statB.textContent = ACTS[i].bl;
      if (link) {
        link.textContent = '';
        for (var q = 0; q < ACTS[i].l.length; q++) {
          var a = document.createElement('a');
          a.textContent = ACTS[i].l[q][0];
          a.href = ACTS[i].l[q][1];
          a.target = '_blank';
          a.rel = 'noopener';
          link.appendChild(a);
        }
      }
      for (var s = 0; s < steps.length; s++) steps[s].classList.toggle('is-on', s === i);
    }
    // In act II the counter actually counts, which is the whole point. It counts to the
    // assemblies that became the models on this site, not to a round number of nothing.
    if (i === 1) {
      var c = Math.round(easeOut(clamp(lp / 0.82, 0, 1)) * 4659);
      statA.textContent = c.toLocaleString('en-US') + ' assemblies';
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
