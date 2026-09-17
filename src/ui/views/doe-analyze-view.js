/* CLAUDIO v3 - ui/views/doe-analyze-view.js
 * Analisi degli esperimenti: fattoriali a 2 livelli, superficie di risposta,
 * miscele, Taguchi (S/N), riduzione del modello, ottimizzazione multi-risposta
 * con desiderabilita e prove di conferma.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3;
  var ui = C3.ui, h = ui.h, num = C3.numeric, st = C3.stats, doe = C3.doe;

  function alpha() { return C3.app.state.settings.alpha; }

  C3.app.registerView({
    id: 'doe-analisi',
    label: 'Analizza esperimento',
    icon: '∴',
    group: 'DoE',
    desc: 'Effetti, Pareto, normal plot, ANOVA, diagnostica dei residui, grafici degli effetti principali e delle interazioni, superficie di risposta e ottimizzazione.',
    render: function (el) {
      var ds = C3.app.ds();
      if (!ds || !ds.nrows) {
        el.appendChild(ui.empty('Nessun dato', 'Crea un piano sperimentale o carica i dati di un esperimento gia svolto.'));
        return;
      }
      var numCols = ds.numericColumns(), allCols = ds.names;
      var meta = ds.meta || {};
      var split = h('div', { class: 'split' });
      var left = h('div', { class: 'panel options-panel' });
      var right = h('div');
      split.appendChild(left);
      split.appendChild(right);
      el.appendChild(split);

      var guessFactors = (meta.factors || []).filter(function (x) { return ds.column(x); });
      if (!guessFactors.length) {
        guessFactors = numCols.filter(function (c) {
          var levels = ds.levels(c);
          return levels.length >= 2 && levels.length <= 3 && c.indexOf('(reale)') < 0;
        }).slice(0, 6);
      }
      var guessResponse = meta.response && ds.column(meta.response) ? meta.response
        : (numCols.filter(function (c) { return guessFactors.indexOf(c) < 0; })[0] || numCols[0]);

      var f = ui.form([
        {
          id: 'mode', type: 'chips', label: 'Tipo di analisi', value: 'factorial', options: [
            { value: 'factorial', label: 'Fattoriale' },
            { value: 'rsm', label: 'Superficie di risposta' },
            { value: 'mixture', label: 'Miscele' },
            { value: 'taguchi', label: 'Taguchi (S/N)' },
            { value: 'optimize', label: 'Ottimizzazione' }
          ]
        },
        { id: 'response', type: 'select', label: 'Risposta', options: numCols, value: guessResponse },
        {
          id: 'factors', type: 'multiselect', label: 'Fattori', options: allCols, size: 7,
          value: guessFactors
        },
        {
          id: 'order', type: 'select', label: 'Ordine del modello', options: [
            { value: 1, label: 'Solo effetti principali' },
            { value: 2, label: 'Effetti principali + interazioni a 2' },
            { value: 3, label: 'Fino alle interazioni a 3' }
          ], value: 2, when: function (v) { return v.mode === 'factorial'; }
        },
        {
          id: 'reduce', type: 'checkbox', label: 'Riduci il modello ai termini significativi', value: false,
          when: function (v) { return ['factorial', 'rsm'].indexOf(v.mode) >= 0; }
        },
        {
          id: 'centerCol', type: 'select', label: 'Colonna dei punti centrali (PtType)',
          options: [{ value: '', label: '(nessuna)' }].concat(allCols),
          value: ds.column('PtType') ? 'PtType' : '',
          when: function (v) { return v.mode === 'factorial'; }
        },
        {
          id: 'blockCol', type: 'select', label: 'Colonna dei blocchi',
          options: [{ value: '', label: '(nessuna)' }].concat(allCols),
          when: function (v) { return v.mode === 'factorial'; }
        },
        {
          id: 'snType', type: 'select', label: 'Rapporto S/N', options: [
            { value: 'larger', label: 'Piu grande e meglio' },
            { value: 'smaller', label: 'Piu piccolo e meglio' },
            { value: 'nominal', label: 'Valore nominale e meglio' }
          ], when: function (v) { return v.mode === 'taguchi'; }
        },
        {
          id: 'components', type: 'multiselect', label: 'Componenti della miscela', options: numCols, size: 6,
          value: meta.components || [],
          when: function (v) { return v.mode === 'mixture'; }
        },
        {
          id: 'mixDegree', type: 'select', label: 'Modello di Scheffe', options: [
            { value: 1, label: 'Lineare' }, { value: 2, label: 'Quadratico' }, { value: 3, label: 'Cubico speciale' }
          ], value: 2, when: function (v) { return v.mode === 'mixture'; }
        },
        {
          id: 'responses', type: 'multiselect', label: 'Risposte da ottimizzare', options: numCols, size: 5,
          when: function (v) { return v.mode === 'optimize'; }
        }
      ], function () { run(); });
      left.appendChild(h('h3', null, 'Modello'));
      left.appendChild(f.el);

      var goalHost = h('div');
      left.appendChild(goalHost);
      var goals = {};

      var out = h('div');
      right.appendChild(out);

      function renderGoals() {
        ui.clear(goalHost);
        var v = f.values();
        if (v.mode !== 'optimize') return;
        goalHost.appendChild(h('h3', { style: { marginTop: '12px' } }, 'Obiettivi'));
        (v.responses || []).forEach(function (r) {
          var vals = st.clean(ds.numeric(r));
          if (!goals[r]) {
            goals[r] = {
              goal: 'max', lower: num.round(st.min(vals), 4), target: num.round(st.max(vals), 4),
              upper: num.round(st.max(vals), 4), weight: 1, importance: 1
            };
          }
          var g = goals[r];
          var sel = h('select', { style: { width: 'auto' } }, [
            h('option', { value: 'max', selected: g.goal === 'max' ? true : null }, 'massimizzare'),
            h('option', { value: 'min', selected: g.goal === 'min' ? true : null }, 'minimizzare'),
            h('option', { value: 'target', selected: g.goal === 'target' ? true : null }, 'obiettivo')
          ]);
          sel.addEventListener('change', function () { g.goal = sel.value; run(); });
          var lo = h('input', { type: 'number', step: 'any', value: g.lower, style: { width: '76px' }, title: 'minimo accettabile' });
          var tg = h('input', { type: 'number', step: 'any', value: g.target, style: { width: '76px' }, title: 'obiettivo' });
          var up = h('input', { type: 'number', step: 'any', value: g.upper, style: { width: '76px' }, title: 'massimo accettabile' });
          [[lo, 'lower'], [tg, 'target'], [up, 'upper']].forEach(function (pair) {
            pair[0].addEventListener('change', function () { g[pair[1]] = Number(pair[0].value); run(); });
          });
          goalHost.appendChild(h('div', { style: { marginBottom: '6px' } }, [
            h('div', { class: 'small', text: r }),
            h('div', { class: 'row tight' }, [sel, lo, tg, up])
          ]));
        });
        goalHost.appendChild(h('div', { class: 'small muted', text: 'Per ogni risposta: obiettivo, minimo accettabile, valore ideale, massimo accettabile.' }));
      }

      function dataObj(v) {
        var obj = {};
        v.factors.forEach(function (fc) { obj[fc] = ds.numeric(fc); });
        obj[v.response] = ds.numeric(v.response);
        return obj;
      }

      function run() {
        ui.clear(out);
        renderGoals();
        var v = f.values();
        if (!v.factors.length && v.mode !== 'mixture') {
          out.appendChild(ui.verdict('Seleziona almeno un fattore.', 'warn'));
          return;
        }
        try {
          if (v.mode === 'factorial') factorial(v);
          else if (v.mode === 'rsm') rsm(v);
          else if (v.mode === 'mixture') mixture(v);
          else if (v.mode === 'taguchi') taguchi(v);
          else optimize(v);
        } catch (e) {
          console.error(e);
          out.appendChild(ui.verdict('Analisi non eseguibile: ' + e.message, 'bad'));
        }
      }

      function factorial(v) {
        var data = ds.asObject();
        var spec = {
          data: data, response: v.response, factors: v.factors,
          order: Number(v.order), alpha: alpha(),
          centerColumn: v.centerCol || null,
          blockColumn: v.blockCol || null
        };
        var a = doe.analyzeFactorial(spec);
        if (v.reduce) {
          var keep = a.effects.filter(function (e) {
            return (a.lenth ? e.significantLenth : e.p < alpha());
          }).map(function (e) { return e.term; });
          if (keep.length) {
            var extra = keep.filter(function (t) { return t.indexOf('*') >= 0; });
            var mainKeep = [];
            keep.forEach(function (t) {
              t.split('*').forEach(function (x) { if (mainKeep.indexOf(x) < 0) mainKeep.push(x); });
            });
            a = doe.analyzeFactorial(Object.assign({}, spec, {
              factors: mainKeep.filter(function (x) { return v.factors.indexOf(x) >= 0; }),
              order: 1, extraTerms: extra
            }));
            out.appendChild(ui.verdict('Modello ridotto ai termini significativi: ' + keep.join(', ') +
              '. Il principio di gerarchia impone di mantenere gli effetti principali contenuti nelle interazioni.', 'good'));
          }
        }

        if (a.droppedTerms && a.droppedTerms.length) {
          out.appendChild(ui.verdict('Il disegno ha ' + a.nRuns + ' prove: non bastano per stimare tutti i termini richiesti. ' +
            'Sono stati rimossi automaticamente i termini di ordine piu alto (' + a.droppedTerms.length +
            '), a partire da ' + a.droppedTerms.slice(0, 4).join(', ') + '. ' +
            'Con un disegno saturo gli effetti restano confusi con le interazioni: e normale nello screening.', 'warn'));
        }

        // effetti
        out.appendChild(ui.panel('Effetti stimati', {
          sub: a.lenth ? 'nessun grado di liberta per l errore: metodo di Lenth (PSE = ' + num.fmt(a.lenth.pse, 5) + ')'
            : 'S = ' + num.fmt(a.s, 5) + ', R2 = ' + num.fmt(100 * a.r2, 2) + '%'
        }, [
          ui.table([
            { key: 'term', label: 'Termine' },
            { key: 'effect', label: 'Effetto', digits: 5 },
            { key: 'coef', label: 'Coefficiente', digits: 5 },
            { key: 'se', label: 'ES', digits: 5 },
            {
              key: a.lenth ? 'tLenth' : 't', label: a.lenth ? 't di Lenth' : 't', digits: 3
            },
            a.lenth ? {
              key: 'significantLenth', label: 'Significativo', html: true,
              format: function (x) { return x ? '<span class="badge bad">si</span>' : '<span class="badge">no</span>'; }
            } : { key: 'p', label: 'p', html: true, format: function (x) { return ui.pValue(x, alpha()); } }
          ], a.effects),
          ui.kv([
            ['Media generale', a.yMean, 5],
            ['S (dev.st. dei residui)', a.s, 5],
            ['R-quadro', num.fmt(100 * a.r2, 2) + '%'],
            ['R-quadro corretto', num.fmt(100 * a.r2adj, 2) + '%'],
            ['R-quadro previsto', num.fmt(100 * a.r2press, 2) + '%'],
            a.lenth ? ['Margine di errore di Lenth (ME)', a.lenth.me, 5] : null,
            a.lenth ? ['Margine simultaneo (SME)', a.lenth.sme, 5] : null
          ].filter(Boolean)),
          ui.verdict('L <b>effetto</b> e la variazione della risposta passando dal livello basso a quello alto: ' +
            'vale il doppio del coefficiente del modello in unita codificate.', 'good'),
          ui.verdict('Equazione in unita codificate: <span class="mono">' + a.equation + '</span>', 'good')
        ]));

        // ANOVA
        var anovaRows = a.fit.anovaAdj.map(function (r) {
          return { source: r.label, df: r.df, ss: r.ss, ms: r.ms, F: r.F, p: r.p };
        });
        anovaRows.push({ source: 'Errore', df: a.fit.dfe, ss: a.fit.sse, ms: a.fit.mse, F: null, p: null });
        if (a.lackOfFit) {
          anovaRows.push({
            source: '  Lack-of-fit', df: a.lackOfFit.lofDF, ss: a.lackOfFit.lofSS,
            ms: a.lackOfFit.lofSS / a.lackOfFit.lofDF, F: a.lackOfFit.F, p: a.lackOfFit.p
          });
          anovaRows.push({
            source: '  Errore puro', df: a.lackOfFit.pureDF, ss: a.lackOfFit.pureSS,
            ms: a.lackOfFit.pureSS / a.lackOfFit.pureDF, F: null, p: null
          });
        }
        anovaRows.push({ source: 'Totale', df: a.fit.dfe + a.fit.dfm, ss: a.fit.sst, ms: null, F: null, p: null });
        out.appendChild(ui.panel('Analisi della varianza', null, [
          ui.anovaTable(anovaRows, { alpha: alpha() }),
          a.curvature ? ui.kv([
            ['Media dei punti fattoriali', a.curvature.meanFactorial, 5],
            ['Media dei punti centrali', a.curvature.meanCenter, 5],
            ['Differenza (curvatura)', a.curvature.diff, 5],
            ['t della curvatura', a.curvature.t, 4],
            ['p della curvatura', num.fmtP(a.curvature.p)]
          ]) : null,
          a.curvature && a.curvature.p < alpha()
            ? ui.verdict('<b>Curvatura significativa</b>: il modello lineare non basta. Aggiungi i punti assiali ' +
              'per completare un Central Composite Design e stimare il modello quadratico.', 'warn') : null,
          a.lackOfFit && a.lackOfFit.p < alpha()
            ? ui.verdict('<b>Lack-of-fit significativo</b>: la forma del modello non descrive bene i dati. ' +
              'Servono termini aggiuntivi (curvatura, interazioni di ordine superiore).', 'warn') : null
        ].filter(Boolean)));

        // grafici
        var gp = h('div', { class: 'c3-grid-2' });
        out.appendChild(ui.panel('Grafici degli effetti', null, gp));
        var g1 = h('div'), g2 = h('div');
        gp.appendChild(g1); gp.appendChild(g2);
        C3.plots.effectsPareto(g1, a, {});
        C3.plots.effectsNormalPlot(g2, a, { half: false });

        var me = h('div');
        out.appendChild(ui.panel('Effetti principali', { sub: 'medie della risposta per livello' }, me));
        C3.plots.mainEffectsPlot(me, a, {});

        if (v.factors.length >= 2) {
          var ip = h('div');
          out.appendChild(ui.panel('Interazioni', { sub: 'linee non parallele = interazione' }, ip));
          C3.plots.interactionPlots(ip, a, {});
        }
        if (v.factors.length >= 3) {
          var cp = h('div');
          out.appendChild(ui.panel('Cube plot', { sub: 'medie ai vertici dei primi tre fattori' }, cp));
          C3.plots.cubePlot(cp, ds.asObject(), v.factors, v.response, {});
        }

        var rp = h('div');
        out.appendChild(ui.panel('Diagnostica dei residui', null, rp));
        C3.plots.residualPlots(rp, a.fit, {});

        // previsione e impostazioni ottimali
        out.appendChild(settingsPanel(a, v));
      }

      function settingsPanel(a, v) {
        // migliore combinazione fra quelle osservate
        var data = ds.asObject();
        var best = null;
        for (var i = 0; i < ds.nrows; i++) {
          var y = C3.data.toNumber(data[v.response][i]);
          if (!isFinite(y)) continue;
          if (!best || y > best.y) best = { y: y, row: i };
        }
        var rows = v.factors.map(function (fc) {
          var levels = st.groupBy(ds.numeric(v.response), ds.col(fc));
          var bestLevel = levels.reduce(function (b, g) {
            var m = st.mean(g.values);
            return (!b || m > b.mean) ? { level: g.level, mean: m } : b;
          }, null);
          return {
            factor: fc,
            bestLevel: bestLevel.level,
            meanAtBest: bestLevel.mean,
            observed: data[fc][best.row]
          };
        });
        return ui.panel('Indicazioni operative', { sub: 'combinazione che massimizza la risposta' }, [
          ui.table([
            { key: 'factor', label: 'Fattore' },
            { key: 'bestLevel', label: 'Livello migliore (effetto principale)' },
            { key: 'meanAtBest', label: 'Media a quel livello', digits: 4 },
            { key: 'observed', label: 'Valore nella prova migliore osservata' }
          ], rows),
          ui.kv([
            ['Risposta massima osservata', best ? best.y : '-', 4],
            ['Prova corrispondente', best ? best.row + 1 : '-', 0]
          ]),
          ui.verdict('Se esistono interazioni significative, il livello migliore di un fattore dipende dagli altri: ' +
            'guarda i grafici di interazione, non solo gli effetti principali. ' +
            'Concludi sempre con una <b>prova di conferma</b> alle condizioni scelte.', 'warn')
        ]);
      }

      function rsm(v) {
        var data = ds.asObject();
        var model = doe.analyzeRSM({
          data: data, response: v.response, factors: v.factors,
          dropTerms: null
        });
        if (v.reduce) {
          var drop = [];
          model.fit.termIndex.forEach(function (ti, i) {
            if (model.fit.anovaAdj[i] && model.fit.anovaAdj[i].p > alpha() && ti.label.indexOf('^2') >= 0) {
              drop.push(ti.label);
            }
          });
          if (drop.length) {
            model = doe.analyzeRSM({ data: data, response: v.response, factors: v.factors, dropTerms: drop });
            out.appendChild(ui.verdict('Termini quadratici non significativi rimossi: ' + drop.join(', '), 'good'));
          }
        }
        var anovaRows = model.fit.anovaAdj.map(function (r) {
          return { source: r.label, df: r.df, ss: r.ss, ms: r.ms, F: r.F, p: r.p };
        });
        anovaRows.push({ source: 'Errore', df: model.fit.dfe, ss: model.fit.sse, ms: model.fit.mse, F: null, p: null });
        if (model.lackOfFit) {
          anovaRows.push({
            source: '  Lack-of-fit', df: model.lackOfFit.lofDF, ss: model.lackOfFit.lofSS,
            ms: model.lackOfFit.lofSS / model.lackOfFit.lofDF, F: model.lackOfFit.F, p: model.lackOfFit.p
          });
        }
        out.appendChild(ui.panel('Modello quadratico', { sub: 'unita codificate (-1 = livello basso, +1 = livello alto)' }, [
          ui.coefTable(model.fit, { alpha: alpha() }),
          ui.anovaTable(anovaRows, { alpha: alpha() }),
          ui.kv([
            ['S', model.s, 5],
            ['R-quadro', num.fmt(100 * model.r2, 2) + '%'],
            ['R-quadro corretto', num.fmt(100 * model.r2adj, 2) + '%'],
            ['Equazione', '<span class="mono small">' + model.equation + '</span>']
          ]),
          model.lackOfFit && model.lackOfFit.p < alpha()
            ? ui.verdict('Lack-of-fit significativo: il modello quadratico non basta. Valuta una trasformazione ' +
              'della risposta o un modello di ordine superiore.', 'warn') : null
        ].filter(Boolean)));

        if (model.stationary) {
          var s = model.stationary;
          out.appendChild(ui.panel('Punto stazionario e analisi canonica', null, [
            ui.table([
              { key: 'factor', label: 'Fattore' },
              { key: 'coded', label: 'Valore codificato', digits: 4 },
              { key: 'real', label: 'Valore reale', digits: 5 }
            ], v.factors.map(function (fc, i) {
              return { factor: fc, coded: s.coded[i], real: s.real[i] };
            })),
            ui.kv([
              ['Natura del punto', '<b>' + s.nature + '</b>'],
              ['Risposta prevista nel punto', s.predicted.fit, 5],
              ['IC della previsione', num.fmt(s.predicted.ci[0], 4) + ' ... ' + num.fmt(s.predicted.ci[1], 4)],
              ['Autovalori', s.eigenvalues.map(function (x) { return num.fmt(x, 4); }).join(' ; ')]
            ]),
            ui.verdict(s.nature === 'punto di sella'
              ? 'Il punto stazionario e una <b>sella</b>: non e un massimo ne un minimo. L ottimo si trova sul bordo ' +
                'della regione sperimentale; usa l ottimizzazione con vincoli o esplora lungo la direzione di massima pendenza.'
              : (s.coded.some(function (x) { return Math.abs(x) > 1.5; })
                ? 'Il punto stazionario cade <b>fuori dalla regione esplorata</b>: la previsione e un estrapolazione. ' +
                  'Sposta l esperimento verso quella direzione e ripeti.'
                : 'Il punto stazionario e un <b>' + s.nature + '</b> interno alla regione: e la condizione ottimale stimata.'),
              s.nature === 'punto di sella' ? 'warn' : 'good')
          ]));
        }

        // contour e superficie
        if (v.factors.length >= 2) {
          var pairs = [];
          for (var i = 0; i < v.factors.length; i++) {
            for (var j = i + 1; j < v.factors.length; j++) pairs.push([v.factors[i], v.factors[j]]);
          }
          pairs.slice(0, 3).forEach(function (pair) {
            var box = h('div', { class: 'c3-grid-2' });
            out.appendChild(ui.panel('Superficie di risposta: ' + pair[0] + ' e ' + pair[1], null, box));
            var c1 = h('div'), c2 = h('div');
            box.appendChild(c1); box.appendChild(c2);
            var pts = ds.nrows <= 60 ? (function () {
              var arr = [];
              var xi = model.ranges[pair[0]], yi = model.ranges[pair[1]];
              for (var r = 0; r < ds.nrows; r++) {
                var xr = C3.data.toNumber(ds.column(pair[0]).values[r]);
                var yr = C3.data.toNumber(ds.column(pair[1]).values[r]);
                if (!isFinite(xr) || !isFinite(yr)) continue;
                arr.push({
                  x: xi.half ? (xr - xi.mid) / xi.half : 0,
                  y: yi.half ? (yr - yi.mid) / yi.half : 0
                });
              }
              return arr;
            })() : null;
            C3.plots.contourPlot(c1, model, pair[0], pair[1], {
              coded: true, points: pts,
              xRange: [-1.6, 1.6], yRange: [-1.6, 1.6],
              optimum: model.stationary ? [
                model.stationary.coded[v.factors.indexOf(pair[0])],
                model.stationary.coded[v.factors.indexOf(pair[1])]
              ] : null
            });
            C3.plots.surfacePlot(c2, model, pair[0], pair[1], {
              xRange: [-1.6, 1.6], yRange: [-1.6, 1.6]
            });
          });
        }

        var rp2 = h('div');
        out.appendChild(ui.panel('Diagnostica dei residui', null, rp2));
        C3.plots.residualPlots(rp2, model.fit, {});

        // previsione interattiva
        var predHost = h('div');
        out.appendChild(ui.panel('Previsione in un punto', { sub: 'valori codificati fra -1,68 e 1,68' }, predHost));
        var predFields = v.factors.map(function (fc) {
          return { id: fc, type: 'number', label: fc + ' (codificato)', value: 0, step: 0.1 };
        });
        var pf = ui.form(predFields, function () { showPred(); });
        var predOut = h('div');
        predHost.appendChild(pf.el);
        predHost.appendChild(predOut);
        function showPred() {
          ui.clear(predOut);
          var vals = pf.values();
          var xc = v.factors.map(function (fc) { return Number(vals[fc]) || 0; });
          var pr = model.predictCoded(xc);
          var real = model.toReal(xc);
          predOut.appendChild(ui.kv([
            ['Valori reali', v.factors.map(function (fc, i) { return fc + ' = ' + num.fmt(real[i], 4); }).join(', ')],
            ['Risposta prevista', pr.fit, 5],
            ['IC 95% della media', num.fmt(pr.ci[0], 4) + ' ... ' + num.fmt(pr.ci[1], 4)],
            ['Intervallo di predizione', num.fmt(pr.pi[0], 4) + ' ... ' + num.fmt(pr.pi[1], 4)]
          ]));
        }
        showPred();
      }

      function mixture(v) {
        var comps = v.components.length ? v.components : v.factors;
        if (comps.length < 2) throw new Error('Servono almeno due componenti.');
        var fit = C3.designs.mixtureModel(ds.asObject(), comps, v.response, Number(v.mixDegree));
        out.appendChild(ui.panel('Modello di Scheffe per miscele', {
          sub: 'grado ' + v.mixDegree + ' - modello senza costante (le proporzioni sommano a 1)'
        }, [
          ui.table([
            { key: 'name', label: 'Termine' },
            { key: 'coef', label: 'Coefficiente', digits: 5 },
            { key: 'se', label: 'ES', digits: 5 },
            { key: 't', label: 't', digits: 3 },
            { key: 'p', label: 'p', html: true, format: function (x) { return ui.pValue(x, alpha()); } }
          ], fit.coefTable),
          ui.kv([
            ['R-quadro', num.fmt(100 * fit.r2, 2) + '%'],
            ['S', fit.s, 5],
            ['n', fit.n, 0]
          ]),
          ui.verdict('I coefficienti lineari sono la <b>risposta attesa nei componenti puri</b>. ' +
            'I termini incrociati positivi indicano sinergia fra due componenti, negativi antagonismo.', 'good')
        ]));
        if (comps.length === 3) {
          var tern = h('div');
          out.appendChild(ui.panel('Diagramma ternario', { sub: 'risposta prevista su tutto il simplesso' }, tern));
          var grid = fit.ternaryGrid(36);
          var vmin = Math.min.apply(null, grid.map(function (g) { return g.y; }));
          var vmax = Math.max.apply(null, grid.map(function (g) { return g.y; }));
          C3.chart.renderTernary(tern, {
            title: v.response, labels: comps, grid: grid, vmin: vmin, vmax: vmax,
            points: ds.rows().map(function (r) {
              return { a: C3.data.toNumber(r[comps[0]]), b: C3.data.toNumber(r[comps[1]]), c: C3.data.toNumber(r[comps[2]]) };
            }).filter(function (p) { return isFinite(p.a) && isFinite(p.b) && isFinite(p.c); })
          });
          C3.chart.colorScaleBar(tern, vmin, vmax, { label: v.response });
        }
        var trace = h('div');
        out.appendChild(ui.panel('Response trace (direzioni di Cox)', {
          sub: 'effetto di aumentare un componente mantenendo costanti i rapporti fra gli altri'
        }, trace));
        var tr = fit.responseTrace(25);
        C3.chart.render(trace, {
          title: 'Risposta lungo le direzioni dei componenti',
          height: 300,
          x: { label: 'Proporzione del componente', gridlines: true },
          y: { label: v.response },
          series: tr.map(function (t, i) {
            return {
              type: 'line', name: t.component, marker: false, width: 2,
              points: t.points.map(function (p) { return { x: p.x, y: p.y, label: t.component }; }),
              color: C3.chart.seriesColor(i)
            };
          })
        });
        var rp3 = h('div');
        out.appendChild(ui.panel('Diagnostica dei residui', null, rp3));
        C3.plots.residualPlots(rp3, fit, {});
      }

      function taguchi(v) {
        // raggruppa per combinazione dei fattori e calcola S/N
        var keys = {}, order = [];
        for (var i = 0; i < ds.nrows; i++) {
          var key = v.factors.map(function (fc) { return String(ds.column(fc).values[i]); }).join('|');
          if (!keys[key]) { keys[key] = []; order.push(key); }
          var y = C3.data.toNumber(ds.column(v.response).values[i]);
          if (isFinite(y)) keys[key].push(y);
        }
        var rows = order.map(function (k, i) {
          var vals = keys[k];
          var parts = k.split('|');
          var o = { run: i + 1, n: vals.length, mean: st.mean(vals), sd: vals.length > 1 ? st.sd(vals) : null };
          v.factors.forEach(function (fc, j) { o[fc] = parts[j]; });
          o.sn = doe.signalToNoise(vals, v.snType);
          return o;
        });
        out.appendChild(ui.panel('Rapporti segnale/rumore', { sub: tipoSN(v.snType) }, [
          ui.table([{ key: 'run', label: '#', digits: 0 }]
            .concat(v.factors.map(function (fc) { return { key: fc, label: fc }; }))
            .concat([
              { key: 'n', label: 'n', digits: 0 },
              { key: 'mean', label: 'Media', digits: 4 },
              { key: 'sd', label: 'Dev.st.', digits: 4 },
              { key: 'sn', label: 'S/N (dB)', digits: 4 }
            ]), rows),
          ui.verdict('Il rapporto S/N si <b>massimizza sempre</b>, qualunque sia l obiettivo: ' +
            'e costruito in modo che valori piu alti indichino un processo piu robusto al rumore.', 'good')
        ]));
        // effetti su S/N e su media
        var snData = {};
        v.factors.forEach(function (fc) { snData[fc] = rows.map(function (r) { return r[fc]; }); });
        snData.__sn = rows.map(function (r) { return r.sn; });
        snData.__mean = rows.map(function (r) { return r.mean; });
        var tables = [
          { title: 'Risposta media per livello: S/N', col: '__sn' },
          { title: 'Risposta media per livello: media', col: '__mean' }
        ];
        tables.forEach(function (tb) {
          var res = v.factors.map(function (fc) {
            var g = st.groupBy(snData[tb.col], snData[fc]);
            var means = g.map(function (x) { return st.mean(x.values); });
            var delta = st.max(means) - st.min(means);
            var o = { factor: fc, delta: delta };
            g.forEach(function (x, i) { o['L' + (i + 1)] = st.mean(x.values); });
            o.best = g[means.indexOf(st.max(means))].level;
            return o;
          });
          res.sort(function (a, b) { return b.delta - a.delta; });
          res.forEach(function (r, i) { r.rank = i + 1; });
          var maxLev = Math.max.apply(null, res.map(function (r) {
            return Object.keys(r).filter(function (k) { return k[0] === 'L'; }).length;
          }));
          var cols = [{ key: 'factor', label: 'Fattore' }];
          for (var L = 1; L <= maxLev; L++) cols.push({ key: 'L' + L, label: 'Livello ' + L, digits: 4 });
          cols.push({ key: 'delta', label: 'Delta (max - min)', digits: 4 });
          cols.push({ key: 'rank', label: 'Ordine di importanza', digits: 0 });
          cols.push({ key: 'best', label: 'Livello migliore' });
          out.appendChild(ui.panel(tb.title, null, ui.table(cols, res)));
          var box = h('div', { class: 'c3-grid-3' });
          out.appendChild(ui.panel('Grafico: ' + tb.title, null, box));
          v.factors.forEach(function (fc) {
            var g = st.groupBy(snData[tb.col], snData[fc]);
            var c = h('div');
            box.appendChild(c);
            C3.plots.lineChart(c, [{
              name: fc,
              points: g.map(function (x, i) { return { x: i, y: st.mean(x.values), label: x.level }; })
            }], {
              title: fc, height: 200, xBand: true,
              categories: g.map(function (x) { return x.level; }),
              yLabel: tb.col === '__sn' ? 'S/N (dB)' : 'media'
            });
          });
        });
        out.appendChild(ui.verdict('Approccio in due passi di Taguchi: <b>1)</b> scegli i livelli dei fattori che ' +
          'massimizzano S/N (riducono la sensibilita al rumore); <b>2)</b> usa un fattore che influenza solo la media ' +
          '(fattore di regolazione) per centrare la risposta sul target.', 'good'));
      }

      function tipoSN(t) {
        return t === 'larger' ? 'piu grande e meglio: -10 log(media di 1/y^2)'
          : (t === 'nominal' ? 'valore nominale: 10 log(media^2 / varianza)'
            : 'piu piccolo e meglio: -10 log(media di y^2)');
      }

      function optimize(v) {
        var responses = v.responses && v.responses.length ? v.responses : [v.response];
        var models = responses.map(function (r) {
          return {
            model: doe.analyzeRSM({ data: ds.asObject(), response: r, factors: v.factors }),
            goal: goals[r] ? goals[r].goal : 'max',
            lower: goals[r] ? goals[r].lower : null,
            target: goals[r] ? goals[r].target : null,
            upper: goals[r] ? goals[r].upper : null,
            weight: 1, importance: 1
          };
        });
        var res = doe.optimize({
          models: models,
          bounds: v.factors.map(function () { return [-1, 1]; })
        });
        out.appendChild(ui.panel('Ottimizzazione multi-risposta', { sub: 'desiderabilita di Derringer-Suich' }, [
          ui.table([
            { key: 'factor', label: 'Fattore' },
            { key: 'coded', label: 'Valore codificato', digits: 4 },
            { key: 'real', label: 'Valore da impostare', digits: 5 }
          ], v.factors.map(function (fc, i) {
            return { factor: fc, coded: res.coded[i], real: res.real[i] };
          })),
          ui.table([
            { key: 'response', label: 'Risposta' },
            { key: 'goal', label: 'Obiettivo' },
            { key: 'fit', label: 'Valore previsto', digits: 5 },
            { key: function (r) { return num.fmt(r.ci[0], 4) + ' ... ' + num.fmt(r.ci[1], 4); }, label: 'IC della media' },
            { key: function (r) { return num.fmt(r.pi[0], 4) + ' ... ' + num.fmt(r.pi[1], 4); }, label: 'Intervallo di predizione' },
            { key: 'd', label: 'Desiderabilita', digits: 4 }
          ], res.responses),
          ui.kv([['Desiderabilita composita D', res.D, 4]]),
          ui.verdict(res.D > 0.8
            ? 'Soluzione buona: tutte le risposte sono vicine ai valori desiderati.'
            : (res.D > 0.5
              ? 'Compromesso accettabile: qualche risposta resta lontana dall ideale. Valuta di allargare i limiti o cambiare le importanze.'
              : 'Nessuna combinazione soddisfa bene tutti gli obiettivi: gli obiettivi sono in conflitto o la regione esplorata e sbagliata.'),
            res.D > 0.8 ? 'good' : (res.D > 0.5 ? 'warn' : 'bad')),
          ui.verdict('La desiderabilita trasforma ogni risposta in un punteggio da 0 (inaccettabile) a 1 (ideale) ' +
            'e ne fa la media geometrica: basta una risposta a 0 perche D diventi 0. ' +
            'Concludi con una <b>prova di conferma</b> alle condizioni trovate e verifica che il risultato cada nell intervallo di predizione.', 'good')
        ]));
        if (v.factors.length >= 2) {
          var box = h('div', { class: 'c3-grid-2' });
          out.appendChild(ui.panel('Contour delle risposte all ottimo', null, box));
          models.forEach(function (m) {
            var c = h('div');
            box.appendChild(c);
            var hold = {};
            v.factors.forEach(function (fc, i) {
              if (i > 1) hold[fc] = res.coded[i];
            });
            C3.plots.contourPlot(c, m.model, v.factors[0], v.factors[1], {
              coded: true, hold: hold, height: 300,
              optimum: [res.coded[0], res.coded[1]],
              title: m.model.response
            });
          });
        }
      }

      renderGoals();
      run();
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
