/* CLAUDIO v3 - ui/views/spc-view.js
 * Controllo statistico di processo: carte per variabili e attributi,
 * carte ad alta sensibilita, test di Nelson configurabili, fasi.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3;
  var ui = C3.ui, h = ui.h, num = C3.numeric, st = C3.stats, ctrl = C3.control;

  var CHARTS = [
    { value: 'auto', label: 'Scelta automatica in base al sottogruppo' },
    { value: 'i-mr', label: 'I-MR (individuali e range mobile)' },
    { value: 'xbar-r', label: 'Xbar-R (sottogruppi 2-8)' },
    { value: 'xbar-s', label: 'Xbar-S (sottogruppi >= 9)' },
    { value: 'ewma', label: 'EWMA (piccoli scostamenti)' },
    { value: 'cusum', label: 'CUSUM (somme cumulate)' },
    { value: 'ma', label: 'Media mobile' },
    { value: 'z-mr', label: 'Z-MR (lotti brevi, piu prodotti)' },
    { value: 'p', label: 'Carta p (frazione difettosa)' },
    { value: 'np', label: 'Carta np (numero di difettosi)' },
    { value: 'c', label: 'Carta c (difetti per unita costante)' },
    { value: 'u', label: 'Carta u (difetti per unita variabile)' },
    { value: 'p-laney', label: "Carta p' di Laney (sovradispersione)" },
    { value: 'u-laney', label: "Carta u' di Laney (sovradispersione)" }
  ];

  C3.app.registerView({
    id: 'spc',
    label: 'Carte di controllo',
    icon: '⌇',
    group: 'Six Sigma',
    desc: 'Carte di controllo per variabili e attributi con gli 8 test di Nelson, stima della sigma di breve termine, fasi del processo e carte ad alta sensibilita.',
    render: function (el) {
      var ds = C3.app.ds();
      if (!ds || !ds.nrows) {
        el.appendChild(ui.empty('Nessun dato', 'Carica un dataset per costruire una carta di controllo.'));
        return;
      }
      var numCols = ds.numericColumns(), catCols = ds.categoricalColumns();
      var split = h('div', { class: 'split' });
      var left = h('div', { class: 'panel options-panel' });
      var right = h('div');
      split.appendChild(left);
      split.appendChild(right);
      el.appendChild(split);

      var testsCfg = {};
      Object.keys(ctrl.NELSON_DEFAULT).forEach(function (k) {
        testsCfg[k] = { on: ctrl.NELSON_DEFAULT[k].on };
      });

      var f = ui.form([
        { id: 'chart', type: 'select', label: 'Tipo di carta', options: CHARTS },
        {
          id: 'value', type: 'select', label: 'Variabile misurata', options: numCols,
          when: function (v) { return ['p', 'np', 'c', 'u', 'p-laney', 'u-laney'].indexOf(v.chart) < 0; }
        },
        {
          id: 'counts', type: 'select', label: 'Colonna dei conteggi (difetti/difettosi)', options: numCols,
          when: function (v) { return ['p', 'np', 'c', 'u', 'p-laney', 'u-laney'].indexOf(v.chart) >= 0; }
        },
        {
          id: 'sizes', type: 'select', label: 'Colonna della numerosita ispezionata',
          options: [{ value: '', label: '(costante = 1)' }].concat(numCols),
          when: function (v) { return ['p', 'np', 'u', 'p-laney', 'u-laney'].indexOf(v.chart) >= 0; }
        },
        {
          id: 'subMode', type: 'chips', label: 'Sottogruppi', value: 'size', options: [
            { value: 'size', label: 'Dimensione fissa' },
            { value: 'by', label: 'Da colonna' }
          ], when: function (v) { return ['i-mr', 'xbar-r', 'xbar-s', 'auto', 'ewma', 'cusum', 'ma'].indexOf(v.chart) >= 0; }
        },
        {
          id: 'size', type: 'number', label: 'Dimensione del sottogruppo', value: 1, min: 1, max: 25,
          when: function (v) { return v.subMode === 'size' && ['p', 'np', 'c', 'u', 'p-laney', 'u-laney', 'z-mr'].indexOf(v.chart) < 0; }
        },
        {
          id: 'by', type: 'select', label: 'Colonna di raggruppamento', options: catCols.concat(numCols),
          when: function (v) { return v.subMode === 'by' && ['p', 'np', 'c', 'u', 'p-laney', 'u-laney', 'z-mr'].indexOf(v.chart) < 0; }
        },
        {
          id: 'prod', type: 'select', label: 'Colonna prodotto/codice', options: catCols,
          when: function (v) { return v.chart === 'z-mr'; }
        },
        {
          id: 'sigmaMethod', type: 'select', label: 'Stima della sigma di breve termine', options: [
            { value: 'rbar', label: 'Range medio / d2 (classico)' },
            { value: 'sbar', label: 'Dev.st. media / c4' },
            { value: 'pooled', label: 'Deviazione standard combinata' },
            { value: 'mssd', label: 'MSSD (differenze quadratiche successive)' },
            { value: 'medianmr', label: 'Mediana dei range mobili' }
          ], when: function (v) { return ['p', 'np', 'c', 'u', 'p-laney', 'u-laney'].indexOf(v.chart) < 0; }
        },
        { id: 'mrLength', type: 'number', label: 'Lunghezza del range mobile', value: 2, min: 2, max: 10, when: function (v) { return ['i-mr', 'auto'].indexOf(v.chart) >= 0; } },
        { id: 'lambda', type: 'number', label: 'Lambda (peso EWMA)', value: 0.2, step: 0.05, min: 0.05, max: 1, when: function (v) { return v.chart === 'ewma'; } },
        { id: 'L', type: 'number', label: 'Larghezza dei limiti (in sigma)', value: 3, step: 0.1, when: function (v) { return v.chart === 'ewma'; } },
        { id: 'hCusum', type: 'number', label: 'h (soglia di decisione)', value: 4, step: 0.5, when: function (v) { return v.chart === 'cusum'; } },
        { id: 'kCusum', type: 'number', label: 'k (valore di riferimento)', value: 0.5, step: 0.1, when: function (v) { return v.chart === 'cusum'; } },
        { id: 'w', type: 'number', label: 'Ampiezza della media mobile', value: 3, min: 2, when: function (v) { return v.chart === 'ma'; } },
        { id: 'stages', type: 'text', label: 'Fasi: indici di inizio separati da virgola', value: '', hint: 'es. 26,51 crea tre fasi con limiti ricalcolati' },
        { id: 'muFixed', type: 'number', label: 'Media di riferimento (vuoto = stimata)', value: null },
        { id: 'sigmaFixed', type: 'number', label: 'Sigma di riferimento (vuoto = stimata)', value: null }
      ], function () { run(); });

      left.appendChild(h('h3', null, 'Carta'));
      left.appendChild(f.el);

      left.appendChild(h('h3', { style: { marginTop: '14px' } }, 'Test di Nelson'));
      Object.keys(ctrl.NELSON_DEFAULT).forEach(function (k) {
        var def = ctrl.NELSON_DEFAULT[k];
        var cb = h('input', { type: 'checkbox', checked: def.on ? true : null });
        cb.addEventListener('change', function () {
          testsCfg[k].on = cb.checked;
          run();
        });
        left.appendChild(h('label', { class: 'check' }, [cb, h('span', { class: 'small', text: k + '. ' + def.label })]));
      });

      var out = h('div');
      right.appendChild(out);

      function run() {
        ui.clear(out);
        var v = f.values();
        try {
          var stages = (v.stages || '').split(',').map(function (s) { return parseInt(s.trim(), 10); })
            .filter(function (x) { return isFinite(x) && x > 1; }).map(function (x) { return x - 1; });
          var chart;
          var isAttr = ['p', 'np', 'c', 'u', 'p-laney', 'u-laney'].indexOf(v.chart) >= 0;
          if (isAttr) {
            chart = ctrl.attributeChart({
              type: v.chart,
              counts: ds.numeric(v.counts),
              sizes: v.sizes ? ds.numeric(v.sizes) : null,
              labels: null,
              tests: testsCfg
            });
          } else if (v.chart === 'z-mr') {
            chart = ctrl.zmrChart({
              values: ds.numeric(v.value), by: ds.col(v.prod), tests: testsCfg
            });
          } else {
            var common = {
              values: ds.numeric(v.value),
              size: v.subMode === 'size' ? (v.size || 1) : null,
              by: v.subMode === 'by' ? ds.col(v.by) : null,
              sigmaMethod: v.sigmaMethod,
              mrLength: v.mrLength,
              stages: stages,
              tests: testsCfg,
              mu: v.muFixed != null && v.muFixed !== '' ? Number(v.muFixed) : null,
              sigma: v.sigmaFixed != null && v.sigmaFixed !== '' ? Number(v.sigmaFixed) : null
            };
            if (v.chart === 'ewma') chart = ctrl.ewmaChart(Object.assign({ lambda: v.lambda, L: v.L }, common));
            else if (v.chart === 'cusum') chart = ctrl.cusumChart(Object.assign({ h: v.hCusum, k: v.kCusum, target: common.mu }, common));
            else if (v.chart === 'ma') chart = ctrl.movingAverageChart(Object.assign({ w: v.w }, common));
            else chart = ctrl.variableChart(Object.assign({ type: v.chart }, common));
          }

          var chartBox = h('div');
          out.appendChild(ui.panel(chart.titlePrimary, {
            sub: isAttr ? 'centro = ' + num.fmt(chart.center, 5) : 'sigma stimata = ' + num.fmt(chart.sigmaWithin, 5),
            actions: [h('button', {
              class: 'sm', onclick: function () { window.print(); }
            }, 'Stampa')]
          }, chartBox));
          C3.plots.controlChart(chartBox, chart, {
            yLabel: isAttr ? (v.chart === 'np' ? 'Numero di difettosi'
              : (v.chart[0] === 'p' ? 'Frazione difettosa' : 'Difetti per unita')) : v.value
          });

          // riepilogo numerico
          var rows = (chart.primary || []).map(function (p, i) {
            return {
              i: i + 1, label: p.label, value: p.value, n: p.n,
              cl: p.cl, lcl: p.lcl, ucl: p.ucl,
              viol: (p.violations || []).join(', ')
            };
          });
          out.appendChild(ui.panel('Tabella dei punti', { sub: 'carta principale' }, [
            ui.table([
              { key: 'i', label: '#', digits: 0 },
              { key: 'label', label: 'Sottogruppo' },
              { key: 'n', label: 'n', digits: 0 },
              { key: 'value', label: 'Valore', digits: 5 },
              { key: 'lcl', label: 'LCI', digits: 5 },
              { key: 'cl', label: 'LC', digits: 5 },
              { key: 'ucl', label: 'LCS', digits: 5 },
              {
                key: 'viol', label: 'Test violati', html: true,
                format: function (x) { return x ? '<span style="color:var(--critical);font-weight:600">' + x + '</span>' : ''; }
              }
            ], rows, { short: true }),
            ui.exportBar(function () { return 'carta-' + v.chart; }, function () {
              return ui.rowsToCSV([
                { key: 'i', label: '#' }, { key: 'label', label: 'Sottogruppo' },
                { key: 'value', label: 'Valore' }, { key: 'lcl', label: 'LCI' },
                { key: 'cl', label: 'LC' }, { key: 'ucl', label: 'LCS' },
                { key: 'viol', label: 'Test violati' }
              ], rows);
            })
          ]));

          // informazioni sulla carta
          var info = [];
          if (!isAttr) {
            var nAvg = chart.groups ? st.mean(chart.groups.map(function (g) { return g.values.length; })) : 1;
            var k = ctrl.constants(Math.max(2, Math.round(nAvg)));
            info.push(['Sottogruppi', (chart.primary || []).length, 0]);
            info.push(['Dimensione media del sottogruppo', nAvg, 2]);
            info.push(['Sigma di breve termine (within)', chart.sigmaWithin, 6]);
            info.push(['Costanti usate (n = ' + Math.round(nAvg) + ')',
              'd2 = ' + num.fmt(k.d2, 4) + ', d3 = ' + num.fmt(k.d3, 4) + ', c4 = ' + num.fmt(k.c4, 4) +
              ', A2 = ' + num.fmt(k.A2, 4) + ', D3 = ' + num.fmt(k.D3, 4) + ', D4 = ' + num.fmt(k.D4, 4)]);
            info.push(['ARL in controllo (solo test 1)', num.fmt(ctrl.arlShewhart(0, 1), 1) + ' punti']);
            info.push(['ARL per uno scostamento di 1 sigma', num.fmt(ctrl.arlShewhart(1, Math.max(1, Math.round(nAvg))), 1) + ' punti']);
          } else {
            info.push(['Totale conteggi', chart.totalCount, 0]);
            info.push(['Totale ispezionato', chart.totalSize, 0]);
            info.push(['Linea centrale', chart.center, 6]);
            if (chart.overdispersion) {
              info.push(['Rapporto di dispersione osservato/atteso', chart.overdispersion.ratio, 3]);
              info.push(['Esito dispersione', chart.overdispersion.verdict]);
            }
            if (chart.laney) info.push(['sigma Z di Laney', chart.laney.sigmaZ, 4]);
          }
          out.appendChild(ui.panel('Dettagli tecnici', null, [
            ui.kv(info),
            !isAttr ? ui.verdict('La sigma <b>within</b> misura la variabilita di breve termine (entro sottogruppo): ' +
              'e quella usata per i limiti di controllo e per Cp/Cpk. La variabilita complessiva (overall) include anche ' +
              'lo spostamento fra sottogruppi ed e quella percepita dal cliente (Pp/Ppk).', 'good') : null,
            isAttr && chart.overdispersion && chart.overdispersion.ratio > 1.5
              ? ui.verdict('Sovradispersione: con sottogruppi grandi i limiti classici sono troppo stretti e quasi tutti ' +
                'i punti risultano fuori controllo. Passa alla carta di Laney (p\' o u\').', 'warn') : null
          ].filter(Boolean)));

          // suggerimenti
          out.appendChild(ui.panel('Come leggere la carta', null, h('div', { class: 'doc small' }, [
            h('p', { html: '<b>Prima la stabilita, poi la capacita.</b> Se il processo non e in controllo, gli indici Cp/Cpk non hanno senso: descrivono un processo che non esiste in modo stabile.' }),
            h('ul', null, [
              h('li', { html: '<b>Un punto fuori dai limiti</b> (test 1): cerca una causa speciale in quel momento (cambio lotto, utensile, operatore, regolazione).' }),
              h('li', { html: '<b>9 punti dallo stesso lato</b> (test 2): la media si e spostata.' }),
              h('li', { html: '<b>6 punti in salita o discesa</b> (test 3): usura, deriva termica, esaurimento di un consumabile.' }),
              h('li', { html: '<b>Molti punti vicini alla linea centrale</b> (test 7): sottogruppi formati male (mescolano flussi diversi) o limiti calcolati su dati troppo dispersi.' }),
              h('li', { html: '<b>Non ricalcolare i limiti dopo ogni intervento</b>: usa le fasi per documentare i cambiamenti voluti.' })
            ])
          ])));
        } catch (e) {
          console.error(e);
          out.appendChild(ui.verdict('Carta non costruibile: ' + e.message, 'bad'));
        }
      }
      run();
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
