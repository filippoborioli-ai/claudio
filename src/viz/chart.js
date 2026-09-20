/* CLAUDIO v3 - viz/chart.js
 * Motore grafico SVG: scale, assi, marche, legenda, tooltip, esportazione.
 * Nessuna dipendenza esterna. Tema chiaro/scuro con palette validata per daltonismo.
 *
 * Uso:
 *   var ch = C3.chart.render(elemento, spec);
 *   ch.update(nuovoSpec);
 */
;(function (root) {
  'use strict';
  var C3 = root.C3 = root.C3 || {};

  /* ===================== PALETTE ===================== */
  var PALETTE = {
    light: {
      surface: '#fcfcfb', plane: '#f9f9f7',
      ink: '#0b0b0b', ink2: '#52514e', muted: '#898781',
      grid: '#e1e0d9', axis: '#c3c2b7',
      series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
      status: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' },
      seq: ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b'],
      divNeutral: '#f0efec'
    },
    dark: {
      surface: '#1a1a19', plane: '#0d0d0d',
      ink: '#ffffff', ink2: '#c3c2b7', muted: '#898781',
      grid: '#2c2c2a', axis: '#383835',
      series: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
      status: { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' },
      seq: ['#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6', '#cde2fb'],
      divNeutral: '#383835'
    }
  };

  function isDark() {
    var t = document.documentElement.getAttribute('data-theme');
    if (t === 'dark') return true;
    if (t === 'light') return false;
    return !!(root.matchMedia && root.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function pal() { return isDark() ? PALETTE.dark : PALETTE.light; }

  /** Colore di serie per indice (ordine fisso, mai ciclato oltre 8: si passa a "Altro"). */
  function seriesColor(i) {
    var p = pal();
    return p.series[i % p.series.length];
  }

  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgbToHex(c) {
    return '#' + c.map(function (v) {
      var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('');
  }
  /** Rampa sequenziale (un solo colore, chiaro -> scuro). t in [0,1]. */
  function seqColor(t) {
    var ramp = pal().seq;
    t = Math.max(0, Math.min(1, t || 0));
    var x = t * (ramp.length - 1);
    var i = Math.floor(x), f = x - i;
    if (i >= ramp.length - 1) return ramp[ramp.length - 1];
    var a = hexToRgb(ramp[i]), b = hexToRgb(ramp[i + 1]);
    return rgbToHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
  }
  /** Rampa divergente blu <-> rosso con neutro grigio al centro. t in [-1,1]. */
  function divColor(t) {
    var p = pal();
    var neutral = hexToRgb(p.divNeutral);
    var pole = hexToRgb(t < 0 ? p.series[0] : p.status.critical);
    var a = Math.min(1, Math.abs(t || 0));
    return rgbToHex([
      neutral[0] + (pole[0] - neutral[0]) * a,
      neutral[1] + (pole[1] - neutral[1]) * a,
      neutral[2] + (pole[2] - neutral[2]) * a
    ]);
  }

  /* ===================== SCALE ===================== */
  function linearScale(domain, range) {
    var d0 = domain[0], d1 = domain[1];
    if (d0 === d1) { d0 -= 0.5; d1 += 0.5; }
    var r0 = range[0], r1 = range[1];
    var f = function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); };
    f.invert = function (px) { return d0 + (px - r0) / (r1 - r0) * (d1 - d0); };
    f.domain = [d0, d1];
    f.range = range;
    f.type = 'linear';
    return f;
  }

  function logScale(domain, range) {
    var d0 = Math.log10(Math.max(1e-12, domain[0]));
    var d1 = Math.log10(Math.max(1e-11, domain[1]));
    var r0 = range[0], r1 = range[1];
    var f = function (v) {
      return r0 + (Math.log10(Math.max(1e-12, v)) - d0) / (d1 - d0) * (r1 - r0);
    };
    f.invert = function (px) { return Math.pow(10, d0 + (px - r0) / (r1 - r0) * (d1 - d0)); };
    f.domain = [domain[0], domain[1]];
    f.range = range;
    f.type = 'log';
    return f;
  }

  function bandScale(categories, range, padding) {
    var n = Math.max(1, categories.length);
    var pad = padding == null ? 0.2 : padding;
    var span = range[1] - range[0];
    var step = span / n;
    var width = step * (1 - pad);
    var f = function (v) {
      var i = typeof v === 'number' ? v : categories.indexOf(String(v));
      if (i < 0) i = 0;
      return range[0] + step * i + step / 2;
    };
    f.bandwidth = width;
    f.step = step;
    f.categories = categories;
    f.invert = function (px) {
      var i = Math.floor((px - range[0]) / step);
      return categories[Math.max(0, Math.min(n - 1, i))];
    };
    f.domain = [0, n - 1];
    f.range = range;
    f.type = 'band';
    return f;
  }

  /** Tick "belli" su scala lineare. */
  function niceTicks(lo, hi, count) {
    count = count || 6;
    if (!(isFinite(lo) && isFinite(hi))) return { ticks: [], lo: 0, hi: 1 };
    if (lo === hi) { lo -= 0.5; hi += 0.5; }
    var span = hi - lo;
    var step = Math.pow(10, Math.floor(Math.log10(span / count)));
    var err = span / (count * step);
    if (err >= 7.5) step *= 10;
    else if (err >= 3.5) step *= 5;
    else if (err >= 1.5) step *= 2;
    var start = Math.ceil(lo / step) * step;
    var ticks = [];
    for (var v = start; v <= hi + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return { ticks: ticks, step: step };
  }

  function logTicks(lo, hi) {
    var out = [];
    var e0 = Math.floor(Math.log10(Math.max(1e-12, lo)));
    var e1 = Math.ceil(Math.log10(Math.max(1e-11, hi)));
    for (var e = e0; e <= e1; e++) {
      [1, 2, 5].forEach(function (m) {
        var v = m * Math.pow(10, e);
        if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
      });
    }
    return { ticks: out };
  }

  /* ===================== UTILITY SVG ===================== */
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] === null || attrs[k] === undefined) return;
        n.setAttribute(k, attrs[k]);
      });
    }
    if (parent) parent.appendChild(n);
    return n;
  }

  function fmtNum(v, digits) {
    if (v == null || (typeof v === 'number' && !isFinite(v))) return '';
    if (typeof v !== 'number') return String(v);
    var a = Math.abs(v);
    if (v === 0) return '0';
    if (a >= 1e6 || a < 1e-4) return v.toExponential(2);
    var d = digits == null ? (a >= 100 ? 1 : (a >= 10 ? 2 : (a >= 1 ? 3 : 4))) : digits;
    var s = v.toFixed(d);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  /* ===================== RENDER ===================== */
  var registry = [];

  /**
   * Disegna un grafico.
   * spec: vedi documentazione in testa al file / plots.js per esempi.
   */
  function render(target, spec) {
    var container = typeof target === 'string' ? document.querySelector(target) : target;
    if (!container) throw new Error('Contenitore del grafico non trovato');
    container.innerHTML = '';
    container.classList.add('c3-chart');

    var state = { container: container, spec: spec };

    function draw() {
      var s = state.spec;
      var p = pal();
      container.innerHTML = '';
      var cw = container.clientWidth || s.width || 640;
      var width = s.width || cw;
      var height = s.height || Math.round(width * (s.aspect || 0.62));
      if (s.maxHeight && height > s.maxHeight) height = s.maxHeight;

      // intestazione
      if (s.title || s.subtitle) {
        var head = document.createElement('div');
        head.className = 'c3-chart-head';
        if (s.title) {
          var h = document.createElement('div');
          h.className = 'c3-chart-title';
          h.textContent = s.title;
          head.appendChild(h);
        }
        if (s.subtitle) {
          var sub = document.createElement('div');
          sub.className = 'c3-chart-sub';
          sub.textContent = s.subtitle;
          head.appendChild(sub);
        }
        container.appendChild(head);
      }

      var wrap = document.createElement('div');
      wrap.className = 'c3-chart-body';
      wrap.style.position = 'relative';
      container.appendChild(wrap);

      var svg = el('svg', {
        width: '100%', height: height, viewBox: '0 0 ' + width + ' ' + height,
        class: 'c3-svg', preserveAspectRatio: 'xMidYMid meet',
        style: 'display:block;overflow:visible'
      }, wrap);
      state.svg = svg;

      var m = Object.assign({ top: 12, right: 18, bottom: 42, left: 58 }, s.margin || {});
      if (s.x && s.x.label) m.bottom += 16;
      if (s.y && s.y.label) m.left += 6;
      var iw = Math.max(40, width - m.left - m.right);
      var ih = Math.max(40, height - m.top - m.bottom);

      // dominio automatico
      var doms = computeDomains(s, iw, ih);
      var xs = doms.xs, ys = doms.ys;
      state.xs = xs; state.ys = ys;

      // sfondo area grafico
      var g = el('g', { transform: 'translate(' + m.left + ',' + m.top + ')' }, svg);
      state.g = g;
      el('rect', {
        x: 0, y: 0, width: iw, height: ih, fill: p.surface,
        stroke: p.grid, 'stroke-width': 1
      }, g);

      // bande di sfondo (zone sigma, regioni di specifica)
      (s.bands || []).forEach(function (b) {
        if (b.orientation === 'v') {
          var x1 = xs(b.from), x2 = xs(b.to);
          el('rect', {
            x: Math.min(x1, x2), y: 0, width: Math.abs(x2 - x1), height: ih,
            fill: b.color || p.grid, opacity: b.opacity == null ? 0.35 : b.opacity
          }, g);
        } else {
          var y1 = ys(b.from), y2 = ys(b.to);
          el('rect', {
            x: 0, y: Math.min(y1, y2), width: iw, height: Math.abs(y2 - y1),
            fill: b.color || p.grid, opacity: b.opacity == null ? 0.35 : b.opacity
          }, g);
        }
      });

      drawAxes(g, s, xs, ys, iw, ih, p);

      // clip per le marche
      var clipId = 'c3clip' + Math.random().toString(36).slice(2, 9);
      var defs = el('defs', null, svg);
      var cp = el('clipPath', { id: clipId }, defs);
      el('rect', { x: -1, y: -1, width: iw + 2, height: ih + 2 }, cp);
      var marks = el('g', { 'clip-path': 'url(#' + clipId + ')' }, g);
      var overlay = el('g', null, g);

      var hoverables = [];
      (s.series || []).forEach(function (series, idx) {
        if (series.hidden) return;
        var color = series.color || seriesColor(series.colorIndex == null ? idx : series.colorIndex);
        drawSeries(marks, series, color, xs, ys, iw, ih, p, hoverables, idx);
      });

      // annotazioni (linee di controllo, limiti di specifica, riferimenti)
      (s.annotations || []).forEach(function (a) {
        drawAnnotation(overlay, a, xs, ys, iw, ih, p);
      });

      // legenda
      var visible = (s.series || []).filter(function (x) { return x.name && !x.hideFromLegend; });
      if (s.legend !== false && visible.length >= 2) {
        var leg = document.createElement('div');
        leg.className = 'c3-legend';
        visible.forEach(function (series, idx) {
          var item = document.createElement('span');
          item.className = 'c3-legend-item' + (series.hidden ? ' off' : '');
          var sw = document.createElement('i');
          sw.style.background = series.color || seriesColor(series.colorIndex == null ? (s.series || []).indexOf(series) : series.colorIndex);
          if (series.type === 'line' && series.dash) sw.style.opacity = 0.7;
          item.appendChild(sw);
          item.appendChild(document.createTextNode(series.name));
          item.onclick = function () {
            series.hidden = !series.hidden;
            draw();
          };
          leg.appendChild(item);
        });
        container.appendChild(leg);
      }

      if (s.note) {
        var note = document.createElement('div');
        note.className = 'c3-chart-note';
        note.textContent = s.note;
        container.appendChild(note);
      }

      // tooltip e crosshair
      if (s.hover !== false && hoverables.length) {
        setupHover(wrap, svg, g, m, iw, ih, hoverables, xs, ys, p, s);
      }

      state.width = width; state.height = height;
      state.inner = { w: iw, h: ih, m: m };
    }

    function redraw() { draw(); }

    draw();

    var api = {
      el: container,
      get spec() { return state.spec; },
      update: function (newSpec) {
        state.spec = typeof newSpec === 'function' ? newSpec(state.spec) : Object.assign({}, state.spec, newSpec);
        draw();
        return api;
      },
      redraw: redraw,
      toSVG: function () {
        return '<?xml version="1.0" encoding="UTF-8"?>\n' +
          new XMLSerializer().serializeToString(state.svg);
      },
      toPNG: function (scale, cb) {
        var svgStr = api.toSVG();
        var img = new Image();
        var svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
        var url = URL.createObjectURL(svgBlob);
        img.onload = function () {
          var k = scale || 2;
          var canvas = document.createElement('canvas');
          canvas.width = state.width * k;
          canvas.height = state.height * k;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = pal().surface;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          cb(canvas.toDataURL('image/png'));
        };
        img.src = url;
      }
    };
    registry.push(api);
    if (registry.length > 400) registry.splice(0, 200);
    return api;
  }

  /** Ridisegna tutti i grafici (cambio tema / resize). */
  function redrawAll() {
    registry.forEach(function (c) {
      if (c.el && document.body.contains(c.el)) {
        try { c.redraw(); } catch (e) { /* grafico obsoleto */ }
      }
    });
  }

  /* ===================== DOMINI ===================== */
  function computeDomains(s, iw, ih) {
    var xvals = [], yvals = [], cats = null;
    (s.series || []).forEach(function (series) {
      if (series.hidden) return;
      collectValues(series, xvals, yvals);
      if (series.categories) cats = series.categories;
    });
    if (s.x && s.x.categories) cats = s.x.categories;

    var xs, ys;
    if (s.x && s.x.type === 'band' && cats) {
      xs = bandScale(cats, [0, iw], s.x.padding);
    } else if (s.x && s.x.type === 'log') {
      var xlo = s.x.domain ? s.x.domain[0] : Math.min.apply(null, xvals.filter(function (v) { return v > 0; })),
        xhi = s.x.domain ? s.x.domain[1] : Math.max.apply(null, xvals);
      xs = logScale([xlo, xhi], [0, iw]);
    } else {
      var dx = (s.x && s.x.domain) || padDomain(xvals, (s.x && s.x.pad) == null ? 0.04 : s.x.pad, s.x && s.x.nice !== false);
      xs = linearScale(dx, [0, iw]);
    }
    (s.annotations || []).forEach(function (a) {
      if (a.type === 'hline' && a.y != null) yvals.push(a.y);
      if (a.type === 'vline' && a.x != null && xs.type !== 'band') xvals.push(a.x);
    });
    (s.bands || []).forEach(function (b) {
      if (b.orientation !== 'v') { yvals.push(b.from); yvals.push(b.to); }
    });
    if (s.y && s.y.type === 'log') {
      var ylo = s.y.domain ? s.y.domain[0] : Math.min.apply(null, yvals.filter(function (v) { return v > 0; })),
        yhi = s.y.domain ? s.y.domain[1] : Math.max.apply(null, yvals);
      ys = logScale([ylo, yhi], [ih, 0]);
    } else {
      var dy = (s.y && s.y.domain) || padDomain(yvals, (s.y && s.y.pad) == null ? 0.08 : s.y.pad, s.y && s.y.nice !== false);
      if (s.y && s.y.includeZero && dy[0] > 0) dy[0] = 0;
      if (s.y && s.y.min != null) dy[0] = s.y.min;
      if (s.y && s.y.max != null) dy[1] = s.y.max;
      ys = linearScale(dy, [ih, 0]);
    }
    return { xs: xs, ys: ys };
  }

  function collectValues(series, xvals, yvals) {
    function pushXY(x, y) {
      if (typeof x === 'number' && isFinite(x)) xvals.push(x);
      if (typeof y === 'number' && isFinite(y)) yvals.push(y);
    }
    (series.points || []).forEach(function (pt) {
      pushXY(pt.x, pt.y);
      if (pt.y0 != null) yvals.push(pt.y0);
      if (pt.y1 != null) yvals.push(pt.y1);
      if (pt.lower != null) yvals.push(pt.lower);
      if (pt.upper != null) yvals.push(pt.upper);
      if (pt.mean != null) yvals.push(pt.mean);
    });
    (series.boxes || []).forEach(function (b) {
      if (typeof b.x === 'number') xvals.push(b.x);
      [b.lo, b.hi, b.q1, b.q3, b.med].forEach(function (v) {
        if (v != null && isFinite(v)) yvals.push(v);
      });
      (b.outliers || []).forEach(function (o) { yvals.push(typeof o === 'number' ? o : o.y); });
    });
    (series.cells || []).forEach(function (c) {
      if (typeof c.x === 'number') xvals.push(c.x);
      if (typeof c.y === 'number') yvals.push(c.y);
    });
    if (series.grid) {
      series.grid.x.forEach(function (v) { xvals.push(v); });
      series.grid.y.forEach(function (v) { yvals.push(v); });
    }
    (series.segments || []).forEach(function (sg) {
      pushXY(sg.x1, sg.y1); pushXY(sg.x2, sg.y2);
    });
  }

  function padDomain(vals, pad, nice) {
    var v = vals.filter(function (x) { return typeof x === 'number' && isFinite(x); });
    if (!v.length) return [0, 1];
    var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v);
    if (lo === hi) { lo -= Math.abs(lo || 1) * 0.1; hi += Math.abs(hi || 1) * 0.1; }
    var span = hi - lo;
    lo -= span * pad; hi += span * pad;
    if (nice) {
      var t = niceTicks(lo, hi, 6);
      if (t.step) {
        lo = Math.floor(lo / t.step) * t.step;
        hi = Math.ceil(hi / t.step) * t.step;
      }
    }
    return [lo, hi];
  }

  /* ===================== ASSI ===================== */
  function drawAxes(g, s, xs, ys, iw, ih, p) {
    var xcfg = s.x || {}, ycfg = s.y || {};
    // asse Y
    var yt = ys.type === 'log' ? logTicks(ys.domain[0], ys.domain[1])
      : niceTicks(ys.domain[0], ys.domain[1], ycfg.ticks || Math.max(3, Math.round(ih / 46)));
    yt.ticks.forEach(function (t) {
      var y = ys(t);
      if (y < -1 || y > ih + 1) return;
      if (ycfg.gridlines !== false) {
        el('line', { x1: 0, y1: y, x2: iw, y2: y, stroke: p.grid, 'stroke-width': 1 }, g);
      }
      el('line', { x1: -4, y1: y, x2: 0, y2: y, stroke: p.axis, 'stroke-width': 1 }, g);
      var lbl = el('text', {
        x: -8, y: y + 4, 'text-anchor': 'end', fill: p.muted,
        'font-size': 11, 'font-variant-numeric': 'tabular-nums'
      }, g);
      lbl.textContent = ycfg.format ? ycfg.format(t) : fmtNum(t);
    });
    // asse X
    if (xs.type === 'band') {
      var cats = xs.categories;
      var skip = Math.ceil(cats.length / Math.max(2, Math.floor(iw / 44)));
      cats.forEach(function (c, i) {
        var x = xs(i);
        if (i % skip !== 0) return;
        el('line', { x1: x, y1: ih, x2: x, y2: ih + 4, stroke: p.axis, 'stroke-width': 1 }, g);
        var rot = xcfg.rotate != null ? xcfg.rotate : (cats.length > 8 && String(c).length > 4 ? -35 : 0);
        var t2 = el('text', {
          x: x, y: ih + (rot ? 14 : 16), fill: p.muted, 'font-size': 11,
          'text-anchor': rot ? 'end' : 'middle',
          transform: rot ? 'rotate(' + rot + ',' + x + ',' + (ih + 14) + ')' : null
        }, g);
        t2.textContent = String(c).length > 14 ? String(c).slice(0, 13) + '…' : c;
      });
    } else {
      var xt = xs.type === 'log' ? logTicks(xs.domain[0], xs.domain[1])
        : niceTicks(xs.domain[0], xs.domain[1], xcfg.ticks || Math.max(3, Math.round(iw / 78)));
      xt.ticks.forEach(function (t) {
        var x = xs(t);
        if (x < -1 || x > iw + 1) return;
        if (xcfg.gridlines) {
          el('line', { x1: x, y1: 0, x2: x, y2: ih, stroke: p.grid, 'stroke-width': 1 }, g);
        }
        el('line', { x1: x, y1: ih, x2: x, y2: ih + 4, stroke: p.axis, 'stroke-width': 1 }, g);
        var lb = el('text', {
          x: x, y: ih + 17, 'text-anchor': 'middle', fill: p.muted,
          'font-size': 11, 'font-variant-numeric': 'tabular-nums'
        }, g);
        lb.textContent = xcfg.format ? xcfg.format(t) : fmtNum(t);
      });
    }
    // linee di base
    el('line', { x1: 0, y1: ih, x2: iw, y2: ih, stroke: p.axis, 'stroke-width': 1 }, g);
    el('line', { x1: 0, y1: 0, x2: 0, y2: ih, stroke: p.axis, 'stroke-width': 1 }, g);
    // etichette assi
    if (xcfg.label) {
      var xl = el('text', {
        x: iw / 2, y: ih + (xs.type === 'band' ? 40 : 36), 'text-anchor': 'middle',
        fill: p.ink2, 'font-size': 12
      }, g);
      xl.textContent = xcfg.label;
    }
    if (ycfg.label) {
      var yl = el('text', {
        x: 0, y: 0, 'text-anchor': 'middle', fill: p.ink2, 'font-size': 12,
        transform: 'translate(' + (-46) + ',' + (ih / 2) + ') rotate(-90)'
      }, g);
      yl.textContent = ycfg.label;
    }
  }

  /* ===================== MARCHE ===================== */
  function drawSeries(g, series, color, xs, ys, iw, ih, p, hoverables, idx) {
    var type = series.type || 'line';
    var sx = function (v) { return xs(v); };
    var sy = function (v) { return ys(v); };

    if (type === 'line' || type === 'step' || type === 'area') {
      // le aree usano y0/y1 (banda), le linee usano y: si accettano entrambe le forme
      var pts = (series.points || []).filter(function (pt) {
        if (pt == null || pt.x == null || !isFinite(pt.x)) return false;
        if (pt.y != null && isFinite(pt.y)) return true;
        return type === 'area' && pt.y0 != null && pt.y1 != null && isFinite(pt.y0) && isFinite(pt.y1);
      });
      if (!pts.length) return;
      if (type === 'area') {
        var dA = '';
        pts.forEach(function (pt, i) {
          dA += (i ? 'L' : 'M') + sx(pt.x) + ',' + sy(pt.y1 != null ? pt.y1 : pt.y) + ' ';
        });
        for (var i2 = pts.length - 1; i2 >= 0; i2--) {
          dA += 'L' + sx(pts[i2].x) + ',' + sy(pts[i2].y0 != null ? pts[i2].y0 : 0) + ' ';
        }
        dA += 'Z';
        el('path', { d: dA, fill: color, opacity: series.opacity == null ? 0.18 : series.opacity, stroke: 'none' }, g);
        if (series.outline !== false) {
          var dL = pts.map(function (pt, i) {
            return (i ? 'L' : 'M') + sx(pt.x) + ',' + sy(pt.y1 != null ? pt.y1 : pt.y);
          }).join(' ');
          el('path', { d: dL, fill: 'none', stroke: color, 'stroke-width': 2 }, g);
        }
      } else {
        var d = '';
        pts.forEach(function (pt, i) {
          var X = sx(pt.x), Y = sy(pt.y);
          if (i === 0) d += 'M' + X + ',' + Y;
          else if (type === 'step') {
            var prev = pts[i - 1];
            d += 'L' + X + ',' + sy(prev.y) + 'L' + X + ',' + Y;
          } else d += 'L' + X + ',' + Y;
        });
        el('path', {
          d: d, fill: 'none', stroke: color,
          'stroke-width': series.width || 2,
          'stroke-dasharray': series.dash || null,
          'stroke-linejoin': 'round', 'stroke-linecap': 'round',
          opacity: series.opacity == null ? 1 : series.opacity
        }, g);
      }
      if (series.marker !== false && type !== 'area') {
        pts.forEach(function (pt) {
          if (pt.y == null || !isFinite(pt.y)) return;
          var col = pt.color || (pt.status ? pal().status[pt.status] : color);
          var r = pt.size || series.markerSize || 4;
          el('circle', {
            cx: sx(pt.x), cy: sy(pt.y), r: r,
            fill: col, stroke: p.surface, 'stroke-width': 1.5
          }, g);
          if (pt.flag) {
            var t = el('text', {
              x: sx(pt.x) + 6, y: sy(pt.y) - 6, fill: pal().status.critical,
              'font-size': 10, 'font-weight': 600
            }, g);
            t.textContent = pt.flag;
          }
        });
      }
      if (series.hover !== false) {
        pts.forEach(function (pt) {
          if (pt.y == null || !isFinite(pt.y)) return;
          hoverables.push({ x: sx(pt.x), y: sy(pt.y), datum: pt, series: series, color: color });
        });
      }
      return;
    }

    if (type === 'points') {
      (series.points || []).forEach(function (pt) {
        if (pt.y == null || !isFinite(pt.y)) return;
        var col = pt.color || (pt.status ? pal().status[pt.status] : color);
        var X = sx(pt.x), Y = sy(pt.y);
        var r = pt.size || series.markerSize || 4.5;
        var shape = pt.shape || series.shape || 'circle';
        if (shape === 'square') {
          el('rect', { x: X - r, y: Y - r, width: 2 * r, height: 2 * r, fill: col, stroke: p.surface, 'stroke-width': 1.5, opacity: series.opacity == null ? 0.95 : series.opacity }, g);
        } else if (shape === 'triangle') {
          el('polygon', { points: [X + ',' + (Y - r * 1.2), (X + r) + ',' + (Y + r * 0.8), (X - r) + ',' + (Y + r * 0.8)].join(' '), fill: col, stroke: p.surface, 'stroke-width': 1.5 }, g);
        } else if (shape === 'x') {
          el('path', { d: 'M' + (X - r) + ',' + (Y - r) + 'L' + (X + r) + ',' + (Y + r) + 'M' + (X + r) + ',' + (Y - r) + 'L' + (X - r) + ',' + (Y + r), stroke: col, 'stroke-width': 2 }, g);
        } else if (shape === 'open') {
          el('circle', { cx: X, cy: Y, r: r, fill: 'none', stroke: col, 'stroke-width': 1.8 }, g);
        } else {
          el('circle', {
            cx: X, cy: Y, r: r, fill: col,
            stroke: p.surface, 'stroke-width': 1.2,
            opacity: series.opacity == null ? 0.9 : series.opacity
          }, g);
        }
        if (pt.label && series.labels !== false) {
          var tl = el('text', { x: X + r + 3, y: Y + 3.5, fill: p.ink2, 'font-size': 10 }, g);
          tl.textContent = pt.label;
        }
        hoverables.push({ x: X, y: Y, datum: pt, series: series, color: col });
      });
      return;
    }

    if (type === 'bars') {
      var horiz = series.orientation === 'h';
      var bw = (xs.type === 'band' ? xs.bandwidth : (series.barWidth || 12));
      var groupCount = series.groupCount || 1, groupIndex = series.groupIndex || 0;
      // con poche categorie la banda e larghissima: si limita la barra e la si centra
      var maxBar = series.maxBarWidth == null ? 72 : series.maxBarWidth;
      if (bw > maxBar * groupCount) bw = maxBar * groupCount;
      var w = bw / groupCount;
      (series.points || []).forEach(function (pt) {
        if (pt.y == null || !isFinite(pt.y)) return;
        var base = pt.y0 != null ? pt.y0 : Math.max(ys.domain[0], Math.min(0, ys.domain[1]));
        var X, Y, W, H;
        if (horiz) {
          var x0 = xs(0), x1 = xs(pt.y);
          Y = ys(pt.x) - bw / 2 + w * groupIndex;
          X = Math.min(x0, x1); W = Math.abs(x1 - x0); H = Math.max(1, w - 2);
        } else {
          var cx = sx(pt.x) - bw / 2 + w * groupIndex;
          var y0 = sy(base), y1 = sy(pt.y);
          X = cx + 1; W = Math.max(1, w - 2);
          Y = Math.min(y0, y1); H = Math.max(1, Math.abs(y1 - y0));
        }
        var col = pt.color || (pt.status ? pal().status[pt.status] : color);
        el('rect', {
          x: X, y: Y, width: W, height: H, fill: col, rx: Math.min(4, W / 3, H / 3),
          opacity: series.opacity == null ? 1 : series.opacity
        }, g);
        if (series.valueLabels) {
          var tv = el('text', {
            x: horiz ? X + W + 4 : X + W / 2,
            y: horiz ? Y + H / 2 + 4 : Y - 4,
            'text-anchor': horiz ? 'start' : 'middle',
            fill: p.ink2, 'font-size': 10, 'font-variant-numeric': 'tabular-nums'
          }, g);
          tv.textContent = fmtNum(pt.y, series.valueDigits);
        }
        hoverables.push({
          x: horiz ? X + W : X + W / 2, y: horiz ? Y + H / 2 : Y,
          datum: pt, series: series, color: col, rect: { x: X, y: Y, w: W, h: H }
        });
      });
      return;
    }

    if (type === 'box') {
      var bwB = xs.type === 'band' ? xs.bandwidth * 0.62 : (series.boxWidth || 26);
      (series.boxes || []).forEach(function (b) {
        var X = sx(b.x);
        var col = b.color || color;
        // baffi
        el('line', { x1: X, y1: sy(b.lo), x2: X, y2: sy(b.q1), stroke: col, 'stroke-width': 1.5 }, g);
        el('line', { x1: X, y1: sy(b.q3), x2: X, y2: sy(b.hi), stroke: col, 'stroke-width': 1.5 }, g);
        el('line', { x1: X - bwB / 4, y1: sy(b.lo), x2: X + bwB / 4, y2: sy(b.lo), stroke: col, 'stroke-width': 1.5 }, g);
        el('line', { x1: X - bwB / 4, y1: sy(b.hi), x2: X + bwB / 4, y2: sy(b.hi), stroke: col, 'stroke-width': 1.5 }, g);
        // scatola
        el('rect', {
          x: X - bwB / 2, y: sy(b.q3), width: bwB, height: Math.max(1, sy(b.q1) - sy(b.q3)),
          fill: col, opacity: 0.22, stroke: col, 'stroke-width': 1.5, rx: 2
        }, g);
        // mediana
        el('line', {
          x1: X - bwB / 2, y1: sy(b.med), x2: X + bwB / 2, y2: sy(b.med),
          stroke: col, 'stroke-width': 2.5
        }, g);
        if (b.mean != null) {
          el('circle', { cx: X, cy: sy(b.mean), r: 3.2, fill: p.surface, stroke: col, 'stroke-width': 1.8 }, g);
        }
        (b.outliers || []).forEach(function (o) {
          var ov = typeof o === 'number' ? o : o.y;
          el('circle', { cx: X, cy: sy(ov), r: 3, fill: 'none', stroke: pal().status.critical, 'stroke-width': 1.5 }, g);
        });
        hoverables.push({ x: X, y: sy(b.med), datum: b, series: series, color: col, box: true });
      });
      return;
    }

    if (type === 'interval') {
      (series.points || []).forEach(function (pt) {
        var X = sx(pt.x);
        var col = pt.color || color;
        if (pt.lower != null && pt.upper != null) {
          el('line', { x1: X, y1: sy(pt.lower), x2: X, y2: sy(pt.upper), stroke: col, 'stroke-width': 2 }, g);
          el('line', { x1: X - 5, y1: sy(pt.lower), x2: X + 5, y2: sy(pt.lower), stroke: col, 'stroke-width': 2 }, g);
          el('line', { x1: X - 5, y1: sy(pt.upper), x2: X + 5, y2: sy(pt.upper), stroke: col, 'stroke-width': 2 }, g);
        }
        var yv = pt.mean != null ? pt.mean : pt.y;
        el('circle', { cx: X, cy: sy(yv), r: 4.5, fill: col, stroke: p.surface, 'stroke-width': 1.5 }, g);
        hoverables.push({ x: X, y: sy(yv), datum: pt, series: series, color: col });
      });
      if (series.connect) {
        var dI = (series.points || []).map(function (pt, i) {
          return (i ? 'L' : 'M') + sx(pt.x) + ',' + sy(pt.mean != null ? pt.mean : pt.y);
        }).join(' ');
        el('path', { d: dI, fill: 'none', stroke: color, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' }, g);
      }
      return;
    }

    if (type === 'segments') {
      (series.segments || []).forEach(function (sg) {
        el('line', {
          x1: sx(sg.x1), y1: sy(sg.y1), x2: sx(sg.x2), y2: sy(sg.y2),
          stroke: sg.color || color, 'stroke-width': sg.width || 1.5,
          'stroke-dasharray': sg.dash || null, opacity: sg.opacity == null ? 1 : sg.opacity
        }, g);
      });
      return;
    }

    if (type === 'heat') {
      var cw2 = series.cellWidth || (xs.type === 'band' ? xs.step : 20);
      var chh = series.cellHeight || 20;
      var vmin = series.vmin, vmax = series.vmax;
      if (vmin == null || vmax == null) {
        var vals = (series.cells || []).map(function (c) { return c.value; }).filter(isFinite);
        vmin = vmin == null ? Math.min.apply(null, vals) : vmin;
        vmax = vmax == null ? Math.max.apply(null, vals) : vmax;
      }
      (series.cells || []).forEach(function (c) {
        var t = (c.value - vmin) / ((vmax - vmin) || 1);
        var col = series.diverging ? divColor(c.value / (Math.max(Math.abs(vmin), Math.abs(vmax)) || 1)) : seqColor(t);
        var X = sx(c.x) - cw2 / 2, Y = sy(c.y) - chh / 2;
        el('rect', {
          x: X + 1, y: Y + 1, width: Math.max(1, cw2 - 2), height: Math.max(1, chh - 2),
          fill: col, rx: 2
        }, g);
        if (series.cellLabels) {
          var lum = hexToRgb(col).reduce(function (a, v) { return a + v; }, 0) / 3;
          var tc = el('text', {
            x: X + cw2 / 2, y: Y + chh / 2 + 4, 'text-anchor': 'middle',
            fill: lum > 140 ? '#0b0b0b' : '#ffffff', 'font-size': 10,
            'font-variant-numeric': 'tabular-nums'
          }, g);
          tc.textContent = c.text != null ? c.text : fmtNum(c.value, 2);
        }
        hoverables.push({ x: X + cw2 / 2, y: Y + chh / 2, datum: c, series: series, color: col });
      });
      return;
    }

    if (type === 'contour') {
      drawContour(g, series, xs, ys, p);
      return;
    }

    if (type === 'surface') {
      drawSurface(g, series, iw, ih, p, color);
      return;
    }

    if (type === 'text') {
      (series.points || []).forEach(function (pt) {
        var t = el('text', {
          x: sx(pt.x), y: sy(pt.y), fill: pt.color || p.ink2,
          'font-size': pt.fontSize || 11, 'text-anchor': pt.anchor || 'middle',
          'font-weight': pt.weight || 400
        }, g);
        t.textContent = pt.text;
      });
      return;
    }
  }

  /* ---------- contour (marching squares) ---------- */
  function drawContour(g, series, xs, ys, p) {
    var grid = series.grid;
    var z = grid.z, X = grid.x, Y = grid.y;
    var nx = X.length, ny = Y.length;
    var zmin = Infinity, zmax = -Infinity;
    z.forEach(function (row) {
      row.forEach(function (v) {
        if (v < zmin) zmin = v;
        if (v > zmax) zmax = v;
      });
    });
    var nLevels = series.levels || 10;
    var levels = [];
    for (var i = 0; i <= nLevels; i++) levels.push(zmin + (zmax - zmin) * i / nLevels);

    // riempimento: celle colorate secondo il valore medio
    if (series.filled !== false) {
      for (var yi = 0; yi < ny - 1; yi++) {
        for (var xi = 0; xi < nx - 1; xi++) {
          var avg = (z[yi][xi] + z[yi][xi + 1] + z[yi + 1][xi] + z[yi + 1][xi + 1]) / 4;
          var t = (avg - zmin) / ((zmax - zmin) || 1);
          var x0 = xs(X[xi]), x1 = xs(X[xi + 1]);
          var y0 = ys(Y[yi]), y1 = ys(Y[yi + 1]);
          el('rect', {
            x: Math.min(x0, x1), y: Math.min(y0, y1),
            width: Math.abs(x1 - x0) + 0.6, height: Math.abs(y1 - y0) + 0.6,
            fill: seqColor(t), stroke: 'none'
          }, g);
        }
      }
    }
    // isolinee
    levels.forEach(function (lev, li) {
      var segs = [];
      for (var yi2 = 0; yi2 < ny - 1; yi2++) {
        for (var xi2 = 0; xi2 < nx - 1; xi2++) {
          var v00 = z[yi2][xi2], v10 = z[yi2][xi2 + 1], v01 = z[yi2 + 1][xi2], v11 = z[yi2 + 1][xi2 + 1];
          var idx = (v00 > lev ? 1 : 0) | (v10 > lev ? 2 : 0) | (v11 > lev ? 4 : 0) | (v01 > lev ? 8 : 0);
          if (idx === 0 || idx === 15) continue;
          var xa = X[xi2], xb = X[xi2 + 1], ya = Y[yi2], yb = Y[yi2 + 1];
          function ip(v1, v2, c1, c2) {
            var t2 = (lev - v1) / ((v2 - v1) || 1e-12);
            return c1 + t2 * (c2 - c1);
          }
          var bottom = { x: ip(v00, v10, xa, xb), y: ya };
          var right = { x: xb, y: ip(v10, v11, ya, yb) };
          var top = { x: ip(v01, v11, xa, xb), y: yb };
          var left = { x: xa, y: ip(v00, v01, ya, yb) };
          var pairs = {
            1: [bottom, left], 2: [bottom, right], 3: [left, right],
            4: [right, top], 5: [bottom, right, left, top], 6: [bottom, top],
            7: [left, top], 8: [left, top], 9: [bottom, top],
            10: [bottom, left, right, top], 11: [right, top], 12: [left, right],
            13: [bottom, right], 14: [bottom, left]
          }[idx];
          if (!pairs) continue;
          for (var q = 0; q + 1 < pairs.length; q += 2) segs.push([pairs[q], pairs[q + 1]]);
        }
      }
      var d = segs.map(function (sg) {
        return 'M' + xs(sg[0].x) + ',' + ys(sg[0].y) + 'L' + xs(sg[1].x) + ',' + ys(sg[1].y);
      }).join(' ');
      if (d) {
        el('path', {
          d: d, fill: 'none',
          stroke: series.filled === false ? seqColor(li / nLevels) : (isDark() ? 'rgba(255,255,255,0.55)' : 'rgba(11,11,11,0.45)'),
          'stroke-width': 1
        }, g);
      }
    });
    series.zmin = zmin; series.zmax = zmax; series.levelValues = levels;
  }

  /* ---------- superficie 3D (proiezione isometrica) ---------- */
  function drawSurface(g, series, iw, ih, p, color) {
    var grid = series.grid, z = grid.z;
    var nx = grid.x.length, ny = grid.y.length;
    var zmin = Infinity, zmax = -Infinity;
    z.forEach(function (r) { r.forEach(function (v) { if (v < zmin) zmin = v; if (v > zmax) zmax = v; }); });
    var rotDeg = series.rotation == null ? 35 : series.rotation;
    var tiltDeg = series.tilt == null ? 28 : series.tilt;
    var rot = rotDeg * Math.PI / 180, tilt = tiltDeg * Math.PI / 180;
    var scale = Math.min(iw, ih) * 0.42;
    var cx = iw / 2, cy = ih * 0.58;
    function proj(i, j, v) {
      var u = (j / (nx - 1) - 0.5) * 2, w = (i / (ny - 1) - 0.5) * 2;
      var h = ((v - zmin) / ((zmax - zmin) || 1) - 0.5) * 1.3;
      var xr = u * Math.cos(rot) - w * Math.sin(rot);
      var yr = u * Math.sin(rot) + w * Math.cos(rot);
      return {
        x: cx + xr * scale,
        y: cy - (h * scale * Math.cos(tilt) * 0.9) + yr * scale * Math.sin(tilt),
        depth: yr
      };
    }
    var quads = [];
    for (var i = 0; i < ny - 1; i++) {
      for (var j = 0; j < nx - 1; j++) {
        var a = proj(i, j, z[i][j]), b = proj(i, j + 1, z[i][j + 1]);
        var c = proj(i + 1, j + 1, z[i + 1][j + 1]), d = proj(i + 1, j, z[i + 1][j]);
        var avg = (z[i][j] + z[i][j + 1] + z[i + 1][j] + z[i + 1][j + 1]) / 4;
        quads.push({
          pts: [a, b, c, d], depth: (a.depth + b.depth + c.depth + d.depth) / 4,
          t: (avg - zmin) / ((zmax - zmin) || 1)
        });
      }
    }
    quads.sort(function (m, n) { return m.depth - n.depth; });
    quads.forEach(function (q) {
      el('polygon', {
        points: q.pts.map(function (pt) { return pt.x + ',' + pt.y; }).join(' '),
        fill: seqColor(q.t), stroke: isDark() ? 'rgba(255,255,255,0.18)' : 'rgba(11,11,11,0.12)',
        'stroke-width': 0.6
      }, g);
    });
    // etichette degli assi del riquadro
    var labels = [
      { pos: proj(0, nx - 1, zmin), text: series.xLabel || '' },
      { pos: proj(ny - 1, 0, zmin), text: series.yLabel || '' }
    ];
    labels.forEach(function (L) {
      if (!L.text) return;
      var t = el('text', { x: L.pos.x, y: L.pos.y + 14, 'text-anchor': 'middle', fill: p.ink2, 'font-size': 11 }, g);
      t.textContent = L.text;
    });
  }

  /* ---------- annotazioni ---------- */
  function drawAnnotation(g, a, xs, ys, iw, ih, p) {
    var col = a.color || (a.kind === 'spec' ? pal().status.critical : (a.kind === 'center' ? pal().status.good : p.ink2));
    if (a.type === 'hline') {
      var y = ys(a.y);
      if (y < -2 || y > ih + 2) return;
      el('line', {
        x1: 0, y1: y, x2: iw, y2: y, stroke: col,
        'stroke-width': a.width || 1.5, 'stroke-dasharray': a.dash || (a.kind === 'center' ? null : '5 3')
      }, g);
      if (a.label) {
        var t = el('text', {
          x: iw - 4, y: y - 4, 'text-anchor': 'end', fill: col,
          'font-size': 10, 'font-weight': 600
        }, g);
        t.textContent = a.label;
      }
      return;
    }
    if (a.type === 'vline') {
      var x = xs(a.x);
      if (x < -2 || x > iw + 2) return;
      el('line', {
        x1: x, y1: 0, x2: x, y2: ih, stroke: col,
        'stroke-width': a.width || 1.2, 'stroke-dasharray': a.dash || '4 3'
      }, g);
      if (a.label) {
        var t2 = el('text', { x: x + 3, y: 11, fill: col, 'font-size': 10 }, g);
        t2.textContent = a.label;
      }
      return;
    }
    if (a.type === 'text') {
      var t3 = el('text', {
        x: a.px != null ? a.px : xs(a.x), y: a.py != null ? a.py : ys(a.y),
        fill: col, 'font-size': a.fontSize || 11, 'text-anchor': a.anchor || 'start',
        'font-weight': a.weight || 400
      }, g);
      t3.textContent = a.text;
      return;
    }
    if (a.type === 'curve') {
      // curva parametrica (es. densità normale sovrapposta)
      var d = (a.points || []).map(function (pt, i) {
        return (i ? 'L' : 'M') + xs(pt.x) + ',' + ys(pt.y);
      }).join(' ');
      el('path', {
        d: d, fill: 'none', stroke: col, 'stroke-width': a.width || 2,
        'stroke-dasharray': a.dash || null
      }, g);
    }
  }

  /* ===================== HOVER / TOOLTIP ===================== */
  function setupHover(wrap, svg, g, m, iw, ih, hoverables, xs, ys, p, spec) {
    var tip = document.createElement('div');
    tip.className = 'c3-tooltip';
    tip.style.display = 'none';
    wrap.appendChild(tip);
    var cross = el('line', {
      x1: 0, y1: 0, x2: 0, y2: ih, stroke: p.muted, 'stroke-width': 1,
      'stroke-dasharray': '3 3', opacity: 0
    }, g);
    var focus = el('circle', { r: 6, fill: 'none', stroke: p.ink, 'stroke-width': 2, opacity: 0 }, g);

    /** Converte le coordinate del puntatore in unità del grafico usando la matrice dell SVG. */
    function toLocal(ev) {
      var pt;
      if (svg.createSVGPoint && svg.getScreenCTM && svg.getScreenCTM()) {
        pt = svg.createSVGPoint();
        pt.x = ev.clientX;
        pt.y = ev.clientY;
        var loc = pt.matrixTransform(svg.getScreenCTM().inverse());
        return { x: loc.x - m.left, y: loc.y - m.top };
      }
      // ripiego se la matrice non è disponibile (ambienti senza layout)
      var rect = svg.getBoundingClientRect();
      var sx = (iw + m.left + m.right) / (rect.width || 1);
      var sy = (ih + m.top + m.bottom) / (rect.height || 1);
      return { x: (ev.clientX - rect.left) * sx - m.left, y: (ev.clientY - rect.top) * sy - m.top };
    }

    function onMove(ev) {
      var rect = svg.getBoundingClientRect();
      var local = toLocal(ev);
      var mx = local.x, my = local.y;
      var best = null, bd = Infinity;
      hoverables.forEach(function (h) {
        var dx = h.x - mx, dy = h.y - my;
        var d = h.rect
          ? (mx >= h.rect.x - 2 && mx <= h.rect.x + h.rect.w + 2 && my >= h.rect.y - 2 && my <= h.rect.y + h.rect.h + 2 ? 0 : Math.sqrt(dx * dx + dy * dy))
          : Math.sqrt(dx * dx + dy * dy);
        if (d < bd) { bd = d; best = h; }
      });
      if (!best || bd > 60) {
        tip.style.display = 'none';
        cross.setAttribute('opacity', 0);
        focus.setAttribute('opacity', 0);
        return;
      }
      cross.setAttribute('x1', best.x);
      cross.setAttribute('x2', best.x);
      cross.setAttribute('opacity', 0.6);
      focus.setAttribute('cx', best.x);
      focus.setAttribute('cy', best.y);
      focus.setAttribute('opacity', 0.85);
      tip.innerHTML = tooltipHTML(best, spec, xs, ys);
      tip.style.display = 'block';
      var tw = tip.offsetWidth, th = tip.offsetHeight;
      // posizione del punto sullo schermo, ricavata dalla stessa matrice
      var px, py;
      if (svg.createSVGPoint && svg.getScreenCTM && svg.getScreenCTM()) {
        var p2 = svg.createSVGPoint();
        p2.x = best.x + m.left;
        p2.y = best.y + m.top;
        var scr = p2.matrixTransform(svg.getScreenCTM());
        px = scr.x - rect.left;
        py = scr.y - rect.top;
      } else {
        px = (best.x + m.left) * rect.width / (iw + m.left + m.right);
        py = (best.y + m.top) * rect.height / (ih + m.top + m.bottom);
      }
      tip.style.left = Math.max(2, Math.min(Math.max(2, rect.width - tw - 2), px + 12)) + 'px';
      tip.style.top = Math.max(2, py - th - 10) + 'px';
    }
    svg.addEventListener('mousemove', onMove);
    svg.addEventListener('mouseleave', function () {
      tip.style.display = 'none';
      cross.setAttribute('opacity', 0);
      focus.setAttribute('opacity', 0);
    });
  }

  function tooltipHTML(h, spec, xs, ys) {
    var d = h.datum, s = h.series;
    if (s.tooltip) return s.tooltip(d, h);
    var rows = [];
    var xLab = (spec.x && spec.x.label) || 'X';
    var yLab = (spec.y && spec.y.label) || 'Y';
    if (h.box) {
      rows.push(['n', d.n]);
      rows.push(['Massimo', fmtNum(d.hi)]);
      rows.push(['Q3', fmtNum(d.q3)]);
      rows.push(['Mediana', fmtNum(d.med)]);
      rows.push(['Q1', fmtNum(d.q1)]);
      rows.push(['Minimo', fmtNum(d.lo)]);
      if (d.mean != null) rows.push(['Media', fmtNum(d.mean)]);
      return '<b>' + (d.label != null ? d.label : d.x) + '</b>' + table(rows);
    }
    if (d.value != null && d.text == null && s.type === 'heat') {
      return '<b>' + (d.xLabel || d.x) + ' / ' + (d.yLabel || d.y) + '</b>' + table([['Valore', fmtNum(d.value, 4)]]);
    }
    var head = s.name ? '<b>' + s.name + '</b>' : '';
    if (d.label != null) rows.push([xLab, d.label]);
    else rows.push([xLab, xs.type === 'band' ? xs.categories[d.x] : fmtNum(d.x)]);
    rows.push([yLab, fmtNum(d.mean != null ? d.mean : d.y)]);
    if (d.lower != null) rows.push(['IC', fmtNum(d.lower) + ' ... ' + fmtNum(d.upper)]);
    if (d.n != null) rows.push(['n', d.n]);
    if (d.ucl != null) rows.push(['LCS', fmtNum(d.ucl)]);
    if (d.lcl != null) rows.push(['LCI', fmtNum(d.lcl)]);
    if (d.violations && d.violations.length) rows.push(['Test violati', d.violations.join(', ')]);
    if (d.info) rows.push(['', d.info]);
    return head + table(rows);
  }

  function table(rows) {
    return '<table>' + rows.map(function (r) {
      return '<tr><td>' + r[0] + '</td><td>' + (r[1] == null ? '' : r[1]) + '</td></tr>';
    }).join('') + '</table>';
  }

  /* ===================== TORTA / CIAMBELLA ===================== */
  function renderPie(target, spec) {
    var container = typeof target === 'string' ? document.querySelector(target) : target;
    container.innerHTML = '';
    container.classList.add('c3-chart');
    var p = pal();
    var width = spec.width || container.clientWidth || 360;
    var height = spec.height || Math.min(300, width);
    if (spec.title) {
      var h = document.createElement('div');
      h.className = 'c3-chart-title';
      h.textContent = spec.title;
      container.appendChild(h);
    }
    var wrap = document.createElement('div');
    wrap.style.position = 'relative';
    container.appendChild(wrap);
    var svg = el('svg', { width: '100%', height: height, viewBox: '0 0 ' + width + ' ' + height }, wrap);
    var cx = width / 2, cy = height / 2;
    var r = Math.min(width, height) / 2 - 12;
    var inner = spec.donut ? r * 0.58 : 0;
    var total = spec.data.reduce(function (a, d) { return a + d.value; }, 0);
    var ang = -Math.PI / 2;
    spec.data.forEach(function (d, i) {
      var frac = d.value / total;
      var a2 = ang + frac * Math.PI * 2;
      var large = frac > 0.5 ? 1 : 0;
      var x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
      var x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
      var dPath;
      if (inner) {
        var xi1 = cx + inner * Math.cos(a2), yi1 = cy + inner * Math.sin(a2);
        var xi2 = cx + inner * Math.cos(ang), yi2 = cy + inner * Math.sin(ang);
        dPath = 'M' + x1 + ',' + y1 + 'A' + r + ',' + r + ' 0 ' + large + ' 1 ' + x2 + ',' + y2 +
          'L' + xi1 + ',' + yi1 + 'A' + inner + ',' + inner + ' 0 ' + large + ' 0 ' + xi2 + ',' + yi2 + 'Z';
      } else {
        dPath = 'M' + cx + ',' + cy + 'L' + x1 + ',' + y1 + 'A' + r + ',' + r + ' 0 ' + large + ' 1 ' + x2 + ',' + y2 + 'Z';
      }
      var path = el('path', {
        d: dPath, fill: d.color || seriesColor(i), stroke: p.surface, 'stroke-width': 2
      }, svg);
      path.appendChild(el('title', null, null)).textContent = d.label + ': ' + fmtNum(d.value) + ' (' + fmtNum(100 * frac, 1) + '%)';
      if (frac > 0.05) {
        var mid = (ang + a2) / 2;
        var lr = inner ? (r + inner) / 2 : r * 0.65;
        var t = el('text', {
          x: cx + lr * Math.cos(mid), y: cy + lr * Math.sin(mid) + 4,
          'text-anchor': 'middle', fill: '#ffffff', 'font-size': 11, 'font-weight': 600
        }, svg);
        t.textContent = fmtNum(100 * frac, 0) + '%';
      }
      ang = a2;
    });
    if (spec.centerLabel && inner) {
      var ct = el('text', {
        x: cx, y: cy + 5, 'text-anchor': 'middle', fill: p.ink,
        'font-size': 16, 'font-weight': 600
      }, svg);
      ct.textContent = spec.centerLabel;
    }
    var leg = document.createElement('div');
    leg.className = 'c3-legend';
    spec.data.forEach(function (d, i) {
      var item = document.createElement('span');
      item.className = 'c3-legend-item';
      var sw = document.createElement('i');
      sw.style.background = d.color || seriesColor(i);
      item.appendChild(sw);
      item.appendChild(document.createTextNode(d.label + ' (' + fmtNum(100 * d.value / total, 1) + '%)'));
      leg.appendChild(item);
    });
    container.appendChild(leg);
    return { el: container, redraw: function () { renderPie(container, spec); } };
  }

  /* ===================== DIAGRAMMA TERNARIO (miscele) ===================== */
  function renderTernary(target, spec) {
    var container = typeof target === 'string' ? document.querySelector(target) : target;
    container.innerHTML = '';
    container.classList.add('c3-chart');
    var p = pal();
    var width = spec.width || container.clientWidth || 420;
    var height = spec.height || width * 0.92;
    if (spec.title) {
      var h = document.createElement('div');
      h.className = 'c3-chart-title';
      h.textContent = spec.title;
      container.appendChild(h);
    }
    var svg = el('svg', { width: '100%', height: height, viewBox: '0 0 ' + width + ' ' + height }, container);
    var pad = 44;
    var side = Math.min(width - 2 * pad, (height - 2 * pad) / 0.866);
    var A = { x: width / 2, y: pad };
    var B = { x: width / 2 - side / 2, y: pad + side * 0.866 };
    var C = { x: width / 2 + side / 2, y: pad + side * 0.866 };
    function toXY(a, b, c) {
      var s = a + b + c || 1;
      a /= s; b /= s; c /= s;
      return { x: A.x * a + B.x * b + C.x * c, y: A.y * a + B.y * b + C.y * c };
    }
    // riempimento con punti della griglia
    (spec.grid || []).forEach(function (pt) {
      var xy = toXY(pt.a, pt.b, pt.c);
      var t = (pt.y - spec.vmin) / ((spec.vmax - spec.vmin) || 1);
      el('circle', { cx: xy.x, cy: xy.y, r: spec.dotSize || 5, fill: seqColor(t), opacity: 0.95 }, svg);
    });
    // griglia interna
    for (var k = 1; k < 5; k++) {
      var f = k / 5;
      var p1 = toXY(f, 1 - f, 0), p2 = toXY(f, 0, 1 - f);
      el('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: p.grid, 'stroke-width': 1 }, svg);
      var p3 = toXY(1 - f, f, 0), p4 = toXY(0, f, 1 - f);
      el('line', { x1: p3.x, y1: p3.y, x2: p4.x, y2: p4.y, stroke: p.grid, 'stroke-width': 1 }, svg);
      var p5 = toXY(1 - f, 0, f), p6 = toXY(0, 1 - f, f);
      el('line', { x1: p5.x, y1: p5.y, x2: p6.x, y2: p6.y, stroke: p.grid, 'stroke-width': 1 }, svg);
    }
    el('polygon', {
      points: [A.x + ',' + A.y, B.x + ',' + B.y, C.x + ',' + C.y].join(' '),
      fill: 'none', stroke: p.axis, 'stroke-width': 1.5
    }, svg);
    // punti sperimentali
    (spec.points || []).forEach(function (pt) {
      var xy = toXY(pt.a, pt.b, pt.c);
      el('circle', { cx: xy.x, cy: xy.y, r: 5, fill: p.ink, stroke: p.surface, 'stroke-width': 1.5 }, svg);
    });
    // etichette dei vertici
    [[A, spec.labels[0], 'middle', -10], [B, spec.labels[1], 'end', 18], [C, spec.labels[2], 'start', 18]]
      .forEach(function (L) {
        var t = el('text', {
          x: L[0].x + (L[2] === 'end' ? -6 : (L[2] === 'start' ? 6 : 0)),
          y: L[0].y + L[3], 'text-anchor': L[2], fill: p.ink2, 'font-size': 12, 'font-weight': 600
        }, svg);
        t.textContent = L[1];
      });
    return { el: container };
  }

  /** Barra di scala per mappe di calore e contour. */
  function colorScaleBar(container, vmin, vmax, opts) {
    opts = opts || {};
    var p = pal();
    var div = document.createElement('div');
    div.className = 'c3-scalebar';
    var grad = [];
    for (var i = 0; i <= 10; i++) {
      grad.push((opts.diverging ? divColor(-1 + 2 * i / 10) : seqColor(i / 10)) + ' ' + (i * 10) + '%');
    }
    div.innerHTML = '<span class="c3-scalebar-lo">' + fmtNum(vmin, 3) + '</span>' +
      '<span class="c3-scalebar-ramp" style="background:linear-gradient(90deg,' + grad.join(',') + ')"></span>' +
      '<span class="c3-scalebar-hi">' + fmtNum(vmax, 3) + '</span>' +
      (opts.label ? '<span class="c3-scalebar-label">' + opts.label + '</span>' : '');
    container.appendChild(div);
    return div;
  }

  C3.chart = {
    render: render, renderPie: renderPie, renderTernary: renderTernary,
    colorScaleBar: colorScaleBar,
    palette: PALETTE, pal: pal, isDark: isDark, seriesColor: seriesColor,
    seqColor: seqColor, divColor: divColor,
    linearScale: linearScale, bandScale: bandScale, logScale: logScale,
    niceTicks: niceTicks, fmtNum: fmtNum, redrawAll: redrawAll, el: el
  };

  // ridisegno su cambio tema e ridimensionamento
  if (root.addEventListener) {
    var rt = null;
    root.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(redrawAll, 180);
    });
    if (root.matchMedia) {
      var mq = root.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', redrawAll);
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
