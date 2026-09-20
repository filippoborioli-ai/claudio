/* CLAUDIO v3 - ui/views/doe-design-view.js
 * Creazione dei piani sperimentali: fattoriali completi e frazionari,
 * Plackett-Burman, definitive screening, superficie di risposta (CCD,
 * Box-Behnken), Taguchi, quadrati latini, blocchi, split-plot, miscele,
 * D-optimal. Con struttura di alias, potenza e generazione del foglio dati.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3;
  var ui = C3.ui, h = ui.h, num = C3.numeric, doe = C3.doe, designs = C3.designs;

  var TYPES = [
    { value: 'factorial', label: 'Fattoriale a 2 livelli (completo o frazionario)' },
    { value: 'pb', label: 'Plackett-Burman (screening, 12/20/24 prove)' },
    { value: 'dsd', label: 'Definitive Screening Design (3 livelli, pochi run)' },
    { value: 'ccd', label: 'Central Composite Design (superficie di risposta)' },
    { value: 'bbd', label: 'Box-Behnken (superficie di risposta)' },
    { value: 'general', label: 'Fattoriale generale (livelli misti)' },
    { value: 'taguchi', label: 'Array ortogonale di Taguchi' },
    { value: 'latin', label: 'Quadrato latino' },
    { value: 'graeco', label: 'Quadrato greco-latino' },
    { value: 'rcbd', label: 'Blocchi randomizzati completi' },
    { value: 'bibd', label: 'Blocchi incompleti bilanciati' },
    { value: 'split', label: 'Split-plot (fattori difficili da variare)' },
    { value: 'mixture', label: 'Miscele (simplex lattice / centroid / vincolata)' },
    { value: 'dopt', label: 'D-optimal (prove imposte o spazio vincolato)' }
  ];

  C3.app.registerView({
    id: 'doe-piano',
    label: 'Crea piano sperimentale',
    icon: '⚙',
    group: 'DoE',
    desc: 'Genera il piano delle prove: scegli il tipo di disegno, i fattori e i livelli. Il software calcola risoluzione, alias, potenza e crea il foglio dati pronto da compilare.',
    render: function (el) {
      var split = h('div', { class: 'split' });
      var left = h('div', { class: 'panel options-panel' });
      var right = h('div');
      split.appendChild(left);
      split.appendChild(right);
      el.appendChild(split);

      var factors = [
        { name: 'A', low: -1, high: 1, unit: '', levels: '1,2,3' },
        { name: 'B', low: -1, high: 1, unit: '', levels: '1,2,3' },
        { name: 'C', low: -1, high: 1, unit: '', levels: '1,2,3' }
      ];

      var f = ui.form([
        { id: 'type', type: 'select', label: 'Tipo di disegno', options: TYPES },
        { id: 'nfactors', type: 'number', label: 'Numero di fattori', value: 3, min: 2, max: 15 },
        {
          id: 'fraction', type: 'select', label: 'Frazione', options: [],
          when: function (v) { return v.type === 'factorial'; }
        },
        { id: 'replicates', type: 'number', label: 'Repliche', value: 1, min: 1, max: 10, when: function (v) { return ['factorial', 'general', 'mixture'].indexOf(v.type) >= 0; } },
        { id: 'centerPoints', type: 'number', label: 'Punti centrali per replica', value: 0, min: 0, max: 10, when: function (v) { return ['factorial', 'pb', 'bbd'].indexOf(v.type) >= 0; } },
        {
          id: 'blocks', type: 'select', label: 'Blocchi', options: [1, 2, 4, 8],
          when: function (v) { return v.type === 'factorial'; }
        },
        {
          id: 'pbRuns', type: 'select', label: 'Numero di prove', options: [12, 20, 24],
          when: function (v) { return v.type === 'pb'; }
        },
        {
          id: 'alphaType', type: 'select', label: 'Tipo di alpha (punti assiali)', options: [
            { value: 'rotatable', label: 'Rotatabile (varianza uniforme)' },
            { value: 'face', label: 'Face-centered (alpha = 1, resta nel cubo)' },
            { value: 'orthogonal', label: 'Blocchi ortogonali' }
          ], when: function (v) { return v.type === 'ccd'; }
        },
        { id: 'ccdFraction', type: 'number', label: 'Frazionamento della parte cubica (p)', value: 0, min: 0, max: 3, when: function (v) { return v.type === 'ccd'; } },
        { id: 'centerCube', type: 'number', label: 'Punti centrali nel cubo', value: 4, min: 0, max: 12, when: function (v) { return v.type === 'ccd'; } },
        { id: 'centerAxial', type: 'number', label: 'Punti centrali nella parte assiale', value: 2, min: 0, max: 12, when: function (v) { return v.type === 'ccd'; } },
        {
          id: 'array', type: 'select', label: 'Array', options: ['L4', 'L8', 'L9', 'L12', 'L16', 'L18', 'L27'],
          when: function (v) { return v.type === 'taguchi'; }
        },
        { id: 'levels', type: 'number', label: 'Livelli per fattore', value: 3, min: 2, max: 6, when: function (v) { return ['general', 'latin', 'graeco', 'rcbd', 'bibd'].indexOf(v.type) >= 0; } },
        { id: 'nblocks', type: 'number', label: 'Numero di blocchi', value: 4, min: 2, max: 20, when: function (v) { return v.type === 'rcbd'; } },
        { id: 'blockSize', type: 'number', label: 'Trattamenti per blocco', value: 3, min: 2, max: 10, when: function (v) { return v.type === 'bibd'; } },
        { id: 'nhard', type: 'number', label: 'Fattori difficili da variare', value: 1, min: 1, max: 3, when: function (v) { return v.type === 'split'; } },
        {
          id: 'mixType', type: 'select', label: 'Tipo di disegno per miscele', options: [
            { value: 'lattice', label: 'Simplex lattice' },
            { value: 'centroid', label: 'Simplex centroid' },
            { value: 'vertices', label: 'Vertici estremi (con vincoli)' }
          ], when: function (v) { return v.type === 'mixture'; }
        },
        { id: 'degree', type: 'number', label: 'Grado del reticolo', value: 2, min: 1, max: 4, when: function (v) { return v.type === 'mixture' && v.mixType === 'lattice'; } },
        { id: 'axial', type: 'checkbox', label: 'Aggiungi punti assiali', value: true, when: function (v) { return v.type === 'mixture' && v.mixType === 'lattice'; } },
        { id: 'mixTotal', type: 'number', label: 'Quantità totale della miscela', value: 1, when: function (v) { return v.type === 'mixture'; } },
        { id: 'doptRuns', type: 'number', label: 'Numero di prove disponibili', value: 12, min: 4, max: 60, when: function (v) { return v.type === 'dopt'; } },
        {
          id: 'doptModel', type: 'select', label: 'Modello da stimare', options: [
            { value: 'linear', label: 'Lineare' },
            { value: 'interaction', label: 'Lineare + interazioni' },
            { value: 'quadratic', label: 'Quadratico completo' }
          ], when: function (v) { return v.type === 'dopt'; }
        },
        { id: 'randomize', type: 'checkbox', label: 'Randomizza l’ordine delle prove', value: true },
        { id: 'seed', type: 'number', label: 'Seme della randomizzazione', value: 1234 },
        { id: 'sigma', type: 'number', label: 'Deviazione standard attesa (per la potenza)', value: 1 },
        { id: 'effect', type: 'number', label: 'Effetto da rilevare', value: 2 }
      ], function (v, changed, api) {
        if (changed === 'nfactors' || changed === 'type') {
          syncFactors(v.nfactors);
          updateFractionOptions(v, api);
        }
        renderFactorEditor();
        run();
      });

      left.appendChild(h('h3', null, 'Disegno'));
      left.appendChild(f.el);
      var factorHost = h('div');
      left.appendChild(h('h3', { style: { marginTop: '12px' } }, 'Fattori'));
      left.appendChild(factorHost);

      function syncFactors(n) {
        n = Math.max(2, Math.min(15, n || 3));
        while (factors.length < n) {
          factors.push({
            name: doe.LETTERS[factors.length], low: -1, high: 1, unit: '', levels: '1,2,3'
          });
        }
        factors.length = n;
      }

      function updateFractionOptions(v, api) {
        if (v.type !== 'factorial') return;
        var k = v.nfactors;
        var opts = [{ value: 0, label: 'Completo 2^' + k + ' (' + Math.pow(2, k) + ' prove)' }];
        for (var p = 1; p <= k - 2; p++) {
          var runs = Math.pow(2, k - p);
          if (runs < 4) break;
          var g;
          try { g = doe.generatorsFor(k, p); } catch (e) { continue; }
          opts.push({
            value: p,
            label: '2^(' + k + '-' + p + ') - ' + runs + ' prove - risoluzione ' + g.roman
          });
        }
        api.setOptions('fraction', opts, false);
      }

      function renderFactorEditor() {
        ui.clear(factorHost);
        var v = f.values();
        var isCategorical = ['general', 'taguchi', 'latin', 'graeco', 'rcbd', 'bibd', 'split'].indexOf(v.type) >= 0;
        var isMixture = v.type === 'mixture';
        factors.forEach(function (fac, i) {
          var row = h('div', { class: 'row tight', style: { marginBottom: '4px' } });
          var nameIn = h('input', { type: 'text', value: fac.name, style: { width: '86px' } });
          nameIn.addEventListener('change', function () { fac.name = nameIn.value || doe.LETTERS[i]; run(); });
          row.appendChild(nameIn);
          if (isCategorical) {
            var lv = h('input', { type: 'text', value: fac.levels, style: { flex: '1' }, placeholder: 'livelli separati da virgola' });
            lv.addEventListener('change', function () { fac.levels = lv.value; run(); });
            row.appendChild(lv);
          } else if (isMixture) {
            var lo = h('input', { type: 'number', step: 'any', value: fac.low === -1 ? 0 : fac.low, style: { width: '76px' }, title: 'minimo' });
            var hi = h('input', { type: 'number', step: 'any', value: fac.high === 1 ? 1 : fac.high, style: { width: '76px' }, title: 'massimo' });
            lo.addEventListener('change', function () { fac.low = Number(lo.value); run(); });
            hi.addEventListener('change', function () { fac.high = Number(hi.value); run(); });
            row.appendChild(lo); row.appendChild(hi);
          } else {
            var lo2 = h('input', { type: 'number', step: 'any', value: fac.low, style: { width: '72px' }, title: 'livello basso' });
            var hi2 = h('input', { type: 'number', step: 'any', value: fac.high, style: { width: '72px' }, title: 'livello alto' });
            var un = h('input', { type: 'text', value: fac.unit, style: { width: '58px' }, placeholder: 'unità' });
            lo2.addEventListener('change', function () { fac.low = Number(lo2.value); run(); });
            hi2.addEventListener('change', function () { fac.high = Number(hi2.value); run(); });
            un.addEventListener('change', function () { fac.unit = un.value; run(); });
            row.appendChild(lo2); row.appendChild(hi2); row.appendChild(un);
          }
          factorHost.appendChild(row);
        });
        factorHost.appendChild(h('div', { class: 'small muted', text: isCategorical
          ? 'Per ogni fattore: nome e livelli separati da virgola.'
          : (isMixture ? 'Per ogni componente: nome, proporzione minima e massima.'
            : 'Per ogni fattore: nome, livello basso, livello alto, unità di misura.') }));
      }

      var out = h('div');
      right.appendChild(out);
      var currentDesign = null;

      function buildFactors() {
        return factors.map(function (fac) {
          return {
            name: fac.name, low: Number(fac.low), high: Number(fac.high), unit: fac.unit,
            levels: String(fac.levels).split(',').map(function (s) { return s.trim(); }).filter(Boolean)
          };
        });
      }

      function run() {
        ui.clear(out);
        var v = f.values();
        var facs = buildFactors();
        try {
          var d;
          switch (v.type) {
            case 'factorial':
              d = doe.factorialDesign({
                factors: facs, fraction: Number(v.fraction) || 0,
                replicates: v.replicates, centerPoints: v.centerPoints,
                blocks: Number(v.blocks) || 1, randomize: v.randomize, seed: v.seed
              });
              break;
            case 'pb':
              d = doe.plackettBurman({
                factors: facs, runs: Number(v.pbRuns), centerPoints: v.centerPoints,
                randomize: v.randomize, seed: v.seed
              });
              break;
            case 'dsd':
              d = designs.dsd({ factors: facs, randomize: v.randomize, seed: v.seed });
              if (d.error) throw new Error(d.error);
              break;
            case 'ccd':
              d = doe.ccd({
                factors: facs, alphaType: v.alphaType, fraction: v.ccdFraction,
                centerCube: v.centerCube, centerAxial: v.centerAxial,
                randomize: v.randomize, seed: v.seed
              });
              break;
            case 'bbd':
              d = doe.boxBehnken({
                factors: facs, centerPoints: v.centerPoints || undefined,
                randomize: v.randomize, seed: v.seed
              });
              break;
            case 'general':
              d = doe.generalFactorial({
                factors: facs.map(function (x) { return { name: x.name, levels: x.levels }; }),
                replicates: v.replicates, randomize: v.randomize, seed: v.seed
              });
              break;
            case 'taguchi':
              d = doe.taguchiDesign({
                array: v.array,
                factors: facs.map(function (x, i) { return { name: x.name, levels: x.levels, column: i }; })
              });
              break;
            case 'latin':
              d = designs.latinSquare({ treatments: facs[0].levels, seed: v.seed });
              break;
            case 'graeco':
              d = designs.graecoLatin({
                treatments: facs[0].levels,
                greekTreatments: facs[1] ? facs[1].levels : null
              });
              if (d.error) throw new Error(d.error);
              break;
            case 'rcbd':
              d = designs.rcbd({ treatments: facs[0].levels, nBlocks: v.nblocks, seed: v.seed });
              break;
            case 'bibd':
              d = designs.bibd({ treatments: facs[0].levels, blockSize: v.blockSize, seed: v.seed });
              if (d.error) throw new Error(d.error);
              break;
            case 'split':
              d = designs.splitPlot({
                hardFactors: facs.slice(0, v.nhard).map(function (x) { return { name: x.name, levels: x.levels }; }),
                easyFactors: facs.slice(v.nhard).map(function (x) { return { name: x.name, levels: x.levels }; }),
                replicates: v.replicates || 2, seed: v.seed
              });
              break;
            case 'mixture': {
              var comps = facs.map(function (x) { return { name: x.name, low: x.low, high: x.high }; });
              if (v.mixType === 'centroid') d = designs.simplexCentroid({ components: comps, total: v.mixTotal, randomize: v.randomize, seed: v.seed, replicates: v.replicates });
              else if (v.mixType === 'vertices') d = designs.extremeVertices({ components: comps, total: v.mixTotal, randomize: v.randomize, seed: v.seed, replicates: v.replicates });
              else d = designs.simplexLattice({ components: comps, degree: v.degree, axial: v.axial, total: v.mixTotal, randomize: v.randomize, seed: v.seed, replicates: v.replicates });
              if (d.error) throw new Error(d.error);
              break;
            }
            case 'dopt': {
              var k = facs.length;
              var cand = [];
              var levelsPer = v.doptModel === 'linear' ? 2 : 3;
              var total = Math.pow(levelsPer, k);
              if (total > 20000) throw new Error('Troppi fattori per la ricerca D-optimal: riduci a 8 fattori.');
              for (var c = 0; c < total; c++) {
                var rem = c, row = [];
                for (var j = 0; j < k; j++) {
                  var lvl = rem % levelsPer; rem = Math.floor(rem / levelsPer);
                  row.push(levelsPer === 2 ? (lvl ? 1 : -1) : (lvl - 1));
                }
                cand.push(row);
              }
              var expand = function (row) {
                var r2 = [1].concat(row);
                if (v.doptModel !== 'linear') {
                  for (var a = 0; a < k; a++) for (var b = a + 1; b < k; b++) r2.push(row[a] * row[b]);
                }
                if (v.doptModel === 'quadratic') {
                  for (var q = 0; q < k; q++) r2.push(row[q] * row[q]);
                }
                return r2;
              };
              var dres = doe.dOptimal({ candidates: cand, expand: expand, nRuns: v.doptRuns, seed: v.seed });
              d = {
                type: dres.type, factors: facs, totalRuns: dres.nRuns,
                table: dres.rows.map(function (row, i) {
                  var o = { StdOrder: i + 1, RunOrder: i + 1, PtType: 1, Blocco: 1 };
                  facs.forEach(function (fc, j) {
                    o[fc.name] = row[j];
                    o[fc.name + ' (reale)'] = doe.codedToReal(row[j], fc);
                  });
                  return o;
                }),
                notes: dres.notes.concat(['Efficienza D relativa: ' + num.fmt(dres.dEfficiency, 4)])
              };
              break;
            }
          }
          currentDesign = d;
          showDesign(d, v, facs);
        } catch (e) {
          console.error(e);
          out.appendChild(ui.verdict('Disegno non generabile: ' + e.message, 'bad'));
        }
      }

      function showDesign(d, v, facs) {
        var kpi = h('div', { class: 'grid-4 mb' });
        out.appendChild(kpi);
        C3.plots.kpiTile(kpi, { label: 'Prove totali', value: d.totalRuns });
        C3.plots.kpiTile(kpi, { label: 'Fattori', value: (d.factors || d.components || facs).length });
        if (d.resolution) {
          C3.plots.kpiTile(kpi, {
            label: 'Risoluzione', value: d.roman || d.resolution,
            status: d.resolution >= 5 ? 'good' : (d.resolution === 4 ? 'warn' : 'bad'),
            statusLabel: d.resolution >= 5 ? 'ottima' : (d.resolution === 4 ? 'buona' : 'screening')
          });
        }
        if (['factorial', 'pb', 'ccd', 'dsd', 'bbd'].indexOf(v.type) >= 0) {
          var nTerms = v.type === 'ccd' || v.type === 'bbd'
            ? 1 + 2 * facs.length + facs.length * (facs.length - 1) / 2
            : 1 + facs.length + (d.resolution >= 5 ? facs.length * (facs.length - 1) / 2 : 0);
          var pw = doe.factorialPower({
            k: facs.length, p: Number(v.fraction) || 0, replicates: v.replicates || 1,
            centerPoints: v.centerPoints || 0, effect: v.effect, sigma: v.sigma,
            alpha: C3.app.state.settings.alpha, terms: nTerms
          });
          C3.plots.kpiTile(kpi, {
            label: 'Potenza (effetto ' + v.effect + ')',
            value: isFinite(pw.power) ? num.fmt(100 * pw.power, 1) : '-', unit: '%',
            status: pw.power >= 0.8 ? 'good' : 'warn',
            sub: isFinite(pw.detectable) ? 'rileva effetti > ' + num.fmt(pw.detectable, 3) : 'gradi di liberta insufficienti'
          });
        }

        out.appendChild(ui.panel(d.type, { sub: 'piano delle prove', actions: [
          h('button', {
            class: 'primary sm', onclick: function () { createSheet(d); }
          }, 'Crea foglio dati'),
          h('button', {
            class: 'sm', onclick: function () {
              var ds = designToDataset(d);
              C3.io.download(C3.io.toCSV(ds, { delimiter: ';' }), 'piano-sperimentale.csv', 'text/csv;charset=utf-8');
            }
          }, 'Esporta CSV')
        ] }, [
          (d.notes || []).length ? h('ul', { class: 'small' }, (d.notes || []).map(function (n) {
            return h('li', { html: n });
          })) : null,
          ui.table(Object.keys(d.table[0]).map(function (k) {
            return { key: k, label: k, digits: typeof d.table[0][k] === 'number' ? 4 : undefined };
          }), d.table, { short: d.table.length > 30 })
        ].filter(Boolean)));

        // alias
        if (d.alias && d.alias.aliases && d.alias.aliases.length && d.p > 0) {
          out.appendChild(ui.panel('Struttura di alias', {
            sub: 'relazione definente: I = ' + d.alias.defining.join(' = ')
          }, [
            ui.table([
              { key: 'term', label: 'Effetto' },
              { key: function (a) { return a.aliases.slice(0, 6).join(' + '); }, label: 'Confuso con' }
            ], d.alias.aliases),
            ui.verdict(d.resolution >= 5
              ? 'Risoluzione ' + d.roman + ': effetti principali e interazioni a due fattori sono stimabili separatamente.'
              : (d.resolution === 4
                ? 'Risoluzione IV: gli effetti principali sono liberi dalle interazioni a due fattori, ma le interazioni a due fattori sono confuse fra loro. Per separarle serve un fold-over o prove aggiuntive.'
                : 'Risoluzione III: ogni effetto principale e confuso con almeno un’interazione a due fattori. Va bene per lo screening iniziale, non per le conclusioni finali.'),
              d.resolution >= 5 ? 'good' : (d.resolution === 4 ? 'warn' : 'bad')),
            h('button', {
              class: 'sm', onclick: function () {
                var fo = doe.foldOver(d);
                currentDesign = fo;
                showDesignInModal(fo);
              }
            }, 'Genera il fold-over completo')
          ]));
        }

        // visualizzazione dello spazio sperimentale
        if (d.factors && d.factors.length >= 2 && ['factorial', 'ccd', 'bbd', 'dsd', 'pb', 'dopt'].indexOf(v.type) >= 0) {
          var vis = h('div', { class: 'c3-grid-2' });
          out.appendChild(ui.panel('Spazio sperimentale', { sub: 'punti del disegno in unità codificate' }, vis));
          var f1 = d.factors[0].name, f2 = d.factors[1].name;
          var box = h('div');
          vis.appendChild(box);
          var counts = {};
          d.table.forEach(function (r) {
            var key = num.round(r[f1], 4) + ',' + num.round(r[f2], 4);
            counts[key] = (counts[key] || 0) + 1;
          });
          C3.chart.render(box, {
            title: f2 + ' vs ' + f1,
            height: 300,
            x: { label: f1, gridlines: true }, y: { label: f2 },
            series: [{
              type: 'points', name: 'Prove',
              points: Object.keys(counts).map(function (k) {
                var parts = k.split(',').map(Number);
                return { x: parts[0], y: parts[1], size: 4 + Math.min(6, counts[k]), label: counts[k] + ' prove' };
              }),
              markerSize: 6
            }],
            legend: false,
            note: 'La dimensione del punto indica quante prove cadono in quella combinazione.'
          });
          if (d.factors.length >= 3) {
            var box3 = h('div');
            vis.appendChild(box3);
            C3.plots.cubePlot(box3, (function () {
              var obj = {};
              d.factors.slice(0, 3).forEach(function (fc) {
                obj[fc.name] = d.table.map(function (r) { return r[fc.name]; });
              });
              obj.__n = d.table.map(function () { return 1; });
              return obj;
            })(), d.factors.slice(0, 3).map(function (fc) { return fc.name; }), '__n', {});
          }
        }
      }

      function showDesignInModal(d) {
        ui.modal(d.type, h('div', null, [
          h('p', { class: 'small', text: (d.notes || []).join(' ') }),
          ui.table(Object.keys(d.table[0]).map(function (k) {
            return { key: k, label: k };
          }), d.table, { short: true }),
          h('button', {
            class: 'primary', onclick: function () { createSheet(d); }
          }, 'Crea foglio dati')
        ]), { buttons: [{ label: 'Chiudi' }] });
      }

      function designToDataset(d) {
        var ds = C3.data.fromRows(d.table, 'Piano: ' + d.type);
        ds.addColumn('Risposta', new Array(d.table.length).fill(null), 'num');
        ds.meta = {
          design: d.type,
          factors: (d.factors || []).map(function (x) { return x.name; }),
          components: d.components || null,
          response: 'Risposta'
        };
        return ds;
      }

      function createSheet(d) {
        var ds = designToDataset(d);
        C3.app.addDataset(ds);
        C3.app.toast('Foglio creato: compila la colonna Risposta e poi vai su "Analizza esperimento"', 'success');
        C3.app.navigate('dati');
      }

      syncFactors(3);
      updateFractionOptions(f.values(), f);
      renderFactorEditor();
      run();
    }
  });

  /* ====================== CATALOGO DEI DISEGNI ====================== */
  C3.app.registerView({
    id: 'doe-catalogo',
    label: 'Catalogo dei disegni',
    icon: '☷',
    group: 'DoE',
    desc: 'Tutti i disegni fattoriali a due livelli disponibili con numero di prove, risoluzione e generatori, più gli array di Taguchi verificati.',
    render: function (el) {
      var cat = doe.catalogFractional(11);
      el.appendChild(ui.panel('Disegni fattoriali a 2 livelli', {
        sub: 'risoluzione e generatori calcolati dal gruppo dei contrasti definenti'
      }, [
        ui.table([
          { key: 'fraction', label: 'Disegno' },
          { key: 'factors', label: 'Fattori', digits: 0 },
          { key: 'runs', label: 'Prove', digits: 0 },
          {
            key: 'roman', label: 'Risoluzione', html: true,
            format: function (v, r) {
              var cls = r.resolution >= 5 ? 'good' : (r.resolution === 4 ? 'warn' : 'bad');
              return '<span class="badge ' + cls + '">' + v + '</span>';
            }
          },
          { key: function (r) { return r.generators.join(', '); }, label: 'Generatori' },
          { key: function (r) { return 'I = ' + r.defining.slice(0, 4).join(' = ') + (r.defining.length > 4 ? ' ...' : ''); }, label: 'Relazione definente' }
        ], cat),
        ui.verdict('<b>Come leggere la risoluzione.</b> III: effetti principali confusi con interazioni a 2 fattori ' +
          '(solo screening). IV: effetti principali puliti, interazioni a 2 fattori confuse fra loro. ' +
          'V o superiore: si stimano separatamente effetti principali e interazioni a 2 fattori.', 'good')
      ]));
      var tag = doe.taguchiCatalog();
      el.appendChild(ui.panel('Array ortogonali di Taguchi', { sub: 'ortogonalità verificata a runtime su tutte le coppie di colonne' },
        ui.table([
          { key: 'name', label: 'Array' },
          { key: 'runs', label: 'Prove', digits: 0 },
          { key: 'columns', label: 'Colonne', digits: 0 },
          { key: 'desc', label: 'Impiego' },
          {
            key: 'orthogonal', label: 'Verifica', html: true,
            format: function (v) { return v ? '<span class="badge good">ortogonale</span>' : '<span class="badge bad">non valido</span>'; }
          }
        ], tag)));
      el.appendChild(ui.panel('Altri disegni disponibili', null,
        h('div', { class: 'cards' }, [
          ['Plackett-Burman', '12, 20 o 24 prove per molti fattori a 2 livelli. Risoluzione III non regolare: gli effetti principali sono parzialmente confusi con tutte le interazioni.'],
          ['Definitive Screening Design', 'Circa 2k+1 prove, 3 livelli: effetti principali non confusi con le interazioni a 2 fattori e curvatura stimabile.'],
          ['Central Composite Design', 'Fattoriale + punti assiali + centrali: stima il modello quadratico completo. Alpha rotatabile o face-centered.'],
          ['Box-Behnken', 'Tre livelli senza combinazioni estreme: utile quando i vertici del cubo sono impraticabili.'],
          ['Quadrato latino / greco-latino', 'Controlla due o tre fonti di disturbo con k^2 prove, assumendo nessuna interazione.'],
          ['Blocchi randomizzati e incompleti', 'Isolano una fonte di variabilità nota (giorno, lotto, forno).'],
          ['Split-plot', 'Fattori difficili da variare nei whole plot: meno cambi di setup, ma due errori diversi da usare nei test.'],
          ['Miscele', 'I fattori sono proporzioni che sommano a 1: modelli di Scheffe e diagrammi ternari.'],
          ['D-optimal', 'Disegno costruito al computer quando lo spazio e vincolato o le prove sono imposte.']
        ].map(function (c) {
          return h('div', { class: 'card' }, [h('h4', { text: c[0] }), h('p', { text: c[1] })]);
        }))));
    }
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
