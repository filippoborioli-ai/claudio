/* CLAUDIO v3 - core/power.js
 * Potenza e dimensione del campione: t non centrale e F non centrale calcolate
 * per quadratura, proporzioni, varianze, ANOVA, carte di controllo,
 * piani di campionamento in accettazione con curva OC.
 */
;(function (root, name, deps, factory) {
  var res = deps.map(function (d) {
    return (typeof module === 'object' && module.exports && typeof require === 'function')
      ? require('./' + d + '.js') : root.C3[d];
  });
  var api = factory.apply(null, res);
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.C3 = root.C3 || {})[name] = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, 'power', ['numeric', 'dist', 'stats'], function (num, dist, st) {
  'use strict';

  /* ============ distribuzioni non centrali ============ */
  /** CDF della t non centrale: P(T' <= t | df, delta). */
  function pnt(t, df, delta) {
    if (df > 20000) return dist.normal.cdf(t - delta);
    var lc = (df / 2) * Math.log(df / 2) - num.lgamma(df / 2);
    var f = function (s) {
      if (s <= 0) return 0;
      // densita di s = sqrt(V/df)
      var logd = Math.log(2) + lc + (df - 1) * Math.log(s) - df * s * s / 2;
      var d = Math.exp(logd);
      if (!isFinite(d) || d < 1e-16) return 0;
      return d * dist.normal.cdf(t * s - delta);
    };
    var hi = 1 + 10 / Math.sqrt(df) + 6 / df;
    return num.clamp(num.integrate(f, 1e-9, hi, 60), 0, 1);
  }

  /** CDF della F non centrale: P(F' <= f | df1, df2, lambda). */
  function pnf(f, df1, df2, lambda) {
    if (f <= 0) return 0;
    var x = df1 * f / (df1 * f + df2);
    var s = 0, term;
    var half = lambda / 2;
    for (var j = 0; j < 400; j++) {
      var logw = -half + j * Math.log(Math.max(half, 1e-300)) - num.lnFactorial(j);
      var w = Math.exp(logw);
      if (!isFinite(w)) break;
      term = w * num.betaInc(x, df1 / 2 + j, df2 / 2);
      s += term;
      if (j > 5 && term < 1e-14) break;
    }
    return num.clamp(s, 0, 1);
  }

  /* ============ potenza per medie ============ */
  /** Potenza del t a 1 campione (o appaiato). */
  function tPower1(n, delta, sigma, alpha, alt) {
    alpha = alpha || 0.05; alt = alt || 'two';
    var df = n - 1;
    var ncp = Math.abs(delta) / sigma * Math.sqrt(n);
    if (alt === 'two') {
      var tc = dist.t.inv(1 - alpha / 2, df);
      return 1 - (pnt(tc, df, ncp) - pnt(-tc, df, ncp));
    }
    var tc1 = dist.t.inv(1 - alpha, df);
    return 1 - pnt(tc1, df, ncp);
  }

  /** Potenza del t a 2 campioni. */
  function tPower2(n1, n2, delta, sigma, alpha, alt) {
    alpha = alpha || 0.05; alt = alt || 'two';
    var df = n1 + n2 - 2;
    var ncp = Math.abs(delta) / (sigma * Math.sqrt(1 / n1 + 1 / n2));
    if (alt === 'two') {
      var tc = dist.t.inv(1 - alpha / 2, df);
      return 1 - (pnt(tc, df, ncp) - pnt(-tc, df, ncp));
    }
    var tc1 = dist.t.inv(1 - alpha, df);
    return 1 - pnt(tc1, df, ncp);
  }

  /** Ricerca la n minima che raggiunge la potenza richiesta. */
  function solveN(powerFn, targetPower, nMin, nMax) {
    nMin = nMin || 2; nMax = nMax || 100000;
    var lo = nMin, hi = nMin;
    while (hi < nMax && powerFn(hi) < targetPower) hi = Math.min(nMax, Math.ceil(hi * 2) + 1);
    if (powerFn(hi) < targetPower) return null;
    lo = Math.max(nMin, Math.floor(hi / 2));
    while (lo < hi) {
      var mid = Math.floor((lo + hi) / 2);
      if (powerFn(mid) >= targetPower) hi = mid; else lo = mid + 1;
    }
    return lo;
  }

  /**
   * Interfaccia generale: risolve il pezzo mancante fra n, potenza, differenza.
   * spec: { test, n, n2, delta, sigma, alpha, power, alt, p0, p1, ratio, k, groups }
   */
  function compute(spec) {
    var alpha = spec.alpha == null ? 0.05 : spec.alpha;
    var alt = spec.alt || 'two';
    var out = { test: spec.test, alpha: alpha, alt: alt };
    switch (spec.test) {
      case 't1':
      case 'paired': {
        var pf = function (n) { return tPower1(n, spec.delta, spec.sigma, alpha, alt); };
        if (spec.n == null) {
          out.n = solveN(pf, spec.power || 0.8, 2);
          out.power = out.n ? pf(out.n) : null;
        } else if (spec.delta == null) {
          out.delta = num.solve(function (d) {
            return tPower1(spec.n, d, spec.sigma, alpha, alt) - (spec.power || 0.8);
          }, 1e-6, spec.sigma * 3);
          out.power = spec.power || 0.8;
          out.n = spec.n;
        } else {
          out.n = spec.n; out.power = pf(spec.n); out.delta = spec.delta;
        }
        out.sigma = spec.sigma;
        break;
      }
      case 't2': {
        var ratio = spec.ratio || 1;
        var pf2 = function (n) { return tPower2(n, Math.round(n * ratio), spec.delta, spec.sigma, alpha, alt); };
        if (spec.n == null) {
          out.n = solveN(pf2, spec.power || 0.8, 2);
          out.n2 = out.n ? Math.round(out.n * ratio) : null;
          out.power = out.n ? pf2(out.n) : null;
        } else if (spec.delta == null) {
          out.delta = num.solve(function (d) {
            return tPower2(spec.n, spec.n2 || spec.n, d, spec.sigma, alpha, alt) - (spec.power || 0.8);
          }, 1e-6, spec.sigma * 3);
          out.n = spec.n; out.n2 = spec.n2 || spec.n; out.power = spec.power || 0.8;
        } else {
          out.n = spec.n; out.n2 = spec.n2 || spec.n;
          out.power = tPower2(out.n, out.n2, spec.delta, spec.sigma, alpha, alt);
          out.delta = spec.delta;
        }
        out.sigma = spec.sigma;
        out.totalN = (out.n || 0) + (out.n2 || 0);
        break;
      }
      case 'prop1': {
        var pfp = function (n) { return propPower1(n, spec.p0, spec.p1, alpha, alt); };
        if (spec.n == null) {
          out.n = solveN(pfp, spec.power || 0.8, 5);
          out.power = out.n ? pfp(out.n) : null;
        } else { out.n = spec.n; out.power = pfp(spec.n); }
        out.p0 = spec.p0; out.p1 = spec.p1;
        break;
      }
      case 'prop2': {
        var pfp2 = function (n) { return propPower2(n, Math.round(n * (spec.ratio || 1)), spec.p1, spec.p2, alpha, alt); };
        if (spec.n == null) {
          out.n = solveN(pfp2, spec.power || 0.8, 5);
          out.n2 = out.n ? Math.round(out.n * (spec.ratio || 1)) : null;
          out.power = out.n ? pfp2(out.n) : null;
        } else {
          out.n = spec.n; out.n2 = spec.n2 || spec.n;
          out.power = propPower2(out.n, out.n2, spec.p1, spec.p2, alpha, alt);
        }
        out.p1 = spec.p1; out.p2 = spec.p2;
        break;
      }
      case 'var1': {
        var pfv = function (n) { return varPower1(n, spec.ratio || (spec.sigma1 / spec.sigma0), alpha, alt); };
        if (spec.n == null) {
          out.n = solveN(pfv, spec.power || 0.8, 3);
          out.power = out.n ? pfv(out.n) : null;
        } else { out.n = spec.n; out.power = pfv(spec.n); }
        break;
      }
      case 'anova': {
        var pfa = function (n) {
          return anovaPower(spec.groups, n, spec.maxDiff, spec.sigma, alpha);
        };
        if (spec.n == null) {
          out.n = solveN(pfa, spec.power || 0.8, 2);
          out.power = out.n ? pfa(out.n) : null;
        } else { out.n = spec.n; out.power = pfa(spec.n); }
        out.groups = spec.groups;
        out.totalN = out.n ? out.n * spec.groups : null;
        break;
      }
      default:
        throw new Error('Test non supportato: ' + spec.test);
    }
    return out;
  }

  /** Potenza per 1 proporzione (approssimazione normale). */
  function propPower1(n, p0, p1, alpha, alt) {
    alpha = alpha || 0.05;
    var z = alt === 'two' ? dist.qnorm(1 - alpha / 2) : dist.qnorm(1 - alpha);
    var se0 = Math.sqrt(p0 * (1 - p0) / n);
    var se1 = Math.sqrt(p1 * (1 - p1) / n);
    var pw;
    if (p1 > p0) pw = 1 - dist.normal.cdf((p0 + z * se0 - p1) / se1);
    else pw = dist.normal.cdf((p0 - z * se0 - p1) / se1);
    if (alt === 'two') {
      var other = p1 > p0 ? dist.normal.cdf((p0 - z * se0 - p1) / se1)
        : 1 - dist.normal.cdf((p0 + z * se0 - p1) / se1);
      pw += other;
    }
    return num.clamp(pw, 0, 1);
  }

  /** Potenza per 2 proporzioni. */
  function propPower2(n1, n2, p1, p2, alpha, alt) {
    alpha = alpha || 0.05;
    var z = alt === 'two' ? dist.qnorm(1 - alpha / 2) : dist.qnorm(1 - alpha);
    var pbar = (n1 * p1 + n2 * p2) / (n1 + n2);
    var se0 = Math.sqrt(pbar * (1 - pbar) * (1 / n1 + 1 / n2));
    var se1 = Math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2);
    var d = Math.abs(p1 - p2);
    return num.clamp(1 - dist.normal.cdf((z * se0 - d) / se1) +
      (alt === 'two' ? dist.normal.cdf((-z * se0 - d) / se1) : 0), 0, 1);
  }

  /** Potenza per 1 varianza (rapporto sigma1/sigma0). */
  function varPower1(n, ratio, alpha, alt) {
    alpha = alpha || 0.05;
    var df = n - 1;
    if (alt === 'greater' || (alt === 'two' && ratio > 1)) {
      var c = dist.chisq.inv(1 - (alt === 'two' ? alpha / 2 : alpha), df);
      return 1 - dist.chisq.cdf(c / (ratio * ratio), df);
    }
    var c2 = dist.chisq.inv(alt === 'two' ? alpha / 2 : alpha, df);
    return dist.chisq.cdf(c2 / (ratio * ratio), df);
  }

  /** Potenza ANOVA a una via (differenza massima fra medie, altre al centro). */
  function anovaPower(k, nPerGroup, maxDiff, sigma, alpha) {
    alpha = alpha || 0.05;
    // configurazione peggiore: 2 medie agli estremi, le altre al centro
    var lambda = nPerGroup * Math.pow(maxDiff / sigma, 2) / 2;
    var df1 = k - 1, df2 = k * (nPerGroup - 1);
    if (df2 < 1) return NaN;
    var fc = dist.F.inv(1 - alpha, df1, df2);
    return num.clamp(1 - pnf(fc, df1, df2, lambda), 0, 1);
  }

  /** Curva di potenza per grafico. */
  function powerCurve(spec, deltas) {
    return deltas.map(function (d) {
      var s = Object.assign({}, spec, { delta: d, power: null });
      if (spec.test === 'prop1') s.p1 = d;
      var r = compute(Object.assign({}, s, { n: spec.n }));
      return { delta: d, power: r.power, n: r.n };
    });
  }

  /* ============ dimensione campione per stime ============ */
  /** n per stimare la media con semi-ampiezza E. */
  function nForMeanCI(sigma, E, conf) {
    var z = dist.qnorm(1 - (1 - (conf || 0.95)) / 2);
    var n0 = Math.pow(z * sigma / E, 2);
    // itera con t
    var n = Math.ceil(n0);
    for (var i = 0; i < 50; i++) {
      var t = dist.t.inv(1 - (1 - (conf || 0.95)) / 2, n - 1);
      var nn = Math.ceil(Math.pow(t * sigma / E, 2));
      if (nn === n) break;
      n = nn;
    }
    return n;
  }

  /** n per stimare una proporzione con semi-ampiezza E. */
  function nForPropCI(p, E, conf) {
    var z = dist.qnorm(1 - (1 - (conf || 0.95)) / 2);
    return Math.ceil(z * z * p * (1 - p) / (E * E));
  }

  /** n per stimare Cpk con precisione relativa data. */
  function nForCpk(cpk, relPrecision, conf) {
    var z = dist.qnorm(1 - (1 - (conf || 0.95)) / 2);
    // se(Cpk) ~ sqrt(1/(9n) + Cpk^2/(2(n-1)))
    var target = relPrecision * cpk;
    var f = function (n) {
      return z * Math.sqrt(1 / (9 * n) + cpk * cpk / (2 * (n - 1))) - target;
    };
    var n = 10;
    while (n < 1e6 && f(n) > 0) n = Math.ceil(n * 1.2) + 1;
    return n;
  }

  /* ============ campionamento in accettazione ============ */
  /**
   * Piano a campionamento singolo: trova (n, c) che soddisfa AQL/alpha e RQL/beta.
   * spec: { aql, rql, alpha (rischio produttore), beta (rischio consumatore), lot }
   */
  function singleSamplingPlan(spec) {
    var aql = spec.aql, rql = spec.rql;
    var alpha = spec.alpha == null ? 0.05 : spec.alpha;
    var beta = spec.beta == null ? 0.10 : spec.beta;
    var lot = spec.lot || null;
    for (var c = 0; c <= 60; c++) {
      for (var n = c + 1; n <= 20000; n++) {
        var pAccAQL = lot ? hyperAccept(lot, Math.round(lot * aql), n, c) : dist.binomial.cdf(c, n, aql);
        if (pAccAQL < 1 - alpha) continue;
        var pAccRQL = lot ? hyperAccept(lot, Math.round(lot * rql), n, c) : dist.binomial.cdf(c, n, rql);
        if (pAccRQL <= beta) {
          return {
            n: n, c: c, aql: aql, rql: rql, alpha: alpha, beta: beta,
            pAcceptAQL: pAccAQL, pAcceptRQL: pAccRQL,
            oc: ocCurve(n, c, lot),
            aoq: aoqCurve(n, c, lot),
            atiAtAQL: lot ? n + (1 - pAccAQL) * (lot - n) : null
          };
        }
      }
    }
    return null;
  }

  function hyperAccept(N, D, n, c) {
    var s = 0;
    for (var k = 0; k <= c; k++) s += dist.hypergeometric.pmf(k, N, D, n);
    return Math.min(1, s);
  }

  /** Curva operativa caratteristica. */
  function ocCurve(n, c, lot) {
    var pts = [];
    for (var i = 0; i <= 60; i++) {
      var p = i / 400;
      if (p > 0.15) break;
      var pa = lot ? hyperAccept(lot, Math.round(lot * p), n, c) : dist.binomial.cdf(c, n, p);
      pts.push({ p: p, pAccept: pa });
    }
    return pts;
  }

  /** Average Outgoing Quality. */
  function aoqCurve(n, c, lot) {
    return ocCurve(n, c, lot).map(function (o) {
      var N = lot || 1e9;
      return { p: o.p, aoq: o.p * o.pAccept * (N - n) / N };
    });
  }

  /** Piano c=0 (zero accettazione) per confronto. */
  function zeroAcceptPlan(rql, beta) {
    var n = Math.ceil(Math.log(beta == null ? 0.1 : beta) / Math.log(1 - rql));
    return { n: n, c: 0, rql: rql, beta: beta == null ? 0.1 : beta, oc: ocCurve(n, 0, null) };
  }

  /** Numero di campioni per stimare sigma con precisione data. */
  function nForSigma(relPrecision, conf) {
    var a = (1 - (conf || 0.95)) / 2;
    for (var n = 3; n < 100000; n++) {
      var lo = Math.sqrt((n - 1) / dist.chisq.inv(1 - a, n - 1));
      var hi = Math.sqrt((n - 1) / dist.chisq.inv(a, n - 1));
      if ((hi - lo) / 2 <= relPrecision) return n;
    }
    return null;
  }

  return {
    pnt: pnt, pnf: pnf,
    tPower1: tPower1, tPower2: tPower2, propPower1: propPower1, propPower2: propPower2,
    varPower1: varPower1, anovaPower: anovaPower, compute: compute, powerCurve: powerCurve,
    solveN: solveN, nForMeanCI: nForMeanCI, nForPropCI: nForPropCI, nForCpk: nForCpk,
    nForSigma: nForSigma,
    singleSamplingPlan: singleSamplingPlan, ocCurve: ocCurve, aoqCurve: aoqCurve,
    zeroAcceptPlan: zeroAcceptPlan
  };
});
