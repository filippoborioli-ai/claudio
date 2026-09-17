/* CLAUDIO v3 - core/numeric.js
 * Funzioni matematiche di base: funzioni speciali, quadratura, radici, RNG.
 * Nessuna dipendenza. Funziona in browser (globale C3.numeric) e in Node (module.exports).
 */
;(function (root, name, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.C3 = root.C3 || {})[name] = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, 'numeric', function () {
  'use strict';

  var EPS = 2.220446049250313e-16;
  var TINY = 1e-300;
  var LN_SQRT_2PI = 0.9189385332046727;

  /* ---------- log-gamma (Lanczos g=7, n=9) ---------- */
  var LANCZOS = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];

  function lgamma(x) {
    if (x <= 0 && x === Math.floor(x)) return Infinity;
    if (x < 0.5) {
      // riflessione: Gamma(x)Gamma(1-x) = pi / sin(pi x)
      return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
    }
    var z = x - 1, a = LANCZOS[0], t = z + 7.5;
    for (var i = 1; i < 9; i++) a += LANCZOS[i] / (z + i);
    return LN_SQRT_2PI + (z + 0.5) * Math.log(t) - t + Math.log(a);
  }

  function gammafn(x) {
    if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gammafn(1 - x));
    return Math.exp(lgamma(x));
  }

  function lbeta(a, b) { return lgamma(a) + lgamma(b) - lgamma(a + b); }

  function lnFactorial(n) { return lgamma(n + 1); }

  function lnChoose(n, k) {
    if (k < 0 || k > n) return -Infinity;
    return lnFactorial(n) - lnFactorial(k) - lnFactorial(n - k);
  }

  function choose(n, k) { return Math.round(Math.exp(lnChoose(n, k))); }

  /* ---------- erf / erfc (Numerical Recipes, precisione ~1e-16) ---------- */
  var ERFC_COF = [
    -1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
    -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4,
    4.2523324806907e-5, -2.0278578112534e-5, -1.624290004647e-6,
    1.303655835580e-6, 1.5626441722e-8, -8.5238095915e-8,
    6.529054439e-9, 5.059343495e-9, -9.91364156e-10,
    -2.27365122e-10, 9.6467911e-11, 2.394038e-12,
    -6.886027e-12, 8.94487e-13, 3.13092e-13,
    -1.12708e-13, 3.81e-16, 7.106e-15
  ];

  function erfc(x) {
    if (x < 0) return 2 - erfc(-x);
    var t = 2 / (2 + x), ty = 4 * t - 2, d = 0, dd = 0, tmp;
    for (var j = ERFC_COF.length - 1; j > 0; j--) {
      tmp = d; d = ty * d - dd + ERFC_COF[j]; dd = tmp;
    }
    return t * Math.exp(-x * x + 0.5 * (ERFC_COF[0] + ty * d) - dd);
  }

  function erf(x) { return 1 - erfc(x); }

  /* ---------- gamma incompleta regolarizzata P(a,x), Q(a,x) ---------- */
  function gserSeries(a, x) {
    var ap = a, sum = 1 / a, del = sum;
    for (var n = 1; n < 2000; n++) {
      ap++; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * EPS) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }

  function gcfFraction(a, x) {
    var b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d, an, del;
    for (var i = 1; i < 2000; i++) {
      an = -i * (i - a);
      b += 2;
      d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
      c = b + an / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }

  function gammaP(a, x) {
    if (x < 0 || a <= 0) return NaN;
    if (x === 0) return 0;
    if (x < a + 1) return gserSeries(a, x);
    return 1 - gcfFraction(a, x);
  }

  function gammaQ(a, x) { return 1 - gammaP(a, x); }

  /* ---------- beta incompleta regolarizzata I_x(a,b) ---------- */
  function betacf(x, a, b) {
    var qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < TINY) d = TINY;
    d = 1 / d;
    var h = d, m, m2, aa, del;
    for (m = 1; m <= 800; m++) {
      m2 = 2 * m;
      aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
      c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d; del = d * c; h *= del;
      if (Math.abs(del - 1) < 1e-14) break;
    }
    return h;
  }

  function betaInc(x, a, b) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var lbt = a * Math.log(x) + b * Math.log(1 - x) - lbeta(a, b);
    if (x < (a + 1) / (a + b + 2)) return Math.exp(lbt) * betacf(x, a, b) / a;
    return 1 - Math.exp(lbt) * betacf(1 - x, b, a) / b;
  }

  /* ---------- ricerca radici ---------- */
  /** Brent su [lo,hi] con f(lo)*f(hi) < 0. */
  function brent(f, lo, hi, tol, maxIter) {
    tol = tol == null ? 1e-12 : tol;
    maxIter = maxIter == null ? 300 : maxIter;
    var a = lo, b = hi, fa = f(a), fb = f(b);
    if (fa === 0) return a;
    if (fb === 0) return b;
    if (fa * fb > 0) return NaN;
    var c = a, fc = fa, d = b - a, e = d, p, q, r, s, tol1, xm;
    for (var i = 0; i < maxIter; i++) {
      if (fb * fc > 0) { c = a; fc = fa; d = b - a; e = d; }
      if (Math.abs(fc) < Math.abs(fb)) {
        a = b; b = c; c = a; fa = fb; fb = fc; fc = fa;
      }
      tol1 = 2 * EPS * Math.abs(b) + 0.5 * tol;
      xm = 0.5 * (c - b);
      if (Math.abs(xm) <= tol1 || fb === 0) return b;
      if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
        s = fb / fa;
        if (a === c) { p = 2 * xm * s; q = 1 - s; }
        else {
          q = fa / fc; r = fb / fc;
          p = s * (2 * xm * q * (q - r) - (b - a) * (r - 1));
          q = (q - 1) * (r - 1) * (s - 1);
        }
        if (p > 0) q = -q;
        p = Math.abs(p);
        if (2 * p < Math.min(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) { e = d; d = p / q; }
        else { d = xm; e = d; }
      } else { d = xm; e = d; }
      a = b; fa = fb;
      b += Math.abs(d) > tol1 ? d : (xm > 0 ? tol1 : -tol1);
      fb = f(b);
    }
    return b;
  }

  /** Espande intervallo fino a cambio di segno, poi Brent. */
  function solve(f, guessLo, guessHi, tol) {
    var lo = guessLo, hi = guessHi, flo = f(lo), fhi = f(hi), k = 0;
    while (flo * fhi > 0 && k < 200) {
      var w = Math.max(hi - lo, 1e-8);
      lo -= w; hi += w;
      flo = f(lo); fhi = f(hi); k++;
    }
    return brent(f, lo, hi, tol);
  }

  /* ---------- quadratura ---------- */
  var GL20_X = [
    0.0765265211334973, 0.2277858511416451, 0.3737060887154195, 0.5108670019508271,
    0.6360536807265150, 0.7463319064601508, 0.8391169718222188, 0.9122344282513259,
    0.9639719272779138, 0.9931285991850949
  ];
  var GL20_W = [
    0.1527533871307258, 0.1491729864726037, 0.1420961093183820, 0.1316886384491766,
    0.1181945319615184, 0.1019301198172404, 0.0832767415767048, 0.0626720483341091,
    0.0406014298003869, 0.0176140071391521
  ];

  /** Gauss-Legendre a 20 nodi su [a,b]. */
  function gaussLegendre(f, a, b) {
    var c = 0.5 * (a + b), h = 0.5 * (b - a), s = 0;
    for (var i = 0; i < 10; i++) {
      var dx = h * GL20_X[i];
      s += GL20_W[i] * (f(c + dx) + f(c - dx));
    }
    return s * h;
  }

  /** Integrale su [a,b] con pannelli Gauss-Legendre. */
  function integrate(f, a, b, panels) {
    panels = panels || 40;
    var h = (b - a) / panels, s = 0;
    for (var i = 0; i < panels; i++) s += gaussLegendre(f, a + i * h, a + (i + 1) * h);
    return s;
  }

  /* ---------- RNG deterministico ---------- */
  function mulberry32(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Generatore con utility: uniform, normal, int, pick, shuffle. */
  function rng(seed) {
    var u = mulberry32(seed == null ? (Date.now() & 0x7fffffff) : seed);
    var spare = null;
    return {
      raw: u,
      uniform: function (lo, hi) {
        var x = u();
        return lo == null ? x : lo + (hi - lo) * x;
      },
      normal: function (mu, sd) {
        mu = mu == null ? 0 : mu; sd = sd == null ? 1 : sd;
        if (spare !== null) { var s = spare; spare = null; return mu + sd * s; }
        var v1, v2, s2;
        do { v1 = 2 * u() - 1; v2 = 2 * u() - 1; s2 = v1 * v1 + v2 * v2; } while (s2 >= 1 || s2 === 0);
        var m = Math.sqrt(-2 * Math.log(s2) / s2);
        spare = v2 * m;
        return mu + sd * v1 * m;
      },
      int: function (lo, hi) { return Math.floor(lo + u() * (hi - lo + 1)); },
      pick: function (arr) { return arr[Math.floor(u() * arr.length)]; },
      shuffle: function (arr) {
        var a = arr.slice();
        for (var i = a.length - 1; i > 0; i--) {
          var j = Math.floor(u() * (i + 1));
          var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
      }
    };
  }

  /* ---------- utility numeriche ---------- */
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function isNum(x) { return typeof x === 'number' && isFinite(x); }

  function round(x, digits) {
    if (!isNum(x)) return x;
    var p = Math.pow(10, digits == null ? 4 : digits);
    return Math.round(x * p) / p;
  }

  /** Formattazione compatta per tabelle di output. */
  function fmt(x, digits) {
    if (x === null || x === undefined) return '-';
    if (typeof x === 'boolean') return x ? 'si' : 'no';
    if (typeof x !== 'number') return String(x);
    if (isNaN(x)) return '-';
    if (!isFinite(x)) return x > 0 ? 'Inf' : '-Inf';
    var d = digits == null ? 4 : digits;
    var ax = Math.abs(x);
    if (x === 0) return '0';
    if (ax < 1e-4 || ax >= 1e7) return x.toExponential(Math.max(2, d - 1));
    var s = x.toFixed(d);
    if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }

  /** p-value con soglia di stampa. */
  function fmtP(p) {
    if (!isNum(p)) return '-';
    if (p < 0.0001) return '<0,0001';
    return p.toFixed(4);
  }

  /** Derivata numerica centrale. */
  function deriv(f, x, h) {
    h = h || Math.max(1e-7, Math.abs(x) * 1e-7);
    return (f(x + h) - f(x - h)) / (2 * h);
  }

  /** Nelder-Mead (minimizzazione senza derivate). */
  function nelderMead(f, x0, opts) {
    opts = opts || {};
    var maxIter = opts.maxIter || 1000;
    var tol = opts.tol || 1e-10;
    var n = x0.length;
    var step = opts.step || 0.1;
    var simplex = [{ x: x0.slice(), fx: f(x0) }];
    for (var i = 0; i < n; i++) {
      var p = x0.slice();
      p[i] += (Math.abs(p[i]) > 1e-8 ? p[i] * step : step);
      simplex.push({ x: p, fx: f(p) });
    }
    var alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5;
    for (var it = 0; it < maxIter; it++) {
      simplex.sort(function (a, b) { return a.fx - b.fx; });
      if (Math.abs(simplex[n].fx - simplex[0].fx) < tol) break;
      var centroid = new Array(n).fill(0);
      for (var j = 0; j < n; j++) {
        for (var k = 0; k < n; k++) centroid[k] += simplex[j].x[k] / n;
      }
      var worst = simplex[n];
      var xr = centroid.map(function (c, idx) { return c + alpha * (c - worst.x[idx]); });
      var fr = f(xr);
      if (fr < simplex[0].fx) {
        var xe = centroid.map(function (c, idx) { return c + gamma * (c - worst.x[idx]); });
        var fe = f(xe);
        simplex[n] = fe < fr ? { x: xe, fx: fe } : { x: xr, fx: fr };
      } else if (fr < simplex[n - 1].fx) {
        simplex[n] = { x: xr, fx: fr };
      } else {
        var xc = centroid.map(function (c, idx) { return c + rho * (worst.x[idx] - c); });
        var fc = f(xc);
        if (fc < worst.fx) simplex[n] = { x: xc, fx: fc };
        else {
          for (var m = 1; m <= n; m++) {
            var xs = simplex[m].x.map(function (v, idx) {
              return simplex[0].x[idx] + sigma * (v - simplex[0].x[idx]);
            });
            simplex[m] = { x: xs, fx: f(xs) };
          }
        }
      }
    }
    simplex.sort(function (a, b) { return a.fx - b.fx; });
    return { x: simplex[0].x, fx: simplex[0].fx };
  }

  return {
    EPS: EPS,
    lgamma: lgamma, gammafn: gammafn, lbeta: lbeta,
    lnFactorial: lnFactorial, lnChoose: lnChoose, choose: choose,
    erf: erf, erfc: erfc,
    gammaP: gammaP, gammaQ: gammaQ, betaInc: betaInc,
    brent: brent, solve: solve,
    gaussLegendre: gaussLegendre, integrate: integrate,
    mulberry32: mulberry32, rng: rng,
    clamp: clamp, isNum: isNum, round: round, fmt: fmt, fmtP: fmtP,
    deriv: deriv, nelderMead: nelderMead
  };
});
