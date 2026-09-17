/* CLAUDIO v3 - core/control.js
 * Carte di controllo (SPC): variabili e attributi, costanti calcolate
 * numericamente (d2 per quadratura, c4 esatto), 8 test di Nelson, fasi/stage,
 * stime di sigma within, EWMA e CUSUM.
 */
;(function (root, name, deps, factory) {
  var res = deps.map(function (d) {
    return (typeof module === 'object' && module.exports && typeof require === 'function')
      ? require('./' + d + '.js') : root.C3[d];
  });
  var api = factory.apply(null, res);
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.C3 = root.C3 || {})[name] = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, 'control', ['numeric', 'dist', 'stats'], function (num, dist, st) {
  'use strict';

  /* ===================== COSTANTI DI CARTA ===================== */
  var d2cache = {};
  /** d2(n) = E[range di n normali standard], per quadratura. */
  function d2(n) {
    if (n < 2) return NaN;
    if (d2cache[n]) return d2cache[n];
    var f = function (x) {
      var F = dist.normal.cdf(x, 0, 1);
      return 1 - Math.pow(F, n) - Math.pow(1 - F, n);
    };
    var v = num.integrate(f, -9, 9, 120);
    d2cache[n] = v;
    return v;
  }

  /** d3(n) = deviazione standard del range di n normali standard (tabella ASTM). */
  var D3TAB = {
    2: 0.8525, 3: 0.8884, 4: 0.8798, 5: 0.8641, 6: 0.8480, 7: 0.8332, 8: 0.8198,
    9: 0.8078, 10: 0.7971, 11: 0.7873, 12: 0.7785, 13: 0.7704, 14: 0.7630,
    15: 0.7562, 16: 0.7499, 17: 0.7441, 18: 0.7386, 19: 0.7335, 20: 0.7287,
    21: 0.7242, 22: 0.7199, 23: 0.7159, 24: 0.7121, 25: 0.7084
  };
  function d3(n) {
    if (D3TAB[n]) return D3TAB[n];
    // extrapolazione lenta per n > 25
    return 0.7084 * Math.pow(25 / n, 0.12);
  }

  /** c4(n) esatto: E[s]/sigma. */
  function c4(n) {
    if (n < 2) return NaN;
    return Math.sqrt(2 / (n - 1)) * Math.exp(num.lgamma(n / 2) - num.lgamma((n - 1) / 2));
  }

  /** Costanti derivate delle carte di Shewhart. */
  function constants(n) {
    var _d2 = d2(n), _d3 = d3(n), _c4 = c4(n);
    return {
      n: n, d2: _d2, d3: _d3, c4: _c4,
      A2: 3 / (_d2 * Math.sqrt(n)),
      A3: 3 / (_c4 * Math.sqrt(n)),
      D3: Math.max(0, 1 - 3 * _d3 / _d2),
      D4: 1 + 3 * _d3 / _d2,
      B3: Math.max(0, 1 - 3 * Math.sqrt(1 - _c4 * _c4) / _c4),
      B4: 1 + 3 * Math.sqrt(1 - _c4 * _c4) / _c4,
      E2: 3 / _d2,
      d2Div: _d2
    };
  }

  /* ===================== TEST DI NELSON ===================== */
  var NELSON_DEFAULT = {
    1: { on: true, k: 3, label: '1 punto oltre 3 sigma' },
    2: { on: true, k: 9, label: '9 punti consecutivi dallo stesso lato della linea centrale' },
    3: { on: true, k: 6, label: '6 punti consecutivi tutti crescenti o tutti decrescenti' },
    4: { on: false, k: 14, label: '14 punti consecutivi alternati su e giu' },
    5: { on: true, k: 2, label: '2 su 3 punti oltre 2 sigma, stesso lato' },
    6: { on: true, k: 4, label: '4 su 5 punti oltre 1 sigma, stesso lato' },
    7: { on: false, k: 15, label: '15 punti consecutivi entro 1 sigma' },
    8: { on: false, k: 8, label: '8 punti consecutivi oltre 1 sigma, entrambi i lati' }
  };

  /**
   * Applica i test di Nelson.
   * points: [{value, cl, sigma}] (sigma = deviazione standard del punto, puo variare con n)
   * Ritorna array di array: per ogni punto la lista dei test violati.
   */
  function nelsonTests(points, opts) {
    opts = opts || {};
    var cfg = {};
    Object.keys(NELSON_DEFAULT).forEach(function (k) {
      cfg[k] = Object.assign({}, NELSON_DEFAULT[k], (opts.tests && opts.tests[k]) || {});
    });
    var n = points.length;
    var flags = [];
    for (var i = 0; i < n; i++) flags.push([]);
    var zs = points.map(function (p) {
      if (p.value == null || !isFinite(p.value) || !p.sigma) return null;
      return (p.value - p.cl) / p.sigma;
    });
    var valid = function (i) { return zs[i] !== null && isFinite(zs[i]); };
    var i2, j, run;

    // Test 1
    if (cfg[1].on) {
      for (i2 = 0; i2 < n; i2++) {
        if (valid(i2) && Math.abs(zs[i2]) > cfg[1].k) flags[i2].push(1);
      }
    }
    // Test 2: k punti dallo stesso lato
    if (cfg[2].on) {
      run = 0;
      var sign = 0;
      for (i2 = 0; i2 < n; i2++) {
        if (!valid(i2) || zs[i2] === 0) { run = 0; sign = 0; continue; }
        var s = zs[i2] > 0 ? 1 : -1;
        if (s === sign) run++; else { sign = s; run = 1; }
        if (run >= cfg[2].k) {
          for (j = i2 - cfg[2].k + 1; j <= i2; j++) flags[j].push(2);
        }
      }
    }
    // Test 3: k punti monotoni
    if (cfg[3].on) {
      var up = 1, dn = 1;
      for (i2 = 1; i2 < n; i2++) {
        if (!valid(i2) || !valid(i2 - 1)) { up = dn = 1; continue; }
        if (points[i2].value > points[i2 - 1].value) { up++; dn = 1; }
        else if (points[i2].value < points[i2 - 1].value) { dn++; up = 1; }
        else { up = dn = 1; }
        if (up >= cfg[3].k || dn >= cfg[3].k) {
          var len = Math.max(up, dn);
          for (j = i2 - len + 1; j <= i2; j++) flags[j].push(3);
        }
      }
    }
    // Test 4: k punti alternati
    if (cfg[4].on) {
      var alt = 1;
      for (i2 = 2; i2 < n; i2++) {
        if (!valid(i2) || !valid(i2 - 1) || !valid(i2 - 2)) { alt = 1; continue; }
        var d1 = points[i2 - 1].value - points[i2 - 2].value;
        var d22 = points[i2].value - points[i2 - 1].value;
        if (d1 * d22 < 0) alt++; else alt = 1;
        if (alt + 1 >= cfg[4].k) {
          for (j = i2 - cfg[4].k + 1; j <= i2; j++) if (j >= 0) flags[j].push(4);
        }
      }
    }
    // Test 5: 2 su 3 oltre 2 sigma stesso lato
    if (cfg[5].on) {
      for (i2 = 2; i2 < n; i2++) {
        ['pos', 'neg'].forEach(function (side) {
          var c = 0, idxs = [];
          for (j = i2 - 2; j <= i2; j++) {
            if (!valid(j)) return;
            if (side === 'pos' ? zs[j] > 2 : zs[j] < -2) { c++; idxs.push(j); }
          }
          if (c >= 2) idxs.forEach(function (k2) { if (flags[k2].indexOf(5) < 0) flags[k2].push(5); });
        });
      }
    }
    // Test 6: 4 su 5 oltre 1 sigma stesso lato
    if (cfg[6].on) {
      for (i2 = 4; i2 < n; i2++) {
        ['pos', 'neg'].forEach(function (side) {
          var c = 0, idxs = [];
          for (j = i2 - 4; j <= i2; j++) {
            if (!valid(j)) return;
            if (side === 'pos' ? zs[j] > 1 : zs[j] < -1) { c++; idxs.push(j); }
          }
          if (c >= 4) idxs.forEach(function (k2) { if (flags[k2].indexOf(6) < 0) flags[k2].push(6); });
        });
      }
    }
    // Test 7: k punti entro 1 sigma
    if (cfg[7].on) {
      run = 0;
      for (i2 = 0; i2 < n; i2++) {
        if (valid(i2) && Math.abs(zs[i2]) < 1) run++; else run = 0;
        if (run >= cfg[7].k) {
          for (j = i2 - cfg[7].k + 1; j <= i2; j++) flags[j].push(7);
        }
      }
    }
    // Test 8: k punti oltre 1 sigma (entrambi i lati)
    if (cfg[8].on) {
      run = 0;
      for (i2 = 0; i2 < n; i2++) {
        if (valid(i2) && Math.abs(zs[i2]) > 1) run++; else run = 0;
        if (run >= cfg[8].k) {
          for (j = i2 - cfg[8].k + 1; j <= i2; j++) flags[j].push(8);
        }
      }
    }
    return { flags: flags, config: cfg };
  }

  function testLabel(t) { return NELSON_DEFAULT[t] ? NELSON_DEFAULT[t].label : 'test ' + t; }

  /* ===================== SUPPORTO SOTTOGRUPPI ===================== */
  /**
   * Costruisce i sottogruppi.
   * opts: { size: n } oppure { by: [etichette] }. Se size = 1 -> individuali.
   */
  function makeSubgroups(values, opts) {
    opts = opts || {};
    var vals = values.map(function (v) {
      return typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    });
    var groups = [];
    if (opts.by) {
      var order = [], mapObj = {};
      for (var i = 0; i < vals.length; i++) {
        var k = String(opts.by[i]);
        if (!mapObj[k]) { mapObj[k] = []; order.push(k); }
        if (isFinite(vals[i])) mapObj[k].push(vals[i]);
      }
      order.forEach(function (k) { groups.push({ label: k, values: mapObj[k] }); });
    } else {
      var size = opts.size || 1;
      for (var j = 0; j < vals.length; j += size) {
        var chunk = vals.slice(j, j + size).filter(isFinite);
        if (chunk.length) groups.push({ label: String(groups.length + 1), values: chunk });
      }
    }
    return groups;
  }

  /* ===================== CARTE PER VARIABILI ===================== */
  /**
   * Carta Xbar-R / Xbar-S / I-MR generica.
   * spec: { values, size|by, type:'xbar-r'|'xbar-s'|'i-mr', stages:[indici],
   *         mu, sigma (fissati), sigmaMethod:'rbar'|'sbar'|'pooled'|'mssd'|'mrbar',
   *         tests, mrLength }
   */
  function variableChart(spec) {
    var type = spec.type || 'auto';
    var groups = spec.groups || makeSubgroups(spec.values, { size: spec.size, by: spec.by });
    var nAvg = st.mean(groups.map(function (g) { return g.values.length; }));
    if (type === 'auto') type = nAvg <= 1.0001 ? 'i-mr' : (nAvg >= 9 ? 'xbar-s' : 'xbar-r');
    if (type === 'i-mr') return imrChart(spec, groups);

    var stages = buildStages(groups.length, spec.stages);
    var primary = [], secondary = [];
    var meta = [];

    stages.forEach(function (stg) {
      var sub = groups.slice(stg.from, stg.to + 1);
      var ns = sub.map(function (g) { return g.values.length; });
      var means = sub.map(function (g) { return st.mean(g.values); });
      var ranges = sub.map(function (g) { return st.range(g.values); });
      var sds = sub.map(function (g) { return g.values.length > 1 ? st.sd(g.values) : 0; });
      var nbar = st.mean(ns);
      var xbarbar = spec.mu != null ? spec.mu : weightedMean(means, ns);
      var rbar = st.mean(ranges), sbar = st.mean(sds);
      // stima sigma within
      var sigma = spec.sigma != null ? spec.sigma : estimateSigmaWithin(sub, spec.sigmaMethod || (type === 'xbar-s' ? 'sbar' : 'rbar'));
      meta.push({
        from: stg.from, to: stg.to, xbarbar: xbarbar, rbar: rbar, sbar: sbar,
        sigma: sigma, nbar: nbar
      });
      sub.forEach(function (g, i) {
        var n = g.values.length;
        var sePoint = sigma / Math.sqrt(n);
        primary.push({
          index: stg.from + i, label: g.label, value: means[i],
          cl: xbarbar, sigma: sePoint,
          ucl: xbarbar + 3 * sePoint, lcl: xbarbar - 3 * sePoint,
          n: n, stage: stg.id
        });
        if (type === 'xbar-s') {
          var cc = c4(n);
          var clS = cc * sigma;
          var sdS = sigma * Math.sqrt(Math.max(0, 1 - cc * cc));
          secondary.push({
            index: stg.from + i, label: g.label, value: sds[i],
            cl: clS, sigma: sdS,
            ucl: clS + 3 * sdS, lcl: Math.max(0, clS - 3 * sdS), n: n, stage: stg.id
          });
        } else {
          var k = constants(n);
          var clR = k.d2 * sigma;
          var sdR = k.d3 * sigma;
          secondary.push({
            index: stg.from + i, label: g.label, value: ranges[i],
            cl: clR, sigma: sdR,
            ucl: clR + 3 * sdR, lcl: Math.max(0, clR - 3 * sdR), n: n, stage: stg.id
          });
        }
      });
    });

    var t1 = nelsonTests(primary, spec);
    var t2 = nelsonTests(secondary, { tests: { 2: { on: false }, 3: { on: false }, 4: { on: false }, 5: { on: false }, 6: { on: false }, 7: { on: false }, 8: { on: false } } });
    primary.forEach(function (p, i) { p.violations = t1.flags[i]; });
    secondary.forEach(function (p, i) { p.violations = t2.flags[i]; });

    return {
      type: type,
      titlePrimary: 'Carta Xbar',
      titleSecondary: type === 'xbar-s' ? 'Carta S' : 'Carta R',
      primary: primary, secondary: secondary, stages: meta,
      groups: groups,
      sigmaWithin: meta[0].sigma,
      outOfControl: primary.filter(function (p) { return p.violations.length; }).length +
        secondary.filter(function (p) { return p.violations.length; }).length,
      testConfig: t1.config
    };
  }

  function weightedMean(v, w) {
    var s = 0, sw = 0;
    for (var i = 0; i < v.length; i++) { s += v[i] * w[i]; sw += w[i]; }
    return s / sw;
  }

  /** Stima di sigma within con i metodi standard. */
  function estimateSigmaWithin(groups, method) {
    var ns = groups.map(function (g) { return g.values.length; });
    var nbar = st.mean(ns);
    if (method === 'sbar') {
      var sds = groups.map(function (g) { return g.values.length > 1 ? st.sd(g.values) : 0; });
      // media pesata dei c4 (approccio Minitab per n costante)
      if (ns.every(function (n) { return n === ns[0]; })) return st.mean(sds) / c4(ns[0]);
      var num1 = 0, den = 0;
      groups.forEach(function (g, i) {
        if (g.values.length > 1) { num1 += c4(g.values.length) * st.sd(g.values); den += c4(g.values.length) * c4(g.values.length); }
      });
      return num1 / den;
    }
    if (method === 'pooled') {
      var ss = 0, df = 0;
      groups.forEach(function (g) {
        if (g.values.length > 1) {
          var m = st.mean(g.values);
          g.values.forEach(function (v) { ss += (v - m) * (v - m); });
          df += g.values.length - 1;
        }
      });
      var sp = Math.sqrt(ss / df);
      return sp / c4(df + 1);
    }
    // rbar (default)
    var ranges = groups.map(function (g) { return st.range(g.values); });
    if (ns.every(function (n) { return n === ns[0]; })) return st.mean(ranges) / d2(ns[0]);
    var acc = 0, cnt = 0;
    groups.forEach(function (g, i) {
      if (g.values.length > 1) { acc += st.range(g.values) / d2(g.values.length); cnt++; }
    });
    return acc / cnt;
  }

  /** Carta I-MR (individuali e range mobile). */
  function imrChart(spec, groupsIn) {
    var groups = groupsIn || makeSubgroups(spec.values, { size: 1 });
    var x = groups.map(function (g) { return g.values.length ? g.values[0] : NaN; });
    var labels = groups.map(function (g) { return g.label; });
    var mrLen = spec.mrLength || 2;
    var stages = buildStages(x.length, spec.stages);
    var ind = [], mr = [], meta = [];

    stages.forEach(function (stg) {
      var xs = x.slice(stg.from, stg.to + 1).filter(isFinite);
      var mrs = [];
      for (var i = 1; i < xs.length; i++) {
        var w = xs.slice(Math.max(0, i - mrLen + 1), i + 1);
        mrs.push(st.range(w));
      }
      var center = spec.mu != null ? spec.mu : st.mean(xs);
      var method = spec.sigmaMethod || 'mrbar';
      var sigma;
      if (spec.sigma != null) sigma = spec.sigma;
      else if (method === 'mssd') {
        var ssd = 0;
        for (var j = 1; j < xs.length; j++) ssd += Math.pow(xs[j] - xs[j - 1], 2);
        sigma = Math.sqrt(ssd / (2 * (xs.length - 1))) / c4Mssd(xs.length);
      } else if (method === 'medianmr') {
        sigma = st.median(mrs) / 0.954;
      } else {
        sigma = st.mean(mrs) / d2(mrLen);
      }
      meta.push({ from: stg.from, to: stg.to, center: center, sigma: sigma, mrbar: st.mean(mrs) });
      var kMR = constants(mrLen);
      for (var p = stg.from; p <= stg.to; p++) {
        ind.push({
          index: p, label: labels[p], value: x[p], cl: center, sigma: sigma,
          ucl: center + 3 * sigma, lcl: center - 3 * sigma, n: 1, stage: stg.id
        });
      }
      var mrbarTheo = kMR.d2 * sigma;
      for (var q = stg.from; q <= stg.to; q++) {
        var rel = q - stg.from;
        var val = rel === 0 ? null : (isFinite(x[q]) && isFinite(x[q - 1]) ? st.range(x.slice(Math.max(stg.from, q - mrLen + 1), q + 1).filter(isFinite)) : null);
        mr.push({
          index: q, label: labels[q], value: val, cl: mrbarTheo,
          sigma: kMR.d3 * sigma,
          ucl: mrbarTheo + 3 * kMR.d3 * sigma,
          lcl: Math.max(0, mrbarTheo - 3 * kMR.d3 * sigma), n: mrLen, stage: stg.id
        });
      }
    });

    var t1 = nelsonTests(ind, spec);
    var t2 = nelsonTests(mr, { tests: { 2: { on: false }, 3: { on: false }, 4: { on: false }, 5: { on: false }, 6: { on: false }, 7: { on: false }, 8: { on: false } } });
    ind.forEach(function (p, i) { p.violations = t1.flags[i]; });
    mr.forEach(function (p, i) { p.violations = t2.flags[i]; });

    return {
      type: 'i-mr', titlePrimary: 'Carta Individuali', titleSecondary: 'Carta Range Mobile',
      primary: ind, secondary: mr, stages: meta, groups: groups,
      sigmaWithin: meta[0].sigma,
      outOfControl: ind.filter(function (p) { return p.violations.length; }).length +
        mr.filter(function (p) { return p.violations.length; }).length,
      testConfig: t1.config
    };
  }

  /** Costante di correzione per MSSD. */
  function c4Mssd(n) {
    // approssimazione: c4 con gdl effettivi (2(n-1)/3 + 1)
    var dfEff = 2 * (n - 1) / 3;
    return c4(dfEff + 1);
  }

  function buildStages(n, stagesSpec) {
    if (!stagesSpec || !stagesSpec.length) return [{ id: 0, from: 0, to: n - 1 }];
    var cuts = stagesSpec.slice().filter(function (c) { return c > 0 && c < n; }).sort(function (a, b) { return a - b; });
    var out = [], prev = 0;
    cuts.forEach(function (c, i) {
      out.push({ id: i, from: prev, to: c - 1 });
      prev = c;
    });
    out.push({ id: out.length, from: prev, to: n - 1 });
    return out;
  }

  /* ===================== CARTE PER ATTRIBUTI ===================== */
  /**
   * p, np, c, u (+ varianti Laney p' e u' per sovradispersione).
   * spec: { counts, sizes, type:'p'|'np'|'c'|'u'|'p-laney'|'u-laney', target }
   */
  function attributeChart(spec) {
    var type = spec.type || 'p';
    var counts = spec.counts.map(Number);
    var sizes = spec.sizes ? spec.sizes.map(Number) : counts.map(function () { return 1; });
    var labels = spec.labels || counts.map(function (_, i) { return String(i + 1); });
    var points = [];
    var totalC = 0, totalN = 0;
    for (var i = 0; i < counts.length; i++) {
      if (!isFinite(counts[i])) continue;
      totalC += counts[i]; totalN += sizes[i];
    }
    var cbar, sigmaZ = 1, laney = null;

    if (type === 'p' || type === 'np' || type === 'p-laney') {
      var pbar = spec.target != null ? spec.target : totalC / totalN;
      if (type === 'p-laney') laney = laneySigmaZ(counts, sizes, pbar, 'p');
      for (i = 0; i < counts.length; i++) {
        var n = sizes[i];
        var sd = Math.sqrt(pbar * (1 - pbar) / n) * (laney ? laney.sigmaZ : 1);
        var val = type === 'np' ? counts[i] : counts[i] / n;
        var cl = type === 'np' ? pbar * n : pbar;
        var sdv = type === 'np' ? sd * n : sd;
        points.push({
          index: i, label: labels[i], value: val, cl: cl, sigma: sdv,
          ucl: type === 'np' ? Math.min(n, cl + 3 * sdv) : Math.min(1, cl + 3 * sdv),
          lcl: Math.max(0, cl - 3 * sdv), n: n
        });
      }
      cbar = pbar;
    } else {
      // c oppure u
      var isU = type === 'u' || type === 'u-laney';
      var ubar = spec.target != null ? spec.target : (isU ? totalC / totalN : totalC / counts.length);
      if (type === 'u-laney') laney = laneySigmaZ(counts, sizes, ubar, 'u');
      for (i = 0; i < counts.length; i++) {
        var ni = isU ? sizes[i] : 1;
        var value = isU ? counts[i] / ni : counts[i];
        var sdc = Math.sqrt(ubar / ni) * (laney ? laney.sigmaZ : 1);
        points.push({
          index: i, label: labels[i], value: value, cl: ubar, sigma: sdc,
          ucl: ubar + 3 * sdc, lcl: Math.max(0, ubar - 3 * sdc), n: ni
        });
      }
      cbar = ubar;
    }
    var t = nelsonTests(points, spec);
    points.forEach(function (p, i) { p.violations = t.flags[i]; });
    return {
      type: type,
      titlePrimary: { p: 'Carta p', np: 'Carta np', c: 'Carta c', u: 'Carta u', 'p-laney': "Carta p' (Laney)", 'u-laney': "Carta u' (Laney)" }[type],
      primary: points, secondary: null,
      center: cbar, laney: laney, totalCount: totalC, totalSize: totalN,
      outOfControl: points.filter(function (p) { return p.violations.length; }).length,
      testConfig: t.config,
      overdispersion: overdispersionTest(counts, sizes, cbar, type)
    };
  }

  /** sigma Z di Laney (correzione per sovra/sottodispersione). */
  function laneySigmaZ(counts, sizes, pbar, kind) {
    var z = [], i;
    for (i = 0; i < counts.length; i++) {
      var n = sizes[i];
      var sd = kind === 'p' ? Math.sqrt(pbar * (1 - pbar) / n) : Math.sqrt(pbar / n);
      var val = counts[i] / n;
      z.push((val - pbar) / sd);
    }
    var mrs = [];
    for (i = 1; i < z.length; i++) mrs.push(Math.abs(z[i] - z[i - 1]));
    var sigmaZ = st.mean(mrs) / 1.128;
    return { sigmaZ: sigmaZ, zScores: z, mrbar: st.mean(mrs) };
  }

  /** Test di sovradispersione (rapporto varianza osservata / attesa). */
  function overdispersionTest(counts, sizes, center, type) {
    var i, chi = 0, k = 0;
    for (i = 0; i < counts.length; i++) {
      var n = sizes[i] || 1;
      var expv, varv;
      if (type.indexOf('p') === 0) { expv = center * n; varv = n * center * (1 - center); }
      else { expv = center * n; varv = center * n; }
      if (varv > 0) { chi += Math.pow(counts[i] - expv, 2) / varv; k++; }
    }
    var df = k - 1;
    return {
      ratio: chi / df, chisq: chi, df: df,
      p: 1 - dist.chisq.cdf(chi, df),
      verdict: chi / df > 1.5 ? 'sovradispersione: valuta carta di Laney' :
        (chi / df < 0.5 ? 'sottodispersione' : 'dispersione coerente col modello')
    };
  }

  /* ===================== CARTE AD ALTA SENSIBILITA ===================== */
  /** EWMA. */
  function ewmaChart(spec) {
    var groups = spec.groups || makeSubgroups(spec.values, { size: spec.size || 1, by: spec.by });
    var lambda = spec.lambda || 0.2, L = spec.L || 3;
    var means = groups.map(function (g) { return st.mean(g.values); });
    var ns = groups.map(function (g) { return g.values.length; });
    var center = spec.mu != null ? spec.mu : st.mean(means);
    var sigma = spec.sigma != null ? spec.sigma
      : (ns[0] > 1 ? estimateSigmaWithin(groups, spec.sigmaMethod || 'rbar')
        : (function () {
          var mrs = [];
          for (var i = 1; i < means.length; i++) mrs.push(Math.abs(means[i] - means[i - 1]));
          return st.mean(mrs) / 1.128;
        })());
    var z = center, points = [];
    for (var i = 0; i < means.length; i++) {
      z = lambda * means[i] + (1 - lambda) * z;
      var sd = sigma / Math.sqrt(ns[i]) * Math.sqrt(lambda / (2 - lambda) * (1 - Math.pow(1 - lambda, 2 * (i + 1))));
      points.push({
        index: i, label: groups[i].label, value: z, raw: means[i], cl: center, sigma: sd,
        ucl: center + L * sd, lcl: center - L * sd, n: ns[i],
        violations: Math.abs(z - center) > L * sd ? [1] : []
      });
    }
    return {
      type: 'ewma', titlePrimary: 'Carta EWMA (lambda = ' + lambda + ')',
      primary: points, secondary: null, lambda: lambda, sigmaWithin: sigma, center: center,
      outOfControl: points.filter(function (p) { return p.violations.length; }).length
    };
  }

  /** CUSUM tabulare (one-sided pair) con h e k in unita di sigma. */
  function cusumChart(spec) {
    var groups = spec.groups || makeSubgroups(spec.values, { size: spec.size || 1, by: spec.by });
    var means = groups.map(function (g) { return st.mean(g.values); });
    var ns = groups.map(function (g) { return g.values.length; });
    var target = spec.target != null ? spec.target : st.mean(means);
    var sigma = spec.sigma != null ? spec.sigma
      : (ns[0] > 1 ? estimateSigmaWithin(groups, spec.sigmaMethod || 'rbar')
        : (function () {
          var mrs = [];
          for (var i = 1; i < means.length; i++) mrs.push(Math.abs(means[i] - means[i - 1]));
          return st.mean(mrs) / 1.128;
        })());
    var h = spec.h || 4, k = spec.k == null ? 0.5 : spec.k;
    var cp = 0, cm = 0, points = [];
    for (var i = 0; i < means.length; i++) {
      var se = sigma / Math.sqrt(ns[i]);
      var zi = (means[i] - target) / se;
      cp = Math.max(0, cp + zi - k);
      cm = Math.max(0, cm - zi - k);
      points.push({
        index: i, label: groups[i].label, value: cp, valueLow: -cm,
        cl: 0, sigma: 1, ucl: h, lcl: -h, n: ns[i],
        violations: (cp > h || cm > h) ? [1] : []
      });
    }
    return {
      type: 'cusum', titlePrimary: 'Carta CUSUM (h=' + h + ', k=' + k + ')',
      primary: points, secondary: null, target: target, sigmaWithin: sigma, h: h, k: k,
      outOfControl: points.filter(function (p) { return p.violations.length; }).length
    };
  }

  /** Media mobile. */
  function movingAverageChart(spec) {
    var groups = spec.groups || makeSubgroups(spec.values, { size: spec.size || 1, by: spec.by });
    var means = groups.map(function (g) { return st.mean(g.values); });
    var w = spec.w || 3;
    var center = spec.mu != null ? spec.mu : st.mean(means);
    var sigma = spec.sigma != null ? spec.sigma : (function () {
      var mrs = [];
      for (var i = 1; i < means.length; i++) mrs.push(Math.abs(means[i] - means[i - 1]));
      return st.mean(mrs) / 1.128;
    })();
    var points = [];
    for (var i = 0; i < means.length; i++) {
      var lo = Math.max(0, i - w + 1);
      var win = means.slice(lo, i + 1);
      var m = st.mean(win);
      var sd = sigma / Math.sqrt(win.length);
      points.push({
        index: i, label: groups[i].label, value: m, cl: center, sigma: sd,
        ucl: center + 3 * sd, lcl: center - 3 * sd, n: win.length,
        violations: Math.abs(m - center) > 3 * sd ? [1] : []
      });
    }
    return {
      type: 'ma', titlePrimary: 'Carta media mobile (w=' + w + ')',
      primary: points, secondary: null, center: center, sigmaWithin: sigma,
      outOfControl: points.filter(function (p) { return p.violations.length; }).length
    };
  }

  /** Carta Z-MR per produzioni a lotti brevi (standardizzata per prodotto). */
  function zmrChart(spec) {
    var byProd = {}, order = [];
    for (var i = 0; i < spec.values.length; i++) {
      var k = String(spec.by[i]);
      if (!byProd[k]) { byProd[k] = []; order.push(k); }
      byProd[k].push(parseFloat(spec.values[i]));
    }
    var z = [], labels = [], prodStats = {};
    order.forEach(function (k) {
      var v = byProd[k].filter(isFinite);
      var m = st.mean(v);
      var mrs = [];
      for (var j = 1; j < v.length; j++) mrs.push(Math.abs(v[j] - v[j - 1]));
      var sg = mrs.length ? st.mean(mrs) / 1.128 : st.sd(v);
      prodStats[k] = { mean: m, sigma: sg, n: v.length };
      v.forEach(function (x) { z.push((x - m) / sg); labels.push(k); });
    });
    var spec2 = { values: z, size: 1, sigma: 1, mu: 0, tests: spec.tests };
    var ch = imrChart(spec2);
    ch.type = 'z-mr';
    ch.titlePrimary = 'Carta Z (standardizzata)';
    ch.titleSecondary = 'Carta MR standardizzata';
    ch.prodStats = prodStats;
    ch.primary.forEach(function (p, i) { p.label = labels[i]; });
    ch.secondary.forEach(function (p, i) { p.label = labels[i]; });
    return ch;
  }

  /** Riepilogo violazioni per la stampa. */
  function summarizeViolations(chart) {
    var out = [];
    ['primary', 'secondary'].forEach(function (key) {
      var arr = chart[key];
      if (!arr) return;
      var byTest = {};
      arr.forEach(function (p) {
        (p.violations || []).forEach(function (t) {
          (byTest[t] = byTest[t] || []).push(p.label != null ? p.label : p.index + 1);
        });
      });
      Object.keys(byTest).forEach(function (t) {
        out.push({
          chart: key === 'primary' ? chart.titlePrimary : chart.titleSecondary,
          test: Number(t), label: testLabel(Number(t)), points: byTest[t]
        });
      });
    });
    return out;
  }

  /** ARL per carta di Shewhart con shift di delta sigma e sottogruppi n. */
  function arlShewhart(delta, n, k) {
    k = k == null ? 3 : k;
    var d = delta * Math.sqrt(n);
    var beta = dist.normal.cdf(k - d) - dist.normal.cdf(-k - d);
    return 1 / (1 - beta);
  }

  return {
    d2: d2, d3: d3, c4: c4, constants: constants,
    nelsonTests: nelsonTests, NELSON_DEFAULT: NELSON_DEFAULT, testLabel: testLabel,
    makeSubgroups: makeSubgroups, estimateSigmaWithin: estimateSigmaWithin,
    variableChart: variableChart, imrChart: imrChart, attributeChart: attributeChart,
    laneySigmaZ: laneySigmaZ, ewmaChart: ewmaChart, cusumChart: cusumChart,
    movingAverageChart: movingAverageChart, zmrChart: zmrChart,
    summarizeViolations: summarizeViolations, arlShewhart: arlShewhart,
    buildStages: buildStages
  };
});
