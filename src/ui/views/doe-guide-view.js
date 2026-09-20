/* CLAUDIO v3 - ui/views/doe-guide-view.js
 * Guida alle tecniche sperimentali: strategia per fasi, selettore del disegno,
 * concetti fondamentali, procedura di analisi, errori tipici.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3;
  var ui = C3.ui, h = ui.h, num = C3.numeric, doe = C3.doe;

  C3.app.registerView({
    id: 'doe-guida',
    label: 'Guida al DoE',
    icon: '⚑',
    group: 'Metodologie',
    desc: 'Quale disegno sperimentale usare e perché: strategia per fasi, selettore guidato, concetti chiave, procedura di analisi ed errori da evitare.',
    render: function (el) {
      var tabs = ui.tabs([
        { id: 'strategia', label: 'Strategia', render: strategia },
        { id: 'scegli', label: 'Quale disegno mi serve', render: selettore },
        { id: 'tecniche', label: 'Le tecniche', render: tecniche },
        { id: 'concetti', label: 'Concetti chiave', render: concetti },
        { id: 'analisi', label: 'Come si analizza', render: analisi },
        { id: 'errori', label: 'Errori tipici', render: errori }
      ]);
      el.appendChild(tabs.el);
    }
  });

  /* ===================== STRATEGIA ===================== */
  function strategia(el) {
    el.appendChild(ui.panel('La sperimentazione è sequenziale', {
      sub: 'mai spendere tutto il budget in un unico esperimento'
    }, h('div', { class: 'doc' }, [
      h('p', { html: 'Regola pratica consolidata: <b>non più del 25% del budget sperimentale nel primo esperimento</b>. ' +
        'Un esperimento serve a imparare e a decidere il successivo: la conoscenza arriva per cicli, non in un colpo solo.' }),
      h('p', { html: 'La sequenza tipica è: <b>screening</b> (quali fattori contano) -> <b>caratterizzazione</b> ' +
        '(come agiscono e con quali interazioni) -> <b>ottimizzazione</b> (dove sta il punto migliore) -> ' +
        '<b>conferma</b> (il risultato regge in produzione?).' })
    ])));

    el.appendChild(ui.panel('Le quattro fasi', null,
      h('div', { class: 'timeline' }, [
        {
          t: '1. Screening: quali fattori contano davvero',
          q: 'Ho 6-15 fattori candidati e poche prove disponibili.',
          d: 'Si accetta di confondere le interazioni pur di provare molti fattori con poche prove. ' +
            'L’obiettivo non è la precisione ma la selezione: tipicamente 2-5 fattori sopravvivono.',
          designs: 'Frazionario di risoluzione III o IV, Plackett-Burman, Definitive Screening Design',
          runs: 'da 8 a 24 prove',
          out: 'elenco dei fattori attivi, stima grossolana degli effetti'
        },
        {
          t: '2. Caratterizzazione: come agiscono e come interagiscono',
          q: 'Ho 2-5 fattori importanti e voglio capire il loro effetto e le interazioni.',
          d: 'Serve un disegno che stimi separatamente effetti principali e interazioni a due fattori. ' +
            'Si aggiungono punti centrali per verificare se il modello lineare basta.',
          designs: 'Fattoriale completo 2^k, frazionario di risoluzione V, con punti centrali',
          runs: 'da 8 a 32 prove più 3-5 punti centrali',
          out: 'modello lineare con interazioni, verifica di curvatura'
        },
        {
          t: '3. Ottimizzazione: dove sta il punto migliore',
          q: 'So quali fattori contano e la curvatura è significativa.',
          d: 'Si stima un modello quadratico: la superficie di risposta descrive massimi, minimi e creste. ' +
            'Con più risposte si usa la desiderabilità per trovare il compromesso.',
          designs: 'Central Composite Design, Box-Behnken, disegni D-optimal per spazi vincolati',
          runs: 'da 13 (2 fattori) a 50 prove',
          out: 'equazione quadratica, mappa di contorno, condizioni ottimali'
        },
        {
          t: '4. Conferma è robustezza',
          q: 'Ho trovato le condizioni ottimali: reggono nel tempo?',
          d: 'Prove ripetute alle condizioni scelte per verificare che il risultato cada nell’intervallo di predizione. ' +
            'Poi si verifica la robustezza rispetto al rumore (materiali, ambiente, operatori).',
          designs: 'Prove di conferma replicate, disegni di Taguchi con array esterno, studi di robustezza',
          runs: 'da 5 a 20 prove',
          out: 'conferma del guadagno, impostazioni robuste, control plan'
        }
      ].map(function (p) {
        return h('div', { class: 'phase' }, [
          h('h3', { text: p.t }),
          h('p', { class: 'small muted', html: '<b>Quando:</b> ' + p.q }),
          h('p', { text: p.d }),
          ui.kv([['Disegni', p.designs], ['Prove tipiche', p.runs], ['Risultato', p.out]])
        ]);
      }))));

    el.appendChild(ui.panel('Metodo della massima pendenza (steepest ascent)', null,
      h('div', { class: 'doc' }, [
        h('p', { html: 'Se l’ottimo non è dentro la regione esplorata, il modello lineare indica la <b>direzione</b> in cui muoversi: ' +
          'e la direzione dei coefficienti (gradiente). Si eseguono prove singole lungo quella direzione finché la risposta smette di migliorare; ' +
          'li si centra un nuovo esperimento fattoriale.' }),
        h('p', { html: 'Segnali che si è arrivati vicino all’ottimo: gli effetti principali diventano piccoli, la <b>curvatura</b> diventa significativa, ' +
          'i punti centrali si staccano dalla media dei punti fattoriali. A quel punto si passa al disegno per superficie di risposta.' })
      ])));
  }

  /* ===================== SELETTORE ===================== */
  function selettore(el) {
    var out = h('div');
    var f = ui.form([
      {
        id: 'goal', type: 'chips', label: 'Obiettivo', value: 'screening', options: [
          { value: 'screening', label: 'Capire quali fattori contano' },
          { value: 'effects', label: 'Stimare effetti e interazioni' },
          { value: 'optimize', label: 'Trovare le condizioni ottimali' },
          { value: 'robust', label: 'Rendere il processo robusto' },
          { value: 'compare', label: 'Confrontare trattamenti o materiali' },
          { value: 'mixture', label: 'Studiare una formulazione (miscela)' }
        ]
      },
      { id: 'k', type: 'number', label: 'Numero di fattori', value: 4, min: 1, max: 15 },
      { id: 'budget', type: 'number', label: 'Prove disponibili', value: 16, min: 4, max: 200 },
      {
        id: 'levels', type: 'chips', label: 'I fattori sono', value: 'cont', options: [
          { value: 'cont', label: 'Continui (temperatura, pressione...)' },
          { value: 'cat', label: 'Categorici (fornitore, macchina...)' }
        ]
      },
      { id: 'hardToChange', type: 'checkbox', label: 'Almeno un fattore e difficile o costoso da cambiare', value: false },
      { id: 'nuisance', type: 'checkbox', label: 'Esiste una fonte di disturbo nota (giorno, lotto, operatore)', value: false },
      { id: 'destructive', type: 'checkbox', label: 'La prova distrugge il pezzo', value: false },
      { id: 'curvature', type: 'checkbox', label: 'Sospetto una risposta non lineare', value: false }
    ], function () { run(); });

    var split = h('div', { class: 'split' });
    var left = h('div', { class: 'panel options-panel' });
    var right = h('div');
    left.appendChild(h('h3', null, 'Descrivi la situazione'));
    left.appendChild(f.el);
    right.appendChild(out);
    split.appendChild(left);
    split.appendChild(right);
    el.appendChild(split);

    function run() {
      ui.clear(out);
      var v = f.values();
      var recs = [];

      if (v.goal === 'mixture') {
        recs.push({
          name: 'Disegno per miscele (simplex lattice o centroid)',
          runs: v.k <= 3 ? '7-15 prove' : (v.k <= 5 ? '15-30 prove' : '30+ prove'),
          why: 'I componenti sono proporzioni che sommano a 1: non si possono variare in modo indipendente, ' +
            'quindi servono disegni sul simplesso e modelli di Scheffe senza costante.',
          how: 'Se ci sono vincoli su minimi e massimi dei componenti usa i vertici estremi.',
          score: 100
        });
      } else if (v.goal === 'compare') {
        recs.push({
          name: v.nuisance ? 'Blocchi randomizzati completi (RCBD)' : 'Disegno a una via con randomizzazione completa',
          runs: (v.k * 5) + '-' + (v.k * 10) + ' prove',
          why: v.nuisance
            ? 'Il blocco cattura la variabilità nota (giorno, lotto, macchina) e la toglie dall’errore: il confronto diventa più sensibile.'
            : 'Con una sola fonte di variazione basta replicare e randomizzare: si analizza con ANOVA e confronti multipli.',
          how: 'Analisi: ANOVA a una via, poi Tukey per le coppie. Verifica varianze uguali (Levene) è normalità dei residui.',
          score: 100
        });
        if (v.k >= 3 && v.nuisance) {
          recs.push({
            name: 'Quadrato latino',
            runs: (v.k * v.k) + ' prove',
            why: 'Controlla due fonti di disturbo (righe e colonne) con k^2 prove invece di k^3.',
            how: 'Richiede che non ci siano interazioni fra trattamento e fonti di disturbo.',
            score: 70
          });
        }
      } else if (v.goal === 'robust') {
        recs.push({
          name: 'Disegno di Taguchi con array interno ed esterno',
          runs: 'array interno (L8, L9, L18...) x 3-4 condizioni di rumore',
          why: 'Si cercano le impostazioni che rendono la risposta insensibile ai fattori di rumore, non solo quelle che la ottimizzano.',
          how: 'Analizza il rapporto S/N per la robustezza e la media per la centratura (approccio in due passi).',
          score: 100
        });
        recs.push({
          name: 'Fattoriale con fattori di rumore inclusi nel modello',
          runs: Math.pow(2, Math.min(v.k + 2, 5)) + '-32 prove',
          why: 'Alternativa moderna: si includono i fattori di rumore nel disegno e si cercano le interazioni controllo x rumore, ' +
            'che sono esattamente ciò che rende (o non rende) robusto il processo.',
          how: 'Si privilegiano i livelli dei fattori di controllo che annullano le interazioni con il rumore.',
          score: 90
        });
      } else if (v.goal === 'optimize' || v.curvature) {
        var ccdRuns = Math.pow(2, v.k) + 2 * v.k + 5;
        if (v.k <= 5) {
          recs.push({
            name: 'Central Composite Design (CCD)',
            runs: ccdRuns + ' prove circa',
            why: 'Stima il modello quadratico completo e permette di trovare massimi, minimi e creste. ' +
              'Se hai già fatto un fattoriale, basta aggiungere i punti assiali e centrali.',
            how: 'Alpha rotatabile per varianza di previsione uniforme; alpha = 1 (face-centered) se non puoi uscire dai livelli già usati.',
            score: 100
          });
          recs.push({
            name: 'Box-Behnken',
            runs: (v.k === 3 ? 15 : (v.k === 4 ? 27 : 43)) + ' prove',
            why: 'Tre livelli senza combinazioni estreme: utile quando i vertici del cubo sono pericolosi o impossibili.',
            how: 'Non ha punti ai vertici: non usarlo se ti interessa il comportamento agli angoli dello spazio.',
            score: 85
          });
        }
        if (v.k >= 6) {
          recs.push({
            name: 'Prima uno screening, poi la superficie di risposta',
            runs: '16-24 prove di screening, poi 20-30 di ottimizzazione',
            why: 'Con ' + v.k + ' fattori un disegno quadratico richiederebbe troppe prove: ' +
              'riduci prima il numero di fattori attivi.',
            how: 'Definitive Screening Design o frazionario a risoluzione IV, poi CCD sui 2-3 fattori sopravvissuti.',
            score: 100
          });
        }
        if (v.budget < ccdRuns) {
          recs.push({
            name: 'Disegno D-optimal',
            runs: v.budget + ' prove (le tue)',
            why: 'Costruito al computer per stimare il modello richiesto con il numero di prove che hai davvero.',
            how: 'Indica il modello (quadratico) e i vincoli: il software sceglie le combinazioni che massimizzano l’informazione.',
            score: 80
          });
        }
      } else if (v.goal === 'screening') {
        if (v.k >= 6) {
          recs.push({
            name: 'Definitive Screening Design (DSD)',
            runs: (2 * v.k + 1 + 2) + ' prove circa',
            why: 'Tre livelli per fattore: gli effetti principali non sono confusi con le interazioni a due fattori e ' +
              'la curvatura e stimabile. Con pochi fattori attivi si può anche ottimizzare senza altre prove.',
            how: 'Ottimo primo esperimento quando i fattori sono 6-12 e si sospetta non linearità.',
            score: 100
          });
          recs.push({
            name: 'Plackett-Burman',
            runs: (v.k < 12 ? 12 : (v.k < 20 ? 20 : 24)) + ' prove',
            why: 'Massimo numero di fattori con il minimo di prove. Risoluzione III non regolare: gli effetti principali ' +
              'sono parzialmente confusi con tutte le interazioni.',
            how: 'Da usare solo per selezionare: i valori degli effetti non sono affidabili se ci sono interazioni forti.',
            score: 85
          });
        }
        var best = null;
        for (var p = 0; p <= v.k - 2; p++) {
          var runs = Math.pow(2, v.k - p);
          if (runs > v.budget) continue;
          try {
            var g = doe.generatorsFor(v.k, p);
            if (!best || g.resolution > best.res || (g.resolution === best.res && runs > best.runs)) {
              best = { p: p, runs: runs, res: g.resolution, roman: g.roman };
            }
          } catch (e) { /* combinazione non disponibile */ }
        }
        if (best) {
          recs.push({
            name: best.p === 0 ? 'Fattoriale completo 2^' + v.k
              : 'Fattoriale frazionario 2^(' + v.k + '-' + best.p + ') di risoluzione ' + best.roman,
            runs: best.runs + ' prove' + (best.runs <= v.budget - 3 ? ' (+ 3 punti centrali)' : ''),
            why: best.res >= 5
              ? 'Con le prove disponibili puoi permetterti un disegno che separa effetti principali e interazioni a due fattori.'
              : (best.res === 4
                ? 'Risoluzione IV: gli effetti principali restano puliti, le interazioni a due fattori sono confuse a coppie.'
                : 'Risoluzione III: adatto solo alla selezione iniziale dei fattori.'),
            how: 'Aggiungi punti centrali per stimare l’errore puro e verificare la curvatura.',
            score: 95
          });
        }
      } else {
        var full = Math.pow(2, v.k);
        if (full <= v.budget) {
          recs.push({
            name: 'Fattoriale completo 2^' + v.k,
            runs: full + ' prove (+ punti centrali e repliche se il budget lo consente)',
            why: 'Stima tutti gli effetti e tutte le interazioni senza confondimento: e la scelta migliore quando le prove bastano.',
            how: 'Con repliche si ottiene una stima diretta dell’errore; in alternativa si usa il metodo di Lenth.',
            score: 100
          });
        }
        var bestF = null;
        for (var p2 = 1; p2 <= v.k - 2; p2++) {
          var r2 = Math.pow(2, v.k - p2);
          if (r2 > v.budget) continue;
          try {
            var g2 = doe.generatorsFor(v.k, p2);
            if (g2.resolution >= 5 && (!bestF || r2 < bestF.runs)) {
              bestF = { p: p2, runs: r2, roman: g2.roman };
            }
          } catch (e) { /* ignora */ }
        }
        if (bestF) {
          recs.push({
            name: 'Frazionario 2^(' + v.k + '-' + bestF.p + ') risoluzione ' + bestF.roman,
            runs: bestF.runs + ' prove',
            why: 'Meta (o un quarto) delle prove del completo, mantenendo separati effetti principali e interazioni a due fattori.',
            how: 'Le interazioni di ordine alto vengono confuse: ipotesi ragionevole nella maggior parte dei processi.',
            score: 90
          });
        }
      }

      if (v.hardToChange) {
        recs.push({
          name: 'Struttura split-plot',
          runs: 'stesse prove, ordine diverso',
          why: 'Se un fattore e difficile da cambiare, randomizzare completamente e impraticabile o costosissimo. ' +
            'Lo split-plot lo lascia costante entro blocchi di prove.',
          how: 'Attenzione: ci sono <b>due errori</b> diversi. Analizzare uno split-plot come se fosse completamente randomizzato ' +
            'porta a dichiarare significativi fattori che non lo sono.',
          score: 88
        });
      }
      if (v.nuisance && v.goal !== 'compare') {
        recs.push({
          name: 'Blocchi',
          runs: 'nessuna prova aggiuntiva',
          why: 'La fonte di disturbo (giorno, lotto, turno) viene inserita come blocco: la sua variabilità esce dall’errore ' +
            'e gli effetti diventano più facili da rilevare.',
          how: 'Nei fattoriali il blocco si confonde con un’interazione di ordine alto, tipicamente innocua.',
          score: 80
        });
      }
      if (v.destructive) {
        recs.push({
          name: 'Attenzione alle repliche',
          runs: '-',
          why: 'Con prove distruttive non esistono misure ripetute sullo stesso pezzo: la ripetibilità si stima solo con pezzi ' +
            'considerati omogenei (studio MSA annidato).',
          how: 'Pianifica pezzi omogenei per ogni condizione e usa l’analisi annidata.',
          score: 70
        });
      }
      if (v.levels === 'cat' && ['screening', 'effects'].indexOf(v.goal) >= 0) {
        recs.push({
          name: 'Fattoriale generale a livelli misti',
          runs: 'prodotto dei livelli x repliche',
          why: 'Con fattori categorici a più di due livelli il disegno a 2 livelli non basta: serve un fattoriale generale ' +
            'analizzato con ANOVA.',
          how: 'Se le combinazioni sono troppe, valuta un disegno D-optimal o un array di Taguchi.',
          score: 85
        });
      }

      recs.sort(function (a, b) { return b.score - a.score; });

      out.appendChild(ui.panel('Disegni consigliati', {
        sub: v.k + ' fattori, ' + v.budget + ' prove disponibili'
      }, recs.length ? h('div', { class: 'cards' }, recs.map(function (r, i) {
        return h('div', { class: 'card' }, [
          i === 0 ? h('span', { class: 'tag', text: 'consigliato' }) : null,
          h('h4', { text: r.name }),
          h('p', { html: '<b>Prove:</b> ' + r.runs }),
          h('p', { html: r.why }),
          h('p', { class: 'small muted', html: r.how })
        ].filter(Boolean));
      })) : ui.verdict('Nessun disegno standard adatto: valuta un disegno D-optimal costruito sul modello che ti serve.', 'warn')));

      // potenza indicativa
      var sigmaGuess = 1;
      var pw = doe.factorialPower({
        k: v.k, p: 0, replicates: 1, centerPoints: 0, effect: 2, sigma: sigmaGuess,
        alpha: C3.app.state.settings.alpha
      });
      out.appendChild(ui.panel('Quante prove servono davvero', null, [
        ui.verdict('La potenza dipende dal rapporto <b>effetto / deviazione standard</b>. Con ' + Math.pow(2, v.k) +
          ' prove (fattoriale completo, nessuna replica) si rileva con potenza 80% un effetto pari a circa <b>' +
          num.fmt(pw.detectable, 2) + ' volte sigma</b>. Per rilevare effetti più piccoli servono repliche: ' +
          'dimezzare l’effetto rilevabile richiede quattro volte le prove.', 'good'),
        h('button', {
          class: 'sm primary', onclick: function () { C3.app.navigate('potenza'); }
        }, 'Apri il calcolatore di potenza'),
        h('button', {
          class: 'sm', onclick: function () { C3.app.navigate('doe-piano'); }
        }, 'Crea il piano sperimentale')
      ]));
    }
    run();
  }

  /* ===================== TECNICHE ===================== */
  function tecniche(el) {
    var rows = [
      {
        name: 'Fattoriale completo 2^k', fase: 'Caratterizzazione', runs: '2^k',
        pro: 'Stima tutti gli effetti e tutte le interazioni senza confondimento.',
        con: 'Le prove raddoppiano a ogni fattore: oltre 5 fattori diventa costoso.',
        use: 'Fino a 5 fattori quando servono conclusioni solide.'
      },
      {
        name: 'Fattoriale frazionario 2^(k-p)', fase: 'Screening / caratterizzazione', runs: '2^(k-p)',
        pro: 'Molti fattori con poche prove; la risoluzione dice cosa si perde.',
        con: 'Gli effetti sono confusi (alias): serve giudizio tecnico per interpretarli.',
        use: 'Standard per 5-11 fattori. Risoluzione IV o V se possibile.'
      },
      {
        name: 'Plackett-Burman', fase: 'Screening', runs: '12, 20, 24',
        pro: 'Numero di prove non legato a potenze di 2; fino a 23 fattori.',
        con: 'Confondimento complesso e diffuso: non adatto se le interazioni contano.',
        use: 'Prima scrematura su molti fattori.'
      },
      {
        name: 'Definitive Screening Design', fase: 'Screening + curvatura', runs: '~2k+1',
        pro: 'Effetti principali puliti, curvatura stimabile, pochissime prove.',
        con: 'Potenza limitata se i fattori attivi sono molti.',
        use: '6-12 fattori continui con sospetta non linearità.'
      },
      {
        name: 'Central Composite Design', fase: 'Ottimizzazione', runs: '2^k + 2k + centrali',
        pro: 'Modello quadratico completo, si costruisce aggiungendo punti a un fattoriale già fatto.',
        con: 'I punti assiali escono dai livelli originali (a meno di alpha = 1).',
        use: 'Ottimizzazione con 2-5 fattori continui.'
      },
      {
        name: 'Box-Behnken', fase: 'Ottimizzazione', runs: '13-62',
        pro: 'Solo 3 livelli, nessuna combinazione estrema.',
        con: 'Non stima bene il comportamento ai vertici dello spazio.',
        use: 'Quando gli angoli del cubo sono impraticabili o pericolosi.'
      },
      {
        name: 'Array di Taguchi', fase: 'Robustezza', runs: 'L4-L27',
        pro: 'Struttura pronta, gestisce livelli misti, ottima per la robustezza al rumore.',
        con: 'Interazioni confuse; l’analisi S/N nasconde informazioni utili sulla media.',
        use: 'Progettazione robusta con array interno (controllo) ed esterno (rumore).'
      },
      {
        name: 'Quadrato latino / greco-latino', fase: 'Confronto', runs: 'k^2',
        pro: 'Controlla due o tre fonti di disturbo con poche prove.',
        con: 'Assume nessuna interazione fra trattamento e fonti di disturbo.',
        use: 'Confronto di trattamenti con disturbi noti (giorno x macchina).'
      },
      {
        name: 'Blocchi randomizzati (RCBD)', fase: 'Confronto', runs: 'trattamenti x blocchi',
        pro: 'Semplice, aumenta la sensibilità rimuovendo la variabilità del blocco.',
        con: 'Serve che ogni blocco contenga tutti i trattamenti.',
        use: 'Confronto di materiali o metodi su più giorni o lotti.'
      },
      {
        name: 'Blocchi incompleti bilanciati', fase: 'Confronto', runs: 'variabile',
        pro: 'Funziona quando il blocco non può contenere tutti i trattamenti.',
        con: 'Analisi più complessa: le medie semplici sono distorte.',
        use: 'Panel test, forni piccoli, pannelli con posti limitati.'
      },
      {
        name: 'Split-plot', fase: 'Tutte', runs: 'come il corrispondente completo',
        pro: 'Riduce drasticamente i cambi dei fattori difficili da variare.',
        con: 'Due errori diversi: analisi sbagliata se trattato come completamente randomizzato.',
        use: 'Temperatura del forno, velocità della linea, fattori di setup lungo.'
      },
      {
        name: 'Disegni per miscele', fase: 'Formulazione', runs: 'variabile',
        pro: 'Trattano correttamente il vincolo somma = 1.',
        con: 'Modelli e grafici diversi dai fattoriali (Scheffe, ternari).',
        use: 'Ricette, leghe, vernici, alimenti, cemento.'
      },
      {
        name: 'D-optimal', fase: 'Tutte', runs: 'a scelta',
        pro: 'Si adatta a vincoli, prove imposte, modelli particolari e fattori categorici.',
        con: 'Non ha struttura elegante: le proprietà vanno verificate numericamente.',
        use: 'Spazio sperimentale irregolare o budget rigido.'
      },
      {
        name: 'EVOP (evolutionary operation)', fase: 'Miglioramento continuo', runs: 'in produzione',
        pro: 'Piccole variazioni dei parametri durante la produzione normale, senza fermare la linea.',
        con: 'Lento: servono molti cicli per accumulare significativita.',
        use: 'Ottimizzazione continua di processi già stabili e ad alto volume.'
      }
    ];
    el.appendChild(ui.panel('Tabella riassuntiva delle tecniche sperimentali', null,
      ui.table([
        { key: 'name', label: 'Tecnica' },
        { key: 'fase', label: 'Fase' },
        { key: 'runs', label: 'Prove' },
        { key: 'pro', label: 'Punti di forza' },
        { key: 'con', label: 'Limiti' },
        { key: 'use', label: 'Quando usarla' }
      ], rows)));

    el.appendChild(ui.panel('Catalogo dei frazionari disponibili nel software', {
      sub: 'risoluzione e generatori calcolati, non copiati da tabelle'
    }, [
      ui.table([
        { key: 'fraction', label: 'Disegno' },
        { key: 'runs', label: 'Prove', digits: 0 },
        {
          key: 'roman', label: 'Risoluzione', html: true,
          format: function (v, r) {
            var cls = r.resolution >= 5 ? 'good' : (r.resolution === 4 ? 'warn' : 'bad');
            return '<span class="badge ' + cls + '">' + v + '</span>';
          }
        },
        { key: function (r) { return r.generators.join(', '); }, label: 'Generatori' }
      ], doe.catalogFractional(11)),
      h('button', { class: 'sm primary', onclick: function () { C3.app.navigate('doe-piano'); } }, 'Crea un piano')
    ]));
  }

  /* ===================== CONCETTI ===================== */
  function concetti(el) {
    var items = [
      {
        name: 'Randomizzazione',
        text: 'Eseguire le prove in ordine casuale distribuisce l’effetto di fattori non controllati (deriva termica, ' +
          'usura, apprendimento dell’operatore) su tutte le condizioni invece di concentrarlo su una. ' +
          'È l’unica difesa contro le cause sconosciute e rende validi i test statistici.'
      },
      {
        name: 'Replicazione (non ripetizione)',
        text: 'Replicare significa rifare la prova completa, setup compreso. Ripetere significa misurare più volte lo stesso pezzo. ' +
          'Solo la replicazione stima l’errore sperimentale vero; usare ripetizioni come repliche fa sembrare il processo ' +
          'molto più preciso di quanto sia e porta a dichiarare significativi effetti inesistenti.'
      },
      {
        name: 'Blocchi',
        text: 'Un blocco e una fonte di variabilità nota ma non interessante (giorno, lotto, macchina). ' +
          'Metterla nel modello la toglie dall’errore e rende più facile vedere gli effetti dei fattori. ' +
          'Principio: blocca ciò che puoi controllare ma non ti interessa, randomizza il resto.'
      },
      {
        name: 'Confondimento e alias',
        text: 'Nei disegni frazionari alcuni effetti sono stimati dalla stessa combinazione di dati: si dice che sono confusi (alias). ' +
          'La relazione definente elenca tutte le coppie confuse. Non è un difetto, e il prezzo pagato per usare meno prove: ' +
          'va scelto consapevolmente.'
      },
      {
        name: 'Risoluzione',
        text: 'III: effetti principali confusi con interazioni a 2 fattori. IV: effetti principali puliti, interazioni a 2 confuse fra loro. ' +
          'V: effetti principali e interazioni a 2 tutti stimabili separatamente. ' +
          'Regola: risoluzione III per screening, IV per lavorare, V per concludere.'
      },
      {
        name: 'Punti centrali',
        text: 'Prove alla media di tutti i fattori. Servono a tre cose: stimare l’errore puro senza replicare tutto il disegno, ' +
          'verificare la curvatura (se la media dei punti centrali si stacca da quella dei punti fattoriali il modello lineare non basta), ' +
          'e controllare la stabilità del processo durante l’esperimento.'
      },
      {
        name: 'Effetto e coefficiente',
        text: 'In unità codificate (-1, +1) l’effetto e la differenza fra la media al livello alto e quella al livello basso. ' +
          'Il coefficiente del modello vale esattamente la meta dell’effetto. Nei confronti fra software questa è la prima ' +
          'fonte di apparenti discordanze.'
      },
      {
        name: 'Metodo di Lenth',
        text: 'Quando il disegno non è replicato non esiste una stima dell’errore. Il metodo di Lenth la ricava dagli effetti stessi, ' +
          'assumendo che la maggior parte sia trascurabile: la mediana degli effetti piccoli diventa la misura del rumore (PSE). ' +
          'Da qui il margine di errore ME e quello simultaneo SME.'
      },
      {
        name: 'Gerarchia del modello',
        text: 'Se un’interazione A*B e nel modello, devono restarci anche A e B, anche se non significativi. ' +
          'Un modello non gerarchico dipende dalla scala e dalla codifica scelte e produce previsioni incoerenti.'
      },
      {
        name: 'Unità codificate',
        text: 'Codificare i fattori (-1, +1) rende i coefficienti confrontabili fra loro e riduce la collinearita fra termini ' +
          'lineari e quadratici. Le conclusioni si traducono poi in unità reali per l’operatore.'
      },
      {
        name: 'Lack-of-fit',
        text: 'Confronta la variabilità non spiegata dal modello con l’errore puro stimato dalle repliche. ' +
          'Se è significativo, il modello ha la forma sbagliata (manca curvatura o un’interazione), non è un problema di rumore.'
      },
      {
        name: 'Prova di conferma',
        text: 'Un esperimento non finisce con il modello: finisce con prove alle condizioni scelte. ' +
          'Se il risultato cade nell’intervallo di predizione il modello è utilizzabile; altrimenti qualcosa e cambiato ' +
          'o il modello e sovradattato.'
      }
    ];
    el.appendChild(ui.panel('Concetti che decidono la riuscita di un esperimento', null,
      h('div', { class: 'cards' }, items.map(function (i) {
        return h('div', { class: 'card' }, [h('h4', { text: i.name }), h('p', { text: i.text })]);
      }))));

    el.appendChild(ui.panel('I sette passi della pianificazione', { sub: 'da seguire prima di toccare la macchina' },
      h('div', { class: 'steps' }, [
        ['Riconoscere e formulare il problema', 'Che decisione prenderemo con i risultati? Se non è chiara, l’esperimento non serve.'],
        ['Scegliere la risposta', 'Misurabile, continua se possibile, legata al problema del cliente. Verifica prima il sistema di misura (Gage R&R): se il 30% della variabilità e dello strumento, l’esperimento misura il rumore.'],
        ['Scegliere fattori, livelli e campo', 'Livelli abbastanza distanti da produrre un effetto visibile, ma dentro il campo praticabile. Livelli troppo vicini sono la causa più comune di esperimenti senza risultati.'],
        ['Scegliere il disegno', 'In base a obiettivo, numero di fattori e budget. Considera repliche, punti centrali, blocchi e randomizzazione.'],
        ['Eseguire l’esperimento', 'Rispettare l’ordine casuale, registrare le condizioni reali e ogni anomalia. Le note di campo salvano l’analisi.'],
        ['Analizzare i dati', 'Effetti, modello, diagnostica dei residui. La statistica supporta il giudizio tecnico, non lo sostituisce.'],
        ['Concludere e verificare', 'Raccomandazioni operative, prove di conferma, aggiornamento degli standard e del piano di controllo.']
      ].map(function (s) {
        return h('div', { class: 'step' }, [h('h4', { text: s[0] }), h('p', { text: s[1] })]);
      }))));
  }

  /* ===================== ANALISI ===================== */
  function analisi(el) {
    el.appendChild(ui.panel('Procedura di analisi di un fattoriale', null,
      h('div', { class: 'steps' }, [
        ['Guarda i dati grezzi', 'Grafico della risposta nell’ordine di esecuzione: deriva, salti, valori impossibili. Un errore di trascrizione trovato qui evita conclusioni sbagliate.'],
        ['Stima gli effetti', 'Pareto degli effetti standardizzati è normal plot: gli effetti attivi si staccano dalla retta dei punti inattivi.'],
        ['Costruisci il modello', 'Tieni i termini significativi rispettando la gerarchia. Con disegni non replicati usa il metodo di Lenth.'],
        ['Verifica i residui', 'Normal plot, residui vs adattati, residui nell’ordine di raccolta, residui vs ogni fattore. Cerca struttura, imbuti e valori influenti.'],
        ['Verifica curvatura e lack-of-fit', 'Punti centrali e repliche dicono se la forma del modello è adeguata.'],
        ['Interpreta', 'Effetti principali solo se non ci sono interazioni forti; altrimenti leggi i grafici di interazione e i cube plot.'],
        ['Ottimizza', 'Se serve, passa alla superficie di risposta e alla desiderabilità per più risposte.'],
        ['Conferma', 'Prove alle condizioni scelte e confronto con l’intervallo di predizione.']
      ].map(function (s) {
        return h('div', { class: 'step' }, [h('h4', { text: s[0] }), h('p', { text: s[1] })]);
      }))));

    el.appendChild(ui.panel('Come leggere i grafici', null,
      ui.table([
        { key: 'g', label: 'Grafico' },
        { key: 'read', label: 'Cosa mostra' },
        { key: 'alert', label: 'Segnale di allarme' }
      ], [
        { g: 'Pareto degli effetti', read: 'Effetti ordinati per grandezza con la soglia di significativita.', alert: 'Nessun effetto oltre la soglia: livelli troppo vicini o rumore troppo alto.' },
        { g: 'Normal plot degli effetti', read: 'Gli effetti inattivi stanno su una retta; gli attivi se ne allontanano.', alert: 'Tutti i punti allineati: nessun fattore attivo.' },
        { g: 'Effetti principali', read: 'Media della risposta per livello di ciascun fattore.', alert: 'Linee piatte: il fattore non conta nel campo esplorato.' },
        { g: 'Interazione', read: 'Medie per combinazione: linee parallele = nessuna interazione.', alert: 'Linee incrociate: il livello migliore di un fattore cambia con l’altro.' },
        { g: 'Cube plot', read: 'Medie ai vertici dello spazio a tre fattori.', alert: 'Vertici con poche osservazioni: attenzione a conclusioni su celle vuote.' },
        { g: 'Contour / superficie', read: 'Mappa della risposta prevista nello spazio dei fattori.', alert: 'Ottimo sul bordo: la regione esplorata non contiene l’ottimo.' },
        { g: 'Residui vs adattati', read: 'Varianza costante e assenza di struttura.', alert: 'Forma a imbuto: serve una trasformazione (spesso logaritmica).' },
        { g: 'Residui nell’ordine', read: 'Indipendenza delle prove.', alert: 'Andamento crescente o ciclico: deriva o mancata randomizzazione.' }
      ])));

    el.appendChild(ui.panel('Trasformazioni della risposta', null,
      h('div', { class: 'doc' }, [
        h('p', { html: 'Quando la dispersione cresce con la media, la trasformazione stabilizza la varianza e spesso semplifica il modello:' }),
        h('table', { class: 'data' }, [
          h('thead', null, h('tr', null, [h('th', null, 'Situazione'), h('th', null, 'Trasformazione'), h('th', null, 'lambda Box-Cox')])),
          h('tbody', null, [
            ['Deviazione standard proporzionale alla media', 'logaritmo', '0'],
            ['Varianza proporzionale alla media (conteggi)', 'radice quadrata', '0,5'],
            ['Dati di proporzione (0-1)', 'arcoseno della radice', '-'],
            ['Deviazione standard proporzionale al quadrato della media', 'inverso', '-1'],
            ['Nessuna relazione evidente', 'nessuna', '1']
          ].map(function (r) {
            return h('tr', null, r.map(function (c) { return h('td', null, c); }));
          }))
        ]),
        h('p', { class: 'small muted', html: 'Il software calcola il lambda ottimale di Box-Cox nella vista Descrittive e nelle trasformazioni della vista Dati.' })
      ])));
  }

  /* ===================== ERRORI ===================== */
  function errori(el) {
    el.appendChild(ui.panel('Errori che rovinano un esperimento', null,
      h('div', { class: 'cards' }, [
        ['Cambiare un fattore alla volta (OFAT)', 'Richiede più prove, non trova le interazioni e da un ottimo falso. È il motivo principale per cui esiste il DoE.'],
        ['Livelli troppo vicini', 'Se la differenza fra i livelli e dello stesso ordine del rumore, nessun effetto risultera significativo. Meglio livelli audaci ma tecnicamente sicuri.'],
        ['Non randomizzare', 'Eseguire le prove in ordine comodo confonde gli effetti con le derive temporali (temperatura ambiente, usura, apprendimento).'],
        ['Confondere ripetizioni e repliche', 'Misurare tre volte lo stesso pezzo non stima l’errore sperimentale: i p-value diventano ottimisticamente piccoli.'],
        ['Ignorare il sistema di misura', 'Se il Gage R&R supera il 30% la variabilità misurata e per lo più dello strumento: prima si sistema la misura.'],
        ['Analizzare uno split-plot come randomizzato', 'I fattori difficili da variare risultano significativi molto più spesso di quanto dovrebbero.'],
        ['Eliminare i valori scomodi', 'Un valore anomalo va indagato, non cancellato: spesso indica una condizione reale del processo.'],
        ['Fermarsi al primo esperimento', 'Lo screening serve a decidere il passo successivo, non a concludere.'],
        ['Estrapolare fuori dalla regione', 'Il modello vale solo dentro il campo sperimentato: fuori e solo aritmetica.'],
        ['Saltare la prova di conferma', 'Senza conferma non si sa se il modello descrive il processo o solo i dati raccolti.'],
        ['Non tenere il diario delle prove', 'Le anomalie annotate spiegano i residui strani; senza note restano misteri.'],
        ['Confondere significativo con importante', 'Con molte repliche anche effetti minuscoli diventano significativi: guarda sempre la grandezza pratica.']
      ].map(function (e) {
        return h('div', { class: 'card' }, [h('h4', { text: e[0] }), h('p', { text: e[1] })]);
      }))));

    el.appendChild(ui.panel('Lista di controllo prima di avviare le prove', null,
      h('div', { class: 'doc' }, h('ul', null, [
        'La risposta e misurabile e il sistema di misura e stato validato?',
        'I fattori sono controllabili e i livelli tecnicamente sicuri?',
        'Il numero di prove e sostenibile (materiale, tempo macchina, personale)?',
        'L’ordine di esecuzione e randomizzato e scritto?',
        'Sono previsti punti centrali e repliche?',
        'Le condizioni di rumore sono state annotate (turno, lotto, ambiente)?',
        'Chi esegue le prove sa esattamente cosa fare e cosa registrare?',
        'E previsto un criterio di arresto se qualcosa va storto?',
        'Le prove di conferma sono già pianificate?'
      ].map(function (x) { return h('li', { text: x }); })))));
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
