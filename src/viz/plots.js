/* CLAUDIO v3 - viz/plots.js
 * Costruttori di grafici di alto livello: prendono i risultati dei moduli core
 * e producono le specifiche per C3.chart.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3 = root.C3 || {};
  var ch = C3.chart;
  var st = C3.stats, dist = C3.dist, num = C3.numeric;

  function statusOf(p) { return (p.violations && p.violations.length) ? 'critical' : null; }

  /* ===================== DISTRIBUZIONE DI UNA VARIABILE ===================== */
  /** Istogramma con curva normale e limiti opzionali. */
  function histogram(target, values, opts) {
    opts = opts || {};
    var x = st.clean(values);
    var h = st.histogram(x, { bins: opts.bins });
    var m = st.mean(x), s = st.sd(x);
    var maxCount = Math.max.apply(null, h.bins.map(function (b) { return b.count; }));
    var series = [{
      type: 'bars', name: opts.name || 'Frequenza',
      barWidth: null,
      points: h.bins.map(function (b) {
        return { x: b.mid, y: b.count, label: num.fmt(b.lo, 3) + ' - ' + num.fmt(b.hi, 3), n: b.count, info: b.pct.toFixed(1) + '%' };
      }),
      color: ch.seriesColor(0), hideFromLegend: true
    }];
    // larghezza barre in pixel: calcolata dal dominio
    var annotations = [];
    if (opts.normalCurve !== false && s > 0) {
      var pts = [];
      var lo = Math.min(h.lo, m - 4 * s), hi = Math.max(h.hi, m + 4 * s);
      for (var i = 0; i <= 120; i++) {
        var xv = lo + (hi - lo) * i / 120;
        pts.push({ x: xv, y: dist.normal.pdf(xv, m, s) * x.length * h.width });
      }
      annotations.push({ type: 'curve', points: pts, color: ch.pal().ink2, width: 2 });
    }
    (opts.lines || []).forEach(function (L) {
      annotations.push({ type: 'vline', x: L.value, label: L.label, kind: L.kind || 'spec', color: L.color });
    });
    var barW = null;
    return ch.render(target, {
      title: opts.title || ('Istogramma di ' + (opts.name || 'X')),
      subtitle: opts.subtitle || ('n = ' + x.length + '   media = ' + num.fmt(m, 4) + '   dev.st. = ' + num.fmt(s, 4)),
      height: opts.height, aspect: opts.aspect,
      x: { label: opts.xLabel || opts.name || 'Valore' },
      y: { label: 'Frequenza', includeZero: true, min: 0 },
      series: series.map(function (sr) {
        sr.barWidth = Math.max(4, (opts.width || 640) / Math.max(6, h.bins.length) * 0.8);
        return sr;
      }),
      annotations: annotations,
      note: opts.note
    });
  }

  /** Boxplot per gruppi (o singolo). */
  function boxplot(target, groups, opts) {
    opts = opts || {};
    var boxes = groups.map(function (g, i) {
      var v = st.clean(g.values || g);
      var q1 = st.q1(v), q3 = st.q3(v), iq = q3 - q1;
      var loFence = q1 - 1.5 * iq, hiFence = q3 + 1.5 * iq;
      var inner = v.filter(function (z) { return z >= loFence && z <= hiFence; });
      return {
        x: i, label: g.level != null ? g.level : ('G' + (i + 1)),
        lo: inner.length ? st.min(inner) : st.min(v),
        hi: inner.length ? st.max(inner) : st.max(v),
        q1: q1, med: st.median(v), q3: q3,
        mean: opts.showMean === false ? null : st.mean(v),
        n: v.length,
        outliers: v.filter(function (z) { return z < loFence || z > hiFence; }),
        color: groups.length > 1 ? ch.seriesColor(i % 8) : ch.seriesColor(0)
      };
    });
    var series = [{ type: 'box', boxes: boxes, name: opts.name, hideFromLegend: true }];
    if (opts.showPoints) {
      series.push({
        type: 'points', name: 'Osservazioni', hideFromLegend: true, opacity: 0.45, markerSize: 3,
        points: groups.reduce(function (acc, g, i) {
          st.clean(g.values || g).forEach(function (v, k) {
            acc.push({ x: i + (((k * 2654435761) % 1000) / 1000 - 0.5) * 0.22, y: v });
          });
          return acc;
        }, []),
        color: ch.pal().muted
      });
    }
    return ch.render(target, {
      title: opts.title || 'Boxplot',
      subtitle: opts.subtitle,
      height: opts.height, aspect: opts.aspect,
      x: { type: 'band', categories: boxes.map(function (b) { return b.label; }), label: opts.xLabel },
      y: { label: opts.yLabel || opts.name || 'Valore' },
      series: series,
      annotations: opts.annotations || [],
      note: opts.note || 'La scatola va da Q1 a Q3, la linea e la mediana, il cerchio la media. I cerchi vuoti sono valori oltre 1,5 IQR.'
    });
  }

  /** Grafico dei valori individuali con jitter. */
  function individualValuePlot(target, groups, opts) {
    opts = opts || {};
    var pts = [], means = [];
    groups.forEach(function (g, i) {
      var v = st.clean(g.values || g);
      v.forEach(function (y, k) {
        pts.push({ x: i + (((k * 48271) % 997) / 997 - 0.5) * 0.3, y: y, label: g.level });
      });
      means.push({ x: i, y: st.mean(v), label: g.level, n: v.length });
    });
    return ch.render(target, {
      title: opts.title || 'Valori individuali',
      height: opts.height,
      x: { type: 'band', categories: groups.map(function (g, i) { return g.level != null ? g.level : 'G' + (i + 1); }), label: opts.xLabel },
      y: { label: opts.yLabel || 'Valore' },
      series: [
        { type: 'points', name: 'Osservazioni', points: pts, color: ch.seriesColor(0), opacity: 0.75, markerSize: 4, hideFromLegend: true },
        { type: 'points', name: 'Media', points: means, color: ch.pal().status.critical, shape: 'x', markerSize: 7, hideFromLegend: true }
      ],
      note: 'Le X rosse sono le medie di gruppo.'
    });
  }

  /** Probability plot con banda di confidenza. */
  function probabilityPlot(target, values, opts) {
    opts = opts || {};
    var d = opts.dist || dist.normal;
    var pp = st.probPlotPoints(values, d, opts.params);
    var n = pp.points.length;
    var pts = pp.points.map(function (o) { return { x: o.theo, y: o.x, label: 'p = ' + (100 * o.p).toFixed(1) + '%' }; });
    var xs = pp.points.map(function (o) { return o.theo; });
    var ys = pp.points.map(function (o) { return o.x; });
    // retta ai minimi quadrati sulle coordinate teoriche
    var b1 = st.pearson(xs, ys) * st.sd(ys) / st.sd(xs);
    var b0 = st.mean(ys) - b1 * st.mean(xs);
    var lo = Math.min.apply(null, xs), hi = Math.max.apply(null, xs);
    var line = [{ x: lo, y: b0 + b1 * lo }, { x: hi, y: b0 + b1 * hi }];
    // banda di confidenza (approssimazione di Kolmogorov)
    var band = [];
    var eps = 1.36 / Math.sqrt(n);
    pp.points.forEach(function (o) {
      var pl = num.clamp(o.p - eps, 1e-6, 1 - 1e-6);
      var pu = num.clamp(o.p + eps, 1e-6, 1 - 1e-6);
      band.push({
        x: o.theo,
        y0: b0 + b1 * dist.invOf(d, pl, pp.params),
        y1: b0 + b1 * dist.invOf(d, pu, pp.params)
      });
    });
    var ad = d === dist.normal ? st.andersonDarling(values) : { A2: st.adGeneric(st.clean(values), d, pp.params), p: null };
    return ch.render(target, {
      title: opts.title || ('Probability plot (' + (d.label || 'Normale') + ')'),
      subtitle: 'n = ' + n + '   AD = ' + num.fmt(ad.A2, 3) +
        (ad.p != null ? '   p = ' + num.fmtP(ad.p) : '') +
        '   parametri: ' + pp.params.map(function (v) { return num.fmt(v, 4); }).join(', '),
      height: opts.height,
      x: { label: 'Quantile teorico', gridlines: true },
      y: { label: opts.name || 'Valore osservato' },
      series: [
        { type: 'area', name: 'Banda 95%', points: band, color: ch.seriesColor(0), opacity: 0.12, outline: false, marker: false, hideFromLegend: true, hover: false },
        { type: 'line', name: 'Riferimento', points: line, color: ch.pal().ink2, marker: false, width: 1.8, hideFromLegend: true },
        { type: 'points', name: 'Dati', points: pts, color: ch.seriesColor(0), markerSize: 4 }
      ],
      legend: false,
      note: ad.p != null
        ? (ad.p < 0.05 ? 'p < 0,05: l’ipotesi di normalità viene rifiutata.' : 'p >= 0,05: non si rifiuta la normalità.')
        : null
    });
  }

  /** Grafico di dispersione con retta di regressione, IC e IP. */
  function scatter(target, x, y, opts) {
    opts = opts || {};
    var pairs = [];
    for (var i = 0; i < Math.min(x.length, y.length); i++) {
      var a = parseFloat(x[i]), b = parseFloat(y[i]);
      if (isFinite(a) && isFinite(b)) pairs.push({ x: a, y: b, label: opts.labels ? opts.labels[i] : null });
    }
    var series = [{ type: 'points', name: opts.name || 'Dati', points: pairs, color: ch.seriesColor(0), markerSize: 4.5 }];
    var annotations = [];
    var sub = 'n = ' + pairs.length;
    if (opts.fit !== false && pairs.length > 2) {
      var fit = C3.regression.polyFit(pairs.map(function (p) { return p.x; }), pairs.map(function (p) { return p.y; }), opts.degree || 1);
      var lo = st.min(pairs.map(function (p) { return p.x; })), hi = st.max(pairs.map(function (p) { return p.x; }));
      var lineP = [], ciP = [], piP = [];
      for (var k = 0; k <= 80; k++) {
        var xv = lo + (hi - lo) * k / 80;
        var pr = fit.predictAt(xv);
        lineP.push({ x: xv, y: pr.fit });
        ciP.push({ x: xv, y0: pr.ci[0], y1: pr.ci[1] });
        piP.push({ x: xv, y0: pr.pi[0], y1: pr.pi[1] });
      }
      if (opts.showPI) {
        series.unshift({ type: 'area', name: 'Intervallo di predizione 95%', points: piP, color: ch.seriesColor(1), opacity: 0.1, outline: false, marker: false, hover: false });
      }
      if (opts.showCI !== false) {
        series.unshift({ type: 'area', name: 'IC 95% della media', points: ciP, color: ch.seriesColor(0), opacity: 0.16, outline: false, marker: false, hover: false });
      }
      series.push({ type: 'line', name: 'Adattamento', points: lineP, color: ch.pal().status.critical, marker: false, width: 2 });
      var r = st.pearson(pairs.map(function (p) { return p.x; }), pairs.map(function (p) { return p.y; }));
      sub += '   R2 = ' + num.fmt(100 * fit.r2, 2) + '%   r = ' + num.fmt(r, 4) +
        '   ' + (opts.yName || 'Y') + ' = ' + num.fmt(fit.beta[0], 4) +
        fit.beta.slice(1).map(function (b, j) {
          return (b >= 0 ? ' + ' : ' - ') + num.fmt(Math.abs(b), 5) + (j === 0 ? ' X' : ' X^' + (j + 1));
        }).join('');
    }
    return ch.render(target, {
      title: opts.title || ((opts.yName || 'Y') + ' in funzione di ' + (opts.xName || 'X')),
      subtitle: opts.subtitle || sub,
      height: opts.height,
      x: { label: opts.xName || 'X', gridlines: true },
      y: { label: opts.yName || 'Y' },
      series: series,
      legend: opts.legend
    });
  }

  /** Matrice di correlazione come mappa di calore divergente. */
  function correlationHeatmap(target, corr, opts) {
    opts = opts || {};
    var cols = corr.cols, cells = [];
    for (var i = 0; i < cols.length; i++) {
      for (var j = 0; j < cols.length; j++) {
        cells.push({
          x: j, y: cols.length - 1 - i, value: corr.r[i][j],
          xLabel: cols[j], yLabel: cols[i],
          text: num.fmt(corr.r[i][j], 2),
          info: 'p = ' + num.fmtP(corr.p[i][j])
        });
      }
    }
    var size = Math.max(280, Math.min(640, cols.length * 58 + 90));
    var c = ch.render(target, {
      title: opts.title || 'Matrice di correlazione (' + corr.method + ')',
      width: opts.width, height: size,
      margin: { left: 96, bottom: 84, top: 8, right: 16 },
      x: { type: 'band', categories: cols, rotate: -35 },
      y: { domain: [-0.5, cols.length - 0.5], ticks: cols.length, format: function (v) { return cols[cols.length - 1 - Math.round(v)] || ''; }, gridlines: false },
      series: [{
        type: 'heat', cells: cells, diverging: true, vmin: -1, vmax: 1, cellLabels: true,
        cellHeight: (size - 92) / cols.length, name: 'r',
        tooltip: function (d) {
          return '<b>' + d.yLabel + ' / ' + d.xLabel + '</b><table><tr><td>r</td><td>' + num.fmt(d.value, 4) +
            '</td></tr><tr><td>p</td><td>' + d.info.replace('p = ', '') + '</td></tr></table>';
        }
      }],
      legend: false,
      note: 'Blu = correlazione negativa, rosso = positiva, grigio = assente.'
    });
    ch.colorScaleBar(target.appendChild ? target : document.querySelector(target), -1, 1, { diverging: true, label: 'coefficiente r' });
    return c;
  }

  /* ===================== CARTE DI CONTROLLO ===================== */
  /** Disegna una carta di controllo (primaria + secondaria se presente). */
  function controlChart(target, chart, opts) {
    opts = opts || {};
    var container = typeof target === 'string' ? document.querySelector(target) : target;
    container.innerHTML = '';
    var out = [];
    ['primary', 'secondary'].forEach(function (key) {
      var pts = chart[key];
      if (!pts || !pts.length) return;
      var div = document.createElement('div');
      div.className = 'c3-subchart';
      container.appendChild(div);
      var title = key === 'primary' ? chart.titlePrimary : chart.titleSecondary;
      var series = [{
        type: 'line', name: 'Valore',
        points: pts.map(function (p, i) {
          return {
            x: i, y: p.value, label: p.label, n: p.n,
            ucl: p.ucl, lcl: p.lcl, cl: p.cl,
            violations: p.violations,
            status: statusOf(p),
            flag: (p.violations && p.violations.length) ? String(p.violations[0]) : null
          };
        }),
        color: ch.seriesColor(0), markerSize: 3.6, hideFromLegend: true
      }];
      if (chart.type === 'cusum' && key === 'primary') {
        series.push({
          type: 'line', name: 'CUSUM inferiore',
          points: pts.map(function (p, i) { return { x: i, y: p.valueLow, label: p.label }; }),
          color: ch.seriesColor(1), markerSize: 3.6
        });
      }
      // limiti variabili -> linee a gradino; limiti costanti -> annotazioni
      var uclSet = {}, lclSet = {}, clSet = {};
      pts.forEach(function (p) {
        uclSet[num.round(p.ucl, 8)] = 1; lclSet[num.round(p.lcl, 8)] = 1; clSet[num.round(p.cl, 8)] = 1;
      });
      var annotations = [];
      var constantLimits = Object.keys(uclSet).length === 1 && Object.keys(lclSet).length === 1 && Object.keys(clSet).length === 1;
      if (constantLimits) {
        annotations.push({ type: 'hline', y: pts[0].ucl, label: 'LCS = ' + num.fmt(pts[0].ucl, 4), kind: 'spec' });
        annotations.push({ type: 'hline', y: pts[0].cl, label: 'LC = ' + num.fmt(pts[0].cl, 4), kind: 'center' });
        if (pts[0].lcl != null && isFinite(pts[0].lcl)) {
          annotations.push({ type: 'hline', y: pts[0].lcl, label: 'LCI = ' + num.fmt(pts[0].lcl, 4), kind: 'spec' });
        }
      } else {
        series.push({
          type: 'step', name: 'LCS', points: pts.map(function (p, i) { return { x: i, y: p.ucl }; }),
          color: ch.pal().status.critical, marker: false, width: 1.4, dash: '5 3', hideFromLegend: true
        });
        series.push({
          type: 'step', name: 'LC', points: pts.map(function (p, i) { return { x: i, y: p.cl }; }),
          color: ch.pal().status.good, marker: false, width: 1.4, hideFromLegend: true
        });
        series.push({
          type: 'step', name: 'LCI', points: pts.map(function (p, i) { return { x: i, y: p.lcl }; }),
          color: ch.pal().status.critical, marker: false, width: 1.4, dash: '5 3', hideFromLegend: true
        });
      }
      // separatori di fase
      if (chart.stages && chart.stages.length > 1) {
        chart.stages.slice(1).forEach(function (s, i) {
          annotations.push({ type: 'vline', x: s.from - 0.5, label: 'fase ' + (i + 2), color: ch.pal().muted });
        });
      }
      var labels = pts.map(function (p) { return p.label; });
      var spec = {
        title: title,
        subtitle: key === 'primary' && chart.sigmaWithin
          ? 'sigma stimata = ' + num.fmt(chart.sigmaWithin, 5) + (chart.type ? '   (' + chart.type + ')' : '')
          : null,
        height: opts.height || (key === 'primary' ? 260 : 210),
        margin: { bottom: 34, left: 62, right: 78, top: 10 },
        x: {
          label: opts.xLabel || 'Sottogruppo',
          ticks: Math.min(14, pts.length),
          format: function (v) {
            var i = Math.round(v);
            return (i >= 0 && i < labels.length) ? labels[i] : '';
          }
        },
        y: { label: key === 'primary' ? (opts.yLabel || 'Valore') : (chart.titleSecondary || 'Dispersione') },
        series: series, annotations: annotations, legend: false
      };
      out.push(ch.render(div, spec));
    });
    // riepilogo violazioni
    var viol = C3.control.summarizeViolations(chart);
    if (viol.length) {
      var box = document.createElement('div');
      box.className = 'c3-alert';
      box.innerHTML = '<b>Punti fuori controllo</b><ul>' + viol.map(function (v) {
        var shown = v.points.slice(0, 20).join(', ');
        var extra = v.points.length > 20 ? ' e altri ' + (v.points.length - 20) : '';
        return '<li><b>' + v.chart + '</b> - test ' + v.test + ': ' + v.label +
          ' <span class="muted">(' + v.points.length + ' punti: ' + shown + extra + ')</span></li>';
      }).join('') + '</ul>';
      container.appendChild(box);
    } else {
      var ok = document.createElement('div');
      ok.className = 'c3-ok';
      ok.textContent = 'Nessun punto fuori controllo: il processo risulta stabile rispetto ai test attivi.';
      container.appendChild(ok);
    }
    return out;
  }

  /* ===================== CAPACITA ===================== */
  function capabilityChart(target, cap, opts) {
    opts = opts || {};
    var x = cap.values || cap.originalValues;
    var h = cap.histogram || st.histogram(x);
    var lines = [];
    if (cap.lsl != null) lines.push({ value: cap.lsl, label: 'LSL = ' + num.fmt(cap.lsl, 4), kind: 'spec' });
    if (cap.usl != null) lines.push({ value: cap.usl, label: 'USL = ' + num.fmt(cap.usl, 4), kind: 'spec' });
    if (cap.target != null) lines.push({ value: cap.target, label: 'Target', kind: 'center' });
    var annotations = lines.map(function (L) {
      return { type: 'vline', x: L.value, label: L.label, kind: L.kind };
    });
    var n = x.length;
    var lo = Math.min(h.lo, cap.lsl != null ? cap.lsl : Infinity, cap.mean - 4 * cap.sdOverall);
    var hi = Math.max(h.hi, cap.usl != null ? cap.usl : -Infinity, cap.mean + 4 * cap.sdOverall);
    if (cap.sigmaWithin) {
      var cw = [];
      for (var i = 0; i <= 140; i++) {
        var xv = lo + (hi - lo) * i / 140;
        cw.push({ x: xv, y: dist.normal.pdf(xv, cap.mean, cap.sigmaWithin) * n * h.width });
      }
      annotations.push({ type: 'curve', points: cw, color: ch.seriesColor(0), width: 2 });
    }
    var co = [];
    for (var j = 0; j <= 140; j++) {
      var xv2 = lo + (hi - lo) * j / 140;
      co.push({ x: xv2, y: dist.normal.pdf(xv2, cap.mean, cap.sdOverall) * n * h.width });
    }
    annotations.push({ type: 'curve', points: co, color: ch.seriesColor(1), width: 2, dash: '5 3' });
    return ch.render(target, {
      title: opts.title || 'Capacità di processo',
      subtitle: 'linea continua = within (breve termine), tratteggiata = overall (lungo termine)',
      height: opts.height || 300,
      x: { label: opts.name || 'Valore', domain: [lo, hi] },
      y: { label: 'Frequenza', includeZero: true, min: 0 },
      series: [{
        type: 'bars', name: 'Dati', hideFromLegend: true,
        barWidth: Math.max(4, 560 / Math.max(8, h.bins.length) * 0.82),
        points: h.bins.map(function (b) {
          return { x: b.mid, y: b.count, label: num.fmt(b.lo, 3) + ' - ' + num.fmt(b.hi, 3) };
        }),
        color: ch.pal().muted, opacity: 0.55
      }],
      annotations: annotations, legend: false
    });
  }

  /* ===================== PARETO ===================== */
  /**
   * Pareto: barre dei conteggi + linea cumulata sulla stessa scala (nessun secondo asse).
   * Le percentuali cumulate sono etichettate sui punti.
   */
  function paretoChart(target, pareto, opts) {
    opts = opts || {};
    var rows = pareto.rows;
    var total = pareto.total;
    var cumPoints = [], acc = 0;
    rows.forEach(function (r, i) {
      acc += r.value;
      cumPoints.push({ x: i, y: acc, label: r.label, info: num.fmt(r.cumPct, 1) + '% cumulato' });
    });
    return ch.render(target, {
      title: opts.title || 'Diagramma di Pareto',
      subtitle: pareto.note,
      height: opts.height || 300,
      margin: { bottom: 70, left: 62, right: 24, top: 10 },
      x: { type: 'band', categories: rows.map(function (r) { return r.label; }), rotate: -32 },
      y: { label: opts.yLabel || 'Conteggio', includeZero: true, max: total * 1.04 },
      series: [
        {
          type: 'bars', name: 'Conteggio',
          points: rows.map(function (r, i) {
            return { x: i, y: r.value, label: r.label, info: num.fmt(r.pct, 1) + '% del totale' };
          }),
          color: ch.seriesColor(0), valueLabels: opts.valueLabels !== false, valueDigits: 0
        },
        {
          type: 'line', name: 'Cumulato',
          points: cumPoints, color: ch.pal().status.critical, width: 2, markerSize: 4
        }
      ],
      annotations: [
        { type: 'hline', y: total * 0.8, label: '80% del totale', color: ch.pal().muted }
      ],
      note: 'La linea rossa e il totale cumulato: dove incrocia la linea dell 80% si separano le poche cause vitali.'
    });
  }

  /* ===================== ANOVA / CONFRONTI ===================== */
  function intervalPlot(target, rows, opts) {
    opts = opts || {};
    return ch.render(target, {
      title: opts.title || 'Grafico degli intervalli (IC 95% della media)',
      subtitle: opts.subtitle,
      height: opts.height,
      x: { type: 'band', categories: rows.map(function (r) { return r.level; }), label: opts.xLabel },
      y: { label: opts.yLabel || 'Media' },
      series: [{
        type: 'interval', name: 'Media e IC',
        points: rows.map(function (r, i) {
          return {
            x: i, mean: r.mean, lower: r.lower != null ? r.lower : (r.ciPooled ? r.ciPooled[0] : null),
            upper: r.upper != null ? r.upper : (r.ciPooled ? r.ciPooled[1] : null),
            label: r.level, n: r.n
          };
        }),
        color: ch.seriesColor(0)
      }],
      annotations: opts.grandMean != null
        ? [{ type: 'hline', y: opts.grandMean, label: 'media generale', color: ch.pal().muted }] : [],
      legend: false
    });
  }

  /** Differenze di Tukey con IC simultanei. */
  function comparisonPlot(target, comparisons, opts) {
    opts = opts || {};
    var pairs = comparisons.pairs;
    return ch.render(target, {
      title: opts.title || ('Confronti multipli - ' + (pairs[0] ? pairs[0].method : '')),
      subtitle: 'Se l’intervallo non contiene lo zero la differenza è significativa',
      height: Math.max(180, 60 + pairs.length * 34),
      margin: { left: 110, right: 24, top: 10, bottom: 42 },
      x: { label: 'Differenza fra medie', gridlines: true },
      y: { domain: [-0.6, pairs.length - 0.4], ticks: pairs.length, format: function (v) {
        var i = Math.round(v);
        return pairs[i] ? (pairs[i].a + ' - ' + pairs[i].b) : '';
      }, gridlines: false },
      series: [{
        type: 'segments', name: 'IC',
        segments: pairs.map(function (p, i) {
          return { x1: p.ci[0], y1: i, x2: p.ci[1], y2: i, width: 2.5, color: p.significant ? ch.pal().status.critical : ch.seriesColor(0) };
        })
      }, {
        type: 'points', name: 'Differenza',
        points: pairs.map(function (p, i) {
          return {
            x: p.diff, y: i, label: p.a + ' - ' + p.b, size: 5,
            color: p.significant ? ch.pal().status.critical : ch.seriesColor(0),
            info: 'p = ' + num.fmtP(p.p)
          };
        }), labels: false
      }],
      annotations: [{ type: 'vline', x: 0, label: 'zero', color: ch.pal().ink2 }],
      legend: false
    });
  }

  /* ===================== RESIDUI ===================== */
  /** Four-in-one dei residui. */
  function residualPlots(target, fit, opts) {
    opts = opts || {};
    var container = typeof target === 'string' ? document.querySelector(target) : target;
    container.innerHTML = '';
    var grid = document.createElement('div');
    grid.className = 'c3-grid-2';
    container.appendChild(grid);
    var res = fit.resid, fitted = fit.fitted;
    var sres = fit.sresid || res;

    function cell() {
      var d = document.createElement('div');
      d.className = 'c3-subchart';
      grid.appendChild(d);
      return d;
    }
    // 1. normal plot dei residui
    probabilityPlot(cell(), res, { title: 'Normal plot dei residui', name: 'Residuo', height: 240 });
    // 2. residui vs valori adattati
    ch.render(cell(), {
      title: 'Residui vs valori adattati',
      height: 240,
      x: { label: 'Valore adattato', gridlines: true },
      y: { label: 'Residuo standardizzato' },
      series: [{
        type: 'points', name: 'Residui',
        points: fitted.map(function (f, i) { return { x: f, y: sres[i], label: 'oss. ' + (i + 1) }; }),
        color: ch.seriesColor(0), markerSize: 4
      }],
      annotations: [
        { type: 'hline', y: 0, color: ch.pal().ink2 },
        { type: 'hline', y: 2, label: '+2', color: ch.pal().muted },
        { type: 'hline', y: -2, label: '-2', color: ch.pal().muted }
      ],
      legend: false,
      note: 'Una forma a imbuto indica varianza non costante; una curva indica un termine mancante nel modello.'
    });
    // 3. istogramma dei residui
    histogram(cell(), res, { title: 'Istogramma dei residui', name: 'Residuo', height: 240, subtitle: null });
    // 4. residui nell’ordine di osservazione
    ch.render(cell(), {
      title: 'Residui nell’ordine di raccolta',
      height: 240,
      x: { label: 'Ordine di osservazione' },
      y: { label: 'Residuo standardizzato' },
      series: [{
        type: 'line', name: 'Residui',
        points: sres.map(function (r, i) { return { x: i + 1, y: r }; }),
        color: ch.seriesColor(0), markerSize: 3.4
      }],
      annotations: [{ type: 'hline', y: 0, color: ch.pal().ink2 }],
      legend: false,
      note: 'Andamenti o cicli indicano autocorrelazione (Durbin-Watson = ' + num.fmt(fit.dw, 3) + ').'
    });
    return container;
  }

  /* ===================== DOE ===================== */
  /** Pareto degli effetti standardizzati. */
  function effectsPareto(target, analysis, opts) {
    opts = opts || {};
    var rows = analysis.pareto.rows;
    return ch.render(target, {
      title: opts.title || 'Pareto degli effetti standardizzati',
      subtitle: analysis.pareto.referenceLabel + ' = ' + num.fmt(analysis.pareto.reference, 3),
      height: Math.max(200, 60 + rows.length * 26),
      margin: { left: 92, right: 30, top: 10, bottom: 42 },
      x: { label: 'Effetto standardizzato |t|', gridlines: true, includeZero: true },
      y: { domain: [-0.6, rows.length - 0.4], ticks: rows.length, gridlines: false, format: function (v) {
        var i = Math.round(v);
        return rows[i] ? rows[i].term : '';
      } },
      series: [{
        type: 'bars', orientation: 'h', name: 'Effetto',
        barWidth: 18,
        points: rows.map(function (r, i) {
          return {
            x: i, y: r.value, label: r.term,
            color: r.significant ? ch.seriesColor(0) : ch.pal().muted,
            info: r.p != null ? 'p = ' + num.fmtP(r.p) : null
          };
        })
      }],
      annotations: [{
        type: 'vline', x: analysis.pareto.reference, label: 'soglia', kind: 'spec'
      }],
      legend: false,
      note: 'Le barre oltre la soglia sono statisticamente significative.'
    });
  }

  /** Normal plot o half-normal plot degli effetti. */
  function effectsNormalPlot(target, analysis, opts) {
    opts = opts || {};
    var half = opts.half;
    var data = half ? analysis.normalPlot.halfNormal : analysis.normalPlot.normal;
    var thr = analysis.lenthAll ? analysis.lenthAll.me : null;
    var pts = data.map(function (d) {
      var val = half ? d.abs : d.effect;
      return {
        x: val, y: d.z, label: d.term,
        color: (thr != null && Math.abs(val) > thr) ? ch.pal().status.critical : ch.seriesColor(0)
      };
    });
    return ch.render(target, {
      title: opts.title || (half ? 'Half-normal plot degli effetti' : 'Normal plot degli effetti'),
      subtitle: 'gli effetti attivi si scostano dalla retta dei punti inattivi',
      height: opts.height || 280,
      x: { label: half ? 'Effetto assoluto' : 'Effetto', gridlines: true },
      y: { label: 'Punteggio normale' },
      series: [{ type: 'points', name: 'Effetti', points: pts, markerSize: 5, labels: true }],
      legend: false
    });
  }

  /** Grafico degli effetti principali. */
  function mainEffectsPlot(target, analysis, opts) {
    opts = opts || {};
    var container = typeof target === 'string' ? document.querySelector(target) : target;
    container.innerHTML = '';
    var grid = document.createElement('div');
    grid.className = 'c3-grid-' + Math.min(3, Math.max(2, analysis.mainEffects.length));
    container.appendChild(grid);
    var allMeans = [];
    analysis.mainEffects.forEach(function (me) {
      me.levels.forEach(function (L) { allMeans.push(L.mean); });
    });
    var dom = [st.min(allMeans), st.max(allMeans)];
    var pad = (dom[1] - dom[0]) * 0.15 || 1;
    analysis.mainEffects.forEach(function (me, idx) {
      var d = document.createElement('div');
      d.className = 'c3-subchart';
      grid.appendChild(d);
      ch.render(d, {
        title: me.factor,
        height: opts.height || 210,
        margin: { left: 54, right: 14, top: 8, bottom: 34 },
        x: { type: 'band', categories: me.levels.map(function (L) { return L.level; }) },
        y: { label: idx === 0 ? (analysis.response || 'Media') : null, domain: [dom[0] - pad, dom[1] + pad] },
        series: [{
          type: 'line', name: 'Media',
          points: me.levels.map(function (L, i) { return { x: i, y: L.mean, label: L.level, n: L.n }; }),
          color: ch.seriesColor(0), markerSize: 5
        }],
        annotations: [{ type: 'hline', y: analysis.yMean, label: 'media generale', color: ch.pal().muted }],
        legend: false
      });
    });
    return container;
  }

  /** Grafici di interazione. */
  function interactionPlots(target, analysis, opts) {
    opts = opts || {};
    var container = typeof target === 'string' ? document.querySelector(target) : target;
    container.innerHTML = '';
    var list = analysis.interactions.filter(function (it) { return it.cells.length >= 4; });
    if (!list.length) {
      container.innerHTML = '<p class="muted">Nessuna interazione disponibile.</p>';
      return container;
    }
    var grid = document.createElement('div');
    grid.className = 'c3-grid-2';
    container.appendChild(grid);
    list.forEach(function (it) {
      var d = document.createElement('div');
      d.className = 'c3-subchart';
      grid.appendChild(d);
      var aLevels = [], bLevels = [];
      it.cells.forEach(function (c) {
        if (aLevels.indexOf(c.a) < 0) aLevels.push(c.a);
        if (bLevels.indexOf(c.b) < 0) bLevels.push(c.b);
      });
      aLevels.sort(sortLevels); bLevels.sort(sortLevels);
      var series = bLevels.map(function (bl, i) {
        return {
          type: 'line', name: it.b + ' = ' + bl,
          points: aLevels.map(function (al, k) {
            var cell = it.cells.filter(function (c) { return c.a === al && c.b === bl; })[0];
            return cell ? { x: k, y: cell.mean, label: al + ' / ' + bl, n: cell.n } : null;
          }).filter(Boolean),
          color: ch.seriesColor(i), markerSize: 5
        };
      });
      ch.render(d, {
        title: 'Interazione ' + it.a + ' x ' + it.b,
        height: opts.height || 230,
        x: { type: 'band', categories: aLevels, label: it.a },
        y: { label: analysis.response || 'Media' },
        series: series
      });
    });
    return container;
  }

  function sortLevels(a, b) {
    var na = parseFloat(a), nb = parseFloat(b);
    if (isFinite(na) && isFinite(nb)) return na - nb;
    return a < b ? -1 : (a > b ? 1 : 0);
  }

  /** Cube plot per disegni a 3 fattori (medie ai vertici). */
  function cubePlot(target, data, factors, response, opts) {
    opts = opts || {};
    var container = typeof target === 'string' ? document.querySelector(target) : target;
    container.innerHTML = '';
    var p = ch.pal();
    var width = opts.width || container.clientWidth || 420;
    var height = opts.height || 320;
    var svg = ch.el('svg', { width: '100%', height: height, viewBox: '0 0 ' + width + ' ' + height }, container);
    var f = factors.slice(0, 3);
    // medie per combinazione
    var cells = {};
    var n = data[response].length;
    for (var i = 0; i < n; i++) {
      var key = f.map(function (fc) { return Number(data[fc][i]) > 0 ? 1 : -1; }).join(',');
      var v = parseFloat(data[response][i]);
      if (!isFinite(v)) continue;
      (cells[key] = cells[key] || []).push(v);
    }
    var cx = width / 2, cy = height / 2;
    var s = Math.min(width, height) * 0.3;
    var dx = s * 0.42, dy = -s * 0.3;
    function pos(a, b, c) {
      return { x: cx + a * s * 0.8 + c * dx, y: cy - b * s * 0.7 + c * dy };
    }
    var verts = [];
    [-1, 1].forEach(function (a) {
      [-1, 1].forEach(function (b) {
        [-1, 1].forEach(function (c) {
          verts.push({ a: a, b: b, c: c, pt: pos(a, b, c) });
        });
      });
    });
    // spigoli
    verts.forEach(function (v1) {
      verts.forEach(function (v2) {
        var diff = (v1.a !== v2.a ? 1 : 0) + (v1.b !== v2.b ? 1 : 0) + (v1.c !== v2.c ? 1 : 0);
        if (diff === 1) {
          ch.el('line', {
            x1: v1.pt.x, y1: v1.pt.y, x2: v2.pt.x, y2: v2.pt.y,
            stroke: p.axis, 'stroke-width': 1
          }, svg);
        }
      });
    });
    verts.forEach(function (v) {
      var key = [v.a, v.b, v.c].join(',');
      var vals = cells[key] || [];
      var m = vals.length ? st.mean(vals) : null;
      ch.el('circle', { cx: v.pt.x, cy: v.pt.y, r: 4, fill: ch.seriesColor(0), stroke: p.surface, 'stroke-width': 1.5 }, svg);
      var t = ch.el('text', {
        x: v.pt.x, y: v.pt.y - 9, 'text-anchor': 'middle', fill: p.ink,
        'font-size': 11, 'font-weight': 600, 'font-variant-numeric': 'tabular-nums'
      }, svg);
      t.textContent = m == null ? '-' : num.fmt(m, 3);
    });
    // etichette dei fattori
    var labels = [
      { x: cx, y: height - 8, text: f[0] + ' →', anchor: 'middle' },
      { x: 12, y: cy, text: '↑ ' + f[1], anchor: 'start' },
      { x: cx + s * 0.9 + dx, y: cy + dy - s * 0.8, text: f[2] ? f[2] + ' ↗' : '', anchor: 'start' }
    ];
    labels.forEach(function (L) {
      var t2 = ch.el('text', { x: L.x, y: L.y, 'text-anchor': L.anchor, fill: p.ink2, 'font-size': 11 }, svg);
      t2.textContent = L.text;
    });
    var cap = document.createElement('div');
    cap.className = 'c3-chart-note';
    cap.textContent = 'Medie di ' + response + ' ai vertici del cubo dei fattori codificati.';
    container.appendChild(cap);
    return container;
  }

  /** Contour plot da modello RSM. */
  function contourPlot(target, model, xFactor, yFactor, opts) {
    opts = opts || {};
    var grid = C3.doe.surfaceGrid(model, xFactor, yFactor, {
      n: opts.n || 44, hold: opts.hold, xRange: opts.xRange, yRange: opts.yRange
    });
    var container = typeof target === 'string' ? document.querySelector(target) : target;
    var c = ch.render(container, {
      title: opts.title || ('Contour di ' + model.response + ': ' + yFactor + ' vs ' + xFactor),
      subtitle: opts.subtitle,
      height: opts.height || 320,
      x: { label: xFactor + (opts.coded ? ' (codificato)' : ''), domain: [grid.x[0], grid.x[grid.x.length - 1]], gridlines: false },
      y: { label: yFactor + (opts.coded ? ' (codificato)' : ''), domain: [grid.y[0], grid.y[grid.y.length - 1]], gridlines: false },
      series: [{
        type: 'contour', name: model.response,
        grid: { x: grid.x, y: grid.y, z: grid.z },
        levels: opts.levels || 10, filled: opts.filled !== false
      }].concat(opts.points ? [{
        type: 'points', name: 'Prove', points: opts.points, color: ch.pal().ink, markerSize: 4
      }] : []),
      annotations: opts.optimum ? [{
        type: 'text', x: opts.optimum[0], y: opts.optimum[1], text: '✖ ottimo',
        color: ch.pal().status.critical, weight: 700
      }] : [],
      legend: false,
      hover: false
    });
    ch.colorScaleBar(container, grid.zMin, grid.zMax, { label: model.response });
    return c;
  }

  /** Superficie 3D da modello RSM. */
  function surfacePlot(target, model, xFactor, yFactor, opts) {
    opts = opts || {};
    var grid = C3.doe.surfaceGrid(model, xFactor, yFactor, {
      n: opts.n || 26, hold: opts.hold, xRange: opts.xRange, yRange: opts.yRange
    });
    return ch.render(target, {
      title: opts.title || ('Superficie di risposta: ' + model.response),
      subtitle: xFactor + ' e ' + yFactor + (opts.subtitle ? '   ' + opts.subtitle : ''),
      height: opts.height || 340,
      margin: { top: 10, right: 10, bottom: 10, left: 10 },
      x: { domain: [0, 1], gridlines: false, ticks: 0, label: null },
      y: { domain: [0, 1], gridlines: false, ticks: 0, label: null },
      series: [{
        type: 'surface', grid: { x: grid.x, y: grid.y, z: grid.z },
        rotation: opts.rotation, tilt: opts.tilt,
        xLabel: xFactor, yLabel: yFactor, name: model.response
      }],
      legend: false, hover: false
    });
  }

  /* ===================== MSA ===================== */
  function gageRRCharts(target, rr, opts) {
    opts = opts || {};
    var container = typeof target === 'string' ? document.querySelector(target) : target;
    container.innerHTML = '';
    var grid = document.createElement('div');
    grid.className = 'c3-grid-2';
    container.appendChild(grid);
    function cell() {
      var d = document.createElement('div');
      d.className = 'c3-subchart';
      grid.appendChild(d);
      return d;
    }
    // 1. componenti della variazione
    var comps = rr.components.filter(function (c) {
      return c.source.indexOf('Variazione totale') < 0;
    });
    var catsC = comps.map(function (c) { return c.source.trim(); });
    ch.render(cell(), {
      title: 'Componenti della variazione',
      height: 250,
      margin: { bottom: 76, left: 56, right: 14, top: 8 },
      x: { type: 'band', categories: catsC, rotate: -30 },
      y: { label: '%', includeZero: true },
      series: [
        {
          type: 'bars', name: '% contributo', groupCount: 2, groupIndex: 0,
          points: comps.map(function (c, i) { return { x: i, y: c.pctContribution, label: c.source.trim() }; }),
          color: ch.seriesColor(0)
        },
        {
          type: 'bars', name: '% study var', groupCount: 2, groupIndex: 1,
          points: comps.map(function (c, i) { return { x: i, y: c.pctStudyVar, label: c.source.trim() }; }),
          color: ch.seriesColor(1)
        }
      ],
      annotations: [
        { type: 'hline', y: 10, label: '10%', color: ch.pal().status.good },
        { type: 'hline', y: 30, label: '30%', color: ch.pal().status.critical }
      ]
    });
    // 2. R chart per operatore
    var ops = rr.levelsOperators || [], parts = rr.levelsParts || [];
    var rangePts = [], xbarPts = [];
    ops.forEach(function (o, oi) {
      parts.forEach(function (pt, pi) {
        var vals = rr.cells[pt + '' + o] || [];
        if (!vals.length) return;
        rangePts.push({ x: oi * parts.length + pi, y: st.range(vals), label: o + ' / ' + pt });
        xbarPts.push({ x: oi * parts.length + pi, y: st.mean(vals), label: o + ' / ' + pt });
      });
    });
    var nrep = rr.nReplicates;
    var k = C3.control.constants(nrep);
    var rbar = st.mean(rangePts.map(function (p) { return p.y; }));
    ch.render(cell(), {
      title: 'Carta R per operatore',
      height: 250,
      x: { label: 'operatore / pezzo', ticks: 0 },
      y: { label: 'Range', includeZero: true },
      series: [{ type: 'line', name: 'Range', points: rangePts, color: ch.seriesColor(0), markerSize: 3.4 }],
      annotations: [
        { type: 'hline', y: k.D4 * rbar, label: 'LCS', kind: 'spec' },
        { type: 'hline', y: rbar, label: 'R medio', kind: 'center' },
        { type: 'hline', y: k.D3 * rbar, label: 'LCI', kind: 'spec' }
      ].concat(ops.slice(1).map(function (o, i) {
        return { type: 'vline', x: (i + 1) * parts.length - 0.5, label: o, color: ch.pal().muted };
      })),
      legend: false
    });
    // 3. Xbar chart per operatore
    var xbarbar = st.mean(xbarPts.map(function (p) { return p.y; }));
    ch.render(cell(), {
      title: 'Carta Xbar per operatore',
      height: 250,
      x: { label: 'operatore / pezzo', ticks: 0 },
      y: { label: 'Media' },
      series: [{ type: 'line', name: 'Media', points: xbarPts, color: ch.seriesColor(0), markerSize: 3.4 }],
      annotations: [
        { type: 'hline', y: xbarbar + k.A2 * rbar, label: 'LCS', kind: 'spec' },
        { type: 'hline', y: xbarbar, label: 'media', kind: 'center' },
        { type: 'hline', y: xbarbar - k.A2 * rbar, label: 'LCI', kind: 'spec' }
      ].concat(ops.slice(1).map(function (o, i) {
        return { type: 'vline', x: (i + 1) * parts.length - 0.5, label: o, color: ch.pal().muted };
      })),
      legend: false,
      note: 'La maggior parte dei punti deve cadere FUORI dai limiti: significa che lo strumento distingue i pezzi.'
    });
    // 4. misure per pezzo
    ch.render(cell(), {
      title: 'Misure per pezzo',
      height: 250,
      x: { type: 'band', categories: parts, label: 'Pezzo' },
      y: { label: 'Valore' },
      series: [{
        type: 'points', name: 'Misure', markerSize: 3.4, opacity: 0.7,
        points: parts.reduce(function (acc, pt, pi) {
          ops.forEach(function (o) {
            (rr.cells[pt + '' + o] || []).forEach(function (v) {
              acc.push({ x: pi, y: v, label: pt + ' / ' + o });
            });
          });
          return acc;
        }, []),
        color: ch.pal().muted
      }, {
        type: 'line', name: 'Media pezzo',
        points: parts.map(function (pt, pi) { return { x: pi, y: rr.meanPart[pt], label: pt }; }),
        color: ch.seriesColor(0), markerSize: 5
      }]
    });
    // 5. interazione pezzo x operatore
    var d5 = document.createElement('div');
    d5.className = 'c3-subchart';
    container.appendChild(d5);
    ch.render(d5, {
      title: 'Interazione pezzo x operatore',
      height: 260,
      x: { type: 'band', categories: parts, label: 'Pezzo' },
      y: { label: 'Media' },
      series: ops.map(function (o, oi) {
        return {
          type: 'line', name: o,
          points: parts.map(function (pt, pi) {
            var vals = rr.cells[pt + '' + o] || [];
            return vals.length ? { x: pi, y: st.mean(vals), label: pt + ' / ' + o } : null;
          }).filter(Boolean),
          color: ch.seriesColor(oi), markerSize: 4
        };
      }),
      note: 'Linee non parallele indicano interazione: gli operatori misurano i pezzi in modo diverso.'
    });
    return container;
  }

  /* ===================== SERIE STORICHE ===================== */
  function timeSeriesPlot(target, result, opts) {
    opts = opts || {};
    var actual = result.actual || result.values;
    var fitted = result.fitted;
    var fc = result.forecast || [];
    var series = [{
      type: 'line', name: 'Osservato',
      points: actual.map(function (v, i) { return { x: i + 1, y: v }; }),
      color: ch.seriesColor(0), markerSize: 3
    }];
    if (fitted) {
      series.push({
        type: 'line', name: 'Adattato',
        points: fitted.map(function (v, i) { return v == null ? null : { x: i + 1, y: v }; }).filter(Boolean),
        color: ch.seriesColor(1), marker: false, width: 2
      });
    }
    if (fc.length) {
      var n = actual.length;
      series.push({
        type: 'area', name: 'IC previsione',
        points: fc.map(function (f) { return { x: f.t, y0: f.lower, y1: f.upper }; }),
        color: ch.seriesColor(2), opacity: 0.15, outline: false, marker: false, hover: false
      });
      series.push({
        type: 'line', name: 'Previsione',
        points: [{ x: n, y: actual[n - 1] }].concat(fc.map(function (f) { return { x: f.t, y: f.fit }; })),
        color: ch.seriesColor(2), markerSize: 4, dash: '6 3'
      });
    }
    return ch.render(target, {
      title: opts.title || (result.method || result.model || 'Serie storica'),
      subtitle: result.accuracy
        ? 'MAPE = ' + num.fmt(result.accuracy.mape, 2) + '%   MAD = ' + num.fmt(result.accuracy.mad, 4) +
          '   MSD = ' + num.fmt(result.accuracy.msd, 4) : opts.subtitle,
      height: opts.height || 300,
      x: { label: opts.xLabel || 'Periodo' },
      y: { label: opts.yLabel || 'Valore' },
      series: series
    });
  }

  /* ===================== PCA / MULTIVARIATA ===================== */
  function screePlot(target, pca, opts) {
    opts = opts || {};
    return ch.render(target, {
      title: 'Scree plot',
      subtitle: 'componenti con autovalore > 1: ' + pca.kaiser,
      height: opts.height || 250,
      x: { label: 'Componente', type: 'band', categories: pca.components.map(function (c) { return 'PC' + c.index; }) },
      y: { label: 'Autovalore', includeZero: true },
      series: [{
        type: 'line', name: 'Autovalore',
        points: pca.components.map(function (c, i) {
          return { x: i, y: c.eigenvalue, label: 'PC' + c.index, info: num.fmt(100 * c.proportion, 1) + '% della varianza' };
        }),
        color: ch.seriesColor(0), markerSize: 5
      }],
      annotations: [{ type: 'hline', y: 1, label: 'criterio di Kaiser', color: ch.pal().muted }],
      legend: false
    });
  }

  function scorePlot(target, pca, opts) {
    opts = opts || {};
    var groups = opts.groups;
    var series;
    if (groups) {
      var levels = [];
      groups.forEach(function (g) { if (levels.indexOf(String(g)) < 0) levels.push(String(g)); });
      series = levels.slice(0, 8).map(function (lv, i) {
        return {
          type: 'points', name: lv, color: ch.seriesColor(i), markerSize: 4.5,
          points: pca.scores.map(function (s, k) {
            return String(groups[pca.rowsUsed[k]]) === lv ? { x: s[0], y: s[1], label: lv } : null;
          }).filter(Boolean)
        };
      });
    } else {
      series = [{
        type: 'points', name: 'Osservazioni', color: ch.seriesColor(0), markerSize: 4.5,
        points: pca.scores.map(function (s, k) { return { x: s[0], y: s[1], label: 'oss. ' + (pca.rowsUsed[k] + 1) }; })
      }];
    }
    return ch.render(target, {
      title: 'Score plot (PC1 vs PC2)',
      subtitle: 'PC1 ' + num.fmt(100 * pca.components[0].proportion, 1) + '%, PC2 ' +
        num.fmt(100 * pca.components[1].proportion, 1) + '% della varianza',
      height: opts.height || 320,
      x: { label: 'PC1', gridlines: true },
      y: { label: 'PC2' },
      series: series,
      annotations: [
        { type: 'hline', y: 0, color: ch.pal().muted },
        { type: 'vline', x: 0, color: ch.pal().muted }
      ]
    });
  }

  function loadingPlot(target, pca, opts) {
    opts = opts || {};
    return ch.render(target, {
      title: 'Loading plot (PC1 vs PC2)',
      height: opts.height || 320,
      x: { label: 'PC1', gridlines: true },
      y: { label: 'PC2' },
      series: [{
        type: 'segments', name: 'Variabili',
        segments: pca.cols.map(function (c, i) {
          return {
            x1: 0, y1: 0,
            x2: pca.components[0].loadings[i], y2: pca.components[1].loadings[i],
            color: ch.seriesColor(0), width: 1.6
          };
        })
      }, {
        type: 'points', name: 'Variabili', hideFromLegend: true,
        points: pca.cols.map(function (c, i) {
          return { x: pca.components[0].loadings[i], y: pca.components[1].loadings[i], label: c };
        }),
        color: ch.seriesColor(0), markerSize: 4
      }],
      annotations: [
        { type: 'hline', y: 0, color: ch.pal().muted },
        { type: 'vline', x: 0, color: ch.pal().muted }
      ],
      legend: false
    });
  }

  /* ===================== CURVE DI POTENZA / OC ===================== */
  function powerCurvePlot(target, curves, opts) {
    opts = opts || {};
    return ch.render(target, {
      title: opts.title || 'Curva di potenza',
      subtitle: opts.subtitle,
      height: opts.height || 300,
      x: { label: opts.xLabel || 'Differenza da rilevare', gridlines: true },
      y: { label: 'Potenza', domain: [0, 1.02] },
      series: curves.map(function (c, i) {
        return {
          type: 'line', name: c.name, marker: false, width: 2,
          points: c.points.map(function (p) { return { x: p.delta, y: p.power, label: c.name }; }),
          color: ch.seriesColor(i)
        };
      }),
      annotations: [{ type: 'hline', y: 0.8, label: 'potenza 0,80', color: ch.pal().muted }]
    });
  }

  function ocCurvePlot(target, plan, opts) {
    opts = opts || {};
    return ch.render(target, {
      title: 'Curva OC del piano n = ' + plan.n + ', c = ' + plan.c,
      subtitle: 'Pa(AQL = ' + num.fmt(100 * plan.aql, 2) + '%) = ' + num.fmt(plan.pAcceptAQL, 3) +
        '   Pa(RQL = ' + num.fmt(100 * plan.rql, 2) + '%) = ' + num.fmt(plan.pAcceptRQL, 3),
      height: opts.height || 300,
      x: { label: 'Frazione difettosa del lotto', gridlines: true },
      y: { label: 'Probabilità di accettazione', domain: [0, 1.02] },
      series: [{
        type: 'line', name: 'Pa', marker: false, width: 2,
        points: plan.oc.map(function (o) { return { x: o.p, y: o.pAccept }; }),
        color: ch.seriesColor(0)
      }],
      annotations: [
        { type: 'vline', x: plan.aql, label: 'AQL', color: ch.pal().status.good },
        { type: 'vline', x: plan.rql, label: 'RQL', kind: 'spec' }
      ],
      legend: false
    });
  }

  /* ===================== KPI / DASHBOARD ===================== */
  /** Tile con numero grande, delta e sparkline. */
  function kpiTile(target, spec) {
    var container = typeof target === 'string' ? document.querySelector(target) : target;
    var p = ch.pal();
    var div = document.createElement('div');
    div.className = 'c3-kpi';
    var status = (spec.status && spec.statusLabel)
      ? '<span class="c3-kpi-status ' + spec.status + '">' + spec.statusLabel + '</span>' : '';
    div.innerHTML =
      '<div class="c3-kpi-label">' + spec.label + '</div>' +
      '<div class="c3-kpi-value">' + spec.value + (spec.unit ? '<span class="c3-kpi-unit">' + spec.unit + '</span>' : '') + '</div>' +
      (spec.sub ? '<div class="c3-kpi-sub">' + spec.sub + '</div>' : '') + status;
    container.appendChild(div);
    if (spec.spark && spec.spark.length > 1) {
      var w = 160, h = 34;
      var svg = ch.el('svg', { width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, class: 'c3-spark' }, div);
      var lo = Math.min.apply(null, spec.spark), hi = Math.max.apply(null, spec.spark);
      var d = spec.spark.map(function (v, i) {
        var x = i / (spec.spark.length - 1) * (w - 2) + 1;
        var y = h - 2 - (v - lo) / ((hi - lo) || 1) * (h - 4);
        return (i ? 'L' : 'M') + x + ',' + y;
      }).join('');
      ch.el('path', { d: d, fill: 'none', stroke: spec.sparkColor || ch.seriesColor(0), 'stroke-width': 1.8 }, svg);
    }
    return div;
  }

  /* ===================== GRAFICI GENERICI (dashboard) ===================== */
  /** Grafico a barre generico da aggregazione. */
  function barChart(target, rows, opts) {
    opts = opts || {};
    var horiz = opts.orientation === 'h';
    var cats = rows.map(function (r) { return String(r.label); });
    var groupNames = opts.groupNames || null;
    var series;
    if (groupNames) {
      series = groupNames.map(function (gn, gi) {
        return {
          type: 'bars', name: gn, groupCount: groupNames.length, groupIndex: gi,
          orientation: opts.orientation,
          points: rows.map(function (r, i) { return { x: i, y: r.values[gi], label: r.label }; }),
          color: ch.seriesColor(gi)
        };
      });
    } else {
      series = [{
        type: 'bars', name: opts.valueLabel || 'Valore', orientation: opts.orientation,
        points: rows.map(function (r, i) { return { x: i, y: r.value, label: r.label, color: r.color }; }),
        color: ch.seriesColor(0), valueLabels: opts.valueLabels, hideFromLegend: true
      }];
    }
    var spec = {
      title: opts.title, subtitle: opts.subtitle,
      height: opts.height, width: opts.width,
      margin: horiz ? { left: 110, right: 40, top: 10, bottom: 40 } : { left: 62, right: 20, top: 10, bottom: cats.some(function (c) { return c.length > 6; }) ? 72 : 44 },
      series: series
    };
    if (horiz) {
      spec.x = { label: opts.valueLabel || 'Valore', includeZero: true, gridlines: true };
      spec.y = {
        domain: [-0.6, rows.length - 0.4], ticks: rows.length, gridlines: false,
        format: function (v) { var i = Math.round(v); return cats[i] || ''; }
      };
      series.forEach(function (s) { s.barWidth = 18; });
    } else {
      spec.x = { type: 'band', categories: cats, rotate: opts.rotate, label: opts.xLabel };
      spec.y = { label: opts.valueLabel || 'Valore', includeZero: true };
    }
    return ch.render(target, spec);
  }

  /** Grafico a linee generico (una o più serie). */
  function lineChart(target, seriesList, opts) {
    opts = opts || {};
    return ch.render(target, {
      title: opts.title, subtitle: opts.subtitle,
      height: opts.height, width: opts.width,
      x: opts.xBand ? { type: 'band', categories: opts.categories, label: opts.xLabel, rotate: opts.rotate }
        : { label: opts.xLabel, gridlines: true },
      y: { label: opts.yLabel, includeZero: opts.includeZero },
      series: seriesList.map(function (s, i) {
        return {
          type: s.type || 'line', name: s.name, points: s.points,
          color: s.color || ch.seriesColor(i), markerSize: s.markerSize == null ? 3.4 : s.markerSize,
          marker: s.marker, dash: s.dash, opacity: s.opacity
        };
      })
    });
  }

  C3.plots = {
    histogram: histogram, boxplot: boxplot, individualValuePlot: individualValuePlot,
    probabilityPlot: probabilityPlot, scatter: scatter, correlationHeatmap: correlationHeatmap,
    controlChart: controlChart, capabilityChart: capabilityChart, paretoChart: paretoChart,
    intervalPlot: intervalPlot, comparisonPlot: comparisonPlot, residualPlots: residualPlots,
    effectsPareto: effectsPareto, effectsNormalPlot: effectsNormalPlot,
    mainEffectsPlot: mainEffectsPlot, interactionPlots: interactionPlots, cubePlot: cubePlot,
    contourPlot: contourPlot, surfacePlot: surfacePlot, gageRRCharts: gageRRCharts,
    timeSeriesPlot: timeSeriesPlot, screePlot: screePlot, scorePlot: scorePlot,
    loadingPlot: loadingPlot, powerCurvePlot: powerCurvePlot, ocCurvePlot: ocCurvePlot,
    kpiTile: kpiTile, barChart: barChart, lineChart: lineChart
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
