/* CLAUDIO v3 - core/designs.js
 * Piani sperimentali classici che completano doe.js:
 *  - blocchi randomizzati completi (RCBD) e incompleti bilanciati (BIBD)
 *  - quadrato latino e greco-latino (ortogonalità verificata)
 *  - split-plot (fattori difficili da variare)
 *  - disegni per miscele: simplex lattice, simplex centroid, vertici estremi
 *    con modelli di Scheffe e response trace
 *  - Definitive Screening Design (Jones-Nachtsheim) da matrici di conferenza
 *    costruite con Paley e verificate numericamente
 */
;(function (root, name, deps, factory) {
  var res = deps.map(function (d) {
    return (typeof module === 'object' && module.exports && typeof require === 'function')
      ? require('./' + d + '.js') : root.C3[d];
  });
  var api = factory.apply(null, res);
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.C3 = root.C3 || {})[name] = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, 'designs',
['numeric', 'dist', 'stats', 'matrix', 'regression'], function (num, dist, st, mat, reg) {
  'use strict';

  /* =================== BLOCCHI RANDOMIZZATI =================== */
  /**
   * RCBD: ogni blocco contiene tutti i trattamenti una volta (o r volte).
   * spec: { treatments: [], blocks: [] | nBlocks, replicatesPerBlock, seed }
   */
  function rcbd(spec) {
    var tr = spec.treatments;
    var blocks = spec.blocks || Array.from({ length: spec.nBlocks || 3 }, function (_, i) { return 'Blocco ' + (i + 1); });
    var rep = spec.replicatesPerBlock || 1;
    var rng = num.rng(spec.seed == null ? 11 : spec.seed);
    var rows = [];
    blocks.forEach(function (b) {
      var list = [];
      for (var r = 0; r < rep; r++) list = list.concat(tr);
      rng.shuffle(list).forEach(function (t, i) {
        rows.push({ Blocco: b, Trattamento: t, OrdineNelBlocco: i + 1 });
      });
    });
    return {
      type: 'Blocchi randomizzati completi (RCBD)',
      treatments: tr, blocks: blocks, totalRuns: rows.length,
      table: rows.map(function (r, i) { return Object.assign({ StdOrder: i + 1, RunOrder: i + 1 }, r); }),
      notes: [
        'Il blocco cattura una fonte di variabilità nota e non controllabile (giorno, lotto, macchina, operatore).',
        'Gradi di liberta: trattamenti ' + (tr.length - 1) + ', blocchi ' + (blocks.length - 1) +
          ', errore ' + ((tr.length - 1) * (blocks.length - 1) * rep + (rep - 1) * tr.length * blocks.length) + '.',
        'Analisi: ANOVA a due vie senza interazione (modello Y = trattamento + blocco).'
      ],
      analyze: function (data, yName) {
        return reg.glm({
          data: data, y: yName, terms: 'Trattamento + Blocco',
          categorical: { Trattamento: true, Blocco: true }
        });
      }
    };
  }

  /**
   * Blocchi incompleti bilanciati: cerca un BIBD (v trattamenti, k per blocco).
   * Costruzione per differenze cicliche quando possibile, altrimenti ricerca casuale.
   */
  function bibd(spec) {
    var v = spec.treatments.length, k = spec.blockSize;
    if (k >= v) return rcbd(spec);
    // lambda = r(k-1)/(v-1); b = v*r/k -> cerca r minimo intero valido
    var r = null, b = null, lambda = null;
    for (var rr = 1; rr <= 30; rr++) {
      var lam = rr * (k - 1) / (v - 1);
      var bb = v * rr / k;
      if (Math.abs(lam - Math.round(lam)) < 1e-9 && Math.abs(bb - Math.round(bb)) < 1e-9) {
        r = rr; lambda = Math.round(lam); b = Math.round(bb); break;
      }
    }
    if (!r) return { error: 'Non esiste un BIBD con v=' + v + ' e k=' + k + ' di dimensioni ragionevoli.' };
    // costruzione ciclica: blocchi come traslazioni di un insieme base
    var rng = num.rng(spec.seed == null ? 5 : spec.seed);
    var best = null;
    for (var attempt = 0; attempt < 4000 && !best; attempt++) {
      var baseSet = rng.shuffle(Array.from({ length: v }, function (_, i) { return i; })).slice(0, k).sort(function (a, c) { return a - c; });
      var blocksIdx = [];
      for (var s = 0; s < v; s++) {
        blocksIdx.push(baseSet.map(function (x) { return (x + s) % v; }).sort(function (a, c) { return a - c; }));
      }
      // verifica bilanciamento delle coppie
      var pair = {};
      var ok = true;
      blocksIdx.forEach(function (blk) {
        for (var i = 0; i < k; i++) for (var j = i + 1; j < k; j++) {
          var key = blk[i] + '-' + blk[j];
          pair[key] = (pair[key] || 0) + 1;
        }
      });
      var counts = [];
      for (var i2 = 0; i2 < v; i2++) for (var j2 = i2 + 1; j2 < v; j2++) {
        counts.push(pair[i2 + '-' + j2] || 0);
      }
      if (Math.max.apply(null, counts) !== Math.min.apply(null, counts)) ok = false;
      if (ok) best = blocksIdx;
    }
    if (!best) return { error: 'Costruzione BIBD non trovata: usare RCBD o ridurre v.' };
    var rows = [];
    best.forEach(function (blk, bi) {
      rng.shuffle(blk).forEach(function (t, i) {
        rows.push({ Blocco: 'B' + (bi + 1), Trattamento: spec.treatments[t], OrdineNelBlocco: i + 1 });
      });
    });
    return {
      type: 'Blocchi incompleti bilanciati (BIBD)',
      v: v, k: k, b: best.length, r: best.length * k / v, lambda: lambda,
      totalRuns: rows.length,
      table: rows.map(function (r2, i) { return Object.assign({ StdOrder: i + 1, RunOrder: i + 1 }, r2); }),
      notes: [
        'Ogni blocco contiene ' + k + ' trattamenti su ' + v + '; ogni coppia di trattamenti compare insieme ' + lambda + ' volte.',
        'Utile quando il blocco (giorno, forno, pannello) non può ospitare tutti i trattamenti.',
        'Analisi: modello Y = trattamento + blocco con medie marginali stimate (le medie semplici sono distorte).'
      ]
    };
  }

  /* =================== QUADRATO LATINO =================== */
  /** Quadrato latino k x k (righe, colonne, trattamenti), randomizzato. */
  function latinSquare(spec) {
    var tr = spec.treatments;
    var k = tr.length;
    var rng = num.rng(spec.seed == null ? 3 : spec.seed);
    var L = [];
    for (var i = 0; i < k; i++) {
      L.push([]);
      for (var j = 0; j < k; j++) L[i].push((i + j) % k);
    }
    // randomizza righe, colonne e assegnazione dei trattamenti
    var rowOrder = rng.shuffle(Array.from({ length: k }, function (_, i) { return i; }));
    var colOrder = rng.shuffle(Array.from({ length: k }, function (_, i) { return i; }));
    var trOrder = rng.shuffle(tr.slice());
    var rows = [];
    for (var a = 0; a < k; a++) {
      for (var b = 0; b < k; b++) {
        rows.push({
          Riga: (spec.rowLabels && spec.rowLabels[a]) || ('R' + (a + 1)),
          Colonna: (spec.colLabels && spec.colLabels[b]) || ('C' + (b + 1)),
          Trattamento: trOrder[L[rowOrder[a]][colOrder[b]]]
        });
      }
    }
    return {
      type: 'Quadrato latino ' + k + 'x' + k,
      k: k, treatments: tr, totalRuns: rows.length,
      square: rows,
      table: rows.map(function (r, i) { return Object.assign({ StdOrder: i + 1, RunOrder: i + 1 }, r); }),
      valid: checkLatin(L, k),
      notes: [
        'Controlla due fonti di disturbo (righe e colonne) con k^2 prove invece di k^3.',
        'Ipotesi forte: nessuna interazione fra trattamento, righe e colonne.',
        'Gradi di liberta errore: ' + ((k - 1) * (k - 2) + '') + ' (con k=' + k + '): con k=3 sono solo 2, meglio replicare il quadrato.',
        'Analisi: Y = trattamento + riga + colonna.'
      ],
      analyze: function (data, yName) {
        return reg.glm({
          data: data, y: yName, terms: 'Trattamento + Riga + Colonna',
          categorical: { Trattamento: true, Riga: true, Colonna: true }
        });
      }
    };
  }

  function checkLatin(L, k) {
    for (var i = 0; i < k; i++) {
      var rs = new Set(L[i]), cs = new Set(L.map(function (r) { return r[i]; }));
      if (rs.size !== k || cs.size !== k) return false;
    }
    return true;
  }

  /** Quadrato greco-latino (due quadrati ortogonali sovrapposti). */
  function graecoLatin(spec) {
    var k = spec.treatments.length;
    var greek = spec.greekTreatments || Array.from({ length: k }, function (_, i) { return 'G' + (i + 1); });
    if (greek.length !== k) return { error: 'I due insiemi di trattamenti devono avere la stessa numerosità.' };
    // costruzione: L1 = (i+j) mod k, L2 = (i + c*j) mod k con c che rende ortogonali
    var found = null;
    // k pari: la costruzione ciclica non funziona, si usa una coppia nota (esiste per k=4)
    var KNOWN_PAIRS = {
      4: {
        L1: [[0, 1, 2, 3], [1, 0, 3, 2], [2, 3, 0, 1], [3, 2, 1, 0]],
        L2: [[0, 1, 2, 3], [2, 3, 0, 1], [3, 2, 1, 0], [1, 0, 3, 2]]
      },
      8: {
        L1: [[0, 1, 2, 3, 4, 5, 6, 7], [1, 0, 3, 2, 5, 4, 7, 6], [2, 3, 0, 1, 6, 7, 4, 5],
          [3, 2, 1, 0, 7, 6, 5, 4], [4, 5, 6, 7, 0, 1, 2, 3], [5, 4, 7, 6, 1, 0, 3, 2],
          [6, 7, 4, 5, 2, 3, 0, 1], [7, 6, 5, 4, 3, 2, 1, 0]],
        L2: [[0, 1, 2, 3, 4, 5, 6, 7], [2, 3, 0, 1, 6, 7, 4, 5], [4, 5, 6, 7, 0, 1, 2, 3],
          [6, 7, 4, 5, 2, 3, 0, 1], [1, 0, 3, 2, 5, 4, 7, 6], [3, 2, 1, 0, 7, 6, 5, 4],
          [5, 4, 7, 6, 1, 0, 3, 2], [7, 6, 5, 4, 3, 2, 1, 0]]
      }
    };
    if (KNOWN_PAIRS[k]) {
      var kp = KNOWN_PAIRS[k];
      var pairsSeen = {}, okKnown = checkLatin(kp.L1, k) && checkLatin(kp.L2, k);
      for (var ii = 0; ii < k && okKnown; ii++) {
        for (var jj = 0; jj < k; jj++) {
          var kk = kp.L1[ii][jj] + '-' + kp.L2[ii][jj];
          if (pairsSeen[kk]) { okKnown = false; break; }
          pairsSeen[kk] = 1;
        }
      }
      if (okKnown) found = { L1: kp.L1, L2: kp.L2, c: 'coppia nota' };
    }
    for (var c = 2; c < k && !found; c++) {
      var L1 = [], L2 = [], pairs = {};
      var ok = true;
      for (var i = 0; i < k; i++) {
        L1.push([]); L2.push([]);
        for (var j = 0; j < k; j++) {
          var a = (i + j) % k, b = (i + c * j) % k;
          L1[i].push(a); L2[i].push(b);
          var key = a + '-' + b;
          if (pairs[key]) ok = false;
          pairs[key] = 1;
        }
      }
      if (ok && checkLatin(L1, k) && checkLatin(L2, k)) found = { L1: L1, L2: L2, c: c };
    }
    if (!found) {
      return {
        error: 'Non esiste un quadrato greco-latino di ordine ' + k +
          (k === 6 ? ' (caso classico impossibile, dimostrato da Tarry).' : '.')
      };
    }
    var rows = [];
    for (var a2 = 0; a2 < k; a2++) {
      for (var b2 = 0; b2 < k; b2++) {
        rows.push({
          Riga: 'R' + (a2 + 1), Colonna: 'C' + (b2 + 1),
          Trattamento: spec.treatments[found.L1[a2][b2]],
          Trattamento2: greek[found.L2[a2][b2]]
        });
      }
    }
    return {
      type: 'Quadrato greco-latino ' + k + 'x' + k,
      k: k, totalRuns: rows.length, multiplier: found.c,
      table: rows.map(function (r, i) { return Object.assign({ StdOrder: i + 1, RunOrder: i + 1 }, r); }),
      notes: [
        'Controlla tre fonti di disturbo (righe, colonne, secondo trattamento) in k^2 prove.',
        'Gradi di liberta errore: ' + ((k - 3) * (k - 1)) + '.',
        'Analisi: Y = trattamento + trattamento2 + riga + colonna.'
      ]
    };
  }

  /* =================== SPLIT-PLOT =================== */
  /**
   * Split-plot: fattori difficili da variare (whole plot) e facili (subplot).
   * spec: { hardFactors: [{name, levels}], easyFactors: [{name, levels}], replicates, seed }
   */
  function splitPlot(spec) {
    var hard = spec.hardFactors, easy = spec.easyFactors;
    var reps = spec.replicates || 2;
    var rng = num.rng(spec.seed == null ? 9 : spec.seed);
    function combos(fs) {
      var out = [{}];
      fs.forEach(function (f) {
        var next = [];
        out.forEach(function (o) {
          f.levels.forEach(function (L) {
            var c = Object.assign({}, o);
            c[f.name] = L;
            next.push(c);
          });
        });
        out = next;
      });
      return out;
    }
    var wholes = combos(hard), subs = combos(easy);
    var rows = [], wp = 0;
    for (var r = 1; r <= reps; r++) {
      rng.shuffle(wholes).forEach(function (w) {
        wp++;
        rng.shuffle(subs).forEach(function (s, si) {
          rows.push(Object.assign({ Replica: r, WholePlot: wp, OrdineSub: si + 1 }, w, s));
        });
      });
    }
    var dfWhole = wholes.length - 1;
    var dfWholeErr = (reps - 1) * wholes.length;
    return {
      type: 'Split-plot',
      hardFactors: hard.map(function (f) { return f.name; }),
      easyFactors: easy.map(function (f) { return f.name; }),
      wholePlots: wp, totalRuns: rows.length, replicates: reps,
      table: rows.map(function (r2, i) { return Object.assign({ StdOrder: i + 1, RunOrder: i + 1 }, r2); }),
      notes: [
        'I fattori difficili da variare cambiano solo fra whole plot: si riducono i cambi di setup.',
        'Attenzione: due errori diversi. I fattori whole plot vanno testati contro l’errore di whole plot (' + dfWholeErr + ' gdl), i subplot contro l’errore di subplot.',
        'Un\'analisi che ignora la struttura split-plot sovrastima la significativita dei fattori difficili da variare.'
      ],
      analyze: function (data, yName) {
        // approssimazione a effetti misti: whole plot come blocco casuale
        var terms = hard.map(function (f) { return f.name; })
          .concat(['WholePlot'])
          .concat(easy.map(function (f) { return f.name; }));
        hard.forEach(function (h) {
          easy.forEach(function (e) { terms.push(h.name + '*' + e.name); });
        });
        var cat = { WholePlot: true };
        hard.concat(easy).forEach(function (f) { cat[f.name] = true; });
        return reg.glm({ data: data, y: yName, terms: terms.join(' + '), categorical: cat });
      }
    };
  }

  /* =================== MISCELE =================== */
  /**
   * Simplex lattice {q, m}: proporzioni multiple di 1/m che sommano a 1.
   */
  function simplexLattice(spec) {
    var comps = spec.components;
    var q = comps.length, m = spec.degree || 2;
    var rows = [];
    function rec(idx, remaining, acc) {
      if (idx === q - 1) {
        var full = acc.concat([remaining / m]);
        rows.push(full.slice());
        return;
      }
      for (var i = 0; i <= remaining; i++) {
        rec(idx + 1, remaining - i, acc.concat([i / m]));
      }
    }
    rec(0, m, []);
    if (spec.centroid !== false && rows.every(function (r) { return r.some(function (v) { return v === 0; }); })) {
      rows.push(new Array(q).fill(1 / q));
    }
    if (spec.axial) {
      // punti assiali a metà fra centroide e vertice
      for (var v2 = 0; v2 < q; v2++) {
        var row = new Array(q).fill((1 - (1 / q + 1) / 2) / (q - 1));
        row[v2] = (1 / q + 1) / 2;
        rows.push(row);
      }
    }
    return buildMixtureDesign(spec, rows, 'Simplex lattice {' + q + ',' + m + '}');
  }

  /** Simplex centroid: tutti i baricentri dei sottoinsiemi. */
  function simplexCentroid(spec) {
    var comps = spec.components, q = comps.length;
    var rows = [];
    for (var mask = 1; mask < (1 << q); mask++) {
      var idxs = [];
      for (var b = 0; b < q; b++) if (mask & (1 << b)) idxs.push(b);
      var row = new Array(q).fill(0);
      idxs.forEach(function (i) { row[i] = 1 / idxs.length; });
      rows.push(row);
    }
    return buildMixtureDesign(spec, rows, 'Simplex centroid (' + q + ' componenti)');
  }

  /** Vertici estremi per miscele con vincoli inferiori/superiori (metodo XVERT semplificato). */
  function extremeVertices(spec) {
    var comps = spec.components, q = comps.length;
    var lo = comps.map(function (c) { return c.low || 0; });
    var hi = comps.map(function (c) { return c.high == null ? 1 : c.high; });
    var sumLo = lo.reduce(function (a, b) { return a + b; }, 0);
    if (sumLo > 1 + 1e-9) return { error: 'La somma dei limiti inferiori supera 1: vincoli incompatibili.' };
    // enumera i vertici: q-1 componenti ai limiti, la restante per differenza
    var rows = [], seen = {};
    var combosLimits = Math.pow(2, q);
    for (var mask = 0; mask < combosLimits; mask++) {
      for (var free = 0; free < q; free++) {
        var row = new Array(q).fill(0), s = 0, ok = true;
        for (var i = 0; i < q; i++) {
          if (i === free) continue;
          row[i] = (mask & (1 << i)) ? hi[i] : lo[i];
          s += row[i];
        }
        row[free] = 1 - s;
        if (row[free] < lo[free] - 1e-9 || row[free] > hi[free] + 1e-9) ok = false;
        if (!ok) continue;
        var key = row.map(function (v) { return num.round(v, 6); }).join(',');
        if (seen[key]) continue;
        seen[key] = 1;
        rows.push(row.map(function (v) { return num.round(v, 6); }));
      }
    }
    if (!rows.length) return { error: 'Nessun vertice ammissibile: rivedere i vincoli.' };
    // centroide globale e centroidi delle facce
    var centro = new Array(q).fill(0);
    rows.forEach(function (r) { r.forEach(function (v, i) { centro[i] += v / rows.length; }); });
    rows.push(centro.map(function (v) { return num.round(v, 6); }));
    return buildMixtureDesign(spec, rows, 'Vertici estremi (miscela vincolata)');
  }

  function buildMixtureDesign(spec, rows, label) {
    var comps = spec.components;
    var total = spec.total || 1;
    var reps = spec.replicates || 1;
    var all = [];
    for (var r = 0; r < reps; r++) rows.forEach(function (row) { all.push(row); });
    var rng = num.rng(spec.seed == null ? 21 : spec.seed);
    var ordered = spec.randomize === false ? all : rng.shuffle(all);
    return {
      type: label,
      components: comps.map(function (c) { return c.name; }),
      totalRuns: ordered.length,
      table: ordered.map(function (row, i) {
        var o = { StdOrder: i + 1, RunOrder: i + 1 };
        comps.forEach(function (c, j) {
          o[c.name] = num.round(row[j], 6);
          if (total !== 1) o[c.name + ' (qta)'] = num.round(row[j] * total, 6);
        });
        return o;
      }),
      proportions: ordered,
      notes: [
        'Nelle miscele i fattori sono proporzioni e sommano a 1: non si possono variare in modo indipendente.',
        'Il modello e di Scheffe (senza costante): lineare, quadratico o cubico speciale.',
        'Interpretazione: i coefficienti lineari sono le risposte attese nei componenti puri; i termini incrociati misurano la sinergia o l’antagonismo fra componenti.'
      ]
    };
  }

  /**
   * Modello di Scheffe per miscele.
   * degree: 1 (lineare), 2 (quadratico), 3 (cubico speciale)
   */
  function mixtureModel(data, components, response, degree) {
    degree = degree || 2;
    var q = components.length;
    var rowsUsed = [], X = [], y = [], names = [];
    components.forEach(function (c) { names.push(c); });
    if (degree >= 2) {
      for (var i = 0; i < q; i++) for (var j = i + 1; j < q; j++) names.push(components[i] + '*' + components[j]);
    }
    if (degree >= 3) {
      for (var a = 0; a < q; a++) for (var b = a + 1; b < q; b++) for (var c2 = b + 1; c2 < q; c2++) {
        names.push(components[a] + '*' + components[b] + '*' + components[c2]);
      }
    }
    var n = data[response].length;
    for (var r = 0; r < n; r++) {
      var xs = [], ok = true;
      components.forEach(function (c) {
        var v = parseFloat(data[c][r]);
        if (!isFinite(v)) ok = false;
        xs.push(v);
      });
      var yv = parseFloat(data[response][r]);
      if (!ok || !isFinite(yv)) continue;
      var sum = xs.reduce(function (p, v) { return p + v; }, 0);
      if (sum > 0) xs = xs.map(function (v) { return v / sum; });
      var row = xs.slice();
      if (degree >= 2) {
        for (var i2 = 0; i2 < q; i2++) for (var j2 = i2 + 1; j2 < q; j2++) row.push(xs[i2] * xs[j2]);
      }
      if (degree >= 3) {
        for (var a2 = 0; a2 < q; a2++) for (var b2 = a2 + 1; b2 < q; b2++) for (var c3 = b2 + 1; c3 < q; c3++) {
          row.push(xs[a2] * xs[b2] * xs[c3]);
        }
      }
      X.push(row); y.push(yv); rowsUsed.push(r);
    }
    var fit = reg.ols(X, y);
    fit.names = names;
    fit.coefTable = names.map(function (nm, j) {
      return { name: nm, coef: fit.beta[j], se: fit.se[j], t: fit.t[j], p: fit.pValues[j] };
    });
    fit.components = components;
    fit.degree = degree;
    fit.response = response;
    fit.predictMix = function (props) {
      var sum = props.reduce(function (a, b) { return a + b; }, 0);
      var p = props.map(function (v) { return v / sum; });
      var row = p.slice();
      if (degree >= 2) {
        for (var i3 = 0; i3 < q; i3++) for (var j3 = i3 + 1; j3 < q; j3++) row.push(p[i3] * p[j3]);
      }
      if (degree >= 3) {
        for (var a3 = 0; a3 < q; a3++) for (var b3 = a3 + 1; b3 < q; b3++) for (var c4 = b3 + 1; c4 < q; c4++) {
          row.push(p[a3] * p[b3] * p[c4]);
        }
      }
      return reg.predict(fit, row);
    };
    // response trace lungo le direzioni di Cox
    fit.responseTrace = function (steps) {
      steps = steps || 21;
      var base = new Array(q).fill(1 / q);
      return components.map(function (c, idx) {
        var pts = [];
        for (var s = 0; s < steps; s++) {
          var xi = s / (steps - 1);
          var row = base.map(function (v, k) {
            if (k === idx) return xi;
            return (1 - xi) * base[k] / (1 - base[idx]);
          });
          pts.push({ x: xi, y: fit.predictMix(row).fit });
        }
        return { component: c, points: pts };
      });
    };
    // griglia ternaria per q = 3
    if (q === 3) {
      fit.ternaryGrid = function (nGrid) {
        nGrid = nGrid || 40;
        var pts = [];
        for (var i4 = 0; i4 <= nGrid; i4++) {
          for (var j4 = 0; j4 <= nGrid - i4; j4++) {
            var x1 = i4 / nGrid, x2 = j4 / nGrid, x3 = 1 - x1 - x2;
            pts.push({ a: x1, b: x2, c: x3, y: fit.predictMix([x1, x2, x3]).fit });
          }
        }
        return pts;
      };
    }
    return fit;
  }

  /* =================== DEFINITIVE SCREENING DESIGN =================== */
  /** Simbolo di Legendre chi(a) su GF(p). */
  function legendre(a, p) {
    a = ((a % p) + p) % p;
    if (a === 0) return 0;
    var r = 1;
    for (var i = 1; i <= (p - 1) / 2; i++) {
      if ((i * i) % p === a) return 1;
    }
    return -1;
  }

  function isPrime(n) {
    if (n < 2) return false;
    for (var i = 2; i * i <= n; i++) if (n % i === 0) return false;
    return true;
  }

  /** Matrice di conferenza di ordine n (costruzione di Paley), o null. */
  function conferenceMatrix(n) {
    var q = n - 1;
    if (!isPrime(q)) return null;
    var S = [];
    for (var i = 0; i < q; i++) {
      S.push([]);
      for (var j = 0; j < q; j++) S[i].push(legendre(j - i, q));
    }
    var C = mat.zeros(n, n);
    for (var a = 1; a < n; a++) {
      C[0][a] = 1;
      C[a][0] = (q % 4 === 3) ? -1 : 1;
    }
    for (var r = 0; r < q; r++) {
      for (var c = 0; c < q; c++) C[r + 1][c + 1] = S[r][c];
    }
    // verifica C'C = (n-1) I
    var CtC = mat.crossprod(C);
    for (var x = 0; x < n; x++) {
      for (var y = 0; y < n; y++) {
        var expect = x === y ? n - 1 : 0;
        if (Math.abs(CtC[x][y] - expect) > 1e-9) return null;
      }
    }
    return C;
  }

  /**
   * Definitive Screening Design (Jones & Nachtsheim).
   * spec: { factors: [{name, low, high}], extraCenter, seed }
   */
  function dsd(spec) {
    var m = spec.factors.length;
    var n = m % 2 === 0 ? m : m + 1;
    var C = null;
    while (n <= m + 8 && !C) {
      C = conferenceMatrix(n);
      if (!C) n += 2;
    }
    if (!C) return { error: 'Nessuna matrice di conferenza disponibile per ' + m + ' fattori in questa implementazione.' };
    var rows = [];
    for (var i = 0; i < n; i++) rows.push(C[i].slice(0, m));
    for (var j = 0; j < n; j++) rows.push(C[j].slice(0, m).map(function (v) { return -v; }));
    rows.push(new Array(m).fill(0));
    var extra = spec.extraCenter || 0;
    for (var e = 0; e < extra; e++) rows.push(new Array(m).fill(0));
    var factors = spec.factors.map(function (f, idx) {
      return {
        name: f.name || ('X' + (idx + 1)),
        low: f.low == null ? -1 : Number(f.low),
        high: f.high == null ? 1 : Number(f.high), index: idx
      };
    });
    var rng = num.rng(spec.seed == null ? 31 : spec.seed);
    var ordered = spec.randomize === false ? rows : rng.shuffle(rows);
    return {
      type: 'Definitive Screening Design (' + m + ' fattori, ' + ordered.length + ' prove)',
      factors: factors, conferenceOrder: n, totalRuns: ordered.length,
      table: ordered.map(function (row, i2) {
        var o = { StdOrder: i2 + 1, RunOrder: i2 + 1, PtType: row.every(function (v) { return v === 0; }) ? 0 : 1 };
        factors.forEach(function (f, j2) {
          o[f.name] = row[j2];
          var mid = (f.low + f.high) / 2, half = (f.high - f.low) / 2;
          o[f.name + ' (reale)'] = num.round(mid + row[j2] * half, 6);
        });
        return o;
      }),
      notes: [
        'Tre livelli per fattore con circa 2k+1 prove: stima gli effetti principali senza confondimento con interazioni a 2 fattori.',
        'I termini quadratici non sono confusi con gli effetti principali: rileva la curvatura, cosa impossibile con un frazionario a 2 livelli.',
        'Ideale come primo esperimento quando i fattori sono molti (6-12) e si sospetta non linearità.'
      ]
    };
  }

  return {
    rcbd: rcbd, bibd: bibd, latinSquare: latinSquare, graecoLatin: graecoLatin,
    splitPlot: splitPlot,
    simplexLattice: simplexLattice, simplexCentroid: simplexCentroid,
    extremeVertices: extremeVertices, mixtureModel: mixtureModel,
    conferenceMatrix: conferenceMatrix, dsd: dsd, legendre: legendre
  };
});
