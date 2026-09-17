/* CLAUDIO v3 - ui/views/capability-view.js
 * Analisi di capacita: normale, non normale (distribuzione fittata o
 * trasformazione), attributi (binomiale e Poisson), sixpack con carte,
 * conversioni sigma/DPMO.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3;
  var ui = C3.ui, h = ui.h, num = C3.numeric, st = C3.stats, cap = C3.capability;

  C3.app.registerView({
    id: 'capacita',
    label: 'Capacita di processo',
    icon: '△',
    group: 'Six Sigma',
    desc: 'Cp, Cpk, Pp, Ppk, Cpm, Z.bench, PPM attesi e osservati, livello sigma, intervalli di confidenza, capacita non normale e per attributi.',
    render: function (el) {
      var ds = C3.app.ds();
      if (!ds || !ds.nrows) {
        el.appendChild(ui.empty('Nessun dato', 'Carica un dataset per analizzare la capacita.'));
        return;
      }
      var numCols = ds.numericColumns(), catCols = ds.categoricalColumns();
      var meta = ds.meta || {};
      var split = h('div', { class: 'split' });
      var left = h('div', { class: 'panel options-panel' });
      var right = h('div');
      split.appendChild(left);
      split.appendChild(right);
      el.appendChild(split);

      var f = ui.form([
        {
          id: 'mode', type: 'chips', label: 'Tipo di analisi', value: 'normal', options: [
            { value: 'normal', label: 'Normale' },
            { value: 'sixpack', label: 'Sixpack' },
            { value: 'nonnormal', label: 'Non normale' },
            { value: 'binomial', label: 'Attributi: % difettosi' },
            { value: 'poisson', label: 'Attributi: difetti per unita' },
            { value: 'convert', label: 'Conversioni sigma' }
          ]
        },
        {
          id: 'value', type: 'select', label: 'Variabile', options: numCols,
          when: function (v) { return ['normal', 'sixpack', 'nonnormal'].indexOf(v.mode) >= 0; }
        },
        {
          id: 'subMode', type: 'chips', label: 'Sottogruppi', value: 'size', options: [
            { value: 'size', label: 'Dimensione fissa' },
            { value: 'by', label: 'Da colonna' }
          ], when: function (v) { return ['normal', 'sixpack'].indexOf(v.mode) >= 0; }
        },
        {
          id: 'size', type: 'number', label: 'Dimensione del sottogruppo', value: meta.subgroupSize || 1, min: 1, max: 25,
          when: function (v) { return ['normal', 'sixpack'].indexOf(v.mode) >= 0 && v.subMode === 'size'; }
        },
        {
          id: 'by', type: 'select', label: 'Colonna di raggruppamento', options: catCols.concat(numCols),
          when: function (v) { return ['normal', 'sixpack'].indexOf(v.mode) >= 0 && v.subMode === 'by'; }
        },
        { id: 'lsl', type: 'number', label: 'Limite inferiore di specifica (LSL)', value: meta.lsl != null ? meta.lsl : null },
        { id: 'usl', type: 'number', label: 'Limite superiore di specifica (USL)', value: meta.usl != null ? meta.usl : null },
        { id: 'target', type: 'number', label: 'Obiettivo (target)', value: meta.target != null ? meta.target : null },
        {
          id: 'method', type: 'select', label: 'Metodo per dati non normali', options: [
            { value: 'dist', label: 'Distribuzione fittata' },
            { value: 'boxcox', label: 'Trasformazione Box-Cox' },
            { value: 'johnson', label: 'Trasformazione di Johnson' }
          ], when: function (v) { return v.mode === 'nonnormal'; }
        },
        {
          id: 'distKey', type: 'select', label: 'Distribuzione', options: [
            { value: 'weibull', label: 'Weibull' }, { value: 'lognormal', label: 'Lognormale' },
            { value: 'gamma', label: 'Gamma' }, { value: 'exponential', label: 'Esponenziale' },
            { value: 'logistic', label: 'Logistica' }, { value: 'sev', label: 'Valore estremo minore' }
          ], when: function (v) { return v.mode === 'nonnormal' && v.method === 'dist'; }
        },
        {
          id: 'defectives', type: 'select', label: 'Colonna difettosi', options: numCols,
          when: function (v) { return v.mode === 'binomial'; }
        },
        {
          id: 'inspected', type: 'select', label: 'Colonna ispezionati', options: numCols,
          when: function (v) { return v.mode === 'binomial'; }
        },
        {
          id: 'defects', type: 'select', label: 'Colonna difetti', options: numCols,
          when: function (v) { return v.mode === 'poisson'; }
        },
        {
          id: 'units', type: 'select', label: 'Colonna unita ispezionate',
          options: [{ value: '', label: '(1 per riga)' }].concat(numCols),
          when: function (v) { return v.mode === 'poisson'; }
        },
        {
          id: 'opportunities', type: 'number', label: 'Opportunita di difetto per unita', value: 1, min: 1,
          when: function (v) { return v.mode === 'poisson'; }
        },
        {
          id: 'convValue', type: 'number', label: 'Valore da convertire', value: 3.4,
          when: function (v) { return v.mode === 'convert'; }
        },
        {
          id: 'convFrom', type: 'select', label: 'Il valore rappresenta', options: [
            { value: 'dpmo', label: 'DPMO (difetti per milione)' },
            { value: 'sigma', label: 'Livello sigma' },
            { value: 'yield', label: 'Rendimento %' },
            { value: 'cpk', label: 'Cpk' }
          ], when: function (v) { return v.mode === 'convert'; }
        }
      ], function () { run(); });
      left.appendChild(h('h3', null, 'Impostazioni'));
      left.appendChild(f.el);
      left.appendChild(h('div', { class: 'small muted', html: 'Riferimenti industriali: Cpk >= 1,33 processo capace; ' +
        'Cpk >= 1,67 buono; Cpk = 2,0 equivale al livello 6 sigma.' }));

      var out = h('div');
      right.appendChild(out);

      function run() {
        ui.clear(out);
        var v = f.values();
        try {
          if (v.mode === 'convert') return conversions(v);
          if (v.mode === 'binomial') return binomial(v);
          if (v.mode === 'poisson') return poisson(v);
          if (v.mode === 'nonnormal') return nonNormal(v);
          return normal(v);
        } catch (e) {
          console.error(e);
          out.appendChild(ui.verdict('Analisi non eseguibile: ' + e.message, 'bad'));
        }
      }

      function specCheck(v) {
        if (v.lsl == null && v.usl == null) {
          out.appendChild(ui.verdict('Inserisci almeno un limite di specifica (LSL o USL): senza specifica ' +
            'non esiste il concetto di capacita, esiste solo la variabilita.', 'warn'));
          return false;
        }
        if (v.lsl != null && v.usl != null && v.lsl >= v.usl) {
          out.appendChild(ui.verdict('Il limite inferiore deve essere minore di quello superiore.', 'bad'));
          return false;
        }
        return true;
      }

      function normal(v) {
        if (!specCheck(v)) return;
        var groups = v.subMode === 'by'
          ? C3.control.makeSubgroups(ds.numeric(v.value), { by: ds.col(v.by) })
          : null;
        var c = cap.normalCapability({
          values: ds.numeric(v.value),
          lsl: v.lsl, usl: v.usl, target: v.target,
          subgroupSize: v.subMode === 'by' ? null : (v.size || 1),
          groups: groups,
          conf: 1 - C3.app.state.settings.alpha
        });
        var verd = cap.verdict(c.within.cpk);
        var kpiRow = h('div', { class: 'grid-4 mb' });
        out.appendChild(kpiRow);
        C3.plots.kpiTile(kpiRow, {
          label: 'Cpk (breve termine)', value: num.fmt(c.within.cpk, 3),
          sub: 'IC: ' + num.fmt(c.ci.cpk[0], 3) + ' ... ' + num.fmt(c.ci.cpk[1], 3),
          status: c.within.cpk >= 1.33 ? 'good' : (c.within.cpk >= 1 ? 'warn' : 'bad'),
          statusLabel: verd.level
        });
        C3.plots.kpiTile(kpiRow, {
          label: 'Ppk (lungo termine)', value: num.fmt(c.overall.cpk, 3),
          sub: 'IC: ' + num.fmt(c.ci.ppk[0], 3) + ' ... ' + num.fmt(c.ci.ppk[1], 3),
          status: c.overall.cpk >= 1.33 ? 'good' : (c.overall.cpk >= 1 ? 'warn' : 'bad')
        });
        C3.plots.kpiTile(kpiRow, {
          label: 'PPM attesi (lungo termine)', value: num.fmt(c.overall.ppmTotal, 1),
          sub: 'osservati: ' + num.fmt(c.observed.ppmTotal, 1)
        });
        C3.plots.kpiTile(kpiRow, {
          label: 'Livello sigma', value: num.fmt(c.sigmaLevel, 2),
          sub: 'con spostamento di 1,5 sigma'
        });

        var chartBox = h('div');
        out.appendChild(ui.panel('Istogramma con limiti di specifica', null, chartBox));
        C3.plots.capabilityChart(chartBox, c, { name: v.value });

        out.appendChild(ui.panel('Indici di capacita', { sub: 'within = breve termine, overall = lungo termine' }, [
          ui.table([
            { key: 'label', label: 'Indice' },
            { key: 'within', label: 'Within (potenziale)', digits: 4 },
            { key: 'overall', label: 'Overall (prestazione)', digits: 4 },
            { key: 'note', label: 'Significato' }
          ], [
            { label: 'Cp / Pp', within: c.within.cp, overall: c.overall.cp, note: 'ampiezza della specifica rispetto alla dispersione (ignora il centraggio)' },
            { label: 'Cpk / Ppk', within: c.within.cpk, overall: c.overall.cpk, note: 'indice peggiore fra i due lati: tiene conto del centraggio' },
            { label: 'CPU / PPU', within: c.within.cpu, overall: c.overall.cpu, note: 'distanza dal limite superiore in unita di 3 sigma' },
            { label: 'CPL / PPL', within: c.within.cpl, overall: c.overall.cpl, note: 'distanza dal limite inferiore in unita di 3 sigma' },
            { label: 'Cpm', within: c.within.cpm, overall: c.overall.cpm, note: 'penalizza lo scostamento dal target' },
            { label: 'Z.bench', within: c.within.zBench, overall: c.overall.zBench, note: 'numero di sigma equivalente alla frazione fuori specifica' },
            { label: 'PPM totali', within: c.within.ppmTotal, overall: c.overall.ppmTotal, note: 'pezzi fuori specifica per milione' },
            { label: 'Resa %', within: c.within.yield, overall: c.overall.yield, note: 'percentuale entro specifica' }
          ]),
          ui.kv([
            ['n', c.n, 0],
            ['Media', c.mean, 5],
            ['Sigma within (breve termine)', c.sigmaWithin, 6],
            ['Sigma overall (lungo termine)', c.sdOverall, 6],
            ['Rapporto overall/within', num.fmt(c.sdOverall / c.sigmaWithin, 3) +
              (c.sdOverall / c.sigmaWithin > 1.3 ? ' <b>(instabilita nel tempo)</b>' : '')],
            ['Scostamento dal centro della specifica (k)', c.within.k != null ? num.fmt(c.within.k, 2) + '%' : '-'],
            ['IC ' + Math.round(100 * c.conf) + '% per Cp', num.fmt(c.ci.cp[0], 4) + ' ... ' + num.fmt(c.ci.cp[1], 4)],
            ['Normalita (Anderson-Darling)', 'A2 = ' + num.fmt(c.normality.A2, 4) + ', p = ' + num.fmtP(c.normality.p)],
            ['Difettosi osservati', c.observed.below + ' sotto LSL, ' + c.observed.above + ' sopra USL']
          ]),
          ui.verdict('<b>' + verd.level.toUpperCase() + '</b>: ' + verd.text +
            (c.overall.cpk < c.within.cpk * 0.8
              ? ' Il divario fra Ppk e Cpk indica che il processo <b>si sposta nel tempo</b>: prima di migliorare la dispersione conviene stabilizzarlo.'
              : ''),
            c.within.cpk >= 1.33 ? 'good' : (c.within.cpk >= 1 ? 'warn' : 'bad')),
          c.normality.p < 0.05
            ? ui.verdict('I dati non sono normali (p = ' + num.fmtP(c.normality.p) + '): gli indici e i PPM attesi ' +
              'possono essere molto sbagliati. Usa la modalita <b>Non normale</b>.', 'warn') : null
        ].filter(Boolean)));

        // cosa serve per migliorare
        var need = [];
        if (c.within.cp < 1.33 && v.lsl != null && v.usl != null) {
          var sigmaNeeded = (v.usl - v.lsl) / (6 * 1.33);
          need.push(['Sigma massima per Cp = 1,33', num.fmt(sigmaNeeded, 5) +
            ' (attuale ' + num.fmt(c.sigmaWithin, 5) + ', riduzione del ' +
            num.fmt(100 * (1 - sigmaNeeded / c.sigmaWithin), 1) + '%)']);
        }
        if (v.lsl != null && v.usl != null) {
          need.push(['Centro della specifica', num.fmt((v.lsl + v.usl) / 2, 5) + ' (media attuale ' + num.fmt(c.mean, 5) + ')']);
          need.push(['Cpk ottenibile solo centrando il processo', num.fmt(c.within.cp, 4)]);
        }
        need.push(['Numerosita per stimare Cpk con precisione 10%', C3.power.nForCpk(c.within.cpk, 0.1, c.conf)]);
        out.appendChild(ui.panel('Leve di miglioramento', null, [
          ui.kv(need),
          ui.verdict('Due strade: <b>centrare</b> (sposta la media, spesso rapido e poco costoso) e ' +
            '<b>ridurre la variabilita</b> (serve intervenire sulle cause: DoE, manutenzione, controllo dei materiali).', 'good')
        ]));
      }

      function nonNormal(v) {
        if (!specCheck(v)) return;
        var c = cap.nonNormalCapability({
          values: ds.numeric(v.value), lsl: v.lsl, usl: v.usl, target: v.target,
          method: v.method, distKey: v.distKey
        });
        if (!c) { out.appendChild(ui.verdict('Trasformazione non riuscita su questi dati.', 'bad')); return; }
        var isTransf = v.method !== 'dist';
        var ppk = isTransf ? c.overall.cpk : c.overall.ppk;
        var ppmTot = c.overall.ppmTotal;
        var kpiRow = h('div', { class: 'grid-4 mb' });
        out.appendChild(kpiRow);
        C3.plots.kpiTile(kpiRow, {
          label: 'Ppk', value: num.fmt(ppk, 3), sub: c.kind,
          status: ppk >= 1.33 ? 'good' : (ppk >= 1 ? 'warn' : 'bad')
        });
        C3.plots.kpiTile(kpiRow, { label: 'PPM attesi', value: num.fmt(ppmTot, 1), sub: 'dal modello adattato' });
        C3.plots.kpiTile(kpiRow, { label: 'PPM osservati', value: num.fmt(c.observed.ppmTotal, 1), sub: 'conteggio diretto' });
        C3.plots.kpiTile(kpiRow, { label: 'Livello sigma', value: num.fmt(c.sigmaLevel, 2), sub: 'con spostamento 1,5' });

        var rows = [];
        if (isTransf) {
          rows = [
            ['Metodo', c.kind],
            ['Cp (dati trasformati)', num.fmt(c.overall.cp, 4)],
            ['Cpk (dati trasformati)', num.fmt(c.overall.cpk, 4)],
            ['PPM attesi', num.fmt(c.overall.ppmTotal, 2)],
            ['Normalita dopo trasformazione', 'p = ' + num.fmtP(c.normality.p)]
          ];
        } else {
          rows = [
            ['Distribuzione', c.dist.label],
            ['Parametri stimati', c.params.map(function (p) { return num.fmt(p, 5); }).join(' ; ')],
            ['Anderson-Darling', num.fmt(c.ad, 4)],
            ['Percentile 0,135%', num.fmt(c.percentiles.p00135, 5)],
            ['Mediana', num.fmt(c.percentiles.median, 5)],
            ['Percentile 99,865%', num.fmt(c.percentiles.p99865, 5)],
            ['Pp (metodo ISO sui percentili)', num.fmt(c.overall.pp, 4)],
            ['Ppk', num.fmt(c.overall.ppk, 4)],
            ['PPM attesi', num.fmt(c.overall.ppmTotal, 2)]
          ];
        }
        out.appendChild(ui.panel('Capacita non normale', { sub: c.kind }, [
          ui.kv(rows),
          ui.verdict('Con dati non normali gli indici si calcolano sui <b>percentili</b> della distribuzione ' +
            'adattata (0,135% e 99,865%, equivalenti a +/- 3 sigma della normale), oppure si trasformano i dati. ' +
            'Riportare sempre quale metodo e stato usato.', 'good')
        ]));
        var box = h('div', { class: 'c3-grid-2' });
        out.appendChild(ui.panel('Grafici', null, box));
        var b1 = h('div'), b2 = h('div');
        box.appendChild(b1); box.appendChild(b2);
        var xv = st.clean(ds.numeric(v.value));
        C3.plots.histogram(b1, xv, {
          name: v.value, title: 'Dati con limiti di specifica',
          lines: [
            v.lsl != null ? { value: v.lsl, label: 'LSL', kind: 'spec' } : null,
            v.usl != null ? { value: v.usl, label: 'USL', kind: 'spec' } : null
          ].filter(Boolean),
          normalCurve: false
        });
        if (!isTransf) {
          C3.plots.probabilityPlot(b2, xv, {
            dist: c.dist, params: c.params, name: v.value,
            title: 'Probability plot - ' + c.dist.label
          });
        } else {
          C3.plots.probabilityPlot(b2, c.values, { name: 'valore trasformato', title: 'Normalita dopo trasformazione' });
        }
        // confronto tra distribuzioni
        var fits = cap.bestDistribution(xv);
        out.appendChild(ui.panel('Confronto fra distribuzioni', { sub: 'AD piu bassa = adattamento migliore' },
          ui.table([
            { key: 'label', label: 'Distribuzione' },
            { key: 'ad', label: 'Anderson-Darling', digits: 4 },
            { key: 'aic', label: 'AIC', digits: 2 },
            { key: function (r) { return r.params.map(function (p) { return num.fmt(p, 4); }).join('; '); }, label: 'Parametri' }
          ], fits)));
      }

      function binomial(v) {
        var c = cap.binomialCapability({
          defectives: ds.numeric(v.defectives), sizes: ds.numeric(v.inspected),
          conf: 1 - C3.app.state.settings.alpha
        });
        var kpiRow = h('div', { class: 'grid-4 mb' });
        out.appendChild(kpiRow);
        C3.plots.kpiTile(kpiRow, { label: '% difettosi', value: num.fmt(c.pctDefective, 3), unit: '%', sub: 'IC: ' + num.fmt(c.ciPct[0], 3) + ' ... ' + num.fmt(c.ciPct[1], 3) + '%' });
        C3.plots.kpiTile(kpiRow, { label: 'PPM', value: num.fmt(c.ppm, 0) });
        C3.plots.kpiTile(kpiRow, { label: 'Livello sigma', value: num.fmt(c.sigmaLevel, 2), sub: 'con spostamento 1,5' });
        C3.plots.kpiTile(kpiRow, { label: 'Resa', value: num.fmt(c.yield, 3), unit: '%' });
        out.appendChild(ui.panel('Capacita per attributi (binomiale)', null, [
          ui.kv([
            ['Difettosi totali', c.totalDefectives, 0],
            ['Pezzi ispezionati', c.totalInspected, 0],
            ['Proporzione difettosa', c.pDefective, 6],
            ['Z.bench', c.zBench, 4],
            ['Punti fuori controllo nella carta p', c.chart.outOfControl, 0]
          ]),
          ui.verdict(c.chart.outOfControl
            ? 'La carta p mostra punti fuori controllo: il processo non e stabile, la stima della percentuale difettosa non e affidabile come previsione.'
            : 'La carta p e in controllo: la percentuale difettosa stimata e una previsione ragionevole.',
            c.chart.outOfControl ? 'warn' : 'good')
        ]));
        var box = h('div', { class: 'c3-grid-2' });
        out.appendChild(ui.panel('Grafici', null, box));
        var b1 = h('div'), b2 = h('div');
        box.appendChild(b1); box.appendChild(b2);
        C3.plots.controlChart(b1, c.chart, { yLabel: 'Frazione difettosa' });
        C3.plots.lineChart(b2, [{
          name: '% difettosi cumulata',
          points: c.cumulative.map(function (o) { return { x: o.index + 1, y: 100 * o.p }; })
        }], { title: 'Stabilizzazione della stima', xLabel: 'Campione', yLabel: '% difettosi cumulata', height: 260 });
      }

      function poisson(v) {
        var c = cap.poissonCapability({
          defects: ds.numeric(v.defects),
          sizes: v.units ? ds.numeric(v.units) : null,
          opportunities: v.opportunities,
          conf: 1 - C3.app.state.settings.alpha
        });
        var kpiRow = h('div', { class: 'grid-4 mb' });
        out.appendChild(kpiRow);
        C3.plots.kpiTile(kpiRow, { label: 'DPU (difetti per unita)', value: num.fmt(c.dpu, 4), sub: 'IC: ' + num.fmt(c.ci[0], 4) + ' ... ' + num.fmt(c.ci[1], 4) });
        C3.plots.kpiTile(kpiRow, { label: 'DPMO', value: c.dpmo != null ? num.fmt(c.dpmo, 0) : '-', sub: v.opportunities + ' opportunita per unita' });
        C3.plots.kpiTile(kpiRow, { label: 'Unita senza difetti', value: num.fmt(100 * c.pZeroDefects, 2), unit: '%' });
        C3.plots.kpiTile(kpiRow, { label: 'Livello sigma', value: num.fmt(c.sigmaLevel, 2) });
        out.appendChild(ui.panel('Capacita per attributi (Poisson)', null, [
          ui.kv([
            ['Difetti totali', c.totalDefects, 0],
            ['Unita ispezionate', c.totalUnits, 2],
            ['DPU', c.dpu, 5],
            ['Probabilita di unita perfetta', num.fmt(100 * c.pZeroDefects, 3) + '%'],
            ['Punti fuori controllo nella carta u', c.chart.outOfControl, 0]
          ]),
          ui.verdict('Il DPU conta i difetti, non i pezzi difettosi: un pezzo puo avere piu difetti. ' +
            'La resa in prima passata si stima con exp(-DPU).', 'good')
        ]));
        var box = h('div');
        out.appendChild(ui.panel('Carta u', null, box));
        C3.plots.controlChart(box, c.chart, { yLabel: 'Difetti per unita' });
      }

      function conversions(v) {
        var dpmo, sigma, yieldPct, cpk;
        if (v.convFrom === 'dpmo') { dpmo = v.convValue; sigma = cap.ppmToSigma(dpmo); }
        else if (v.convFrom === 'sigma') { sigma = v.convValue; dpmo = cap.sigmaToPpm(sigma); }
        else if (v.convFrom === 'yield') { dpmo = (100 - v.convValue) * 1e4; sigma = cap.ppmToSigma(dpmo); }
        else { cpk = v.convValue; sigma = 3 * cpk + 1.5; dpmo = cap.sigmaToPpm(sigma); }
        yieldPct = 100 - dpmo / 1e4;
        out.appendChild(ui.panel('Conversione', null, [
          ui.kv([
            ['DPMO', num.fmt(dpmo, 2)],
            ['Livello sigma (con spostamento 1,5)', num.fmt(sigma, 3)],
            ['Livello sigma (processo centrato)', num.fmt(cap.ppmToSigma(dpmo, 0), 3)],
            ['Resa', num.fmt(yieldPct, 5) + '%'],
            ['Cpk equivalente (breve termine)', num.fmt((sigma - 1.5) / 3, 3)],
            ['Cpk equivalente (lungo termine)', num.fmt(sigma / 3, 3)]
          ]),
          ui.verdict('Lo <b>spostamento di 1,5 sigma</b> e la convenzione Six Sigma per passare dal breve al lungo ' +
            'termine: un processo con Cp = 2 (6 sigma di breve termine) produce 3,4 DPMO se la media si sposta di 1,5 sigma.', 'good')
        ]));
        var table = C3.sixsigma.conversionTable();
        out.appendChild(ui.panel('Tabella di riferimento', null,
          ui.table([
            { key: 'sigma', label: 'Livello sigma', digits: 1 },
            { key: 'dpmoShifted', label: 'DPMO (con spostamento 1,5)', digits: 1 },
            { key: 'yieldShifted', label: 'Resa %', digits: 4 },
            { key: 'dpmoCentered', label: 'DPMO (centrato)', digits: 4 },
            { key: 'cpk', label: 'Cpk corrispondente', digits: 3 }
          ], table)));
        var box = h('div');
        out.appendChild(ui.panel('Dal livello sigma ai difetti', null, box));
        C3.chart.render(box, {
          title: 'DPMO in funzione del livello sigma',
          height: 300,
          x: { label: 'Livello sigma', gridlines: true },
          y: { label: 'DPMO', type: 'log' },
          series: [{
            type: 'line', name: 'con spostamento 1,5 sigma', marker: false, width: 2.5,
            points: (function () {
              var pts = [];
              for (var s = 1; s <= 6.5; s += 0.1) pts.push({ x: s, y: Math.max(0.01, cap.sigmaToPpm(s)) });
              return pts;
            })()
          }, {
            type: 'line', name: 'processo centrato', marker: false, width: 2, dash: '5 3',
            points: (function () {
              var pts = [];
              for (var s = 1; s <= 6.5; s += 0.1) pts.push({ x: s, y: Math.max(0.01, cap.sigmaToPpm(s, 0)) });
              return pts;
            })()
          }]
        });
      }

      run();
    }
  });

  /* ==================================================================
     SIXPACK: registrato come modalita della vista capacita, ma con
     rendering dedicato richiamato da normal() quando mode = sixpack
     ================================================================== */
  var originalRegister = null;

  C3.app.registerView({
    id: 'sixpack',
    label: 'Sixpack di capacita',
    icon: '▤',
    group: 'Six Sigma',
    desc: 'Vista compatta in stile relazione: carte di controllo, ultimi sottogruppi, istogramma, probability plot e indici di capacita in un unico quadro.',
    render: function (el) {
      var ds = C3.app.ds();
      if (!ds || !ds.nrows) {
        el.appendChild(ui.empty('Nessun dato', 'Carica un dataset.'));
        return;
      }
      var numCols = ds.numericColumns();
      var meta = ds.meta || {};
      var split = h('div', { class: 'split' });
      var left = h('div', { class: 'panel options-panel' });
      var right = h('div');
      split.appendChild(left);
      split.appendChild(right);
      el.appendChild(split);
      var f = ui.form([
        { id: 'value', type: 'select', label: 'Variabile', options: numCols },
        { id: 'size', type: 'number', label: 'Dimensione del sottogruppo', value: meta.subgroupSize || 1, min: 1, max: 25 },
        { id: 'lsl', type: 'number', label: 'LSL', value: meta.lsl != null ? meta.lsl : null },
        { id: 'usl', type: 'number', label: 'USL', value: meta.usl != null ? meta.usl : null },
        { id: 'target', type: 'number', label: 'Target', value: meta.target != null ? meta.target : null }
      ], function () { run(); });
      left.appendChild(h('h3', null, 'Impostazioni'));
      left.appendChild(f.el);
      var out = h('div');
      right.appendChild(out);

      function run() {
        ui.clear(out);
        var v = f.values();
        if (v.lsl == null && v.usl == null) {
          out.appendChild(ui.verdict('Inserisci almeno un limite di specifica.', 'warn'));
          return;
        }
        try {
          var sp = cap.sixpack({
            values: ds.numeric(v.value), lsl: v.lsl, usl: v.usl, target: v.target,
            subgroupSize: v.size || 1
          });
          var c = sp.capability;
          var kpiRow = h('div', { class: 'grid-4 mb' });
          out.appendChild(kpiRow);
          C3.plots.kpiTile(kpiRow, {
            label: 'Cp', value: num.fmt(c.within.cp, 3),
            status: c.within.cp >= 1.33 ? 'good' : 'warn'
          });
          C3.plots.kpiTile(kpiRow, {
            label: 'Cpk', value: num.fmt(c.within.cpk, 3),
            status: c.within.cpk >= 1.33 ? 'good' : (c.within.cpk >= 1 ? 'warn' : 'bad')
          });
          C3.plots.kpiTile(kpiRow, { label: 'Ppk', value: num.fmt(c.overall.cpk, 3) });
          C3.plots.kpiTile(kpiRow, {
            label: 'Stabilita', value: sp.chart.outOfControl === 0 ? 'in controllo' : sp.chart.outOfControl + ' allarmi',
            status: sp.chart.outOfControl === 0 ? 'good' : 'bad'
          });

          var cbox = h('div');
          out.appendChild(ui.panel('Carte di controllo', null, cbox));
          C3.plots.controlChart(cbox, sp.chart, { yLabel: v.value });

          var grid = h('div', { class: 'c3-grid-2' });
          out.appendChild(ui.panel('Capacita e forma della distribuzione', null, grid));
          var g1 = h('div'), g2 = h('div'), g3 = h('div'), g4 = h('div');
          [g1, g2, g3, g4].forEach(function (x) { grid.appendChild(x); });
          C3.plots.capabilityChart(g1, c, { name: v.value, title: 'Capacita' });
          C3.plots.probabilityPlot(g2, c.values, { name: v.value, title: 'Normalita' });
          C3.chart.render(g3, {
            title: 'Ultimi 25 sottogruppi',
            height: 250,
            x: { label: 'Sottogruppo' }, y: { label: v.value },
            series: [{
              type: 'points', name: 'Valori', markerSize: 3.5,
              points: (function () {
                var pts = [];
                (sp.chart.groups || []).slice(-25).forEach(function (g, i) {
                  g.values.forEach(function (y) { pts.push({ x: i + 1, y: y }); });
                });
                return pts;
              })()
            }, {
              type: 'line', name: 'Media del sottogruppo', markerSize: 4,
              points: sp.chart.primary.slice(-25).map(function (p, i) { return { x: i + 1, y: p.value }; }),
              color: C3.chart.seriesColor(1)
            }]
          });
          C3.plots.boxplot(g4, [{ level: v.value, values: c.values }], {
            title: 'Distribuzione complessiva', yLabel: v.value,
            annotations: [
              v.lsl != null ? { type: 'hline', y: v.lsl, label: 'LSL', kind: 'spec' } : null,
              v.usl != null ? { type: 'hline', y: v.usl, label: 'USL', kind: 'spec' } : null
            ].filter(Boolean)
          });

          out.appendChild(ui.panel('Riepilogo', null, ui.kv([
            ['Media', c.mean, 5],
            ['Sigma within', c.sigmaWithin, 6],
            ['Sigma overall', c.sdOverall, 6],
            ['Cp / Cpk', num.fmt(c.within.cp, 3) + ' / ' + num.fmt(c.within.cpk, 3)],
            ['Pp / Ppk', num.fmt(c.overall.cp, 3) + ' / ' + num.fmt(c.overall.cpk, 3)],
            ['PPM attesi (within / overall)', num.fmt(c.within.ppmTotal, 1) + ' / ' + num.fmt(c.overall.ppmTotal, 1)],
            ['PPM osservati', num.fmt(c.observed.ppmTotal, 1)],
            ['Normalita p (AD)', num.fmtP(sp.normality.p)],
            ['Punti fuori controllo', sp.chart.outOfControl, 0]
          ])));
        } catch (e) {
          console.error(e);
          out.appendChild(ui.verdict('Analisi non eseguibile: ' + e.message, 'bad'));
        }
      }
      run();
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
