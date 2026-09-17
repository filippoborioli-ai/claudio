/* CLAUDIO v3 - ui/views/analyze-view.js
 * Viste di analisi statistica: descrittive e riassunto grafico, normalita e
 * identificazione della distribuzione, test di ipotesi, ANOVA e confronti
 * multipli, tabelle di contingenza, potenza e numerosita campionaria.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3;
  var ui = C3.ui, h = ui.h, num = C3.numeric, st = C3.stats, T = C3.tests;

  function alpha() { return C3.app.state.settings.alpha; }
  function conf() { return 1 - alpha(); }

  function needData(el) {
    var ds = C3.app.ds();
    if (!ds || !ds.nrows) {
      el.appendChild(ui.empty('Nessun dato', 'Carica un dataset dalla barra in alto.'));
      return null;
    }
    return ds;
  }

  function splitLayout(el) {
    var split = h('div', { class: 'split' });
    var left = h('div', { class: 'panel options-panel' });
    var right = h('div');
    split.appendChild(left);
    split.appendChild(right);
    el.appendChild(split);
    return { left: left, right: right };
  }

  /* ==================================================================
     STATISTICA DESCRITTIVA
     ================================================================== */
  C3.app.registerView({
    id: 'descrittive',
    label: 'Descrittive e distribuzione',
    icon: '∑',
    group: 'Analisi',
    desc: 'Statistiche descrittive complete, riassunto grafico, test di normalita, identificazione della distribuzione e trasformazioni.',
    render: function (el) {
      var ds = needData(el);
      if (!ds) return;
      var numCols = ds.numericColumns();
      if (!numCols.length) {
        el.appendChild(ui.verdict('Nessuna colonna numerica: imposta il tipo delle colonne nella vista Dati.', 'warn'));
        return;
      }
      var L = splitLayout(el);
      var f = ui.form([
        { id: 'vars', type: 'multiselect', label: 'Variabili', options: numCols, value: [numCols[0]], size: 6 },
        {
          id: 'by', type: 'select', label: 'Raggruppa per (opzionale)',
          options: [{ value: '', label: '(nessuno)' }].concat(ds.categoricalColumns())
        },
        { id: 'graph', type: 'checkbox', label: 'Riassunto grafico', value: true },
        { id: 'normal', type: 'checkbox', label: 'Test di normalita', value: true },
        { id: 'distid', type: 'checkbox', label: 'Identifica la distribuzione migliore', value: false },
        { id: 'outliers', type: 'checkbox', label: 'Ricerca valori anomali', value: true }
      ], function () { run(); });
      L.left.appendChild(h('h3', null, 'Variabili'));
      L.left.appendChild(f.el);

      function run() {
        ui.clear(L.right);
        var v = f.values();
        var vars = v.vars.length ? v.vars : [numCols[0]];
        vars.forEach(function (varName) {
          var groups = v.by
            ? st.groupBy(ds.numeric(varName), ds.col(v.by))
            : [{ level: 'tutti', values: st.clean(ds.numeric(varName)) }];

          // tabella descrittiva
          var rows = groups.map(function (g) {
            var d = st.describe(g.values, { conf: conf() });
            return {
              level: g.level, n: d.n, mean: d.mean, se: d.se, sd: d.sd, cv: d.cv,
              min: d.min, q1: d.q1, median: d.median, q3: d.q3, max: d.max,
              range: d.range, iqr: d.iqr, skew: d.skewness, kurt: d.kurtosis,
              ci: num.fmt(d.ciMean[0], 4) + ' ... ' + num.fmt(d.ciMean[1], 4),
              ciSd: num.fmt(d.ciSd[0], 4) + ' ... ' + num.fmt(d.ciSd[1], 4),
              desc: d
            };
          });
          var cols = [
            v.by ? { key: 'level', label: v.by } : { key: 'level', label: 'Gruppo' },
            { key: 'n', label: 'n', digits: 0 },
            { key: 'mean', label: 'Media', digits: 5 },
            { key: 'se', label: 'ES media', digits: 5 },
            { key: 'sd', label: 'Dev.st.', digits: 5 },
            { key: 'cv', label: 'CV%', digits: 2 },
            { key: 'min', label: 'Min', digits: 4 },
            { key: 'q1', label: 'Q1', digits: 4 },
            { key: 'median', label: 'Mediana', digits: 4 },
            { key: 'q3', label: 'Q3', digits: 4 },
            { key: 'max', label: 'Max', digits: 4 },
            { key: 'iqr', label: 'IQR', digits: 4 },
            { key: 'skew', label: 'Asimmetria', digits: 3 },
            { key: 'kurt', label: 'Curtosi', digits: 3 },
            { key: 'ci', label: 'IC ' + Math.round(conf() * 100) + '% media' },
            { key: 'ciSd', label: 'IC dev.st.' }
          ];
          L.right.appendChild(ui.panel('Statistiche descrittive - ' + varName, { sub: ds.name }, [
            ui.table(cols, rows),
            ui.exportBar(function () { return 'descrittive-' + varName; },
              function () { return ui.rowsToCSV(cols, rows); })
          ]));

          // riassunto grafico
          if (v.graph) {
            var box = h('div');
            L.right.appendChild(ui.panel('Riassunto grafico - ' + varName, null, box));
            var grid = h('div', { class: 'c3-grid-2' });
            box.appendChild(grid);
            var c1 = h('div'), c2 = h('div'), c3 = h('div'), c4 = h('div');
            [c1, c2, c3, c4].forEach(function (c) { grid.appendChild(c); });
            if (v.by) {
              C3.plots.boxplot(c1, groups, { title: varName + ' per ' + v.by, yLabel: varName, showPoints: groups.length <= 10 });
              C3.plots.individualValuePlot(c2, groups, { title: 'Valori individuali', yLabel: varName, xLabel: v.by });
              C3.plots.intervalPlot(c3, C3.anova.intervalPlotData(groups, { conf: conf() }),
                { title: 'Medie con IC ' + Math.round(conf() * 100) + '%', yLabel: varName, xLabel: v.by });
              C3.plots.histogram(c4, st.clean(ds.numeric(varName)), { name: varName, title: 'Istogramma complessivo' });
            } else {
              C3.plots.histogram(c1, groups[0].values, { name: varName, title: 'Istogramma con curva normale' });
              C3.plots.boxplot(c2, groups, { title: 'Boxplot', yLabel: varName });
              C3.plots.probabilityPlot(c3, groups[0].values, { name: varName });
              C3.chart.render(c4, {
                title: 'Valori nell ordine di raccolta',
                height: 240,
                x: { label: 'Osservazione' }, y: { label: varName },
                series: [{
                  type: 'line', name: varName, markerSize: 3,
                  points: groups[0].values.map(function (y, i) { return { x: i + 1, y: y }; })
                }],
                legend: false
              });
            }
          }

          // normalita
          if (v.normal) {
            var nRows = groups.map(function (g) {
              var ad = st.andersonDarling(g.values);
              var sw = st.shapiroWilk(g.values);
              var rj = st.ryanJoiner(g.values);
              return {
                level: g.level, n: g.values.length,
                ad: ad.A2, adp: ad.p, w: sw.W, wp: sw.p, r: rj.R, rp: rj.p,
                verdict: (ad.p >= alpha() ? 'compatibile con la normale' : 'si rifiuta la normalita')
              };
            });
            L.right.appendChild(ui.panel('Test di normalita - ' + varName, { sub: 'alpha = ' + alpha() }, [
              ui.table([
                { key: 'level', label: 'Gruppo' },
                { key: 'n', label: 'n', digits: 0 },
                { key: 'ad', label: 'Anderson-Darling A2', digits: 4 },
                { key: 'adp', label: 'p (AD)', html: true, format: function (x) { return ui.pValue(x, alpha()); } },
                { key: 'w', label: 'Shapiro-Wilk W', digits: 5 },
                { key: 'wp', label: 'p (SW)', html: true, format: function (x) { return ui.pValue(x, alpha()); } },
                { key: 'r', label: 'Ryan-Joiner R', digits: 5 },
                { key: 'rp', label: 'p (RJ)', html: true, format: function (x) { return ui.pValue(x, alpha()); } },
                { key: 'verdict', label: 'Esito' }
              ], nRows),
              ui.verdict('La normalita serve ai test parametrici e agli indici di capacita: se viene rifiutata, ' +
                'valuta una trasformazione (Box-Cox, Johnson), un metodo non parametrico oppure una distribuzione diversa.',
                nRows.every(function (r) { return r.adp >= alpha(); }) ? 'good' : 'warn')
            ]));
          }

          // outlier
          if (v.outliers) {
            var all = st.clean(ds.numeric(varName));
            var g1 = st.grubbs(all, alpha());
            var iq = st.iqrOutliers(all, 1.5);
            L.right.appendChild(ui.panel('Valori anomali - ' + varName, null, [
              ui.kv([
                ['Test di Grubbs G', g1 ? num.fmt(g1.G, 4) : '-'],
                ['Valore critico', g1 ? num.fmt(g1.crit, 4) : '-'],
                ['Valore sospetto', g1 ? num.fmt(g1.value, 5) : '-'],
                ['Esito Grubbs', g1 ? (g1.outlier ? '<b style="color:var(--critical)">valore anomalo rilevato</b>' : 'nessun valore anomalo') : '-'],
                ['Limiti IQR (1,5)', num.fmt(iq.lower, 4) + ' ... ' + num.fmt(iq.upper, 4)],
                ['Valori fuori dai limiti IQR', iq.outliers.length + (iq.outliers.length
                  ? ' (righe: ' + iq.outliers.slice(0, 12).map(function (o) { return o.index + 1; }).join(', ') + ')' : '')]
              ]),
              ui.verdict('Un valore anomalo non va eliminato per comodita: prima si cerca la causa ' +
                '(errore di misura, condizione speciale del processo). Se la causa e reale, il dato racconta qualcosa del processo.', 'warn')
            ]));
          }

          // identificazione distribuzione
          if (v.distid) {
            var xv = st.clean(ds.numeric(varName));
            var fits = C3.capability.bestDistribution(xv);
            var box2 = h('div');
            L.right.appendChild(ui.panel('Identificazione della distribuzione - ' + varName,
              { sub: 'ordinate per statistica di Anderson-Darling (piu bassa = adattamento migliore)' }, [
              ui.table([
                { key: 'label', label: 'Distribuzione' },
                { key: 'ad', label: 'AD', digits: 4 },
                { key: 'aic', label: 'AIC', digits: 2 },
                {
                  key: function (r) { return r.params.map(function (p) { return num.fmt(p, 4); }).join('; '); },
                  label: 'Parametri stimati'
                },
                {
                  key: 'p', label: 'p (solo normale)', html: true,
                  format: function (x) { return x == null ? '-' : ui.pValue(x, alpha()); }
                }
              ], fits),
              box2
            ]));
            var grid2 = h('div', { class: 'c3-grid-2' });
            box2.appendChild(grid2);
            fits.slice(0, 4).forEach(function (fit) {
              var c = h('div');
              grid2.appendChild(c);
              C3.plots.probabilityPlot(c, xv, {
                dist: C3.dist.continuous[fit.key], params: fit.params,
                name: varName, title: fit.label, height: 250
              });
            });
            // trasformazioni
            var lam = st.boxCoxLambda(xv);
            var jh = st.johnson(xv);
            L.right.appendChild(ui.panel('Trasformazioni verso la normalita', null, ui.kv([
              ['Box-Cox lambda ottimale', isFinite(lam) ? num.fmt(lam, 4) : 'non applicabile (servono valori positivi)'],
              ['Box-Cox: p di normalita dopo trasformazione', isFinite(lam)
                ? num.fmtP(st.andersonDarling(st.boxCox(xv.filter(function (x) { return x > 0; }), lam)).p) : '-'],
              ['Famiglia di Johnson migliore', jh ? jh.family + ' (' + jh.fit.label + ')' : '-'],
              ['Johnson: p di normalita dopo trasformazione', jh ? num.fmtP(jh.ad.p) : '-']
            ])));
          }
        });
      }
      run();
    }
  });

  /* ==================================================================
     TEST DI IPOTESI
     ================================================================== */
  var TESTS = [
    { value: 't1', label: 't a 1 campione (media vs valore di riferimento)' },
    { value: 'z1', label: 'z a 1 campione (sigma nota)' },
    { value: 't2', label: 't a 2 campioni (confronto di due medie)' },
    { value: 'tp', label: 't appaiato (misure abbinate)' },
    { value: 'tost', label: 'Equivalenza (TOST)' },
    { value: 'var1', label: 'Test su 1 varianza' },
    { value: 'var2', label: 'Test su 2 varianze (F e Levene)' },
    { value: 'p1', label: 'Test su 1 proporzione' },
    { value: 'p2', label: 'Test su 2 proporzioni' },
    { value: 'pois1', label: 'Test su 1 tasso di Poisson' },
    { value: 'pois2', label: 'Test su 2 tassi di Poisson' },
    { value: 'wilcox', label: 'Wilcoxon signed-rank (non parametrico, 1 campione)' },
    { value: 'sign', label: 'Test dei segni (non parametrico, 1 campione)' },
    { value: 'mw', label: 'Mann-Whitney (non parametrico, 2 campioni)' },
    { value: 'ks', label: 'Kolmogorov-Smirnov (2 distribuzioni)' },
    { value: 'runs', label: 'Runs test (casualita della sequenza)' },
    { value: 'chi2', label: 'Chi-quadro di associazione (tabella di contingenza)' },
    { value: 'gof', label: 'Chi-quadro di adattamento' }
  ];

  C3.app.registerView({
    id: 'test',
    label: 'Test di ipotesi',
    icon: '✓',
    group: 'Analisi',
    desc: 'Test parametrici e non parametrici su medie, varianze, proporzioni, tassi e tabelle di contingenza, con intervalli di confidenza e interpretazione.',
    render: function (el) {
      var ds = needData(el);
      if (!ds) return;
      var numCols = ds.numericColumns(), catCols = ds.categoricalColumns();
      var L = splitLayout(el);

      var f = ui.form([
        { id: 'test', type: 'select', label: 'Test', options: TESTS },
        {
          id: 'var1', type: 'select', label: 'Variabile', options: numCols,
          when: function (v) { return ['p1', 'p2', 'pois1', 'pois2', 'chi2', 'gof'].indexOf(v.test) < 0; }
        },
        {
          id: 'var2', type: 'select', label: 'Seconda variabile', options: numCols,
          when: function (v) { return ['tp', 'ks'].indexOf(v.test) >= 0; }
        },
        {
          id: 'by', type: 'select', label: 'Colonna di gruppo (2 livelli)',
          options: [{ value: '', label: '(usa due colonne)' }].concat(catCols),
          when: function (v) { return ['t2', 'var2', 'mw'].indexOf(v.test) >= 0; }
        },
        {
          id: 'var2b', type: 'select', label: 'Seconda variabile (se non usi i gruppi)', options: numCols,
          when: function (v) { return ['t2', 'var2', 'mw'].indexOf(v.test) >= 0; }
        },
        {
          id: 'rowVar', type: 'select', label: 'Variabile di riga', options: catCols,
          when: function (v) { return v.test === 'chi2'; }
        },
        {
          id: 'colVar', type: 'select', label: 'Variabile di colonna', options: catCols,
          when: function (v) { return v.test === 'chi2'; }
        },
        {
          id: 'gofVar', type: 'select', label: 'Variabile categorica', options: catCols,
          when: function (v) { return v.test === 'gof'; }
        },
        {
          id: 'h0', type: 'number', label: 'Valore ipotizzato (H0)', value: 0,
          when: function (v) { return ['t1', 'z1', 'wilcox', 'sign', 'tp', 't2'].indexOf(v.test) >= 0; }
        },
        {
          id: 'sigma', type: 'number', label: 'Sigma nota', value: 1,
          when: function (v) { return v.test === 'z1'; }
        },
        {
          id: 'sigma0', type: 'number', label: 'Deviazione standard ipotizzata', value: 1,
          when: function (v) { return v.test === 'var1'; }
        },
        {
          id: 'pooled', type: 'checkbox', label: 'Assumi varianze uguali (t pooled)', value: false,
          when: function (v) { return v.test === 't2'; }
        },
        {
          id: 'x1', type: 'number', label: 'Successi campione 1', value: 45,
          when: function (v) { return ['p1', 'p2'].indexOf(v.test) >= 0; }
        },
        {
          id: 'n1', type: 'number', label: 'Prove campione 1', value: 100,
          when: function (v) { return ['p1', 'p2'].indexOf(v.test) >= 0; }
        },
        {
          id: 'x2', type: 'number', label: 'Successi campione 2', value: 30,
          when: function (v) { return v.test === 'p2'; }
        },
        {
          id: 'n2', type: 'number', label: 'Prove campione 2', value: 100,
          when: function (v) { return v.test === 'p2'; }
        },
        {
          id: 'p0', type: 'number', label: 'Proporzione ipotizzata', value: 0.5, step: 0.01,
          when: function (v) { return v.test === 'p1'; }
        },
        {
          id: 'c1', type: 'number', label: 'Eventi campione 1', value: 10,
          when: function (v) { return ['pois1', 'pois2'].indexOf(v.test) >= 0; }
        },
        {
          id: 'e1', type: 'number', label: 'Esposizione campione 1', value: 5,
          when: function (v) { return ['pois1', 'pois2'].indexOf(v.test) >= 0; }
        },
        {
          id: 'rate0', type: 'number', label: 'Tasso ipotizzato', value: 1.5,
          when: function (v) { return v.test === 'pois1'; }
        },
        {
          id: 'c2', type: 'number', label: 'Eventi campione 2', value: 6,
          when: function (v) { return v.test === 'pois2'; }
        },
        {
          id: 'e2', type: 'number', label: 'Esposizione campione 2', value: 5,
          when: function (v) { return v.test === 'pois2'; }
        },
        {
          id: 'low', type: 'number', label: 'Limite inferiore di equivalenza', value: -1,
          when: function (v) { return v.test === 'tost'; }
        },
        {
          id: 'high', type: 'number', label: 'Limite superiore di equivalenza', value: 1,
          when: function (v) { return v.test === 'tost'; }
        },
        {
          id: 'alt', type: 'select', label: 'Ipotesi alternativa', options: [
            { value: 'two', label: 'diverso da H0 (bilaterale)' },
            { value: 'greater', label: 'maggiore di H0' },
            { value: 'less', label: 'minore di H0' }
          ]
        },
        { id: 'yates', type: 'checkbox', label: 'Correzione di Yates (tabelle 2x2)', value: false, when: function (v) { return v.test === 'chi2'; } }
      ], function () { run(); });

      L.left.appendChild(h('h3', null, 'Impostazioni'));
      L.left.appendChild(f.el);
      L.left.appendChild(h('div', { class: 'small muted', text: 'Livello di significativita alpha = ' + alpha() + ' (modificabile nella barra in alto).' }));

      function twoSamples(v) {
        if (v.by) {
          var g = st.groupBy(ds.numeric(v.var1), ds.col(v.by));
          if (g.length < 2) throw new Error('La colonna di gruppo deve avere almeno 2 livelli.');
          return { a: g[0].values, b: g[1].values, nameA: String(g[0].level), nameB: String(g[1].level) };
        }
        return {
          a: st.clean(ds.numeric(v.var1)), b: st.clean(ds.numeric(v.var2b)),
          nameA: v.var1, nameB: v.var2b
        };
      }

      function run() {
        ui.clear(L.right);
        var v = f.values();
        var opts = { alt: v.alt, conf: conf() };
        try {
          var out;
          switch (v.test) {
            case 't1': out = resultPanel(T.tTest1(ds.numeric(v.var1), v.h0, opts), v); break;
            case 'z1': out = resultPanel(T.zTest1(ds.numeric(v.var1), v.h0, v.sigma, opts), v); break;
            case 't2': {
              var s = twoSamples(v);
              var r = T.tTest2(s.a, s.b, Object.assign({ pooled: v.pooled, diff: v.h0 }, opts));
              r.__names = [s.nameA, s.nameB];
              out = resultPanel(r, v, s);
              break;
            }
            case 'tp': out = resultPanel(T.tTestPaired(ds.numeric(v.var1), ds.numeric(v.var2), opts), v); break;
            case 'tost': {
              var s2 = twoSamples(v);
              out = resultPanel(T.tost(s2.a, s2.b, v.low, v.high, { alpha: alpha() }), v, s2);
              break;
            }
            case 'var1': out = resultPanel(T.varTest1(ds.numeric(v.var1), v.sigma0, opts), v); break;
            case 'var2': {
              var s3 = twoSamples(v);
              out = resultPanel(T.varTest2(s3.a, s3.b, opts), v, s3);
              break;
            }
            case 'p1': out = resultPanel(T.propTest1(v.x1, v.n1, v.p0, opts), v); break;
            case 'p2': out = resultPanel(T.propTest2(v.x1, v.n1, v.x2, v.n2, opts), v); break;
            case 'pois1': out = resultPanel(T.poissonTest1(v.c1, v.e1, v.rate0, opts), v); break;
            case 'pois2': out = resultPanel(T.poissonTest2(v.c1, v.e1, v.c2, v.e2, opts), v); break;
            case 'wilcox': out = resultPanel(T.wilcoxonSigned(ds.numeric(v.var1), v.h0, opts), v); break;
            case 'sign': out = resultPanel(T.signTest(ds.numeric(v.var1), v.h0, opts), v); break;
            case 'mw': {
              var s4 = twoSamples(v);
              out = resultPanel(T.mannWhitney(s4.a, s4.b, opts), v, s4);
              break;
            }
            case 'ks': out = resultPanel(T.ks2(ds.numeric(v.var1), ds.numeric(v.var2)), v); break;
            case 'runs': out = resultPanel(T.runsTest(ds.numeric(v.var1)), v); break;
            case 'chi2': {
              var rowLevels = ds.levels(v.rowVar), colLevels = ds.levels(v.colVar);
              var tab = rowLevels.map(function () { return colLevels.map(function () { return 0; }); });
              for (var i = 0; i < ds.nrows; i++) {
                var rv = String(ds.column(v.rowVar).values[i]);
                var cv = String(ds.column(v.colVar).values[i]);
                var ri = rowLevels.indexOf(rv), ci = colLevels.indexOf(cv);
                if (ri >= 0 && ci >= 0) tab[ri][ci]++;
              }
              var res = T.chiSquareTable(tab, { yates: v.yates });
              res.__rowLevels = rowLevels;
              res.__colLevels = colLevels;
              res.__rowVar = v.rowVar;
              res.__colVar = v.colVar;
              out = contingencyPanel(res);
              break;
            }
            case 'gof': {
              var freq = st.frequency(ds.col(v.gofVar));
              var obs = freq.rows.map(function (r) { return r.count; });
              var res2 = T.chiSquareGOF(obs);
              res2.__levels = freq.rows.map(function (r) { return r.level; });
              out = gofPanel(res2);
              break;
            }
          }
          if (out) out.forEach(function (o) { L.right.appendChild(o); });
        } catch (e) {
          console.error(e);
          L.right.appendChild(ui.verdict('Non riesco a eseguire il test: ' + e.message, 'bad'));
        }
      }

      /** Pannello generico di risultato per i test. */
      function resultPanel(r, v, samples) {
        var pairs = [];
        var pv = r.p;
        function add(label, value, digits) { pairs.push([label, value, digits]); }
        if (r.n != null) add('n', r.n, 0);
        if (r.n1 != null) add('n1 / n2', r.n1 + ' / ' + r.n2);
        if (r.mean != null) add('Media campionaria', r.mean, 5);
        if (r.mean1 != null) add('Media 1 / Media 2', num.fmt(r.mean1, 5) + ' / ' + num.fmt(r.mean2, 5));
        if (r.sd != null) add('Deviazione standard', r.sd, 5);
        if (r.sd1 != null) add('Dev.st. 1 / 2', num.fmt(r.sd1, 5) + ' / ' + num.fmt(r.sd2, 5));
        if (r.diff != null) add('Differenza stimata', r.diff, 5);
        if (r.se != null) add('Errore standard', r.se, 5);
        if (r.df != null) add('Gradi di liberta', r.df, 3);
        if (r.t != null) add('Statistica t', r.t, 4);
        if (r.z != null) add('Statistica z', r.z, 4);
        if (r.chisq != null) add('Statistica chi-quadro', r.chisq, 4);
        if (r.F != null) add('Statistica F', r.F, 4);
        if (r.W != null) add('Statistica W', r.W, 4);
        if (r.U != null) add('Statistica U', r.U, 4);
        if (r.D != null) add('Statistica D', r.D, 4);
        if (r.runs != null) add('Sequenze osservate / attese', num.fmt(r.runs, 0) + ' / ' + num.fmt(r.expected, 2));
        if (r.phat != null) add('Proporzione stimata', r.phat, 5);
        if (r.p1 != null) add('p1 / p2', num.fmt(r.p1, 5) + ' / ' + num.fmt(r.p2, 5));
        if (r.rate != null) add('Tasso stimato', r.rate, 5);
        if (r.rate1 != null) add('Tasso 1 / 2', num.fmt(r.rate1, 5) + ' / ' + num.fmt(r.rate2, 5));
        if (r.median != null) add('Mediana', r.median, 5);
        if (r.median1 != null) add('Mediana 1 / 2', num.fmt(r.median1, 5) + ' / ' + num.fmt(r.median2, 5));
        if (r.hodgesLehmann != null) add('Stima di Hodges-Lehmann', r.hodgesLehmann, 5);
        if (r.ci) add('IC ' + Math.round((r.conf || conf()) * 100) + '%', num.fmt(r.ci[0], 5) + ' ... ' + num.fmt(r.ci[1], 5));
        if (r.ciSd) add('IC dev.st.', num.fmt(r.ciSd[0], 5) + ' ... ' + num.fmt(r.ciSd[1], 5));
        if (r.ciWilson) add('IC Wilson', num.fmt(r.ciWilson[0], 5) + ' ... ' + num.fmt(r.ciWilson[1], 5));
        if (r.ciExact) add('IC esatto (Clopper-Pearson)', num.fmt(r.ciExact[0], 5) + ' ... ' + num.fmt(r.ciExact[1], 5));
        if (r.ciRatio) add('IC rapporto varianze', num.fmt(r.ciRatio[0], 5) + ' ... ' + num.fmt(r.ciRatio[1], 5));
        if (r.cohenD != null) add('Dimensione dell effetto (d di Cohen)', r.cohenD, 3);
        if (r.effect != null) add('Dimensione dell effetto', r.effect, 3);
        if (r.oddsRatio != null && isFinite(r.oddsRatio)) add('Odds ratio', r.oddsRatio, 4);
        if (r.relativeRisk != null && isFinite(r.relativeRisk)) add('Rischio relativo', r.relativeRisk, 4);
        if (r.pExact != null) add('p esatto', num.fmtP(r.pExact));
        if (r.pFisher != null) add('p di Fisher', num.fmtP(r.pFisher));
        if (r.levene) add('Levene (varianze uguali) p', num.fmtP(r.levene.p));
        add('<b>p-value</b>', '<b>' + num.fmtP(pv) + '</b>');

        var decision = pv < alpha()
          ? 'Con alpha = ' + alpha() + ' <b>si rifiuta H0</b>: la differenza osservata non e spiegabile dal solo caso.'
          : 'Con alpha = ' + alpha() + ' <b>non si rifiuta H0</b>: i dati non forniscono prove sufficienti della differenza.';
        if (r.equivalent !== undefined) {
          decision = r.equivalent
            ? 'I due gruppi sono <b>equivalenti</b> entro i limiti indicati (entrambi i test unilaterali sono significativi).'
            : 'Non si puo concludere l equivalenza: almeno un test unilaterale non e significativo.';
        }

        var parts = [ui.panel(r.title, { sub: r.alt ? altLabel(r.alt) : null }, [
          ui.kv(pairs),
          ui.verdict(decision, pv < alpha() ? 'bad' : 'good'),
          powerNote(r, v)
        ])];

        // grafico di supporto
        var box = h('div');
        var chartPanel = ui.panel('Grafico di supporto', null, box);
        try {
          if (samples) {
            C3.plots.boxplot(box, [
              { level: samples.nameA, values: samples.a },
              { level: samples.nameB, values: samples.b }
            ], { title: 'Confronto dei due campioni', showPoints: true, yLabel: v.var1 });
            var hist = h('div');
            box.appendChild(hist);
            C3.chart.render(hist, {
              title: 'Distribuzioni sovrapposte',
              height: 260,
              x: { label: v.var1 }, y: { label: 'Densita' },
              series: [samples.a, samples.b].map(function (arr, i) {
                var k = st.kde(arr);
                return {
                  type: 'area', name: i === 0 ? samples.nameA : samples.nameB,
                  points: k.map(function (p) { return { x: p.x, y: p.y, y1: p.y, y0: 0 }; }),
                  color: C3.chart.seriesColor(i), opacity: 0.2, marker: false
                };
              })
            });
          } else if (r.differences) {
            C3.plots.histogram(box, r.differences, { name: 'Differenza', title: 'Distribuzione delle differenze appaiate' });
            var b2 = h('div');
            box.appendChild(b2);
            C3.plots.probabilityPlot(b2, r.differences, { name: 'Differenza', height: 260 });
          } else if (v.var1 && ['p1', 'p2', 'pois1', 'pois2'].indexOf(v.test) < 0) {
            C3.plots.histogram(box, ds.numeric(v.var1), {
              name: v.var1, title: 'Distribuzione con valore ipotizzato',
              lines: r.mu0 != null ? [{ value: r.mu0, label: 'H0 = ' + r.mu0, kind: 'spec' }] : []
            });
          } else {
            chartPanel = null;
          }
        } catch (e) { chartPanel = null; }
        if (chartPanel) parts.push(chartPanel);
        return parts;
      }

      function powerNote(r, v) {
        try {
          if (v.test === 't1' && r.n > 1) {
            var pw = C3.power.tPower1(r.n, Math.abs(r.mean - r.mu0), r.sd, alpha(), v.alt);
            return h('div', { class: 'small muted', html: 'Potenza del test per l effetto osservato: <b>' +
              num.fmt(100 * pw, 1) + '%</b>. Differenza rilevabile con potenza 0,80: ' +
              num.fmt(C3.power.compute({ test: 't1', n: r.n, sigma: r.sd, power: 0.8, alt: v.alt }).delta, 4) + '.' });
          }
          if (v.test === 't2' && r.n1 > 1) {
            var sp = r.sPooled || Math.sqrt((r.sd1 * r.sd1 + r.sd2 * r.sd2) / 2);
            var pw2 = C3.power.tPower2(r.n1, r.n2, Math.abs(r.diff), sp, alpha(), v.alt);
            return h('div', { class: 'small muted', html: 'Potenza del test per la differenza osservata: <b>' +
              num.fmt(100 * pw2, 1) + '%</b>.' });
          }
        } catch (e) { /* nessuna nota */ }
        return null;
      }

      function altLabel(a) {
        return a === 'two' ? 'ipotesi alternativa bilaterale'
          : (a === 'greater' ? 'ipotesi alternativa: maggiore' : 'ipotesi alternativa: minore');
      }

      function contingencyPanel(res) {
        var rowLevels = res.__rowLevels, colLevels = res.__colLevels;
        var rows = rowLevels.map(function (rl, i) {
          var o = { level: rl };
          colLevels.forEach(function (cl, j) {
            o[cl] = res.observed[i][j] + ' (' + num.fmt(res.expected[i][j], 1) + ')';
            o['__c' + j] = res.contributions[i][j];
          });
          o.total = res.rowTotals[i];
          return o;
        });
        var cols = [{ key: 'level', label: res.__rowVar }]
          .concat(colLevels.map(function (cl) { return { key: cl, label: cl, align: 'right' }; }))
          .concat([{ key: 'total', label: 'Totale', digits: 0 }]);
        var cells = [];
        rowLevels.forEach(function (rl, i) {
          colLevels.forEach(function (cl, j) {
            cells.push({
              x: j, y: rowLevels.length - 1 - i, value: res.contributions[i][j],
              xLabel: cl, yLabel: rl, text: num.fmt(res.contributions[i][j], 2)
            });
          });
        });
        var heat = h('div');
        var height = Math.max(220, 60 + rowLevels.length * 34);
        C3.chart.render(heat, {
          title: 'Contributi al chi-quadro (residui standardizzati)',
          height: height,
          margin: { left: 110, bottom: 70, top: 8, right: 16 },
          x: { type: 'band', categories: colLevels, rotate: -25, label: res.__colVar },
          y: {
            domain: [-0.5, rowLevels.length - 0.5], ticks: rowLevels.length, gridlines: false,
            format: function (v) { return rowLevels[rowLevels.length - 1 - Math.round(v)] || ''; }
          },
          series: [{
            type: 'heat', cells: cells, diverging: true, cellLabels: true,
            cellHeight: (height - 80) / rowLevels.length, name: 'residuo'
          }],
          legend: false
        });
        return [ui.panel(res.title, { sub: 'osservati (attesi)' }, [
          ui.table(cols, rows),
          ui.kv([
            ['Chi-quadro', res.chisq, 4],
            ['Gradi di liberta', res.df, 0],
            ['p-value', '<b>' + num.fmtP(res.p) + '</b>'],
            ['Rapporto di verosimiglianza G2', res.likelihoodRatio, 4],
            ['p (G2)', num.fmtP(res.pLR)],
            ['V di Cramer (forza dell associazione)', res.cramerV, 4],
            ['Frequenza attesa minima', res.minExpected, 2],
            ['% celle con attesa < 5', res.pctSmallExpected, 1]
          ]),
          res.minExpected < 5
            ? ui.verdict('Attenzione: alcune frequenze attese sono inferiori a 5, il chi-quadro perde validita. ' +
              'Accorpa le categorie oppure usa il test esatto di Fisher (per tabelle 2x2).', 'warn')
            : null,
          ui.verdict(res.p < alpha()
            ? 'Le due variabili <b>non sono indipendenti</b>: esiste associazione.'
            : 'Non emerge associazione significativa fra le due variabili.', res.p < alpha() ? 'bad' : 'good'),
          heat
        ].filter(Boolean))];
      }

      function gofPanel(res) {
        var rows = res.__levels.map(function (L, i) {
          return {
            level: L, obs: res.observed[i], exp: res.expected[i],
            contrib: Math.pow(res.observed[i] - res.expected[i], 2) / res.expected[i]
          };
        });
        return [ui.panel(res.title, { sub: 'confronto con distribuzione uniforme' }, [
          ui.table([
            { key: 'level', label: 'Categoria' },
            { key: 'obs', label: 'Osservati', digits: 0 },
            { key: 'exp', label: 'Attesi', digits: 2 },
            { key: 'contrib', label: 'Contributo al chi-quadro', digits: 3 }
          ], rows),
          ui.kv([
            ['Chi-quadro', res.chisq, 4], ['Gradi di liberta', res.df, 0],
            ['p-value', '<b>' + num.fmtP(res.p) + '</b>']
          ]),
          ui.verdict(res.p < alpha()
            ? 'Le frequenze osservate <b>differiscono</b> da quelle attese.'
            : 'Le frequenze osservate sono compatibili con quelle attese.', res.p < alpha() ? 'bad' : 'good')
        ])];
      }

      run();
    }
  });

  /* ==================================================================
     ANOVA
     ================================================================== */
  C3.app.registerView({
    id: 'anova',
    label: 'ANOVA e confronti',
    icon: '≡',
    group: 'Analisi',
    desc: 'Analisi della varianza a una via e fattoriale, confronti multipli (Tukey, Fisher, Bonferroni, Dunnett, Games-Howell), alternative non parametriche e componenti della varianza.',
    render: function (el) {
      var ds = needData(el);
      if (!ds) return;
      var numCols = ds.numericColumns(), catCols = ds.categoricalColumns();
      if (!numCols.length || !catCols.length) {
        el.appendChild(ui.verdict('Serve almeno una colonna numerica (risposta) e una categorica (fattore).', 'warn'));
        return;
      }
      var L = splitLayout(el);
      var f = ui.form([
        {
          id: 'mode', type: 'chips', label: 'Modello', value: 'one', options: [
            { value: 'one', label: 'Una via' },
            { value: 'factorial', label: 'Fattoriale / piu fattori' },
            { value: 'np', label: 'Non parametrico' },
            { value: 'varcomp', label: 'Componenti della varianza' }
          ]
        },
        { id: 'y', type: 'select', label: 'Risposta', options: numCols },
        {
          id: 'factor', type: 'select', label: 'Fattore', options: catCols,
          when: function (v) { return v.mode === 'one' || v.mode === 'np'; }
        },
        {
          id: 'factors', type: 'multiselect', label: 'Fattori', options: catCols, size: 5,
          value: catCols.slice(0, Math.min(2, catCols.length)),
          when: function (v) { return v.mode === 'factorial'; }
        },
        {
          id: 'covariates', type: 'multiselect', label: 'Covariate (ANCOVA)', options: numCols, size: 4,
          when: function (v) { return v.mode === 'factorial'; }
        },
        {
          id: 'interactions', type: 'checkbox', label: 'Includi le interazioni', value: true,
          when: function (v) { return v.mode === 'factorial'; }
        },
        {
          id: 'factorA', type: 'select', label: 'Fattore A', options: catCols,
          when: function (v) { return v.mode === 'varcomp'; }
        },
        {
          id: 'factorB', type: 'select', label: 'Fattore B', options: catCols,
          when: function (v) { return v.mode === 'varcomp'; }
        },
        {
          id: 'nested', type: 'checkbox', label: 'B annidato in A', value: false,
          when: function (v) { return v.mode === 'varcomp'; }
        },
        {
          id: 'compare', type: 'select', label: 'Confronti multipli', options: [
            { value: 'tukey', label: 'Tukey (tutte le coppie)' },
            { value: 'fisher', label: 'Fisher LSD' },
            { value: 'bonferroni', label: 'Bonferroni' },
            { value: 'sidak', label: 'Sidak' },
            { value: 'gh', label: 'Games-Howell (varianze diverse)' },
            { value: 'dunnett', label: 'Dunnett (vs controllo)' }
          ], when: function (v) { return v.mode === 'one'; }
        },
        {
          id: 'control', type: 'select', label: 'Livello di controllo', options: catCols.length ? ds.levels(catCols[0]) : [],
          when: function (v) { return v.mode === 'one' && v.compare === 'dunnett'; }
        },
        {
          id: 'nptest', type: 'select', label: 'Test non parametrico', options: [
            { value: 'kw', label: 'Kruskal-Wallis' },
            { value: 'mood', label: 'Mediana di Mood' }
          ], when: function (v) { return v.mode === 'np'; }
        }
      ], function (v, changed, api) {
        if (changed === 'factor' && v.factor) api.setOptions('control', ds.levels(v.factor));
        run();
      });
      L.left.appendChild(h('h3', null, 'Modello'));
      L.left.appendChild(f.el);

      function run() {
        ui.clear(L.right);
        var v = f.values();
        try {
          if (v.mode === 'one') oneWay(v);
          else if (v.mode === 'factorial') factorial(v);
          else if (v.mode === 'np') nonParametric(v);
          else varComponents(v);
        } catch (e) {
          console.error(e);
          L.right.appendChild(ui.verdict('Analisi non eseguibile: ' + e.message, 'bad'));
        }
      }

      function oneWay(v) {
        var groups = st.groupBy(ds.numeric(v.y), ds.col(v.factor));
        if (groups.length < 2) throw new Error('Il fattore deve avere almeno 2 livelli.');
        var r = C3.anova.oneWay(groups, {
          conf: conf(), compare: v.compare, control: v.control
        });
        L.right.appendChild(ui.panel('ANOVA a una via: ' + v.y + ' per ' + v.factor, { sub: r.N + ' osservazioni, ' + r.k + ' livelli' }, [
          ui.anovaTable([
            { source: v.factor, df: r.df.between, ss: r.ss.between, ms: r.ms.between, F: r.F, p: r.p },
            { source: 'Errore', df: r.df.within, ss: r.ss.within, ms: r.ms.within, F: null, p: null },
            { source: 'Totale', df: r.df.total, ss: r.ss.total, ms: null, F: null, p: null }
          ], { alpha: alpha() }),
          ui.kv([
            ['Dev.st. combinata (S)', r.sPooled, 5],
            ['R-quadro', num.fmt(100 * r.r2, 2) + '%'],
            ['R-quadro corretto', num.fmt(100 * r.r2adj, 2) + '%'],
            ['Eta quadro (quota di varianza spiegata)', num.fmt(100 * r.etaSq, 2) + '%'],
            ['Omega quadro (stima meno distorta)', num.fmt(100 * r.omegaSq, 2) + '%'],
            ['ANOVA di Welch (varianze diverse) F', num.fmt(r.welch.F, 4) + ', p = ' + num.fmtP(r.welch.p)],
            ['Test di uguaglianza delle varianze', 'Levene p = ' + num.fmtP(r.levene.p) + ', Bartlett p = ' + num.fmtP(r.bartlett.p)]
          ]),
          ui.verdict(r.p < alpha()
            ? 'Almeno una media di gruppo <b>differisce</b> dalle altre (p = ' + num.fmtP(r.p) + '). Guarda i confronti multipli per capire quali.'
            : 'Non emergono differenze significative fra le medie dei gruppi (p = ' + num.fmtP(r.p) + ').',
            r.p < alpha() ? 'bad' : 'good'),
          r.levene.p < alpha()
            ? ui.verdict('Le varianze non sono uguali (Levene p = ' + num.fmtP(r.levene.p) + '): usa il risultato di Welch e i confronti di Games-Howell.', 'warn')
            : null
        ].filter(Boolean)));

        // statistiche di gruppo
        L.right.appendChild(ui.panel('Statistiche per livello', null,
          ui.table([
            { key: 'level', label: v.factor },
            { key: 'n', label: 'n', digits: 0 },
            { key: 'mean', label: 'Media', digits: 5 },
            { key: 'sd', label: 'Dev.st.', digits: 5 },
            {
              key: function (r2) { return num.fmt(r2.ciPooled[0], 4) + ' ... ' + num.fmt(r2.ciPooled[1], 4); },
              label: 'IC ' + Math.round(conf() * 100) + '% (sigma combinata)'
            }
          ], r.rows)));

        // confronti multipli
        if (r.comparisons && r.comparisons.pairs.length) {
          var cmpBox = h('div');
          L.right.appendChild(ui.panel('Confronti multipli', { sub: r.comparisons.pairs[0].method }, [
            ui.table([
              { key: function (p) { return p.a + ' - ' + p.b; }, label: 'Coppia' },
              { key: 'diff', label: 'Differenza', digits: 5 },
              { key: 'se', label: 'ES', digits: 5 },
              { key: function (p) { return num.fmt(p.ci[0], 4) + ' ... ' + num.fmt(p.ci[1], 4); }, label: 'IC simultaneo' },
              { key: 'p', label: 'p corretto', html: true, format: function (x) { return ui.pValue(x, alpha()); } },
              {
                key: 'significant', label: 'Significativo', html: true,
                format: function (x) { return x ? '<span class="badge bad">si</span>' : '<span class="badge">no</span>'; }
              }
            ], r.comparisons.pairs),
            cmpBox
          ]));
          C3.plots.comparisonPlot(cmpBox, r.comparisons, {});
        }

        // grafici
        var gbox = h('div', { class: 'c3-grid-2' });
        L.right.appendChild(ui.panel('Grafici', null, gbox));
        var g1 = h('div'), g2 = h('div'), g3 = h('div'), g4 = h('div');
        [g1, g2, g3, g4].forEach(function (x) { gbox.appendChild(x); });
        C3.plots.boxplot(g1, groups, { title: v.y + ' per ' + v.factor, yLabel: v.y, showPoints: groups.length <= 10 });
        C3.plots.intervalPlot(g2, r.rows.map(function (x) {
          return { level: x.level, mean: x.mean, lower: x.ciPooled[0], upper: x.ciPooled[1], n: x.n };
        }), { title: 'Medie con IC', yLabel: v.y, xLabel: v.factor, grandMean: r.grandMean });
        C3.plots.individualValuePlot(g3, groups, { title: 'Valori individuali', yLabel: v.y, xLabel: v.factor });
        // residui
        var fitVals = [], resid = [];
        groups.forEach(function (g) {
          var m = st.mean(g.values);
          g.values.forEach(function (y) { fitVals.push(m); resid.push(y - m); });
        });
        C3.plots.probabilityPlot(g4, resid, { name: 'Residuo', title: 'Normalita dei residui', height: 280 });
      }

      function factorial(v) {
        if (!v.factors.length) throw new Error('Seleziona almeno un fattore.');
        var fit = C3.anova.factorialAnova({
          data: ds.asObject(), y: v.y, factors: v.factors,
          covariates: v.covariates, interactions: v.interactions
        });
        var rowsAdj = fit.anovaAdj.map(function (r) {
          return { source: r.label, df: r.df, ss: r.ss, ms: r.ms, F: r.F, p: r.p };
        });
        rowsAdj.push({ source: 'Errore', df: fit.dfe, ss: fit.sse, ms: fit.mse, F: null, p: null });
        rowsAdj.push({ source: 'Totale', df: fit.dfe + fit.dfm, ss: fit.sst, ms: null, F: null, p: null });
        L.right.appendChild(ui.panel('ANOVA fattoriale: ' + v.y, { sub: 'SS adattate (tipo III)' }, [
          ui.anovaTable(rowsAdj, { alpha: alpha() }),
          ui.kv([
            ['S (dev.st. dell errore)', fit.s, 5],
            ['R-quadro', num.fmt(100 * fit.r2, 2) + '%'],
            ['R-quadro corretto', num.fmt(100 * fit.r2adj, 2) + '%'],
            ['R-quadro previsto (PRESS)', num.fmt(100 * fit.r2press, 2) + '%']
          ]),
          ui.collapsible('SS sequenziali (tipo I)',
            ui.anovaTable(fit.anovaSeq.map(function (r) {
              return { source: r.label, df: r.df, ss: r.ss, ms: r.ms, F: r.F, p: r.p };
            }), { alpha: alpha() }), false),
          ui.verdict(rowsAdj.some(function (r) { return r.p != null && r.p < alpha(); })
            ? 'Alcuni termini sono significativi. Se un interazione e significativa, interpreta gli effetti principali solo dentro i livelli dell altro fattore.'
            : 'Nessun termine risulta significativo con alpha = ' + alpha() + '.',
            'good')
        ]));
        L.right.appendChild(ui.panel('Coefficienti del modello', null, ui.coefTable(fit, { alpha: alpha() })));

        // medie marginali e grafici
        var gbox = h('div', { class: 'c3-grid-2' });
        L.right.appendChild(ui.panel('Medie marginali stimate e grafici', null, gbox));
        v.factors.forEach(function (fac) {
          var lsm = fit.means[fac];
          if (!lsm) return;
          var c = h('div');
          gbox.appendChild(c);
          C3.plots.intervalPlot(c, lsm.map(function (m) {
            return { level: m.level, mean: m.mean, lower: m.ci[0], upper: m.ci[1] };
          }), { title: 'Effetto principale: ' + fac, yLabel: v.y, xLabel: fac });
        });
        // interazioni
        if (v.factors.length >= 2) {
          var analysis = {
            interactions: C3.doe.analyzeFactorial ? null : null
          };
          var intBox = h('div');
          L.right.appendChild(ui.panel('Grafici di interazione', null, intBox));
          var pseudo = {
            interactions: (function () {
              var out = [];
              for (var i = 0; i < v.factors.length; i++) {
                for (var j = i + 1; j < v.factors.length; j++) {
                  var fa = v.factors[i], fb = v.factors[j];
                  var combo = ds.col(fa).map(function (x, idx) { return String(x) + '' + String(ds.col(fb)[idx]); });
                  var g = st.groupBy(ds.numeric(v.y), combo);
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
            })(),
            response: v.y
          };
          C3.plots.interactionPlots(intBox, pseudo, {});
        }
        // residui
        var resBox = h('div');
        L.right.appendChild(ui.panel('Diagnostica dei residui', null, resBox));
        C3.plots.residualPlots(resBox, fit, {});
      }

      function nonParametric(v) {
        var groups = st.groupBy(ds.numeric(v.y), ds.col(v.factor));
        if (v.nptest === 'mood') {
          var m = T.moodsMedian(groups);
          L.right.appendChild(ui.panel(m.title, { sub: 'mediana generale = ' + num.fmt(m.grandMedian, 5) }, [
            ui.table([
              { key: 'level', label: v.factor },
              { key: 'n', label: 'n', digits: 0 },
              { key: 'above', label: '> mediana', digits: 0 },
              { key: 'belowEq', label: '<= mediana', digits: 0 },
              { key: 'median', label: 'Mediana', digits: 5 },
              { key: 'q1', label: 'Q1', digits: 4 },
              { key: 'q3', label: 'Q3', digits: 4 }
            ], m.rows),
            ui.kv([['Chi-quadro', m.chisq, 4], ['Gradi di liberta', m.df, 0], ['p-value', '<b>' + num.fmtP(m.p) + '</b>']]),
            ui.verdict(m.p < alpha() ? 'Le mediane dei gruppi <b>differiscono</b>.' : 'Non emergono differenze fra le mediane.',
              m.p < alpha() ? 'bad' : 'good')
          ]));
        } else {
          var k = T.kruskalWallis(groups);
          L.right.appendChild(ui.panel(k.title, { sub: 'alternativa non parametrica all ANOVA' }, [
            ui.table([
              { key: 'level', label: v.factor },
              { key: 'n', label: 'n', digits: 0 },
              { key: 'median', label: 'Mediana', digits: 5 },
              { key: 'meanRank', label: 'Rango medio', digits: 2 },
              { key: 'z', label: 'z', digits: 3 }
            ], k.rows),
            ui.kv([
              ['H', k.H, 4], ['H corretto per i pareggi', k.Hadj, 4],
              ['Gradi di liberta', k.df, 0], ['p-value', '<b>' + num.fmtP(k.p) + '</b>']
            ]),
            ui.verdict(k.p < alpha()
              ? 'Almeno un gruppo ha una distribuzione spostata rispetto agli altri (p = ' + num.fmtP(k.p) + ').'
              : 'Non emergono differenze fra i gruppi.', k.p < alpha() ? 'bad' : 'good')
          ]));
        }
        var gb = h('div', { class: 'c3-grid-2' });
        L.right.appendChild(ui.panel('Grafici', null, gb));
        var c1 = h('div'), c2 = h('div');
        gb.appendChild(c1); gb.appendChild(c2);
        C3.plots.boxplot(c1, groups, { title: v.y + ' per ' + v.factor, yLabel: v.y, showPoints: true });
        C3.plots.individualValuePlot(c2, groups, { title: 'Valori individuali', yLabel: v.y, xLabel: v.factor });
      }

      function varComponents(v) {
        var r = C3.anova.varianceComponents(ds.numeric(v.y), ds.col(v.factorA), ds.col(v.factorB), { nested: v.nested });
        if (!r.balanced) {
          L.right.appendChild(ui.verdict('Il disegno non e bilanciato: le componenti della varianza con questo metodo ' +
            'richiedono lo stesso numero di osservazioni per cella.', 'warn'));
          return;
        }
        var total = r.total;
        var rows = [
          { source: v.factorA, comp: r.components.A },
          { source: v.nested ? v.factorB + ' (in ' + v.factorA + ')' : v.factorB, comp: r.components.B },
          { source: 'Interazione', comp: r.components.AB },
          { source: 'Errore', comp: r.components.error }
        ].filter(function (x) { return !(x.source === 'Interazione' && !x.comp); })
          .map(function (x) {
            return {
              source: x.source, comp: x.comp, pct: 100 * x.comp / total, sd: Math.sqrt(x.comp)
            };
          });
        rows.push({ source: 'Totale', comp: total, pct: 100, sd: Math.sqrt(total), __class: 'total' });
        L.right.appendChild(ui.panel('Componenti della varianza', { sub: r.nested ? 'disegno annidato' : 'disegno incrociato' }, [
          ui.anovaTable(r.table.map(function (t) {
            return { source: t.source, df: t.df, ss: t.ss, ms: t.ms, F: t.F, p: t.p };
          }), { alpha: alpha() }),
          ui.table([
            { key: 'source', label: 'Fonte' },
            { key: 'comp', label: 'Componente di varianza', digits: 6 },
            { key: 'pct', label: '% del totale', digits: 2 },
            { key: 'sd', label: 'Dev.st.', digits: 5 }
          ], rows),
          ui.verdict('Le componenti dicono <b>dove nasce la variabilita</b>: e la base del Gage R&R e della scelta ' +
            'del punto in cui intervenire (materiale, macchina, operatore, tempo).', 'good')
        ]));
        var box = h('div');
        L.right.appendChild(ui.panel('Contributo delle fonti', null, box));
        C3.plots.barChart(box, rows.filter(function (x) { return x.source !== 'Totale'; }).map(function (x) {
          return { label: x.source, value: x.pct };
        }), { title: 'Quota di varianza per fonte', valueLabel: '% del totale', valueLabels: true, height: 260 });
      }

      run();
    }
  });

  /* ==================================================================
     POTENZA E NUMEROSITA CAMPIONARIA
     ================================================================== */
  C3.app.registerView({
    id: 'potenza',
    label: 'Potenza e campione',
    icon: '◔',
    group: 'Analisi',
    desc: 'Quante prove servono? Calcolo di potenza, numerosita campionaria e differenza rilevabile per i test piu usati, piani di campionamento in accettazione.',
    render: function (el) {
      var L = splitLayout(el);
      var f = ui.form([
        {
          id: 'test', type: 'select', label: 'Situazione', options: [
            { value: 't1', label: 'Media di un campione (t)' },
            { value: 't2', label: 'Confronto di due medie (t)' },
            { value: 'prop1', label: 'Una proporzione' },
            { value: 'prop2', label: 'Due proporzioni' },
            { value: 'anova', label: 'ANOVA a una via' },
            { value: 'var1', label: 'Una varianza' },
            { value: 'ci', label: 'Precisione di una stima (IC)' },
            { value: 'sampling', label: 'Piano di campionamento in accettazione' },
            { value: 'doe', label: 'Disegno fattoriale 2^k' }
          ]
        },
        {
          id: 'solve', type: 'chips', label: 'Cosa calcolare', value: 'n', options: [
            { value: 'n', label: 'Numerosita' },
            { value: 'power', label: 'Potenza' },
            { value: 'delta', label: 'Differenza rilevabile' }
          ], when: function (v) { return ['t1', 't2', 'prop1', 'prop2', 'anova', 'var1'].indexOf(v.test) >= 0; }
        },
        { id: 'delta', type: 'number', label: 'Differenza da rilevare', value: 1, when: function (v) { return ['t1', 't2', 'anova'].indexOf(v.test) >= 0; } },
        { id: 'sigma', type: 'number', label: 'Deviazione standard attesa', value: 1, when: function (v) { return ['t1', 't2', 'anova', 'ci', 'doe'].indexOf(v.test) >= 0; } },
        { id: 'power', type: 'number', label: 'Potenza desiderata', value: 0.8, step: 0.05, min: 0.5, max: 0.999 },
        { id: 'n', type: 'number', label: 'Numerosita per gruppo', value: 20, min: 2 },
        { id: 'groups', type: 'number', label: 'Numero di gruppi', value: 4, min: 2, when: function (v) { return v.test === 'anova'; } },
        { id: 'p0', type: 'number', label: 'Proporzione di riferimento', value: 0.1, step: 0.01, when: function (v) { return v.test === 'prop1'; } },
        { id: 'p1', type: 'number', label: 'Proporzione attesa', value: 0.2, step: 0.01, when: function (v) { return ['prop1', 'prop2'].indexOf(v.test) >= 0; } },
        { id: 'p2', type: 'number', label: 'Seconda proporzione', value: 0.1, step: 0.01, when: function (v) { return v.test === 'prop2'; } },
        { id: 'ratio', type: 'number', label: 'Rapporto sigma1/sigma0', value: 1.5, step: 0.1, when: function (v) { return v.test === 'var1'; } },
        { id: 'E', type: 'number', label: 'Semi-ampiezza desiderata', value: 0.5, when: function (v) { return v.test === 'ci'; } },
        { id: 'aql', type: 'number', label: 'AQL (frazione accettabile)', value: 0.01, step: 0.005, when: function (v) { return v.test === 'sampling'; } },
        { id: 'rql', type: 'number', label: 'RQL/LTPD (frazione inaccettabile)', value: 0.06, step: 0.005, when: function (v) { return v.test === 'sampling'; } },
        { id: 'beta', type: 'number', label: 'Rischio del consumatore', value: 0.1, step: 0.05, when: function (v) { return v.test === 'sampling'; } },
        { id: 'lot', type: 'number', label: 'Dimensione del lotto (0 = infinito)', value: 0, when: function (v) { return v.test === 'sampling'; } },
        { id: 'k', type: 'number', label: 'Numero di fattori k', value: 4, min: 2, max: 10, when: function (v) { return v.test === 'doe'; } },
        { id: 'p', type: 'number', label: 'Grado di frazionamento p', value: 0, min: 0, max: 6, when: function (v) { return v.test === 'doe'; } },
        { id: 'reps', type: 'number', label: 'Repliche', value: 2, min: 1, when: function (v) { return v.test === 'doe'; } },
        { id: 'cp', type: 'number', label: 'Punti centrali', value: 0, min: 0, when: function (v) { return v.test === 'doe'; } },
        { id: 'effect', type: 'number', label: 'Effetto da rilevare', value: 2, when: function (v) { return v.test === 'doe'; } },
        {
          id: 'alt', type: 'select', label: 'Ipotesi alternativa', options: [
            { value: 'two', label: 'bilaterale' }, { value: 'greater', label: 'unilaterale' }
          ]
        }
      ], function () { run(); });
      L.left.appendChild(h('h3', null, 'Dati di progetto'));
      L.left.appendChild(f.el);

      function run() {
        ui.clear(L.right);
        var v = f.values();
        try {
          if (v.test === 'ci') {
            L.right.appendChild(ui.panel('Numerosita per la precisione della stima', null, ui.kv([
              ['n per la media (semi-ampiezza ' + v.E + ')', C3.power.nForMeanCI(v.sigma, v.E, conf()), 0],
              ['n per una proporzione (p = 0,5, semi-ampiezza ' + v.E + ')', C3.power.nForPropCI(0.5, v.E, conf()), 0],
              ['n per stimare sigma con precisione relativa 20%', C3.power.nForSigma(0.2, conf()), 0],
              ['n per stimare Cpk = 1,33 con precisione 10%', C3.power.nForCpk(1.33, 0.1, conf()), 0]
            ])));
            L.right.appendChild(ui.verdict('La numerosita per <b>stimare</b> un parametro con una data precisione ' +
              'e diversa da quella per <b>rilevare</b> una differenza: qui non serve alcuna ipotesi alternativa.', 'good'));
            return;
          }
          if (v.test === 'sampling') {
            var plan = C3.power.singleSamplingPlan({
              aql: v.aql, rql: v.rql, alpha: alpha(), beta: v.beta,
              lot: v.lot > 0 ? v.lot : null
            });
            if (!plan) throw new Error('Nessun piano trovato: allarga la distanza fra AQL e RQL.');
            var zero = C3.power.zeroAcceptPlan(v.rql, v.beta);
            L.right.appendChild(ui.panel('Piano a campionamento singolo', null, [
              ui.kv([
                ['Dimensione del campione n', plan.n, 0],
                ['Numero di accettazione c', plan.c, 0],
                ['Probabilita di accettare a AQL', num.fmt(plan.pAcceptAQL, 4) + ' (rischio del produttore ' + num.fmt(1 - plan.pAcceptAQL, 4) + ')'],
                ['Probabilita di accettare a RQL', num.fmt(plan.pAcceptRQL, 4) + ' (rischio del consumatore)'],
                ['Piano equivalente c = 0', 'n = ' + zero.n]
              ]),
              ui.verdict('Il piano accetta il lotto se i difettosi nel campione sono al massimo ' + plan.c +
                ' su ' + plan.n + ' pezzi ispezionati. Un piano c = 0 richiede meno pezzi ma respinge lotti buoni piu spesso.', 'good')
            ]));
            var ocBox = h('div');
            L.right.appendChild(ui.panel('Curva operativa caratteristica', null, ocBox));
            C3.plots.ocCurvePlot(ocBox, plan, {});
            return;
          }
          if (v.test === 'doe') {
            var pw = C3.doe.factorialPower({
              k: v.k, p: v.p, replicates: v.reps, centerPoints: v.cp,
              effect: v.effect, sigma: v.sigma, alpha: alpha()
            });
            L.right.appendChild(ui.panel('Potenza di un disegno 2^' + (v.p ? '(' + v.k + '-' + v.p + ')' : v.k), null, [
              ui.kv([
                ['Prove totali', pw.runs, 0],
                ['Gradi di liberta per l errore', pw.df, 0],
                ['Errore standard di un effetto', pw.seEffect, 5],
                ['Potenza per un effetto di ' + v.effect, num.fmt(100 * pw.power, 1) + '%'],
                ['Effetto rilevabile con potenza 0,80', pw.detectable, 4]
              ]),
              ui.verdict(pw.power >= 0.8
                ? 'Il disegno ha potenza adeguata per l effetto indicato.'
                : 'Potenza insufficiente: aumenta le repliche, riduci sigma (migliora la misura o il controllo delle condizioni) oppure accetta di rilevare solo effetti piu grandi.',
                pw.power >= 0.8 ? 'good' : 'warn')
            ]));
            var curveBox = h('div');
            L.right.appendChild(ui.panel('Potenza al variare delle repliche', null, curveBox));
            var series = [1, 2, 3, 4].map(function (rep) {
              var pts = [];
              for (var e = 0.2; e <= v.effect * 2.5; e += v.effect / 20) {
                pts.push({ delta: e, power: C3.doe.factorialPower({
                  k: v.k, p: v.p, replicates: rep, centerPoints: v.cp, effect: e, sigma: v.sigma, alpha: alpha()
                }).power });
              }
              return { name: rep + ' replica' + (rep > 1 ? 'he' : ''), points: pts };
            });
            C3.plots.powerCurvePlot(curveBox, series, { xLabel: 'Effetto da rilevare' });
            return;
          }

          var spec = { test: v.test, alpha: alpha(), alt: v.alt };
          if (v.solve === 'n') spec.power = v.power;
          else if (v.solve === 'power') spec.n = v.n;
          else { spec.n = v.n; spec.power = v.power; }
          spec.delta = v.solve === 'delta' ? null : v.delta;
          spec.sigma = v.sigma;
          spec.groups = v.groups;
          spec.maxDiff = v.delta;
          spec.p0 = v.p0; spec.p1 = v.p1; spec.p2 = v.p2;
          spec.ratio = v.test === 'var1' ? v.ratio : 1;
          if (v.solve === 'power') spec.power = null;
          var r = C3.power.compute(spec);
          L.right.appendChild(ui.panel('Risultato', { sub: TEST_LABEL[v.test] }, [
            ui.kv([
              ['Numerosita per gruppo', r.n != null ? num.fmt(r.n, 0) : '-'],
              r.n2 != null ? ['Numerosita secondo gruppo', num.fmt(r.n2, 0)] : null,
              r.totalN != null ? ['Numerosita totale', num.fmt(r.totalN, 0)] : null,
              ['Potenza', r.power != null ? num.fmt(100 * r.power, 2) + '%' : '-'],
              r.delta != null ? ['Differenza rilevabile', num.fmt(r.delta, 5)] : null,
              ['alpha', alpha()],
              ['Ipotesi alternativa', v.alt === 'two' ? 'bilaterale' : 'unilaterale']
            ].filter(Boolean)),
            ui.verdict('Regola pratica: la numerosita cresce con il <b>quadrato</b> del rapporto sigma/differenza. ' +
              'Dimezzare la differenza rilevabile costa quattro volte le prove.', 'good')
          ]));
          // curva di potenza
          var cbox = h('div');
          L.right.appendChild(ui.panel('Curva di potenza', null, cbox));
          var ns = [];
          var base = r.n || v.n || 20;
          [Math.max(3, Math.round(base / 2)), base, Math.round(base * 1.5), base * 2].forEach(function (nn) {
            var pts = [];
            var maxD = (v.delta || 1) * 2.5;
            for (var d = maxD / 30; d <= maxD; d += maxD / 30) {
              var pw2;
              if (v.test === 't1') pw2 = C3.power.tPower1(nn, d, v.sigma, alpha(), v.alt);
              else if (v.test === 't2') pw2 = C3.power.tPower2(nn, nn, d, v.sigma, alpha(), v.alt);
              else if (v.test === 'anova') pw2 = C3.power.anovaPower(v.groups, nn, d, v.sigma, alpha());
              else if (v.test === 'prop1') pw2 = C3.power.propPower1(nn, v.p0, Math.min(0.999, v.p0 + d / 10), alpha(), v.alt);
              else if (v.test === 'prop2') pw2 = C3.power.propPower2(nn, nn, Math.min(0.999, v.p2 + d / 10), v.p2, alpha(), v.alt);
              else pw2 = C3.power.varPower1(nn, 1 + d / 2, alpha(), v.alt);
              pts.push({ delta: d, power: pw2 });
            }
            ns.push({ name: 'n = ' + nn, points: pts });
          });
          C3.plots.powerCurvePlot(cbox, ns, {
            xLabel: v.test.indexOf('prop') === 0 ? 'Scostamento (unita x10)' : 'Differenza da rilevare'
          });
        } catch (e) {
          console.error(e);
          L.right.appendChild(ui.verdict('Calcolo non possibile: ' + e.message, 'bad'));
        }
      }

      var TEST_LABEL = {
        t1: 'test t a 1 campione', t2: 'test t a 2 campioni', prop1: 'una proporzione',
        prop2: 'due proporzioni', anova: 'ANOVA a una via', var1: 'una varianza'
      };

      run();
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
