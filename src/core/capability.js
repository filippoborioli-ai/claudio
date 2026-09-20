/* CLAUDIO v3 - core/capability.js
 * Analisi di capacità: Cp/Cpk (within) e Pp/Ppk (overall), Cpm, Z.bench,
 * PPM osservati/attesi, livello sigma, capacità non normale (distribuzione fittata
 * o trasformazione), capacità per attributi (binomiale e Poisson),
 * intervalli di confidenza degli indici.
 */
;(function (root, name, deps, factory) {
  var res = deps.map(function (d) {
    return (typeof module === 'object' && module.exports && typeof require === 'function')
      ? require('./' + d + '.js') : root.C3[d];
  });
  var api = factory.apply(null, res);
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.C3 = root.C3 || {})[name] = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, 'capability', ['numeric', 'dist', 'stats', 'control'],
function (num, dist, st, ctrl) {
  'use strict';

  /** Converte PPM in livello sigma (con shift di 1.5) e viceversa. */
  function ppmToSigma(ppm, shift) {
    shift = shift == null ? 1.5 : shift;
    var p = num.clamp(ppm / 1e6, 1e-12, 1 - 1e-12);
    return dist.qnorm(1 - p) + shift;
  }

  function sigmaToPpm(sigmaLevel, shift) {
    shift = shift == null ? 1.5 : shift;
    return (1 - dist.normal.cdf(sigmaLevel - shift)) * 1e6;
  }

  /**
   * Capacità normale.
   * spec: { values, lsl, usl, target, subgroupSize|by, sigmaMethod, conf, boxcox, sigmaWithin }
   */
  function normalCapability(spec) {
    var x = st.clean(spec.values);
    var n = x.length;
    var lsl = spec.lsl == null ? null : Number(spec.lsl);
    var usl = spec.usl == null ? null : Number(spec.usl);
    var target = spec.target == null ? null : Number(spec.target);
    var conf = spec.conf == null ? 0.95 : spec.conf;
    var mean = st.mean(x), sdOverall = st.sd(x);

    // sigma within
    var groups = spec.groups || ctrl.makeSubgroups(spec.values, {
      size: spec.subgroupSize || 1, by: spec.by
    });
    var sigmaWithin;
    if (spec.sigmaWithin != null) sigmaWithin = spec.sigmaWithin;
    else if ((spec.subgroupSize || 1) > 1) sigmaWithin = ctrl.estimateSigmaWithin(groups, spec.sigmaMethod || 'rbar');
    else {
      var mrs = [];
      for (var i = 1; i < x.length; i++) mrs.push(Math.abs(x[i] - x[i - 1]));
      sigmaWithin = st.mean(mrs) / ctrl.d2(2);
    }
    if (!isFinite(sigmaWithin) || sigmaWithin <= 0) sigmaWithin = sdOverall;

    var within = indices(mean, sigmaWithin, lsl, usl, target);
    var overall = indices(mean, sdOverall, lsl, usl, target);

    // PPM osservati
    var obsBelow = lsl != null ? x.filter(function (v) { return v < lsl; }).length : 0;
    var obsAbove = usl != null ? x.filter(function (v) { return v > usl; }).length : 0;

    // intervalli di confidenza (within)
    var dfW = spec.subgroupSize && spec.subgroupSize > 1
      ? (groups.length * (spec.subgroupSize - 1)) : (n - 1);
    var a = (1 - conf) / 2;
    var ciCp = [
      within.cp * Math.sqrt(dist.chisq.inv(a, dfW) / dfW),
      within.cp * Math.sqrt(dist.chisq.inv(1 - a, dfW) / dfW)
    ];
    var seCpk = Math.sqrt(1 / (9 * n) + within.cpk * within.cpk / (2 * (n - 1)));
    var zc = dist.qnorm(1 - a);
    var ciCpk = [within.cpk - zc * seCpk, within.cpk + zc * seCpk];
    var sePpk = Math.sqrt(1 / (9 * n) + overall.cpk * overall.cpk / (2 * (n - 1)));
    var ciPpk = [overall.cpk - zc * sePpk, overall.cpk + zc * sePpk];

    var ad = st.andersonDarling(x);
    return {
      kind: 'normale',
      n: n, mean: mean, sdOverall: sdOverall, sigmaWithin: sigmaWithin,
      lsl: lsl, usl: usl, target: target, conf: conf,
      within: within, overall: overall,
      observed: {
        below: obsBelow, above: obsAbove,
        ppmBelow: 1e6 * obsBelow / n, ppmAbove: 1e6 * obsAbove / n,
        ppmTotal: 1e6 * (obsBelow + obsAbove) / n
      },
      ci: { cp: ciCp, cpk: ciCpk, ppk: ciPpk, dfWithin: dfW },
      normality: ad,
      subgroupSize: spec.subgroupSize || 1,
      groups: groups,
      values: x,
      sigmaLevel: ppmToSigma(overall.ppmTotal),
      sigmaLevelWithin: ppmToSigma(within.ppmTotal),
      histogram: st.histogram(x, { bins: spec.bins })
    };
  }

  /** Indici per una data coppia (mu, sigma). */
  function indices(mean, sigma, lsl, usl, target) {
    var cp = (lsl != null && usl != null) ? (usl - lsl) / (6 * sigma) : NaN;
    var cpu = usl != null ? (usl - mean) / (3 * sigma) : NaN;
    var cpl = lsl != null ? (mean - lsl) / (3 * sigma) : NaN;
    var cpk = (isFinite(cpu) && isFinite(cpl)) ? Math.min(cpu, cpl) : (isFinite(cpu) ? cpu : cpl);
    var cpm = NaN;
    if (target != null && lsl != null && usl != null) {
      var tau = Math.sqrt(sigma * sigma + Math.pow(mean - target, 2));
      cpm = (usl - lsl) / (6 * tau);
    }
    var pLow = lsl != null ? dist.normal.cdf(lsl, mean, sigma) : 0;
    var pHigh = usl != null ? 1 - dist.normal.cdf(usl, mean, sigma) : 0;
    var pTot = num.clamp(pLow + pHigh, 1e-15, 1);
    var k = (lsl != null && usl != null)
      ? 100 * Math.abs(mean - (lsl + usl) / 2) / ((usl - lsl) / 2) : NaN;
    return {
      cp: cp, cpu: cpu, cpl: cpl, cpk: cpk, cpm: cpm,
      zLower: lsl != null ? (mean - lsl) / sigma : NaN,
      zUpper: usl != null ? (usl - mean) / sigma : NaN,
      zBench: dist.qnorm(1 - pTot),
      ppmBelow: pLow * 1e6, ppmAbove: pHigh * 1e6, ppmTotal: pTot * 1e6,
      yield: 100 * (1 - pTot), k: k, sigma: sigma
    };
  }

  /**
   * Capacità non normale.
   * method: 'dist' (fit distribuzione) | 'boxcox' | 'johnson'
   * distKey: chiave di dist.continuous (weibull, lognormal, gamma, exponential, logistic, sev)
   */
  function nonNormalCapability(spec) {
    var x = st.clean(spec.values);
    var lsl = spec.lsl == null ? null : Number(spec.lsl);
    var usl = spec.usl == null ? null : Number(spec.usl);
    var method = spec.method || 'dist';
    var n = x.length;

    if (method === 'boxcox' || method === 'johnson') {
      var tr, inv, lam = null, label;
      if (method === 'boxcox') {
        lam = spec.lambda != null ? spec.lambda : st.boxCoxLambda(x);
        tr = function (arr) { return st.boxCox(arr, lam); };
        inv = function (arr) { return st.boxCoxInverse(arr, lam); };
        label = 'Box-Cox (lambda = ' + num.round(lam, 3) + ')';
      } else {
        var j = st.johnson(x);
        if (!j) return null;
        tr = j.fit.transform;
        inv = j.fit.inverse;
        label = 'Johnson ' + j.family;
      }
      var z = tr(x).filter(isFinite);
      var sub = spec.subgroupSize || 1;
      var capN = normalCapability({
        values: z,
        lsl: lsl != null ? tr([lsl])[0] : null,
        usl: usl != null ? tr([usl])[0] : null,
        target: spec.target != null ? tr([spec.target])[0] : null,
        subgroupSize: sub, conf: spec.conf
      });
      capN.kind = 'trasformata: ' + label;
      capN.transform = { label: label, lambda: lam, transform: tr, inverse: inv };
      capN.originalValues = x;
      capN.originalLimits = { lsl: lsl, usl: usl, target: spec.target };
      capN.histogram = st.histogram(x, { bins: spec.bins });
      return capN;
    }

    // fit di una distribuzione
    var key = spec.distKey || 'weibull';
    var d = dist.continuous[key];
    var params = spec.params || (d.fit ? d.fit(x) : null);
    var pLow = lsl != null ? dist.cdfOf(d, lsl, params) : 0;
    var pHigh = usl != null ? 1 - dist.cdfOf(d, usl, params) : 0;
    var pTot = num.clamp(pLow + pHigh, 1e-15, 1);
    // percentili ISO per gli indici
    var p00135 = dist.invOf(d, 0.00135, params);
    var p99865 = dist.invOf(d, 0.99865, params);
    var med = dist.invOf(d, 0.5, params);
    var pp = (lsl != null && usl != null) ? (usl - lsl) / (p99865 - p00135) : NaN;
    var ppu = usl != null ? (usl - med) / (p99865 - med) : NaN;
    var ppl = lsl != null ? (med - lsl) / (med - p00135) : NaN;
    var ppk = (isFinite(ppu) && isFinite(ppl)) ? Math.min(ppu, ppl) : (isFinite(ppu) ? ppu : ppl);
    var obsBelow = lsl != null ? x.filter(function (v) { return v < lsl; }).length : 0;
    var obsAbove = usl != null ? x.filter(function (v) { return v > usl; }).length : 0;
    return {
      kind: 'non normale: ' + d.label,
      n: n, distKey: key, dist: d, params: params,
      mean: st.mean(x), sdOverall: st.sd(x),
      lsl: lsl, usl: usl, target: spec.target,
      percentiles: { p00135: p00135, median: med, p99865: p99865 },
      overall: {
        pp: pp, ppu: ppu, ppl: ppl, ppk: ppk,
        ppmBelow: pLow * 1e6, ppmAbove: pHigh * 1e6, ppmTotal: pTot * 1e6,
        zBench: dist.qnorm(1 - pTot), yield: 100 * (1 - pTot)
      },
      observed: {
        below: obsBelow, above: obsAbove,
        ppmTotal: 1e6 * (obsBelow + obsAbove) / n
      },
      ad: st.adGeneric(x, d, params),
      sigmaLevel: ppmToSigma(pTot * 1e6),
      values: x,
      histogram: st.histogram(x, { bins: spec.bins })
    };
  }

  /** Identificazione della distribuzione migliore fra quelle continue disponibili. */
  function bestDistribution(valuesIn, candidates) {
    var x = st.clean(valuesIn);
    var keys = candidates || Object.keys(dist.continuous);
    var out = [];
    keys.forEach(function (k) {
      var d = dist.continuous[k];
      if (!d || !d.fit) return;
      if ((k === 'weibull' || k === 'lognormal' || k === 'gamma' || k === 'exponential') &&
        st.min(x) <= 0) return;
      var params;
      try { params = d.fit(x); } catch (e) { return; }
      if (!params || params.some(function (p) { return !isFinite(p); })) return;
      var A2 = st.adGeneric(x, d, params);
      var ll = 0;
      x.forEach(function (v) {
        var pdf = dist.pdfOf(d, v, params);
        ll += Math.log(Math.max(1e-300, pdf));
      });
      out.push({
        key: k, label: d.label, params: params, ad: A2,
        logLik: ll, aic: -2 * ll + 2 * params.length,
        p: k === 'normal' ? st.andersonDarling(x).p : null
      });
    });
    out.sort(function (a, b) { return a.ad - b.ad; });
    return out;
  }

  /**
   * Capacità per attributi - binomiale (% difettosi).
   * spec: { defectives: [], sizes: [], target }
   */
  function binomialCapability(spec) {
    var d = spec.defectives.map(Number), n = spec.sizes.map(Number);
    var totD = 0, totN = 0, i;
    for (i = 0; i < d.length; i++) { totD += d[i]; totN += n[i]; }
    var p = totD / totN;
    var conf = spec.conf == null ? 0.95 : spec.conf;
    var a = (1 - conf) / 2;
    var lo = totD === 0 ? 0 : dist.beta.inv(a, totD, totN - totD + 1);
    var hi = totD === totN ? 1 : dist.beta.inv(1 - a, totD + 1, totN - totD);
    var chart = ctrl.attributeChart({ counts: d, sizes: n, type: 'p' });
    return {
      kind: 'attributi - binomiale',
      totalDefectives: totD, totalInspected: totN,
      pDefective: p, pctDefective: 100 * p, ppm: p * 1e6,
      ci: [lo, hi], ciPct: [100 * lo, 100 * hi],
      zBench: dist.qnorm(1 - num.clamp(p, 1e-12, 1 - 1e-12)),
      sigmaLevel: ppmToSigma(p * 1e6),
      yield: 100 * (1 - p),
      target: spec.target,
      chart: chart,
      rates: d.map(function (v, k) { return { index: k, n: n[k], defectives: v, rate: v / n[k] }; }),
      cumulative: (function () {
        var cd = 0, cn = 0;
        return d.map(function (v, k) {
          cd += v; cn += n[k];
          return { index: k, p: cd / cn };
        });
      })()
    };
  }

  /**
   * Capacità per attributi - Poisson (difetti per unità).
   * spec: { defects: [], sizes: [] }
   */
  function poissonCapability(spec) {
    var c = spec.defects.map(Number);
    var n = spec.sizes ? spec.sizes.map(Number) : c.map(function () { return 1; });
    var totC = 0, totN = 0, i;
    for (i = 0; i < c.length; i++) { totC += c[i]; totN += n[i]; }
    var dpu = totC / totN;
    var conf = spec.conf == null ? 0.95 : spec.conf;
    var a = (1 - conf) / 2;
    var lo = totC === 0 ? 0 : dist.chisq.inv(a, 2 * totC) / 2 / totN;
    var hi = dist.chisq.inv(1 - a, 2 * (totC + 1)) / 2 / totN;
    return {
      kind: 'attributi - Poisson',
      totalDefects: totC, totalUnits: totN, dpu: dpu,
      ci: [lo, hi],
      dpmo: spec.opportunities ? dpu / spec.opportunities * 1e6 : null,
      pZeroDefects: Math.exp(-dpu),
      yield: 100 * Math.exp(-dpu),
      sigmaLevel: ppmToSigma((1 - Math.exp(-dpu)) * 1e6),
      chart: ctrl.attributeChart({ counts: c, sizes: n, type: 'u' }),
      rates: c.map(function (v, k) { return { index: k, n: n[k], defects: v, dpu: v / n[k] }; })
    };
  }

  /**
   * Confronto within/overall in stile "Process Capability Sixpack":
   * restituisce i pezzi pronti per la vista (carte + capacità + normalità).
   */
  function sixpack(spec) {
    var sub = spec.subgroupSize || 1;
    var chart = sub > 1
      ? ctrl.variableChart({ values: spec.values, size: sub, type: sub >= 9 ? 'xbar-s' : 'xbar-r' })
      : ctrl.imrChart({ values: spec.values });
    var cap = normalCapability(spec);
    var x = st.clean(spec.values);
    return {
      chart: chart, capability: cap,
      probPlot: st.probPlotPoints(x, dist.normal),
      lastPoints: chart.primary.slice(-25),
      normality: st.andersonDarling(x),
      histogram: cap.histogram
    };
  }

  /** Valutazione qualitativa dell’indice. */
  function verdict(cpk) {
    if (!isFinite(cpk)) return { level: 'n/d', text: 'indice non calcolabile' };
    if (cpk < 0.67) return { level: 'critico', text: 'processo non capace: intervento immediato' };
    if (cpk < 1.0) return { level: 'scarso', text: 'processo non capace: molti scarti attesi' };
    if (cpk < 1.33) return { level: 'marginale', text: 'capacità marginale: serve controllo strettissimo' };
    if (cpk < 1.67) return { level: 'adeguato', text: 'capacità adeguata (riferimento industriale 1,33)' };
    if (cpk < 2.0) return { level: 'buono', text: 'capacità buona (verso il livello 5 sigma)' };
    return { level: 'eccellente', text: 'capacità eccellente (livello 6 sigma)' };
  }

  return {
    ppmToSigma: ppmToSigma, sigmaToPpm: sigmaToPpm,
    normalCapability: normalCapability, indices: indices,
    nonNormalCapability: nonNormalCapability, bestDistribution: bestDistribution,
    binomialCapability: binomialCapability, poissonCapability: poissonCapability,
    sixpack: sixpack, verdict: verdict
  };
});
