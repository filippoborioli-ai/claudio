/* CLAUDIO v3 - ui/views/msa-view.js
 * Analisi del sistema di misura: Gage R&R incrociato e annidato,
 * studio di bias e linearita, concordanza per attributi, risoluzione.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3;
  var ui = C3.ui, h = ui.h, num = C3.numeric, st = C3.stats, msa = C3.msa;

  C3.app.registerView({
    id: 'msa',
    label: 'Sistema di misura (MSA)',
    icon: '⚖',
    group: 'Six Sigma',
    desc: 'Gage R&R con metodo ANOVA e Xbar-R, studio annidato per prove distruttive, bias e linearita, concordanza fra valutatori per dati categorici.',
    render: function (el) {
      var ds = C3.app.ds();
      if (!ds || !ds.nrows) {
        el.appendChild(ui.empty('Nessun dato', 'Carica un dataset con misure ripetute di piu pezzi e operatori.'));
        return;
      }
      var numCols = ds.numericColumns(), catCols = ds.categoricalColumns(), allCols = ds.names;
      var split = h('div', { class: 'split' });
      var left = h('div', { class: 'panel options-panel' });
      var right = h('div');
      split.appendChild(left);
      split.appendChild(right);
      el.appendChild(split);

      var f = ui.form([
        {
          id: 'mode', type: 'chips', label: 'Studio', value: 'crossed', options: [
            { value: 'crossed', label: 'Gage R&R incrociato' },
            { value: 'nested', label: 'Annidato (distruttivo)' },
            { value: 'bias', label: 'Bias e linearita' },
            { value: 'attr', label: 'Attributi (concordanza)' },
            { value: 'res', label: 'Risoluzione' }
          ]
        },
        {
          id: 'value', type: 'select', label: 'Misura', options: numCols,
          when: function (v) { return ['crossed', 'nested'].indexOf(v.mode) >= 0; }
        },
        {
          id: 'part', type: 'select', label: 'Pezzo', options: allCols,
          when: function (v) { return ['crossed', 'nested'].indexOf(v.mode) >= 0; }
        },
        {
          id: 'operator', type: 'select', label: 'Operatore', options: allCols,
          when: function (v) { return ['crossed', 'nested'].indexOf(v.mode) >= 0; }
        },
        {
          id: 'tolerance', type: 'number', label: 'Tolleranza (USL - LSL)', value: (ds.meta && ds.meta.tolerance) || null,
          when: function (v) { return ['crossed', 'nested', 'res'].indexOf(v.mode) >= 0; }
        },
        {
          id: 'studyVar', type: 'number', label: 'Moltiplicatore study variation', value: 6, min: 3, max: 6.5, step: 0.15,
          when: function (v) { return ['crossed', 'nested'].indexOf(v.mode) >= 0; },
          hint: '6 = 99,73% (AIAG), 5,15 = 99% (vecchia convenzione)'
        },
        {
          id: 'alphaPool', type: 'number', label: 'Alpha per escludere l interazione', value: 0.25, step: 0.05,
          when: function (v) { return v.mode === 'crossed'; }
        },
        {
          id: 'reference', type: 'select', label: 'Valore di riferimento', options: numCols,
          when: function (v) { return v.mode === 'bias'; }
        },
        {
          id: 'measured', type: 'select', label: 'Valore misurato', options: numCols,
          when: function (v) { return v.mode === 'bias'; }
        },
        {
          id: 'processVar', type: 'number', label: 'Variazione di processo (6 sigma)', value: null,
          when: function (v) { return v.mode === 'bias'; }
        },
        {
          id: 'appraiser', type: 'select', label: 'Valutatore', options: allCols,
          when: function (v) { return v.mode === 'attr'; }
        },
        {
          id: 'item', type: 'select', label: 'Pezzo', options: allCols,
          when: function (v) { return v.mode === 'attr'; }
        },
        {
          id: 'rating', type: 'select', label: 'Giudizio', options: allCols,
          when: function (v) { return v.mode === 'attr'; }
        },
        {
          id: 'standard', type: 'select', label: 'Standard di riferimento (opzionale)',
          options: [{ value: '', label: '(nessuno)' }].concat(allCols),
          when: function (v) { return v.mode === 'attr'; }
        },
        {
          id: 'increment', type: 'number', label: 'Risoluzione dello strumento', value: 0.01, step: 0.001,
          when: function (v) { return v.mode === 'res'; }
        },
        {
          id: 'processSd', type: 'number', label: 'Sigma del processo', value: null,
          when: function (v) { return v.mode === 'res'; }
        }
      ], function () { run(); });
      left.appendChild(h('h3', null, 'Studio'));
      left.appendChild(f.el);

      var out = h('div');
      right.appendChild(out);

      function run() {
        ui.clear(out);
        var v = f.values();
        try {
          if (v.mode === 'crossed') crossed(v);
          else if (v.mode === 'nested') nested(v);
          else if (v.mode === 'bias') bias(v);
          else if (v.mode === 'attr') attr(v);
          else resolution(v);
        } catch (e) {
          console.error(e);
          out.appendChild(ui.verdict('Analisi non eseguibile: ' + e.message, 'bad'));
        }
      }

      function componentsTable(rr) {
        return ui.table([
          { key: 'source', label: 'Fonte' },
          { key: 'varComp', label: 'Componente di varianza', digits: 7 },
          { key: 'pctContribution', label: '% contributo', digits: 2 },
          { key: 'sd', label: 'Dev.st.', digits: 6 },
          { key: 'studyVar', label: 'Study Var (' + rr.studyVarMultiplier + ' x SD)', digits: 6 },
          { key: 'pctStudyVar', label: '% Study Var', digits: 2 },
          {
            key: 'pctTolerance', label: '% Tolleranza', digits: 2,
            format: function (x) { return x == null ? '-' : num.fmt(x, 2); }
          }
        ], rr.components);
      }

      function crossed(v) {
        var rr = msa.gageRRCrossed({
          values: ds.numeric(v.value),
          parts: ds.col(v.part),
          operators: ds.col(v.operator),
          tolerance: v.tolerance || null,
          studyVar: v.studyVar || 6,
          alphaPool: v.alphaPool
        });
        if (!rr.balanced) {
          out.appendChild(ui.verdict(rr.error, 'bad'));
          return;
        }
        var kpi = h('div', { class: 'grid-4 mb' });
        out.appendChild(kpi);
        C3.plots.kpiTile(kpi, {
          label: '% Study Var (Gage R&R)', value: num.fmt(rr.pctStudyVarRR, 2), unit: '%',
          status: rr.pctStudyVarRR < 10 ? 'good' : (rr.pctStudyVarRR < 30 ? 'warn' : 'bad'),
          statusLabel: rr.pctStudyVarRR < 10 ? 'accettabile' : (rr.pctStudyVarRR < 30 ? 'marginale' : 'non accettabile')
        });
        C3.plots.kpiTile(kpi, {
          label: '% contributo alla varianza', value: num.fmt(rr.pctContributionRR, 2), unit: '%',
          status: rr.pctContributionRR < 1 ? 'good' : (rr.pctContributionRR < 9 ? 'warn' : 'bad')
        });
        C3.plots.kpiTile(kpi, {
          label: '% tolleranza', value: rr.pctToleranceRR != null ? num.fmt(rr.pctToleranceRR, 2) : '-', unit: '%',
          sub: rr.tolerance ? 'tolleranza ' + rr.tolerance : 'tolleranza non indicata'
        });
        C3.plots.kpiTile(kpi, {
          label: 'Categorie distinte (ndc)', value: rr.ndc,
          status: rr.ndc >= 5 ? 'good' : 'bad', sub: 'servono almeno 5'
        });

        out.appendChild(ui.panel('Tabella ANOVA', {
          sub: rr.pooledInteraction
            ? 'interazione pezzo x operatore esclusa (p = ' + num.fmtP(rr.pInteraction) + ' > ' + v.alphaPool + ')'
            : 'interazione pezzo x operatore inclusa (p = ' + num.fmtP(rr.pInteraction) + ')'
        }, [
          ui.anovaTable(rr.anova.map(function (r) {
            return { source: r.source, df: r.df, ss: r.ss, ms: r.ms, F: r.F, p: r.p };
          }), { alpha: C3.app.state.settings.alpha }),
          ui.verdict('Procedura standard: se l interazione ha p > ' + v.alphaPool +
            ' viene eliminata dal modello e la sua varianza confluisce nella ripetibilita.', 'good')
        ]));

        out.appendChild(ui.panel('Componenti della variazione', { sub: 'metodo ANOVA' }, [
          componentsTable(rr),
          ui.kv([
            ['Pezzi', rr.nParts, 0], ['Operatori', rr.nOperators, 0],
            ['Prove per combinazione', rr.nReplicates, 0], ['Misure totali', rr.n, 0],
            ['Ripetibilita (EV)', Math.sqrt(rr.varRepeat), 6],
            ['Riproducibilita (AV)', Math.sqrt(rr.varRepro), 6],
            ['Variazione pezzo-a-pezzo (PV)', Math.sqrt(rr.varPart), 6]
          ]),
          ui.verdict('<b>' + rr.verdict + '</b>', rr.pctStudyVarRR < 10 ? 'good' : (rr.pctStudyVarRR < 30 ? 'warn' : 'bad')),
          ui.verdict('Criteri AIAG: %Study Var < 10% accettabile, 10-30% marginale (decidere in base a criticita e costi), ' +
            '> 30% non accettabile. Il %contributo si giudica su < 1%, 1-9%, > 9%. ' +
            'Se la ripetibilita domina, il problema e lo strumento; se domina la riproducibilita, il problema e il metodo o la formazione.', 'good')
        ]));

        out.appendChild(ui.panel('Metodo Xbar-R (confronto)', { sub: 'metodo classico media e range' },
          ui.kv([
            ['Ripetibilita EV', rr.xbarR.ev, 6],
            ['Riproducibilita AV', rr.xbarR.av, 6],
            ['Variazione pezzi PV', rr.xbarR.pv, 6],
            ['Gage R&R', rr.xbarR.rr, 6],
            ['Variazione totale TV', rr.xbarR.tv, 6],
            ['%EV / %AV / %PV', num.fmt(rr.xbarR.pctEV, 2) + '% / ' + num.fmt(rr.xbarR.pctAV, 2) + '% / ' + num.fmt(rr.xbarR.pctPV, 2) + '%'],
            ['%R&R', num.fmt(rr.xbarR.pctRR, 2) + '%'],
            ['ndc', rr.xbarR.ndc, 0]
          ])));

        var gbox = h('div');
        out.appendChild(ui.panel('Grafici del Gage R&R', null, gbox));
        C3.plots.gageRRCharts(gbox, rr, {});

        // run chart
        var runBox = h('div');
        out.appendChild(ui.panel('Gage run chart', { sub: 'tutte le misure nell ordine, per pezzo e operatore' }, runBox));
        var parts = rr.levelsParts, ops = rr.levelsOperators;
        C3.chart.render(runBox, {
          title: 'Misure per pezzo e operatore',
          height: 300,
          x: { type: 'band', categories: parts, label: 'Pezzo' },
          y: { label: v.value },
          series: ops.map(function (o, oi) {
            var pts = [];
            parts.forEach(function (p, pi) {
              (rr.cells[p + '' + o] || []).forEach(function (val, k) {
                pts.push({ x: pi + (oi - (ops.length - 1) / 2) * 0.18, y: val, label: p + ' / ' + o });
              });
            });
            return { type: 'points', name: o, points: pts, color: C3.chart.seriesColor(oi), markerSize: 4 };
          })
        });
      }

      function nested(v) {
        var rr = msa.gageRRNested({
          values: ds.numeric(v.value),
          parts: ds.col(v.part),
          operators: ds.col(v.operator),
          tolerance: v.tolerance || null,
          studyVar: v.studyVar || 6
        });
        if (!rr.balanced) { out.appendChild(ui.verdict(rr.error, 'bad')); return; }
        out.appendChild(ui.panel('Gage R&R annidato', { sub: 'ogni pezzo misurato da un solo operatore' }, [
          ui.anovaTable(rr.anova.map(function (r) {
            return { source: r.source, df: r.df, ss: r.ss, ms: r.ms, F: r.F, p: r.p };
          }), { alpha: C3.app.state.settings.alpha }),
          componentsTable(rr),
          ui.kv([
            ['Operatori', rr.nOperators, 0],
            ['Pezzi per operatore', rr.nPartsPerOperator, 0],
            ['Prove', rr.nReplicates, 0],
            ['% Study Var (R&R)', num.fmt(rr.pctStudyVarRR, 2) + '%'],
            ['Categorie distinte', rr.ndc, 0]
          ]),
          ui.verdict('<b>' + rr.verdict + '</b>', rr.pctStudyVarRR < 10 ? 'good' : (rr.pctStudyVarRR < 30 ? 'warn' : 'bad')),
          ui.verdict('Lo studio annidato si usa quando la misura <b>distrugge il pezzo</b>: non e possibile ' +
            'ripetere la stessa misura, quindi si assume che i pezzi dello stesso lotto siano identici.', 'good')
        ]));
      }

      function bias(v) {
        var b = msa.biasLinearity({
          reference: ds.numeric(v.reference),
          measured: ds.numeric(v.measured),
          tolerance: v.tolerance || null,
          processVar: v.processVar || null
        });
        out.appendChild(ui.panel('Bias e linearita', { sub: b.n + ' misure' }, [
          ui.kv([
            ['Bias medio', b.meanBias, 6],
            ['IC del bias', num.fmt(b.ciBias[0], 6) + ' ... ' + num.fmt(b.ciBias[1], 6)],
            ['t del bias', b.t, 4],
            ['p (bias = 0)', num.fmtP(b.p)],
            ['% bias sulla tolleranza', b.pctBiasTolerance != null ? num.fmt(b.pctBiasTolerance, 2) + '%' : '-'],
            ['Pendenza della linearita', b.linearity.slope, 6],
            ['p (pendenza = 0)', num.fmtP(b.linearity.pSlope)],
            ['Intercetta', b.linearity.intercept, 6],
            ['R-quadro del modello del bias', num.fmt(100 * b.linearity.r2, 2) + '%'],
            ['Linearita assoluta sul campo di misura', b.linearity.linearityAbs, 6]
          ]),
          ui.verdict('<b>' + b.verdict + '</b>', (b.p > 0.05 && b.linearity.pSlope > 0.05) ? 'good' : 'warn'),
          ui.table([
            { key: 'reference', label: 'Riferimento', digits: 5 },
            { key: 'n', label: 'n', digits: 0 },
            { key: 'meanBias', label: 'Bias medio', digits: 6 },
            { key: 'sd', label: 'Dev.st.', digits: 6 },
            { key: function (r) { return num.fmt(r.ci[0], 5) + ' ... ' + num.fmt(r.ci[1], 5); }, label: 'IC del bias' },
            { key: 'p', label: 'p', html: true, format: function (x) { return x == null ? '-' : ui.pValue(x); } }
          ], b.byLevel, { caption: 'bias per livello di riferimento' })
        ]));
        var gbox = h('div', { class: 'c3-grid-2' });
        out.appendChild(ui.panel('Grafici', null, gbox));
        var g1 = h('div'), g2 = h('div');
        gbox.appendChild(g1); gbox.appendChild(g2);
        C3.plots.scatter(g1, b.points.map(function (p) { return p.reference; }), b.points.map(function (p) { return p.bias; }), {
          xName: 'Valore di riferimento', yName: 'Bias', title: 'Linearita del bias', showCI: true
        });
        C3.plots.scatter(g2, b.points.map(function (p) { return p.reference; }), b.points.map(function (p) { return p.measured; }), {
          xName: 'Valore di riferimento', yName: 'Valore misurato', title: 'Misurato vs riferimento', showCI: false
        });
      }

      function attr(v) {
        var data = [];
        for (var i = 0; i < ds.nrows; i++) {
          var a = ds.column(v.appraiser).values[i];
          var it = ds.column(v.item).values[i];
          var rt = ds.column(v.rating).values[i];
          if (a == null || it == null || rt == null) continue;
          data.push({ appraiser: a, item: it, trial: i, rating: rt });
        }
        var std = null;
        if (v.standard) {
          std = {};
          for (var j = 0; j < ds.nrows; j++) {
            var itj = ds.column(v.item).values[j];
            var sv = ds.column(v.standard).values[j];
            if (itj != null && sv != null) std[String(itj)] = sv;
          }
        }
        var r = msa.attributeAgreement({ data: data, standard: std });
        out.appendChild(ui.panel('Concordanza entro valutatore', { sub: 'ripetibilita del giudizio' },
          ui.table([
            { key: 'appraiser', label: 'Valutatore' },
            { key: 'inspected', label: 'Pezzi', digits: 0 },
            { key: 'matched', label: 'Concordanti', digits: 0 },
            { key: 'pct', label: '% concordanza', digits: 2 },
            { key: function (x) { return x.ci ? num.fmt(x.ci[0], 1) + '% ... ' + num.fmt(x.ci[1], 1) + '%' : '-'; }, label: 'IC 95%' }
          ], r.within)));
        if (r.vsStandard) {
          out.appendChild(ui.panel('Valutatore contro standard', { sub: 'accuratezza del giudizio' }, [
            ui.table([
              { key: 'appraiser', label: 'Valutatore' },
              { key: 'inspected', label: 'Pezzi', digits: 0 },
              { key: 'matched', label: 'Corretti', digits: 0 },
              { key: 'pct', label: '% corretti', digits: 2 },
              { key: 'kappa', label: 'Kappa di Cohen', digits: 4 },
              {
                key: function (x) { return msa.kappaVerdict(x.kappa); }, label: 'Interpretazione'
              },
              { key: 'kappaP', label: 'p', html: true, format: function (x) { return x == null ? '-' : ui.pValue(x); } }
            ], r.vsStandard),
            ui.verdict('Kappa corregge la concordanza per il caso: sopra 0,75 il sistema e generalmente accettabile, ' +
              'sotto 0,40 va rivisto (definizioni operative, campioni limite, formazione).', 'good')
          ]));
        }
        out.appendChild(ui.panel('Concordanza fra valutatori e riepilogo', null, [
          ui.kv([
            ['Pezzi valutati', r.between.inspected, 0],
            ['Pezzi con giudizio unanime', r.between.matched, 0],
            ['% concordanza fra tutti', num.fmt(r.between.pct, 2) + '%'],
            ['IC 95%', r.between.ci ? num.fmt(r.between.ci[0], 1) + '% ... ' + num.fmt(r.between.ci[1], 1) + '%' : '-'],
            ['Kappa di Fleiss', r.between.fleissKappa ? num.fmt(r.between.fleissKappa.kappa, 4) +
              ' (' + msa.kappaVerdict(r.between.fleissKappa.kappa) + ')' : '-'],
            r.allVsStandard ? ['% tutti corretti vs standard', num.fmt(r.allVsStandard.pct, 2) + '%'] : null
          ].filter(Boolean)),
          ui.verdict('<b>' + r.verdict + '</b>', r.between.pct >= 90 ? 'good' : (r.between.pct >= 80 ? 'warn' : 'bad'))
        ]));
        var box = h('div');
        out.appendChild(ui.panel('Grafico della concordanza', null, box));
        C3.plots.barChart(box, r.within.map(function (w) { return { label: w.appraiser, value: w.pct }; })
          .concat(r.vsStandard ? r.vsStandard.map(function (s) { return { label: s.appraiser + ' vs std', value: s.pct }; }) : []),
          { title: '% di concordanza', valueLabel: '%', valueLabels: true, height: 280 });
      }

      function resolution(v) {
        var r = msa.resolutionCheck(v.increment, v.tolerance, v.processSd);
        out.appendChild(ui.panel('Verifica della risoluzione', null, [
          ui.kv([
            ['Risoluzione dello strumento', r.increment, 6],
            ['% della tolleranza', r.pctTolerance != null ? num.fmt(r.pctTolerance, 2) + '%' : '-'],
            ['% della variazione di processo', r.pctProcess != null ? num.fmt(r.pctProcess, 2) + '%' : '-'],
            ['Esito', r.ok == null ? 'indicare la tolleranza' : (r.ok ? 'adeguata' : 'insufficiente')]
          ]),
          ui.verdict(r.note, r.ok ? 'good' : 'warn'),
          ui.verdict('Se lo strumento discrimina meno di 5 categorie sulla variazione di processo, ' +
            'le carte di controllo mostrano gradini artificiali e i test statistici perdono potenza.', 'good')
        ]));
      }

      run();
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
