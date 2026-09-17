/* CLAUDIO v3 - core/regression.js
 * Motore di modelli lineari: matrice di disegno (fattori + covariate + interazioni),
 * OLS con QR, diagnostica, SS di tipo I/III, selezione passo-passo, regressione logistica,
 * regressione polinomiale e binning delle previsioni.
 */
;(function (root, name, deps, factory) {
  var res = deps.map(function (d) {
    return (typeof module === 'object' && module.exports && typeof require === 'function')
      ? require('./' + d + '.js') : root.C3[d];
  });
  var api = factory.apply(null, res);
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.C3 = root.C3 || {})[name] = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, 'regression', ['numeric', 'dist', 'stats', 'matrix'],
function (num, dist, st, mat) {
  'use strict';

  /* =================== MATRICE DI DISEGNO =================== */
  /**
   * Costruisce la matrice di disegno.
   * terms: array di termini; ogni termine e { vars: ['A','B'], type: 'cont'|'cat'|'mixed' }
   *   oppure una stringa 'A', 'A*B', 'A^2'.
   * data: { colonna: [valori] }
   * factors: mappa { nome: [livelli] } per le variabili categoriche (codifica a somma nulla).
   */
  function parseTerms(spec) {
    // spec: 'A + B + A*B' oppure array
    if (Array.isArray(spec)) return spec.map(normTerm);
    return String(spec).split('+').map(function (s) { return normTerm(s.trim()); }).filter(function (t) { return t.vars.length; });
  }

  function normTerm(t) {
    if (typeof t === 'object' && t.vars) return t;
    var s = String(t).trim();
    if (!s) return { vars: [], label: '' };
    var pow = s.match(/^(.+?)\^(\d+)$/);
    if (pow) {
      var v = pow[1].trim(), k = parseInt(pow[2], 10), vars = [];
      for (var i = 0; i < k; i++) vars.push(v);
      return { vars: vars, label: v + '^' + k, power: k };
    }
    var parts = s.split(/[*:]/).map(function (p) { return p.trim(); }).filter(Boolean);
    return { vars: parts, label: parts.join('*') };
  }

  /** Livelli ordinati di una colonna categorica. */
  function levelsOf(col) {
    var seen = {}, out = [];
    for (var i = 0; i < col.length; i++) {
      var k = String(col[i]);
      if (!seen[k]) { seen[k] = 1; out.push(k); }
    }
    out.sort(function (a, b) {
      var na = parseFloat(a), nb = parseFloat(b);
      if (isFinite(na) && isFinite(nb)) return na - nb;
      return a < b ? -1 : (a > b ? 1 : 0);
    });
    return out;
  }

  /**
   * build: { X, names, termIndex: [{term, label, cols:[i..], df}], rowsUsed }
   * opts.center: centra le covariate (utile per DoE / superficie di risposta)
   */
  function designMatrix(data, termSpec, opts) {
    opts = opts || {};
    var terms = parseTerms(termSpec);
    var catSet = opts.categorical || {};
    var n = null;
    Object.keys(data).forEach(function (k) { if (n === null) n = data[k].length; });
    // livelli per fattori
    var levels = {};
    terms.forEach(function (t) {
      t.vars.forEach(function (v) {
        if (catSet[v] && !levels[v]) levels[v] = catSet[v] === true ? levelsOf(data[v]) : catSet[v];
      });
    });
    // colonne base per ogni variabile
    function baseCols(v) {
      if (levels[v]) {
        var L = levels[v], cols = [];
        for (var j = 0; j < L.length - 1; j++) {
          cols.push({
            name: v + '[' + L[j] + ']',
            values: data[v].map(function (x) {
              var s = String(x);
              return s === L[j] ? 1 : (s === L[L.length - 1] ? -1 : 0);
            })
          });
        }
        return cols;
      }
      var vals = data[v].map(function (x) { return typeof x === 'number' ? x : parseFloat(String(x).replace(',', '.')); });
      if (opts.center) {
        var m = st.mean(st.clean(vals));
        vals = vals.map(function (x) { return x - m; });
      }
      return [{ name: v, values: vals }];
    }

    var cache = {};
    function getBase(v) {
      if (!cache[v]) cache[v] = baseCols(v);
      return cache[v];
    }

    var cols = [{ name: 'Costante', values: new Array(n).fill(1) }];
    var termIndex = [];
    terms.forEach(function (t) {
      var sets = t.vars.map(getBase);
      // prodotto cartesiano delle colonne (interazione / potenza)
      var combos = [{ name: '', values: new Array(n).fill(1) }];
      sets.forEach(function (setCols, si) {
        var next = [];
        combos.forEach(function (c) {
          setCols.forEach(function (sc) {
            next.push({
              name: c.name ? c.name + '*' + sc.name : sc.name,
              values: c.values.map(function (v, i) { return v * sc.values[i]; })
            });
          });
        });
        combos = next;
      });
      // per le potenze di covariate il prodotto genera duplicati: rinomina
      if (t.power && !levels[t.vars[0]]) {
        combos = [{ name: t.label, values: combos[0].values }];
      }
      var start = cols.length;
      combos.forEach(function (c) { cols.push(c); });
      termIndex.push({
        term: t, label: t.label,
        cols: combos.map(function (_, i) { return start + i; }),
        df: combos.length
      });
    });

    // righe complete
    var rowsUsed = [];
    for (var i = 0; i < n; i++) {
      var ok = true;
      for (var j = 0; j < cols.length; j++) {
        if (!isFinite(cols[j].values[i])) { ok = false; break; }
      }
      if (ok) rowsUsed.push(i);
    }
    var X = rowsUsed.map(function (i) {
      return cols.map(function (c) { return c.values[i]; });
    });
    return {
      X: X, names: cols.map(function (c) { return c.name; }),
      termIndex: termIndex, rowsUsed: rowsUsed, levels: levels, terms: terms
    };
  }

  /* =================== OLS =================== */
  /**
   * Minimi quadrati ordinari. Ritorna coefficienti, errori standard, t, p,
   * ANOVA del modello, R2, diagnostica dei residui.
   */
  function ols(X, y, opts) {
    opts = opts || {};
    var n = X.length, p = X[0].length;
    var qr = mat.qrSolve(X, y);
    var beta = qr.beta;
    var fitted = mat.mulVec(X, beta);
    var resid = y.map(function (v, i) { return v - fitted[i]; });
    var dfe = n - qr.rank;
    var sse = 0, i, j;
    for (i = 0; i < n; i++) sse += resid[i] * resid[i];
    var mse = dfe > 0 ? sse / dfe : NaN;
    var saturated = dfe <= 0;
    var s = Math.sqrt(mse);
    // (X'X)^-1 via R
    var XtXinv = null;
    var Rinv = mat.inverse(qr.R);
    if (Rinv) XtXinv = mat.mul(Rinv, mat.transpose(Rinv));
    else XtXinv = mat.pinv(X) && null;
    if (!XtXinv) {
      var XtX = mat.crossprod(X);
      XtXinv = mat.inverse(XtX) || mat.pinv(XtX);
    }
    var seB = [], tB = [], pB = [];
    for (j = 0; j < p; j++) {
      var v = mse * XtXinv[j][j];
      var sej = v > 0 ? Math.sqrt(v) : NaN;
      seB.push(sej);
      tB.push(beta[j] / sej);
      pB.push(2 * (1 - dist.t.cdf(Math.abs(beta[j] / sej), dfe)));
    }
    var ybar = st.mean(y), sst = 0;
    for (i = 0; i < n; i++) sst += (y[i] - ybar) * (y[i] - ybar);
    var hasIntercept = X[0].every ? X.every(function (r) { return r[0] === 1; }) : true;
    if (!hasIntercept) { sst = 0; for (i = 0; i < n; i++) sst += y[i] * y[i]; }
    var ssr = sst - sse;
    var dfm = qr.rank - (hasIntercept ? 1 : 0);
    var r2 = sst > 0 ? ssr / sst : NaN;
    var r2adj = 1 - (1 - r2) * (n - (hasIntercept ? 1 : 0)) / dfe;
    var F = dfm > 0 ? (ssr / dfm) / mse : NaN;
    // leverage e residui studentizzati
    var hat = [], sresid = [], tresid = [], cook = [];
    for (i = 0; i < n; i++) {
      var h = 0;
      for (j = 0; j < p; j++) {
        for (var k = 0; k < p; k++) h += X[i][j] * XtXinv[j][k] * X[i][k];
      }
      hat.push(h);
      var sr = resid[i] / (s * Math.sqrt(Math.max(1e-12, 1 - h)));
      sresid.push(sr);
      var dfe1 = dfe - 1;
      var s2i = dfe1 > 0 ? (sse - resid[i] * resid[i] / (1 - h)) / dfe1 : NaN;
      tresid.push(resid[i] / Math.sqrt(Math.max(1e-300, s2i * (1 - h))));
      cook.push(sr * sr * h / (p * Math.max(1e-12, 1 - h)));
    }
    // Durbin-Watson
    var dwNum = 0;
    for (i = 1; i < n; i++) dwNum += Math.pow(resid[i] - resid[i - 1], 2);
    var dw = dwNum / sse;
    var press = 0;
    for (i = 0; i < n; i++) press += Math.pow(resid[i] / (1 - hat[i]), 2);
    return {
      n: n, p: p, beta: beta, se: seB, t: tB, pValues: pB,
      fitted: fitted, resid: resid, sresid: sresid, tresid: tresid,
      hat: hat, cook: cook, dw: dw, press: press,
      r2press: sst > 0 ? 1 - press / sst : NaN,
      sse: sse, sst: sst, ssr: ssr, mse: mse, s: s,
      dfe: dfe, dfm: dfm, r2: r2, r2adj: r2adj, F: F,
      pModel: dfm > 0 ? 1 - dist.F.cdf(F, dfm, dfe) : NaN,
      XtXinv: XtXinv, rank: qr.rank, saturated: saturated, X: X, y: y,
      aic: n * Math.log(sse / n) + 2 * p,
      bic: n * Math.log(sse / n) + p * Math.log(n),
      aicc: n * Math.log(sse / n) + 2 * p + 2 * p * (p + 1) / Math.max(1, n - p - 1)
    };
  }

  /** Previsione con IC e intervallo di predizione. */
  function predict(fit, xrow, conf) {
    conf = conf || 0.95;
    var p = xrow.length, yhat = 0, i, j;
    for (i = 0; i < p; i++) yhat += fit.beta[i] * xrow[i];
    var q = 0;
    for (i = 0; i < p; i++) for (j = 0; j < p; j++) q += xrow[i] * fit.XtXinv[i][j] * xrow[j];
    var seFit = Math.sqrt(Math.max(0, fit.mse * q));
    var sePred = Math.sqrt(Math.max(0, fit.mse * (1 + q)));
    var tc = dist.t.inv(1 - (1 - conf) / 2, fit.dfe);
    return {
      fit: yhat, seFit: seFit,
      ci: [yhat - tc * seFit, yhat + tc * seFit],
      pi: [yhat - tc * sePred, yhat + tc * sePred], conf: conf
    };
  }

  /** VIF per ciascun predittore (esclusa la costante). */
  function vif(X) {
    var p = X[0].length, out = [];
    for (var j = 1; j < p; j++) {
      var yj = X.map(function (r) { return r[j]; });
      var Xj = X.map(function (r) {
        return r.filter(function (_, k) { return k !== j; });
      });
      var f = ols(Xj, yj);
      out.push(f.r2 < 1 ? 1 / (1 - f.r2) : Infinity);
    }
    return out;
  }

  /* =================== GLM / ANOVA di modello =================== */
  /**
   * Modello lineare generale con fattori e covariate.
   * spec: { data, y: 'nome'|array, terms: 'A + B + A*B', categorical: {A:true} }
   * Ritorna fit OLS + tabella ANOVA (SS tipo I sequenziale e tipo III adattata).
   */
  function glm(spec) {
    var data = spec.data;
    var yCol = typeof spec.y === 'string' ? data[spec.y] : spec.y;
    var dm = designMatrix(data, spec.terms, {
      categorical: spec.categorical || {}, center: spec.center
    });
    var y = dm.rowsUsed.map(function (i) {
      var v = yCol[i];
      return typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    });
    // scarta righe con y non valida
    var keep = [];
    for (var i = 0; i < y.length; i++) if (isFinite(y[i])) keep.push(i);
    var X = keep.map(function (i) { return dm.X[i]; });
    y = keep.map(function (i) { return y[i]; });
    var fit = ols(X, y);
    fit.names = dm.names;
    fit.termIndex = dm.termIndex;
    fit.levels = dm.levels;
    fit.rowsUsed = keep.map(function (i) { return dm.rowsUsed[i]; });
    fit.yName = typeof spec.y === 'string' ? spec.y : 'Y';

    // SS sequenziale (tipo I)
    var seq = [];
    var cum = [0];
    var prevSSE = null;
    var base = X.map(function (r) { return [r[0]]; });
    var f0 = ols(base, y);
    prevSSE = f0.sse;
    dm.termIndex.forEach(function (ti) {
      cum = cum.concat(ti.cols);
      var Xc = X.map(function (r) { return cum.map(function (c) { return r[c]; }); });
      var fc = ols(Xc, y);
      seq.push({
        label: ti.label, df: ti.df, ss: prevSSE - fc.sse,
        ms: (prevSSE - fc.sse) / ti.df
      });
      prevSSE = fc.sse;
    });
    seq.forEach(function (r) {
      r.F = r.ms / fit.mse;
      r.p = 1 - dist.F.cdf(r.F, r.df, fit.dfe);
    });

    // SS adattata (tipo III): differenza con il modello privo del termine
    var adj = dm.termIndex.map(function (ti) {
      var drop = {};
      ti.cols.forEach(function (c) { drop[c] = 1; });
      var Xr = X.map(function (r) {
        return r.filter(function (_, idx) { return !drop[idx]; });
      });
      var fr = ols(Xr, y);
      var ss = fr.sse - fit.sse;
      return {
        label: ti.label, df: ti.df, ss: ss, ms: ss / ti.df,
        F: (ss / ti.df) / fit.mse,
        p: 1 - dist.F.cdf((ss / ti.df) / fit.mse, ti.df, fit.dfe)
      };
    });

    fit.anovaSeq = seq;
    fit.anovaAdj = adj;
    fit.coefTable = dm.names.map(function (nm, j) {
      return {
        name: nm, coef: fit.beta[j], se: fit.se[j], t: fit.t[j], p: fit.pValues[j],
        ci: [fit.beta[j] - dist.t.inv(0.975, fit.dfe) * fit.se[j],
          fit.beta[j] + dist.t.inv(0.975, fit.dfe) * fit.se[j]]
      };
    });
    // effetti (2 x coefficiente) utili nel DoE
    fit.designMatrixInfo = dm;
    return fit;
  }

  /** Medie marginali stimate (least squares means) per un fattore. */
  function lsmeans(fit, factorName, spec) {
    var dm = fit.designMatrixInfo;
    var L = dm.levels[factorName];
    if (!L) return null;
    var data = spec.data;
    var out = [];
    L.forEach(function (lev) {
      // riga media: covariate al valore medio, altri fattori a media dei livelli (codifica 0)
      var row = new Array(dm.names.length).fill(0);
      row[0] = 1;
      dm.termIndex.forEach(function (ti) {
        if (ti.term.vars.length === 1 && ti.term.vars[0] === factorName) {
          var idx = L.indexOf(lev);
          ti.cols.forEach(function (c, k) {
            row[c] = idx === k ? 1 : (idx === L.length - 1 ? -1 : 0);
          });
        } else if (ti.term.vars.indexOf(factorName) < 0 && !dm.levels[ti.term.vars[0]]) {
          // covariata: usa la media
          var vals = data[ti.term.vars[0]].map(parseFloat).filter(isFinite);
          if (ti.term.vars.length === 1) row[ti.cols[0]] = st.mean(vals);
        }
      });
      var pr = predict(fit, row);
      out.push({ level: lev, mean: pr.fit, se: pr.seFit, ci: pr.ci });
    });
    return out;
  }

  /* =================== REGRESSIONE SEMPLICE / POLINOMIALE =================== */
  /** Regressione y ~ poly(x, grado). */
  function polyFit(xin, yin, degree) {
    var pairs = [];
    for (var i = 0; i < Math.min(xin.length, yin.length); i++) {
      var a = parseFloat(xin[i]), b = parseFloat(yin[i]);
      if (isFinite(a) && isFinite(b)) pairs.push([a, b]);
    }
    var x = pairs.map(function (p) { return p[0]; });
    var y = pairs.map(function (p) { return p[1]; });
    var X = x.map(function (v) {
      var row = [1];
      for (var d = 1; d <= degree; d++) row.push(Math.pow(v, d));
      return row;
    });
    var fit = ols(X, y);
    fit.x = x; fit.yObs = y; fit.degree = degree;
    fit.names = ['Costante'].concat(Array.from({ length: degree }, function (_, d) {
      return d === 0 ? 'X' : 'X^' + (d + 1);
    }));
    fit.coefTable = fit.names.map(function (nm, j) {
      return { name: nm, coef: fit.beta[j], se: fit.se[j], t: fit.t[j], p: fit.pValues[j] };
    });
    fit.predictAt = function (v) {
      var row = [1];
      for (var d = 1; d <= degree; d++) row.push(Math.pow(v, d));
      return predict(fit, row);
    };
    // mancanza di adattamento se ci sono replicati
    fit.lackOfFit = lackOfFit(x, y, fit);
    return fit;
  }

  /** Test di lack-of-fit con errore puro (richiede replicati). */
  function lackOfFit(x, y, fit) {
    var groups = {};
    for (var i = 0; i < x.length; i++) {
      var k = String(num.round(x[i], 8));
      (groups[k] = groups[k] || []).push(y[i]);
    }
    var keys = Object.keys(groups);
    var pureSS = 0, pureDF = 0;
    keys.forEach(function (k) {
      var g = groups[k];
      if (g.length > 1) {
        var m = st.mean(g);
        g.forEach(function (v) { pureSS += (v - m) * (v - m); });
        pureDF += g.length - 1;
      }
    });
    if (pureDF === 0) return null;
    var lofSS = fit.sse - pureSS;
    var lofDF = fit.dfe - pureDF;
    if (lofDF <= 0) return null;
    var F = (lofSS / lofDF) / (pureSS / pureDF);
    return {
      lofSS: lofSS, lofDF: lofDF, pureSS: pureSS, pureDF: pureDF,
      F: F, p: 1 - dist.F.cdf(F, lofDF, pureDF)
    };
  }

  /** Regressione lineare multipla da nomi di colonna. */
  function linearModel(data, yName, xNames, opts) {
    opts = opts || {};
    var spec = {
      data: data, y: yName, terms: xNames.join(' + '),
      categorical: opts.categorical || {}
    };
    var fit = glm(spec);
    fit.vif = xNames.length > 1 ? vif(fit.X) : null;
    fit.xNames = xNames;
    return fit;
  }

  /* =================== SELEZIONE PASSO-PASSO =================== */
  /**
   * Stepwise (forward/backward/both) su criterio p-value.
   */
  function stepwise(data, yName, candidates, opts) {
    opts = opts || {};
    var alphaIn = opts.alphaIn || 0.15, alphaOut = opts.alphaOut || 0.15;
    var direction = opts.direction || 'both';
    var inModel = direction === 'backward' ? candidates.slice() : [];
    var steps = [];
    var guard = 0;
    for (;;) {
      guard++;
      if (guard > 60) break;
      var changed = false;
      // forward
      if (direction !== 'backward') {
        var best = null;
        candidates.forEach(function (c) {
          if (inModel.indexOf(c) >= 0) return;
          var f = linearModel(data, yName, inModel.concat([c]), opts);
          var idx = f.termIndex[f.termIndex.length - 1];
          var pv = f.anovaAdj[f.anovaAdj.length - 1].p;
          if (!best || pv < best.p) best = { name: c, p: pv, fit: f };
        });
        if (best && best.p < alphaIn) {
          inModel.push(best.name);
          steps.push({ action: 'aggiunto', variable: best.name, p: best.p, r2adj: best.fit.r2adj });
          changed = true;
        }
      }
      // backward
      if (direction !== 'forward' && inModel.length > 1) {
        var f2 = linearModel(data, yName, inModel, opts);
        var worst = null;
        f2.anovaAdj.forEach(function (a, i) {
          if (!worst || a.p > worst.p) worst = { name: inModel[i], p: a.p };
        });
        if (worst && worst.p > alphaOut) {
          inModel = inModel.filter(function (v) { return v !== worst.name; });
          steps.push({ action: 'rimosso', variable: worst.name, p: worst.p });
          changed = true;
        }
      }
      if (!changed) break;
    }
    var finalFit = inModel.length ? linearModel(data, yName, inModel, opts) : null;
    return { steps: steps, variables: inModel, fit: finalFit };
  }

  /** Migliori sottoinsiemi (fino a 12 candidati). */
  function bestSubsets(data, yName, candidates, opts) {
    opts = opts || {};
    var k = candidates.length;
    if (k > 12) candidates = candidates.slice(0, 12);
    k = candidates.length;
    var results = [];
    var total = 1 << k;
    for (var m = 1; m < total; m++) {
      var vars = [];
      for (var b = 0; b < k; b++) if (m & (1 << b)) vars.push(candidates[b]);
      var f = linearModel(data, yName, vars, opts);
      results.push({
        vars: vars, size: vars.length, r2: f.r2, r2adj: f.r2adj, s: f.s,
        cp: null, aicc: f.aicc, bic: f.bic, r2press: f.r2press, sse: f.sse, mse: f.mse
      });
    }
    var full = linearModel(data, yName, candidates, opts);
    results.forEach(function (r) {
      r.cp = r.sse / full.mse - (full.n - 2 * (r.size + 1));
    });
    var bySize = {};
    results.forEach(function (r) {
      if (!bySize[r.size] || r.r2 > bySize[r.size].r2) bySize[r.size] = r;
    });
    return {
      all: results.sort(function (a, b) { return b.r2adj - a.r2adj; }).slice(0, 60),
      bestBySize: Object.keys(bySize).map(function (s) { return bySize[s]; })
        .sort(function (a, b) { return a.size - b.size; })
    };
  }

  /* =================== REGRESSIONE LOGISTICA =================== */
  /**
   * Logistica binaria via IRLS. y in {0,1} (o eventi/prove con weights).
   */
  function logistic(X, y, opts) {
    opts = opts || {};
    var n = X.length, p = X[0].length;
    var w = opts.trials || new Array(n).fill(1);
    var beta = new Array(p).fill(0);
    var it, i, j, dev = 0, devOld = Infinity, XtWX, XtWz, mu = [], eta = [];
    for (it = 0; it < 60; it++) {
      var z = new Array(n), wt = new Array(n);
      for (i = 0; i < n; i++) {
        var e = 0;
        for (j = 0; j < p; j++) e += X[i][j] * beta[j];
        eta[i] = e;
        var m = 1 / (1 + Math.exp(-e));
        m = num.clamp(m, 1e-10, 1 - 1e-10);
        mu[i] = m;
        var vv = w[i] * m * (1 - m);
        wt[i] = vv;
        z[i] = e + (y[i] - w[i] * m) / vv;
      }
      // pesi
      var Xw = X.map(function (r, ii) { return r.map(function (v) { return v * Math.sqrt(wt[ii]); }); });
      var zw = z.map(function (v, ii) { return v * Math.sqrt(wt[ii]); });
      var qr = mat.qrSolve(Xw, zw);
      var newBeta = qr.beta;
      if (newBeta.some(function (v) { return !isFinite(v); })) break;
      beta = newBeta;
      dev = 0;
      for (i = 0; i < n; i++) {
        var mi = 1 / (1 + Math.exp(-eta[i]));
        mi = num.clamp(mi, 1e-12, 1 - 1e-12);
        var yi = y[i], wi = w[i];
        if (yi > 0) dev += 2 * yi * Math.log(yi / (wi * mi));
        if (wi - yi > 0) dev += 2 * (wi - yi) * Math.log((wi - yi) / (wi * (1 - mi)));
      }
      if (Math.abs(devOld - dev) < 1e-10) break;
      devOld = dev;
    }
    // matrice di informazione
    var W = [];
    for (i = 0; i < n; i++) {
      var e2 = 0;
      for (j = 0; j < p; j++) e2 += X[i][j] * beta[j];
      var m2 = num.clamp(1 / (1 + Math.exp(-e2)), 1e-10, 1 - 1e-10);
      W.push(w[i] * m2 * (1 - m2));
      mu[i] = m2;
    }
    var XtWXm = mat.zeros(p, p);
    for (i = 0; i < n; i++) for (j = 0; j < p; j++) for (var k = 0; k < p; k++) {
      XtWXm[j][k] += X[i][j] * W[i] * X[i][k];
    }
    var cov = mat.inverse(XtWXm) || mat.pinv(XtWXm);
    var se = [], zst = [], pv = [], or = [];
    for (j = 0; j < p; j++) {
      se.push(Math.sqrt(Math.max(0, cov[j][j])));
      zst.push(beta[j] / se[j]);
      pv.push(2 * (1 - dist.normal.cdf(Math.abs(beta[j] / se[j]))));
      or.push(Math.exp(beta[j]));
    }
    // devianza nulla
    var totY = 0, totN = 0;
    for (i = 0; i < n; i++) { totY += y[i]; totN += w[i]; }
    var p0 = totY / totN, devNull = 0;
    for (i = 0; i < n; i++) {
      var yi2 = y[i], wi2 = w[i];
      if (yi2 > 0) devNull += 2 * yi2 * Math.log(yi2 / (wi2 * p0));
      if (wi2 - yi2 > 0) devNull += 2 * (wi2 - yi2) * Math.log((wi2 - yi2) / (wi2 * (1 - p0)));
    }
    // concordanza
    var pairs = 0, conc = 0, disc = 0;
    var ones = [], zeros = [];
    for (i = 0; i < n; i++) {
      if (w[i] === 1) { (y[i] === 1 ? ones : zeros).push(mu[i]); }
    }
    for (i = 0; i < ones.length; i++) {
      for (j = 0; j < zeros.length; j++) {
        pairs++;
        if (ones[i] > zeros[j]) conc++; else if (ones[i] < zeros[j]) disc++;
      }
    }
    return {
      beta: beta, se: se, z: zst, pValues: pv, oddsRatio: or, cov: cov,
      deviance: dev, dfe: n - p, devNull: devNull, dfNull: n - 1,
      G: devNull - dev, dfG: p - 1,
      pG: 1 - dist.chisq.cdf(devNull - dev, p - 1),
      r2McFadden: 1 - dev / devNull,
      aic: dev + 2 * p, bic: dev + p * Math.log(n),
      fitted: mu, n: n, p: p,
      concordant: pairs ? 100 * conc / pairs : NaN,
      discordant: pairs ? 100 * disc / pairs : NaN,
      somersD: pairs ? (conc - disc) / pairs : NaN,
      predictProb: function (xrow) {
        var e = 0;
        for (var jj = 0; jj < p; jj++) e += xrow[jj] * beta[jj];
        return 1 / (1 + Math.exp(-e));
      }
    };
  }

  /** Logistica da nomi di colonna. */
  function logisticModel(data, yName, xNames, opts) {
    opts = opts || {};
    var dm = designMatrix(data, xNames.join(' + '), { categorical: opts.categorical || {} });
    var yraw = data[yName];
    var successLabel = opts.success;
    var y = [], X = [];
    dm.rowsUsed.forEach(function (i, k) {
      var v = yraw[i];
      var num01;
      if (successLabel != null) num01 = String(v) === String(successLabel) ? 1 : 0;
      else {
        var pv = typeof v === 'number' ? v : parseFloat(v);
        num01 = isFinite(pv) ? (pv > 0 ? 1 : 0) : (String(v).toLowerCase() === 'si' || String(v).toLowerCase() === 'yes' ? 1 : 0);
      }
      y.push(num01);
      X.push(dm.X[k]);
    });
    var fit = logistic(X, y, opts);
    fit.names = dm.names;
    fit.coefTable = dm.names.map(function (nm, j) {
      return {
        name: nm, coef: fit.beta[j], se: fit.se[j], z: fit.z[j],
        p: fit.pValues[j], oddsRatio: fit.oddsRatio[j],
        ci: [Math.exp(fit.beta[j] - 1.96 * fit.se[j]), Math.exp(fit.beta[j] + 1.96 * fit.se[j])]
      };
    });
    fit.yName = yName;
    fit.xNames = xNames;
    return fit;
  }

  return {
    parseTerms: parseTerms, levelsOf: levelsOf, designMatrix: designMatrix,
    ols: ols, predict: predict, vif: vif, glm: glm, lsmeans: lsmeans,
    polyFit: polyFit, lackOfFit: lackOfFit, linearModel: linearModel,
    stepwise: stepwise, bestSubsets: bestSubsets,
    logistic: logistic, logisticModel: logisticModel
  };
});
