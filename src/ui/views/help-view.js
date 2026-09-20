/* CLAUDIO v3 - ui/views/help-view.js
 * Guida all’uso, riferimento delle formule, glossario, note di validazione.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3;
  var ui = C3.ui, h = ui.h, num = C3.numeric;

  C3.app.registerView({
    id: 'guida',
    label: 'Guida e riferimenti',
    icon: '?',
    group: 'Metodologie',
    desc: 'Come si usa il software, riferimento delle formule delle colonne calcolate, glossario statistico e note su come sono stati verificati i calcoli.',
    render: function (el) {
      var tabs = ui.tabs([
        { id: 'uso', label: 'Come si usa', render: uso },
        { id: 'formule', label: 'Formule delle colonne', render: formule },
        { id: 'glossario', label: 'Glossario', render: glossario },
        { id: 'validazione', label: 'Verifica dei calcoli', render: validazione }
      ]);
      el.appendChild(tabs.el);
    }
  });

  function uso(el) {
    el.appendChild(ui.panel('Flusso di lavoro tipico', null,
      h('div', { class: 'steps' }, [
        ['Carica i dati', 'Dalla barra in alto: <b>Importa</b> per file CSV/TXT/Excel, oppure incolla direttamente da Excel (Ctrl+V anche fuori dalle caselle di testo). ' +
          'Con <b>Esempi</b> carichi dataset già pronti per provare ogni analisi.'],
        ['Controlla i tipi di colonna', 'Nella vista <b>Dati</b>, scheda Colonne: le colonne numeriche servono per medie e carte, quelle categoriche per raggruppare. ' +
          'Puoi creare colonne calcolate con formule.'],
        ['Esplora', 'Vista <b>Descrittive</b> per la forma della distribuzione, <b>Grafici interattivi</b> per costruire visualizzazioni libere, ' +
          '<b>Cruscotto</b> per raccoglierle in un quadro unico.'],
        ['Analizza', 'Test di ipotesi, ANOVA, regressione, carte di controllo, capacità, MSA, DoE: ogni vista ha i comandi a sinistra e i risultati a destra.'],
        ['Esporta', 'Ogni tabella ha il pulsante di esportazione CSV; ogni grafico si salva in PNG o SVG. Con <b>Salva</b> scarichi l’intero progetto in JSON.']
      ].map(function (s) {
        return h('div', { class: 'step' }, [h('h4', { html: s[0] }), h('p', { html: s[1] })]);
      }))));

    el.appendChild(ui.panel('Dove sono i dati', null,
      h('div', { class: 'doc' }, [
        h('p', { html: 'Tutti i calcoli avvengono <b>nel tuo browser</b>: nessun dato viene inviato in rete. ' +
          'Il progetto viene salvato automaticamente nella memoria locale del browser (localStorage) e può essere ' +
          'scaricato come file JSON con il pulsante <b>Salva</b>.' }),
        h('p', { html: 'Se svuoti i dati del browser o cambi computer, riapri il progetto con <b>Apri</b> e il file JSON salvato.' }),
        h('p', { html: 'Scorciatoie: <code>Ctrl+S</code> salva il progetto in locale, <code>Ctrl+V</code> incolla una tabella dagli appunti.' })
      ])));

    el.appendChild(ui.panel('Impostazioni', null, ui.kv([
      ['Livello di significativita (alpha)', 'Barra in alto. Vale per tutti i test, gli intervalli di confidenza e i grafici.'],
      ['Tema', 'Pulsante Auto / Chiaro / Scuro in alto a destra: i grafici si ridisegnano con la palette corrispondente.'],
      ['Dataset attivo', 'Il menu a tendina in alto: tutte le viste lavorano sul dataset selezionato.'],
      ['Stampa e PDF', 'Il tasto Stampa del browser produce una versione senza menu, adatta al PDF.']
    ])));
  }

  function formule(el) {
    el.appendChild(ui.panel('Riferimento delle formule', {
      sub: 'da usare nella vista Dati per creare colonne calcolate o filtri'
    }, ui.table([
      { key: 'name', label: 'Elemento' },
      { key: 'desc', label: 'Descrizione' }
    ], C3.data.FORMULA_HELP)));

    el.appendChild(ui.panel('Esempi pratici', null,
      ui.table([
        { key: 'f', label: 'Formula' },
        { key: 'd', label: 'Risultato' }
      ], [
        { f: 'Volume - 500', d: 'scostamento dal valore nominale' },
        { f: 'ZSCORE(Volume)', d: 'punteggio z standardizzato' },
        { f: 'IF(Difettosi > 5, 1, 0)', d: 'indicatore 0/1 per la regressione logistica' },
        { f: 'Difettosi / Ispezionati * 100', d: 'percentuale difettosa' },
        { f: 'LOG(Tempo)', d: 'trasformazione logaritmica' },
        { f: 'ROUND((Peso - MEAN(Peso)) / SD(Peso), 3)', d: 'z-score arrotondato' },
        { f: 'ROW()', d: 'numero progressivo della riga (utile come ordine di raccolta)' },
        { f: 'Volume - LAG(Volume, 1)', d: 'differenza rispetto alla riga precedente' },
        { f: 'IF(Turno == "Turno 1", 1, -1)', d: 'codifica di un fattore a due livelli' },
        { f: 'SQRT(POW(X, 2) + POW(Y, 2))', d: 'distanza dall’origine' }
      ])));

    el.appendChild(ui.verdict('Le formule accettano solo nomi di colonna e funzioni elencate: qualunque altro ' +
      'identificatore viene rifiutato con un messaggio di errore. Se il nome della colonna contiene spazi, ' +
      'scrivilo fra parentesi quadre: <code>[Peso netto] * 2</code>.', 'good'));
  }

  function glossario(el) {
    var terms = [
      ['alpha (livello di significativita)', 'Probabilità di dichiarare una differenza che non esiste (falso allarme). Tipicamente 0,05.'],
      ['p-value', 'Probabilità di osservare dati estremi come i nostri se l’ipotesi nulla fosse vera. Piccolo = i dati sono poco compatibili con H0. Non è la probabilità che H0 sia vera.'],
      ['Potenza', 'Probabilità di rilevare una differenza che esiste davvero. Cresce con la numerosità e con la grandezza dell’effetto, cala con la variabilità.'],
      ['Intervallo di confidenza', 'Campo di valori compatibili con i dati al livello di confidenza scelto. Più informativo del solo p-value.'],
      ['Intervallo di predizione', 'Campo entro cui cadra una singola nuova osservazione: sempre più ampio dell’intervallo di confidenza della media.'],
      ['Cp e Cpk', 'Capacità potenziale (Cp, ignora il centraggio) ed effettiva (Cpk) calcolate con la sigma di breve termine.'],
      ['Pp e Ppk', 'Gli stessi indici calcolati con la variabilità complessiva di lungo periodo: e quella che vede il cliente.'],
      ['Sigma within e overall', 'Within = variabilità entro sottogruppo (breve termine). Overall = variabilità totale, comprende gli spostamenti nel tempo.'],
      ['DPMO', 'Difetti per milione di opportunita.'],
      ['Livello sigma', 'Numero di deviazioni standard fra la media e il limite di specifica più vicino, per convenzione con uno spostamento di 1,5 sigma.'],
      ['Causa comune / speciale', 'Comune = variabilità intrinseca del processo (sistema). Speciale = evento identificabile e rimovibile.'],
      ['ARL', 'Numero medio di punti prima di un allarme. In controllo dovrebbe essere alto (370 con i soli limiti 3 sigma), fuori controllo basso.'],
      ['Gage R&R', 'Quota di variabilità totale dovuta al sistema di misura (ripetibilità + riproducibilità).'],
      ['ndc', 'Numero di categorie distinte che lo strumento riesce a separare: almeno 5.'],
      ['Effetto (DoE)', 'Variazione media della risposta passando dal livello basso al livello alto di un fattore.'],
      ['Alias', 'Due effetti che non possono essere distinti perché stimati dalla stessa combinazione di prove.'],
      ['Risoluzione', 'Indica quali effetti sono confusi fra loro in un disegno frazionario.'],
      ['Desiderabilità', 'Punteggio da 0 a 1 che traduce quanto una risposta si avvicina all’obiettivo; la composita e la media geometrica.'],
      ['R-quadro previsto', 'Quota di variabilità che il modello spiegherebbe su nuovi dati, calcolata con la validazione leave-one-out (PRESS).'],
      ['VIF', 'Fattore di inflazione della varianza: sopra 5-10 indica collinearita fra predittori.'],
      ['Residuo studentizzato', 'Residuo diviso per la sua deviazione standard stimata escludendo l’osservazione stessa: sopra 3 in valore assoluto e sospetto.'],
      ['Distanza di Cook', 'Quanto cambierebbero le stime del modello eliminando quell’osservazione.'],
      ['Durbin-Watson', 'Indice di autocorrelazione dei residui: vicino a 2 significa indipendenza.'],
      ['Takt time', 'Ritmo richiesto dal cliente: tempo disponibile diviso la domanda.'],
      ['OEE', 'Disponibilità x prestazione x qualità: efficacia complessiva dell’impianto.'],
      ['PCE', 'Efficienza del ciclo di processo: tempo a valore diviso lead time.'],
      ['RTY', 'Resa complessiva del flusso: prodotto delle rese di tutte le fasi.']
    ];
    el.appendChild(ui.panel('Glossario', null,
      ui.table([
        { key: 0, label: 'Termine' },
        { key: 1, label: 'Significato' }
      ], terms.map(function (t) { return { 0: t[0], 1: t[1] }; }))));
  }

  function validazione(el) {
    el.appendChild(ui.panel('Come sono stati verificati i calcoli', {
      sub: 'ogni modulo statistico e confrontato con valori pubblicati'
    }, h('div', { class: 'doc' }, [
      h('p', { html: 'Il motore statistico e scritto da zero (nessuna libreria esterna) e verificato da una suite di test ' +
        'automatici confrontando i risultati con tabelle pubblicate e con valori di riferimento di software statistici.' }),
      h('table', { class: 'data' }, [
        h('thead', null, h('tr', null, [h('th', null, 'Area'), h('th', null, 'Verifica')])),
        h('tbody', null, [
          ['Distribuzioni', 'Quantili di normale, t, chi-quadro, F, binomiale, Poisson e beta confrontati con le tavole statistiche (errore < 1e-6).'],
          ['Costanti delle carte di controllo', 'd2 calcolata per quadratura numerica, c4 in forma esatta; A2, A3, D3, D4, B3, B4, E2 confrontate con le tabelle ASTM.'],
          ['Range studentizzato (Tukey)', 'Valori critici q(0,95) e q(0,99) confrontati con le tavole per diverse combinazioni di k e gradi di liberta.'],
          ['Potenza', 't non centrale e F non centrale integrate numericamente; risultati confrontati con i valori di riferimento (es. potenza 0,5645 per n = 20, d = 0,5).'],
          ['Capacità', 'Cp = 1 e Cpk = 1 producono esattamente 2699,8 PPM; la conversione 6 sigma <-> 3,4 DPMO e verificata.'],
          ['ANOVA e regressione', 'Somme dei quadrati, F e p verificati su esempi calcolabili a mano e su dataset di riferimento.'],
          ['Test non parametrici', 'Kruskal-Wallis confrontato con l’esempio classico di Hollander e Wolfe (H = 0,7714, p = 0,68).'],
          ['Disegni sperimentali', 'Ortogonalità di tutti gli array (X\'X diagonale) verificata a runtime; risoluzione e alias calcolati dal gruppo dei contrasti definenti; conteggi di prove di CCD e Box-Behnken confrontati con i riferimenti.'],
          ['Gage R&R', 'Componenti della varianza verificate su dati simulati con componenti note.'],
          ['Miscele', 'Coefficienti del modello di Scheffe verificati su risposte generate da un modello noto.']
        ].map(function (r) {
          return h('tr', null, r.map(function (c) { return h('td', null, c); }));
        }))
      ]),
      h('p', { class: 'small muted', html: 'I test si eseguono con <code>node --test test/</code> nella cartella del progetto.' })
    ])));

    el.appendChild(ui.panel('Convenzioni adottate', null, ui.kv([
      ['Percentili', 'Interpolazione (n+1)p, la stessa usata dai principali software di qualità. La mediana usa il metodo classico.'],
      ['Asimmetria e curtosi', 'Stimatori corretti per il campione (gli stessi di Excel: SKEW e KURT).'],
      ['Sigma within predefinita', 'Range medio diviso d2 per sottogruppi, range mobile diviso d2 per dati individuali.'],
      ['Effetti nel DoE', 'Effetto = 2 x coefficiente in unità codificate.'],
      ['Capacità non normale', 'Metodo ISO sui percentili 0,135% e 99,865% della distribuzione adattata.'],
      ['Gage R&R', 'Metodo ANOVA con esclusione dell’interazione se p > 0,25 (impostabile); study variation a 6 deviazioni standard.'],
      ['Spostamento sigma', '1,5 sigma nella conversione fra breve e lungo termine (convenzione Six Sigma).']
    ])));

    el.appendChild(ui.panel('Limiti noti', null,
      h('div', { class: 'doc' }, h('ul', null, [
        'I p-value dell’Anderson-Darling sono calcolati con le formule di approssimazione standard per il caso normale; per altre distribuzioni viene riportata la sola statistica.',
        'Il test di Dunnett usa una simulazione Monte Carlo con seme fisso (20.000 estrazioni): i valori critici possono differire in terza cifra dalle tavole.',
        'Le componenti della varianza richiedono disegni bilanciati.',
        'La lettura dei file Excel supporta il formato .xlsx (non il vecchio .xls) e richiede un browser con supporto alla decompressione integrata.',
        'I disegni di Taguchi disponibili sono quelli verificabili algoritmicamente (L4, L8, L9, L12, L16, L18, L27).',
        'Il metodo di Lenth si attiva automaticamente quando non ci sono gradi di liberta per l’errore.'
      ].map(function (x) { return h('li', { text: x }); })))));

    el.appendChild(ui.panel('Riferimenti', null,
      h('div', { class: 'doc' }, h('ul', null, [
        'D. C. Montgomery, Design and Analysis of Experiments, Wiley (per i disegni sperimentali e l’analisi).',
        'D. C. Montgomery, Introduction to Statistical Quality Control (carte di controllo, capacità, campionamento).',
        'AIAG, Measurement Systems Analysis (Gage R&R, bias, linearità, concordanza per attributi).',
        'ASTM E2587 / manuali ASTM per le costanti delle carte di controllo.',
        'G. Derringer, R. Suich, Simultaneous Optimization of Several Response Variables (desiderabilità).',
        'R. V. Lenth, Quick and Easy Analysis of Unreplicated Factorials (metodo PSE).',
        'B. Jones, C. J. Nachtsheim, A Class of Three-Level Designs for Definitive Screening.',
        'J. M. Womack, D. T. Jones, Lean Thinking (principi Lean).',
        'S. Shingo, A Revolution in Manufacturing: The SMED System.'
      ].map(function (x) { return h('li', { text: x }); })))));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
