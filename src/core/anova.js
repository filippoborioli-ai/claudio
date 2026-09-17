/* CLAUDIO v3 - core/anova.js
 * ANOVA a una via (classica e di Welch), ANOVA a piu vie tramite GLM,
 * confronti multipli (Tukey, Fisher LSD, Bonferroni, Sidak, Games-Howell, Dunnett),
 * distribuzione del range studentizzato calcolata per quadratura,
 * componenti della varianza per disegni bilanciati (crossed / nested).
 */
;(function (root, name, deps, factory) {
  var res = deps.map(function (d) {
    return (typeof module === 'object' && module.exports && typeof require === 'function')
      ? require('./' + d + '.js') : root.C3[d];
  });
  var api = factory.apply(null, res);
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.C3 = root.C3 || {})[name] = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, 'anova', ['numeric', 'dist', 'stats', 'tests', 'regression'],
function (num, dist, st, T, reg) {
  'use strict';

  /* ============ distribuzione del range studentizzato ============ */
  /** P(range studentizzato di k medie normali < q) con df = infinito. */
  function prangeInf(q, k) {
    if (q <= 0) return 0;
    var f = function (z) {
      var a = dist.normal.cdf(z) - dist.normal.cdf(z - q);
      if (a <= 0) return 0;
      return dist.normal.pdf(z, 0, 1) * Math.pow(a, k - 1);
    };
    return num.clamp(k * num.integrate(f, -8.5, 8.5, 80), 0, 1);
  }

  /** P(q_{k,df} < q): integra prangeInf sulla densita di s = sqrt(chi2_df/df). */
  function ptukey(q, k, df) {
    if (q <= 0) return 0;
    if (!isFinite(df) || df > 25000) return prangeInf(q, k);
    var lc = (df / 2) * Math.log(df / 2) - num.lgamma(df / 2);
    var fs = function (s) {
      if (s <= 0) return 0;
      // densita di s: 2 * (df/2)^(df/2) / Gamma(df/2) * s^(df-1) * exp(-df s^2 / 2)
      var logd = Math.log(2) + lc + (df - 1) * Math.log(s) - df * s * s / 2;
      var d = Math.exp(logd);
      if (!isFinite(d) || d < 1e-14) return 0;
      return d * prangeInf(q * s, k);
    };
    var hi = 1 + 8 / Math.sqrt(df) + 4 / df;
    return num.clamp(num.integrate(fs, 1e-8, hi, 60), 0, 1);
  }

  /** Quantile del range studentizzato. */
  function qtukey(p, k, df) {
    var f = function (q) { return ptukey(q, k, df) - p; };
    var lo = 0.1, hi = 2 + 4 * Math.sqrt(Math.log(k + 1));
    while (f(hi) < 0 && hi < 200) hi *= 1.5;
    return num.brent(f, lo, hi, 1e-8);
  }

  /* ==================== ANOVA A UNA VIA ==================== */
  /**
   * groups: [{level, values}] oppure array di array.
   * opts: { conf, compare: 'tukey'|'fisher'|'bonferroni'|'sidak'|'gh'|'dunnett', control }
   */
  function oneWay(groupsIn, opts) {
    opts = opts || {};
    var conf = opts.conf == null ? 0.95 : opts.conf;
    var groups = groupsIn.map(function (g, i) {
      var v = st.clean(Array.isArray(g) ? g : g.values);
      return { level: (!Array.isArray(g) && g.level != null) ? String(g.level) : 'G' + (i + 1), values: v };
    }).filter(function (g) { return g.values.length > 0; });
    var k = groups.length;
    var N = 0, i, j;
    groups.forEach(function (g) { N += g.values.length; });
    var grand = 0;
    groups.forEach(function (g) { grand += st.sum(g.values); });
    grand /= N;
    var ssb = 0, ssw = 0;
    var rows = groups.map(function (g) {
      var n = g.values.length, m = st.mean(g.values), s = st.sd(g.values);
      ssb += n * (m - grand) * (m - grand);
      g.values.forEach(function (v) { ssw += (v - m) * (v - m); });
      return { level: g.level, n: n, mean: m, sd: s, se: s / Math.sqrt(n), values: g.values };
    });
    var dfb = k - 1, dfw = N - k;
    var msb = ssb / dfb, msw = ssw / dfw;
    var F = msb / msw, p = 1 - dist.F.cdf(F, dfb, dfw);
    var sPooled = Math.sqrt(msw);
    // IC per gruppo con sigma pooled
    var tc = dist.t.inv(1 - (1 - conf) / 2, dfw);
    rows.forEach(function (r) {
      var sep = sPooled / Math.sqrt(r.n);
      r.ciPooled = [r.mean - tc * sep, r.mean + tc * sep];
      var tci = dist.t.inv(1 - (1 - conf) / 2, r.n - 1);
      r.ciIndiv = r.n > 1 ? [r.mean - tci * r.se, r.mean + tci * r.se] : [NaN, NaN];
    });
    var out = {
      title: 'ANOVA a una via', k: k, N: N, rows: rows,
      ss: { between: ssb, within: ssw, total: ssb + ssw },
      df: { between: dfb, within: dfw, total: N - 1 },
      ms: { between: msb, within: msw },
      F: F, p: p, sPooled: sPooled,
      r2: ssb / (ssb + ssw),
      r2adj: 1 - (ssw / dfw) / ((ssb + ssw) / (N - 1)),
      grandMean: grand, conf: conf,
      welch: welchAnova(groups),
      levene: T.levene(groups.map(function (g) { return g.values; })),
      bartlett: T.bartlett(groups.map(function (g) { return g.values; })),
      etaSq: ssb / (ssb + ssw),
      omegaSq: (ssb - dfb * msw) / (ssb + ssw + msw)
    };
    out.comparisons = multipleComparisons(rows, msw, dfw, opts);
    return out;
  }

  /** ANOVA di Welch (varianze diverse). */
  function welchAnova(groups) {
    var k = groups.length, w = [], m = [], n = [], i;
    var sumW = 0, sumWM = 0;
    for (i = 0; i < k; i++) {
      var g = groups[i].values || groups[i];
      var ni = g.length, mi = st.mean(g), vi = st.variance(g);
      n.push(ni); m.push(mi);
      var wi = ni / vi;
      w.push(wi); sumW += wi; sumWM += wi * mi;
    }
    var mBar = sumWM / sumW;
    var numer = 0, lam = 0;
    for (i = 0; i < k; i++) {
      numer += w[i] * Math.pow(m[i] - mBar, 2);
      lam += Math.pow(1 - w[i] / sumW, 2) / (n[i] - 1);
    }
    lam = lam * 3 / (k * k - 1);
    var F = (numer / (k - 1)) / (1 + 2 * (k - 2) / (k * k - 1) * lam * (k * k - 1) / 3 * 0 + 1e-300);
    // formula standard di Welch
    var A = numer / (k - 1);
    var B = 1 + (2 * (k - 2) / (k * k - 1)) * (lam * (k * k - 1) / 3);
    F = A / B;
    var df2 = (k * k - 1) / (3 * lam);
    return {
      title: 'ANOVA di Welch', F: F, df1: k - 1, df2: df2,
      p: 1 - dist.F.cdf(F, k - 1, df2)
    };
  }

  /** Confronti multipli fra coppie di gruppi. */
  function multipleComparisons(rows, msw, dfw, opts) {
    opts = opts || {};
    var method = opts.compare || 'tukey';
    var conf = opts.conf == null ? 0.95 : opts.conf;
    var alpha = 1 - conf;
    var k = rows.length;
    var pairs = [];
    var nPairs = k * (k - 1) / 2;
    var sPooled = Math.sqrt(msw);
    var i, j;
    // moltiplicatore per il metodo
    var qcrit = method === 'tukey' ? qtukey(conf, k, dfw) : null;
    var dunnettCrit = null;
    if (method === 'dunnett') dunnettCrit = dunnettCritical(k - 1, dfw, conf);
    for (i = 0; i < k; i++) {
      for (j = i + 1; j < k; j++) {
        var a = rows[i], b = rows[j];
        if (method === 'dunnett') {
          var ctrl = opts.control != null ? String(opts.control) : rows[0].level;
          if (a.level !== ctrl && b.level !== ctrl) continue;
        }
        var diff = a.mean - b.mean;
        var seD, dfUse = dfw, pv, crit, label;
        if (method === 'gh') {
          seD = Math.sqrt(a.sd * a.sd / a.n + b.sd * b.sd / b.n);
          dfUse = Math.pow(a.sd * a.sd / a.n + b.sd * b.sd / b.n, 2) /
            (Math.pow(a.sd * a.sd / a.n, 2) / (a.n - 1) + Math.pow(b.sd * b.sd / b.n, 2) / (b.n - 1));
          var qgh = qtukey(conf, k, dfUse);
          crit = qgh / Math.SQRT2 * seD;
          pv = 1 - ptukey(Math.abs(diff) / seD * Math.SQRT2, k, dfUse);
          label = 'Games-Howell';
        } else if (method === 'tukey') {
          seD = sPooled * Math.sqrt(0.5 * (1 / a.n + 1 / b.n));
          crit = qcrit * seD;
          pv = 1 - ptukey(Math.abs(diff) / seD, k, dfw);
          label = 'Tukey';
        } else if (method === 'bonferroni') {
          seD = sPooled * Math.sqrt(1 / a.n + 1 / b.n);
          crit = dist.t.inv(1 - alpha / (2 * nPairs), dfw) * seD;
          pv = Math.min(1, nPairs * 2 * (1 - dist.t.cdf(Math.abs(diff) / seD, dfw)));
          label = 'Bonferroni';
        } else if (method === 'sidak') {
          seD = sPooled * Math.sqrt(1 / a.n + 1 / b.n);
          var aS = 1 - Math.pow(1 - alpha, 1 / nPairs);
          crit = dist.t.inv(1 - aS / 2, dfw) * seD;
          pv = 1 - Math.pow(1 - 2 * (1 - dist.t.cdf(Math.abs(diff) / seD, dfw)), nPairs);
          label = 'Sidak';
        } else if (method === 'dunnett') {
          seD = sPooled * Math.sqrt(1 / a.n + 1 / b.n);
          crit = dunnettCrit * seD;
          pv = dunnettP(Math.abs(diff) / seD, k - 1, dfw);
          label = 'Dunnett';
        } else {
          seD = sPooled * Math.sqrt(1 / a.n + 1 / b.n);
          crit = dist.t.inv(1 - alpha / 2, dfw) * seD;
          pv = 2 * (1 - dist.t.cdf(Math.abs(diff) / seD, dfw));
          label = 'Fisher LSD';
        }
        pairs.push({
          a: a.level, b: b.level, diff: diff, se: seD, df: dfUse,
          ci: [diff - crit, diff + crit], p: num.clamp(pv, 0, 1),
          significant: Math.abs(diff) > crit, method: label,
          t: diff / seD
        });
      }
    }
    return { method: method, pairs: pairs, familyConf: conf, qcrit: qcrit };
  }

  /* --------- Dunnett via Monte Carlo (deterministico) --------- */
  var dunnettCache = {};
  function dunnettSim(kTreat, df, nsim) {
    var key = kTreat + '_' + Math.round(df) + '_' + nsim;
    if (dunnettCache[key]) return dunnettCache[key];
    var r = num.rng(20240917);
    var maxes = new Array(nsim);
    for (var s = 0; s < nsim; s++) {
      var chi = dist.chisq.rand(r, df);
      var sdiv = Math.sqrt(chi / df);
      var z0 = r.normal(0, 1), mx = 0;
      for (var i = 0; i < kTreat; i++) {
        var zi = r.normal(0, 1);
        var tval = Math.abs((zi - z0) / Math.SQRT2 / sdiv);
        if (tval > mx) mx = tval;
      }
      maxes[s] = mx;
    }
    maxes.sort(function (a, b) { return a - b; });
    dunnettCache[key] = maxes;
    return maxes;
  }

  function dunnettCritical(kTreat, df, conf) {
    var m = dunnettSim(kTreat, df, 20000);
    return st.quantile(m, conf, 7);
  }

  function dunnettP(tobs, kTreat, df) {
    var m = dunnettSim(kTreat, df, 20000);
    var lo = 0, hi = m.length - 1;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (m[mid] < tobs) lo = mid + 1; else hi = mid;
    }
    return 1 - lo / m.length;
  }

  /* ==================== ANOVA A PIU VIE ==================== */
  /**
   * ANOVA fattoriale generale via GLM (Type III).
   * spec: { data, y, factors: ['A','B'], covariates: [], interactions: true|['A*B'], random: ['B'] }
   */
  function factorialAnova(spec) {
    var factors = spec.factors || [];
    var covs = spec.covariates || [];
    var terms = factors.slice().concat(covs);
    if (spec.interactions === true) {
      for (var i = 0; i < factors.length; i++) {
        for (var j = i + 1; j < factors.length; j++) terms.push(factors[i] + '*' + factors[j]);
      }
      if (factors.length >= 3) terms.push(factors.join('*'));
    } else if (Array.isArray(spec.interactions)) {
      terms = terms.concat(spec.interactions);
    }
    var cat = {};
    factors.forEach(function (f) { cat[f] = true; });
    var fit = reg.glm({ data: spec.data, y: spec.y, terms: terms.join(' + '), categorical: cat });
    fit.title = 'ANOVA fattoriale';
    fit.factors = factors;
    fit.means = {};
    factors.forEach(function (f) {
      fit.means[f] = reg.lsmeans(fit, f, spec);
    });
    return fit;
  }

  /**
   * Componenti della varianza per disegno bilanciato completamente incrociato
   * o annidato a 2 livelli (usato da Gage R&R e da studi di capacita).
   * Dati: y, factorA, factorB (annidato in A se nested=true), n replicati.
   */
  function varianceComponents(y, fa, fb, opts) {
    opts = opts || {};
    var nested = !!opts.nested;
    var cells = {}, aLev = [], bLev = [];
    for (var i = 0; i < y.length; i++) {
      var v = parseFloat(y[i]);
      if (!isFinite(v)) continue;
      var a = String(fa[i]), b = String(fb[i]);
      if (aLev.indexOf(a) < 0) aLev.push(a);
      if (bLev.indexOf(b) < 0) bLev.push(b);
      var key = a + '' + b;
      (cells[key] = cells[key] || []).push(v);
    }
    aLev.sort(); bLev.sort();
    var a2 = aLev.length, b2 = bLev.length;
    var nrep = null, balanced = true;
    Object.keys(cells).forEach(function (k) {
      if (nrep === null) nrep = cells[k].length;
      else if (cells[k].length !== nrep) balanced = false;
    });
    if (!balanced) return { balanced: false };
    var all = [];
    Object.keys(cells).forEach(function (k) { all = all.concat(cells[k]); });
    var grand = st.mean(all), N = all.length;
    var ssA = 0, ssB = 0, ssAB = 0, ssE = 0;
    var meanA = {}, meanB = {}, meanCell = {};
    aLev.forEach(function (a) {
      var vals = [];
      bLev.forEach(function (b) { vals = vals.concat(cells[a + '' + b] || []); });
      meanA[a] = st.mean(vals);
    });
    bLev.forEach(function (b) {
      var vals = [];
      aLev.forEach(function (a) { vals = vals.concat(cells[a + '' + b] || []); });
      meanB[b] = st.mean(vals);
    });
    aLev.forEach(function (a) {
      bLev.forEach(function (b) {
        var c = cells[a + '' + b] || [];
        meanCell[a + '|' + b] = st.mean(c);
        c.forEach(function (v) { ssE += Math.pow(v - meanCell[a + '|' + b], 2); });
        if (!nested) {
          ssAB += nrep * Math.pow(meanCell[a + '|' + b] - meanA[a] - meanB[b] + grand, 2);
        }
      });
      ssA += b2 * nrep * Math.pow(meanA[a] - grand, 2);
    });
    if (nested) {
      // B annidato in A: SS(B in A)
      ssB = 0;
      aLev.forEach(function (a) {
        bLev.forEach(function (b) {
          var c = cells[a + '' + b];
          if (c) ssB += nrep * Math.pow(meanCell[a + '|' + b] - meanA[a], 2);
        });
      });
    } else {
      bLev.forEach(function (b) { ssB += a2 * nrep * Math.pow(meanB[b] - grand, 2); });
    }
    var dfA = a2 - 1;
    var dfB = nested ? a2 * (b2 - 1) : b2 - 1;
    var dfAB = nested ? 0 : dfA * (b2 - 1);
    var dfE = N - a2 * b2;
    var msA = ssA / dfA, msB = ssB / dfB, msAB = dfAB ? ssAB / dfAB : null, msE = ssE / dfE;
    // componenti (modello a effetti casuali)
    var varE = msE;
    var varAB = msAB != null ? Math.max(0, (msAB - msE) / nrep) : 0;
    var varA, varB;
    if (nested) {
      varB = Math.max(0, (msB - msE) / nrep);
      varA = Math.max(0, (msA - msB) / (b2 * nrep));
    } else {
      varA = Math.max(0, (msA - (msAB != null ? msAB : msE)) / (b2 * nrep));
      varB = Math.max(0, (msB - (msAB != null ? msAB : msE)) / (a2 * nrep));
    }
    var table = [
      { source: 'A', df: dfA, ss: ssA, ms: msA, F: msAB != null ? msA / msAB : msA / msE },
      { source: nested ? 'B(A)' : 'B', df: dfB, ss: ssB, ms: msB, F: msAB != null && !nested ? msB / msAB : msB / msE }
    ];
    if (msAB != null) table.push({ source: 'A*B', df: dfAB, ss: ssAB, ms: msAB, F: msAB / msE });
    table.push({ source: 'Errore', df: dfE, ss: ssE, ms: msE, F: null });
    table.forEach(function (r) {
      if (r.F == null) return;
      var dfDen = r.source === 'A' && msAB != null ? dfAB : (r.source === 'A*B' ? dfE : (msAB != null && !nested && r.source === 'B' ? dfAB : dfE));
      r.p = 1 - dist.F.cdf(r.F, r.df, dfDen);
      r.dfDen = dfDen;
    });
    return {
      balanced: true, nested: nested, a: a2, b: b2, nrep: nrep, N: N,
      table: table,
      components: { A: varA, B: varB, AB: varAB, error: varE },
      total: varA + varB + varAB + varE,
      levelsA: aLev, levelsB: bLev, cells: cells, meanCell: meanCell,
      meanA: meanA, meanB: meanB, grand: grand
    };
  }

  /** Dati per interval plot / grafico degli effetti principali. */
  function intervalPlotData(groups, opts) {
    opts = opts || {};
    var conf = opts.conf || 0.95;
    return groups.map(function (g, i) {
      var v = st.clean(Array.isArray(g) ? g : g.values);
      var m = st.mean(v), s = st.sd(v), n = v.length;
      var tc = dist.t.inv(1 - (1 - conf) / 2, Math.max(1, n - 1));
      return {
        level: (!Array.isArray(g) && g.level != null) ? String(g.level) : 'G' + (i + 1),
        n: n, mean: m, sd: s, se: s / Math.sqrt(n),
        lower: m - tc * s / Math.sqrt(n), upper: m + tc * s / Math.sqrt(n)
      };
    });
  }

  return {
    prangeInf: prangeInf, ptukey: ptukey, qtukey: qtukey,
    oneWay: oneWay, welchAnova: welchAnova, multipleComparisons: multipleComparisons,
    dunnettCritical: dunnettCritical, factorialAnova: factorialAnova,
    varianceComponents: varianceComponents, intervalPlotData: intervalPlotData
  };
});
