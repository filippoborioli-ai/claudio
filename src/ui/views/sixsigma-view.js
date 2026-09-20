/* CLAUDIO v3 - ui/views/sixsigma-view.js
 * Pagina Six Sigma: percorso DMAIC con strumenti per fase, selettore dello
 * strumento, FMEA interattiva, Pareto e COPQ, rendimento a catena, charter.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3;
  var ui = C3.ui, h = ui.h, num = C3.numeric, st = C3.stats, ss = C3.sixsigma;

  C3.app.registerView({
    id: 'sixsigma',
    label: 'Metodologia Six Sigma',
    icon: 'σ',
    group: 'Metodologie',
    desc: 'Il percorso DMAIC con gli strumenti di ogni fase, il selettore dello strumento giusto, FMEA, Pareto, rendimento a catena e costo della non qualità.',
    render: function (el) {
      var tabs = ui.tabs([
        { id: 'dmaic', label: 'Percorso DMAIC', render: dmaic },
        { id: 'strumento', label: 'Quale strumento uso', render: selettore },
        { id: 'fmea', label: 'FMEA', render: fmea },
        { id: 'pareto', label: 'Pareto e COPQ', render: paretoCopq },
        { id: 'resa', label: 'Rendimento e sigma', render: resa },
        { id: 'charter', label: 'Project charter', render: charter }
      ]);
      el.appendChild(tabs.el);
    }
  });

  /* ===================== DMAIC ===================== */
  function dmaic(el) {
    el.appendChild(ui.panel('Il ciclo DMAIC', {
      sub: 'ogni fase ha un obiettivo, strumenti e un criterio di passaggio'
    }, h('div', { class: 'timeline' }, ss.DMAIC.map(function (p) {
      return h('div', { class: 'phase' }, [
        h('h3', { text: p.phase }),
        h('p', { html: '<b>Obiettivo:</b> ' + p.goal }),
        h('p', { html: '<b>Strumenti:</b> ' + p.tools.join(' &middot; ') }),
        h('p', { html: '<b>Risultati attesi:</b> ' + p.deliverables.join(' &middot; ') }),
        h('div', { class: 'verdict', html: '<b>Criterio di passaggio:</b> ' + p.gate })
      ]);
    }))));

    el.appendChild(ui.panel('Y = f(X): l’idea di fondo', null,
      h('div', { class: 'doc' }, [
        h('p', { html: 'Il risultato che interessa al cliente (<b>Y</b>) e l’effetto di variabili di processo (<b>X</b>). ' +
          'Non si controlla Y ispezionandolo: si controllano le X che lo generano. Tutto il DMAIC serve a passare da ' +
          '"conosciamo Y" a "controlliamo le X critiche".' }),
        h('table', { class: 'data' }, [
          h('thead', null, h('tr', null, [h('th', null, 'Domanda'), h('th', null, 'Fase'), h('th', null, 'Strumento nel software')])),
          h('tbody', null, [
            ['Quanto e grave il problema in numeri?', 'Define', 'Statistiche descrittive, Pareto, COPQ'],
            ['Posso fidarmi dei dati?', 'Measure', 'MSA / Gage R&R'],
            ['Qual e il livello attuale?', 'Measure', 'Carte di controllo, capacità, livello sigma'],
            ['Quali X influenzano Y?', 'Analyze', 'Test di ipotesi, ANOVA, regressione, multi-vari'],
            ['Quanto e a che livello impostare le X?', 'Improve', 'DoE, superficie di risposta, desiderabilità'],
            ['Il guadagno si mantiene?', 'Control', 'Carte di controllo, capacità finale, control plan']
          ].map(function (r) {
            return h('tr', null, r.map(function (c) { return h('td', null, c); }));
          }))
        ])
      ])));

    el.appendChild(ui.panel('Ruoli e struttura tipica', null,
      h('div', { class: 'cards' }, [
        ['Champion / Sponsor', 'Sceglie i progetti, rimuove gli ostacoli, approva le risorse è valida il beneficio economico.'],
        ['Master Black Belt', 'Forma e assiste le cinture, garantisce il rigore metodologico, gestisce il portafoglio progetti.'],
        ['Black Belt', 'Guida progetti complessi a tempo pieno, padroneggia statistica e DoE, coordina il team.'],
        ['Green Belt', 'Conduce progetti nel proprio reparto a tempo parziale, usa gli strumenti di base.'],
        ['Yellow Belt / team', 'Conosce il linguaggio, raccoglie dati corretti, partecipa alle analisi e applica le soluzioni.'],
        ['Process owner', 'Riceve il processo migliorato e ne mantiene i risultati dopo la chiusura del progetto.']
      ].map(function (r) {
        return h('div', { class: 'card' }, [h('h4', { text: r[0] }), h('p', { text: r[1] })]);
      }))));
  }

  /* ===================== SELETTORE STRUMENTO ===================== */
  function selettore(el) {
    var out = h('div');
    var f = ui.form([
      {
        id: 'question', type: 'select', label: 'Che domanda ti stai facendo?', options: [
          { value: 'describe', label: 'Come sono distribuiti i miei dati?' },
          { value: 'compare2', label: 'Due gruppi sono diversi?' },
          { value: 'compareK', label: 'Più di due gruppi sono diversi?' },
          { value: 'relation', label: 'Due variabili sono legate fra loro?' },
          { value: 'predict', label: 'Posso prevedere Y dalle X?' },
          { value: 'stable', label: 'Il processo è stabile nel tempo?' },
          { value: 'capable', label: 'Il processo rispetta la specifica?' },
          { value: 'measure', label: 'Posso fidarmi del sistema di misura?' },
          { value: 'cause', label: 'Quali fattori causano il problema?' },
          { value: 'optimize', label: 'Come imposto i parametri al meglio?' },
          { value: 'counts', label: 'Ho conteggi o percentuali di difettosi' },
          { value: 'sample', label: 'Quanti dati mi servono?' }
        ]
      },
      {
        id: 'dataType', type: 'chips', label: 'Tipo di dato della risposta', value: 'cont', options: [
          { value: 'cont', label: 'Continuo (misure)' },
          { value: 'disc', label: 'Discreto (conteggi, passa/non passa)' }
        ]
      },
      { id: 'normal', type: 'checkbox', label: 'I dati sono approssimativamente normali', value: true },
      { id: 'paired', type: 'checkbox', label: 'Le osservazioni sono appaiate (prima/dopo sullo stesso pezzo)', value: false }
    ], function () { run(); });

    var split = h('div', { class: 'split' });
    var left = h('div', { class: 'panel options-panel' });
    left.appendChild(h('h3', null, 'La tua situazione'));
    left.appendChild(f.el);
    split.appendChild(left);
    var right = h('div');
    right.appendChild(out);
    split.appendChild(right);
    el.appendChild(split);

    function run() {
      ui.clear(out);
      var v = f.values();
      var recs = [];
      function rec(name, why, view, note) {
        recs.push({ name: name, why: why, view: view, note: note });
      }
      switch (v.question) {
        case 'describe':
          rec('Statistiche descrittive e riassunto grafico', 'Media, mediana, dispersione, forma, valori anomali in un colpo solo.', 'descrittive');
          rec('Test di normalità (Anderson-Darling)', 'Decide se puoi usare i metodi parametrici e gli indici di capacità classici.', 'descrittive');
          rec('Identificazione della distribuzione', 'Se i dati non sono normali, trova la distribuzione che li descrive.', 'descrittive');
          break;
        case 'compare2':
          if (v.dataType === 'disc') rec('Test su 2 proporzioni (o Fisher esatto)', 'Confronta due percentuali di difettosi.', 'test');
          else if (v.paired) rec(v.normal ? 't appaiato' : 'Wilcoxon signed-rank', 'Le misure sullo stesso pezzo sono correlate: il test appaiato elimina la variabilità fra pezzi.', 'test');
          else rec(v.normal ? 't a 2 campioni (Welch)' : 'Mann-Whitney', 'Confronta due medie (o mediane) indipendenti.', 'test');
          rec('Test su 2 varianze e Levene', 'Le differenze di dispersione contano quanto quelle di media.', 'test');
          rec('Boxplot e valori individuali', 'Guarda sempre i dati prima di fidarti del p-value.', 'descrittive');
          break;
        case 'compareK':
          if (v.dataType === 'disc') rec('Chi-quadro di associazione', 'Confronta proporzioni fra più gruppi.', 'test');
          else rec(v.normal ? 'ANOVA a una via + Tukey' : 'Kruskal-Wallis o mediana di Mood', 'Confronta più gruppi controllando il rischio complessivo di falso allarme.', 'anova');
          rec('Test di uguaglianza delle varianze', 'Se le varianze differiscono usa Welch e Games-Howell.', 'anova');
          break;
        case 'relation':
          rec('Matrice di correlazione', 'Individua rapidamente le coppie legate.', 'regressione');
          rec('Grafico di dispersione', 'La correlazione misura solo legami lineari: il grafico mostra il resto.', 'regressione');
          if (v.dataType === 'disc') rec('Tabella di contingenza e chi-quadro', 'Per variabili categoriche.', 'test');
          break;
        case 'predict':
          rec(v.dataType === 'disc' ? 'Regressione logistica binaria' : 'Regressione multipla', 'Costruisce il modello Y = f(X) con test sui coefficienti.', 'regressione');
          rec('Selezione delle variabili', 'Stepwise o migliori sottoinsiemi quando i candidati sono molti.', 'regressione');
          rec('Diagnostica dei residui', 'Senza verifica delle ipotesi i p-value non valgono nulla.', 'regressione');
          break;
        case 'stable':
          rec(v.dataType === 'disc' ? 'Carte p, np, c, u' : 'Carte I-MR o Xbar-R', 'Distingue le cause comuni da quelle speciali.', 'spc');
          rec('EWMA o CUSUM', 'Più sensibili a piccoli scostamenti persistenti della media.', 'spc');
          rec('Test di Nelson', 'Otto schemi che segnalano comportamenti non casuali.', 'spc');
          break;
        case 'capable':
          rec(v.dataType === 'disc' ? 'Capacità per attributi' : (v.normal ? 'Capacità normale (Cp, Cpk, Pp, Ppk)' : 'Capacità non normale'), 'Confronta la voce del processo con la voce del cliente.', 'capacità');
          rec('Sixpack di capacità', 'Stabilità, normalità è capacità in un unico quadro.', 'sixpack');
          rec('Carte di controllo', 'La capacità ha senso solo su un processo stabile: verifica prima la stabilità.', 'spc');
          break;
        case 'measure':
          rec('Gage R&R incrociato', 'Quantifica ripetibilità e riproducibilità rispetto alla variabilità dei pezzi.', 'msa');
          rec('Bias e linearità', 'Verifica se lo strumento e centrato su tutto il campo di misura.', 'msa');
          rec('Concordanza per attributi', 'Per giudizi visivi o passa/non passa: kappa di Cohen e Fleiss.', 'msa');
          break;
        case 'cause':
          rec('Analisi multi-vari e boxplot per gruppo', 'Mostra dove nasce la variabilità: fra pezzi, fra tempi, entro pezzo.', 'descrittive');
          rec('ANOVA e componenti della varianza', 'Quantifica il contributo di ogni fonte.', 'anova');
          rec('DoE di screening', 'Le cause si dimostrano cambiando i fattori, non osservandoli.', 'doe-piano');
          break;
        case 'optimize':
          rec('DoE fattoriale', 'Stima effetti e interazioni con poche prove.', 'doe-piano');
          rec('Superficie di risposta (CCD, Box-Behnken)', 'Trova il punto ottimale quando la risposta e curva.', 'doe-piano');
          rec('Ottimizzazione con desiderabilità', 'Compromesso fra più risposte in conflitto.', 'doe-analisi');
          break;
        case 'counts':
          rec('Carte p, np, c, u e varianti di Laney', 'Controllo statistico per dati di conteggio.', 'spc');
          rec('Capacità per attributi', 'Da percentuale difettosa a livello sigma e DPMO.', 'capacità');
          rec('Test su proporzioni e chi-quadro', 'Confronti fra percentuali.', 'test');
          break;
        case 'sample':
          rec('Potenza e numerosità campionaria', 'Quante prove servono per rilevare una differenza di interesse.', 'potenza');
          rec('Piano di campionamento in accettazione', 'n e c a partire da AQL e RQL, con curva OC.', 'potenza');
          break;
      }
      out.appendChild(ui.panel('Strumenti consigliati', null,
        h('div', { class: 'cards' }, recs.map(function (r, i) {
          return h('div', { class: 'card' }, [
            i === 0 ? h('span', { class: 'tag', text: 'primo passo' }) : null,
            h('h4', { text: r.name }),
            h('p', { text: r.why }),
            r.view ? h('button', {
              class: 'sm primary', onclick: function () { C3.app.navigate(r.view); }
            }, 'Apri lo strumento') : null
          ].filter(Boolean));
        }))));
      out.appendChild(ui.verdict('Prima di qualunque test: <b>guarda i dati</b>. Un grafico ben fatto risolve più ' +
        'domande di dieci p-value, e protegge dagli errori grossolani (dati duplicati, unità di misura sbagliate, ' +
        'valori impossibili).', 'good'));
    }
    run();
  }

  /* ===================== FMEA ===================== */
  function fmea(el) {
    var rows = [
      { item: 'Pompa dosatrice', failureMode: 'Portata fuori tolleranza', effect: 'Concentrazione errata nel prodotto', severity: 8, cause: 'Usura girante', occurrence: 4, control: 'Controllo settimanale portata', detection: 5 },
      { item: 'Sensore temperatura', failureMode: 'Deriva della lettura', effect: 'Temperatura di processo errata', severity: 7, cause: 'Taratura scaduta', occurrence: 3, control: 'Taratura annuale', detection: 6 },
      { item: 'Nastro trasportatore', failureMode: 'Arresto improvviso', effect: 'Fermo linea', severity: 6, cause: 'Rottura cuscinetto', occurrence: 2, control: 'Manutenzione a calendario', detection: 4 }
    ];
    var out = h('div');
    var tableHost = h('div');

    function render() {
      ui.clear(tableHost);
      var res = ss.fmea(rows);
      var t = h('table', { class: 'data' });
      var head = ['Elemento', 'Modo di guasto', 'Effetto', 'G', 'Causa', 'P', 'Controllo', 'R', 'RPN', 'AP', 'Rischio', ''];
      t.appendChild(h('thead', null, h('tr', null, head.map(function (x) { return h('th', null, x); }))));
      var tb = h('tbody');
      res.rows.forEach(function (r) {
        var original = rows.filter(function (x) { return x === r || x.failureMode === r.failureMode; })[0] || r;
        function input(field, width, isNum) {
          var inp = h('input', {
            type: isNum ? 'number' : 'text', value: original[field],
            style: { width: width }, min: isNum ? 1 : null, max: isNum ? 10 : null
          });
          inp.addEventListener('change', function () {
            original[field] = isNum ? Math.max(1, Math.min(10, Number(inp.value))) : inp.value;
            render();
          });
          return inp;
        }
        var riskCls = r.risk === 'alto' ? 'bad' : (r.risk === 'medio' ? 'warn' : 'good');
        tb.appendChild(h('tr', null, [
          h('td', null, input('item', '120px')),
          h('td', null, input('failureMode', '150px')),
          h('td', null, input('effect', '150px')),
          h('td', null, input('severity', '52px', true)),
          h('td', null, input('cause', '140px')),
          h('td', null, input('occurrence', '52px', true)),
          h('td', null, input('control', '140px')),
          h('td', null, input('detection', '52px', true)),
          h('td', { class: 'num' }, String(r.rpn)),
          h('td', null, r.ap),
          h('td', null, h('span', { class: 'badge ' + riskCls, text: r.risk })),
          h('td', null, h('button', {
            class: 'sm danger', onclick: function () {
              rows = rows.filter(function (x) { return x !== original; });
              render();
            }
          }, '✕'))
        ]));
      });
      t.appendChild(tb);
      tableHost.appendChild(h('div', { class: 'table-wrap' }, t));
      tableHost.appendChild(h('div', { class: 'row mt' }, [
        h('button', {
          class: 'sm', onclick: function () {
            rows.push({
              item: 'Nuovo elemento', failureMode: 'Modo di guasto', effect: 'Effetto',
              severity: 5, cause: 'Causa', occurrence: 5, control: 'Controllo attuale', detection: 5
            });
            render();
          }
        }, '+ Riga'),
        h('button', {
          class: 'sm', onclick: function () {
            var csv = 'Elemento;Modo di guasto;Effetto;G;Causa;P;Controllo;R;RPN;AP\n' +
              res.rows.map(function (r) {
                return [r.item, r.failureMode, r.effect, r.severity, r.cause, r.occurrence, r.control, r.detection, r.rpn, r.ap].join(';');
              }).join('\n');
            C3.io.download(csv, 'fmea.csv', 'text/csv;charset=utf-8');
          }
        }, 'Esporta CSV')
      ]));
      tableHost.appendChild(ui.kv([
        ['RPN totale', res.totalRpn, 0],
        ['Modi ad alto rischio', res.highRisk, 0],
        ['Priorità', res.rows.slice(0, 3).map(function (r) { return r.failureMode + ' (' + r.rpn + ')'; }).join(' ; ')]
      ]));
      var box = h('div');
      tableHost.appendChild(box);
      C3.plots.paretoChart(box, res.pareto, { title: 'Pareto degli RPN', yLabel: 'RPN' });
    }

    el.appendChild(ui.panel('FMEA di processo', {
      sub: 'G = gravità, P = probabilità, R = rilevabilità (scala 1-10); RPN = G x P x R'
    }, [tableHost, out]));
    render();

    el.appendChild(ui.panel('Come si compila', null,
      h('div', { class: 'doc' }, [
        h('p', { html: '<b>Gravità (G)</b>: quanto e grave l’effetto per il cliente. 10 = pericolo per la sicurezza o non conformita a norme. ' +
          'Si riduce solo cambiando il progetto, non il controllo.' }),
        h('p', { html: '<b>Probabilità (P)</b>: quanto spesso si presenta la causa. Si riduce agendo sul processo (poka-yoke, manutenzione, parametri).' }),
        h('p', { html: '<b>Rilevabilità (R)</b>: 1 = il controllo attuale intercetta sempre il problema, 10 = non lo intercetta mai. ' +
          'Attenzione: la scala e invertita rispetto all’intuizione.' }),
        h('p', { html: 'L <b>RPN</b> serve a ordinare le priorità, non è una misura assoluta: due combinazioni con lo stesso RPN ' +
          'possono avere urgenza molto diversa. Per questo lo standard AIAG-VDA ha introdotto l <b>Action Priority</b> (alta, media, bassa), ' +
          'che pesa prima la gravità, poi la probabilità, poi la rilevabilità.' }),
        h('p', { html: 'Regola pratica: qualunque modo con <b>G >= 9</b> va affrontato a prescindere dall RPN.' })
      ])));
  }

  /* ===================== PARETO E COPQ ===================== */
  function paretoCopq(el) {
    var grid = h('div', { class: 'grid-2' });
    el.appendChild(grid);

    // pareto dai dati
    (function () {
      var ds = C3.app.ds();
      var out = h('div');
      var catCols = ds ? ds.categoricalColumns() : [];
      var numCols = ds ? ds.numericColumns() : [];
      var f = ui.form([
        { id: 'cat', type: 'select', label: 'Categoria', options: catCols.length ? catCols : ['(nessuna colonna categorica)'] },
        {
          id: 'weight', type: 'select', label: 'Peso (opzionale)',
          options: [{ value: '', label: '(conteggio)' }].concat(numCols)
        },
        { id: 'max', type: 'number', label: 'Categorie massime', value: 10, min: 3, max: 25 }
      ], calc);
      function calc() {
        ui.clear(out);
        if (!ds || !catCols.length) {
          out.appendChild(ui.verdict('Carica un dataset con una colonna categorica per costruire il Pareto.', 'warn'));
          return;
        }
        var v = f.values();
        var p = ss.paretoFromColumn(ds.col(v.cat), v.weight ? ds.numeric(v.weight) : null, { maxCategories: v.max });
        var box = h('div');
        out.appendChild(box);
        C3.plots.paretoChart(box, p, { yLabel: v.weight || 'Conteggio' });
        out.appendChild(ui.table([
          { key: 'label', label: v.cat },
          { key: 'value', label: v.weight || 'Conteggio', digits: 2 },
          { key: 'pct', label: '%', digits: 2 },
          { key: 'cumPct', label: '% cumulata', digits: 2 }
        ], p.rows));
        out.appendChild(ui.verdict(p.note + ' Concentra le risorse sulle prime voci: e li che sta il risultato.', 'good'));
      }
      grid.appendChild(ui.panel('Pareto dai dati caricati', null, [f.el, out]));
      calc();
    })();

    // COPQ
    (function () {
      var out = h('div');
      var f = ui.form([
        { id: 'scrap', type: 'number', label: 'Scarti (valore annuo)', value: 120000 },
        { id: 'rework', type: 'number', label: 'Rilavorazioni', value: 85000 },
        { id: 'downtime', type: 'number', label: 'Fermi per qualità', value: 40000 },
        { id: 'warranty', type: 'number', label: 'Garanzie e resi', value: 95000 },
        { id: 'complaints', type: 'number', label: 'Gestione reclami', value: 30000 },
        { id: 'inspection', type: 'number', label: 'Ispezioni e collaudi', value: 150000 },
        { id: 'training', type: 'number', label: 'Prevenzione (formazione, pianificazione)', value: 35000 },
        { id: 'sales', type: 'number', label: 'Fatturato annuo', value: 5000000 }
      ], calc);
      function calc() {
        var v = f.values();
        var r = ss.copq(v);
        ui.clear(out);
        out.appendChild(ui.kv([
          ['Costi di prevenzione', num.fmt(r.prevention, 0)],
          ['Costi di valutazione', num.fmt(r.appraisal, 0)],
          ['Difetti interni', num.fmt(r.internalFailure, 0)],
          ['Difetti esterni', num.fmt(r.externalFailure, 0)],
          ['<b>Totale COPQ</b>', '<b>' + num.fmt(r.total, 0) + '</b>'],
          ['Quota dovuta ai difetti', num.fmt(r.failureShare, 1) + '%'],
          ['Sul fatturato', r.pctOfSales != null ? num.fmt(r.pctOfSales, 2) + '%' : '-']
        ]));
        var box = h('div');
        out.appendChild(box);
        C3.chart.renderPie(box, {
          title: 'Composizione del costo della non qualità', donut: true,
          centerLabel: num.fmt(r.total / 1000, 0) + 'k',
          data: r.rows.map(function (x) { return { label: x.category, value: x.value }; })
        });
        out.appendChild(ui.verdict(r.note, r.failureShare > 60 ? 'warn' : 'good'));
      }
      grid.appendChild(ui.panel('Costo della non qualità (COPQ)', null, [f.el, out]));
      calc();
    })();
  }

  /* ===================== RESA E SIGMA ===================== */
  function resa(el) {
    var out = h('div');
    var f = ui.form([
      {
        id: 'rows', type: 'textarea', rows: 6,
        label: 'Fasi: nome, unità lavorate, unità difettose',
        value: 'Taglio, 1000, 12\nSaldatura, 988, 31\nVerniciatura, 957, 18\nAssemblaggio, 939, 9\nCollaudo, 930, 14'
      }
    ], calc);
    el.appendChild(ui.panel('Rendimento a catena (RTY)', {
      sub: 'la resa finale e il prodotto delle rese di ogni fase'
    }, [f.el, out]));

    function calc() {
      var v = f.values();
      var steps = String(v.rows).split('\n').map(function (line) {
        var p = line.split(',').map(function (s) { return s.trim(); });
        return { name: p[0], units: Number(p[1]), defectiveUnits: Number(p[2]) };
      }).filter(function (s) { return s.name && isFinite(s.units); });
      if (!steps.length) { ui.clear(out); return; }
      var r = ss.rolledThroughput(steps);
      ui.clear(out);
      out.appendChild(ui.table([
        { key: 'name', label: 'Fase' },
        { key: function (x) { return 100 * x.yield; }, label: 'Resa %', digits: 3 },
        { key: function (x) { return 100 * x.cumulative; }, label: 'Resa cumulata %', digits: 3 },
        { key: 'dpu', label: 'DPU', digits: 4 }
      ], r.rows));
      out.appendChild(ui.kv([
        ['<b>RTY (resa complessiva)</b>', '<b>' + num.fmt(100 * r.rty, 3) + '%</b>'],
        ['Resa normalizzata per fase', num.fmt(100 * r.normalizedYield, 3) + '%'],
        ['DPU totale', r.totalDpu, 4],
        ['Livello sigma equivalente', r.sigmaLevel, 2],
        ['Fabbrica nascosta (rilavorazioni e scarti)', num.fmt(100 * r.hiddenFactory, 2) + '%']
      ]));
      var box = h('div');
      out.appendChild(box);
      C3.plots.lineChart(box, [
        {
          name: 'Resa di fase',
          points: r.rows.map(function (x, i) { return { x: i, y: 100 * x.yield, label: x.name }; })
        },
        {
          name: 'Resa cumulata',
          points: r.rows.map(function (x, i) { return { x: i, y: 100 * x.cumulative, label: x.name }; })
        }
      ], {
        title: 'Resa lungo il processo', xBand: true,
        categories: r.rows.map(function (x) { return x.name; }),
        yLabel: '%', height: 280, rotate: -20
      });
      out.appendChild(ui.verdict('Il RTY smaschera la "fabbrica nascosta": ogni fase sembra buona presa da sola, ' +
        'ma la probabilità che un pezzo attraversi tutte le fasi senza rilavorazioni e molto più bassa. ' +
        'Con ' + steps.length + ' fasi al 98% la resa complessiva scende a ' +
        num.fmt(100 * Math.pow(0.98, steps.length), 1) + '%.', 'good'));
    }
    calc();

    // conversioni
    var conv = h('div');
    el.appendChild(ui.panel('Tabella di conversione sigma - DPMO - resa', null, [
      ui.table([
        { key: 'sigma', label: 'Livello sigma', digits: 1 },
        { key: 'dpmoShifted', label: 'DPMO', digits: 1 },
        { key: 'yieldShifted', label: 'Resa %', digits: 4 },
        { key: 'cpk', label: 'Cpk', digits: 3 }
      ], ss.conversionTable()),
      ui.verdict('La convenzione Six Sigma include uno spostamento della media di 1,5 sigma nel lungo periodo: ' +
        'per questo un processo "6 sigma" produce 3,4 difetti per milione e non 0,002.', 'good'),
      h('button', { class: 'sm primary', onclick: function () { C3.app.navigate('capacita'); } }, 'Apri le conversioni interattive')
    ]));
  }

  /* ===================== CHARTER ===================== */
  function charter(el) {
    var fields = [
      { id: 'title', label: 'Titolo del progetto', value: 'Riduzione degli scarti sulla linea 2', type: 'text' },
      { id: 'problem', label: 'Dichiarazione del problema (cosa, dove, quando, quanto)', value: 'Negli ultimi 6 mesi la linea 2 ha prodotto il 4,2% di scarti contro un obiettivo del 1,5%, con un costo di 180.000 euro.', type: 'textarea' },
      { id: 'goal', label: 'Obiettivo misurabile', value: 'Portare lo scarto dal 4,2% all 1,5% entro 5 mesi, mantenendo la produttivita attuale.', type: 'textarea' },
      { id: 'scope', label: 'Perimetro (dentro / fuori)', value: 'Dentro: linea 2, codici A e B. Fuori: linea 1, fornitori di materia prima.', type: 'textarea' },
      { id: 'y', label: 'Metrica primaria (Y)', value: '% pezzi scartati per turno', type: 'text' },
      { id: 'secondary', label: 'Metriche secondarie e di controbilanciamento', value: 'OEE, tempo di cambio, costo unitario', type: 'text' },
      { id: 'benefit', label: 'Beneficio atteso', value: '115.000 euro/anno di minori scarti', type: 'text' },
      { id: 'team', label: 'Team e ruoli', value: 'Sponsor: direzione operations. Green Belt: ing. di processo. Team: capoturno, manutenzione, qualità.', type: 'textarea' },
      { id: 'risks', label: 'Rischi e vincoli', value: 'Fermi linea non programmabili; disponibilità materiale per le prove.', type: 'textarea' }
    ];
    var f = ui.form(fields.map(function (x) {
      return { id: x.id, type: x.type, label: x.label, value: x.value, rows: 3 };
    }), function () { preview(); });
    var out = h('div');
    var split = h('div', { class: 'split' });
    var left = h('div', { class: 'panel options-panel' });
    left.appendChild(h('h3', null, 'Compila il charter'));
    left.appendChild(f.el);
    left.appendChild(h('button', {
      class: 'primary', onclick: function () {
        var v = f.values();
        var txt = fields.map(function (x) { return x.label + '\n' + v[x.id] + '\n'; }).join('\n');
        C3.io.download(txt, 'project-charter.txt', 'text/plain;charset=utf-8');
      }
    }, 'Scarica il charter'));
    split.appendChild(left);
    var right = h('div');
    right.appendChild(out);
    split.appendChild(right);
    el.appendChild(split);

    function preview() {
      ui.clear(out);
      var v = f.values();
      out.appendChild(ui.panel(v.title || 'Project charter', { sub: 'anteprima' },
        h('div', { class: 'doc' }, fields.slice(1).map(function (x) {
          return h('div', { style: { marginBottom: '10px' } }, [
            h('h3', { text: x.label }),
            h('p', { text: v[x.id] })
          ]);
        }))));
      out.appendChild(ui.verdict('Un buon charter sta in una pagina e risponde a: <b>qual e il problema in numeri</b>, ' +
        '<b>quanto vale</b>, <b>chi decide</b>, <b>entro quando</b>. Se il problema non è misurabile, non è ancora un progetto Six Sigma.', 'good'));
    }
    preview();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
