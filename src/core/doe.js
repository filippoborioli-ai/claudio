/* CLAUDIO v3 - core/doe.js
 * Disegno degli esperimenti:
 *  - generatori: fattoriale completo (2^k e livelli misti), frazionario 2^(k-p),
 *    Plackett-Burman, CCD, Box-Behnken, array di Taguchi, D-optimal (scambio di coordinate)
 *  - struttura di alias e risoluzione calcolate dal gruppo dei contrasti
 *  - analisi: effetti, Pareto, normal/half-normal plot, Lenth (disegni non replicati),
 *    ANOVA, curvatura, lack-of-fit
 *  - superficie di risposta: modello quadratico, punto stazionario, analisi canonica,
 *    griglie per contour/superficie, ottimizzazione multi-risposta (desiderabilita)
 *  - potenza per disegni a 2 livelli, rapporti S/N di Taguchi
 */
;(function (root, name, deps, factory) {
  var res = deps.map(function (d) {
    return (typeof module === 'object' && module.exports && typeof require === 'function')
      ? require('./' + d + '.js') : root.C3[d];
  });
  var api = factory.apply(null, res);
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.C3 = root.C3 || {})[name] = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, 'doe',
['numeric', 'dist', 'stats', 'matrix', 'regression'],
function (num, dist, st, mat, reg) {
  'use strict';

  var LETTERS = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'.split(''); // la I e riservata

  /* ==================== ALIAS E RISOLUZIONE ==================== */
  /** Converte 'ABC' in insieme di indici. */
  function wordToSet(w) {
    return w.split('').map(function (c) { return LETTERS.indexOf(c); }).sort(function (a, b) { return a - b; });
  }
  function setToWord(s) {
    return s.slice().sort(function (a, b) { return a - b; }).map(function (i) { return LETTERS[i]; }).join('');
  }
  /** Prodotto di due parole (differenza simmetrica). */
  function wordProduct(a, b) {
    var s = {}, out = [];
    a.forEach(function (i) { s[i] = (s[i] || 0) + 1; });
    b.forEach(function (i) { s[i] = (s[i] || 0) + 1; });
    Object.keys(s).forEach(function (k) { if (s[k] % 2 === 1) out.push(Number(k)); });
    return out.sort(function (x, y) { return x - y; });
  }

  /**
   * Gruppo dei contrasti definenti a partire dai generatori (es. ['ABCD','ABEF']).
   * Ritorna { words: ['ABCD', ...], resolution }
   */
  function definingRelation(generatorWords) {
    var gens = generatorWords.map(wordToSet);
    var p = gens.length;
    var words = [];
    for (var m = 1; m < (1 << p); m++) {
      var acc = [];
      for (var b = 0; b < p; b++) if (m & (1 << b)) acc = wordProduct(acc, gens[b]);
      if (acc.length) words.push(acc);
    }
    var res = words.length ? Math.min.apply(null, words.map(function (w) { return w.length; })) : Infinity;
    return {
      words: words.map(setToWord),
      wordSets: words,
      resolution: res,
      romanResolution: roman(res)
    };
  }

  function roman(n) {
    var map = { 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII', 9: 'IX', 10: 'X' };
    return map[n] || (isFinite(n) ? String(n) : 'completo');
  }

  /** Alias di tutti i termini fino a un certo ordine. */
  function aliasStructure(k, generatorWords, maxOrder) {
    maxOrder = maxOrder || 2;
    var dr = definingRelation(generatorWords);
    var terms = [];
    // genera i termini fino a maxOrder
    function combos(arr, m, start, acc) {
      if (acc.length === m) { terms.push(acc.slice()); return; }
      for (var i = start; i < arr.length; i++) {
        acc.push(arr[i]); combos(arr, m, i + 1, acc); acc.pop();
      }
    }
    var idx = [];
    for (var i = 0; i < k; i++) idx.push(i);
    for (var m = 1; m <= maxOrder; m++) combos(idx, m, 0, []);
    var seen = {};
    var out = [];
    terms.forEach(function (t) {
      var reps = [setToWord(t)];
      dr.wordSets.forEach(function (w) {
        var a = wordProduct(t, w);
        if (a.length) reps.push(setToWord(a));
      });
      var key = reps.slice().sort().join('|');
      if (seen[key]) return;
      seen[key] = 1;
      out.push({ term: setToWord(t), aliases: reps.slice(1) });
    });
    return { resolution: dr.resolution, romanResolution: dr.romanResolution, defining: dr.words, aliases: out };
  }

  /* ==================== GENERATORI STANDARD ==================== */
  /** Generatori frazionari usati come default (verificati calcolando la risoluzione). */
  var FRACTION_GENERATORS = {
    '3-1': ['ABC'],
    '8-1': ['ABCDEFGH'], '9-1': ['ABCDEFGHJ'],
    '4-1': ['ABCD'],
    '5-1': ['ABCDE'], '5-2': ['ABD', 'ACE'],
    '6-1': ['ABCDEF'], '6-2': ['ABCE', 'BCDF'], '6-3': ['ABD', 'ACE', 'BCF'],
    '7-1': ['ABCDEFG'], '7-2': ['ABCDF', 'ABDEG'], '7-3': ['ABCE', 'BCDF', 'ACDG'],
    '7-4': ['ABD', 'ACE', 'BCF', 'ABCG'],
    '8-2': ['ABCDG', 'ABEFH'], '8-3': ['ABCF', 'ABDG', 'BCDEH'],
    '8-4': ['BCDE', 'ACDF', 'ABCG', 'ABDH'],
    '9-2': ['ABCDEH', 'ACDFGJ'], '9-3': ['ABCDG', 'ACEFH', 'CDEFJ'],
    '9-4': ['BCDEF', 'ACDEG', 'ABDEH', 'ABCEJ'],
    '9-5': ['ABCE', 'BCDF', 'ACDG', 'ABDH', 'ABCDJ'],
    '10-3': ['ABCGH', 'ABDEJ', 'ACEFK'],
    '10-4': ['ABCDH', 'ABCEJ', 'ABDEK', 'ACDEG'],
    '10-5': ['ABCF', 'ABDG', 'ABEH', 'ACDEJ', 'BCDEK'],
    '10-6': ['ABE', 'ACF', 'BCG', 'ABCH', 'ADJ', 'BDK'],
    '11-4': ['CDEFH', 'ABEGJ', 'BCDEGK', 'ADEFGL'],
    '11-5': ['ABCEG', 'ABDEH', 'ABEFJ', 'ACDEFK', 'BCDEFL'],
    '11-6': ['ABCF', 'ABDG', 'ACDH', 'ABEJ', 'ACEK', 'ADEL'],
    '11-7': ['ABE', 'ACF', 'BCG', 'ABCH', 'ADJ', 'BDK', 'CDL'],
    '12-8': ['ABE', 'ACF', 'BCG', 'ABCH', 'ADJ', 'BDK', 'CDL', 'ABDM'],
    '15-11': ['ABE', 'ACF', 'BCG', 'ABCH', 'ADJ', 'BDK', 'CDL', 'ABDM', 'ACDN', 'BCDO', 'ABCDP']
  };


  /**
   * Risoluzione massima ottenibile per 2^(k-p) (disegni a minima aberrazione noti
   * in letteratura). Serve a evitare ricerche combinatorie quando la tabella
   * standard e gia ottima.
   */
  var KNOWN_RESOLUTION = {
    '3-1': 3,
    '4-1': 4, '5-2': 3, '6-3': 3, '7-4': 3,
    '5-1': 5, '6-2': 4, '7-3': 4, '8-4': 4, '9-5': 3, '10-6': 3, '11-7': 3, '12-8': 3, '15-11': 3,
    '6-1': 6, '7-2': 4, '8-3': 4, '9-4': 4, '10-5': 4, '11-6': 4,
    '7-1': 7, '8-2': 5, '9-3': 4, '10-4': 4, '11-5': 4,
    '8-1': 8, '9-2': 6, '10-3': 5, '11-4': 5,
    '9-1': 9, '10-2': 7, '11-3': 5
  };

  /**
   * Cerca i generatori a minima aberrazione per 2^(k-p):
   * massimizza la risoluzione, poi minimizza il numero di parole piu corte.
   * Esaustivo quando lo spazio e piccolo, altrimenti ricerca casuale con seme fisso.
   */
  var genCache = {};
  function bestGenerators(k, p) {
    var key = k + '-' + p;
    if (genCache[key]) return genCache[key];
    if (p <= 0) {
      genCache[key] = { generators: [], resolution: Infinity, words: [] };
      return genCache[key];
    }
    var base = k - p;
    if (base < 2) throw new Error('Frazione troppo spinta: servono almeno 2 fattori di base.');
    // candidati: sottoinsiemi dei fattori di base con almeno 2 lettere
    var cands = [];
    for (var mask = 1; mask < (1 << base); mask++) {
      var bits = 0, letters = [];
      for (var b = 0; b < base; b++) if (mask & (1 << b)) { bits++; letters.push(b); }
      if (bits >= 2) cands.push(letters);
    }
    if (cands.length < p) throw new Error('Non ci sono abbastanza generatori per 2^(' + k + '-' + p + ').');

    function evaluate(choice) {
      // choice: array di p indici in cands
      var words = [];
      for (var i = 0; i < p; i++) {
        words.push(cands[choice[i]].concat([base + i]));
      }
      var group = [];
      for (var m = 1; m < (1 << p); m++) {
        var acc = [];
        for (var bb = 0; bb < p; bb++) if (m & (1 << bb)) acc = wordProduct(acc, words[bb]);
        if (!acc.length) return null; // parola nulla: disegno degenere
        group.push(acc.length);
      }
      var res = Math.min.apply(null, group);
      // profilo di aberrazione: conteggio parole per lunghezza crescente
      var prof = [];
      for (var L = 1; L <= k; L++) {
        prof.push(group.filter(function (g) { return g === L; }).length);
      }
      return { resolution: res, profile: prof, words: words };
    }

    function better(a, b) {
      if (!b) return true;
      if (a.resolution !== b.resolution) return a.resolution > b.resolution;
      for (var i = 0; i < a.profile.length; i++) {
        if (a.profile[i] !== b.profile[i]) return a.profile[i] < b.profile[i];
      }
      return false;
    }

    var best = null, bestChoice = null;
    var nc = cands.length;
    // numero di combinazioni
    var combTotal = 1;
    for (var i2 = 0; i2 < p; i2++) combTotal = combTotal * (nc - i2) / (i2 + 1);

    if (combTotal <= 300000) {
      var choice = [];
      (function rec(start) {
        if (choice.length === p) {
          var ev = evaluate(choice);
          if (ev && better(ev, best)) { best = ev; bestChoice = choice.slice(); }
          return;
        }
        for (var c = start; c < nc; c++) {
          choice.push(c); rec(c + 1); choice.pop();
        }
      })(0);
    } else {
      var r = num.rng(20250917);
      for (var t = 0; t < 120000; t++) {
        var pick = r.shuffle(cands.map(function (_, idx) { return idx; })).slice(0, p).sort(function (a, b) { return a - b; });
        var ev2 = evaluate(pick);
        if (ev2 && better(ev2, best)) { best = ev2; bestChoice = pick; }
      }
      // miglioramento locale
      var improved = true, guard = 0;
      while (improved && guard < 40) {
        improved = false; guard++;
        for (var pos = 0; pos < p; pos++) {
          for (var c2 = 0; c2 < nc; c2++) {
            if (bestChoice.indexOf(c2) >= 0) continue;
            var trial = bestChoice.slice();
            trial[pos] = c2;
            var ev3 = evaluate(trial);
            if (ev3 && better(ev3, best)) { best = ev3; bestChoice = trial; improved = true; }
          }
        }
      }
    }
    var gens = best.words.map(setToWord);
    var out = {
      generators: gens, resolution: best.resolution,
      roman: roman(best.resolution), profile: best.profile,
      words: definingRelation(gens).words
    };
    genCache[key] = out;
    return out;
  }

  /**
   * Generatori da usare: la tabella standard viene accettata se raggiunge la
   * risoluzione ottima nota; solo altrimenti si avvia la ricerca (piu lenta).
   */
  function generatorsFor(k, p) {
    var key = k + '-' + p;
    var tab = FRACTION_GENERATORS[key];
    if (tab) {
      var dr = definingRelation(tab);
      var known = KNOWN_RESOLUTION[key];
      if (known == null || dr.resolution >= known) {
        return {
          generators: tab, resolution: dr.resolution, roman: dr.romanResolution,
          source: 'disegno a minima aberrazione (tabella verificata)'
        };
      }
    }
    var srch = bestGenerators(k, p);
    return {
      generators: srch.generators, resolution: srch.resolution, roman: srch.roman,
      source: 'minima aberrazione calcolata'
    };
  }

  /** Elenco dei disegni frazionari disponibili con risoluzione calcolata. */
  function catalogFractional(maxFactors) {
    var out = [];
    var kMax = maxFactors || 11;
    for (var k = 3; k <= kMax; k++) {
      for (var p = 1; p <= k - 2; p++) {
        var runs = Math.pow(2, k - p);
        if (runs < 4 || runs > 128) continue;
        var g;
        try { g = generatorsFor(k, p); } catch (e) { continue; }
        if (!isFinite(g.resolution) || g.resolution < 3) continue;
        out.push({
          key: k + '-' + p, factors: k, p: p, runs: runs,
          fraction: '2^(' + k + '-' + p + ')',
          resolution: g.resolution, roman: g.roman,
          generators: g.generators, source: g.source,
          defining: definingRelation(g.generators).words
        });
      }
    }
    return out.sort(function (a, b) { return a.factors - b.factors || a.runs - b.runs; });
  }

  /* ==================== FATTORIALE A 2 LIVELLI ==================== */
  /**
   * spec: { factors: [{name, low, high, unit}], fraction: p (0 = completo),
   *         replicates, centerPoints, blocks, randomize, seed, generators }
   */
  function factorialDesign(spec) {
    var factors = spec.factors.map(function (f, i) {
      return {
        name: f.name || LETTERS[i], low: f.low == null ? -1 : Number(f.low),
        high: f.high == null ? 1 : Number(f.high), unit: f.unit || '', index: i
      };
    });
    var k = factors.length;
    var p = spec.fraction || 0;
    var gens = spec.generators || (p > 0 ? generatorsFor(k, p).generators : null);
    if (p > 0 && !gens) throw new Error('Nessun generatore disponibile per 2^(' + k + '-' + p + ').');
    var base = k - p;
    var nRuns = Math.pow(2, base);
    var reps = spec.replicates || 1;
    var cp = spec.centerPoints || 0;
    var runs = [];

    // matrice base in ordine standard (Yates)
    for (var r = 0; r < nRuns; r++) {
      var row = {};
      for (var j = 0; j < base; j++) {
        row[factors[j].name] = ((r >> j) & 1) ? 1 : -1;
      }
      // fattori generati
      if (p > 0) {
        gens.forEach(function (g, gi) {
          var letters = g.split('');
          var sign = 1;
          letters.forEach(function (L) {
            var idx = LETTERS.indexOf(L);
            if (idx < base) sign *= row[factors[idx].name];
          });
          row[factors[base + gi].name] = sign;
        });
      }
      runs.push(row);
    }

    // blocchi (confondimento con interazioni di ordine alto)
    var nBlocks = spec.blocks || 1;
    if (nBlocks > 1) assignBlocks(runs, factors, nBlocks, base);

    // replicati e punti centrali
    var all = [];
    for (var rep = 1; rep <= reps; rep++) {
      runs.forEach(function (row) {
        var copy = Object.assign({}, row);
        copy.__rep = rep;
        copy.__center = 0;
        all.push(copy);
      });
      for (var c = 0; c < cp; c++) {
        var cr = { __rep: rep, __center: 1, Blocco: 1 };
        factors.forEach(function (f) { cr[f.name] = 0; });
        if (nBlocks > 1) cr.Blocco = (c % nBlocks) + 1;
        all.push(cr);
      }
    }

    var rngSeed = spec.seed == null ? 1234 : spec.seed;
    var ordered = spec.randomize === false ? all : num.rng(rngSeed).shuffle(all);
    var table = ordered.map(function (row, i) {
      var out = { StdOrder: i + 1, RunOrder: i + 1, PtType: row.__center ? 0 : 1, Blocco: row.Blocco || 1 };
      factors.forEach(function (f) {
        out[f.name] = row[f.name];
        out[f.name + ' (reale)'] = codedToReal(row[f.name], f);
      });
      return out;
    });

    var alias = p > 0 ? aliasStructure(k, gens, spec.aliasOrder || 2) : {
      resolution: Infinity, romanResolution: 'completo', defining: [], aliases: []
    };
    return {
      type: p > 0 ? 'Fattoriale frazionario 2^(' + k + '-' + p + ')' : 'Fattoriale completo 2^' + k,
      factors: factors, k: k, p: p, generators: gens,
      runsBase: nRuns, replicates: reps, centerPoints: cp, blocks: nBlocks,
      totalRuns: table.length, table: table, alias: alias,
      resolution: alias.resolution, roman: alias.romanResolution,
      notes: designNotes(k, p, alias.resolution, reps, cp)
    };
  }

  function codedToReal(coded, f) {
    if (coded == null || !isFinite(coded)) return null;
    var mid = (f.low + f.high) / 2, half = (f.high - f.low) / 2;
    return num.round(mid + coded * half, 6);
  }
  function realToCoded(real, f) {
    var mid = (f.low + f.high) / 2, half = (f.high - f.low) / 2;
    return half === 0 ? 0 : (real - mid) / half;
  }

  /** Assegna i blocchi confondendoli con le interazioni di ordine piu alto. */
  function assignBlocks(runs, factors, nBlocks, base) {
    var nb = Math.round(Math.log2(nBlocks));
    // usa le interazioni piu lunghe disponibili come generatori di blocco
    var blockGens = [];
    if (base >= 3 && nb >= 1) blockGens.push(factors.slice(0, base).map(function (f) { return f.name; }));
    if (nb >= 2 && base >= 4) blockGens.push([factors[0].name, factors[1].name]);
    if (nb >= 3 && base >= 5) blockGens.push([factors[2].name, factors[3].name]);
    runs.forEach(function (row) {
      var b = 0;
      blockGens.slice(0, nb).forEach(function (g, gi) {
        var s = 1;
        g.forEach(function (nm) { s *= row[nm]; });
        if (s < 0) b |= (1 << gi);
      });
      row.Blocco = b + 1;
    });
  }

  function designNotes(k, p, resolution, reps, cp) {
    var notes = [];
    if (p === 0) notes.push('Disegno completo: tutti gli effetti e le interazioni sono stimabili senza confondimento.');
    else if (resolution >= 5) notes.push('Risoluzione V o superiore: effetti principali e interazioni a 2 fattori stimabili separatamente.');
    else if (resolution === 4) notes.push('Risoluzione IV: effetti principali liberi da interazioni a 2 fattori, ma le interazioni a 2 fattori sono confuse fra loro.');
    else notes.push('Risoluzione III: gli effetti principali sono confusi con interazioni a 2 fattori. Usare solo per screening, prevedere un fold-over.');
    if (reps === 1 && cp === 0) notes.push('Nessun replicato ne punto centrale: la varianza di errore non e stimabile, si usera il metodo di Lenth.');
    if (cp > 0) notes.push(cp + ' punti centrali per replica: consentono di stimare l errore puro e testare la curvatura.');
    return notes;
  }

  /** Fold-over completo o su un singolo fattore. */
  function foldOver(design, factorName) {
    var rows = design.table.map(function (r) {
      var nr = Object.assign({}, r);
      design.factors.forEach(function (f) {
        if (!factorName || f.name === factorName) {
          nr[f.name] = -r[f.name];
          nr[f.name + ' (reale)'] = codedToReal(-r[f.name], f);
        }
      });
      nr.Blocco = 2;
      return nr;
    });
    var table = design.table.map(function (r) {
      var c = Object.assign({}, r); c.Blocco = 1; return c;
    }).concat(rows).map(function (r, i) {
      r.StdOrder = i + 1; r.RunOrder = i + 1; return r;
    });
    return Object.assign({}, design, {
      type: design.type + ' + fold-over' + (factorName ? ' su ' + factorName : ' completo'),
      table: table, totalRuns: table.length, blocks: 2,
      notes: ['Il fold-over raddoppia le prove: ' + (factorName
        ? 'libera gli effetti del fattore ' + factorName + ' e le sue interazioni.'
        : 'libera tutti gli effetti principali dalle interazioni a 2 fattori.')]
    });
  }

  /* ==================== FATTORIALE GENERALE (livelli misti) ==================== */
  function generalFactorial(spec) {
    var factors = spec.factors.map(function (f, i) {
      return { name: f.name || LETTERS[i], levels: f.levels, index: i };
    });
    var counts = factors.map(function (f) { return f.levels.length; });
    var total = counts.reduce(function (a, b) { return a * b; }, 1);
    var reps = spec.replicates || 1;
    var rows = [];
    for (var r = 0; r < total; r++) {
      var rem = r, row = {};
      factors.forEach(function (f, i) {
        var c = counts[i];
        row[f.name] = f.levels[rem % c];
        rem = Math.floor(rem / c);
      });
      rows.push(row);
    }
    var all = [];
    for (var rep = 1; rep <= reps; rep++) {
      rows.forEach(function (row) { all.push(Object.assign({ __rep: rep }, row)); });
    }
    var ordered = spec.randomize === false ? all : num.rng(spec.seed == null ? 1234 : spec.seed).shuffle(all);
    return {
      type: 'Fattoriale generale ' + counts.join(' x '),
      factors: factors, totalRuns: ordered.length, replicates: reps,
      table: ordered.map(function (r, i) {
        var o = { StdOrder: i + 1, RunOrder: i + 1, Blocco: 1 };
        factors.forEach(function (f) { o[f.name] = r[f.name]; });
        return o;
      }),
      notes: ['Disegno a livelli misti: usare ANOVA fattoriale per l analisi.']
    };
  }

  /* ==================== PLACKETT-BURMAN ==================== */
  var PB_GENERATORS = {
    12: '++-+++---+-',
    20: '++--++++-+-+----++-',
    24: '+++++-+-++--++--+-+----'
  };

  /** Disegno di Plackett-Burman per screening (runs = 12, 20, 24). */
  function plackettBurman(spec) {
    var kFac = spec.factors.length;
    var runs = spec.runs || (kFac < 12 ? 12 : (kFac < 20 ? 20 : 24));
    var gen = PB_GENERATORS[runs];
    if (!gen) throw new Error('Plackett-Burman disponibile per 12, 20 o 24 prove.');
    var ncol = gen.length;
    if (kFac > ncol) throw new Error('Con ' + runs + ' prove si possono studiare al massimo ' + ncol + ' fattori.');
    var rowsM = [];
    for (var i = 0; i < ncol; i++) {
      var row = [];
      for (var j = 0; j < ncol; j++) {
        var c = gen[(j - i + ncol) % ncol];
        row.push(c === '+' ? 1 : -1);
      }
      rowsM.push(row);
    }
    rowsM.push(new Array(ncol).fill(-1));
    var factors = spec.factors.map(function (f, i) {
      return {
        name: f.name || LETTERS[i], low: f.low == null ? -1 : Number(f.low),
        high: f.high == null ? 1 : Number(f.high), unit: f.unit || '', index: i
      };
    });
    var cp = spec.centerPoints || 0;
    var all = rowsM.map(function (r) {
      var o = { __center: 0 };
      factors.forEach(function (f, i) { o[f.name] = r[i]; });
      return o;
    });
    for (var c2 = 0; c2 < cp; c2++) {
      var cr = { __center: 1 };
      factors.forEach(function (f) { cr[f.name] = 0; });
      all.push(cr);
    }
    var ordered = spec.randomize === false ? all : num.rng(spec.seed == null ? 1234 : spec.seed).shuffle(all);
    return {
      type: 'Plackett-Burman ' + runs + ' prove',
      factors: factors, totalRuns: ordered.length, runsBase: runs,
      spareColumns: ncol - kFac,
      table: ordered.map(function (r, i) {
        var o = { StdOrder: i + 1, RunOrder: i + 1, PtType: r.__center ? 0 : 1, Blocco: 1 };
        factors.forEach(function (f) {
          o[f.name] = r[f.name];
          o[f.name + ' (reale)'] = codedToReal(r[f.name], f);
        });
        return o;
      }),
      resolution: 3, roman: 'III',
      notes: [
        'Disegno di risoluzione III non regolare: gli effetti principali sono parzialmente confusi con tutte le interazioni a 2 fattori.',
        'Adatto a screening di molti fattori con poche prove (' + runs + ' prove per fino a ' + ncol + ' fattori).',
        (ncol - kFac) + ' colonne libere utilizzabili come stima dell errore.'
      ]
    };
  }

  /* ==================== SUPERFICIE DI RISPOSTA ==================== */
  /**
   * Central Composite Design.
   * spec: { factors, alphaType: 'rotatable'|'face'|'orthogonal'|number, centerCube, centerAxial, fraction, blocks }
   */
  function ccd(spec) {
    var factors = spec.factors.map(function (f, i) {
      return {
        name: f.name || LETTERS[i], low: Number(f.low), high: Number(f.high),
        unit: f.unit || '', index: i
      };
    });
    var k = factors.length;
    var p = spec.fraction || 0;
    var nf = Math.pow(2, k - p);
    var alpha;
    if (typeof spec.alphaType === 'number') alpha = spec.alphaType;
    else if (spec.alphaType === 'face') alpha = 1;
    else if (spec.alphaType === 'orthogonal') {
      var nc0 = spec.centerCube == null ? 3 : spec.centerCube;
      var na0 = spec.centerAxial == null ? 2 : spec.centerAxial;
      var N = nf + 2 * k + nc0 + na0;
      alpha = Math.sqrt(Math.sqrt(nf * N) / 2 - nf / 2 * 1) || Math.pow(nf, 0.25);
      alpha = Math.sqrt((Math.sqrt(N * nf) - nf) / 2);
    } else alpha = Math.pow(nf, 0.25);
    var cc = spec.centerCube == null ? (k <= 2 ? 5 : 4) : spec.centerCube;
    var ca = spec.centerAxial == null ? (k <= 2 ? 0 : 2) : spec.centerAxial;

    var rows = [];
    // porzione cubica
    var gens = p > 0 ? (spec.generators || generatorsFor(k, p).generators) : null;
    var base = k - p;
    for (var r = 0; r < nf; r++) {
      var row = { PtType: 1, Blocco: 1 };
      for (var j = 0; j < base; j++) row[factors[j].name] = ((r >> j) & 1) ? 1 : -1;
      if (p > 0) {
        gens.forEach(function (g, gi) {
          var s = 1;
          g.split('').forEach(function (L) {
            var idx = LETTERS.indexOf(L);
            if (idx < base) s *= row[factors[idx].name];
          });
          row[factors[base + gi].name] = s;
        });
      }
      rows.push(row);
    }
    for (var c = 0; c < cc; c++) {
      var z = { PtType: 0, Blocco: 1 };
      factors.forEach(function (f) { z[f.name] = 0; });
      rows.push(z);
    }
    // porzione assiale
    factors.forEach(function (f) {
      [-alpha, alpha].forEach(function (a) {
        var ax = { PtType: -1, Blocco: 2 };
        factors.forEach(function (g) { ax[g.name] = g.name === f.name ? a : 0; });
        rows.push(ax);
      });
    });
    for (var c2 = 0; c2 < ca; c2++) {
      var z2 = { PtType: 0, Blocco: 2 };
      factors.forEach(function (f) { z2[f.name] = 0; });
      rows.push(z2);
    }
    var useBlocks = spec.blocks === true;
    var ordered = spec.randomize === false ? rows : num.rng(spec.seed == null ? 1234 : spec.seed).shuffle(rows);
    return {
      type: 'Central Composite Design' + (p ? ' (porzione frazionaria 2^(' + k + '-' + p + '))' : ''),
      factors: factors, alpha: num.round(alpha, 4), k: k,
      cubePoints: nf, axialPoints: 2 * k, centerCube: cc, centerAxial: ca,
      totalRuns: rows.length,
      table: ordered.map(function (r, i) {
        var o = { StdOrder: i + 1, RunOrder: i + 1, PtType: r.PtType, Blocco: useBlocks ? r.Blocco : 1 };
        factors.forEach(function (f) {
          o[f.name] = num.round(r[f.name], 4);
          o[f.name + ' (reale)'] = codedToReal(r[f.name], f);
        });
        return o;
      }),
      notes: [
        'Alpha = ' + num.round(alpha, 4) + (spec.alphaType === 'face' ? ' (face-centered: i livelli restano entro il cubo)' :
          (spec.alphaType === 'orthogonal' ? ' (blocchi ortogonali)' : ' (rotatabile: varianza di previsione costante a pari distanza dal centro)')),
        'Il modello stimabile e quadratico completo: ' + (1 + k + k + k * (k - 1) / 2) + ' coefficienti.',
        'I punti centrali servono a stimare l errore puro e a testare la curvatura.'
      ]
    };
  }

  /** Box-Behnken (k = 3..7): nessun punto ai vertici, tutti i livelli a 3. */
  function boxBehnken(spec) {
    var factors = spec.factors.map(function (f, i) {
      return { name: f.name || LETTERS[i], low: Number(f.low), high: Number(f.high), unit: f.unit || '', index: i };
    });
    var k = factors.length;
    if (k < 3 || k > 7) throw new Error('Box-Behnken disponibile per 3 a 7 fattori.');
    var blocksIdx;
    if (k <= 5) {
      blocksIdx = [];
      for (var a = 0; a < k; a++) for (var b = a + 1; b < k; b++) blocksIdx.push([a, b]);
    } else if (k === 6) {
      blocksIdx = [[0, 1, 3], [1, 2, 4], [2, 3, 5], [3, 4, 0], [4, 5, 1], [5, 0, 2]];
    } else {
      blocksIdx = [[0, 1, 2], [1, 2, 3], [2, 3, 4], [3, 4, 5], [4, 5, 6], [5, 6, 0], [6, 0, 1]];
    }
    var rows = [];
    blocksIdx.forEach(function (grp) {
      var m = grp.length, total = Math.pow(2, m);
      for (var s = 0; s < total; s++) {
        var row = { PtType: 2, Blocco: 1 };
        factors.forEach(function (f) { row[f.name] = 0; });
        grp.forEach(function (fi, bit) {
          row[factors[fi].name] = ((s >> bit) & 1) ? 1 : -1;
        });
        rows.push(row);
      }
    });
    var cp = spec.centerPoints == null ? (k === 3 ? 3 : (k <= 5 ? 3 : 6)) : spec.centerPoints;
    for (var c = 0; c < cp; c++) {
      var z = { PtType: 0, Blocco: 1 };
      factors.forEach(function (f) { z[f.name] = 0; });
      rows.push(z);
    }
    var ordered = spec.randomize === false ? rows : num.rng(spec.seed == null ? 1234 : spec.seed).shuffle(rows);
    return {
      type: 'Box-Behnken ' + k + ' fattori',
      factors: factors, k: k, centerPoints: cp, totalRuns: rows.length,
      table: ordered.map(function (r, i) {
        var o = { StdOrder: i + 1, RunOrder: i + 1, PtType: r.PtType, Blocco: 1 };
        factors.forEach(function (f) {
          o[f.name] = r[f.name];
          o[f.name + ' (reale)'] = codedToReal(r[f.name], f);
        });
        return o;
      }),
      notes: [
        'Disegno a 3 livelli senza combinazioni estreme (nessun vertice del cubo): utile quando i punti angolari sono inattuabili o costosi.',
        'Quasi rotatabile, stima il modello quadratico completo con meno prove del CCD.'
      ]
    };
  }

  /* ==================== ARRAY DI TAGUCHI ==================== */
  /** Array a 2 livelli generati da base binaria: L4, L8, L16, L32. */
  function taguchi2Level(runs) {
    var m = Math.round(Math.log2(runs));
    var cols = [];
    for (var mask = 1; mask < (1 << m); mask++) {
      var col = [];
      for (var r = 0; r < runs; r++) {
        var bits = 0;
        for (var b = 0; b < m; b++) if (mask & (1 << b)) bits ^= (r >> b) & 1;
        col.push(bits ? 2 : 1);
      }
      cols.push(col);
    }
    return cols;
  }

  /** Array a 3 livelli generati su GF(3): L9, L27. */
  function taguchi3Level(runs) {
    var m = Math.round(Math.log(runs) / Math.log(3));
    var basis = [];
    for (var r = 0; r < runs; r++) {
      var digits = [], rem = r;
      for (var i = 0; i < m; i++) { digits.push(rem % 3); rem = Math.floor(rem / 3); }
      basis.push(digits);
    }
    var cols = [], seen = {};
    var coeffTotal = Math.pow(3, m);
    for (var c = 1; c < coeffTotal; c++) {
      var coef = [], rem2 = c;
      for (var j = 0; j < m; j++) { coef.push(rem2 % 3); rem2 = Math.floor(rem2 / 3); }
      // normalizza: primo coefficiente non nullo = 1
      var first = coef.find(function (v) { return v !== 0; });
      var invMap = { 1: 1, 2: 2 };
      var normCoef = coef.map(function (v) { return (v * invMap[first]) % 3; });
      var key = normCoef.join('');
      if (seen[key]) continue;
      seen[key] = 1;
      var col = basis.map(function (d) {
        var s = 0;
        for (var t = 0; t < m; t++) s += normCoef[t] * d[t];
        return (s % 3) + 1;
      });
      cols.push(col);
    }
    return cols;
  }

  var L18_TABLE = [
    [1, 1, 1, 1, 1, 1, 1, 1], [1, 1, 2, 2, 2, 2, 2, 2], [1, 1, 3, 3, 3, 3, 3, 3],
    [1, 2, 1, 1, 2, 2, 3, 3], [1, 2, 2, 2, 3, 3, 1, 1], [1, 2, 3, 3, 1, 1, 2, 2],
    [1, 3, 1, 2, 1, 3, 2, 3], [1, 3, 2, 3, 2, 1, 3, 1], [1, 3, 3, 1, 3, 2, 1, 2],
    [2, 1, 1, 3, 3, 2, 2, 1], [2, 1, 2, 1, 1, 3, 3, 2], [2, 1, 3, 2, 2, 1, 1, 3],
    [2, 2, 1, 2, 3, 1, 3, 2], [2, 2, 2, 3, 1, 2, 1, 3], [2, 2, 3, 1, 2, 3, 2, 1],
    [2, 3, 1, 3, 2, 3, 1, 2], [2, 3, 2, 1, 3, 1, 2, 3], [2, 3, 3, 2, 1, 2, 3, 1]
  ];

  /** Verifica l ortogonalita (bilanciamento) di tutte le coppie di colonne. */
  function checkOrthogonal(cols) {
    var n = cols[0].length;
    for (var a = 0; a < cols.length; a++) {
      for (var b = a + 1; b < cols.length; b++) {
        var cnt = {};
        for (var r = 0; r < n; r++) {
          var key = cols[a][r] + '-' + cols[b][r];
          cnt[key] = (cnt[key] || 0) + 1;
        }
        var vals = Object.keys(cnt).map(function (k) { return cnt[k]; });
        var la = new Set(cols[a]).size, lb = new Set(cols[b]).size;
        if (vals.length !== la * lb) return false;
        if (Math.max.apply(null, vals) !== Math.min.apply(null, vals)) return false;
      }
    }
    return true;
  }

  /** Catalogo degli array di Taguchi disponibili (verificati). */
  function taguchiCatalog() {
    var list = [
      { name: 'L4', runs: 4, cols: taguchi2Level(4), desc: '3 fattori a 2 livelli' },
      { name: 'L8', runs: 8, cols: taguchi2Level(8), desc: 'fino a 7 fattori a 2 livelli' },
      { name: 'L9', runs: 9, cols: taguchi3Level(9), desc: 'fino a 4 fattori a 3 livelli' },
      { name: 'L12', runs: 12, cols: (function () {
        var g = PB_GENERATORS[12], ncol = g.length, rowsM = [];
        for (var i = 0; i < ncol; i++) {
          var row = [];
          for (var j = 0; j < ncol; j++) row.push(g[(j - i + ncol) % ncol] === '+' ? 1 : 2);
          rowsM.push(row);
        }
        rowsM.push(new Array(ncol).fill(2));
        var cols = [];
        for (var c = 0; c < ncol; c++) cols.push(rowsM.map(function (r) { return r[c]; }));
        return cols;
      })(), desc: 'fino a 11 fattori a 2 livelli, interazioni distribuite' },
      { name: 'L16', runs: 16, cols: taguchi2Level(16), desc: 'fino a 15 fattori a 2 livelli' },
      { name: 'L18', runs: 18, cols: (function () {
        var cols = [];
        for (var c = 0; c < 8; c++) cols.push(L18_TABLE.map(function (r) { return r[c]; }));
        return cols;
      })(), desc: '1 fattore a 2 livelli + 7 fattori a 3 livelli' },
      { name: 'L27', runs: 27, cols: taguchi3Level(27), desc: 'fino a 13 fattori a 3 livelli' }
    ];
    return list.map(function (a) {
      a.orthogonal = checkOrthogonal(a.cols);
      a.columns = a.cols.length;
      return a;
    }).filter(function (a) { return a.orthogonal; });
  }

  /** Costruisce il piano di prove da un array di Taguchi. */
  function taguchiDesign(spec) {
    var cat = taguchiCatalog();
    var arr = cat.find(function (a) { return a.name === (spec.array || 'L8'); });
    if (!arr) throw new Error('Array non disponibile: ' + spec.array);
    var factors = spec.factors.map(function (f, i) {
      return { name: f.name || LETTERS[i], levels: f.levels || ['1', '2'], column: f.column != null ? f.column : i };
    });
    var rows = [];
    for (var r = 0; r < arr.runs; r++) {
      var row = { StdOrder: r + 1, RunOrder: r + 1 };
      factors.forEach(function (f) {
        var lv = arr.cols[f.column][r];
        row[f.name] = f.levels[lv - 1] != null ? f.levels[lv - 1] : lv;
        row[f.name + ' (liv)'] = lv;
      });
      rows.push(row);
    }
    return {
      type: 'Array di Taguchi ' + arr.name + ' (' + arr.desc + ')',
      array: arr.name, factors: factors, totalRuns: arr.runs, table: rows,
      innerArray: arr,
      notes: [
        'Disegno ortogonale: ogni coppia di colonne e bilanciata, quindi gli effetti principali sono stimabili in modo indipendente.',
        'Le interazioni sono confuse: prevedere prove di conferma.',
        'Con un array esterno (rumore) si calcolano i rapporti S/N per ottenere robustezza.'
      ]
    };
  }

  /** Rapporti S/N di Taguchi. */
  function signalToNoise(values, type) {
    var x = st.clean(values), n = x.length, i, s = 0;
    if (!n) return NaN;
    if (type === 'larger') {
      for (i = 0; i < n; i++) s += 1 / (x[i] * x[i]);
      return -10 * Math.log10(s / n);
    }
    if (type === 'nominal') {
      var m = st.mean(x), sd = st.sd(x);
      return 10 * Math.log10((m * m) / (sd * sd));
    }
    // smaller is better
    for (i = 0; i < n; i++) s += x[i] * x[i];
    return -10 * Math.log10(s / n);
  }

  /* ==================== D-OPTIMAL ==================== */
  /**
   * Disegno D-optimal per scambio di coordinate su un insieme di candidati.
   * spec: { candidates: [[x1,x2,...]], modelTerms (funzione riga -> vettore), nRuns, seed }
   */
  function dOptimal(spec) {
    var cand = spec.candidates;
    var expand = spec.expand || function (row) { return [1].concat(row); };
    var nRuns = spec.nRuns;
    var r = num.rng(spec.seed == null ? 7 : spec.seed);
    var idx = [];
    for (var i = 0; i < nRuns; i++) idx.push(r.int(0, cand.length - 1));
    function detOf(indices) {
      var X = indices.map(function (k) { return expand(cand[k]); });
      var XtX = mat.crossprod(X);
      var d = mat.det(XtX);
      return d;
    }
    var best = detOf(idx);
    var improved = true, guard = 0;
    while (improved && guard < 200) {
      improved = false; guard++;
      for (var pos = 0; pos < nRuns; pos++) {
        var cur = idx[pos], bestCand = cur, bestVal = best;
        for (var c = 0; c < cand.length; c++) {
          if (c === cur) continue;
          idx[pos] = c;
          var d2 = detOf(idx);
          if (d2 > bestVal * (1 + 1e-12)) { bestVal = d2; bestCand = c; }
        }
        idx[pos] = bestCand;
        if (bestCand !== cur) { best = bestVal; improved = true; }
      }
    }
    var X = idx.map(function (k) { return expand(cand[k]); });
    var p = X[0].length;
    return {
      type: 'Disegno D-optimal',
      rows: idx.map(function (k) { return cand[k]; }),
      det: best, dEfficiency: Math.pow(best, 1 / p) / nRuns,
      nRuns: nRuns, indices: idx,
      notes: ['Disegno costruito per massimizzare |X\'X| sul modello richiesto: utile con vincoli sullo spazio sperimentale o numero di prove imposto.']
    };
  }

  /* ==================== ANALISI FATTORIALE ==================== */
  /**
   * Analisi di un disegno a 2 livelli.
   * spec: { data (mappa colonna->valori), response, factors: [nomi], order (1|2|3),
   *         coded (default true), blocks, alpha }
   */
  function analyzeFactorial(spec) {
    var factors = spec.factors;
    var data = spec.data;
    var order = spec.order || 2;
    var terms = factors.slice();
    if (order >= 2) {
      for (var i = 0; i < factors.length; i++) {
        for (var j = i + 1; j < factors.length; j++) terms.push(factors[i] + '*' + factors[j]);
      }
    }
    if (order >= 3) {
      for (var a = 0; a < factors.length; a++) {
        for (var b = a + 1; b < factors.length; b++) {
          for (var c = b + 1; c < factors.length; c++) terms.push(factors[a] + '*' + factors[b] + '*' + factors[c]);
        }
      }
    }
    if (spec.extraTerms) terms = terms.concat(spec.extraTerms);
    // se i termini superano le prove disponibili si riduce l ordine (modello non stimabile)
    var nRuns = st.clean(data[spec.response]).length;
    var droppedTerms = [];
    while (terms.length + 1 > nRuns && terms.length > factors.length) {
      var maxOrder = Math.max.apply(null, terms.map(function (t) { return t.split('*').length; }));
      var idx = -1;
      for (var q = terms.length - 1; q >= 0; q--) {
        if (terms[q].split('*').length === maxOrder) { idx = q; break; }
      }
      if (idx < 0) break;
      droppedTerms.push(terms[idx]);
      terms.splice(idx, 1);
    }
    // codifica dei fattori: se i valori non sono +-1 li scaliamo
    var coded = {}, ranges = {};
    factors.forEach(function (f) {
      var vals = data[f].map(Number).filter(isFinite);
      var lo = st.min(vals), hi = st.max(vals);
      ranges[f] = { low: lo, high: hi };
      var mid = (lo + hi) / 2, half = (hi - lo) / 2;
      coded[f] = data[f].map(function (v) {
        var x = Number(v);
        return half === 0 ? 0 : (x - mid) / half;
      });
    });
    var work = { };
    factors.forEach(function (f) { work[f] = coded[f]; });
    work[spec.response] = data[spec.response];
    if (spec.blockColumn && data[spec.blockColumn]) {
      work[spec.blockColumn] = data[spec.blockColumn];
      terms.push(spec.blockColumn);
    }
    var cat = {};
    if (spec.blockColumn) cat[spec.blockColumn] = true;

    var fit = reg.glm({ data: work, y: spec.response, terms: terms.join(' + '), categorical: cat });
    // effetti = 2 * coefficiente (unita codificate)
    var effects = [];
    fit.termIndex.forEach(function (ti, k) {
      if (spec.blockColumn && ti.label === spec.blockColumn) return;
      var col = ti.cols[0];
      effects.push({
        term: ti.label,
        coef: fit.beta[col],
        effect: 2 * fit.beta[col],
        se: fit.se[col],
        t: fit.t[col],
        p: fit.pValues[col],
        order: ti.term.vars.length
      });
    });
    // Lenth: sempre calcolato, usato quando l errore non e stimabile in modo affidabile
    var lenthAll = lenthMethod(effects.map(function (e) { return e.effect; }), spec.alpha || 0.05);
    var noError = !isFinite(fit.mse) || fit.dfe < 1 || fit.mse < 1e-10 * Math.max(1e-30, fit.sst);
    var lenth = noError ? lenthAll : null;
    effects.forEach(function (e) {
      e.tLenth = lenthAll.pse > 0 ? e.effect / lenthAll.pse : NaN;
      e.significantLenth = Math.abs(e.effect) > lenthAll.me;
    });
    // curvatura dai punti centrali
    var curvature = null;
    if (spec.centerColumn && data[spec.centerColumn]) {
      curvature = curvatureTest(data, spec.response, spec.centerColumn);
    }
    var yvals = st.clean(data[spec.response]);
    return {
      fit: fit, effects: effects.sort(function (a, b) { return Math.abs(b.effect) - Math.abs(a.effect); }),
      lenth: lenth, lenthAll: lenthAll, curvature: curvature,
      droppedTerms: droppedTerms, nRuns: nRuns,
      ranges: ranges, factors: factors, response: spec.response,
      pareto: paretoEffects(effects, fit, lenth, spec.alpha || 0.05),
      normalPlot: normalPlotEffects(effects),
      mainEffects: mainEffectMeans(data, factors, spec.response),
      interactions: interactionMeans(data, factors, spec.response),
      s: fit.s, r2: fit.r2, r2adj: fit.r2adj, r2press: fit.r2press,
      equation: buildEquation(fit, spec.response),
      lackOfFit: pureErrorLOF(fit, data, factors, spec.response),
      yMean: st.mean(yvals)
    };
  }

  /** Metodo di Lenth per disegni non replicati. */
  function lenthMethod(effects, alpha) {
    var abs = effects.map(Math.abs).filter(function (v) { return isFinite(v); });
    var m = abs.length;
    var s0 = 1.5 * st.median(abs);
    var filtered = abs.filter(function (v) { return v < 2.5 * s0; });
    var pse = 1.5 * st.median(filtered.length ? filtered : abs);
    var d = Math.floor(m / 3);
    var gamma = (1 + Math.pow(1 - (alpha || 0.05), 1 / m)) / 2;
    return {
      pse: pse, d: d,
      me: dist.t.inv(1 - (alpha || 0.05) / 2, d) * pse,
      sme: dist.t.inv(gamma, d) * pse,
      alpha: alpha || 0.05, m: m
    };
  }

  /** Dati per il Pareto degli effetti standardizzati. */
  function paretoEffects(effects, fit, lenth, alpha) {
    var ref, refLabel;
    if (lenth) {
      ref = lenth.me / lenth.pse;
      refLabel = 'Margine di errore di Lenth (alpha=' + alpha + ')';
    } else {
      ref = dist.t.inv(1 - alpha / 2, fit.dfe);
      refLabel = 't critico (' + (1 - alpha) * 100 + '%, gdl=' + fit.dfe + ')';
    }
    var rows = effects.map(function (e) {
      return {
        term: e.term,
        value: lenth ? Math.abs(e.effect / lenth.pse) : Math.abs(e.t),
        significant: lenth ? Math.abs(e.effect) > lenth.me : e.p < alpha,
        p: e.p
      };
    }).sort(function (a, b) { return b.value - a.value; });
    return { rows: rows, reference: ref, referenceLabel: refLabel };
  }

  /** Normal e half-normal plot degli effetti. */
  function normalPlotEffects(effects) {
    var sorted = effects.slice().sort(function (a, b) { return a.effect - b.effect; });
    var m = sorted.length;
    var normal = sorted.map(function (e, i) {
      return { term: e.term, effect: e.effect, z: dist.qnorm((i + 0.5) / m) };
    });
    var half = effects.slice().sort(function (a, b) { return Math.abs(a.effect) - Math.abs(b.effect); })
      .map(function (e, i) {
        return { term: e.term, abs: Math.abs(e.effect), z: dist.qnorm(0.5 + 0.5 * (i + 0.5) / m) };
      });
    return { normal: normal, halfNormal: half };
  }

  /** Medie per livello (grafico effetti principali). */
  function mainEffectMeans(data, factors, response) {
    return factors.map(function (f) {
      var g = st.groupBy(data[response], data[f]);
      return {
        factor: f,
        levels: g.map(function (o) {
          return { level: o.level, mean: st.mean(o.values), n: o.values.length, se: st.se(o.values) };
        })
      };
    });
  }

  /** Medie per coppia di fattori (grafici di interazione). */
  function interactionMeans(data, factors, response) {
    var out = [];
    for (var i = 0; i < factors.length; i++) {
      for (var j = i + 1; j < factors.length; j++) {
        var fa = factors[i], fb = factors[j];
        var combo = data[fa].map(function (v, idx) { return String(v) + '' + String(data[fb][idx]); });
        var g = st.groupBy(data[response], combo);
        out.push({
          a: fa, b: fb,
          cells: g.map(function (o) {
            var parts = o.level.split('');
            return { a: parts[0], b: parts[1], mean: st.mean(o.values), n: o.values.length };
          })
        });
      }
    }
    return out;
  }

  /** Test di curvatura dai punti centrali. */
  function curvatureTest(data, response, centerCol) {
    var yF = [], yC = [];
    for (var i = 0; i < data[response].length; i++) {
      var v = parseFloat(data[response][i]);
      if (!isFinite(v)) continue;
      var isC = Number(data[centerCol][i]) === 0 || String(data[centerCol][i]).toLowerCase() === 'centro';
      (isC ? yC : yF).push(v);
    }
    if (yC.length < 2 || yF.length < 2) return null;
    var mF = st.mean(yF), mC = st.mean(yC);
    var nF = yF.length, nC = yC.length;
    var sF = st.variance(yF), sC = st.variance(yC);
    var sp = ((nF - 1) * sF + (nC - 1) * sC) / (nF + nC - 2);
    var se = Math.sqrt(sp * (1 / nF + 1 / nC));
    var t = (mF - mC) / se, df = nF + nC - 2;
    return {
      meanFactorial: mF, meanCenter: mC, diff: mF - mC, se: se, t: t, df: df,
      p: 2 * (1 - dist.t.cdf(Math.abs(t), df)),
      note: 'Una differenza significativa indica curvatura: il modello lineare non basta, passare a un disegno per superficie di risposta.'
    };
  }

  /** Lack-of-fit con errore puro dai punti ripetuti. */
  function pureErrorLOF(fit, data, factors, response) {
    var keyOf = function (i) {
      return factors.map(function (f) { return String(data[f][i]); }).join('|');
    };
    var groups = {};
    for (var i = 0; i < data[response].length; i++) {
      var v = parseFloat(data[response][i]);
      if (!isFinite(v)) continue;
      (groups[keyOf(i)] = groups[keyOf(i)] || []).push(v);
    }
    var pureSS = 0, pureDF = 0;
    Object.keys(groups).forEach(function (k) {
      var g = groups[k];
      if (g.length > 1) {
        var m = st.mean(g);
        g.forEach(function (v) { pureSS += (v - m) * (v - m); });
        pureDF += g.length - 1;
      }
    });
    if (!pureDF) return null;
    var lofSS = fit.sse - pureSS, lofDF = fit.dfe - pureDF;
    if (lofDF <= 0) return null;
    var F = (lofSS / lofDF) / (pureSS / pureDF);
    return {
      lofSS: lofSS, lofDF: lofDF, pureSS: pureSS, pureDF: pureDF, F: F,
      p: 1 - dist.F.cdf(F, lofDF, pureDF)
    };
  }

  /** Equazione del modello in unita codificate. */
  function buildEquation(fit, response) {
    var parts = [num.round(fit.beta[0], 5).toString()];
    for (var j = 1; j < fit.beta.length; j++) {
      var b = fit.beta[j];
      if (Math.abs(b) < 1e-12) continue;
      parts.push((b >= 0 ? '+ ' : '- ') + num.round(Math.abs(b), 5) + ' * ' + fit.names[j]);
    }
    return response + ' = ' + parts.join(' ');
  }

  /* ==================== MODELLO QUADRATICO / RSM ==================== */
  /**
   * Adatta il modello quadratico completo (o ridotto) per superficie di risposta.
   * spec: { data, response, factors, coded (default true), terms opzionali }
   */
  function analyzeRSM(spec) {
    var factors = spec.factors, data = spec.data;
    var coded = {}, ranges = {};
    factors.forEach(function (f) {
      var vals = data[f].map(Number).filter(isFinite);
      var lo = st.min(vals), hi = st.max(vals);
      // per CCD i punti assiali stanno oltre +-1: usa i livelli fattoriali se presenti
      var mid = (lo + hi) / 2, half = (hi - lo) / 2;
      if (spec.codedInput) { mid = 0; half = 1; }
      ranges[f] = { low: lo, high: hi, mid: mid, half: half };
      coded[f] = data[f].map(function (v) { return half === 0 ? 0 : (Number(v) - mid) / half; });
    });
    var terms = factors.slice();
    for (var i = 0; i < factors.length; i++) {
      for (var j = i + 1; j < factors.length; j++) terms.push(factors[i] + '*' + factors[j]);
    }
    factors.forEach(function (f) { terms.push(f + '^2'); });
    if (spec.dropTerms) {
      terms = terms.filter(function (t) { return spec.dropTerms.indexOf(t) < 0; });
    }
    var work = {};
    factors.forEach(function (f) { work[f] = coded[f]; });
    work[spec.response] = data[spec.response];
    var fit = reg.glm({ data: work, y: spec.response, terms: terms.join(' + ') });
    // coefficienti organizzati
    var k = factors.length;
    var b = new Array(k).fill(0);
    var B = mat.zeros(k, k);
    fit.names.forEach(function (nm, idx) {
      var c = fit.beta[idx];
      if (nm === 'Costante') return;
      var pw = nm.match(/^(.+)\^2$/);
      if (pw) {
        var fi = factors.indexOf(pw[1]);
        if (fi >= 0) B[fi][fi] = c;
        return;
      }
      if (nm.indexOf('*') >= 0) {
        var pr = nm.split('*');
        var i1 = factors.indexOf(pr[0]), i2 = factors.indexOf(pr[1]);
        if (i1 >= 0 && i2 >= 0) { B[i1][i2] = c / 2; B[i2][i1] = c / 2; }
        return;
      }
      var fi2 = factors.indexOf(nm);
      if (fi2 >= 0) b[fi2] = c;
    });
    // punto stazionario e analisi canonica
    var stationary = null, eig = null, nature = null;
    var Binv = mat.inverse(B);
    if (Binv) {
      var xs = mat.mulVec(Binv, b).map(function (v) { return -0.5 * v; });
      eig = mat.eigenSym(B);
      var allPos = eig.values.every(function (v) { return v > 1e-10; });
      var allNeg = eig.values.every(function (v) { return v < -1e-10; });
      nature = allNeg ? 'massimo' : (allPos ? 'minimo' : 'punto di sella');
      var row = [1];
      factors.forEach(function (f, idx) { row.push(xs[idx]); });
      stationary = {
        coded: xs,
        real: xs.map(function (v, idx) {
          return ranges[factors[idx]].mid + v * ranges[factors[idx]].half;
        }),
        nature: nature, eigenvalues: eig.values, eigenvectors: eig.vectors,
        predicted: predictAt(fit, factors, xs)
      };
    }
    return {
      fit: fit, factors: factors, response: spec.response, ranges: ranges,
      b: b, B: B, stationary: stationary,
      lackOfFit: pureErrorLOF(fit, data, factors, spec.response),
      equation: buildEquation(fit, spec.response),
      s: fit.s, r2: fit.r2, r2adj: fit.r2adj,
      predictCoded: function (x) { return predictAt(fit, factors, x); },
      predictReal: function (xr) {
        var xc = xr.map(function (v, idx) {
          var rg = ranges[factors[idx]];
          return rg.half === 0 ? 0 : (v - rg.mid) / rg.half;
        });
        return predictAt(fit, factors, xc);
      },
      toCoded: function (xr) {
        return xr.map(function (v, idx) {
          var rg = ranges[factors[idx]];
          return rg.half === 0 ? 0 : (v - rg.mid) / rg.half;
        });
      },
      toReal: function (xc) {
        return xc.map(function (v, idx) {
          var rg = ranges[factors[idx]];
          return rg.mid + v * rg.half;
        });
      }
    };
  }

  /** Valuta il modello (nomi delle colonne del fit) in un punto codificato. */
  function predictAt(fit, factors, xc) {
    var row = fit.names.map(function (nm) {
      if (nm === 'Costante') return 1;
      var pw = nm.match(/^(.+)\^2$/);
      if (pw) {
        var i = factors.indexOf(pw[1]);
        return i >= 0 ? xc[i] * xc[i] : 0;
      }
      if (nm.indexOf('*') >= 0) {
        var pr = nm.split('*');
        var a = factors.indexOf(pr[0]), b = factors.indexOf(pr[1]);
        if (a >= 0 && b >= 0) return xc[a] * xc[b];
        return 0;
      }
      var k = factors.indexOf(nm);
      return k >= 0 ? xc[k] : 0;
    });
    return reg.predict(fit, row);
  }

  /** Griglia per contour/superficie su due fattori (gli altri fissati). */
  function surfaceGrid(model, xFactor, yFactor, opts) {
    opts = opts || {};
    var n = opts.n || 40;
    var factors = model.factors;
    var xi = factors.indexOf(xFactor), yi = factors.indexOf(yFactor);
    var hold = opts.hold || {};
    var xr = opts.xRange || [-1, 1], yr = opts.yRange || [-1, 1];
    var grid = [];
    for (var i = 0; i < n; i++) {
      var rowOut = [];
      for (var j = 0; j < n; j++) {
        var xc = factors.map(function (f, idx) {
          if (idx === xi) return xr[0] + (xr[1] - xr[0]) * j / (n - 1);
          if (idx === yi) return yr[0] + (yr[1] - yr[0]) * i / (n - 1);
          return hold[f] != null ? hold[f] : 0;
        });
        rowOut.push(model.predictCoded(xc).fit);
      }
      grid.push(rowOut);
    }
    var xs = [], ys = [];
    for (var a = 0; a < n; a++) {
      xs.push(xr[0] + (xr[1] - xr[0]) * a / (n - 1));
      ys.push(yr[0] + (yr[1] - yr[0]) * a / (n - 1));
    }
    return {
      x: xs, y: ys, z: grid,
      xReal: xs.map(function (v) {
        var rg = model.ranges[xFactor];
        return rg.mid + v * rg.half;
      }),
      yReal: ys.map(function (v) {
        var rg = model.ranges[yFactor];
        return rg.mid + v * rg.half;
      }),
      xFactor: xFactor, yFactor: yFactor,
      zMin: Math.min.apply(null, grid.map(function (r) { return Math.min.apply(null, r); })),
      zMax: Math.max.apply(null, grid.map(function (r) { return Math.max.apply(null, r); }))
    };
  }

  /* ==================== DESIDERABILITA / OTTIMIZZAZIONE ==================== */
  /**
   * Desiderabilita di Derringer-Suich.
   * goal: 'max' | 'min' | 'target'
   */
  function desirability(y, goal, lower, target, upper, weight) {
    var s = weight || 1;
    if (goal === 'max') {
      if (y <= lower) return 0;
      if (y >= target) return 1;
      return Math.pow((y - lower) / (target - lower), s);
    }
    if (goal === 'min') {
      if (y >= upper) return 0;
      if (y <= target) return 1;
      return Math.pow((upper - y) / (upper - target), s);
    }
    // target
    if (y < lower || y > upper) return 0;
    if (y <= target) return Math.pow((y - lower) / (target - lower), s);
    return Math.pow((upper - y) / (upper - target), s);
  }

  /**
   * Ottimizzazione multi-risposta.
   * spec: { models: [{model, goal, lower, target, upper, weight, importance}],
   *         bounds: [[-1,1],...], startPoints }
   */
  function optimize(spec) {
    var models = spec.models;
    var factors = models[0].model.factors;
    var k = factors.length;
    var bounds = spec.bounds || factors.map(function () { return [-1, 1]; });
    function composite(x) {
      var prod = 1, sumImp = 0, ds = [];
      for (var i = 0; i < models.length; i++) {
        var m = models[i];
        var y = m.model.predictCoded(x).fit;
        var d = desirability(y, m.goal, m.lower, m.target, m.upper, m.weight);
        var imp = m.importance == null ? 1 : m.importance;
        ds.push({ response: m.model.response, y: y, d: d });
        prod *= Math.pow(Math.max(d, 1e-12), imp);
        sumImp += imp;
      }
      return { D: Math.pow(prod, 1 / sumImp), parts: ds };
    }
    // ricerca su griglia grossolana + raffinamento Nelder-Mead con penalita sui bound
    var bestX = null, bestD = -1;
    var steps = k <= 2 ? 25 : (k === 3 ? 12 : 7);
    var idx = new Array(k).fill(0);
    var totalGrid = Math.pow(steps, k);
    if (totalGrid <= 300000) {
      for (var g = 0; g < totalGrid; g++) {
        var rem = g, x = [];
        for (var d2 = 0; d2 < k; d2++) {
          var t = rem % steps; rem = Math.floor(rem / steps);
          x.push(bounds[d2][0] + (bounds[d2][1] - bounds[d2][0]) * t / (steps - 1));
        }
        var c = composite(x);
        if (c.D > bestD) { bestD = c.D; bestX = x; }
      }
    } else {
      var r = num.rng(42);
      for (var s2 = 0; s2 < 20000; s2++) {
        var xr = bounds.map(function (b) { return r.uniform(b[0], b[1]); });
        var cc = composite(xr);
        if (cc.D > bestD) { bestD = cc.D; bestX = xr; }
      }
    }
    var refined = num.nelderMead(function (x) {
      for (var i = 0; i < k; i++) {
        if (x[i] < bounds[i][0] || x[i] > bounds[i][1]) return 1e6;
      }
      return -composite(x).D;
    }, bestX, { step: 0.05 });
    var finalX = refined.fx < -bestD ? refined.x : bestX;
    var res = composite(finalX);
    return {
      coded: finalX,
      real: finalX.map(function (v, i) {
        var rg = models[0].model.ranges[factors[i]];
        return num.round(rg.mid + v * rg.half, 6);
      }),
      D: res.D,
      responses: res.parts.map(function (p, i) {
        var m = models[i];
        var pred = m.model.predictCoded(finalX);
        return {
          response: p.response, fit: p.y, d: p.d,
          ci: pred.ci, pi: pred.pi, goal: m.goal,
          target: m.target, lower: m.lower, upper: m.upper
        };
      }),
      factors: factors
    };
  }

  /* ==================== POTENZA PER DISEGNI 2^k ==================== */
  /**
   * Potenza per un disegno a 2 livelli.
   * spec: { k, p (frazione), replicates, centerPoints, effect (differenza da rilevare),
   *         sigma, alpha, terms (numero di termini nel modello) }
   */
  function factorialPower(spec) {
    var runs = Math.pow(2, spec.k - (spec.p || 0)) * (spec.replicates || 1) + (spec.centerPoints || 0);
    var nTerms = spec.terms || (1 + spec.k + spec.k * (spec.k - 1) / 2);
    var df = runs - nTerms;
    if (df < 1) return { runs: runs, df: df, power: NaN, note: 'Gradi di liberta insufficienti per stimare l errore.' };
    var alpha = spec.alpha || 0.05;
    // effetto = differenza fra le medie ai due livelli; sd dell effetto = 2*sigma/sqrt(N)
    var seEffect = 2 * spec.sigma / Math.sqrt(runs);
    var ncp = Math.abs(spec.effect) / seEffect;
    var tc = dist.t.inv(1 - alpha / 2, df);
    var power = 1 - (dist.t.cdf(tc - ncp, df) - dist.t.cdf(-tc - ncp, df));
    return {
      runs: runs, df: df, seEffect: seEffect, ncp: ncp,
      power: num.clamp(power, 0, 1), alpha: alpha,
      effect: spec.effect, sigma: spec.sigma,
      detectable: seEffect * (dist.t.inv(1 - alpha / 2, df) + dist.qnorm(0.8))
    };
  }

  return {
    LETTERS: LETTERS,
    definingRelation: definingRelation, aliasStructure: aliasStructure,
    catalogFractional: catalogFractional, FRACTION_GENERATORS: FRACTION_GENERATORS,
    bestGenerators: bestGenerators, generatorsFor: generatorsFor,
    KNOWN_RESOLUTION: KNOWN_RESOLUTION,
    factorialDesign: factorialDesign, generalFactorial: generalFactorial,
    plackettBurman: plackettBurman, foldOver: foldOver,
    ccd: ccd, boxBehnken: boxBehnken,
    taguchiCatalog: taguchiCatalog, taguchiDesign: taguchiDesign,
    taguchi2Level: taguchi2Level, taguchi3Level: taguchi3Level,
    checkOrthogonal: checkOrthogonal, signalToNoise: signalToNoise,
    dOptimal: dOptimal,
    analyzeFactorial: analyzeFactorial, lenthMethod: lenthMethod,
    curvatureTest: curvatureTest, analyzeRSM: analyzeRSM,
    surfaceGrid: surfaceGrid, desirability: desirability, optimize: optimize,
    factorialPower: factorialPower, codedToReal: codedToReal, realToCoded: realToCoded
  };
});
