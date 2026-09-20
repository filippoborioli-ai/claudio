/* CLAUDIO v3 - core/sixsigma.js
 * Strumenti Six Sigma e Lean:
 *  - conversioni rendimento / DPMO / livello sigma / DPU / RTY
 *  - Pareto, FMEA (RPN e Action Priority AIAG-VDA), COPQ
 *  - calcolatori Lean: takt time, OEE, Little, kanban, EPEI, SMED, PCE,
 *    bilanciamento linea, scorta di sicurezza, punto di riordino
 *  - checklist DMAIC e definizioni operative (contenuti usati dalle pagine guida)
 */
;(function (root, name, deps, factory) {
  var res = deps.map(function (d) {
    return (typeof module === 'object' && module.exports && typeof require === 'function')
      ? require('./' + d + '.js') : root.C3[d];
  });
  var api = factory.apply(null, res);
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.C3 = root.C3 || {})[name] = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, 'sixsigma',
['numeric', 'dist', 'stats'], function (num, dist, st) {
  'use strict';

  /* ============ conversioni di qualità ============ */
  /** Livello sigma da DPMO (con shift standard 1,5). */
  function sigmaFromDpmo(dpmo, shift) {
    var p = num.clamp(dpmo / 1e6, 1e-12, 1 - 1e-12);
    return dist.qnorm(1 - p) + (shift == null ? 1.5 : shift);
  }
  function dpmoFromSigma(sigma, shift) {
    return (1 - dist.normal.cdf(sigma - (shift == null ? 1.5 : shift))) * 1e6;
  }
  /** Da difetti/unità a rendimento (Poisson). */
  function yieldFromDpu(dpu) { return Math.exp(-dpu); }
  function dpuFromYield(y) { return -Math.log(num.clamp(y, 1e-12, 1)); }

  /**
   * Rendimento a catena.
   * steps: [{name, units, defects}] oppure [{name, yield}]
   */
  function rolledThroughput(steps) {
    var rty = 1, rows = [];
    steps.forEach(function (s) {
      var y;
      if (s.yield != null) y = Number(s.yield);
      else if (s.units && s.defectiveUnits != null) y = 1 - s.defectiveUnits / s.units;
      else if (s.units && s.defects != null) y = Math.exp(-s.defects / s.units);
      else y = 1;
      rty *= y;
      rows.push({ name: s.name, yield: y, cumulative: rty, dpu: -Math.log(Math.max(1e-12, y)) });
    });
    var n = steps.length;
    return {
      rows: rows, rty: rty, ftyAverage: n ? Math.pow(rty, 1 / n) : null,
      normalizedYield: n ? Math.pow(rty, 1 / n) : null,
      totalDpu: -Math.log(Math.max(1e-12, rty)),
      sigmaLevel: sigmaFromDpmo((1 - rty) * 1e6),
      hiddenFactory: 1 - rty
    };
  }

  /** DPMO da difetti, unità, opportunita per unità. */
  function dpmo(defects, units, opportunities) {
    var d = defects / (units * opportunities);
    return {
      dpo: d, dpmo: d * 1e6, dpu: defects / units,
      yield: 100 * (1 - d), sigmaLevel: sigmaFromDpmo(d * 1e6)
    };
  }

  /** Tabella di conversione di riferimento. */
  function conversionTable() {
    var out = [];
    [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6].forEach(function (s) {
      out.push({
        sigma: s, dpmoShifted: dpmoFromSigma(s, 1.5),
        yieldShifted: 100 - dpmoFromSigma(s, 1.5) / 1e4,
        dpmoCentered: dpmoFromSigma(s, 0),
        cpk: s / 3
      });
    });
    return out;
  }

  /* ============ Pareto ============ */
  /**
   * Analisi di Pareto.
   * items: [{label, value}] oppure colonna categorica (conteggi automatici)
   */
  function pareto(items, opts) {
    opts = opts || {};
    var rows = items.slice().filter(function (r) { return isFinite(Number(r.value)) && Number(r.value) > 0; })
      .map(function (r) { return { label: String(r.label), value: Number(r.value) }; });
    rows.sort(function (a, b) { return b.value - a.value; });
    var total = rows.reduce(function (a, r) { return a + r.value; }, 0);
    // raggruppa la coda in "Altro"
    var cut = opts.maxCategories || 12;
    if (rows.length > cut) {
      var head = rows.slice(0, cut - 1);
      var tail = rows.slice(cut - 1);
      head.push({ label: 'Altro (' + tail.length + ' voci)', value: tail.reduce(function (a, r) { return a + r.value; }, 0) });
      rows = head;
    }
    var cum = 0;
    rows.forEach(function (r) {
      r.pct = 100 * r.value / total;
      cum += r.pct;
      r.cumPct = cum;
    });
    var vital = rows.filter(function (r, i) {
      return i === 0 || rows[i - 1].cumPct < 80;
    });
    return {
      rows: rows, total: total,
      vitalFew: vital.map(function (r) { return r.label; }),
      nVital: vital.length,
      pctFromVital: vital.reduce(function (a, r) { return a + r.pct; }, 0),
      note: 'Le prime ' + vital.length + ' categorie spiegano ' +
        num.round(vital.reduce(function (a, r) { return a + r.pct; }, 0), 1) + '% del totale.'
    };
  }

  /** Conta le occorrenze di una colonna e costruisce il Pareto. */
  function paretoFromColumn(col, weights, opts) {
    var mapObj = {};
    for (var i = 0; i < col.length; i++) {
      var k = col[i] == null || col[i] === '' ? '(vuoto)' : String(col[i]);
      var w = weights ? Number(weights[i]) : 1;
      if (!isFinite(w)) continue;
      mapObj[k] = (mapObj[k] || 0) + w;
    }
    return pareto(Object.keys(mapObj).map(function (k) { return { label: k, value: mapObj[k] }; }), opts);
  }

  /* ============ FMEA ============ */
  /**
   * Calcola RPN e criticità per le righe FMEA.
   * rows: [{ item, failureMode, effect, severity, cause, occurrence, control, detection }]
   */
  function fmea(rows) {
    var out = rows.map(function (r, i) {
      var S = Number(r.severity) || 0, O = Number(r.occurrence) || 0, D = Number(r.detection) || 0;
      var rpn = S * O * D;
      return Object.assign({}, r, {
        index: i + 1, severity: S, occurrence: O, detection: D,
        rpn: rpn, criticality: S * O,
        ap: actionPriority(S, O, D),
        risk: rpn >= 200 || S >= 9 ? 'alto' : (rpn >= 80 ? 'medio' : 'basso')
      });
    });
    out.sort(function (a, b) { return b.rpn - a.rpn; });
    var tot = out.reduce(function (a, r) { return a + r.rpn; }, 0);
    var cum = 0;
    out.forEach(function (r) { cum += 100 * r.rpn / tot; r.cumPct = cum; });
    return {
      rows: out, totalRpn: tot,
      highRisk: out.filter(function (r) { return r.risk === 'alto'; }).length,
      pareto: pareto(out.map(function (r) {
        return { label: (r.failureMode || r.item || ('riga ' + r.index)), value: r.rpn };
      }))
    };
  }

  /** Action Priority secondo la logica AIAG-VDA (alta/media/bassa). */
  function actionPriority(S, O, D) {
    if (S >= 9) {
      if (O >= 4 || (O >= 2 && D >= 5)) return 'A (alta)';
      if (O >= 2 || D >= 5) return 'M (media)';
      return 'L (bassa)';
    }
    if (S >= 7) {
      if (O >= 6 || (O >= 4 && D >= 5)) return 'A (alta)';
      if (O >= 2 || D >= 6) return 'M (media)';
      return 'L (bassa)';
    }
    if (S >= 4) {
      if (O >= 8 && D >= 6) return 'A (alta)';
      if (O >= 5 || D >= 7) return 'M (media)';
      return 'L (bassa)';
    }
    if (O >= 9 && D >= 8) return 'M (media)';
    return 'L (bassa)';
  }

  /** Costo della scarsa qualità. */
  function copq(spec) {
    var internal = (spec.scrap || 0) + (spec.rework || 0) + (spec.downtime || 0) + (spec.reinspection || 0);
    var external = (spec.warranty || 0) + (spec.returns || 0) + (spec.complaints || 0) + (spec.penalties || 0);
    var appraisal = (spec.inspection || 0) + (spec.testing || 0) + (spec.audits || 0);
    var prevention = (spec.training || 0) + (spec.planning || 0) + (spec.maintenance || 0);
    var total = internal + external + appraisal + prevention;
    return {
      internalFailure: internal, externalFailure: external,
      appraisal: appraisal, prevention: prevention, total: total,
      failureShare: total ? 100 * (internal + external) / total : 0,
      pctOfSales: spec.sales ? 100 * total / spec.sales : null,
      rows: [
        { category: 'Costi di prevenzione', value: prevention },
        { category: 'Costi di valutazione', value: appraisal },
        { category: 'Difetti interni', value: internal },
        { category: 'Difetti esterni', value: external }
      ],
      note: 'Regola empirica: spostare spesa da difetti (interni+esterni) verso prevenzione riduce il costo totale. ' +
        'In aziende non mature il COPQ vale 15-25% del fatturato.'
    };
  }

  /* ============ calcolatori Lean ============ */
  /** Takt time e fabbisogno di risorse. */
  function taktTime(spec) {
    var availableTime = spec.shiftMinutes * (spec.shifts || 1) -
      (spec.breaksMinutes || 0) * (spec.shifts || 1);
    var takt = availableTime / spec.demand;
    var n = spec.cycleTime ? Math.ceil(spec.cycleTime / takt) : null;
    return {
      availableTimeMin: availableTime, demand: spec.demand,
      taktMinutes: takt, taktSeconds: takt * 60,
      cycleTime: spec.cycleTime,
      requiredStations: n,
      utilization: spec.cycleTime && n ? 100 * spec.cycleTime / (n * takt) : null,
      verdict: spec.cycleTime == null ? null : (spec.cycleTime > takt
        ? 'Il tempo ciclo supera il takt: la linea non soddisfa la domanda, serve ridurre il ciclo o aggiungere capacità.'
        : 'Tempo ciclo entro il takt: capacità adeguata alla domanda.')
    };
  }

  /** OEE con le tre componenti e le perdite. */
  function oee(spec) {
    var planned = spec.plannedTime;
    var runTime = planned - (spec.downtime || 0);
    var availability = runTime / planned;
    var theoreticalOutput = spec.idealCycleTime ? runTime / spec.idealCycleTime : null;
    var performance = theoreticalOutput ? spec.totalCount / theoreticalOutput : (spec.performance || null);
    var quality = spec.totalCount ? (spec.totalCount - (spec.rejects || 0)) / spec.totalCount : null;
    var value = availability * (performance || 0) * (quality || 0);
    return {
      availability: availability, performance: performance, quality: quality,
      oee: value, teep: spec.calendarTime ? value * planned / spec.calendarTime : null,
      runTime: runTime, goodCount: spec.totalCount - (spec.rejects || 0),
      losses: {
        availabilityLossMin: spec.downtime || 0,
        performanceLossMin: theoreticalOutput ? (theoreticalOutput - spec.totalCount) * spec.idealCycleTime : null,
        qualityLossMin: spec.idealCycleTime ? (spec.rejects || 0) * spec.idealCycleTime : null
      },
      benchmark: value >= 0.85 ? 'livello world class (>= 85%)' :
        (value >= 0.6 ? 'tipico di molte aziende (60-85%): margini di miglioramento' :
          'basso (< 60%): perdite importanti da attaccare'),
      classification: [
        { loss: 'Guasti e fermate', component: 'Disponibilità' },
        { loss: 'Setup e cambi', component: 'Disponibilità' },
        { loss: 'Micro-fermate', component: 'Prestazione' },
        { loss: 'Velocità ridotta', component: 'Prestazione' },
        { loss: 'Scarti di avvio', component: 'Qualità' },
        { loss: 'Difetti in produzione', component: 'Qualità' }
      ]
    };
  }

  /** Legge di Little e WIP. */
  function little(spec) {
    // WIP = throughput * lead time
    var out = {};
    if (spec.wip == null) out.wip = spec.throughput * spec.leadTime;
    else if (spec.leadTime == null) out.leadTime = spec.wip / spec.throughput;
    else out.throughput = spec.wip / spec.leadTime;
    out.given = spec;
    out.note = 'WIP = Throughput x Lead time. Ridurre il WIP a throughput costante riduce proporzionalmente il lead time.';
    return out;
  }

  /** Dimensionamento kanban. */
  function kanban(spec) {
    var demand = spec.demandPerPeriod;
    var lead = spec.replenishmentLead;
    var container = spec.containerSize || 1;
    var safety = spec.safetyFactor == null ? 0.2 : spec.safetyFactor;
    var cards = (demand * lead * (1 + safety)) / container;
    return {
      cards: Math.ceil(cards), cardsExact: cards,
      containerSize: container, wipCap: Math.ceil(cards) * container,
      coverageTime: Math.ceil(cards) * container / demand,
      note: 'N = (domanda x lead time di ripristino x (1 + fattore di sicurezza)) / capacità contenitore.'
    };
  }

  /** EPEI (every part every interval) per mix produttivo. */
  function epei(spec) {
    // spec.products: [{name, demand, cycleTime, changeoverTime}]
    var totalRun = 0, totalChange = 0;
    spec.products.forEach(function (p) {
      totalRun += p.demand * p.cycleTime;
      totalChange += p.changeoverTime || 0;
    });
    var available = spec.availableTime;
    var freeTime = available - totalRun;
    var cyclesPerPeriod = totalChange > 0 ? freeTime / totalChange : null;
    return {
      totalRunTime: totalRun, totalChangeover: totalChange,
      availableTime: available, freeTimeForChangeovers: freeTime,
      cyclesPerPeriod: cyclesPerPeriod,
      epei: cyclesPerPeriod && cyclesPerPeriod > 0 ? 1 / cyclesPerPeriod : null,
      feasible: freeTime > 0,
      note: 'EPEI = intervallo in cui ogni codice viene prodotto almeno una volta. Ridurre i tempi di setup (SMED) abbassa EPEI e quindi le scorte.'
    };
  }

  /** Analisi SMED: classifica le attività e stima il guadagno. */
  function smed(activities) {
    var internal = 0, external = 0, converted = 0, reduced = 0;
    activities.forEach(function (a) {
      var t = Number(a.minutes) || 0;
      if (a.type === 'esterna') external += t;
      else internal += t;
      if (a.canConvert) converted += t;
      if (a.reducibleTo != null) reduced += t - Number(a.reducibleTo);
    });
    var current = internal;
    var target = internal - converted - reduced;
    return {
      internalMinutes: internal, externalMinutes: external,
      convertibleMinutes: converted, reducibleMinutes: reduced,
      currentChangeover: current, targetChangeover: Math.max(0, target),
      improvementPct: current ? 100 * (current - Math.max(0, target)) / current : 0,
      steps: [
        '1. Separare attività interne (a macchina ferma) da esterne (a macchina in moto).',
        '2. Convertire attività interne in esterne: preparazione utensili, preriscaldo, pre-montaggio.',
        '3. Snellire le attività interne rimaste: attacchi rapidi, riferimenti, eliminare regolazioni.',
        '4. Standardizzare e addestrare; misurare il tempo di cambio come KPI.'
      ]
    };
  }

  /** Value stream: lead time, PCE, tempo a valore. */
  function valueStream(steps) {
    var va = 0, nva = 0, wait = 0;
    var rows = steps.map(function (s) {
      var p = Number(s.processTime) || 0;
      var w = Number(s.waitTime) || 0;
      if (s.valueAdded === false) nva += p; else va += p;
      wait += w;
      return Object.assign({}, s, { processTime: p, waitTime: w });
    });
    var leadTime = va + nva + wait;
    return {
      rows: rows, valueAddedTime: va, nonValueAddedTime: nva, waitTime: wait,
      leadTime: leadTime,
      pce: leadTime ? 100 * va / leadTime : 0,
      note: 'PCE = tempo a valore / lead time. Sotto il 5% in molti processi transazionali; obiettivo lean > 25%.',
      bottleneck: rows.reduce(function (best, r) {
        return (!best || r.processTime > best.processTime) ? r : best;
      }, null)
    };
  }

  /** Bilanciamento linea (yamazumi). */
  function lineBalance(tasks, takt) {
    var total = tasks.reduce(function (a, t) { return a + Number(t.time || 0); }, 0);
    var theoretical = Math.ceil(total / takt);
    // assegnazione greedy rispettando l’ordine
    var stations = [], cur = { tasks: [], time: 0, index: 1 };
    tasks.forEach(function (t) {
      var tt = Number(t.time) || 0;
      if (cur.time + tt > takt && cur.tasks.length) {
        stations.push(cur);
        cur = { tasks: [], time: 0, index: stations.length + 1 };
      }
      cur.tasks.push(t); cur.time += tt;
    });
    if (cur.tasks.length) stations.push(cur);
    var maxT = Math.max.apply(null, stations.map(function (s) { return s.time; }));
    return {
      stations: stations, totalWork: total, takt: takt,
      theoreticalStations: theoretical, actualStations: stations.length,
      efficiency: 100 * total / (stations.length * takt),
      balanceDelay: 100 * (stations.length * takt - total) / (stations.length * takt),
      smoothnessIndex: Math.sqrt(stations.reduce(function (a, s) {
        return a + Math.pow(maxT - s.time, 2);
      }, 0)),
      bottleneckStation: stations.reduce(function (b, s) { return (!b || s.time > b.time) ? s : b; }, null)
    };
  }

  /** Scorta di sicurezza e punto di riordino. */
  function safetyStock(spec) {
    var z = dist.qnorm(spec.serviceLevel == null ? 0.95 : spec.serviceLevel);
    var sdDemand = spec.sdDemand || 0;
    var lead = spec.leadTime;
    var sdLead = spec.sdLeadTime || 0;
    var avgDemand = spec.avgDemand;
    var ss = z * Math.sqrt(lead * sdDemand * sdDemand + avgDemand * avgDemand * sdLead * sdLead);
    return {
      z: z, safetyStock: ss,
      reorderPoint: avgDemand * lead + ss,
      cycleStock: spec.orderQty ? spec.orderQty / 2 : null,
      eoq: spec.orderCost && spec.holdingCost
        ? Math.sqrt(2 * avgDemand * spec.periodsPerYear * spec.orderCost / spec.holdingCost) : null,
      note: 'SS = z * radice(LT * sd_domanda^2 + domanda^2 * sd_LT^2). Copre variabilità di domanda e di lead time.'
    };
  }

  /** Cinque perché: struttura guidata. */
  function fiveWhys(problem, whys) {
    return {
      problem: problem,
      chain: whys.map(function (w, i) { return { level: i + 1, why: w }; }),
      rootCause: whys[whys.length - 1],
      note: 'Verificare la catena a rovescio con "quindi": se la logica non regge, la causa radice non è quella.'
    };
  }

  /* ============ contenuti di riferimento ============ */
  var DMAIC = [
    {
      phase: 'Define', goal: 'Definire il problema, il perimetro e il valore per il cliente.',
      tools: ['Project charter', 'Voice of Customer / CTQ', 'SIPOC', 'Albero dei CTQ', 'Business case e COPQ', 'Stakeholder map'],
      deliverables: ['Problema misurabile', 'Obiettivo quantificato', 'Perimetro', 'Team e sponsor', 'Baseline economica'],
      gate: 'Il problema e espresso in numeri e il beneficio e stimato?'
    },
    {
      phase: 'Measure', goal: 'Misurare lo stato attuale con dati affidabili.',
      tools: ['Piano di raccolta dati', 'Definizioni operative', 'MSA / Gage R&R', 'Carte di controllo di base', 'Capacità di processo', 'Pareto', 'Value stream map'],
      deliverables: ['Sistema di misura validato', 'Baseline di capacità (Cp, Cpk, sigma)', 'Mappa del processo', 'Y e X candidate'],
      gate: 'Il sistema di misura è adeguato (%R&R < 30%) e la baseline è stabile?'
    },
    {
      phase: 'Analyze', goal: 'Identificare e verificare le cause radice.',
      tools: ['Ishikawa e 5 perché', 'Grafici multi-vari', 'Test di ipotesi', 'ANOVA', 'Regressione', 'FMEA di processo', 'Analisi dei tempi/flusso'],
      deliverables: ['Elenco delle X critiche verificate statisticamente', 'Modello Y = f(X)'],
      gate: 'Ogni causa radice e supportata da dati, non da opinioni?'
    },
    {
      phase: 'Improve', goal: 'Progettare, testare e implementare la soluzione.',
      tools: ['DoE (screening, fattoriale, RSM)', 'Ottimizzazione con desiderabilità', 'Prove pilota', 'Poka-yoke', 'SMED', 'Kanban / flusso', 'Analisi costi-benefici'],
      deliverables: ['Impostazioni ottimali dei parametri', 'Conferma sperimentale', 'Piano di implementazione'],
      gate: 'Il miglioramento e confermato su prove indipendenti (test di conferma)?'
    },
    {
      phase: 'Control', goal: 'Rendere stabile il guadagno.',
      tools: ['Piano di controllo', 'Carte di controllo', 'Capacità finale', 'Standard work', 'Formazione', 'Audit e 5S', 'Cruscotto KPI'],
      deliverables: ['Control plan', 'Documentazione aggiornata', 'Trasferimento al process owner', 'Beneficio validato dal controlling'],
      gate: 'Il processo e in controllo statistico e il beneficio e tracciato nel tempo?'
    }
  ];

  var LEAN_WASTES = [
    { code: 'D', name: 'Difetti', desc: 'Scarti, rilavorazioni, ispezioni aggiuntive, resi.', signals: ['scarti > target', 'rilavoro non tracciato', 'ispezione 100%'], counter: ['poka-yoke', 'SPC', 'standard work', 'MSA'] },
    { code: 'O', name: 'Sovrapproduzione', desc: 'Produrre più o prima del necessario: la peggiore perché genera le altre.', signals: ['magazzino di semilavorati', 'lotti grandi', 'push planning'], counter: ['pull/kanban', 'livellamento', 'riduzione lotto (SMED)'] },
    { code: 'W', name: 'Attese', desc: 'Persone o materiali in coda, macchine ferme.', signals: ['WIP tra fasi', 'attese approvazioni', 'setup lunghi'], counter: ['bilanciamento', 'flusso continuo', 'manutenzione autonoma'] },
    { code: 'N', name: 'Talento non utilizzato', desc: 'Competenze e idee degli operatori non impiegate.', signals: ['nessun suggerimento', 'decisioni solo top-down'], counter: ['kaizen', 'team problem solving', 'formazione'] },
    { code: 'T', name: 'Trasporti', desc: 'Movimentazione di materiali senza aggiunta di valore.', signals: ['percorsi lunghi', 'doppie movimentazioni'], counter: ['layout a celle', 'point of use', 'milk run'] },
    { code: 'I', name: 'Scorte', desc: 'Materie prime, WIP e finiti in eccesso.', signals: ['copertura elevata', 'obsolescenza'], counter: ['kanban', 'supermarket', 'riduzione lead time'] },
    { code: 'M', name: 'Movimenti', desc: 'Movimenti inutili delle persone.', signals: ['ricerca attrezzi', 'piegamenti ripetuti'], counter: ['5S', 'ergonomia', 'shadow board'] },
    { code: 'E', name: 'Processi eccessivi', desc: 'Lavorazioni o controlli oltre le richieste del cliente.', signals: ['tolleranze più strette del necessario', 'report non letti'], counter: ['analisi valore', 'CTQ chiari', 'semplificazione'] }
  ];

  return {
    sigmaFromDpmo: sigmaFromDpmo, dpmoFromSigma: dpmoFromSigma,
    yieldFromDpu: yieldFromDpu, dpuFromYield: dpuFromYield,
    rolledThroughput: rolledThroughput, dpmo: dpmo, conversionTable: conversionTable,
    pareto: pareto, paretoFromColumn: paretoFromColumn,
    fmea: fmea, actionPriority: actionPriority, copq: copq,
    taktTime: taktTime, oee: oee, little: little, kanban: kanban, epei: epei,
    smed: smed, valueStream: valueStream, lineBalance: lineBalance,
    safetyStock: safetyStock, fiveWhys: fiveWhys,
    DMAIC: DMAIC, LEAN_WASTES: LEAN_WASTES
  };
});
