/* CLAUDIO v3 - ui/views/lean-view.js
 * Pagina dedicata alle metodologie Lean: principi, sprechi, strumenti,
 * e calcolatori operativi (takt time, OEE, Little, kanban, EPEI, SMED,
 * value stream, bilanciamento linea, scorte).
 */
;(function (root) {
  'use strict';
  var C3 = root.C3;
  var ui = C3.ui, h = ui.h, num = C3.numeric, ss = C3.sixsigma;

  C3.app.registerView({
    id: 'lean',
    label: 'Metodologie Lean',
    icon: '♻',
    group: 'Metodologie',
    desc: 'I principi, gli sprechi e gli strumenti del Lean, con i calcolatori per applicarli: takt time, OEE, legge di Little, kanban, EPEI, SMED, value stream e bilanciamento della linea.',
    render: function (el) {
      var tabs = ui.tabs([
        { id: 'principi', label: 'Principi e sprechi', render: principi },
        { id: 'strumenti', label: 'Strumenti', render: strumenti },
        { id: 'calc', label: 'Calcolatori', render: calcolatori },
        { id: 'vsm', label: 'Value stream', render: vsm },
        { id: 'roadmap', label: 'Come iniziare', render: roadmap }
      ]);
      el.appendChild(tabs.el);
    }
  });

  /* ===================== PRINCIPI ===================== */
  function principi(el) {
    el.appendChild(ui.panel('I cinque principi del pensiero snello', { sub: 'Womack e Jones' },
      h('div', { class: 'steps' }, [
        ['Definisci il valore', 'Il valore lo stabilisce il cliente, non chi produce. Tutto cio che il cliente non e disposto a pagare e spreco o, al massimo, necessario ma non a valore.'],
        ['Mappa il flusso di valore', 'Segui il prodotto (o la pratica) dall inizio alla fine e distingui: attivita a valore, attivita necessarie ma senza valore, spreco puro. Di solito il tempo a valore e sotto il 5% del lead time.'],
        ['Crea il flusso', 'Elimina code, lotti e attese: il pezzo deve muoversi senza fermarsi. Il flusso a pezzo singolo espone subito i problemi invece di nasconderli nelle scorte.'],
        ['Fai tirare il cliente (pull)', 'Non produrre finche la fase a valle non lo chiede. Il kanban e il segnale che autorizza a produrre.'],
        ['Cerca la perfezione', 'Miglioramento continuo: ogni ciclo riduce gli sprechi e mette in luce quelli successivi, prima invisibili.']
      ].map(function (s) {
        return h('div', { class: 'step' }, [h('h4', { text: s[0] }), h('p', { text: s[1] })]);
      }))));

    el.appendChild(ui.panel('Gli otto sprechi (DOWNTIME)', { sub: 'come riconoscerli e cosa fare' },
      h('div', { class: 'cards' }, ss.LEAN_WASTES.map(function (w) {
        return h('div', { class: 'card' }, [
          h('span', { class: 'tag', text: w.code }),
          h('h4', { text: w.name }),
          h('p', { text: w.desc }),
          h('div', { class: 'small muted', text: 'Segnali: ' + w.signals.join(', ') }),
          h('ul', null, w.counter.map(function (c) { return h('li', { text: c }); }))
        ]);
      }))));

    el.appendChild(ui.panel('Lean e Six Sigma: due leve diverse', null,
      h('div', { class: 'doc' }, [
        h('p', { html: 'Il <b>Lean</b> attacca il <b>tempo</b>: elimina attivita che non aggiungono valore, riduce il lead time, fa scorrere il flusso. ' +
          'Il <b>Six Sigma</b> attacca la <b>variabilita</b>: riduce la dispersione e i difetti con metodi statistici.' }),
        h('p', { html: 'Non sono alternativi. Un processo veloce ma instabile produce difetti in fretta; un processo preciso ma lento non serve il cliente. ' +
          'La regola pratica e: <b>prima semplifica il flusso</b> (Lean), poi riduci la variabilita di cio che resta (Six Sigma). ' +
          'Semplificare un processo che poi verra eliminato e il classico spreco di analisi.' }),
        h('table', { class: 'data' }, [
          h('thead', null, h('tr', null, [h('th', null, 'Domanda'), h('th', null, 'Strumento tipico')])),
          h('tbody', null, [
            ['Il processo e lento e pieno di attese?', 'Value stream map, flusso continuo, SMED, kanban'],
            ['I difetti sono tanti e variabili?', 'Carte di controllo, capacita, DoE, MSA'],
            ['Le cause sono ignote?', 'Ishikawa, 5 perche, analisi multi-vari, test di ipotesi'],
            ['Serve trovare le impostazioni ottimali?', 'DoE fattoriale, superficie di risposta, desiderabilita'],
            ['Il risultato regge nel tempo?', 'Control plan, carte di controllo, standard work, audit'],
            ['Le macchine si fermano spesso?', 'OEE, TPM, manutenzione autonoma, analisi delle perdite']
          ].map(function (r) {
            return h('tr', null, [h('td', null, r[0]), h('td', null, r[1])]);
          }))
        ])
      ])));
  }

  /* ===================== STRUMENTI ===================== */
  function strumenti(el) {
    var tools = [
      {
        name: '5S', tag: 'ordine',
        desc: 'Seiri (separa), Seiton (ordina), Seiso (pulisci), Seiketsu (standardizza), Shitsuke (mantieni).',
        how: ['Foto prima/dopo di ogni postazione', 'Cartellini rossi per il materiale inutile', 'Sagome e posizioni fisse per gli attrezzi', 'Audit periodico con punteggio'],
        kpi: 'Tempo di ricerca attrezzi, punteggio audit 5S'
      },
      {
        name: 'Standard work', tag: 'stabilita',
        desc: 'La sequenza migliore nota, documentata e usata da tutti: tempo ciclo, sequenza delle operazioni, WIP standard.',
        how: ['Osserva e cronometra piu cicli', 'Scegli la sequenza migliore, non la media', 'Rendi visibile il foglio di lavoro standard', 'Aggiornalo a ogni kaizen'],
        kpi: 'Variabilita del tempo ciclo fra operatori'
      },
      {
        name: 'SMED', tag: 'flessibilita',
        desc: 'Riduzione dei tempi di cambio (single minute exchange of die): separare attivita interne ed esterne, convertirle, snellirle.',
        how: ['Filma il cambio completo', 'Classifica ogni attivita interna/esterna', 'Prepara tutto prima di fermare la macchina', 'Attacchi rapidi, riferimenti, nessuna regolazione'],
        kpi: 'Tempo di cambio, numero di cambi al giorno, dimensione del lotto'
      },
      {
        name: 'Kanban / pull', tag: 'flusso',
        desc: 'Il consumo a valle autorizza la produzione a monte: si elimina la sovrapproduzione.',
        how: ['Dimensiona i cartellini sul consumo e sul lead time', 'Supermarket con scorte visibili', 'Regola: nessun cartellino, nessuna produzione', 'Riduci i cartellini per far emergere i problemi'],
        kpi: 'WIP, lead time, rotture di stock'
      },
      {
        name: 'Heijunka', tag: 'livellamento',
        desc: 'Livellare volume e mix: produrre ogni giorno un po di tutto invece di grandi lotti alternati.',
        how: ['Heijunka box con sequenza ripetitiva', 'Ridurre i tempi di cambio per rendere sostenibili lotti piccoli', 'Stabilire un ritmo (pitch) di prelievo'],
        kpi: 'EPEI, variabilita della domanda a valle'
      },
      {
        name: 'TPM e OEE', tag: 'affidabilita',
        desc: 'Manutenzione produttiva totale: l operatore cura la macchina, le perdite si misurano con OEE.',
        how: ['Pulizia iniziale e ripristino delle condizioni base', 'Manutenzione autonoma quotidiana', 'Analisi delle sei grandi perdite', 'Manutenzione pianificata su dati'],
        kpi: 'OEE, MTBF, MTTR, fermate non pianificate'
      },
      {
        name: 'Poka-yoke', tag: 'qualita',
        desc: 'Dispositivi che rendono impossibile l errore o lo segnalano subito.',
        how: ['Analizza i modi di errore umano', 'Preferisci il controllo di prevenzione a quello di rilevazione', 'Sensori, sagome, conteggi automatici, sequenze obbligate'],
        kpi: 'Difetti sfuggiti, tasso di errore umano'
      },
      {
        name: 'Kaizen / A3', tag: 'miglioramento',
        desc: 'Miglioramento continuo strutturato su un foglio A3: contesto, stato attuale, obiettivo, analisi, contromisure, piano, verifica.',
        how: ['Vai al gemba e osserva il processo reale', 'Quantifica il problema', 'Coinvolgi chi fa il lavoro', 'Verifica il risultato con dati'],
        kpi: 'Numero di kaizen chiusi, beneficio verificato'
      },
      {
        name: 'Gestione a vista', tag: 'controllo',
        desc: 'Lo stato del processo deve essere leggibile in pochi secondi: andon, tabelloni, marcature a terra.',
        how: ['Un indicatore per problema, aggiornato dove il lavoro avviene', 'Segnalazione immediata delle anomalie', 'Riunioni brevi davanti ai dati (daily meeting)'],
        kpi: 'Tempo di reazione alle anomalie'
      },
      {
        name: 'Jidoka', tag: 'qualita',
        desc: 'Automazione con intelligenza umana: la macchina si ferma da sola quando rileva un anomalia, il difetto non prosegue.',
        how: ['Rilevazione automatica delle condizioni anomale', 'Fermata e segnalazione', 'Analisi della causa prima di ripartire'],
        kpi: 'Difetti passati alla fase successiva'
      }
    ];
    el.appendChild(ui.panel('Strumenti Lean', { sub: 'a cosa serve ciascuno e come si applica' },
      h('div', { class: 'cards' }, tools.map(function (t) {
        return h('div', { class: 'card' }, [
          h('span', { class: 'tag', text: t.tag }),
          h('h4', { text: t.name }),
          h('p', { text: t.desc }),
          h('ul', null, t.how.map(function (x) { return h('li', { text: x }); })),
          h('div', { class: 'small muted', style: { marginTop: '6px' }, text: 'Indicatori: ' + t.kpi })
        ]);
      }))));

    el.appendChild(ui.panel('Le sei grandi perdite (base dell OEE)', null,
      ui.table([
        { key: 'loss', label: 'Perdita' },
        { key: 'component', label: 'Componente OEE' },
        { key: 'action', label: 'Contromisura tipica' }
      ], [
        { loss: 'Guasti e fermate lunghe', component: 'Disponibilita', action: 'TPM, manutenzione pianificata, analisi delle cause' },
        { loss: 'Setup e regolazioni', component: 'Disponibilita', action: 'SMED, attacchi rapidi, standard di cambio' },
        { loss: 'Micro-fermate', component: 'Prestazione', action: 'Osservazione diretta, eliminazione degli inceppamenti' },
        { loss: 'Velocita ridotta', component: 'Prestazione', action: 'Ripristino delle condizioni base, parametri corretti' },
        { loss: 'Scarti di avviamento', component: 'Qualita', action: 'Standardizzazione dell avvio, primo pezzo buono' },
        { loss: 'Difetti in produzione', component: 'Qualita', action: 'SPC, poka-yoke, DoE sui parametri critici' }
      ])));
  }

  /* ===================== CALCOLATORI ===================== */
  function calcolatori(el) {
    var grid = h('div', { class: 'grid-2' });
    el.appendChild(grid);

    // takt time
    (function () {
      var out = h('div');
      var f = ui.form([
        { id: 'shift', type: 'number', label: 'Minuti per turno', value: 480 },
        { id: 'shifts', type: 'number', label: 'Numero di turni', value: 2, min: 1 },
        { id: 'breaks', type: 'number', label: 'Pause per turno (minuti)', value: 40 },
        { id: 'demand', type: 'number', label: 'Domanda del periodo (pezzi)', value: 750 },
        { id: 'cycle', type: 'number', label: 'Tempo ciclo attuale (minuti)', value: 2.1, step: 0.1 }
      ], calc);
      function calc() {
        var v = f.values();
        var r = ss.taktTime({
          shiftMinutes: v.shift, shifts: v.shifts, breaksMinutes: v.breaks,
          demand: v.demand, cycleTime: v.cycle
        });
        ui.clear(out);
        out.appendChild(ui.kv([
          ['Tempo disponibile', num.fmt(r.availableTimeMin, 1) + ' minuti'],
          ['Takt time', num.fmt(r.taktMinutes, 3) + ' min/pezzo (' + num.fmt(r.taktSeconds, 1) + ' s)'],
          ['Postazioni necessarie', r.requiredStations],
          ['Saturazione', r.utilization != null ? num.fmt(r.utilization, 1) + '%' : '-']
        ]));
        out.appendChild(ui.verdict(r.verdict || '', r.cycleTime > r.taktMinutes ? 'bad' : 'good'));
      }
      grid.appendChild(ui.panel('Takt time', { sub: 'il ritmo imposto dal cliente' }, [f.el, out]));
      calc();
    })();

    // OEE
    (function () {
      var out = h('div');
      var f = ui.form([
        { id: 'planned', type: 'number', label: 'Tempo pianificato (minuti)', value: 480 },
        { id: 'down', type: 'number', label: 'Fermate (minuti)', value: 60 },
        { id: 'ideal', type: 'number', label: 'Tempo ciclo ideale (minuti/pezzo)', value: 1, step: 0.01 },
        { id: 'total', type: 'number', label: 'Pezzi prodotti', value: 380 },
        { id: 'rejects', type: 'number', label: 'Pezzi scartati', value: 12 }
      ], calc);
      function calc() {
        var v = f.values();
        var r = ss.oee({
          plannedTime: v.planned, downtime: v.down, idealCycleTime: v.ideal,
          totalCount: v.total, rejects: v.rejects
        });
        ui.clear(out);
        out.appendChild(ui.kv([
          ['Disponibilita', num.fmt(100 * r.availability, 2) + '%'],
          ['Prestazione', num.fmt(100 * r.performance, 2) + '%'],
          ['Qualita', num.fmt(100 * r.quality, 2) + '%'],
          ['<b>OEE</b>', '<b>' + num.fmt(100 * r.oee, 2) + '%</b>'],
          ['Pezzi buoni', r.goodCount],
          ['Perdita per fermate', num.fmt(r.losses.availabilityLossMin, 1) + ' min'],
          ['Perdita per velocita', r.losses.performanceLossMin != null ? num.fmt(r.losses.performanceLossMin, 1) + ' min' : '-'],
          ['Perdita per qualita', r.losses.qualityLossMin != null ? num.fmt(r.losses.qualityLossMin, 1) + ' min' : '-']
        ]));
        out.appendChild(ui.verdict('Livello: ' + r.benchmark, r.oee >= 0.85 ? 'good' : (r.oee >= 0.6 ? 'warn' : 'bad')));
        var box = h('div');
        out.appendChild(box);
        C3.plots.barChart(box, [
          { label: 'Disponibilita', value: 100 * r.availability },
          { label: 'Prestazione', value: 100 * r.performance },
          { label: 'Qualita', value: 100 * r.quality },
          { label: 'OEE', value: 100 * r.oee }
        ], { valueLabel: '%', valueLabels: true, height: 230, title: 'Componenti dell OEE' });
      }
      grid.appendChild(ui.panel('OEE', { sub: 'efficacia complessiva dell impianto' }, [f.el, out]));
      calc();
    })();

    // legge di Little
    (function () {
      var out = h('div');
      var f = ui.form([
        { id: 'wip', type: 'number', label: 'WIP (pezzi in lavorazione)', value: 120 },
        { id: 'throughput', type: 'number', label: 'Throughput (pezzi/ora)', value: 30 }
      ], calc);
      function calc() {
        var v = f.values();
        var r = ss.little({ wip: v.wip, throughput: v.throughput });
        ui.clear(out);
        out.appendChild(ui.kv([
          ['Lead time', num.fmt(r.leadTime, 3) + ' ore (' + num.fmt(r.leadTime * 60, 1) + ' minuti)'],
          ['Se il WIP scendesse del 30%', num.fmt(v.wip * 0.7 / v.throughput, 3) + ' ore'],
          ['Per un lead time di 1 ora serve WIP', num.fmt(v.throughput, 1) + ' pezzi']
        ]));
        out.appendChild(ui.verdict(r.note, 'good'));
      }
      grid.appendChild(ui.panel('Legge di Little', { sub: 'WIP, throughput e lead time' }, [f.el, out]));
      calc();
    })();

    // kanban
    (function () {
      var out = h('div');
      var f = ui.form([
        { id: 'demand', type: 'number', label: 'Consumo (pezzi/ora)', value: 40 },
        { id: 'lead', type: 'number', label: 'Lead time di ripristino (ore)', value: 2, step: 0.1 },
        { id: 'container', type: 'number', label: 'Capacita del contenitore', value: 20 },
        { id: 'safety', type: 'number', label: 'Fattore di sicurezza', value: 0.2, step: 0.05 }
      ], calc);
      function calc() {
        var v = f.values();
        var r = ss.kanban({
          demandPerPeriod: v.demand, replenishmentLead: v.lead,
          containerSize: v.container, safetyFactor: v.safety
        });
        ui.clear(out);
        out.appendChild(ui.kv([
          ['Cartellini necessari', r.cards],
          ['Valore esatto', num.fmt(r.cardsExact, 3)],
          ['WIP massimo', r.wipCap + ' pezzi'],
          ['Copertura', num.fmt(r.coverageTime, 2) + ' ore']
        ]));
        out.appendChild(ui.verdict(r.note, 'good'));
      }
      grid.appendChild(ui.panel('Dimensionamento kanban', null, [f.el, out]));
      calc();
    })();

    // SMED
    (function () {
      var out = h('div');
      var f = ui.form([
        { id: 'internal', type: 'number', label: 'Tempo attivita interne (minuti)', value: 45 },
        { id: 'external', type: 'number', label: 'Tempo attivita esterne (minuti)', value: 15 },
        { id: 'convert', type: 'number', label: 'Attivita interne convertibili in esterne (minuti)', value: 18 },
        { id: 'reduce', type: 'number', label: 'Riduzione ottenibile sulle interne rimaste (minuti)', value: 8 },
        { id: 'perDay', type: 'number', label: 'Cambi al giorno', value: 3 }
      ], calc);
      function calc() {
        var v = f.values();
        var current = v.internal;
        var target = Math.max(0, v.internal - v.convert - v.reduce);
        var savedDay = (current - target) * v.perDay;
        ui.clear(out);
        out.appendChild(ui.kv([
          ['Tempo di cambio attuale (macchina ferma)', num.fmt(current, 1) + ' min'],
          ['Tempo di cambio obiettivo', num.fmt(target, 1) + ' min'],
          ['Riduzione', num.fmt(100 * (current - target) / current, 1) + '%'],
          ['Tempo macchina recuperato al giorno', num.fmt(savedDay, 1) + ' min'],
          ['Recupero annuo (220 giorni)', num.fmt(savedDay * 220 / 60, 0) + ' ore']
        ]));
        out.appendChild(h('ol', { class: 'small' }, ss.smed([]).steps.map(function (s) {
          return h('li', { text: s.replace(/^\d\.\s*/, '') });
        })));
      }
      grid.appendChild(ui.panel('SMED', { sub: 'riduzione del tempo di cambio' }, [f.el, out]));
      calc();
    })();

    // bilanciamento linea
    (function () {
      var out = h('div');
      var f = ui.form([
        {
          id: 'times', type: 'textarea', label: 'Tempi delle operazioni (uno per riga o separati da virgola)',
          rows: 4, value: '25, 18, 32, 27, 15, 21, 30'
        },
        { id: 'takt', type: 'number', label: 'Takt time (stesse unita)', value: 60 }
      ], calc);
      function calc() {
        var v = f.values();
        var times = String(v.times).split(/[\n,;]+/).map(function (s) { return Number(s.trim()); })
          .filter(function (x) { return isFinite(x) && x > 0; });
        if (!times.length) { ui.clear(out); return; }
        var r = ss.lineBalance(times.map(function (t, i) { return { name: 'Op' + (i + 1), time: t }; }), v.takt);
        ui.clear(out);
        out.appendChild(ui.kv([
          ['Lavoro totale', num.fmt(r.totalWork, 1)],
          ['Postazioni teoriche minime', r.theoreticalStations],
          ['Postazioni con assegnazione sequenziale', r.actualStations],
          ['Efficienza di bilanciamento', num.fmt(r.efficiency, 1) + '%'],
          ['Ritardo di bilanciamento', num.fmt(r.balanceDelay, 1) + '%'],
          ['Collo di bottiglia', 'postazione ' + r.bottleneckStation.index + ' con ' + num.fmt(r.bottleneckStation.time, 1)]
        ]));
        var box = h('div');
        out.appendChild(box);
        C3.plots.barChart(box, r.stations.map(function (s) {
          return { label: 'Post. ' + s.index, value: s.time };
        }), {
          title: 'Carico per postazione (yamazumi)', valueLabel: 'tempo',
          valueLabels: true, height: 250
        });
        out.appendChild(ui.verdict('Le barre sopra il takt non riescono a stare nel ritmo richiesto: spostare operazioni ' +
          'o ridurre il tempo del collo di bottiglia. Un efficienza sopra l 85% e un buon risultato pratico.', 'good'));
      }
      grid.appendChild(ui.panel('Bilanciamento della linea', { sub: 'grafico yamazumi' }, [f.el, out]));
      calc();
    })();

    // EPEI
    (function () {
      var out = h('div');
      var f = ui.form([
        {
          id: 'rows', type: 'textarea', rows: 5,
          label: 'Codici: nome, domanda, tempo ciclo, tempo di cambio (uno per riga)',
          value: 'A, 400, 0.5, 30\nB, 250, 0.6, 25\nC, 120, 0.8, 40'
        },
        { id: 'available', type: 'number', label: 'Tempo disponibile nel periodo (minuti)', value: 2400 }
      ], calc);
      function calc() {
        var v = f.values();
        var products = String(v.rows).split('\n').map(function (line) {
          var p = line.split(',').map(function (s) { return s.trim(); });
          return { name: p[0], demand: Number(p[1]), cycleTime: Number(p[2]), changeoverTime: Number(p[3]) };
        }).filter(function (p) { return p.name && isFinite(p.demand); });
        if (!products.length) { ui.clear(out); return; }
        var r = ss.epei({ products: products, availableTime: v.available });
        ui.clear(out);
        out.appendChild(ui.kv([
          ['Tempo di produzione richiesto', num.fmt(r.totalRunTime, 1) + ' min'],
          ['Tempo di cambio per un ciclo completo', num.fmt(r.totalChangeover, 1) + ' min'],
          ['Tempo residuo per i cambi', num.fmt(r.freeTimeForChangeovers, 1) + ' min'],
          ['Cicli completi possibili nel periodo', r.cyclesPerPeriod != null ? num.fmt(r.cyclesPerPeriod, 2) : '-'],
          ['EPEI (quota di periodo per ciclo)', r.epei != null ? num.fmt(r.epei, 3) : '-']
        ]));
        out.appendChild(ui.verdict(r.feasible
          ? r.note
          : 'Il tempo disponibile non copre nemmeno la produzione: serve capacita aggiuntiva o meno domanda.',
          r.feasible ? 'good' : 'bad'));
      }
      grid.appendChild(ui.panel('EPEI', { sub: 'ogni codice ogni quanto' }, [f.el, out]));
      calc();
    })();

    // scorte
    (function () {
      var out = h('div');
      var f = ui.form([
        { id: 'avg', type: 'number', label: 'Domanda media per periodo', value: 100 },
        { id: 'sd', type: 'number', label: 'Deviazione standard della domanda', value: 20 },
        { id: 'lead', type: 'number', label: 'Lead time (periodi)', value: 3 },
        { id: 'sdLead', type: 'number', label: 'Deviazione standard del lead time', value: 0.5, step: 0.1 },
        { id: 'service', type: 'number', label: 'Livello di servizio', value: 0.95, step: 0.01, min: 0.5, max: 0.999 }
      ], calc);
      function calc() {
        var v = f.values();
        var r = ss.safetyStock({
          avgDemand: v.avg, sdDemand: v.sd, leadTime: v.lead,
          sdLeadTime: v.sdLead, serviceLevel: v.service
        });
        ui.clear(out);
        out.appendChild(ui.kv([
          ['Fattore z', r.z, 4],
          ['Scorta di sicurezza', num.fmt(r.safetyStock, 1)],
          ['Punto di riordino', num.fmt(r.reorderPoint, 1)],
          ['Copertura della scorta di sicurezza', num.fmt(r.safetyStock / v.avg, 2) + ' periodi']
        ]));
        out.appendChild(ui.verdict(r.note, 'good'));
      }
      grid.appendChild(ui.panel('Scorta di sicurezza', { sub: 'e punto di riordino' }, [f.el, out]));
      calc();
    })();
  }

  /* ===================== VALUE STREAM ===================== */
  function vsm(el) {
    var out = h('div');
    var f = ui.form([
      {
        id: 'rows', type: 'textarea', rows: 8,
        label: 'Fasi: nome, tempo di processo, tempo di attesa, a valore (1/0)',
        value: 'Ricezione ordine, 5, 120, 0\nProgettazione, 240, 480, 1\nApprovvigionamento, 30, 2880, 0\nLavorazione, 90, 240, 1\nControllo, 20, 60, 0\nAssemblaggio, 120, 180, 1\nSpedizione, 15, 240, 0'
      }
    ], calc);
    el.appendChild(ui.panel('Mappa del flusso di valore', {
      sub: 'inserisci le fasi con i tempi: il calcolo distingue valore, non valore e attese'
    }, [f.el, out]));

    function calc() {
      var v = f.values();
      var steps = String(v.rows).split('\n').map(function (line) {
        var p = line.split(',').map(function (s) { return s.trim(); });
        return {
          name: p[0], processTime: Number(p[1]) || 0, waitTime: Number(p[2]) || 0,
          valueAdded: p[3] === '1'
        };
      }).filter(function (s) { return s.name; });
      if (!steps.length) { ui.clear(out); return; }
      var r = ss.valueStream(steps);
      ui.clear(out);
      out.appendChild(ui.table([
        { key: 'name', label: 'Fase' },
        { key: 'processTime', label: 'Tempo di processo', digits: 1 },
        { key: 'waitTime', label: 'Attesa', digits: 1 },
        {
          key: 'valueAdded', label: 'A valore', html: true,
          format: function (x) { return x ? '<span class="badge good">si</span>' : '<span class="badge">no</span>'; }
        },
        {
          key: function (s) { return s.processTime + s.waitTime; }, label: 'Totale', digits: 1
        }
      ], r.rows));
      out.appendChild(ui.kv([
        ['Tempo a valore', num.fmt(r.valueAddedTime, 1)],
        ['Tempo senza valore (lavorazioni)', num.fmt(r.nonValueAddedTime, 1)],
        ['Tempo di attesa', num.fmt(r.waitTime, 1)],
        ['<b>Lead time totale</b>', '<b>' + num.fmt(r.leadTime, 1) + '</b>'],
        ['<b>Efficienza del ciclo di processo (PCE)</b>', '<b>' + num.fmt(r.pce, 2) + '%</b>'],
        ['Collo di bottiglia', r.bottleneck ? r.bottleneck.name + ' (' + num.fmt(r.bottleneck.processTime, 1) + ')' : '-']
      ]));
      out.appendChild(ui.verdict(r.note + ' Con PCE = ' + num.fmt(r.pce, 1) + '% il ' +
        num.fmt(100 - r.pce, 1) + '% del tempo il prodotto sta fermo: e li che si trova il margine piu grande, ' +
        'non nella velocita delle macchine.', r.pce > 25 ? 'good' : 'warn'));
      var box = h('div');
      out.appendChild(box);
      C3.chart.render(box, {
        title: 'Composizione del lead time',
        height: 300,
        margin: { left: 130, right: 40, top: 10, bottom: 40 },
        x: { label: 'Tempo', includeZero: true, gridlines: true },
        y: {
          domain: [-0.6, r.rows.length - 0.4], ticks: r.rows.length, gridlines: false,
          format: function (val) {
            var i = Math.round(val);
            return r.rows[i] ? r.rows[i].name : '';
          }
        },
        series: [
          {
            type: 'bars', orientation: 'h', name: 'Processo', barWidth: 16,
            groupCount: 2, groupIndex: 0,
            points: r.rows.map(function (s, i) { return { x: i, y: s.processTime, label: s.name }; }),
            color: C3.chart.seriesColor(0)
          },
          {
            type: 'bars', orientation: 'h', name: 'Attesa', barWidth: 16,
            groupCount: 2, groupIndex: 1,
            points: r.rows.map(function (s, i) { return { x: i, y: s.waitTime, label: s.name }; }),
            color: C3.chart.seriesColor(1)
          }
        ]
      });
      var pie = h('div');
      out.appendChild(pie);
      C3.chart.renderPie(pie, {
        title: 'Valore contro spreco', donut: true,
        centerLabel: num.fmt(r.pce, 1) + '%',
        data: [
          { label: 'A valore', value: r.valueAddedTime },
          { label: 'Senza valore', value: r.nonValueAddedTime },
          { label: 'Attesa', value: r.waitTime }
        ]
      });
    }
    calc();
  }

  /* ===================== ROADMAP ===================== */
  function roadmap(el) {
    el.appendChild(ui.panel('Da dove si comincia', { sub: 'sequenza tipica di un percorso Lean' },
      h('div', { class: 'timeline' }, [
        ['Scegli un flusso, non tutta la fabbrica', 'Un prodotto o una famiglia con volumi significativi e problemi evidenti. Il perimetro deve essere percorribile a piedi in un giorno.'],
        ['Vai al gemba e misura', 'Cronometra, conta il WIP, misura le attese. Non fidarti dei tempi a sistema: quasi sempre sono tempi standard, non tempi reali.'],
        ['Disegna lo stato attuale', 'Value stream map con tempi di processo, attese, scorte, qualita. Calcola il lead time e il PCE.'],
        ['Stabilizza prima di ottimizzare', '5S, standard work, manutenzione di base. Un processo instabile non si puo migliorare: i risultati non sarebbero ripetibili.'],
        ['Crea il flusso', 'Riduci i lotti (SMED), avvicina le fasi, bilancia sul takt time, elimina i controlli ridondanti.'],
        ['Introduci il pull', 'Kanban e supermarket dove il flusso continuo non e possibile. Riduci progressivamente i cartellini.'],
        ['Livella', 'Heijunka: mix ripetitivo, ritmo costante. Serve che i tempi di cambio siano gia bassi.'],
        ['Consolida e ripeti', 'Standard aggiornati, indicatori a vista, audit. Poi scegli il flusso successivo.']
      ].map(function (p) {
        return h('div', { class: 'phase' }, [h('h3', { text: p[0] }), h('p', { text: p[1] })]);
      }))));

    el.appendChild(ui.panel('Errori frequenti', null,
      h('div', { class: 'doc' }, h('ul', null, [
        'Applicare gli strumenti come obiettivo: il 5S fatto per il punteggio dell audit non produce alcun risultato economico.',
        'Ottimizzare una fase isolata: se non e il collo di bottiglia, il lead time complessivo non cambia.',
        'Ridurre il WIP senza ridurre la variabilita: le rotture di flusso aumentano e la produzione si ferma.',
        'Dimenticare la manutenzione: un flusso teso senza affidabilita si blocca al primo guasto.',
        'Misurare solo l efficienza delle macchine: spinge alla sovrapproduzione, il peggiore degli sprechi.',
        'Non coinvolgere chi fa il lavoro: gli standard scritti a tavolino non vengono seguiti.',
        'Chiudere il progetto senza control plan: in pochi mesi il processo torna come prima.'
      ].map(function (x) { return h('li', { text: x }); })))));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
