/* CLAUDIO v3 - core/timeseries.js
 * Serie storiche: analisi di trend, medie mobili, smorzamento esponenziale
 * (singolo, doppio di Holt, triplo di Holt-Winters), decomposizione,
 * differenze, ACF/PACF, previsione con intervalli.
 */
;(function (root, name, deps, factory) {
  var res = deps.map(function (d) {
    return (typeof module === 'object' && module.exports && typeof require === 'function')
      ? require('./' + d + '.js') : root.C3[d];
  });
  var api = factory.apply(null, res);
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.C3 = root.C3 || {})[name] = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, 'timeseries',
['numeric', 'dist', 'stats', 'regression'], function (num, dist, st, reg) {
  'use strict';

  /** Indici di accuratezza. */
  function accuracy(actual, fitted) {
    var n = 0, mad = 0, mse = 0, mape = 0;
    for (var i = 0; i < actual.length; i++) {
      if (!isFinite(actual[i]) || fitted[i] == null || !isFinite(fitted[i])) continue;
      var e = actual[i] - fitted[i];
      mad += Math.abs(e); mse += e * e;
      if (actual[i] !== 0) mape += Math.abs(e / actual[i]);
      n++;
    }
    return {
      n: n, mad: mad / n, msd: mse / n, rmse: Math.sqrt(mse / n),
      mape: 100 * mape / n
    };
  }

  /**
   * Analisi di trend: lineare, quadratico, esponenziale, curva S (logistica semplificata).
   */
  function trendAnalysis(values, opts) {
    opts = opts || {};
    var y = st.clean(values);
    var n = y.length;
    var t = [];
    for (var i = 1; i <= n; i++) t.push(i);
    var model = opts.model || 'linear';
    var fit, fitted, forecastFn, equation;
    if (model === 'quadratic') {
      fit = reg.polyFit(t, y, 2);
      fitted = fit.fitted;
      forecastFn = function (tt) { return fit.beta[0] + fit.beta[1] * tt + fit.beta[2] * tt * tt; };
      equation = 'Y = ' + num.round(fit.beta[0], 4) + ' + ' + num.round(fit.beta[1], 4) + 't + ' + num.round(fit.beta[2], 5) + 't^2';
    } else if (model === 'exponential') {
      var ly = y.map(function (v) { return Math.log(Math.max(1e-12, v)); });
      fit = reg.polyFit(t, ly, 1);
      fitted = fit.fitted.map(Math.exp);
      forecastFn = function (tt) { return Math.exp(fit.beta[0] + fit.beta[1] * tt); };
      equation = 'Y = ' + num.round(Math.exp(fit.beta[0]), 4) + ' * ' + num.round(Math.exp(fit.beta[1]), 6) + '^t';
    } else {
      fit = reg.polyFit(t, y, 1);
      fitted = fit.fitted;
      forecastFn = function (tt) { return fit.beta[0] + fit.beta[1] * tt; };
      equation = 'Y = ' + num.round(fit.beta[0], 4) + ' + ' + num.round(fit.beta[1], 4) + 't';
    }
    var h = opts.horizon || 0;
    var fc = [];
    for (var k = 1; k <= h; k++) {
      var tt2 = n + k;
      var pr = model === 'exponential' ? null : fit.predictAt(tt2);
      fc.push({
        t: tt2, fit: forecastFn(tt2),
        lower: pr ? pr.pi[0] : null, upper: pr ? pr.pi[1] : null
      });
    }
    return {
      model: model, equation: equation, coefficients: fit.beta,
      fitted: fitted, actual: y, t: t, accuracy: accuracy(y, fitted),
      forecast: fc, r2: fit.r2, s: fit.s, fit: fit
    };
  }

  /** Media mobile centrata o trailing. */
  function movingAverage(values, w, centered) {
    var y = st.clean(values), n = y.length, out = [];
    for (var i = 0; i < n; i++) {
      var lo, hi;
      if (centered) {
        var half = Math.floor(w / 2);
        lo = i - half; hi = i + half;
        if (w % 2 === 0) hi = i + half - 1;
      } else { lo = i - w + 1; hi = i; }
      if (lo < 0 || hi >= n) { out.push(null); continue; }
      out.push(st.mean(y.slice(lo, hi + 1)));
    }
    return { values: y, ma: out, w: w, centered: !!centered, accuracy: accuracy(y, out) };
  }

  /** Smorzamento esponenziale singolo. */
  function ses(values, alpha, horizon) {
    var y = st.clean(values), n = y.length;
    if (alpha == null) alpha = optimizeAlpha(y, function (a) { return ses(y, a, 0).accuracy.msd; });
    var level = y[0], fitted = [y[0]];
    for (var i = 1; i < n; i++) {
      fitted.push(level);
      level = alpha * y[i] + (1 - alpha) * level;
    }
    var acc = accuracy(y, fitted);
    var fc = [];
    for (var h = 1; h <= (horizon || 0); h++) {
      var se = acc.rmse * Math.sqrt(1 + (h - 1) * alpha * alpha);
      fc.push({ t: n + h, fit: level, lower: level - 1.96 * se, upper: level + 1.96 * se });
    }
    return { method: 'Smorzamento esponenziale singolo', alpha: alpha, level: level, fitted: fitted, actual: y, accuracy: acc, forecast: fc };
  }

  /** Holt (doppio smorzamento: livello + trend). */
  function holt(values, alpha, beta, horizon) {
    var y = st.clean(values), n = y.length;
    if (alpha == null || beta == null) {
      var best = null;
      for (var a = 0.05; a <= 0.95; a += 0.05) {
        for (var b = 0.05; b <= 0.95; b += 0.05) {
          var m = holt(y, a, b, 0).accuracy.msd;
          if (!best || m < best.m) best = { a: a, b: b, m: m };
        }
      }
      alpha = best.a; beta = best.b;
    }
    var level = y[0], trend = n > 1 ? y[1] - y[0] : 0;
    var fitted = [y[0]];
    for (var i = 1; i < n; i++) {
      var f = level + trend;
      fitted.push(f);
      var newLevel = alpha * y[i] + (1 - alpha) * f;
      trend = beta * (newLevel - level) + (1 - beta) * trend;
      level = newLevel;
    }
    var acc = accuracy(y, fitted);
    var fc = [];
    for (var h = 1; h <= (horizon || 0); h++) {
      var v = level + h * trend;
      var se = acc.rmse * Math.sqrt(h);
      fc.push({ t: n + h, fit: v, lower: v - 1.96 * se, upper: v + 1.96 * se });
    }
    return {
      method: 'Holt (trend lineare)', alpha: alpha, beta: beta,
      level: level, trend: trend, fitted: fitted, actual: y, accuracy: acc, forecast: fc
    };
  }

  /** Holt-Winters (livello + trend + stagionalita). */
  function holtWinters(values, period, opts) {
    opts = opts || {};
    var y = st.clean(values), n = y.length;
    var mult = opts.multiplicative === true;
    var alpha = opts.alpha == null ? 0.2 : opts.alpha;
    var beta = opts.beta == null ? 0.1 : opts.beta;
    var gamma = opts.gamma == null ? 0.1 : opts.gamma;
    if (n < 2 * period) return null;
    // inizializzazione
    var seasons = [];
    var firstMean = st.mean(y.slice(0, period));
    var secondMean = st.mean(y.slice(period, 2 * period));
    for (var s = 0; s < period; s++) {
      seasons.push(mult ? y[s] / firstMean : y[s] - firstMean);
    }
    var level = firstMean;
    var trend = (secondMean - firstMean) / period;
    var fitted = [], i;
    for (i = 0; i < n; i++) {
      var sIdx = i % period;
      var f = mult ? (level + trend) * seasons[sIdx] : (level + trend + seasons[sIdx]);
      fitted.push(i < period ? null : f);
      var newLevel, newSeason;
      if (mult) {
        newLevel = alpha * (y[i] / (seasons[sIdx] || 1e-9)) + (1 - alpha) * (level + trend);
        newSeason = gamma * (y[i] / (newLevel || 1e-9)) + (1 - gamma) * seasons[sIdx];
      } else {
        newLevel = alpha * (y[i] - seasons[sIdx]) + (1 - alpha) * (level + trend);
        newSeason = gamma * (y[i] - newLevel) + (1 - gamma) * seasons[sIdx];
      }
      trend = beta * (newLevel - level) + (1 - beta) * trend;
      level = newLevel;
      seasons[sIdx] = newSeason;
    }
    var acc = accuracy(y, fitted);
    var fc = [];
    for (var h = 1; h <= (opts.horizon || 0); h++) {
      var idx = (n + h - 1) % period;
      var v = mult ? (level + h * trend) * seasons[idx] : (level + h * trend + seasons[idx]);
      var se = acc.rmse * Math.sqrt(h);
      fc.push({ t: n + h, fit: v, lower: v - 1.96 * se, upper: v + 1.96 * se });
    }
    return {
      method: 'Holt-Winters ' + (mult ? 'moltiplicativo' : 'additivo'),
      alpha: alpha, beta: beta, gamma: gamma, period: period,
      level: level, trend: trend, seasonal: seasons,
      fitted: fitted, actual: y, accuracy: acc, forecast: fc
    };
  }

  function optimizeAlpha(y, objective) {
    var best = null;
    for (var a = 0.05; a <= 0.95; a += 0.01) {
      var v = objective(a);
      if (!best || v < best.v) best = { a: a, v: v };
    }
    return num.round(best.a, 3);
  }

  /** Decomposizione classica (additiva o moltiplicativa). */
  function decompose(values, period, multiplicative) {
    var y = st.clean(values), n = y.length;
    var ma = movingAverage(y, period, true).ma;
    // centratura per periodi pari
    if (period % 2 === 0) {
      var ma2 = [];
      for (var i = 0; i < n; i++) {
        if (ma[i] == null || ma[i + 1] == null) ma2.push(null);
        else ma2.push((ma[i] + ma[i + 1]) / 2);
      }
      ma = ma2;
    }
    var detr = y.map(function (v, i) {
      if (ma[i] == null) return null;
      return multiplicative ? v / ma[i] : v - ma[i];
    });
    // indici stagionali medi
    var seasonal = [];
    for (var s = 0; s < period; s++) {
      var vals = [];
      for (var j = s; j < n; j += period) if (detr[j] != null) vals.push(detr[j]);
      seasonal.push(vals.length ? st.mean(vals) : (multiplicative ? 1 : 0));
    }
    // normalizza
    if (multiplicative) {
      var mn = st.mean(seasonal);
      seasonal = seasonal.map(function (v) { return v / mn; });
    } else {
      var mn2 = st.mean(seasonal);
      seasonal = seasonal.map(function (v) { return v - mn2; });
    }
    var seasAdj = y.map(function (v, i) {
      var sf = seasonal[i % period];
      return multiplicative ? v / sf : v - sf;
    });
    // trend su dati destagionalizzati
    var t = [];
    for (var k = 1; k <= n; k++) t.push(k);
    var trendFit = reg.polyFit(t, seasAdj, 1);
    var trend = trendFit.fitted;
    var fitted = y.map(function (_, i) {
      var sf = seasonal[i % period];
      return multiplicative ? trend[i] * sf : trend[i] + sf;
    });
    var resid = y.map(function (v, i) {
      return multiplicative ? v / fitted[i] : v - fitted[i];
    });
    return {
      type: multiplicative ? 'moltiplicativa' : 'additiva', period: period,
      actual: y, movingAverage: ma, detrended: detr, seasonal: seasonal,
      seasonallyAdjusted: seasAdj, trend: trend, fitted: fitted, residuals: resid,
      accuracy: accuracy(y, fitted), trendEquation: trendFit
    };
  }

  /** Differenze di ordine d (e stagionali). */
  function difference(values, d, period) {
    var y = st.clean(values).slice();
    for (var k = 0; k < (d || 1); k++) {
      var out = [];
      for (var i = 1; i < y.length; i++) out.push(y[i] - y[i - 1]);
      y = out;
    }
    if (period) {
      var out2 = [];
      for (var j = period; j < y.length; j++) out2.push(y[j] - y[j - period]);
      y = out2;
    }
    return y;
  }

  /** PACF tramite Durbin-Levinson. */
  function pacf(values, maxLag) {
    var r = st.acf(values, maxLag).map(function (o) { return o.r; });
    var n = st.clean(values).length;
    var p = [], phi = [], prev = [];
    for (var k = 1; k <= r.length; k++) {
      var numr = r[k - 1], den = 1;
      for (var j = 1; j < k; j++) {
        numr -= prev[j - 1] * r[k - j - 1];
        den -= prev[j - 1] * r[j - 1];
      }
      var pk = den !== 0 ? numr / den : 0;
      var cur = [];
      for (var i = 1; i < k; i++) cur.push(prev[i - 1] - pk * prev[k - i - 1]);
      cur.push(pk);
      prev = cur;
      p.push({ lag: k, pacf: pk, se: Math.sqrt(1 / n), lower: -1.96 / Math.sqrt(n), upper: 1.96 / Math.sqrt(n) });
    }
    return p;
  }

  /** Confronto automatico di piu metodi di previsione. */
  function autoForecast(values, opts) {
    opts = opts || {};
    var horizon = opts.horizon || 6;
    var period = opts.period || null;
    var cands = [];
    cands.push({ name: 'Trend lineare', res: trendAnalysis(values, { model: 'linear', horizon: horizon }) });
    cands.push({ name: 'Trend quadratico', res: trendAnalysis(values, { model: 'quadratic', horizon: horizon }) });
    cands.push({ name: 'Esponenziale singolo', res: ses(values, null, horizon) });
    cands.push({ name: 'Holt', res: holt(values, null, null, horizon) });
    if (period) {
      var hw = holtWinters(values, period, { horizon: horizon, alpha: 0.2, beta: 0.1, gamma: 0.3 });
      if (hw) cands.push({ name: 'Holt-Winters additivo', res: hw });
      var hwm = holtWinters(values, period, { horizon: horizon, multiplicative: true, alpha: 0.2, beta: 0.1, gamma: 0.3 });
      if (hwm) cands.push({ name: 'Holt-Winters moltiplicativo', res: hwm });
    }
    cands.forEach(function (c) { c.mape = c.res.accuracy.mape; c.msd = c.res.accuracy.msd; });
    cands.sort(function (a, b) { return a.msd - b.msd; });
    return { best: cands[0], all: cands };
  }

  return {
    accuracy: accuracy, trendAnalysis: trendAnalysis, movingAverage: movingAverage,
    ses: ses, holt: holt, holtWinters: holtWinters, decompose: decompose,
    difference: difference, pacf: pacf, autoForecast: autoForecast
  };
});
