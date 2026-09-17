/* CLAUDIO v3 - core/multivariate.js
 * Analisi multivariata: matrice di correlazione, PCA, cluster (k-means e gerarchico),
 * distanza di Mahalanobis, carta T2 di Hotelling e carta della varianza generalizzata,
 * analisi discriminante lineare.
 */
;(function (root, name, deps, factory) {
  var res = deps.map(function (d) {
    return (typeof module === 'object' && module.exports && typeof require === 'function')
      ? require('./' + d + '.js') : root.C3[d];
  });
  var api = factory.apply(null, res);
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.C3 = root.C3 || {})[name] = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, 'multivariate',
['numeric', 'dist', 'stats', 'matrix'], function (num, dist, st, mat) {
  'use strict';

  /** Estrae la matrice dei dati completi (righe senza mancanti). */
  function dataMatrix(data, cols) {
    var n = data[cols[0]].length, X = [], rows = [];
    for (var i = 0; i < n; i++) {
      var row = [], ok = true;
      for (var j = 0; j < cols.length; j++) {
        var v = data[cols[j]][i];
        var x = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
        if (!isFinite(x)) { ok = false; break; }
        row.push(x);
      }
      if (ok) { X.push(row); rows.push(i); }
    }
    return { X: X, rows: rows, cols: cols };
  }

  /** Matrice di correlazione con p-value e n. */
  function correlationMatrix(data, cols, method) {
    var k = cols.length;
    var R = mat.zeros(k, k), P = mat.zeros(k, k), N = mat.zeros(k, k);
    for (var i = 0; i < k; i++) {
      for (var j = 0; j < k; j++) {
        if (i === j) { R[i][j] = 1; P[i][j] = 0; N[i][j] = st.clean(data[cols[i]]).length; continue; }
        var xs = [], ys = [];
        for (var r = 0; r < data[cols[i]].length; r++) {
          var a = parseFloat(data[cols[i]][r]), b = parseFloat(data[cols[j]][r]);
          if (isFinite(a) && isFinite(b)) { xs.push(a); ys.push(b); }
        }
        var rr = method === 'spearman' ? st.spearman(xs, ys)
          : (method === 'kendall' ? st.kendall(xs, ys) : st.pearson(xs, ys));
        R[i][j] = rr;
        P[i][j] = st.corrP(rr, xs.length);
        N[i][j] = xs.length;
      }
    }
    return { cols: cols, r: R, p: P, n: N, method: method || 'pearson' };
  }

  /**
   * PCA. opts.correlation (default true) = analizza la matrice di correlazione.
   */
  function pca(data, cols, opts) {
    opts = opts || {};
    var dm = dataMatrix(data, cols);
    var X = dm.X, n = X.length, k = cols.length;
    var means = [], sds = [];
    for (var j = 0; j < k; j++) {
      var col = X.map(function (r) { return r[j]; });
      means.push(st.mean(col));
      sds.push(st.sd(col));
    }
    var useCorr = opts.correlation !== false;
    var Z = X.map(function (r) {
      return r.map(function (v, j) {
        return useCorr ? (v - means[j]) / sds[j] : (v - means[j]);
      });
    });
    var S = mat.crossprod(Z).map(function (row) {
      return row.map(function (v) { return v / (n - 1); });
    });
    var e = mat.eigenSym(S);
    var total = e.values.reduce(function (a, b) { return a + b; }, 0);
    var comps = e.values.map(function (v, idx) {
      return {
        index: idx + 1, eigenvalue: v,
        proportion: v / total,
        cumulative: e.values.slice(0, idx + 1).reduce(function (a, b) { return a + b; }, 0) / total,
        loadings: cols.map(function (_, j) { return e.vectors[j][idx]; }),
        // coefficienti di correlazione variabile-componente
        correlations: cols.map(function (_, j) {
          return e.vectors[j][idx] * Math.sqrt(Math.max(0, v)) / (useCorr ? 1 : sds[j]);
        })
      };
    });
    var scores = Z.map(function (r) {
      return comps.map(function (c) {
        var s = 0;
        for (var j = 0; j < k; j++) s += r[j] * c.loadings[j];
        return s;
      });
    });
    return {
      cols: cols, n: n, useCorrelation: useCorr, means: means, sds: sds,
      covariance: S, components: comps, scores: scores, rowsUsed: dm.rows,
      totalVariance: total,
      kaiser: comps.filter(function (c) { return c.eigenvalue > 1; }).length,
      X: X
    };
  }

  /** k-means con inizializzazione k-means++ e seme fisso. */
  function kmeans(data, cols, k, opts) {
    opts = opts || {};
    var dm = dataMatrix(data, cols);
    var X = dm.X, n = X.length, p = cols.length;
    var standardize = opts.standardize !== false;
    var means = [], sds = [];
    for (var j = 0; j < p; j++) {
      var col = X.map(function (r) { return r[j]; });
      means.push(st.mean(col)); sds.push(st.sd(col) || 1);
    }
    var Z = standardize ? X.map(function (r) {
      return r.map(function (v, j) { return (v - means[j]) / sds[j]; });
    }) : X.map(function (r) { return r.slice(); });
    var rng = num.rng(opts.seed == null ? 17 : opts.seed);
    function dist2(a, b) {
      var s = 0;
      for (var i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i]);
      return s;
    }
    // k-means++
    var centers = [Z[rng.int(0, n - 1)].slice()];
    while (centers.length < k) {
      var d2 = Z.map(function (z) {
        return Math.min.apply(null, centers.map(function (c) { return dist2(z, c); }));
      });
      var tot = d2.reduce(function (a, b) { return a + b; }, 0);
      var t = rng.uniform() * tot, acc = 0, pick = 0;
      for (var i2 = 0; i2 < n; i2++) { acc += d2[i2]; if (acc >= t) { pick = i2; break; } }
      centers.push(Z[pick].slice());
    }
    var labels = new Array(n).fill(0), changed = true, iter = 0;
    while (changed && iter < 300) {
      changed = false; iter++;
      for (var i = 0; i < n; i++) {
        var best = 0, bd = Infinity;
        for (var c = 0; c < k; c++) {
          var d = dist2(Z[i], centers[c]);
          if (d < bd) { bd = d; best = c; }
        }
        if (labels[i] !== best) { labels[i] = best; changed = true; }
      }
      for (var cc = 0; cc < k; cc++) {
        var members = [];
        for (var m = 0; m < n; m++) if (labels[m] === cc) members.push(Z[m]);
        if (!members.length) continue;
        for (var jj = 0; jj < p; jj++) {
          centers[cc][jj] = st.mean(members.map(function (r) { return r[jj]; }));
        }
      }
    }
    // metriche
    var withinSS = new Array(k).fill(0), counts = new Array(k).fill(0);
    for (var q = 0; q < n; q++) {
      withinSS[labels[q]] += dist2(Z[q], centers[labels[q]]);
      counts[labels[q]]++;
    }
    var grand = [];
    for (var g = 0; g < p; g++) grand.push(st.mean(Z.map(function (r) { return r[g]; })));
    var totalSS = Z.reduce(function (a, z) { return a + dist2(z, grand); }, 0);
    var totWithin = withinSS.reduce(function (a, b) { return a + b; }, 0);
    return {
      k: k, labels: labels, centers: centers, iterations: iter,
      centersReal: centers.map(function (c) {
        return c.map(function (v, j) { return standardize ? v * sds[j] + means[j] : v; });
      }),
      counts: counts, withinSS: withinSS, totalWithinSS: totWithin,
      totalSS: totalSS, betweenSS: totalSS - totWithin,
      r2: 1 - totWithin / totalSS,
      cols: cols, rowsUsed: dm.rows, standardized: standardize,
      silhouette: silhouette(Z, labels, k)
    };
  }

  /** Silhouette media. */
  function silhouette(Z, labels, k) {
    var n = Z.length;
    if (n > 2000) return null;
    function d(a, b) {
      var s = 0;
      for (var i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i]);
      return Math.sqrt(s);
    }
    var sils = [];
    for (var i2 = 0; i2 < n; i2++) {
      var same = [], other = {};
      for (var j = 0; j < n; j++) {
        if (j === i2) continue;
        var dd = d(Z[i2], Z[j]);
        if (labels[j] === labels[i2]) same.push(dd);
        else { (other[labels[j]] = other[labels[j]] || []).push(dd); }
      }
      var a = same.length ? st.mean(same) : 0;
      var bs = Object.keys(other).map(function (key) { return st.mean(other[key]); });
      var b = bs.length ? Math.min.apply(null, bs) : 0;
      sils.push((b - a) / Math.max(a, b));
    }
    return { mean: st.mean(sils), values: sils };
  }

  /** Cluster gerarchico agglomerativo. */
  function hierarchical(data, cols, opts) {
    opts = opts || {};
    var dm = dataMatrix(data, cols);
    var X = dm.X, n = X.length, p = cols.length;
    var link = opts.linkage || 'ward';
    var standardize = opts.standardize !== false;
    var means = [], sds = [];
    for (var j = 0; j < p; j++) {
      var col = X.map(function (r) { return r[j]; });
      means.push(st.mean(col)); sds.push(st.sd(col) || 1);
    }
    var Z = standardize ? X.map(function (r) {
      return r.map(function (v, jj) { return (v - means[jj]) / sds[jj]; });
    }) : X;
    function euclid(a, b) {
      var s = 0;
      for (var i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i]);
      return Math.sqrt(s);
    }
    var clusters = Z.map(function (z, i) { return { id: i, members: [i], centroid: z.slice(), size: 1 }; });
    var merges = [];
    var nextId = n;
    while (clusters.length > 1) {
      var bi = 0, bj = 1, bd = Infinity;
      for (var a = 0; a < clusters.length; a++) {
        for (var b = a + 1; b < clusters.length; b++) {
          var d;
          if (link === 'ward') {
            var nn = clusters[a].size * clusters[b].size / (clusters[a].size + clusters[b].size);
            d = nn * Math.pow(euclid(clusters[a].centroid, clusters[b].centroid), 2);
          } else if (link === 'single') {
            d = Infinity;
            clusters[a].members.forEach(function (m1) {
              clusters[b].members.forEach(function (m2) { d = Math.min(d, euclid(Z[m1], Z[m2])); });
            });
          } else if (link === 'complete') {
            d = 0;
            clusters[a].members.forEach(function (m1) {
              clusters[b].members.forEach(function (m2) { d = Math.max(d, euclid(Z[m1], Z[m2])); });
            });
          } else {
            var s = 0, c = 0;
            clusters[a].members.forEach(function (m1) {
              clusters[b].members.forEach(function (m2) { s += euclid(Z[m1], Z[m2]); c++; });
            });
            d = s / c;
          }
          if (d < bd) { bd = d; bi = a; bj = b; }
        }
      }
      var ca = clusters[bi], cb = clusters[bj];
      var merged = {
        id: nextId++, members: ca.members.concat(cb.members),
        size: ca.size + cb.size,
        centroid: ca.centroid.map(function (v, idx) {
          return (v * ca.size + cb.centroid[idx] * cb.size) / (ca.size + cb.size);
        })
      };
      merges.push({ a: ca.id, b: cb.id, distance: bd, size: merged.size, id: merged.id });
      clusters = clusters.filter(function (_, idx) { return idx !== bi && idx !== bj; });
      clusters.push(merged);
      if (n > 300 && merges.length > 400) break;
    }
    return {
      merges: merges, n: n, linkage: link, cols: cols, rowsUsed: dm.rows,
      cut: function (kk) {
        // taglia il dendrogramma a kk cluster
        var parent = {};
        var active = [];
        for (var i = 0; i < n; i++) active.push([i]);
        var groups = active.map(function (g) { return g.slice(); });
        var idMap = {};
        for (var q = 0; q < n; q++) idMap[q] = [q];
        merges.slice(0, n - kk).forEach(function (m) {
          idMap[m.id] = (idMap[m.a] || []).concat(idMap[m.b] || []);
          delete idMap[m.a]; delete idMap[m.b];
        });
        var labels = new Array(n).fill(-1);
        Object.keys(idMap).forEach(function (key, ci) {
          idMap[key].forEach(function (m) { labels[m] = ci; });
        });
        return labels;
      }
    };
  }

  /** Distanza di Mahalanobis e outlier multivariati. */
  function mahalanobis(data, cols, opts) {
    opts = opts || {};
    var dm = dataMatrix(data, cols);
    var X = dm.X, n = X.length, p = cols.length;
    var means = [];
    for (var j = 0; j < p; j++) means.push(st.mean(X.map(function (r) { return r[j]; })));
    var C = mat.zeros(p, p);
    X.forEach(function (r) {
      for (var a = 0; a < p; a++) for (var b = 0; b < p; b++) {
        C[a][b] += (r[a] - means[a]) * (r[b] - means[b]);
      }
    });
    for (var a2 = 0; a2 < p; a2++) for (var b2 = 0; b2 < p; b2++) C[a2][b2] /= (n - 1);
    var Cinv = mat.inverse(C) || mat.pinv(C);
    var d2 = X.map(function (r) {
      var v = r.map(function (x, j) { return x - means[j]; });
      var s = 0;
      for (var a3 = 0; a3 < p; a3++) for (var b3 = 0; b3 < p; b3++) s += v[a3] * Cinv[a3][b3] * v[b3];
      return s;
    });
    var crit = dist.chisq.inv(opts.conf || 0.95, p);
    return {
      d2: d2, d: d2.map(Math.sqrt), means: means, covariance: C, inverse: Cinv,
      critical: crit, p: p, n: n, rowsUsed: dm.rows,
      outliers: d2.map(function (v, i) { return { row: dm.rows[i], d2: v, outlier: v > crit }; })
        .filter(function (o) { return o.outlier; })
    };
  }

  /**
   * Carta T2 di Hotelling per osservazioni individuali o sottogruppi.
   * spec: { data, cols, subgroupSize (1 = individuali), alpha }
   */
  function hotellingT2(spec) {
    var dm = dataMatrix(spec.data, spec.cols);
    var X = dm.X, p = spec.cols.length;
    var sub = spec.subgroupSize || 1;
    var alpha = spec.alpha || 0.0027;
    var m, points = [], ucl;
    if (sub === 1) {
      var mh = mahalanobis(spec.data, spec.cols);
      m = X.length;
      // UCL fase 2 (beta) e fase 1
      var f = dist.beta.inv(1 - alpha, p / 2, (m - p - 1) / 2);
      ucl = (m - 1) * (m - 1) / m * f;
      points = mh.d2.map(function (v, i) {
        return { index: i, label: String(i + 1), value: v, ucl: ucl, lcl: 0, cl: p, violations: v > ucl ? [1] : [] };
      });
      return {
        type: 'T2 individuali', p: p, m: m, ucl: ucl, primary: points,
        titlePrimary: 'Carta T2 di Hotelling',
        outOfControl: points.filter(function (o) { return o.violations.length; }).length,
        means: mh.means, covariance: mh.covariance
      };
    }
    // sottogruppi
    var groups = [];
    for (var i = 0; i < X.length; i += sub) {
      var chunk = X.slice(i, i + sub);
      if (chunk.length === sub) groups.push(chunk);
    }
    m = groups.length;
    var grandMeans = [];
    for (var j = 0; j < p; j++) {
      grandMeans.push(st.mean(groups.map(function (g) {
        return st.mean(g.map(function (r) { return r[j]; }));
      })));
    }
    // S pooled
    var Sp = mat.zeros(p, p);
    groups.forEach(function (g) {
      var gm = [];
      for (var j2 = 0; j2 < p; j2++) gm.push(st.mean(g.map(function (r) { return r[j2]; })));
      g.forEach(function (r) {
        for (var a = 0; a < p; a++) for (var b = 0; b < p; b++) {
          Sp[a][b] += (r[a] - gm[a]) * (r[b] - gm[b]);
        }
      });
    });
    for (var a4 = 0; a4 < p; a4++) for (var b4 = 0; b4 < p; b4++) Sp[a4][b4] /= (m * (sub - 1));
    var Spinv = mat.inverse(Sp) || mat.pinv(Sp);
    var fcrit = dist.F.inv(1 - alpha, p, m * (sub - 1) - p + 1);
    ucl = p * (m + 1) * (sub - 1) / (m * sub - m - p + 1) * fcrit;
    points = groups.map(function (g, idx) {
      var gm = [];
      for (var j3 = 0; j3 < p; j3++) gm.push(st.mean(g.map(function (r) { return r[j3]; })));
      var v = gm.map(function (x, j4) { return x - grandMeans[j4]; });
      var s = 0;
      for (var a5 = 0; a5 < p; a5++) for (var b5 = 0; b5 < p; b5++) s += v[a5] * Spinv[a5][b5] * v[b5];
      s *= sub;
      return {
        index: idx, label: String(idx + 1), value: s, ucl: ucl, lcl: 0, cl: p,
        violations: s > ucl ? [1] : []
      };
    });
    return {
      type: 'T2 sottogruppi', p: p, m: m, n: sub, ucl: ucl, primary: points,
      titlePrimary: 'Carta T2 di Hotelling (sottogruppi di ' + sub + ')',
      outOfControl: points.filter(function (o) { return o.violations.length; }).length,
      means: grandMeans, covariance: Sp,
      generalizedVariance: groups.map(function (g, idx) {
        var Sg = mat.zeros(p, p);
        var gm2 = [];
        for (var j5 = 0; j5 < p; j5++) gm2.push(st.mean(g.map(function (r) { return r[j5]; })));
        g.forEach(function (r) {
          for (var a6 = 0; a6 < p; a6++) for (var b6 = 0; b6 < p; b6++) {
            Sg[a6][b6] += (r[a6] - gm2[a6]) * (r[b6] - gm2[b6]) / (sub - 1);
          }
        });
        return { index: idx, value: mat.det(Sg) };
      })
    };
  }

  /** Analisi discriminante lineare (classificazione con validazione incrociata leave-one-out). */
  function lda(data, groupCol, cols) {
    var n = data[groupCol].length;
    var groups = {}, order = [];
    var rows = [];
    for (var i = 0; i < n; i++) {
      var g = String(data[groupCol][i]);
      var row = [], ok = true;
      for (var j = 0; j < cols.length; j++) {
        var v = parseFloat(data[cols[j]][i]);
        if (!isFinite(v)) { ok = false; break; }
        row.push(v);
      }
      if (!ok || g === 'undefined' || g === '') continue;
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(row);
      rows.push({ g: g, x: row });
    }
    order.sort();
    var p = cols.length, k = order.length;
    var means = {}, Sp = mat.zeros(p, p), N = 0;
    order.forEach(function (g) {
      var G = groups[g], m = [];
      for (var j = 0; j < p; j++) m.push(st.mean(G.map(function (r) { return r[j]; })));
      means[g] = m;
      G.forEach(function (r) {
        for (var a = 0; a < p; a++) for (var b = 0; b < p; b++) {
          Sp[a][b] += (r[a] - m[a]) * (r[b] - m[b]);
        }
      });
      N += G.length;
    });
    for (var a2 = 0; a2 < p; a2++) for (var b2 = 0; b2 < p; b2++) Sp[a2][b2] /= (N - k);
    var Sinv = mat.inverse(Sp) || mat.pinv(Sp);
    var priors = {};
    order.forEach(function (g) { priors[g] = groups[g].length / N; });
    function score(x, g) {
      var m = means[g];
      var s = 0, t = 0;
      for (var a = 0; a < p; a++) {
        for (var b = 0; b < p; b++) {
          s += x[a] * Sinv[a][b] * m[b];
          t += m[a] * Sinv[a][b] * m[b];
        }
      }
      return s - 0.5 * t + Math.log(priors[g]);
    }
    function classify(x) {
      var best = null, bv = -Infinity;
      order.forEach(function (g) {
        var v = score(x, g);
        if (v > bv) { bv = v; best = g; }
      });
      return best;
    }
    var confusion = {};
    order.forEach(function (a) {
      confusion[a] = {};
      order.forEach(function (b) { confusion[a][b] = 0; });
    });
    var correct = 0;
    rows.forEach(function (r) {
      var pred = classify(r.x);
      confusion[r.g][pred]++;
      if (pred === r.g) correct++;
    });
    return {
      groups: order, means: means, pooledCovariance: Sp, priors: priors,
      classify: classify, confusion: confusion,
      accuracy: correct / rows.length, n: rows.length, cols: cols,
      errorRate: 1 - correct / rows.length
    };
  }

  return {
    dataMatrix: dataMatrix, correlationMatrix: correlationMatrix, pca: pca,
    kmeans: kmeans, hierarchical: hierarchical, silhouette: silhouette,
    mahalanobis: mahalanobis, hotellingT2: hotellingT2, lda: lda
  };
});
