/* CLAUDIO v3 - ui/views/model-view.js
 * Viste di modellazione: correlazione e regressione (semplice, multipla,
 * polinomiale, logistica, selezione delle variabili), analisi multivariata
 * (PCA, cluster, T2 di Hotelling, discriminante) e serie storiche.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3;
  var ui = C3.ui, h = ui.h, num = C3.numeric, st = C3.stats;

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
     CORRELAZIONE E REGRESSIONE
     ================================================================== */
  C3.app.registerView({
    id: 'regressione',
    label: 'Regressione e correlazione',
    icon: '↗',
    group: 'Analisi',
    desc: 'Correlazioni, regressione lineare semplice e multipla, polinomiale, logistica binaria, selezione automatica delle variabili e diagnostica completa dei residui.',
    render: function (el) {
      var ds = needData(el);
      if (!ds) return;
      var numCols = ds.numericColumns(), catCols = ds.categoricalColumns();
      if (numCols.length < 1) {
        el.appendChild(ui.verdict('Serve almeno una colonna numerica.', 'warn'));
        return;
      }
      var L = splitLayout(el);
      var f = ui.form([
        {
          id: 'mode', type: 'chips', label: 'Analisi', value: 'simple', options: [
            { value: 'corr', label: 'Correlazione' },
            { value: 'simple', label: 'Regressione semplice' },
            { value: 'multi', label: 'Regressione multipla' },
            { value: 'logistic', label: 'Logistica binaria' },
            { value: 'select', label: 'Selezione variabili' }
          ]
        },
        {
          id: 'cols', type: 'multiselect', label: 'Variabili', options: numCols, size: 6,
          value: numCols.slice(0, Math.min(4, numCols.length)),
          when: function (v) { return v.mode === 'corr'; }
        },
        {
          id: 'method', type: 'select', label: 'Coefficiente', options: [
            { value: 'pearson', label: 'Pearson (lineare)' },
            { value: 'spearman', label: 'Spearman (monotono)' },
            { value: 'kendall', label: 'Kendall tau-b' }
          ], when: function (v) { return v.mode === 'corr'; }
        },
        {
          id: 'y', type: 'select', label: 'Risposta Y', options: numCols,
          when: function (v) { return v.mode !== 'corr' && v.mode !== 'logistic'; }
        },
        {
          id: 'ylog', type: 'select', label: 'Risposta binaria', options: ds.names,
          when: function (v) { return v.mode === 'logistic'; }
        },
        {
          id: 'success', type: 'text', label: 'Valore che rappresenta il successo', value: '',
          hint: 'lascia vuoto se la colonna e 0/1',
          when: function (v) { return v.mode === 'logistic'; }
        },
        {
          id: 'x', type: 'select', label: 'Predittore X', options: numCols,
          value: numCols[1] || numCols[0],
          when: function (v) { return v.mode === 'simple'; }
        },
        {
          id: 'degree', type: 'number', label: 'Grado del polinomio', value: 1, min: 1, max: 5,
          when: function (v) { return v.mode === 'simple'; }
        },
        {
          id: 'xs', type: 'multiselect', label: 'Predittori', options: numCols.concat(catCols), size: 7,
          value: numCols.slice(1, Math.min(4, numCols.length)),
          when: function (v) { return ['multi', 'logistic', 'select'].indexOf(v.mode) >= 0; }
        },
        {
          id: 'interactions', type: 'checkbox', label: 'Aggiungi interazioni a 2 fattori', value: false,
          when: function (v) { return v.mode === 'multi'; }
        },
        {
          id: 'squares', type: 'checkbox', label: 'Aggiungi termini quadratici', value: false,
          when: function (v) { return v.mode === 'multi'; }
        },
        {
          id: 'selMode', type: 'select', label: 'Metodo di selezione', options: [
            { value: 'both', label: 'Stepwise (avanti e indietro)' },
            { value: 'forward', label: 'Solo in avanti' },
            { value: 'backward', label: 'Solo a ritroso' },
            { value: 'best', label: 'Migliori sottoinsiemi' }
          ], when: function (v) { return v.mode === 'select'; }
        },
        { id: 'diag', type: 'checkbox', label: 'Diagnostica dei residui', value: true, when: function (v) { return v.mode !== 'corr'; } }
      ], function () { run(); });
      L.left.appendChild(h('h3', null, 'Modello'));
      L.left.appendChild(f.el);

      function run() {
        ui.clear(L.right);
        var v = f.values();
        try {
          if (v.mode === 'corr') correlation(v);
          else if (v.mode === 'simple') simple(v);
          else if (v.mode === 'multi') multiple(v);
          else if (v.mode === 'logistic') logistic(v);
          else selection(v);
        } catch (e) {
          console.error(e);
          L.right.appendChild(ui.verdict('Analisi non eseguibile: ' + e.message, 'bad'));
        }
      }

      function correlation(v) {
        var cols = v.cols.length >= 2 ? v.cols : numCols.slice(0, 3);
        var corr = C3.multivariate.correlationMatrix(ds.asObject(cols), cols, v.method);
        var rows = [];
        for (var i = 0; i < cols.length; i++) {
          for (var j = i + 1; j < cols.length; j++) {
            rows.push({
              pair: cols[i] + ' - ' + cols[j], r: corr.r[i][j], p: corr.p[i][j], n: corr.n[i][j],
              r2: 100 * corr.r[i][j] * corr.r[i][j],
              strength: strength(Math.abs(corr.r[i][j]))
            });
          }
        }
        rows.sort(function (a, b) { return Math.abs(b.r) - Math.abs(a.r); });
        var heat = h('div');
        L.right.appendChild(ui.panel('Matrice di correlazione', { sub: corr.method }, heat));
        C3.plots.correlationHeatmap(heat, corr, {});
        L.right.appendChild(ui.panel('Coppie ordinate per forza', null, [
          ui.table([
            { key: 'pair', label: 'Coppia' },
            { key: 'n', label: 'n', digits: 0 },
            { key: 'r', label: 'r', digits: 4 },
            { key: 'r2', label: 'Varianza spiegata %', digits: 1 },
            { key: 'p', label: 'p', html: true, format: function (x) { return ui.pValue(x, alpha()); } },
            { key: 'strength', label: 'Interpretazione' }
          ], rows),
          ui.verdict('Correlazione non significa causa. Prima di agire su una variabile serve un esperimento ' +
            '(DoE) o almeno un ragionamento tecnico sul meccanismo fisico.', 'warn')
        ]));
        // matrice di grafici
        if (cols.length <= 6) {
          var mbox = h('div', { class: 'c3-grid-3' });
          L.right.appendChild(ui.panel('Grafici di dispersione', { sub: 'tutte le coppie' }, mbox));
          for (var a = 0; a < cols.length; a++) {
            for (var b = a + 1; b < cols.length; b++) {
              var c = h('div');
              mbox.appendChild(c);
              C3.plots.scatter(c, ds.numeric(cols[a]), ds.numeric(cols[b]), {
                xName: cols[a], yName: cols[b], height: 230, fit: true, showCI: false,
                title: cols[b] + ' vs ' + cols[a], legend: false
              });
            }
          }
        }
      }

      function strength(r) {
        if (r >= 0.9) return 'molto forte';
        if (r >= 0.7) return 'forte';
        if (r >= 0.5) return 'moderata';
        if (r >= 0.3) return 'debole';
        return 'trascurabile';
      }

      function simple(v) {
        var fit = C3.regression.polyFit(ds.numeric(v.x), ds.numeric(v.y), v.degree || 1);
        var chartBox = h('div');
        L.right.appendChild(ui.panel('Regressione di ' + v.y + ' su ' + v.x,
          { sub: v.degree > 1 ? 'polinomio di grado ' + v.degree : 'modello lineare' }, [
          ui.kv([
            ['Equazione', '<span class="mono">' + equation(fit, v.y, v.x) + '</span>'],
            ['R-quadro', num.fmt(100 * fit.r2, 3) + '%'],
            ['R-quadro corretto', num.fmt(100 * fit.r2adj, 3) + '%'],
            ['R-quadro previsto (PRESS)', num.fmt(100 * fit.r2press, 3) + '%'],
            ['S (dev.st. dei residui)', fit.s, 5],
            ['F del modello', num.fmt(fit.F, 3) + ' con p = ' + num.fmtP(fit.pModel)],
            ['n', fit.n, 0],
            ['Durbin-Watson', fit.dw, 4]
          ]),
          ui.coefTable(fit, { alpha: alpha() }),
          fit.lackOfFit ? ui.kv([
            ['Lack-of-fit F', fit.lackOfFit.F, 4],
            ['p (lack-of-fit)', num.fmtP(fit.lackOfFit.p)],
            ['Interpretazione', fit.lackOfFit.p < alpha()
              ? '<b>il modello non descrive bene i dati</b>: prova un grado superiore'
              : 'nessuna evidenza di forma sbagliata del modello']
          ]) : null,
          ui.verdict(fit.pModel < alpha()
            ? 'Il modello spiega una quota significativa della variabilita (p = ' + num.fmtP(fit.pModel) + ').'
            : 'Il modello non e significativo: il predittore scelto non spiega la risposta.',
            fit.pModel < alpha() ? 'good' : 'warn'),
          chartBox
        ].filter(Boolean)));
        C3.plots.scatter(chartBox, ds.numeric(v.x), ds.numeric(v.y), {
          xName: v.x, yName: v.y, degree: v.degree || 1, showCI: true, showPI: true,
          title: 'Adattamento con intervalli di confidenza e predizione'
        });
        // previsione puntuale
        var predBox = h('div');
        var pf = ui.form([{ id: 'xv', type: 'number', label: 'Valore di ' + v.x, value: num.round(st.mean(st.clean(ds.numeric(v.x))), 4) }],
          function () { showPred(); });
        var predOut = h('div');
        function showPred() {
          ui.clear(predOut);
          var xv = pf.values().xv;
          var pr = fit.predictAt(xv);
          predOut.appendChild(ui.kv([
            ['Previsione', pr.fit, 5],
            ['IC ' + Math.round(conf() * 100) + '% della media', num.fmt(pr.ci[0], 5) + ' ... ' + num.fmt(pr.ci[1], 5)],
            ['Intervallo di predizione (nuova osservazione)', num.fmt(pr.pi[0], 5) + ' ... ' + num.fmt(pr.pi[1], 5)]
          ]));
        }
        predBox.appendChild(pf.el);
        predBox.appendChild(predOut);
        showPred();
        L.right.appendChild(ui.panel('Previsione', null, predBox));

        if (v.diag) {
          var resBox = h('div');
          L.right.appendChild(ui.panel('Diagnostica dei residui', null, resBox));
          C3.plots.residualPlots(resBox, fit, {});
          L.right.appendChild(diagnosticsPanel(fit));
        }
      }

      function equation(fit, yName, xName) {
        var s = yName + ' = ' + num.fmt(fit.beta[0], 5);
        for (var i = 1; i < fit.beta.length; i++) {
          s += (fit.beta[i] >= 0 ? ' + ' : ' - ') + num.fmt(Math.abs(fit.beta[i]), 5) +
            ' * ' + xName + (i > 1 ? '^' + i : '');
        }
        return s;
      }

      function multiple(v) {
        if (!v.xs.length) throw new Error('Seleziona almeno un predittore.');
        var terms = v.xs.slice();
        if (v.squares) {
          v.xs.forEach(function (x) {
            if (numCols.indexOf(x) >= 0) terms.push(x + '^2');
          });
        }
        if (v.interactions) {
          for (var i = 0; i < v.xs.length; i++) {
            for (var j = i + 1; j < v.xs.length; j++) terms.push(v.xs[i] + '*' + v.xs[j]);
          }
        }
        var cat = {};
        v.xs.forEach(function (x) { if (catCols.indexOf(x) >= 0) cat[x] = true; });
        var fit = C3.regression.glm({
          data: ds.asObject(), y: v.y, terms: terms.join(' + '), categorical: cat
        });
        var vif = null;
        try { vif = v.xs.length > 1 ? C3.regression.vif(fit.X) : null; } catch (e) { vif = null; }
        L.right.appendChild(ui.panel('Regressione multipla: ' + v.y, { sub: terms.join(' + ') }, [
          ui.kv([
            ['n', fit.n, 0],
            ['R-quadro', num.fmt(100 * fit.r2, 3) + '%'],
            ['R-quadro corretto', num.fmt(100 * fit.r2adj, 3) + '%'],
            ['R-quadro previsto (PRESS)', num.fmt(100 * fit.r2press, 3) + '%'],
            ['S', fit.s, 5],
            ['AIC corretto', fit.aicc, 2],
            ['Durbin-Watson', fit.dw, 4]
          ]),
          ui.anovaTable(fit.anovaAdj.map(function (r) {
            return { source: r.label, df: r.df, ss: r.ss, ms: r.ms, F: r.F, p: r.p };
          }).concat([
            { source: 'Errore', df: fit.dfe, ss: fit.sse, ms: fit.mse, F: null, p: null },
            { source: 'Totale', df: fit.dfe + fit.dfm, ss: fit.sst, ms: null, F: null, p: null }
          ]), { alpha: alpha(), caption: 'SS adattate (tipo III): contributo di ogni termine a parita degli altri' }),
          ui.coefTable(fit, { alpha: alpha(), vif: vif }),
          vif && Math.max.apply(null, vif) > 10
            ? ui.verdict('VIF maggiore di 10: i predittori sono fortemente collineari, i coefficienti diventano instabili. ' +
              'Rimuovi una delle variabili ridondanti, centrale le variabili o usa la selezione automatica.', 'warn')
            : null,
          ui.verdict('Equazione: <span class="mono">' + buildEq(fit, v.y) + '</span>', 'good')
        ].filter(Boolean)));
        if (v.diag) {
          var resBox = h('div');
          L.right.appendChild(ui.panel('Diagnostica dei residui', null, resBox));
          C3.plots.residualPlots(resBox, fit, {});
          L.right.appendChild(diagnosticsPanel(fit));
          // residui vs ogni predittore
          var gbox = h('div', { class: 'c3-grid-2' });
          L.right.appendChild(ui.panel('Residui rispetto ai predittori', null, gbox));
          v.xs.forEach(function (x) {
            if (numCols.indexOf(x) < 0) return;
            var c = h('div');
            gbox.appendChild(c);
            var xv = fit.rowsUsed.map(function (i) { return C3.data.toNumber(ds.column(x).values[i]); });
            C3.chart.render(c, {
              title: 'Residui vs ' + x, height: 230,
              x: { label: x, gridlines: true }, y: { label: 'Residuo standardizzato' },
              series: [{
                type: 'points', name: 'Residui', markerSize: 4,
                points: xv.map(function (xx, i) { return { x: xx, y: fit.sresid[i] }; })
              }],
              annotations: [{ type: 'hline', y: 0, color: C3.chart.pal().ink2 }],
              legend: false
            });
          });
        }
      }

      function buildEq(fit, yName) {
        var s = yName + ' = ' + num.fmt(fit.beta[0], 5);
        for (var i = 1; i < fit.beta.length; i++) {
          s += (fit.beta[i] >= 0 ? ' + ' : ' - ') + num.fmt(Math.abs(fit.beta[i]), 5) + ' * ' + fit.names[i];
        }
        return s;
      }

      function diagnosticsPanel(fit) {
        var n = fit.n, p = fit.p;
        var hatLimit = 2 * p / n;
        var infl = [];
        for (var i = 0; i < n; i++) {
          var flags = [];
          if (Math.abs(fit.sresid[i]) > 2) flags.push('residuo grande');
          if (fit.hat[i] > hatLimit) flags.push('leverage alto');
          if (fit.cook[i] > 4 / n) flags.push('influente (Cook)');
          if (flags.length) {
            infl.push({
              obs: (fit.rowsUsed ? fit.rowsUsed[i] : i) + 1,
              fitted: fit.fitted[i], resid: fit.resid[i],
              sres: fit.sresid[i], tres: fit.tresid[i],
              hat: fit.hat[i], cook: fit.cook[i], flags: flags.join(', ')
            });
          }
        }
        infl.sort(function (a, b) { return b.cook - a.cook; });
        var ad = st.andersonDarling(fit.resid);
        var acf = st.acf(fit.resid, Math.min(10, Math.floor(n / 4)));
        var dwVerdict = fit.dw < 1.5 ? 'autocorrelazione positiva probabile'
          : (fit.dw > 2.5 ? 'autocorrelazione negativa probabile' : 'nessun segnale di autocorrelazione');
        return ui.panel('Verifiche sul modello', { sub: 'ipotesi dei minimi quadrati' }, [
          ui.kv([
            ['Normalita dei residui (Anderson-Darling)', 'A2 = ' + num.fmt(ad.A2, 4) + ', p = ' + num.fmtP(ad.p) +
              (ad.p < alpha() ? ' <b style="color:var(--critical)">(non normali)</b>' : ' (accettabile)')],
            ['Shapiro-Wilk sui residui', 'p = ' + num.fmtP(st.shapiroWilk(fit.resid).p)],
            ['Durbin-Watson', num.fmt(fit.dw, 4) + ' - ' + dwVerdict],
            ['Autocorrelazione di ordine 1 dei residui', acf.length ? num.fmt(acf[0].r, 4) : '-'],
            ['Soglia di leverage (2p/n)', hatLimit, 4],
            ['Soglia di Cook (4/n)', 4 / n, 4],
            ['Osservazioni segnalate', infl.length + ' su ' + n]
          ]),
          infl.length ? ui.collapsible('Osservazioni sospette (' + infl.length + ')',
            ui.table([
              { key: 'obs', label: 'Riga', digits: 0 },
              { key: 'fitted', label: 'Valore adattato', digits: 4 },
              { key: 'resid', label: 'Residuo', digits: 4 },
              { key: 'sres', label: 'Residuo std', digits: 3 },
              { key: 'tres', label: 'Residuo studentizzato', digits: 3 },
              { key: 'hat', label: 'Leverage', digits: 4 },
              { key: 'cook', label: 'Distanza di Cook', digits: 4 },
              { key: 'flags', label: 'Segnalazioni' }
            ], infl.slice(0, 30)), false) : null,
          ui.verdict('Le quattro ipotesi da verificare sono: <b>linearita</b> (residui senza struttura), ' +
            '<b>varianza costante</b> (nessun imbuto), <b>normalita</b> dei residui, <b>indipendenza</b> ' +
            '(Durbin-Watson e grafico nell ordine di raccolta). Se cadono, i p-value non sono affidabili.', 'good')
        ].filter(Boolean));
      }

      function logistic(v) {
        if (!v.xs.length) throw new Error('Seleziona almeno un predittore.');
        var cat = {};
        v.xs.forEach(function (x) { if (catCols.indexOf(x) >= 0) cat[x] = true; });
        var fit = C3.regression.logisticModel(ds.asObject(), v.ylog, v.xs, {
          categorical: cat, success: v.success || undefined
        });
        L.right.appendChild(ui.panel('Regressione logistica binaria: ' + v.ylog, { sub: v.xs.join(' + ') }, [
          ui.kv([
            ['n', fit.n, 0],
            ['Devianza del modello', fit.deviance, 4],
            ['Test del rapporto di verosimiglianza G', num.fmt(fit.G, 4) + ' (' + fit.dfG + ' gdl), p = ' + num.fmtP(fit.pG)],
            ['R-quadro di McFadden', num.fmt(100 * fit.r2McFadden, 2) + '%'],
            ['AIC', fit.aic, 2],
            ['Coppie concordanti', num.fmt(fit.concordant, 1) + '%'],
            ['D di Somers', fit.somersD, 4]
          ]),
          ui.table([
            { key: 'name', label: 'Termine' },
            { key: 'coef', label: 'Coefficiente', digits: 5 },
            { key: 'se', label: 'ES', digits: 5 },
            { key: 'z', label: 'z', digits: 3 },
            { key: 'p', label: 'p', html: true, format: function (x) { return ui.pValue(x, alpha()); } },
            { key: 'oddsRatio', label: 'Odds ratio', digits: 4 },
            { key: function (r) { return num.fmt(r.ci[0], 3) + ' ... ' + num.fmt(r.ci[1], 3); }, label: 'IC odds ratio' }
          ], fit.coefTable),
          ui.verdict('L odds ratio dice quanto cambiano le probabilita relative per un aumento unitario del predittore: ' +
            'valori > 1 aumentano la probabilita dell evento, < 1 la riducono.', 'good')
        ]));
        // curva probabilita
        if (v.xs.length >= 1 && numCols.indexOf(v.xs[0]) >= 0) {
          var box = h('div');
          L.right.appendChild(ui.panel('Probabilita prevista', { sub: 'variando ' + v.xs[0] + ', altri predittori alla media' }, box));
          var x0 = v.xs[0];
          var xv = st.clean(ds.numeric(x0));
          var lo = st.min(xv), hi = st.max(xv);
          var means = {};
          v.xs.forEach(function (x) {
            means[x] = numCols.indexOf(x) >= 0 ? st.mean(st.clean(ds.numeric(x))) : null;
          });
          var pts = [];
          for (var i = 0; i <= 80; i++) {
            var xx = lo + (hi - lo) * i / 80;
            var row = fit.names.map(function (nm) {
              if (nm === 'Costante') return 1;
              if (nm === x0) return xx;
              return means[nm] != null ? means[nm] : 0;
            });
            pts.push({ x: xx, y: fit.predictProb(row) });
          }
          C3.chart.render(box, {
            title: 'Probabilita dell evento in funzione di ' + x0,
            height: 280,
            x: { label: x0, gridlines: true }, y: { label: 'Probabilita', domain: [0, 1] },
            series: [{ type: 'line', name: 'Probabilita', points: pts, marker: false, width: 2.5 }],
            annotations: [{ type: 'hline', y: 0.5, label: '50%', color: C3.chart.pal().muted }],
            legend: false
          });
        }
      }

      function selection(v) {
        if (v.xs.length < 2) throw new Error('Servono almeno due variabili candidate.');
        if (v.selMode === 'best') {
          var res = C3.regression.bestSubsets(ds.asObject(), v.y, v.xs);
          L.right.appendChild(ui.panel('Migliori sottoinsiemi', { sub: 'ordinati per R-quadro corretto' }, [
            ui.table([
              { key: function (r) { return r.vars.join(', '); }, label: 'Variabili' },
              { key: 'size', label: 'k', digits: 0 },
              { key: function (r) { return 100 * r.r2; }, label: 'R2 %', digits: 2 },
              { key: function (r) { return 100 * r.r2adj; }, label: 'R2 corretto %', digits: 2 },
              { key: function (r) { return 100 * r.r2press; }, label: 'R2 previsto %', digits: 2 },
              { key: 's', label: 'S', digits: 5 },
              { key: 'cp', label: 'Cp di Mallows', digits: 2 },
              { key: 'aicc', label: 'AICc', digits: 2 }
            ], res.all.slice(0, 25)),
            ui.verdict('Un buon modello ha <b>Cp vicino al numero di parametri</b>, R-quadro previsto alto e pochi termini. ' +
              'Non scegliere solo in base a R-quadro: cresce sempre aggiungendo variabili.', 'good')
          ]));
          var box = h('div');
          L.right.appendChild(ui.panel('R-quadro corretto per numero di variabili', null, box));
          C3.plots.barChart(box, res.bestBySize.map(function (r) {
            return { label: r.size + ' var', value: 100 * r.r2adj };
          }), { valueLabel: 'R2 corretto %', valueLabels: true, height: 250 });
        } else {
          var sw = C3.regression.stepwise(ds.asObject(), v.y, v.xs, {
            direction: v.selMode, alphaIn: 0.15, alphaOut: 0.15
          });
          L.right.appendChild(ui.panel('Selezione passo-passo', { sub: 'alpha ingresso/uscita = 0,15' }, [
            sw.steps.length ? ui.table([
              { key: function (r, i) { return i + 1; }, label: 'Passo', digits: 0 },
              { key: 'action', label: 'Azione' },
              { key: 'variable', label: 'Variabile' },
              { key: 'p', label: 'p', digits: 5 },
              { key: 'r2adj', label: 'R2 corretto', digits: 4 }
            ], sw.steps) : ui.verdict('Nessuna variabile e entrata nel modello.', 'warn'),
            ui.kv([['Variabili finali', sw.variables.join(', ') || 'nessuna']])
          ]));
          if (sw.fit) {
            L.right.appendChild(ui.panel('Modello finale', null, [
              ui.kv([
                ['R-quadro', num.fmt(100 * sw.fit.r2, 3) + '%'],
                ['R-quadro corretto', num.fmt(100 * sw.fit.r2adj, 3) + '%'],
                ['S', sw.fit.s, 5]
              ]),
              ui.coefTable(sw.fit, { alpha: alpha() })
            ]));
            var rb = h('div');
            L.right.appendChild(ui.panel('Diagnostica del modello finale', null, rb));
            C3.plots.residualPlots(rb, sw.fit, {});
          }
        }
      }

      run();
    }
  });

  /* ==================================================================
     MULTIVARIATA
     ================================================================== */
  C3.app.registerView({
    id: 'multivariata',
    label: 'Analisi multivariata',
    icon: '✵',
    group: 'Analisi',
    desc: 'Componenti principali, raggruppamento (k-means e gerarchico), distanza di Mahalanobis, carta T2 di Hotelling e analisi discriminante.',
    render: function (el) {
      var ds = needData(el);
      if (!ds) return;
      var numCols = ds.numericColumns(), catCols = ds.categoricalColumns();
      if (numCols.length < 2) {
        el.appendChild(ui.verdict('Servono almeno due colonne numeriche.', 'warn'));
        return;
      }
      var L = splitLayout(el);
      var f = ui.form([
        {
          id: 'mode', type: 'chips', label: 'Analisi', value: 'pca', options: [
            { value: 'pca', label: 'Componenti principali' },
            { value: 'kmeans', label: 'k-means' },
            { value: 'hier', label: 'Gerarchico' },
            { value: 't2', label: 'T2 di Hotelling' },
            { value: 'lda', label: 'Discriminante' }
          ]
        },
        { id: 'cols', type: 'multiselect', label: 'Variabili', options: numCols, size: 7, value: numCols.slice(0, Math.min(6, numCols.length)) },
        {
          id: 'group', type: 'select', label: 'Variabile di gruppo',
          options: [{ value: '', label: '(nessuna)' }].concat(catCols),
          when: function (v) { return ['pca', 'lda'].indexOf(v.mode) >= 0; }
        },
        { id: 'k', type: 'number', label: 'Numero di gruppi k', value: 3, min: 2, max: 12, when: function (v) { return ['kmeans', 'hier'].indexOf(v.mode) >= 0; } },
        {
          id: 'linkage', type: 'select', label: 'Legame', options: [
            { value: 'ward', label: 'Ward' }, { value: 'average', label: 'Media' },
            { value: 'complete', label: 'Completo' }, { value: 'single', label: 'Singolo' }
          ], when: function (v) { return v.mode === 'hier'; }
        },
        { id: 'corr', type: 'checkbox', label: 'Usa la matrice di correlazione (variabili standardizzate)', value: true, when: function (v) { return v.mode === 'pca'; } },
        { id: 'sub', type: 'number', label: 'Dimensione del sottogruppo (T2)', value: 1, min: 1, when: function (v) { return v.mode === 't2'; } }
      ], function () { run(); });
      L.left.appendChild(h('h3', null, 'Impostazioni'));
      L.left.appendChild(f.el);

      function run() {
        ui.clear(L.right);
        var v = f.values();
        var cols = v.cols.length >= 2 ? v.cols : numCols.slice(0, 3);
        try {
          if (v.mode === 'pca') {
            var p = C3.multivariate.pca(ds.asObject(cols), cols, { correlation: v.corr });
            L.right.appendChild(ui.panel('Analisi delle componenti principali', { sub: p.n + ' osservazioni complete' }, [
              ui.table([
                { key: function (c) { return 'PC' + c.index; }, label: 'Componente' },
                { key: 'eigenvalue', label: 'Autovalore', digits: 4 },
                { key: function (c) { return 100 * c.proportion; }, label: '% varianza', digits: 2 },
                { key: function (c) { return 100 * c.cumulative; }, label: '% cumulata', digits: 2 }
              ], p.components),
              ui.verdict('Le prime ' + p.kaiser + ' componenti hanno autovalore > 1 e spiegano ' +
                num.fmt(100 * p.components[Math.max(0, p.kaiser - 1)].cumulative, 1) +
                '% della variabilita totale.', 'good'),
              ui.table([{ key: 'v', label: 'Variabile' }].concat(
                p.components.slice(0, Math.min(5, p.components.length)).map(function (c, i) {
                  return { key: 'pc' + (i + 1), label: 'PC' + (i + 1), digits: 4 };
                })),
                cols.map(function (cn, j) {
                  var row = { v: cn };
                  p.components.slice(0, 5).forEach(function (c, i) { row['pc' + (i + 1)] = c.loadings[j]; });
                  return row;
                }), { caption: 'Pesi (loadings): quanto ogni variabile contribuisce alla componente' })
            ]));
            var gb = h('div', { class: 'c3-grid-2' });
            L.right.appendChild(ui.panel('Grafici', null, gb));
            var c1 = h('div'), c2 = h('div'), c3 = h('div');
            [c1, c2, c3].forEach(function (x) { gb.appendChild(x); });
            C3.plots.screePlot(c1, p, {});
            C3.plots.scorePlot(c2, p, { groups: v.group ? ds.col(v.group) : null });
            C3.plots.loadingPlot(c3, p, {});
          } else if (v.mode === 'kmeans') {
            var km = C3.multivariate.kmeans(ds.asObject(cols), cols, v.k, { standardize: true });
            L.right.appendChild(ui.panel('Raggruppamento k-means', { sub: km.iterations + ' iterazioni' }, [
              ui.table([
                { key: function (r, i) { return 'Gruppo ' + (i + 1); }, label: 'Gruppo' },
                { key: function (r, i) { return km.counts[i]; }, label: 'n', digits: 0 },
                { key: function (r, i) { return km.withinSS[i]; }, label: 'SS interna', digits: 4 }
              ].concat(cols.map(function (cn, j) {
                return { key: function (r, i) { return km.centersReal[i][j]; }, label: cn, digits: 3 };
              })), km.counts.map(function () { return {}; })),
              ui.kv([
                ['Varianza spiegata dal raggruppamento', num.fmt(100 * km.r2, 2) + '%'],
                ['Silhouette media', km.silhouette ? num.fmt(km.silhouette.mean, 4) : 'non calcolata (troppe righe)']
              ]),
              ui.verdict('Silhouette sopra 0,5 indica gruppi ben separati; sotto 0,25 la struttura e debole. ' +
                'Prova diversi valori di k e confronta.', km.silhouette && km.silhouette.mean > 0.4 ? 'good' : 'warn'),
              h('button', {
                class: 'sm primary', onclick: function () {
                  var labels = new Array(ds.nrows).fill(null);
                  km.labels.forEach(function (lb, i) { labels[km.rowsUsed[i]] = 'Gruppo ' + (lb + 1); });
                  ds.addColumn('Gruppo_kmeans', labels, 'cat');
                  C3.app.save();
                  C3.app.toast('Colonna dei gruppi aggiunta al dataset', 'success');
                }
              }, 'Salva i gruppi come colonna')
            ]));
            var gb2 = h('div', { class: 'c3-grid-2' });
            L.right.appendChild(ui.panel('Visualizzazione', null, gb2));
            var p2 = C3.multivariate.pca(ds.asObject(cols), cols, { correlation: true });
            var sc = h('div');
            gb2.appendChild(sc);
            var groupLabels = new Array(ds.nrows).fill('');
            km.labels.forEach(function (lb, i) { groupLabels[km.rowsUsed[i]] = 'Gruppo ' + (lb + 1); });
            C3.plots.scorePlot(sc, p2, { groups: groupLabels });
            var bar = h('div');
            gb2.appendChild(bar);
            C3.plots.barChart(bar, km.counts.map(function (n, i) {
              return { label: 'Gruppo ' + (i + 1), value: n };
            }), { title: 'Numerosita dei gruppi', valueLabel: 'n', valueLabels: true, height: 250 });
          } else if (v.mode === 'hier') {
            var hc = C3.multivariate.hierarchical(ds.asObject(cols), cols, { linkage: v.linkage });
            var labels = hc.cut(v.k);
            var counts = {};
            labels.forEach(function (l) { counts[l] = (counts[l] || 0) + 1; });
            L3(hc, labels, counts, cols, v);
          } else if (v.mode === 't2') {
            var t2 = C3.multivariate.hotellingT2({ data: ds.asObject(cols), cols: cols, subgroupSize: v.sub, alpha: 0.0027 });
            L.right.appendChild(ui.panel(t2.titlePrimary, { sub: 'controllo simultaneo di ' + cols.length + ' variabili' }, [
              ui.kv([
                ['Variabili', cols.join(', ')],
                ['Punti', t2.primary.length, 0],
                ['Limite superiore di controllo', t2.ucl, 4],
                ['Punti fuori controllo', t2.outOfControl, 0]
              ]),
              ui.verdict(t2.outOfControl
                ? 'Ci sono ' + t2.outOfControl + ' punti fuori controllo: il processo multivariato non e stabile. ' +
                  'Una combinazione anomala di variabili puo sfuggire alle carte univariate.'
                : 'Nessun punto fuori controllo nella carta T2.', t2.outOfControl ? 'bad' : 'good')
            ]));
            var tb = h('div');
            L.right.appendChild(ui.panel('Carta T2', null, tb));
            C3.plots.controlChart(tb, {
              titlePrimary: t2.titlePrimary, titleSecondary: null,
              primary: t2.primary.map(function (p) {
                return Object.assign({}, p, { cl: p.cl, sigma: 1 });
              }),
              secondary: null, type: 't2', sigmaWithin: null
            }, { yLabel: 'T2' });
          } else {
            if (!v.group) throw new Error('Scegli la variabile di gruppo da prevedere.');
            var lda = C3.multivariate.lda(ds.asObject(), v.group, cols);
            var confRows = lda.groups.map(function (g) {
              var row = { real: g };
              lda.groups.forEach(function (g2) { row[g2] = lda.confusion[g][g2]; });
              return row;
            });
            L.right.appendChild(ui.panel('Analisi discriminante lineare', { sub: 'classificazione di ' + v.group }, [
              ui.kv([
                ['Osservazioni usate', lda.n, 0],
                ['Accuratezza di riclassificazione', num.fmt(100 * lda.accuracy, 2) + '%'],
                ['Tasso di errore apparente', num.fmt(100 * lda.errorRate, 2) + '%']
              ]),
              ui.table([{ key: 'real', label: 'Reale \\ Previsto' }].concat(
                lda.groups.map(function (g) { return { key: g, label: g, digits: 0 }; })), confRows,
                { caption: 'matrice di confusione' }),
              ui.table([{ key: 'v', label: 'Variabile' }].concat(
                lda.groups.map(function (g) { return { key: g, label: 'Media ' + g, digits: 4 }; })),
                cols.map(function (cn, j) {
                  var row = { v: cn };
                  lda.groups.forEach(function (g) { row[g] = lda.means[g][j]; });
                  return row;
                })),
              ui.verdict('L accuratezza calcolata sugli stessi dati usati per stimare il modello e ottimistica: ' +
                'per una stima onesta serve un insieme di verifica indipendente.', 'warn')
            ]));
          }
        } catch (e) {
          console.error(e);
          L.right.appendChild(ui.verdict('Analisi non eseguibile: ' + e.message, 'bad'));
        }
      }

      function L3(hc, labels, counts, cols, v) {
        L.right.appendChild(ui.panel('Raggruppamento gerarchico', { sub: 'legame ' + hc.linkage }, [
          ui.table([
            { key: 'g', label: 'Gruppo' },
            { key: 'n', label: 'n', digits: 0 }
          ], Object.keys(counts).map(function (k) {
            return { g: 'Gruppo ' + (Number(k) + 1), n: counts[k] };
          })),
          ui.table([
            { key: function (m, i) { return hc.n - i - 1; }, label: 'Gruppi residui', digits: 0 },
            { key: 'distance', label: 'Distanza di fusione', digits: 4 },
            { key: 'size', label: 'Dimensione del gruppo unito', digits: 0 }
          ], hc.merges.slice(-Math.min(15, hc.merges.length)).reverse(),
            { caption: 'ultime fusioni: un salto grande suggerisce il numero di gruppi' }),
          h('button', {
            class: 'sm primary', onclick: function () {
              var out = new Array(C3.app.ds().nrows).fill(null);
              labels.forEach(function (lb, i) { out[hc.rowsUsed[i]] = 'Gruppo ' + (lb + 1); });
              C3.app.ds().addColumn('Gruppo_gerarchico', out, 'cat');
              C3.app.save();
              C3.app.toast('Colonna dei gruppi aggiunta', 'success');
            }
          }, 'Salva i gruppi come colonna')
        ]));
        var box = h('div');
        L.right.appendChild(ui.panel('Distanze di fusione', { sub: 'il gomito indica il numero di gruppi' }, box));
        C3.plots.lineChart(box, [{
          name: 'Distanza',
          points: hc.merges.map(function (m, i) { return { x: hc.n - i - 1, y: m.distance }; })
        }], { xLabel: 'Numero di gruppi', yLabel: 'Distanza di fusione', height: 260 });
      }

      run();
    }
  });

  /* ==================================================================
     SERIE STORICHE
     ================================================================== */
  C3.app.registerView({
    id: 'serie',
    label: 'Serie storiche',
    icon: '≈',
    group: 'Analisi',
    desc: 'Analisi di trend, medie mobili, smorzamento esponenziale, Holt-Winters, decomposizione stagionale, autocorrelazione e previsione.',
    render: function (el) {
      var ds = needData(el);
      if (!ds) return;
      var numCols = ds.numericColumns();
      if (!numCols.length) {
        el.appendChild(ui.verdict('Serve una colonna numerica.', 'warn'));
        return;
      }
      var L = splitLayout(el);
      var f = ui.form([
        { id: 'y', type: 'select', label: 'Serie', options: numCols },
        {
          id: 'method', type: 'select', label: 'Metodo', options: [
            { value: 'auto', label: 'Confronto automatico dei metodi' },
            { value: 'trend', label: 'Analisi di trend' },
            { value: 'ma', label: 'Media mobile' },
            { value: 'ses', label: 'Smorzamento esponenziale singolo' },
            { value: 'holt', label: 'Holt (trend)' },
            { value: 'hw', label: 'Holt-Winters (trend + stagionalita)' },
            { value: 'decomp', label: 'Decomposizione' },
            { value: 'acf', label: 'Autocorrelazione' }
          ]
        },
        {
          id: 'trendModel', type: 'select', label: 'Forma del trend', options: [
            { value: 'linear', label: 'Lineare' }, { value: 'quadratic', label: 'Quadratico' },
            { value: 'exponential', label: 'Esponenziale' }
          ], when: function (v) { return v.method === 'trend'; }
        },
        { id: 'w', type: 'number', label: 'Ampiezza della media mobile', value: 3, min: 2, when: function (v) { return v.method === 'ma'; } },
        { id: 'period', type: 'number', label: 'Periodo stagionale', value: 12, min: 2, when: function (v) { return ['hw', 'decomp'].indexOf(v.method) >= 0 || v.method === 'auto'; } },
        { id: 'mult', type: 'checkbox', label: 'Stagionalita moltiplicativa', value: false, when: function (v) { return ['hw', 'decomp'].indexOf(v.method) >= 0; } },
        { id: 'horizon', type: 'number', label: 'Periodi da prevedere', value: 6, min: 0, max: 60 }
      ], function () { run(); });
      L.left.appendChild(h('h3', null, 'Serie'));
      L.left.appendChild(f.el);

      function run() {
        ui.clear(L.right);
        var v = f.values();
        var y = st.clean(ds.numeric(v.y));
        if (y.length < 6) {
          L.right.appendChild(ui.verdict('Servono almeno 6 osservazioni.', 'warn'));
          return;
        }
        var ts = C3.timeseries;
        try {
          if (v.method === 'auto') {
            var auto = ts.autoForecast(y, { horizon: v.horizon, period: v.period });
            L.right.appendChild(ui.panel('Confronto dei metodi', { sub: 'ordinati per errore quadratico medio' }, [
              ui.table([
                { key: 'name', label: 'Metodo' },
                { key: function (c) { return c.res.accuracy.mape; }, label: 'MAPE %', digits: 2 },
                { key: function (c) { return c.res.accuracy.mad; }, label: 'MAD', digits: 4 },
                { key: function (c) { return c.res.accuracy.msd; }, label: 'MSD', digits: 4 }
              ], auto.all),
              ui.verdict('Metodo migliore: <b>' + auto.best.name + '</b> (MAPE ' +
                num.fmt(auto.best.res.accuracy.mape, 2) + '%). Il MAPE e l errore percentuale medio: ' +
                'sotto il 10% la previsione e generalmente buona.', 'good')
            ]));
            var box = h('div');
            L.right.appendChild(ui.panel('Previsione col metodo migliore', null, box));
            C3.plots.timeSeriesPlot(box, auto.best.res, { yLabel: v.y });
            return;
          }
          var res;
          if (v.method === 'trend') res = ts.trendAnalysis(y, { model: v.trendModel, horizon: v.horizon });
          else if (v.method === 'ma') {
            res = ts.movingAverage(y, v.w, true);
            res.fitted = res.ma;
            res.actual = res.values;
            res.method = 'Media mobile centrata (w = ' + v.w + ')';
          } else if (v.method === 'ses') res = ts.ses(y, null, v.horizon);
          else if (v.method === 'holt') res = ts.holt(y, null, null, v.horizon);
          else if (v.method === 'hw') {
            res = ts.holtWinters(y, v.period, { horizon: v.horizon, multiplicative: v.mult, alpha: 0.2, beta: 0.1, gamma: 0.3 });
            if (!res) throw new Error('Servono almeno due cicli stagionali completi (' + (2 * v.period) + ' osservazioni).');
          } else if (v.method === 'decomp') {
            var dec = ts.decompose(y, v.period, v.mult);
            L.right.appendChild(ui.panel('Decomposizione ' + dec.type, { sub: 'periodo ' + v.period }, [
              ui.kv([
                ['MAPE', num.fmt(dec.accuracy.mape, 2) + '%'],
                ['MAD', dec.accuracy.mad, 4],
                ['Equazione del trend', 'Y = ' + num.fmt(dec.trendEquation.beta[0], 4) + ' + ' +
                  num.fmt(dec.trendEquation.beta[1], 4) + 't']
              ]),
              ui.table([
                { key: function (s, i) { return 'Periodo ' + (i + 1); }, label: 'Stagione' },
                { key: function (s) { return s; }, label: v.mult ? 'Indice (moltiplicativo)' : 'Effetto (additivo)', digits: 4 }
              ], dec.seasonal)
            ]));
            var gb = h('div', { class: 'c3-grid-2' });
            L.right.appendChild(ui.panel('Componenti', null, gb));
            var d1 = h('div'), d2 = h('div'), d3 = h('div'), d4 = h('div');
            [d1, d2, d3, d4].forEach(function (x) { gb.appendChild(x); });
            C3.plots.lineChart(d1, [
              { name: 'Osservato', points: dec.actual.map(function (yy, i) { return { x: i + 1, y: yy }; }) },
              { name: 'Adattato', points: dec.fitted.map(function (yy, i) { return { x: i + 1, y: yy }; }), marker: false }
            ], { title: 'Serie e modello', xLabel: 'Periodo', yLabel: v.y, height: 250 });
            C3.plots.lineChart(d2, [{ name: 'Trend', points: dec.trend.map(function (t, i) { return { x: i + 1, y: t }; }), marker: false }],
              { title: 'Componente di trend', xLabel: 'Periodo', height: 250 });
            C3.plots.barChart(d3, dec.seasonal.map(function (s, i) { return { label: String(i + 1), value: s }; }),
              { title: 'Componente stagionale', valueLabel: v.mult ? 'indice' : 'effetto', height: 250 });
            C3.plots.lineChart(d4, [{ name: 'Residuo', points: dec.residuals.map(function (r, i) { return { x: i + 1, y: r }; }) }],
              { title: 'Residui', xLabel: 'Periodo', height: 250 });
            return;
          } else if (v.method === 'acf') {
            var acf = st.acf(y, Math.min(24, Math.floor(y.length / 3)));
            var pacf = ts.pacf(y, Math.min(24, Math.floor(y.length / 3)));
            var gb2 = h('div', { class: 'c3-grid-2' });
            L.right.appendChild(ui.panel('Autocorrelazione', { sub: 'le bande sono i limiti al 95%' }, gb2));
            var a1 = h('div'), a2 = h('div');
            gb2.appendChild(a1); gb2.appendChild(a2);
            C3.chart.render(a1, {
              title: 'Funzione di autocorrelazione (ACF)', height: 280,
              x: { label: 'Ritardo' }, y: { label: 'Autocorrelazione', domain: [-1, 1] },
              series: [{
                type: 'bars', name: 'ACF', barWidth: 10,
                points: acf.map(function (a) { return { x: a.lag, y: a.r }; })
              }],
              annotations: [
                { type: 'hline', y: 0, color: C3.chart.pal().ink2 },
                { type: 'hline', y: acf[0].upper, label: '+95%', kind: 'spec' },
                { type: 'hline', y: acf[0].lower, label: '-95%', kind: 'spec' }
              ],
              legend: false
            });
            C3.chart.render(a2, {
              title: 'Autocorrelazione parziale (PACF)', height: 280,
              x: { label: 'Ritardo' }, y: { label: 'PACF', domain: [-1, 1] },
              series: [{
                type: 'bars', name: 'PACF', barWidth: 10,
                points: pacf.map(function (a) { return { x: a.lag, y: a.pacf }; })
              }],
              annotations: [
                { type: 'hline', y: 0, color: C3.chart.pal().ink2 },
                { type: 'hline', y: pacf[0].upper, label: '+95%', kind: 'spec' },
                { type: 'hline', y: pacf[0].lower, label: '-95%', kind: 'spec' }
              ],
              legend: false
            });
            L.right.appendChild(ui.verdict('Barre che escono dalle bande indicano dipendenza dal passato: ' +
              'i dati non sono indipendenti e le carte di controllo classiche danno falsi allarmi. ' +
              'In quel caso usa carte per dati autocorrelati (EWMA sui residui di un modello) oppure allarga il passo di campionamento.', 'warn'));
            return;
          }
          L.right.appendChild(ui.panel(res.method || 'Analisi', { sub: res.equation || null }, [
            ui.kv([
              ['MAPE', num.fmt(res.accuracy.mape, 2) + '%'],
              ['MAD', res.accuracy.mad, 4],
              ['MSD', res.accuracy.msd, 4],
              res.alpha != null ? ['alpha (livello)', res.alpha, 3] : null,
              res.beta != null ? ['beta (trend)', res.beta, 3] : null,
              res.gamma != null ? ['gamma (stagionalita)', res.gamma, 3] : null
            ].filter(Boolean)),
            res.forecast && res.forecast.length ? ui.table([
              { key: 't', label: 'Periodo', digits: 0 },
              { key: 'fit', label: 'Previsione', digits: 4 },
              { key: 'lower', label: 'Limite inferiore', digits: 4 },
              { key: 'upper', label: 'Limite superiore', digits: 4 }
            ], res.forecast) : null
          ].filter(Boolean)));
          var box2 = h('div');
          L.right.appendChild(ui.panel('Grafico', null, box2));
          C3.plots.timeSeriesPlot(box2, res, { yLabel: v.y });
        } catch (e) {
          console.error(e);
          L.right.appendChild(ui.verdict('Analisi non eseguibile: ' + e.message, 'bad'));
        }
      }

      run();
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
