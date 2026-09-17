/* CLAUDIO v3 - core/dist.js
 * Distribuzioni di probabilita: pdf/pmf, cdf, inv (quantile), random.
 * Ogni distribuzione espone lo stesso contratto -> usata da test, capability, distfit.
 */
;(function (root, name, deps, factory) {
  var res = deps.map(function (d) {
    return (typeof module === 'object' && module.exports && typeof require === 'function')
      ? require('./' + d + '.js')
      : root.C3[d];
  });
  var api = factory.apply(null, res);
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.C3 = root.C3 || {})[name] = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, 'dist', ['numeric'], function (num) {
  'use strict';

  var SQRT2 = Math.SQRT2;
  var SQRT2PI = Math.sqrt(2 * Math.PI);

  /* =========================== NORMALE =========================== */
  var normal = {
    key: 'normal', label: 'Normale', params: ['mu', 'sigma'], support: [-Infinity, Infinity],
    pdf: function (x, mu, sd) {
      mu = mu || 0; sd = sd == null ? 1 : sd;
      var z = (x - mu) / sd;
      return Math.exp(-0.5 * z * z) / (sd * SQRT2PI);
    },
    cdf: function (x, mu, sd) {
      mu = mu || 0; sd = sd == null ? 1 : sd;
      return 0.5 * num.erfc(-(x - mu) / (sd * SQRT2));
    },
    inv: function (p, mu, sd) {
      mu = mu || 0; sd = sd == null ? 1 : sd;
      return mu + sd * qnorm(p);
    },
    rand: function (r, mu, sd) { return r.normal(mu == null ? 0 : mu, sd == null ? 1 : sd); },
    mean: function (mu) { return mu; },
    fit: function (x) {
      var n = x.length, m = 0, i;
      for (i = 0; i < n; i++) m += x[i];
      m /= n;
      var s = 0;
      for (i = 0; i < n; i++) s += (x[i] - m) * (x[i] - m);
      return [m, Math.sqrt(s / (n - 1))];
    }
  };

  /** Quantile normale standard: Acklam + 2 raffinamenti Halley (~1e-15). */
  function qnorm(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    var a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
      1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    var b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
      6.680131188771972e+01, -1.328068155288572e+01];
    var c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
      -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    var d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
      3.754408661907416e+00];
    var pl = 0.02425, q, r, x;
    if (p < pl) {
      q = Math.sqrt(-2 * Math.log(p));
      x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    } else if (p <= 1 - pl) {
      q = p - 0.5; r = q * q;
      x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    // raffinamento di Halley
    for (var k = 0; k < 2; k++) {
      var e = 0.5 * num.erfc(-x / SQRT2) - p;
      var u = e * SQRT2PI * Math.exp(x * x / 2);
      x = x - u / (1 + x * u / 2);
    }
    return x;
  }

  /* ============================ t STUDENT ============================ */
  var t = {
    key: 't', label: 'Student t', params: ['df'], support: [-Infinity, Infinity],
    pdf: function (x, df) {
      return Math.exp(num.lgamma((df + 1) / 2) - num.lgamma(df / 2)) /
        Math.sqrt(df * Math.PI) * Math.pow(1 + x * x / df, -(df + 1) / 2);
    },
    cdf: function (x, df) {
      var p = 0.5 * num.betaInc(df / (df + x * x), df / 2, 0.5);
      return x > 0 ? 1 - p : p;
    },
    inv: function (p, df) {
      if (p <= 0) return -Infinity;
      if (p >= 1) return Infinity;
      if (p === 0.5) return 0;
      var f = function (x) { return t.cdf(x, df) - p; };
      var g = qnorm(p);
      return num.solve(f, g - 1, g + 1, 1e-12);
    },
    rand: function (r, df) {
      var z = r.normal(0, 1), c = chisq.rand(r, df);
      return z / Math.sqrt(c / df);
    }
  };

  /* ============================ CHI QUADRO ============================ */
  var chisq = {
    key: 'chisq', label: 'Chi-quadro', params: ['df'], support: [0, Infinity],
    pdf: function (x, df) {
      if (x <= 0) return 0;
      var k = df / 2;
      return Math.exp((k - 1) * Math.log(x) - x / 2 - num.lgamma(k) - k * Math.LN2);
    },
    cdf: function (x, df) { return x <= 0 ? 0 : num.gammaP(df / 2, x / 2); },
    inv: function (p, df) {
      if (p <= 0) return 0;
      if (p >= 1) return Infinity;
      var f = function (x) { return chisq.cdf(x, df) - p; };
      return num.solve(f, Math.max(1e-10, df * 0.5), df * 2 + 5, 1e-12);
    },
    rand: function (r, df) { return gamma.rand(r, df / 2, 2); }
  };

  /* =============================== FISHER F =============================== */
  var F = {
    key: 'F', label: 'Fisher F', params: ['df1', 'df2'], support: [0, Infinity],
    pdf: function (x, d1, d2) {
      if (x <= 0) return 0;
      var lp = (d1 / 2) * Math.log(d1 / d2) + (d1 / 2 - 1) * Math.log(x) -
        ((d1 + d2) / 2) * Math.log(1 + d1 * x / d2) - num.lbeta(d1 / 2, d2 / 2);
      return Math.exp(lp);
    },
    cdf: function (x, d1, d2) {
      if (x <= 0) return 0;
      return num.betaInc(d1 * x / (d1 * x + d2), d1 / 2, d2 / 2);
    },
    inv: function (p, d1, d2) {
      if (p <= 0) return 0;
      if (p >= 1) return Infinity;
      var f = function (x) { return F.cdf(x, d1, d2) - p; };
      return num.solve(f, 1e-8, 4, 1e-12);
    },
    rand: function (r, d1, d2) {
      return (chisq.rand(r, d1) / d1) / (chisq.rand(r, d2) / d2);
    }
  };

  /* ============================== GAMMA ============================== */
  var gamma = {
    key: 'gamma', label: 'Gamma', params: ['shape', 'scale'], support: [0, Infinity],
    pdf: function (x, k, th) {
      if (x <= 0) return 0;
      return Math.exp((k - 1) * Math.log(x) - x / th - num.lgamma(k) - k * Math.log(th));
    },
    cdf: function (x, k, th) { return x <= 0 ? 0 : num.gammaP(k, x / th); },
    inv: function (p, k, th) {
      if (p <= 0) return 0;
      var f = function (x) { return gamma.cdf(x, k, th) - p; };
      return num.solve(f, 1e-10, k * th * 2 + 1, 1e-12);
    },
    /** Marsaglia-Tsang. */
    rand: function (r, k, th) {
      th = th == null ? 1 : th;
      if (k < 1) {
        var u = r.uniform();
        return gamma.rand(r, 1 + k, th) * Math.pow(u, 1 / k);
      }
      var d = k - 1 / 3, c = 1 / Math.sqrt(9 * d), x, v, uu;
      for (;;) {
        do { x = r.normal(0, 1); v = 1 + c * x; } while (v <= 0);
        v = v * v * v;
        uu = r.uniform();
        if (uu < 1 - 0.0331 * x * x * x * x) return d * v * th;
        if (Math.log(uu) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * th;
      }
    },
    fit: function (x) {
      // momenti come start, poi MLE via Newton su shape
      var n = x.length, m = 0, i;
      for (i = 0; i < n; i++) m += x[i];
      m /= n;
      var lm = 0;
      for (i = 0; i < n; i++) lm += Math.log(x[i]);
      lm /= n;
      var s = Math.log(m) - lm;
      var k = (3 - s + Math.sqrt((3 - s) * (3 - s) + 24 * s)) / (12 * s);
      for (var it = 0; it < 60; it++) {
        var dpsi = num.deriv(function (z) { return num.lgamma(z); }, k);
        var f = Math.log(k) - dpsi - s;
        var df = num.deriv(function (z) {
          return Math.log(z) - num.deriv(function (w) { return num.lgamma(w); }, z) - s;
        }, k);
        if (!isFinite(df) || df === 0) break;
        var kn = k - f / df;
        if (kn <= 0 || !isFinite(kn)) break;
        if (Math.abs(kn - k) < 1e-10) { k = kn; break; }
        k = kn;
      }
      return [k, m / k];
    }
  };

  /* ============================ ESPONENZIALE ============================ */
  var exponential = {
    key: 'exponential', label: 'Esponenziale', params: ['scale'], support: [0, Infinity],
    pdf: function (x, s) { return x < 0 ? 0 : Math.exp(-x / s) / s; },
    cdf: function (x, s) { return x < 0 ? 0 : 1 - Math.exp(-x / s); },
    inv: function (p, s) { return -s * Math.log(1 - p); },
    rand: function (r, s) { return -s * Math.log(1 - r.uniform()); },
    fit: function (x) {
      var m = 0;
      for (var i = 0; i < x.length; i++) m += x[i];
      return [m / x.length];
    }
  };

  /* ============================== WEIBULL ============================== */
  var weibull = {
    key: 'weibull', label: 'Weibull', params: ['shape', 'scale'], support: [0, Infinity],
    pdf: function (x, k, l) {
      if (x < 0) return 0;
      if (x === 0) return k === 1 ? 1 / l : 0;
      return (k / l) * Math.pow(x / l, k - 1) * Math.exp(-Math.pow(x / l, k));
    },
    cdf: function (x, k, l) { return x <= 0 ? 0 : 1 - Math.exp(-Math.pow(x / l, k)); },
    inv: function (p, k, l) { return l * Math.pow(-Math.log(1 - p), 1 / k); },
    rand: function (r, k, l) { return l * Math.pow(-Math.log(1 - r.uniform()), 1 / k); },
    /** MLE: Newton su shape (equazione di verosimiglianza profilata). */
    fit: function (x) {
      var n = x.length, i, lnsum = 0;
      for (i = 0; i < n; i++) lnsum += Math.log(x[i]);
      var g = function (k) {
        var a = 0, b = 0, c = 0, xk;
        for (i = 0; i < n; i++) {
          xk = Math.pow(x[i], k);
          a += xk; b += xk * Math.log(x[i]); c += Math.log(x[i]);
        }
        return b / a - 1 / k - c / n;
      };
      var k = num.solve(g, 0.2, 5, 1e-10);
      if (!isFinite(k) || k <= 0) k = 1;
      var sk = 0;
      for (i = 0; i < n; i++) sk += Math.pow(x[i], k);
      return [k, Math.pow(sk / n, 1 / k)];
    },
    mean: function (k, l) { return l * num.gammafn(1 + 1 / k); }
  };

  /* ============================= LOGNORMALE ============================= */
  var lognormal = {
    key: 'lognormal', label: 'Lognormale', params: ['mulog', 'sdlog'], support: [0, Infinity],
    pdf: function (x, m, s) {
      if (x <= 0) return 0;
      return normal.pdf(Math.log(x), m, s) / x;
    },
    cdf: function (x, m, s) { return x <= 0 ? 0 : normal.cdf(Math.log(x), m, s); },
    inv: function (p, m, s) { return Math.exp(normal.inv(p, m, s)); },
    rand: function (r, m, s) { return Math.exp(r.normal(m, s)); },
    fit: function (x) {
      var l = x.map(Math.log);
      return normal.fit(l);
    },
    mean: function (m, s) { return Math.exp(m + s * s / 2); }
  };

  /* =============================== BETA =============================== */
  var beta = {
    key: 'beta', label: 'Beta', params: ['a', 'b'], support: [0, 1],
    pdf: function (x, a, b) {
      if (x <= 0 || x >= 1) return 0;
      return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - num.lbeta(a, b));
    },
    cdf: function (x, a, b) { return num.betaInc(x, a, b); },
    inv: function (p, a, b) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      return num.brent(function (x) { return num.betaInc(x, a, b) - p; }, 1e-12, 1 - 1e-12, 1e-12);
    },
    rand: function (r, a, b) {
      var g1 = gamma.rand(r, a, 1), g2 = gamma.rand(r, b, 1);
      return g1 / (g1 + g2);
    }
  };

  /* ============================= UNIFORME ============================= */
  var uniform = {
    key: 'uniform', label: 'Uniforme', params: ['a', 'b'], support: [0, 1],
    pdf: function (x, a, b) { return x >= a && x <= b ? 1 / (b - a) : 0; },
    cdf: function (x, a, b) { return x < a ? 0 : (x > b ? 1 : (x - a) / (b - a)); },
    inv: function (p, a, b) { return a + p * (b - a); },
    rand: function (r, a, b) { return r.uniform(a, b); }
  };

  /* ============================= BINOMIALE ============================= */
  var binomial = {
    key: 'binomial', label: 'Binomiale', params: ['n', 'p'], discrete: true,
    pmf: function (k, n, p) {
      if (k < 0 || k > n || k !== Math.floor(k)) return 0;
      if (p === 0) return k === 0 ? 1 : 0;
      if (p === 1) return k === n ? 1 : 0;
      return Math.exp(num.lnChoose(n, k) + k * Math.log(p) + (n - k) * Math.log(1 - p));
    },
    cdf: function (k, n, p) {
      k = Math.floor(k);
      if (k < 0) return 0;
      if (k >= n) return 1;
      return 1 - num.betaInc(p, k + 1, n - k);
    },
    inv: function (q, n, p) {
      var c = 0;
      for (var k = 0; k <= n; k++) {
        c += binomial.pmf(k, n, p);
        if (c >= q - 1e-12) return k;
      }
      return n;
    },
    rand: function (r, n, p) {
      var s = 0;
      for (var i = 0; i < n; i++) if (r.uniform() < p) s++;
      return s;
    }
  };

  /* ============================== POISSON ============================== */
  var poisson = {
    key: 'poisson', label: 'Poisson', params: ['lambda'], discrete: true,
    pmf: function (k, l) {
      if (k < 0 || k !== Math.floor(k)) return 0;
      return Math.exp(-l + k * Math.log(l) - num.lnFactorial(k));
    },
    cdf: function (k, l) {
      k = Math.floor(k);
      if (k < 0) return 0;
      return num.gammaQ(k + 1, l);
    },
    inv: function (q, l) {
      var c = 0, k = 0;
      for (; k < 1e6; k++) {
        c += poisson.pmf(k, l);
        if (c >= q - 1e-12) return k;
      }
      return k;
    },
    rand: function (r, l) {
      if (l < 30) {
        var L = Math.exp(-l), k = 0, p = 1;
        do { k++; p *= r.uniform(); } while (p > L);
        return k - 1;
      }
      // approssimazione normale con correzione per lambda grande
      return Math.max(0, Math.round(r.normal(l, Math.sqrt(l))));
    }
  };

  /* ====================== GEOMETRICA / NEG BINOMIALE ====================== */
  var geometric = {
    key: 'geometric', label: 'Geometrica', params: ['p'], discrete: true,
    pmf: function (k, p) { return k < 1 ? 0 : Math.pow(1 - p, k - 1) * p; },
    cdf: function (k, p) { return k < 1 ? 0 : 1 - Math.pow(1 - p, Math.floor(k)); },
    rand: function (r, p) { return Math.ceil(Math.log(1 - r.uniform()) / Math.log(1 - p)); }
  };

  var hypergeometric = {
    key: 'hypergeometric', label: 'Ipergeometrica', params: ['N', 'K', 'n'], discrete: true,
    pmf: function (k, N, K, n) {
      if (k < Math.max(0, n - (N - K)) || k > Math.min(n, K)) return 0;
      return Math.exp(num.lnChoose(K, k) + num.lnChoose(N - K, n - k) - num.lnChoose(N, n));
    },
    cdf: function (k, N, K, n) {
      var s = 0;
      for (var i = 0; i <= Math.floor(k); i++) s += hypergeometric.pmf(i, N, K, n);
      return Math.min(1, s);
    }
  };

  /* =========================== SMALLEST EXTREME =========================== */
  var smallestExtreme = {
    key: 'sev', label: 'Valore estremo minore', params: ['loc', 'scale'], support: [-Infinity, Infinity],
    pdf: function (x, m, s) { var z = (x - m) / s; return Math.exp(z - Math.exp(z)) / s; },
    cdf: function (x, m, s) { return 1 - Math.exp(-Math.exp((x - m) / s)); },
    inv: function (p, m, s) { return m + s * Math.log(-Math.log(1 - p)); },
    rand: function (r, m, s) { return m + s * Math.log(-Math.log(1 - r.uniform())); },
    fit: function (x) {
      var st = normal.fit(x);
      var nll = function (th) {
        if (th[1] <= 0) return 1e12;
        var s = 0;
        for (var i = 0; i < x.length; i++) {
          var z = (x[i] - th[0]) / th[1];
          s -= (z - Math.exp(z) - Math.log(th[1]));
        }
        return s;
      };
      return num.nelderMead(nll, [st[0] + 0.5 * st[1], st[1] * 0.78]).x;
    }
  };

  /* =============================== LOGISTICA =============================== */
  var logistic = {
    key: 'logistic', label: 'Logistica', params: ['loc', 'scale'], support: [-Infinity, Infinity],
    pdf: function (x, m, s) {
      var e = Math.exp(-(x - m) / s);
      return e / (s * (1 + e) * (1 + e));
    },
    cdf: function (x, m, s) { return 1 / (1 + Math.exp(-(x - m) / s)); },
    inv: function (p, m, s) { return m + s * Math.log(p / (1 - p)); },
    rand: function (r, m, s) { var u = r.uniform(); return m + s * Math.log(u / (1 - u)); },
    fit: function (x) {
      var st = normal.fit(x);
      return [st[0], st[1] * Math.sqrt(3) / Math.PI];
    }
  };

  /* -------- registro delle distribuzioni continue per il fit -------- */
  var continuous = {
    normal: normal, lognormal: lognormal, weibull: weibull, gamma: gamma,
    exponential: exponential, logistic: logistic, sev: smallestExtreme
  };

  /** cdf generica con array di parametri. */
  function cdfOf(d, x, p) { return d.cdf.apply(null, [x].concat(p)); }
  function pdfOf(d, x, p) { return (d.pdf || d.pmf).apply(null, [x].concat(p)); }
  function invOf(d, q, p) { return d.inv.apply(null, [q].concat(p)); }

  return {
    normal: normal, qnorm: qnorm, t: t, chisq: chisq, F: F, gamma: gamma,
    exponential: exponential, weibull: weibull, lognormal: lognormal,
    beta: beta, uniform: uniform, binomial: binomial, poisson: poisson,
    geometric: geometric, hypergeometric: hypergeometric,
    smallestExtreme: smallestExtreme, logistic: logistic,
    continuous: continuous,
    cdfOf: cdfOf, pdfOf: pdfOf, invOf: invOf
  };
});
