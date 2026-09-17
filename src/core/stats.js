/* CLAUDIO v3 - core/stats.js
 * Statistica descrittiva, quantili, ranghi, normalita (AD, Shapiro-Wilk, Ryan-Joiner),
 * istogrammi, KDE, trasformazioni (Box-Cox, Johnson SU/SB semplificata), outlier, bootstrap.
 */
;(function (root, name, deps, factory) {
  var res = deps.map(function (d) {
    return (typeof module === 'object' && module.exports && typeof require === 'function')
      ? require('./' + d + '.js') : root.C3[d];
  });
  var api = factory.apply(null, res);
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.C3 = root.C3 || {})[name] = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, 'stats', ['numeric', 'dist'], function (num, dist) {
  'use strict';

  /* ------------------------- utility di base ------------------------- */
  /** Estrae i soli valori numerici finiti. */
  function clean(x) {
    var out = [];
    for (var i = 0; i < x.length; i++) {
      var v = x[i];
      if (v === null || v === undefined || v === '') continue;
      var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
      if (isFinite(n)) out.push(n);
    }
    return out;
  }

  function sum(x) {
    var s = 0;
    for (var i = 0; i < x.length; i++) s += x[i];
    return s;
  }

  function mean(x) { return x.length ? sum(x) / x.length : NaN; }

  function variance(x, population) {
    var n = x.length;
    if (n < 2) return NaN;
    var m = mean(x), s = 0;
    for (var i = 0; i < n; i++) s += (x[i] - m) * (x[i] - m);
    return s / (population ? n : n - 1);
  }

  function sd(x, population) { return Math.sqrt(variance(x, population)); }
  function se(x) { return sd(x) / Math.sqrt(x.length); }
  function cv(x) { return 100 * sd(x) / mean(x); }
  function min(x) { return x.length ? Math.min.apply(null, x) : NaN; }
  function max(x) { return x.length ? Math.max.apply(null, x) : NaN; }
  function range(x) { return max(x) - min(x); }
  function sortAsc(x) { return x.slice().sort(function (a, b) { return a - b; }); }

  /**
   * Quantile. type: 6 = (n+1)p (default, come Minitab/JMP), 7 = R/Excel INC.
   */
  function quantile(x, p, type) {
    var s = sortAsc(x), n = s.length;
    if (!n) return NaN;
    if (n === 1) return s[0];
    type = type || 6;
    var h;
    if (type === 7) h = (n - 1) * p + 1;
    else h = (n + 1) * p;
    if (h <= 1) return s[0];
    if (h >= n) return s[n - 1];
    var fl = Math.floor(h);
    return s[fl - 1] + (h - fl) * (s[fl] - s[fl - 1]);
  }

  function median(x) { return quantile(x, 0.5, 7); }
  function q1(x, type) { return quantile(x, 0.25, type); }
  function q3(x, type) { return quantile(x, 0.75, type); }
  function iqr(x, type) { return q3(x, type) - q1(x, type); }

  /** Media troncata (percentuale per lato). */
  function trimmedMean(x, pct) {
    var s = sortAsc(x), n = s.length;
    var k = Math.floor(n * (pct == null ? 0.05 : pct));
    return mean(s.slice(k, n - k));
  }

  /** Deviazione assoluta mediana (scalata per confronto con sigma). */
  function mad(x, scaled) {
    var m = median(x);
    var d = x.map(function (v) { return Math.abs(v - m); });
    var md = median(d);
    return scaled === false ? md : md * 1.4826;
  }

  function skewness(x) {
    var n = x.length, m = mean(x), s = sd(x), i, s3 = 0;
    if (n < 3 || !s) return NaN;
    for (i = 0; i < n; i++) s3 += Math.pow((x[i] - m) / s, 3);
    return n / ((n - 1) * (n - 2)) * s3;
  }

  function kurtosis(x) {
    var n = x.length, m = mean(x), s = sd(x), i, s4 = 0;
    if (n < 4 || !s) return NaN;
    for (i = 0; i < n; i++) s4 += Math.pow((x[i] - m) / s, 4);
    return (n * (n + 1) / ((n - 1) * (n - 2) * (n - 3))) * s4 -
      3 * (n - 1) * (n - 1) / ((n - 2) * (n - 3));
  }

  function geomMean(x) {
    var s = 0;
    for (var i = 0; i < x.length; i++) {
      if (x[i] <= 0) return NaN;
      s += Math.log(x[i]);
    }
    return Math.exp(s / x.length);
  }

  function harmMean(x) {
    var s = 0;
    for (var i = 0; i < x.length; i++) {
      if (x[i] === 0) return NaN;
      s += 1 / x[i];
    }
    return x.length / s;
  }

  function mode(x) {
    var c = {}, best = null, bc = 0;
    for (var i = 0; i < x.length; i++) {
      c[x[i]] = (c[x[i]] || 0) + 1;
      if (c[x[i]] > bc) { bc = c[x[i]]; best = x[i]; }
    }
    return bc > 1 ? { value: best, count: bc } : null;
  }

  /** Riassunto descrittivo completo. */
  function describe(xin, opts) {
    opts = opts || {};
    var x = clean(xin);
    var n = x.length;
    var conf = opts.conf == null ? 0.95 : opts.conf;
    var m = mean(x), s = sd(x);
    var tcrit = n > 1 ? dist.t.inv(1 - (1 - conf) / 2, n - 1) : NaN;
    var sem = s / Math.sqrt(n);
    return {
      n: n, nMissing: xin.length - n,
      mean: m, sd: s, se: sem, variance: variance(x), cv: cv(x),
      min: min(x), q1: q1(x), median: median(x), q3: q3(x), max: max(x),
      range: range(x), iqr: iqr(x),
      skewness: skewness(x), kurtosis: kurtosis(x),
      sum: sum(x), ss: x.reduce(function (a, v) { return a + v * v; }, 0),
      trimmedMean: n >= 4 ? trimmedMean(x) : NaN,
      mad: n ? mad(x) : NaN,
      ciMean: [m - tcrit * sem, m + tcrit * sem],
      ciSd: n > 1 ? [
        s * Math.sqrt((n - 1) / dist.chisq.inv(1 - (1 - conf) / 2, n - 1)),
        s * Math.sqrt((n - 1) / dist.chisq.inv((1 - conf) / 2, n - 1))
      ] : [NaN, NaN],
      ciMedian: ciMedian(x, conf),
      conf: conf,
      values: x
    };
  }

  /** IC non parametrico per la mediana (ordine statistico / binomiale). */
  function ciMedian(x, conf) {
    var s = sortAsc(x), n = s.length;
    if (n < 6) return [NaN, NaN];
    var alpha = 1 - (conf == null ? 0.95 : conf);
    var k = 0;
    for (var i = 1; i <= Math.floor(n / 2); i++) {
      if (2 * dist.binomial.cdf(i - 1, n, 0.5) > alpha) { k = i - 1; break; }
      k = i;
    }
    if (k < 1) k = 1;
    return [s[k - 1], s[n - k]];
  }

  /* --------------------------- ranghi --------------------------- */
  /** Ranghi medi sui pareggi. Ritorna { ranks, tieGroups } */
  function ranks(x) {
    var idx = x.map(function (v, i) { return { v: v, i: i }; });
    idx.sort(function (a, b) { return a.v - b.v; });
    var r = new Array(x.length), ties = [];
    var i = 0;
    while (i < idx.length) {
      var j = i;
      while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
      var avg = (i + j) / 2 + 1;
      for (var k = i; k <= j; k++) r[idx[k].i] = avg;
      if (j > i) ties.push(j - i + 1);
      i = j + 1;
    }
    return { ranks: r, tieGroups: ties };
  }

  /* ----------------------- correlazione ----------------------- */
  function pearson(x, y) {
    var n = Math.min(x.length, y.length);
    var mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
    var sxy = 0, sxx = 0, syy = 0;
    for (var i = 0; i < n; i++) {
      var a = x[i] - mx, b = y[i] - my;
      sxy += a * b; sxx += a * a; syy += b * b;
    }
    return sxy / Math.sqrt(sxx * syy);
  }

  function spearman(x, y) {
    return pearson(ranks(x).ranks, ranks(y).ranks);
  }

  /** p-value bilaterale per r di Pearson (t con n-2 gdl). */
  function corrP(r, n) {
    if (n < 3) return NaN;
    if (Math.abs(r) >= 1) return 0;
    var t = r * Math.sqrt((n - 2) / (1 - r * r));
    return 2 * (1 - dist.t.cdf(Math.abs(t), n - 2));
  }

  /** Kendall tau-b. */
  function kendall(x, y) {
    var n = x.length, conc = 0, disc = 0, tx = 0, ty = 0;
    for (var i = 0; i < n - 1; i++) {
      for (var j = i + 1; j < n; j++) {
        var a = x[i] - x[j], b = y[i] - y[j];
        var p = a * b;
        if (p > 0) conc++;
        else if (p < 0) disc++;
        else { if (a === 0 && b !== 0) tx++; else if (b === 0 && a !== 0) ty++; else { tx++; ty++; } }
      }
    }
    return (conc - disc) / Math.sqrt((conc + disc + tx) * (conc + disc + ty));
  }

  /* --------------------- test di normalita --------------------- */
  /** Anderson-Darling per normale con parametri stimati + p-value. */
  function andersonDarling(xin) {
    var x = sortAsc(clean(xin)), n = x.length;
    if (n < 5) return { n: n, A2: NaN, p: NaN };
    var m = mean(x), s = sd(x), i, S = 0;
    for (i = 0; i < n; i++) {
      var zi = dist.normal.cdf(x[i], m, s);
      var zn = dist.normal.cdf(x[n - 1 - i], m, s);
      zi = num.clamp(zi, 1e-14, 1 - 1e-14);
      zn = num.clamp(zn, 1e-14, 1 - 1e-14);
      S += (2 * (i + 1) - 1) * (Math.log(zi) + Math.log(1 - zn));
    }
    var A2 = -n - S / n;
    var A2s = A2 * (1 + 0.75 / n + 2.25 / (n * n));
    var p;
    if (A2s < 0.2) p = 1 - Math.exp(-13.436 + 101.14 * A2s - 223.73 * A2s * A2s);
    else if (A2s < 0.34) p = 1 - Math.exp(-8.318 + 42.796 * A2s - 59.938 * A2s * A2s);
    else if (A2s < 0.6) p = Math.exp(0.9177 - 4.279 * A2s - 1.38 * A2s * A2s);
    else if (A2s < 13) p = Math.exp(1.2937 - 5.709 * A2s + 0.0186 * A2s * A2s);
    else p = 0;
    return { n: n, A2: A2, A2adj: A2s, p: num.clamp(p, 0, 1), mean: m, sd: s };
  }

  /** Anderson-Darling per una distribuzione qualsiasi (p-value non calibrato). */
  function adGeneric(xin, d, params) {
    var x = sortAsc(clean(xin)), n = x.length, S = 0;
    for (var i = 0; i < n; i++) {
      var zi = num.clamp(dist.cdfOf(d, x[i], params), 1e-14, 1 - 1e-14);
      var zn = num.clamp(dist.cdfOf(d, x[n - 1 - i], params), 1e-14, 1 - 1e-14);
      S += (2 * (i + 1) - 1) * (Math.log(zi) + Math.log(1 - zn));
    }
    return -n - S / n;
  }

  /** Shapiro-Wilk (Royston AS R94). */
  function shapiroWilk(xin) {
    var x = sortAsc(clean(xin)), n = x.length;
    if (n < 3) return { W: NaN, p: NaN, n: n };
    if (n > 5000) x = x.filter(function (_, i) { return i % Math.ceil(n / 5000) === 0; });
    n = x.length;
    var i, m = new Array(n);
    for (i = 0; i < n; i++) m[i] = dist.qnorm((i + 1 - 0.375) / (n + 0.25));
    var mm = 0;
    for (i = 0; i < n; i++) mm += m[i] * m[i];
    var a = new Array(n);
    var u = 1 / Math.sqrt(n);
    var c = m.map(function (v) { return v / Math.sqrt(mm); });
    var an, an1, phi;
    if (n > 5) {
      an = -2.706056 * Math.pow(u, 5) + 4.434685 * Math.pow(u, 4) - 2.071190 * Math.pow(u, 3) -
        0.147981 * u * u + 0.221157 * u + c[n - 1];
      an1 = -3.582633 * Math.pow(u, 5) + 5.682633 * Math.pow(u, 4) - 1.752461 * Math.pow(u, 3) -
        0.293762 * u * u + 0.042981 * u + c[n - 2];
      phi = (mm - 2 * m[n - 1] * m[n - 1] - 2 * m[n - 2] * m[n - 2]) /
        (1 - 2 * an * an - 2 * an1 * an1);
      a[n - 1] = an; a[0] = -an;
      a[n - 2] = an1; a[1] = -an1;
      for (i = 2; i < n - 2; i++) a[i] = m[i] / Math.sqrt(phi);
    } else {
      an = -2.706056 * Math.pow(u, 5) + 4.434685 * Math.pow(u, 4) - 2.071190 * Math.pow(u, 3) -
        0.147981 * u * u + 0.221157 * u + c[n - 1];
      if (n === 3) an = Math.sqrt(0.5);
      phi = (mm - 2 * m[n - 1] * m[n - 1]) / (1 - 2 * an * an);
      a[n - 1] = an; a[0] = -an;
      for (i = 1; i < n - 1; i++) a[i] = m[i] / Math.sqrt(phi);
    }
    var xbar = mean(x), numr = 0, den = 0;
    for (i = 0; i < n; i++) {
      numr += a[i] * x[i];
      den += (x[i] - xbar) * (x[i] - xbar);
    }
    var W = numr * numr / den;
    // p-value
    var p, z, mu, sig, g, w1 = 1 - W;
    if (n === 3) {
      p = (6 / Math.PI) * (Math.asin(Math.sqrt(W)) - Math.asin(Math.sqrt(0.75)));
      p = num.clamp(p, 0, 1);
    } else if (n <= 11) {
      g = -2.273 + 0.459 * n;
      mu = 0.5440 - 0.39978 * n + 0.025054 * n * n - 0.0006714 * n * n * n;
      sig = Math.exp(1.3822 - 0.77857 * n + 0.062767 * n * n - 0.0020322 * n * n * n);
      var yy = -Math.log(g - Math.log(w1));
      z = (yy - mu) / sig;
      p = 1 - dist.normal.cdf(z);
    } else {
      var ln = Math.log(n);
      mu = -1.5861 - 0.31082 * ln - 0.083751 * ln * ln + 0.0038915 * ln * ln * ln;
      sig = Math.exp(-0.4803 - 0.082676 * ln + 0.0030302 * ln * ln);
      z = (Math.log(w1) - mu) / sig;
      p = 1 - dist.normal.cdf(z);
    }
    return { W: W, p: num.clamp(p, 0, 1), n: n };
  }

  /** Ryan-Joiner / Shapiro-Francia: correlazione con i punteggi normali. */
  function ryanJoiner(xin) {
    var x = sortAsc(clean(xin)), n = x.length;
    if (n < 5) return { R: NaN, p: NaN, n: n };
    var b = new Array(n);
    for (var i = 0; i < n; i++) b[i] = dist.qnorm((i + 1 - 0.375) / (n + 0.25));
    var R = pearson(x, b);
    var W = R * R;
    var lnn = Math.log(n), lnlnn = Math.log(lnn);
    var mu = -1.2725 + 1.0521 * (lnlnn - lnn);
    var sig = 1.0308 - 0.26758 * (lnlnn + 2 / lnn);
    var z = (Math.log(1 - W) - mu) / sig;
    return { R: R, p: num.clamp(1 - dist.normal.cdf(z), 0, 1), n: n };
  }

  /** Punti per il probability plot: x ordinati + percentili teorici. */
  function probPlotPoints(xin, d, params) {
    var x = sortAsc(clean(xin)), n = x.length, pts = [];
    d = d || dist.normal;
    if (!params) params = d.fit ? d.fit(x) : [mean(x), sd(x)];
    for (var i = 0; i < n; i++) {
      var pp = (i + 1 - 0.375) / (n + 0.25); // Blom
      pts.push({ x: x[i], p: pp, theo: dist.invOf(d, pp, params) });
    }
    return { points: pts, params: params, dist: d };
  }

  /* ------------------------ istogramma / KDE ------------------------ */
  function binCount(n, rule) {
    if (rule === 'sturges') return Math.ceil(Math.log2(n) + 1);
    if (rule === 'rice') return Math.ceil(2 * Math.pow(n, 1 / 3));
    if (rule === 'sqrt') return Math.ceil(Math.sqrt(n));
    return Math.max(5, Math.min(30, Math.ceil(Math.sqrt(n))));
  }

  /** Istogramma con bin "belli". */
  function histogram(xin, opts) {
    opts = opts || {};
    var x = clean(xin), n = x.length;
    if (!n) return { bins: [], width: 0 };
    var lo = opts.min == null ? min(x) : opts.min;
    var hi = opts.max == null ? max(x) : opts.max;
    if (lo === hi) { lo -= 0.5; hi += 0.5; }
    var k = opts.bins || binCount(n, opts.rule);
    var w = (hi - lo) / k;
    if (opts.nice !== false) {
      var mag = Math.pow(10, Math.floor(Math.log10(w)));
      var cand = [1, 2, 2.5, 5, 10].map(function (c) { return c * mag; });
      for (var ci = 0; ci < cand.length; ci++) { if (cand[ci] >= w) { w = cand[ci]; break; } }
      lo = Math.floor(lo / w) * w;
      hi = Math.ceil(hi / w) * w;
      k = Math.max(1, Math.round((hi - lo) / w));
    }
    var bins = [];
    for (var i = 0; i < k; i++) {
      bins.push({ lo: lo + i * w, hi: lo + (i + 1) * w, mid: lo + (i + 0.5) * w, count: 0, values: [] });
    }
    for (var j = 0; j < n; j++) {
      var idx = Math.floor((x[j] - lo) / w);
      if (idx >= k) idx = k - 1;
      if (idx < 0) idx = 0;
      bins[idx].count++;
    }
    bins.forEach(function (b) { b.density = b.count / (n * w); b.pct = 100 * b.count / n; });
    return { bins: bins, width: w, n: n, lo: lo, hi: hi };
  }

  /** Stima di densita kernel gaussiano, banda di Silverman. */
  function kde(xin, opts) {
    opts = opts || {};
    var x = clean(xin), n = x.length;
    if (n < 2) return [];
    var s = sd(x), iq = iqr(x);
    var h = opts.bw || 0.9 * Math.min(s, iq / 1.349) * Math.pow(n, -0.2);
    if (!isFinite(h) || h <= 0) h = s / 3 || 1;
    var lo = opts.min == null ? min(x) - 3 * h : opts.min;
    var hi = opts.max == null ? max(x) + 3 * h : opts.max;
    var k = opts.points || 200, out = [];
    for (var i = 0; i < k; i++) {
      var xi = lo + (hi - lo) * i / (k - 1), d = 0;
      for (var j = 0; j < n; j++) d += Math.exp(-0.5 * Math.pow((xi - x[j]) / h, 2));
      out.push({ x: xi, y: d / (n * h * Math.sqrt(2 * Math.PI)) });
    }
    return out;
  }

  /** ECDF. */
  function ecdf(xin) {
    var x = sortAsc(clean(xin)), n = x.length, out = [];
    for (var i = 0; i < n; i++) out.push({ x: x[i], p: (i + 1) / n });
    return out;
  }

  /* ------------------------- trasformazioni ------------------------- */
  /** Box-Cox: lambda ottimale per verosimiglianza (dati > 0). */
  function boxCoxLambda(xin, lo, hi) {
    var x = clean(xin).filter(function (v) { return v > 0; });
    if (x.length < 3) return NaN;
    lo = lo == null ? -5 : lo; hi = hi == null ? 5 : hi;
    var n = x.length, lnsum = 0, i;
    for (i = 0; i < n; i++) lnsum += Math.log(x[i]);
    var ll = function (lam) {
      var y = boxCox(x, lam);
      var v = variance(y, true);
      if (!(v > 0)) return -1e12;
      return -0.5 * n * Math.log(v) + (lam - 1) * lnsum;
    };
    var best = lo, bestv = -Infinity;
    for (var lam = lo; lam <= hi; lam += 0.01) {
      var v = ll(lam);
      if (v > bestv) { bestv = v; best = lam; }
    }
    // raffinamento locale
    var res = num.nelderMead(function (t) { return -ll(t[0]); }, [best], { step: 0.05 });
    return num.round(res.x[0], 4);
  }

  function boxCox(x, lam) {
    return x.map(function (v) {
      return Math.abs(lam) < 1e-9 ? Math.log(v) : (Math.pow(v, lam) - 1) / lam;
    });
  }

  function boxCoxInverse(y, lam) {
    return y.map(function (v) {
      return Math.abs(lam) < 1e-9 ? Math.exp(v) : Math.pow(1 + lam * v, 1 / lam);
    });
  }

  /** Yeo-Johnson (accetta valori negativi). */
  function yeoJohnson(x, lam) {
    return x.map(function (v) {
      if (v >= 0) return Math.abs(lam) < 1e-9 ? Math.log1p(v) : (Math.pow(v + 1, lam) - 1) / lam;
      return Math.abs(lam - 2) < 1e-9 ? -Math.log1p(-v) : -(Math.pow(1 - v, 2 - lam) - 1) / (2 - lam);
    });
  }

  function yeoJohnsonLambda(xin) {
    var x = clean(xin), n = x.length, i, sgnSum = 0;
    for (i = 0; i < n; i++) sgnSum += Math.sign(x[i]) * Math.log1p(Math.abs(x[i]));
    var ll = function (lam) {
      var y = yeoJohnson(x, lam);
      var v = variance(y, true);
      if (!(v > 0)) return -1e12;
      return -0.5 * n * Math.log(v) + (lam - 1) * sgnSum;
    };
    var best = -5, bestv = -Infinity;
    for (var lam = -5; lam <= 5; lam += 0.02) {
      var v = ll(lam);
      if (v > bestv) { bestv = v; best = lam; }
    }
    return num.round(best, 3);
  }

  /** Trasformazione di Johnson SU/SB/SL: cerca la famiglia col miglior p-value AD. */
  function johnson(xin) {
    var x = clean(xin);
    var best = null;
    var families = ['SL', 'SU', 'SB'];
    var xmin = min(x), xmax = max(x), rng = xmax - xmin;
    families.forEach(function (fam) {
      var fit = johnsonFit(x, fam, xmin, xmax, rng);
      if (!fit) return;
      var z = fit.transform(x).filter(isFinite);
      if (z.length < x.length * 0.95) return;
      var ad = andersonDarling(z);
      if (!best || ad.p > best.ad.p) best = { family: fam, fit: fit, ad: ad };
    });
    return best;
  }

  function johnsonFit(x, fam, xmin, xmax, rng) {
    var m = mean(x), s = sd(x);
    if (fam === 'SL') {
      var eps0 = xmin - 0.01 * rng;
      var t = function (v) { return Math.log(v - eps0); };
      var z = x.map(t).filter(isFinite);
      var mz = mean(z), sz = sd(z);
      return {
        label: 'SL: ' + 'gamma + eta*ln(X - eps)',
        params: { eps: eps0, mu: mz, sd: sz },
        transform: function (arr) { return arr.map(function (v) { return (Math.log(v - eps0) - mz) / sz; }); },
        inverse: function (zz) { return zz.map(function (v) { return eps0 + Math.exp(v * sz + mz); }); }
      };
    }
    if (fam === 'SU') {
      var obj = function (th) {
        var lam = Math.exp(th[1]);
        var zz = x.map(function (v) { return Math.asinh((v - th[0]) / lam); });
        var v0 = variance(zz, true);
        if (!(v0 > 0)) return 1e12;
        var mz2 = mean(zz), sz2 = Math.sqrt(v0);
        var std = zz.map(function (q) { return (q - mz2) / sz2; });
        return adGeneric(std, dist.normal, [0, 1]);
      };
      var r = num.nelderMead(obj, [m, Math.log(Math.max(s, 1e-6))], { step: 0.2, maxIter: 400 });
      var xi = r.x[0], lam = Math.exp(r.x[1]);
      var zz2 = x.map(function (v) { return Math.asinh((v - xi) / lam); });
      var mz3 = mean(zz2), sz3 = sd(zz2);
      return {
        label: 'SU: gamma + eta*asinh((X-xi)/lambda)',
        params: { xi: xi, lambda: lam, mu: mz3, sd: sz3 },
        transform: function (arr) {
          return arr.map(function (v) { return (Math.asinh((v - xi) / lam) - mz3) / sz3; });
        },
        inverse: function (zzz) {
          return zzz.map(function (v) { return xi + lam * Math.sinh(v * sz3 + mz3); });
        }
      };
    }
    // SB
    var eps = xmin - 0.005 * rng, lamb = rng * 1.01;
    var t2 = function (v) {
      var u = (v - eps) / lamb;
      u = num.clamp(u, 1e-9, 1 - 1e-9);
      return Math.log(u / (1 - u));
    };
    var zb = x.map(t2);
    var mzb = mean(zb), szb = sd(zb);
    return {
      label: 'SB: gamma + eta*ln((X-eps)/(eps+lambda-X))',
      params: { eps: eps, lambda: lamb, mu: mzb, sd: szb },
      transform: function (arr) { return arr.map(function (v) { return (t2(v) - mzb) / szb; }); },
      inverse: function (zc) {
        return zc.map(function (v) {
          var e = Math.exp(v * szb + mzb);
          return eps + lamb * e / (1 + e);
        });
      }
    };
  }

  /* --------------------------- outlier --------------------------- */
  /** Grubbs (massimo scostamento), bilaterale. */
  function grubbs(xin, alpha) {
    var x = clean(xin), n = x.length;
    if (n < 3) return null;
    alpha = alpha || 0.05;
    var m = mean(x), s = sd(x), gmax = 0, idx = -1;
    for (var i = 0; i < n; i++) {
      var g = Math.abs(x[i] - m) / s;
      if (g > gmax) { gmax = g; idx = i; }
    }
    var tc = dist.t.inv(1 - alpha / (2 * n), n - 2);
    var crit = (n - 1) / Math.sqrt(n) * Math.sqrt(tc * tc / (n - 2 + tc * tc));
    return { G: gmax, crit: crit, value: x[idx], index: idx, outlier: gmax > crit, alpha: alpha, n: n };
  }

  /** Outlier secondo regola IQR (1.5 = normali, 3 = estremi). */
  function iqrOutliers(xin, k) {
    var x = clean(xin);
    var lo = q1(x) - (k || 1.5) * iqr(x), hi = q3(x) + (k || 1.5) * iqr(x);
    return {
      lower: lo, upper: hi,
      outliers: x.map(function (v, i) { return { value: v, index: i }; })
        .filter(function (o) { return o.value < lo || o.value > hi; })
    };
  }

  /* --------------------------- bootstrap --------------------------- */
  /** IC bootstrap percentile per una statistica qualsiasi. */
  function bootstrapCI(xin, statFn, opts) {
    opts = opts || {};
    var x = clean(xin), n = x.length;
    var B = opts.B || 2000, conf = opts.conf || 0.95;
    var r = num.rng(opts.seed == null ? 12345 : opts.seed);
    var stats = new Array(B);
    for (var b = 0; b < B; b++) {
      var s = new Array(n);
      for (var i = 0; i < n; i++) s[i] = x[r.int(0, n - 1)];
      stats[b] = statFn(s);
    }
    stats = sortAsc(stats.filter(isFinite));
    var a = (1 - conf) / 2;
    return {
      estimate: statFn(x),
      lower: quantile(stats, a, 7),
      upper: quantile(stats, 1 - a, 7),
      se: sd(stats), B: B, conf: conf, replicates: stats
    };
  }

  /* ------------------ intervalli di tolleranza ------------------ */
  /** Intervallo di tolleranza normale bilaterale (Howe), copertura P, confidenza conf. */
  function toleranceInterval(xin, P, conf) {
    var x = clean(xin), n = x.length;
    P = P || 0.99; conf = conf || 0.95;
    if (n < 3) return null;
    var m = mean(x), s = sd(x);
    var z = dist.qnorm((1 + P) / 2);
    var chi = dist.chisq.inv(1 - conf, n - 1);
    var u = Math.sqrt((n - 1) * (1 + 1 / n) * z * z / chi);
    var w = Math.sqrt(1 + (n - 3 - chi) / (2 * (n + 1) * (n + 1)));
    var k2 = u * w;
    // unilaterale (Natrella / approssimazione non centrale)
    var zp = dist.qnorm(P), zg = dist.qnorm(conf);
    var aa = 1 - zg * zg / (2 * (n - 1));
    var bb = zp * zp - zg * zg / n;
    var k1 = (zp + Math.sqrt(Math.max(0, zp * zp - aa * bb))) / aa;
    return {
      n: n, mean: m, sd: s, P: P, conf: conf,
      k2: k2, lower: m - k2 * s, upper: m + k2 * s,
      k1: k1, lowerOne: m - k1 * s, upperOne: m + k1 * s,
      npLower: sortAsc(x)[0], npUpper: sortAsc(x)[n - 1]
    };
  }

  /* --------------------- serie e raggruppamenti --------------------- */
  /** Raggruppa y per livelli di g. Ritorna [{level, values}] ordinati. */
  function groupBy(y, g) {
    var mapObj = {}, order = [];
    for (var i = 0; i < y.length; i++) {
      var key = g[i] === null || g[i] === undefined || g[i] === '' ? '(vuoto)' : String(g[i]);
      var v = typeof y[i] === 'number' ? y[i] : parseFloat(String(y[i]).replace(',', '.'));
      if (!isFinite(v)) continue;
      if (!mapObj[key]) { mapObj[key] = []; order.push(key); }
      mapObj[key].push(v);
    }
    order.sort(function (a, b) {
      var na = parseFloat(a), nb = parseFloat(b);
      if (isFinite(na) && isFinite(nb)) return na - nb;
      return a < b ? -1 : (a > b ? 1 : 0);
    });
    return order.map(function (k) { return { level: k, values: mapObj[k] }; });
  }

  /** Tabella di frequenza per variabile categorica. */
  function frequency(col) {
    var mapObj = {}, total = 0;
    for (var i = 0; i < col.length; i++) {
      var k = col[i] === null || col[i] === undefined || col[i] === '' ? '(vuoto)' : String(col[i]);
      mapObj[k] = (mapObj[k] || 0) + 1;
      total++;
    }
    var rows = Object.keys(mapObj).map(function (k) {
      return { level: k, count: mapObj[k], pct: 100 * mapObj[k] / total };
    });
    rows.sort(function (a, b) { return b.count - a.count; });
    var cum = 0;
    rows.forEach(function (r) { cum += r.pct; r.cumPct = cum; });
    return { rows: rows, total: total };
  }

  /** Autocorrelazione fino a lag massimo. */
  function acf(xin, maxLag) {
    var x = clean(xin), n = x.length, m = mean(x);
    maxLag = Math.min(maxLag || Math.floor(n / 4), n - 2);
    var d0 = 0, i;
    for (i = 0; i < n; i++) d0 += (x[i] - m) * (x[i] - m);
    var out = [];
    for (var k = 1; k <= maxLag; k++) {
      var s = 0;
      for (i = 0; i < n - k; i++) s += (x[i] - m) * (x[i + k] - m);
      var r = s / d0;
      var seR = Math.sqrt(1 / n);
      out.push({ lag: k, r: r, se: seR, lower: -1.96 * seR, upper: 1.96 * seR });
    }
    return out;
  }

  return {
    clean: clean, sum: sum, mean: mean, variance: variance, sd: sd, se: se, cv: cv,
    min: min, max: max, range: range, sortAsc: sortAsc,
    quantile: quantile, median: median, q1: q1, q3: q3, iqr: iqr,
    trimmedMean: trimmedMean, mad: mad, skewness: skewness, kurtosis: kurtosis,
    geomMean: geomMean, harmMean: harmMean, mode: mode,
    describe: describe, ciMedian: ciMedian, ranks: ranks,
    pearson: pearson, spearman: spearman, kendall: kendall, corrP: corrP,
    andersonDarling: andersonDarling, adGeneric: adGeneric,
    shapiroWilk: shapiroWilk, ryanJoiner: ryanJoiner, probPlotPoints: probPlotPoints,
    histogram: histogram, binCount: binCount, kde: kde, ecdf: ecdf,
    boxCox: boxCox, boxCoxLambda: boxCoxLambda, boxCoxInverse: boxCoxInverse,
    yeoJohnson: yeoJohnson, yeoJohnsonLambda: yeoJohnsonLambda, johnson: johnson,
    grubbs: grubbs, iqrOutliers: iqrOutliers, bootstrapCI: bootstrapCI,
    toleranceInterval: toleranceInterval, groupBy: groupBy, frequency: frequency, acf: acf
  };
});
