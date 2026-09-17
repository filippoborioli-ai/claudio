/* CLAUDIO v3 - core/tests.js
 * Test di ipotesi parametrici e non parametrici.
 * Convenzione: alt = 'two' | 'less' | 'greater' (riferito al parametro stimato vs h0).
 * Ogni funzione ritorna un oggetto con statistica, gdl, p, IC e un campo `title`.
 */
;(function (root, name, deps, factory) {
  var res = deps.map(function (d) {
    return (typeof module === 'object' && module.exports && typeof require === 'function')
      ? require('./' + d + '.js') : root.C3[d];
  });
  var api = factory.apply(null, res);
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.C3 = root.C3 || {})[name] = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, 'tests', ['numeric', 'dist', 'stats'], function (num, dist, st) {
  'use strict';

  /** Accetta array semplice oppure {level, values} (attenzione: Array.prototype.values esiste). */
  function vals(g) { return Array.isArray(g) ? g : (g && g.values ? g.values : g); }

  function pFromT(t, df, alt) {
    if (alt === 'less') return dist.t.cdf(t, df);
    if (alt === 'greater') return 1 - dist.t.cdf(t, df);
    return 2 * (1 - dist.t.cdf(Math.abs(t), df));
  }

  function pFromZ(z, alt) {
    if (alt === 'less') return dist.normal.cdf(z);
    if (alt === 'greater') return 1 - dist.normal.cdf(z);
    return 2 * (1 - dist.normal.cdf(Math.abs(z)));
  }

  /* ======================= MEDIE ======================= */
  /** t test a un campione. */
  function tTest1(xin, mu0, opts) {
    opts = opts || {};
    var x = st.clean(xin), n = x.length, alt = opts.alt || 'two';
    var conf = opts.conf == null ? 0.95 : opts.conf;
    mu0 = mu0 || 0;
    var m = st.mean(x), s = st.sd(x), sem = s / Math.sqrt(n), df = n - 1;
    var t = (m - mu0) / sem;
    var tc = dist.t.inv(1 - (1 - conf) / 2, df);
    var ci = alt === 'two' ? [m - tc * sem, m + tc * sem]
      : (alt === 'greater' ? [m - dist.t.inv(conf, df) * sem, Infinity]
        : [-Infinity, m + dist.t.inv(conf, df) * sem]);
    return {
      title: 't a 1 campione', n: n, mean: m, sd: s, se: sem, df: df,
      mu0: mu0, t: t, p: pFromT(t, df, alt), ci: ci, conf: conf, alt: alt,
      effect: (m - mu0) / s
    };
  }

  /** z test a un campione (sigma nota). */
  function zTest1(xin, mu0, sigma, opts) {
    opts = opts || {};
    var x = st.clean(xin), n = x.length, alt = opts.alt || 'two';
    var conf = opts.conf == null ? 0.95 : opts.conf;
    var m = st.mean(x), sem = sigma / Math.sqrt(n);
    var z = (m - (mu0 || 0)) / sem;
    var zc = dist.qnorm(1 - (1 - conf) / 2);
    return {
      title: 'z a 1 campione', n: n, mean: m, sigma: sigma, se: sem,
      mu0: mu0 || 0, z: z, p: pFromZ(z, alt), ci: [m - zc * sem, m + zc * sem],
      conf: conf, alt: alt
    };
  }

  /** t test a 2 campioni. pooled=false -> Welch (default). */
  function tTest2(x1in, x2in, opts) {
    opts = opts || {};
    var x1 = st.clean(x1in), x2 = st.clean(x2in);
    var alt = opts.alt || 'two', conf = opts.conf == null ? 0.95 : opts.conf;
    var d0 = opts.diff || 0;
    var n1 = x1.length, n2 = x2.length;
    var m1 = st.mean(x1), m2 = st.mean(x2);
    var v1 = st.variance(x1), v2 = st.variance(x2);
    var pooled = !!opts.pooled, sp = NaN, se, df;
    if (pooled) {
      var sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2);
      sp = Math.sqrt(sp2);
      se = sp * Math.sqrt(1 / n1 + 1 / n2);
      df = n1 + n2 - 2;
    } else {
      se = Math.sqrt(v1 / n1 + v2 / n2);
      df = Math.pow(v1 / n1 + v2 / n2, 2) /
        (Math.pow(v1 / n1, 2) / (n1 - 1) + Math.pow(v2 / n2, 2) / (n2 - 1));
    }
    var diff = m1 - m2;
    var t = (diff - d0) / se;
    var tc = dist.t.inv(1 - (1 - conf) / 2, df);
    var sPooledForD = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / (n1 + n2 - 2));
    return {
      title: pooled ? 't a 2 campioni (varianze uguali)' : 't a 2 campioni (Welch)',
      n1: n1, n2: n2, mean1: m1, mean2: m2, sd1: Math.sqrt(v1), sd2: Math.sqrt(v2),
      diff: diff, se: se, df: df, t: t, p: pFromT(t, df, alt),
      ci: [diff - tc * se, diff + tc * se], sPooled: sp, conf: conf, alt: alt,
      cohenD: diff / sPooledForD
    };
  }

  /** t test appaiato. */
  function tTestPaired(x1in, x2in, opts) {
    opts = opts || {};
    var d = [], n = Math.min(x1in.length, x2in.length);
    for (var i = 0; i < n; i++) {
      var a = parseFloat(x1in[i]), b = parseFloat(x2in[i]);
      if (isFinite(a) && isFinite(b)) d.push(a - b);
    }
    var r = tTest1(d, opts.diff || 0, opts);
    r.title = 't appaiato';
    r.differences = d;
    r.mean1 = st.mean(st.clean(x1in));
    r.mean2 = st.mean(st.clean(x2in));
    return r;
  }

  /** TOST: test di equivalenza su 1 o 2 campioni. */
  function tost(x1, x2, lower, upper, opts) {
    opts = opts || {};
    var alpha = opts.alpha == null ? 0.05 : opts.alpha;
    var base = x2 ? tTest2(x1, x2, { pooled: opts.pooled, conf: 1 - 2 * alpha })
      : tTest1(x1, opts.target || 0, { conf: 1 - 2 * alpha });
    var diff = x2 ? base.diff : base.mean - base.mu0;
    var se = base.se, df = base.df;
    var tLow = (diff - lower) / se, tUp = (diff - upper) / se;
    var pLow = 1 - dist.t.cdf(tLow, df), pUp = dist.t.cdf(tUp, df);
    var p = Math.max(pLow, pUp);
    var tc = dist.t.inv(1 - alpha, df);
    return {
      title: 'Test di equivalenza (TOST)',
      diff: diff, se: se, df: df, lower: lower, upper: upper,
      tLower: tLow, pLower: pLow, tUpper: tUp, pUpper: pUp, p: p,
      ci: [diff - tc * se, diff + tc * se], equivalent: p < alpha, alpha: alpha
    };
  }

  /* ===================== PROPORZIONI ===================== */
  /** Test su 1 proporzione: normale + esatto binomiale, IC Wilson/Clopper-Pearson. */
  function propTest1(x, n, p0, opts) {
    opts = opts || {};
    var alt = opts.alt || 'two', conf = opts.conf == null ? 0.95 : opts.conf;
    p0 = p0 == null ? 0.5 : p0;
    var ph = x / n;
    var se0 = Math.sqrt(p0 * (1 - p0) / n);
    var z = (ph - p0) / se0;
    var zc = dist.qnorm(1 - (1 - conf) / 2);
    // Wilson score
    var den = 1 + zc * zc / n;
    var ctr = ph + zc * zc / (2 * n);
    var half = zc * Math.sqrt(ph * (1 - ph) / n + zc * zc / (4 * n * n));
    var wilson = [(ctr - half) / den, (ctr + half) / den];
    // Clopper-Pearson
    var a = (1 - conf) / 2;
    var cpLo = x === 0 ? 0 : dist.beta.inv(a, x, n - x + 1);
    var cpHi = x === n ? 1 : dist.beta.inv(1 - a, x + 1, n - x);
    // p esatto
    var pExact;
    if (alt === 'less') pExact = dist.binomial.cdf(x, n, p0);
    else if (alt === 'greater') pExact = 1 - dist.binomial.cdf(x - 1, n, p0);
    else {
      var pObs = dist.binomial.pmf(x, n, p0), s = 0;
      for (var k = 0; k <= n; k++) {
        var pk = dist.binomial.pmf(k, n, p0);
        if (pk <= pObs * (1 + 1e-9)) s += pk;
      }
      pExact = Math.min(1, s);
    }
    return {
      title: 'Test su 1 proporzione', x: x, n: n, phat: ph, p0: p0,
      z: z, p: pFromZ(z, alt), pExact: pExact,
      ciWilson: wilson, ciExact: [cpLo, cpHi], conf: conf, alt: alt,
      normalOK: n * p0 >= 5 && n * (1 - p0) >= 5
    };
  }

  /** Test su 2 proporzioni (z pooled) + IC sulla differenza + Fisher esatto. */
  function propTest2(x1, n1, x2, n2, opts) {
    opts = opts || {};
    var alt = opts.alt || 'two', conf = opts.conf == null ? 0.95 : opts.conf;
    var p1 = x1 / n1, p2 = x2 / n2, pp = (x1 + x2) / (n1 + n2);
    var se0 = Math.sqrt(pp * (1 - pp) * (1 / n1 + 1 / n2));
    var z = (p1 - p2) / se0;
    var seD = Math.sqrt(p1 * (1 - p1) / n1 + p2 * (1 - p2) / n2);
    var zc = dist.qnorm(1 - (1 - conf) / 2);
    return {
      title: 'Test su 2 proporzioni',
      x1: x1, n1: n1, x2: x2, n2: n2, p1: p1, p2: p2, diff: p1 - p2,
      z: z, p: pFromZ(z, alt), ci: [(p1 - p2) - zc * seD, (p1 - p2) + zc * seD],
      pFisher: fisherExact([[x1, n1 - x1], [x2, n2 - x2]], alt).p,
      conf: conf, alt: alt,
      relativeRisk: p1 / p2,
      oddsRatio: (x1 / (n1 - x1)) / (x2 / (n2 - x2))
    };
  }

  /* ====================== VARIANZE ====================== */
  /** Test chi-quadro su 1 varianza. */
  function varTest1(xin, sigma0, opts) {
    opts = opts || {};
    var x = st.clean(xin), n = x.length, alt = opts.alt || 'two';
    var conf = opts.conf == null ? 0.95 : opts.conf;
    var s2 = st.variance(x), df = n - 1;
    var chi = df * s2 / (sigma0 * sigma0);
    var p;
    if (alt === 'less') p = dist.chisq.cdf(chi, df);
    else if (alt === 'greater') p = 1 - dist.chisq.cdf(chi, df);
    else p = 2 * Math.min(dist.chisq.cdf(chi, df), 1 - dist.chisq.cdf(chi, df));
    var a = (1 - conf) / 2;
    return {
      title: 'Test su 1 varianza', n: n, sd: Math.sqrt(s2), variance: s2,
      sigma0: sigma0, chisq: chi, df: df, p: Math.min(1, p),
      ciSd: [Math.sqrt(df * s2 / dist.chisq.inv(1 - a, df)), Math.sqrt(df * s2 / dist.chisq.inv(a, df))],
      conf: conf, alt: alt
    };
  }

  /** Test F su 2 varianze + Levene (Brown-Forsythe) robusto. */
  function varTest2(x1in, x2in, opts) {
    opts = opts || {};
    var x1 = st.clean(x1in), x2 = st.clean(x2in);
    var alt = opts.alt || 'two', conf = opts.conf == null ? 0.95 : opts.conf;
    var n1 = x1.length, n2 = x2.length;
    var v1 = st.variance(x1), v2 = st.variance(x2);
    var f = v1 / v2, df1 = n1 - 1, df2 = n2 - 1;
    var p;
    if (alt === 'less') p = dist.F.cdf(f, df1, df2);
    else if (alt === 'greater') p = 1 - dist.F.cdf(f, df1, df2);
    else p = 2 * Math.min(dist.F.cdf(f, df1, df2), 1 - dist.F.cdf(f, df1, df2));
    var a = (1 - conf) / 2;
    var lev = levene([x1, x2]);
    return {
      title: 'Test su 2 varianze', n1: n1, n2: n2, sd1: Math.sqrt(v1), sd2: Math.sqrt(v2),
      F: f, df1: df1, df2: df2, p: Math.min(1, p),
      ciRatio: [f / dist.F.inv(1 - a, df1, df2), f / dist.F.inv(a, df1, df2)],
      levene: lev, conf: conf, alt: alt
    };
  }

  /** Levene con centro mediana (Brown-Forsythe) o media. */
  function levene(groups, useMean) {
    var k = groups.length, N = 0, i, j;
    var z = [], means = [];
    for (i = 0; i < k; i++) {
      var g = st.clean(groups[i]);
      var c = useMean ? st.mean(g) : st.median(g);
      var zi = g.map(function (v) { return Math.abs(v - c); });
      z.push(zi); N += zi.length;
      means.push(st.mean(zi));
    }
    var grand = 0;
    for (i = 0; i < k; i++) grand += means[i] * z[i].length;
    grand /= N;
    var sb = 0, sw = 0;
    for (i = 0; i < k; i++) {
      sb += z[i].length * Math.pow(means[i] - grand, 2);
      for (j = 0; j < z[i].length; j++) sw += Math.pow(z[i][j] - means[i], 2);
    }
    var W = ((N - k) * sb) / ((k - 1) * sw);
    return {
      title: useMean ? 'Levene (media)' : 'Levene (mediana / Brown-Forsythe)',
      W: W, df1: k - 1, df2: N - k, p: 1 - dist.F.cdf(W, k - 1, N - k)
    };
  }

  /** Bartlett (richiede normalita). */
  function bartlett(groups) {
    var k = groups.length, N = 0, sp = 0, sumLog = 0, sumInv = 0, i;
    var ns = [], vs = [];
    for (i = 0; i < k; i++) {
      var g = st.clean(groups[i]);
      ns.push(g.length); vs.push(st.variance(g));
      N += g.length;
    }
    for (i = 0; i < k; i++) sp += (ns[i] - 1) * vs[i];
    sp /= (N - k);
    for (i = 0; i < k; i++) {
      sumLog += (ns[i] - 1) * Math.log(vs[i]);
      sumInv += 1 / (ns[i] - 1);
    }
    var T = ((N - k) * Math.log(sp) - sumLog) /
      (1 + (sumInv - 1 / (N - k)) / (3 * (k - 1)));
    return {
      title: 'Bartlett', T: T, df: k - 1, p: 1 - dist.chisq.cdf(T, k - 1),
      sdPooled: Math.sqrt(sp)
    };
  }

  /* ===================== NON PARAMETRICI ===================== */
  /** Mann-Whitney U (Wilcoxon rank-sum), approx normale con correzione pareggi. */
  function mannWhitney(x1in, x2in, opts) {
    opts = opts || {};
    var alt = opts.alt || 'two';
    var x1 = st.clean(x1in), x2 = st.clean(x2in);
    var n1 = x1.length, n2 = x2.length, N = n1 + n2;
    var all = x1.concat(x2);
    var rk = st.ranks(all);
    var R1 = 0;
    for (var i = 0; i < n1; i++) R1 += rk.ranks[i];
    var U1 = R1 - n1 * (n1 + 1) / 2;
    var U2 = n1 * n2 - U1;
    var mu = n1 * n2 / 2;
    var tieSum = rk.tieGroups.reduce(function (a, t) { return a + (t * t * t - t); }, 0);
    var sig = Math.sqrt((n1 * n2 / 12) * ((N + 1) - tieSum / (N * (N - 1))));
    var U = U1;
    var z = (U - mu) / sig;
    var zc = z - Math.sign(z) * 0.5 / sig; // correzione di continuita
    var p;
    if (alt === 'less') p = dist.normal.cdf(zc);
    else if (alt === 'greater') p = 1 - dist.normal.cdf(zc);
    else p = 2 * (1 - dist.normal.cdf(Math.abs(zc)));
    // stima di Hodges-Lehmann della differenza
    var diffs = [];
    for (var a = 0; a < n1; a++) for (var b = 0; b < n2; b++) diffs.push(x1[a] - x2[b]);
    return {
      title: 'Mann-Whitney (Wilcoxon rank-sum)',
      n1: n1, n2: n2, W: R1, U: U1, U2: U2, z: zc, p: Math.min(1, p),
      median1: st.median(x1), median2: st.median(x2),
      hodgesLehmann: st.median(diffs), alt: alt
    };
  }

  /** Wilcoxon signed-rank (1 campione / appaiato). */
  function wilcoxonSigned(xin, mu0, opts) {
    opts = opts || {};
    var alt = opts.alt || 'two';
    mu0 = mu0 || 0;
    var d = st.clean(xin).map(function (v) { return v - mu0; }).filter(function (v) { return v !== 0; });
    var n = d.length;
    var absd = d.map(Math.abs);
    var rk = st.ranks(absd);
    var Wp = 0, Wm = 0;
    for (var i = 0; i < n; i++) {
      if (d[i] > 0) Wp += rk.ranks[i]; else Wm += rk.ranks[i];
    }
    var W = Wp;
    var mu = n * (n + 1) / 4;
    var tieSum = rk.tieGroups.reduce(function (a, t) { return a + (t * t * t - t); }, 0);
    var sig = Math.sqrt(n * (n + 1) * (2 * n + 1) / 24 - tieSum / 48);
    var z = (W - mu) / sig;
    var p;
    if (alt === 'less') p = dist.normal.cdf(z);
    else if (alt === 'greater') p = 1 - dist.normal.cdf(z);
    else p = 2 * (1 - dist.normal.cdf(Math.abs(z)));
    // Hodges-Lehmann: mediana delle medie di Walsh
    var walsh = [];
    for (var a = 0; a < n; a++) for (var b = a; b < n; b++) walsh.push((d[a] + d[b]) / 2);
    return {
      title: 'Wilcoxon signed-rank', n: n, W: W, Wminus: Wm, z: z, p: Math.min(1, p),
      median: st.median(st.clean(xin)), mu0: mu0,
      hodgesLehmann: st.median(walsh) + mu0, alt: alt
    };
  }

  /** Test dei segni. */
  function signTest(xin, mu0, opts) {
    opts = opts || {};
    var alt = opts.alt || 'two';
    mu0 = mu0 || 0;
    var x = st.clean(xin), below = 0, above = 0;
    x.forEach(function (v) { if (v > mu0) above++; else if (v < mu0) below++; });
    var n = above + below;
    var p;
    if (alt === 'less') p = dist.binomial.cdf(above, n, 0.5);
    else if (alt === 'greater') p = 1 - dist.binomial.cdf(above - 1, n, 0.5);
    else p = Math.min(1, 2 * Math.min(dist.binomial.cdf(Math.min(above, below), n, 0.5), 0.5) * 1);
    if (alt === 'two') p = Math.min(1, 2 * dist.binomial.cdf(Math.min(above, below), n, 0.5));
    return {
      title: 'Test dei segni', n: n, above: above, below: below, ties: x.length - n,
      median: st.median(x), mu0: mu0, p: p, alt: alt
    };
  }

  /** Kruskal-Wallis. */
  function kruskalWallis(groups) {
    var all = [], sizes = [], i, j;
    for (i = 0; i < groups.length; i++) {
      var g = st.clean(vals(groups[i]));
      sizes.push(g.length);
      all = all.concat(g);
    }
    var N = all.length, rk = st.ranks(all);
    var pos = 0, H = 0, rows = [];
    for (i = 0; i < sizes.length; i++) {
      var R = 0;
      for (j = 0; j < sizes[i]; j++) R += rk.ranks[pos + j];
      H += R * R / sizes[i];
      rows.push({
        level: (groups[i].level != null ? groups[i].level : 'G' + (i + 1)),
        n: sizes[i], median: st.median(all.slice(pos, pos + sizes[i])),
        meanRank: R / sizes[i], z: 0
      });
      pos += sizes[i];
    }
    H = 12 / (N * (N + 1)) * H - 3 * (N + 1);
    var tieSum = rk.tieGroups.reduce(function (a, t) { return a + (t * t * t - t); }, 0);
    var corr = 1 - tieSum / (N * N * N - N);
    var Hc = corr > 0 ? H / corr : H;
    var df = sizes.length - 1;
    // z per confronto di ogni gruppo con il resto
    var meanRankAll = (N + 1) / 2;
    rows.forEach(function (r) {
      var sigR = Math.sqrt((N * (N + 1) / 12) * (1 / r.n - 1 / N));
      r.z = (r.meanRank - meanRankAll) / sigR;
    });
    return {
      title: 'Kruskal-Wallis', H: H, Hadj: Hc, df: df,
      p: 1 - dist.chisq.cdf(Hc, df), rows: rows, N: N
    };
  }

  /** Mood median test. */
  function moodsMedian(groups) {
    var all = [], i;
    var gs = groups.map(function (g) { return st.clean(vals(g)); });
    gs.forEach(function (g) { all = all.concat(g); });
    var med = st.median(all);
    var table = gs.map(function (g) {
      var above = g.filter(function (v) { return v > med; }).length;
      return [above, g.length - above];
    });
    var chi = chiSquareTable(table);
    return {
      title: 'Test della mediana di Mood', grandMedian: med,
      rows: gs.map(function (g, idx) {
        return {
          level: groups[idx].level != null ? groups[idx].level : 'G' + (idx + 1),
          n: g.length, above: table[idx][0], belowEq: table[idx][1],
          median: st.median(g), q1: st.q1(g), q3: st.q3(g)
        };
      }),
      chisq: chi.chisq, df: chi.df, p: chi.p
    };
  }

  /** Friedman (blocchi randomizzati, dati come matrice trattamenti x blocchi). */
  function friedman(matrix) {
    // matrix[block][treatment]
    var b = matrix.length, k = matrix[0].length, i, j;
    var Rsum = new Array(k).fill(0);
    for (i = 0; i < b; i++) {
      var rk = st.ranks(matrix[i]);
      for (j = 0; j < k; j++) Rsum[j] += rk.ranks[j];
    }
    var S = 0;
    for (j = 0; j < k; j++) S += Math.pow(Rsum[j] - b * (k + 1) / 2, 2);
    var Q = 12 * S / (b * k * (k + 1));
    return {
      title: 'Friedman', S: Q, df: k - 1, p: 1 - dist.chisq.cdf(Q, k - 1),
      sumRanks: Rsum, b: b, k: k
    };
  }

  /** Runs test (casualita della sequenza rispetto alla mediana). */
  function runsTest(xin) {
    var x = st.clean(xin), med = st.median(x);
    var seq = x.filter(function (v) { return v !== med; }).map(function (v) { return v > med ? 1 : 0; });
    var n = seq.length, n1 = seq.filter(function (v) { return v === 1; }).length, n2 = n - n1;
    var runs = 1;
    for (var i = 1; i < n; i++) if (seq[i] !== seq[i - 1]) runs++;
    var mu = 2 * n1 * n2 / n + 1;
    var sig = Math.sqrt(2 * n1 * n2 * (2 * n1 * n2 - n) / (n * n * (n - 1)));
    var z = (runs - mu) / sig;
    return {
      title: 'Runs test', runs: runs, expected: mu, n1: n1, n2: n2,
      z: z, p: 2 * (1 - dist.normal.cdf(Math.abs(z)))
    };
  }

  /* ================== TABELLE DI CONTINGENZA ================== */
  /** Chi-quadro su tabella osservata (righe x colonne). */
  function chiSquareTable(obs, opts) {
    opts = opts || {};
    var r = obs.length, c = obs[0].length, i, j;
    var rowT = new Array(r).fill(0), colT = new Array(c).fill(0), N = 0;
    for (i = 0; i < r; i++) for (j = 0; j < c; j++) {
      rowT[i] += obs[i][j]; colT[j] += obs[i][j]; N += obs[i][j];
    }
    var exp = [], chi = 0, lr = 0, minExp = Infinity, nSmall = 0;
    for (i = 0; i < r; i++) {
      exp.push([]);
      for (j = 0; j < c; j++) {
        var e = rowT[i] * colT[j] / N;
        exp[i].push(e);
        if (e < minExp) minExp = e;
        if (e < 5) nSmall++;
        var d = Math.abs(obs[i][j] - e);
        if (opts.yates && r === 2 && c === 2) d = Math.max(0, d - 0.5);
        if (e > 0) chi += d * d / e;
        if (obs[i][j] > 0 && e > 0) lr += 2 * obs[i][j] * Math.log(obs[i][j] / e);
      }
    }
    var df = (r - 1) * (c - 1);
    return {
      title: 'Chi-quadro di associazione', observed: obs, expected: exp,
      chisq: chi, df: df, p: 1 - dist.chisq.cdf(chi, df),
      likelihoodRatio: lr, pLR: 1 - dist.chisq.cdf(lr, df),
      N: N, rowTotals: rowT, colTotals: colT,
      minExpected: minExp, pctSmallExpected: 100 * nSmall / (r * c),
      cramerV: Math.sqrt(chi / (N * Math.min(r - 1, c - 1))),
      contributions: obs.map(function (row, ii) {
        return row.map(function (o, jj) {
          return (o - exp[ii][jj]) / Math.sqrt(exp[ii][jj]);
        });
      })
    };
  }

  /** Chi-quadro di adattamento a frequenze attese. */
  function chiSquareGOF(obs, expProb) {
    var N = obs.reduce(function (a, b) { return a + b; }, 0);
    var k = obs.length;
    var p = expProb || new Array(k).fill(1 / k);
    var sp = p.reduce(function (a, b) { return a + b; }, 0);
    p = p.map(function (v) { return v / sp; });
    var chi = 0, exp = [];
    for (var i = 0; i < k; i++) {
      var e = N * p[i];
      exp.push(e);
      chi += Math.pow(obs[i] - e, 2) / e;
    }
    return {
      title: 'Chi-quadro di adattamento', observed: obs, expected: exp,
      chisq: chi, df: k - 1, p: 1 - dist.chisq.cdf(chi, k - 1), N: N
    };
  }

  /** Fisher esatto 2x2. */
  function fisherExact(table, alt) {
    alt = alt || 'two';
    var a = table[0][0], b = table[0][1], c = table[1][0], d = table[1][1];
    var n = a + b + c + d, r1 = a + b, c1 = a + c;
    function pk(k) {
      return Math.exp(num.lnChoose(r1, k) + num.lnChoose(n - r1, c1 - k) - num.lnChoose(n, c1));
    }
    var lo = Math.max(0, c1 - (n - r1)), hi = Math.min(r1, c1);
    var pObs = pk(a), p = 0, k;
    if (alt === 'two') {
      for (k = lo; k <= hi; k++) { var v = pk(k); if (v <= pObs * (1 + 1e-9)) p += v; }
    } else if (alt === 'less') {
      for (k = lo; k <= a; k++) p += pk(k);
    } else {
      for (k = a; k <= hi; k++) p += pk(k);
    }
    return { title: 'Fisher esatto', p: Math.min(1, p), oddsRatio: (a * d) / (b * c) };
  }

  /* ===================== TASSI POISSON ===================== */
  /** Test su 1 tasso di Poisson. */
  function poissonTest1(count, exposure, rate0, opts) {
    opts = opts || {};
    var alt = opts.alt || 'two', conf = opts.conf == null ? 0.95 : opts.conf;
    var lamHat = count / exposure;
    var mu0 = rate0 * exposure;
    var p;
    if (alt === 'less') p = dist.poisson.cdf(count, mu0);
    else if (alt === 'greater') p = 1 - dist.poisson.cdf(count - 1, mu0);
    else {
      p = 2 * Math.min(dist.poisson.cdf(count, mu0), 1 - dist.poisson.cdf(count - 1, mu0));
      p = Math.min(1, p);
    }
    var a = (1 - conf) / 2;
    var lo = count === 0 ? 0 : dist.chisq.inv(a, 2 * count) / 2;
    var hi = dist.chisq.inv(1 - a, 2 * (count + 1)) / 2;
    return {
      title: 'Test su 1 tasso (Poisson)', count: count, exposure: exposure,
      rate: lamHat, rate0: rate0, p: p,
      ci: [lo / exposure, hi / exposure], conf: conf, alt: alt
    };
  }

  /** Test su 2 tassi di Poisson (normale sulla differenza + esatto binomiale condizionale). */
  function poissonTest2(c1, e1, c2, e2, opts) {
    opts = opts || {};
    var alt = opts.alt || 'two', conf = opts.conf == null ? 0.95 : opts.conf;
    var r1 = c1 / e1, r2 = c2 / e2;
    var se = Math.sqrt(c1 / (e1 * e1) + c2 / (e2 * e2));
    var z = (r1 - r2) / se;
    var pExact = propTest1(c1, c1 + c2, e1 / (e1 + e2), { alt: alt }).pExact;
    var zc = dist.qnorm(1 - (1 - conf) / 2);
    return {
      title: 'Test su 2 tassi (Poisson)', rate1: r1, rate2: r2, diff: r1 - r2,
      z: z, p: pFromZ(z, alt), pExact: pExact,
      ci: [(r1 - r2) - zc * se, (r1 - r2) + zc * se], conf: conf, alt: alt
    };
  }

  /* ================= confronto di 2 distribuzioni ================= */
  /** Kolmogorov-Smirnov a 2 campioni. */
  function ks2(x1in, x2in) {
    var x1 = st.sortAsc(st.clean(x1in)), x2 = st.sortAsc(st.clean(x2in));
    var n1 = x1.length, n2 = x2.length, i = 0, j = 0, d = 0;
    while (i < n1 && j < n2) {
      var f1 = (i + 1) / n1, f2 = (j + 1) / n2;
      if (x1[i] <= x2[j]) i++; else j++;
      d = Math.max(d, Math.abs((i) / n1 - (j) / n2));
    }
    var ne = Math.sqrt(n1 * n2 / (n1 + n2));
    var lam = (ne + 0.12 + 0.11 / ne) * d;
    var p = 0;
    for (var k = 1; k <= 100; k++) p += 2 * Math.pow(-1, k - 1) * Math.exp(-2 * k * k * lam * lam);
    return { title: 'Kolmogorov-Smirnov 2 campioni', D: d, p: num.clamp(p, 0, 1), n1: n1, n2: n2 };
  }

  return {
    tTest1: tTest1, zTest1: zTest1, tTest2: tTest2, tTestPaired: tTestPaired, tost: tost,
    propTest1: propTest1, propTest2: propTest2,
    varTest1: varTest1, varTest2: varTest2, levene: levene, bartlett: bartlett,
    mannWhitney: mannWhitney, wilcoxonSigned: wilcoxonSigned, signTest: signTest,
    vals: vals, kruskalWallis: kruskalWallis, moodsMedian: moodsMedian, friedman: friedman,
    runsTest: runsTest,
    chiSquareTable: chiSquareTable, chiSquareGOF: chiSquareGOF, fisherExact: fisherExact,
    poissonTest1: poissonTest1, poissonTest2: poissonTest2, ks2: ks2,
    pFromT: pFromT, pFromZ: pFromZ
  };
});
