/* CLAUDIO v3 - data/dataset.js
 * Modello dati tabellare: colonne tipizzate, colonne calcolate con formule,
 * filtri, ordinamenti, aggregazioni, trasformazioni (stack/unstack, ricodifica,
 * standardizzazione, binning, ritardi) e gestione dei valori mancanti.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3 = root.C3 || {};
  var st = C3.stats, num = C3.numeric;

  /** Riconosce il tipo di una colonna dai valori. */
  function detectType(values) {
    var n = 0, numeric = 0, dates = 0;
    for (var i = 0; i < values.length && n < 200; i++) {
      var v = values[i];
      if (v === null || v === undefined || v === '') continue;
      n++;
      if (typeof v === 'number') { numeric++; continue; }
      var s = String(v).trim().replace(/\s/g, '');
      var cand = s.replace(/\./g, '').indexOf(',') >= 0 && s.indexOf('.') < 0 ? s.replace(',', '.') : s;
      if (cand !== '' && isFinite(Number(cand))) numeric++;
      else if (/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}/.test(s)) dates++;
    }
    if (!n) return 'cat';
    if (numeric / n >= 0.85) return 'num';
    if (dates / n >= 0.8) return 'date';
    return 'cat';
  }

  function toNumber(v) {
    if (typeof v === 'number') return v;
    if (v === null || v === undefined || v === '') return NaN;
    var s = String(v).trim();
    if (s.indexOf(',') >= 0 && s.indexOf('.') < 0) s = s.replace(',', '.');
    else if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var x = Number(s);
    return isFinite(x) ? x : NaN;
  }

  function Dataset(name) {
    this.name = name || 'Foglio dati';
    this.columns = [];
    this.meta = {};
    this.listeners = [];
  }

  Dataset.prototype = {
    get nrows() {
      return this.columns.length ? this.columns[0].values.length : 0;
    },
    get names() {
      return this.columns.map(function (c) { return c.name; });
    },
    onChange: function (fn) { this.listeners.push(fn); return this; },
    emit: function () {
      var self = this;
      this.listeners.forEach(function (fn) {
        try { fn(self); } catch (e) { console.warn('listener dataset', e); }
      });
    },
    column: function (nameOrIndex) {
      if (typeof nameOrIndex === 'number') return this.columns[nameOrIndex];
      for (var i = 0; i < this.columns.length; i++) {
        if (this.columns[i].name === nameOrIndex) return this.columns[i];
      }
      return null;
    },
    col: function (name) {
      var c = this.column(name);
      return c ? c.values : null;
    },
    /** Valori numerici di una colonna (NaN dove non numerici). */
    numeric: function (name) {
      var c = this.column(name);
      if (!c) return [];
      return c.values.map(toNumber);
    },
    /** Oggetto { colonna: valori } per i moduli core. */
    asObject: function (cols) {
      var out = {}, self = this;
      (cols || this.names).forEach(function (n) {
        var c = self.column(n);
        if (!c) return;
        out[n] = c.type === 'num' ? c.values.map(toNumber) : c.values.slice();
      });
      return out;
    },
    rows: function () {
      var n = this.nrows, out = [], self = this;
      for (var i = 0; i < n; i++) {
        var r = {};
        self.columns.forEach(function (c) { r[c.name] = c.values[i]; });
        out.push(r);
      }
      return out;
    },
    row: function (i) {
      var r = {};
      this.columns.forEach(function (c) { r[c.name] = c.values[i]; });
      return r;
    },
    addColumn: function (name, values, type) {
      var uniqueName = this.uniqueName(name || ('C' + (this.columns.length + 1)));
      var n = this.nrows;
      var vals = (values || []).slice();
      if (this.columns.length) {
        while (vals.length < n) vals.push(null);
        if (vals.length > n) {
          // estende le altre colonne
          var extra = vals.length - n;
          this.columns.forEach(function (c) {
            for (var k = 0; k < extra; k++) c.values.push(null);
          });
        }
      }
      var col = {
        name: uniqueName, values: vals,
        type: type || detectType(vals),
        formula: null, note: null
      };
      this.columns.push(col);
      this.emit();
      return col;
    },
    uniqueName: function (base) {
      var name = base, k = 2;
      var exists = {};
      this.columns.forEach(function (c) { exists[c.name] = 1; });
      while (exists[name]) name = base + '_' + (k++);
      return name;
    },
    removeColumn: function (name) {
      this.columns = this.columns.filter(function (c) { return c.name !== name; });
      this.emit();
      return this;
    },
    renameColumn: function (oldName, newName) {
      var c = this.column(oldName);
      if (!c) return this;
      c.name = this.uniqueName(newName);
      this.emit();
      return this;
    },
    setType: function (name, type) {
      var c = this.column(name);
      if (c) { c.type = type; this.emit(); }
      return this;
    },
    setCell: function (colName, rowIndex, value) {
      var c = this.column(colName);
      if (!c) return this;
      while (c.values.length <= rowIndex) c.values.push(null);
      c.values[rowIndex] = value;
      // allinea le altre colonne
      var n = this.nrows;
      this.columns.forEach(function (cc) {
        while (cc.values.length < n) cc.values.push(null);
      });
      this.recomputeFormulas();
      this.emit();
      return this;
    },
    addRow: function (obj) {
      var self = this;
      this.columns.forEach(function (c) {
        c.values.push(obj && obj[c.name] !== undefined ? obj[c.name] : null);
      });
      this.emit();
      return this;
    },
    addRows: function (k) {
      for (var i = 0; i < (k || 1); i++) this.addRow(null);
      return this;
    },
    removeRows: function (indices) {
      var set = {};
      indices.forEach(function (i) { set[i] = 1; });
      this.columns.forEach(function (c) {
        c.values = c.values.filter(function (_, i) { return !set[i]; });
      });
      this.emit();
      return this;
    },
    clone: function (name) {
      var d = new Dataset(name || (this.name + ' (copia)'));
      d.columns = this.columns.map(function (c) {
        return { name: c.name, values: c.values.slice(), type: c.type, formula: c.formula, note: c.note };
      });
      d.meta = JSON.parse(JSON.stringify(this.meta || {}));
      return d;
    },
    /* ---------- tipi di colonna ---------- */
    numericColumns: function () {
      return this.columns.filter(function (c) { return c.type === 'num'; }).map(function (c) { return c.name; });
    },
    categoricalColumns: function () {
      return this.columns.filter(function (c) { return c.type !== 'num'; }).map(function (c) { return c.name; });
    },
    levels: function (name) {
      var c = this.column(name);
      if (!c) return [];
      var seen = {}, out = [];
      c.values.forEach(function (v) {
        var k = v === null || v === undefined || v === '' ? '(vuoto)' : String(v);
        if (!seen[k]) { seen[k] = 1; out.push(k); }
      });
      out.sort(function (a, b) {
        var na = parseFloat(a), nb = parseFloat(b);
        if (isFinite(na) && isFinite(nb)) return na - nb;
        return a < b ? -1 : (a > b ? 1 : 0);
      });
      return out;
    },
    /** Riepilogo per la vista dati. */
    summary: function () {
      var self = this;
      return this.columns.map(function (c) {
        var base = { name: c.name, type: c.type, formula: c.formula };
        if (c.type === 'num') {
          var v = st.clean(c.values);
          base.n = v.length;
          base.missing = c.values.length - v.length;
          base.mean = st.mean(v);
          base.sd = st.sd(v);
          base.min = st.min(v);
          base.max = st.max(v);
        } else {
          base.n = c.values.filter(function (x) { return x !== null && x !== undefined && x !== ''; }).length;
          base.missing = c.values.length - base.n;
          base.levels = self.levels(c.name).length;
        }
        return base;
      });
    },

    /* ---------- formule ---------- */
    /**
     * Aggiunge una colonna calcolata.
     * Nella formula le colonne si citano col loro nome; disponibili:
     * funzioni matematiche (abs, sqrt, log, exp, pow, min, max, round...),
     * statistiche di colonna (MEAN(col), SD(col), SUM(col), MEDIAN(col), N()),
     * riga corrente (ROW()), condizioni con IF(cond, a, b).
     */
    addFormulaColumn: function (name, formula) {
      var col = this.addColumn(name, [], 'num');
      col.formula = formula;
      this.recomputeFormulas();
      this.emit();
      return col;
    },
    recomputeFormulas: function () {
      var self = this;
      this.columns.forEach(function (c) {
        if (!c.formula) return;
        try {
          c.values = evalFormula(self, c.formula, c.name);
          c.type = detectType(c.values);
          c.error = null;
        } catch (e) {
          c.error = e.message;
        }
      });
      return this;
    },

    /* ---------- filtri e ordinamenti ---------- */
    /** Restituisce un nuovo dataset filtrato da una formula booleana. */
    filter: function (formula, name) {
      var keep = evalFormula(this, formula, null, true);
      var d = new Dataset(name || (this.name + ' (filtrato)'));
      d.columns = this.columns.map(function (c) {
        return {
          name: c.name, type: c.type, formula: null, note: c.note,
          values: c.values.filter(function (_, i) { return !!keep[i]; })
        };
      });
      return d;
    },
    sortBy: function (colName, desc) {
      var c = this.column(colName);
      if (!c) return this;
      var idx = c.values.map(function (v, i) { return i; });
      var isNum = c.type === 'num';
      idx.sort(function (a, b) {
        var va = isNum ? toNumber(c.values[a]) : String(c.values[a]);
        var vb = isNum ? toNumber(c.values[b]) : String(c.values[b]);
        if (isNum) {
          if (isNaN(va)) return 1;
          if (isNaN(vb)) return -1;
          return desc ? vb - va : va - vb;
        }
        return desc ? (va < vb ? 1 : (va > vb ? -1 : 0)) : (va < vb ? -1 : (va > vb ? 1 : 0));
      });
      this.columns.forEach(function (cc) {
        cc.values = idx.map(function (i) { return cc.values[i]; });
      });
      this.emit();
      return this;
    },

    /* ---------- trasformazioni ---------- */
    /** Impila piu colonne in una coppia valore/gruppo. */
    stack: function (colNames, valueName, groupName, name) {
      var d = new Dataset(name || (this.name + ' (impilato)'));
      var values = [], groups = [], self = this;
      var otherCols = this.names.filter(function (n) { return colNames.indexOf(n) < 0; });
      var carried = {};
      otherCols.forEach(function (n) { carried[n] = []; });
      colNames.forEach(function (cn) {
        var col = self.column(cn);
        col.values.forEach(function (v, i) {
          values.push(v);
          groups.push(cn);
          otherCols.forEach(function (n) { carried[n].push(self.column(n).values[i]); });
        });
      });
      d.addColumn(valueName || 'Valore', values);
      d.addColumn(groupName || 'Gruppo', groups, 'cat');
      otherCols.forEach(function (n) { d.addColumn(n, carried[n]); });
      return d;
    },
    /** Separa una colonna valore in piu colonne secondo un gruppo. */
    unstack: function (valueCol, groupCol, name) {
      var d = new Dataset(name || (this.name + ' (separato)'));
      var groups = st.groupBy(this.col(valueCol), this.col(groupCol));
      groups.forEach(function (g) {
        d.addColumn(valueCol + '_' + g.level, g.values);
      });
      return d;
    },
    /** Ricodifica i valori di una colonna categorica. */
    recode: function (colName, mapping, newName) {
      var c = this.column(colName);
      if (!c) return this;
      var vals = c.values.map(function (v) {
        var k = String(v);
        return mapping[k] !== undefined ? mapping[k] : v;
      });
      if (newName) this.addColumn(newName, vals);
      else { c.values = vals; c.type = detectType(vals); this.emit(); }
      return this;
    },
    /** Standardizza (z-score) una colonna numerica. */
    standardize: function (colName, newName) {
      var v = this.numeric(colName);
      var m = st.mean(st.clean(v)), s = st.sd(st.clean(v));
      return this.addColumn(newName || ('z_' + colName), v.map(function (x) {
        return isFinite(x) ? num.round((x - m) / s, 8) : null;
      }), 'num');
    },
    /** Classi di ampiezza uguale o per quantili. */
    bin: function (colName, k, method, newName) {
      var v = this.numeric(colName);
      var clean = st.clean(v);
      var labels;
      if (method === 'quantile') {
        var cuts = [];
        for (var i = 1; i < k; i++) cuts.push(st.quantile(clean, i / k, 7));
        labels = v.map(function (x) {
          if (!isFinite(x)) return null;
          for (var j = 0; j < cuts.length; j++) if (x <= cuts[j]) return 'Q' + (j + 1);
          return 'Q' + k;
        });
      } else {
        var lo = st.min(clean), hi = st.max(clean), w = (hi - lo) / k;
        labels = v.map(function (x) {
          if (!isFinite(x)) return null;
          var idx = Math.min(k - 1, Math.floor((x - lo) / w));
          return num.fmt(lo + idx * w, 3) + ' - ' + num.fmt(lo + (idx + 1) * w, 3);
        });
      }
      return this.addColumn(newName || (colName + '_classe'), labels, 'cat');
    },
    /** Ritardo o differenza. */
    lag: function (colName, k, newName) {
      var v = this.numeric(colName);
      var out = v.map(function (_, i) { return i >= k ? v[i - k] : null; });
      return this.addColumn(newName || (colName + '_lag' + k), out, 'num');
    },
    diff: function (colName, k, newName) {
      var v = this.numeric(colName);
      var out = v.map(function (x, i) { return i >= k ? x - v[i - k] : null; });
      return this.addColumn(newName || ('d' + k + '_' + colName), out, 'num');
    },
    /** Estrae un sottoinsieme di righe. */
    subsetRows: function (indices, name) {
      var d = new Dataset(name || (this.name + ' (subset)'));
      d.columns = this.columns.map(function (c) {
        return { name: c.name, type: c.type, formula: null, values: indices.map(function (i) { return c.values[i]; }) };
      });
      return d;
    },
    /** Campione casuale di righe. */
    sample: function (k, seed, name) {
      var r = num.rng(seed == null ? 1 : seed);
      var idx = r.shuffle(Array.from({ length: this.nrows }, function (_, i) { return i; })).slice(0, k);
      idx.sort(function (a, b) { return a - b; });
      return this.subsetRows(idx, name || (this.name + ' (campione)'));
    },

    /* ---------- aggregazione ---------- */
    /**
     * Raggruppa e aggrega.
     * spec: { by: ['col'], measures: [{col, agg:'sum'|'mean'|..., as}] }
     */
    aggregate: function (spec) {
      var by = spec.by || [];
      var measures = spec.measures || [];
      var n = this.nrows, self = this;
      var groups = {}, order = [];
      for (var i = 0; i < n; i++) {
        var key = by.map(function (b) {
          var v = self.column(b).values[i];
          return v === null || v === undefined || v === '' ? '(vuoto)' : String(v);
        }).join('');
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push(i);
      }
      if (!by.length) { groups['__all__'] = Array.from({ length: n }, function (_, i) { return i; }); order = ['__all__']; }
      var rows = order.map(function (key) {
        var idx = groups[key];
        var row = {};
        if (by.length) {
          key.split('').forEach(function (v, k) { row[by[k]] = v; });
        }
        measures.forEach(function (m) {
          var label = m.as || (aggLabel(m.agg) + ' ' + (m.col || ''));
          row[label] = applyAgg(self, m, idx);
        });
        row.__n = idx.length;
        row.__indices = idx;
        return row;
      });
      // ordinamento
      if (spec.sortBy) {
        rows.sort(function (a, b) {
          var va = a[spec.sortBy], vb = b[spec.sortBy];
          if (typeof va === 'number' && typeof vb === 'number') return spec.desc ? vb - va : va - vb;
          return spec.desc ? (String(vb) < String(va) ? -1 : 1) : (String(va) < String(vb) ? -1 : 1);
        });
      }
      if (spec.top) rows = rows.slice(0, spec.top);
      return {
        rows: rows, by: by,
        measureNames: measures.map(function (m) { return m.as || (aggLabel(m.agg) + ' ' + (m.col || '')); })
      };
    }
  };

  function aggLabel(agg) {
    return {
      sum: 'Somma', mean: 'Media', count: 'Conteggio', min: 'Minimo', max: 'Massimo',
      median: 'Mediana', sd: 'Dev.st.', var: 'Varianza', distinct: 'Distinti',
      first: 'Primo', last: 'Ultimo', p25: 'Q1', p75: 'Q3', cv: 'CV%', range: 'Range',
      sumsq: 'Somma quadrati'
    }[agg] || agg;
  }

  function applyAgg(ds, m, idx) {
    if (m.agg === 'count') return idx.length;
    var c = ds.column(m.col);
    if (!c) return null;
    if (m.agg === 'distinct') {
      var seen = {};
      idx.forEach(function (i) { seen[String(c.values[i])] = 1; });
      return Object.keys(seen).length;
    }
    if (m.agg === 'first') return c.values[idx[0]];
    if (m.agg === 'last') return c.values[idx[idx.length - 1]];
    var v = idx.map(function (i) { return toNumber(c.values[i]); }).filter(isFinite);
    if (!v.length) return null;
    switch (m.agg) {
      case 'sum': return st.sum(v);
      case 'mean': return st.mean(v);
      case 'median': return st.median(v);
      case 'min': return st.min(v);
      case 'max': return st.max(v);
      case 'sd': return st.sd(v);
      case 'var': return st.variance(v);
      case 'cv': return st.cv(v);
      case 'range': return st.range(v);
      case 'p25': return st.q1(v);
      case 'p75': return st.q3(v);
      case 'sumsq': return v.reduce(function (a, x) { return a + x * x; }, 0);
      default: return st.mean(v);
    }
  }

  /* ===================== MOTORE DI FORMULE ===================== */
  var FORMULA_HELP = [
    { name: 'Operatori', desc: '+ - * / % ** ( ) < <= > >= == != && || !' },
    { name: 'Colonne', desc: 'usa il nome della colonna, es. Peso * 2. Se contiene spazi: [Nome colonna]' },
    { name: 'ROW()', desc: 'numero di riga (1-based)' },
    { name: 'N()', desc: 'numero di righe' },
    { name: 'IF(cond, a, b)', desc: 'condizione' },
    { name: 'MEAN(col), SD(col), SUM(col), MEDIAN(col), MIN(col), MAX(col), COUNT(col)', desc: 'statistiche di colonna' },
    { name: 'ABS, SQRT, LOG, LOG10, EXP, POW(a,b), ROUND(x,d), FLOOR, CEIL, SIGN', desc: 'funzioni matematiche' },
    { name: 'NORMSINV(p), NORMSDIST(z)', desc: 'quantile e cdf normale standard' },
    { name: 'LAG(col, k), ZSCORE(col)', desc: 'valore ritardato, punteggio z' },
    { name: 'RAND(), RANDN()', desc: 'numero casuale uniforme / normale' }
  ];

  /** Sostituisce i riferimenti alle colonne e valuta la formula riga per riga. */
  function evalFormula(ds, formula, skipColumn, asBoolean) {
    var n = ds.nrows;
    var colNames = ds.names.filter(function (nm) { return nm !== skipColumn; });
    // ordina per lunghezza decrescente per evitare sostituzioni parziali
    var sorted = colNames.slice().sort(function (a, b) { return b.length - a.length; });
    var expr = String(formula);
    // riferimenti fra parentesi quadre
    expr = expr.replace(/\[([^\]]+)\]/g, function (_, nm) {
      var i = colNames.indexOf(nm.trim());
      return i >= 0 ? '__C' + i + '__' : 'null';
    });
    sorted.forEach(function (nm) {
      var i = colNames.indexOf(nm);
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nm)) return;
      expr = expr.replace(new RegExp('(?<![A-Za-z0-9_$."\'])' + escapeRe(nm) + '(?![A-Za-z0-9_$\'"])', 'g'), '__C' + i + '__');
    });
    // statistiche di colonna: calcolate una volta
    var stats = {};
    expr = expr.replace(/\b(MEAN|SD|SUM|MEDIAN|MIN|MAX|COUNT|ZSCORE)\(\s*__C(\d+)__\s*\)/g, function (_, fn, ci) {
      var key = fn + ci;
      if (!(key in stats)) {
        var vals = ds.numeric(colNames[Number(ci)]).filter(isFinite);
        stats[key] = {
          MEAN: st.mean(vals), SD: st.sd(vals), SUM: st.sum(vals),
          MEDIAN: st.median(vals), MIN: st.min(vals), MAX: st.max(vals),
          COUNT: vals.length, ZSCORE: null
        }[fn];
      }
      if (fn === 'ZSCORE') {
        return '((__C' + ci + '__ - ' + st.mean(ds.numeric(colNames[Number(ci)]).filter(isFinite)) + ') / ' +
          st.sd(ds.numeric(colNames[Number(ci)]).filter(isFinite)) + ')';
      }
      return '(' + stats[key] + ')';
    });
    expr = expr.replace(/\bLAG\(\s*__C(\d+)__\s*,\s*(\d+)\s*\)/g, function (_, ci, k) {
      return '__LAG(' + ci + ',' + k + ')';
    });
    // funzioni
    var fnMap = {
      IF: '__IF', ABS: 'Math.abs', SQRT: 'Math.sqrt', LOG: 'Math.log', LOG10: 'Math.log10',
      EXP: 'Math.exp', POW: 'Math.pow', ROUND: '__ROUND', FLOOR: 'Math.floor',
      CEIL: 'Math.ceil', SIGN: 'Math.sign', SIN: 'Math.sin', COS: 'Math.cos', TAN: 'Math.tan',
      NORMSINV: '__NORMSINV', NORMSDIST: '__NORMSDIST', RAND: '__RAND', RANDN: '__RANDN',
      ROW: '__ROW', N: '__N', PI: 'Math.PI'
    };
    Object.keys(fnMap).forEach(function (k) {
      expr = expr.replace(new RegExp('\\b' + k + '\\b', 'g'), fnMap[k]);
    });
    // verifica che non restino identificatori non consentiti
    var stripped = expr.replace(/__[A-Za-z0-9_]+/g, '').replace(/Math\.[a-zA-Z0-9]+/g, '');
    var bad = stripped.match(/[A-Za-z_$][A-Za-z0-9_$]*/g);
    if (bad) {
      var allowed = { true: 1, false: 1, null: 1, e: 1, E: 1 };
      var offenders = bad.filter(function (b) { return !allowed[b]; });
      if (offenders.length) {
        throw new Error('Nome non riconosciuto nella formula: ' + offenders[0] +
          '. Controlla il nome della colonna (usa [Nome con spazi]).');
      }
    }
    var rng = num.rng(20250917);
    var cols = colNames.map(function (nm) {
      var c = ds.column(nm);
      return c.type === 'num' ? c.values.map(toNumber) : c.values;
    });
    var body = 'var ' + colNames.map(function (_, i) { return '__C' + i + '__ = __cols[' + i + '][__i]'; }).join(', ') + ';' +
      'return (' + expr + ');';
    var f;
    try {
      f = new Function('__cols', '__i', '__n', '__IF', '__ROUND', '__NORMSINV', '__NORMSDIST',
        '__RAND', '__RANDN', '__ROW', '__N', '__LAG', body);
    } catch (e) {
      throw new Error('Formula non valida: ' + e.message);
    }
    var out = new Array(n);
    var helpers = {
      IF: function (c, a, b) { return c ? a : b; },
      ROUND: function (x, d) { return num.round(x, d == null ? 0 : d); },
      NORMSINV: function (p) { return C3.dist.qnorm(p); },
      NORMSDIST: function (z) { return C3.dist.normal.cdf(z, 0, 1); },
      RAND: function () { return rng.uniform(); },
      RANDN: function () { return rng.normal(0, 1); }
    };
    for (var i = 0; i < n; i++) {
      try {
        var v = f(cols, i, n, helpers.IF, helpers.ROUND, helpers.NORMSINV, helpers.NORMSDIST,
          helpers.RAND, helpers.RANDN,
          function () { return i + 1; }, function () { return n; },
          function (ci, k) { return i >= k ? cols[ci][i - k] : null; });
        out[i] = asBoolean ? !!v : (typeof v === 'number' && !isFinite(v) ? null : v);
      } catch (e) {
        out[i] = null;
      }
    }
    return out;
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /* ===================== COSTRUTTORI ===================== */
  /** Da array di oggetti. */
  function fromRows(rows, name) {
    var d = new Dataset(name);
    if (!rows || !rows.length) return d;
    var keys = [];
    rows.forEach(function (r) {
      Object.keys(r).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); });
    });
    keys.forEach(function (k) {
      d.addColumn(k, rows.map(function (r) { return r[k] === undefined ? null : r[k]; }));
    });
    return d;
  }

  /** Da matrice: prima riga come intestazione (opzionale). */
  function fromMatrix(matrix, header, name) {
    var d = new Dataset(name);
    if (!matrix || !matrix.length) return d;
    var start = header ? 1 : 0;
    var ncol = Math.max.apply(null, matrix.map(function (r) { return r.length; }));
    for (var j = 0; j < ncol; j++) {
      var colName = header ? String(matrix[0][j] == null || matrix[0][j] === '' ? 'C' + (j + 1) : matrix[0][j]) : 'C' + (j + 1);
      var vals = [];
      for (var i = start; i < matrix.length; i++) {
        vals.push(matrix[i][j] === undefined ? null : matrix[i][j]);
      }
      d.addColumn(colName, vals);
    }
    return d;
  }

  /** Da oggetto { colonna: valori }. */
  function fromColumns(obj, name) {
    var d = new Dataset(name);
    Object.keys(obj).forEach(function (k) { d.addColumn(k, obj[k]); });
    return d;
  }

  C3.data = {
    Dataset: Dataset, fromRows: fromRows, fromMatrix: fromMatrix, fromColumns: fromColumns,
    detectType: detectType, toNumber: toNumber, evalFormula: evalFormula,
    FORMULA_HELP: FORMULA_HELP, aggLabel: aggLabel
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
