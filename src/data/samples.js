/* CLAUDIO v3 - data/samples.js
 * Dataset di esempio generati in modo deterministico (seme fisso):
 * servono per provare ogni analisi senza dover caricare file.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3 = root.C3 || {};
  var num = C3.numeric;

  function ds(name, cols, meta) {
    var d = C3.data.fromColumns(cols, name);
    d.meta = meta || {};
    return d;
  }

  var SAMPLES = [
    {
      id: 'riempimento',
      name: 'Riempimento bottiglie (SPC + capacità)',
      desc: '125 misure di volume in sottogruppi da 5, specifica 500 +/- 6 ml. Adatto a Xbar-R, capacità, test di normalità.',
      build: function () {
        var r = num.rng(101);
        var vol = [], sub = [], turno = [], ora = [];
        for (var i = 0; i < 125; i++) {
          var g = Math.floor(i / 5) + 1;
          var drift = i > 95 ? 1.4 : 0;
          vol.push(num.round(500.2 + drift + r.normal(0, 1.35), 3));
          sub.push(g);
          turno.push(g <= 13 ? 'Turno 1' : 'Turno 2');
          ora.push(6 + Math.floor(i / 8));
        }
        return ds('Riempimento bottiglie', {
          Sottogruppo: sub, Volume: vol, Turno: turno, Ora: ora
        }, { lsl: 494, usl: 506, target: 500, subgroupSize: 5, responses: ['Volume'] });
      }
    },
    {
      id: 'saldature',
      name: 'Resistenza saldature (I-MR)',
      desc: '60 misure individuali con uno scostamento a meta serie. Adatto a carta I-MR, EWMA, CUSUM, trend.',
      build: function () {
        var r = num.rng(202);
        var x = [], lotto = [], data = [];
        for (var i = 0; i < 60; i++) {
          var shift = i >= 38 ? 2.6 : 0;
          x.push(num.round(45 + shift + r.normal(0, 1.1), 3));
          lotto.push('L' + (Math.floor(i / 10) + 1));
          data.push('2026-0' + (1 + Math.floor(i / 20)) + '-' + String((i % 20) + 1).padStart(2, '0'));
        }
        return ds('Resistenza saldature', { Data: data, Lotto: lotto, Resistenza: x },
          { lsl: 40, target: 45, subgroupSize: 1 });
      }
    },
    {
      id: 'difetti',
      name: 'Difettosi per lotto (carta p)',
      desc: '30 lotti con numerosità variabile e conteggio di pezzi difettosi. Adatto a carta p, capacità binomiale, Pareto.',
      build: function () {
        var r = num.rng(303);
        var n = [], d = [], lotto = [], linea = [];
        for (var i = 0; i < 30; i++) {
          var size = r.int(180, 320);
          var p = i >= 22 ? 0.075 : 0.038;
          var def = 0;
          for (var k = 0; k < size; k++) if (r.uniform() < p) def++;
          n.push(size); d.push(def);
          lotto.push('Lotto ' + (i + 1));
          linea.push(i % 2 === 0 ? 'Linea A' : 'Linea B');
        }
        return ds('Difettosi per lotto', { Lotto: lotto, Linea: linea, Ispezionati: n, Difettosi: d });
      }
    },
    {
      id: 'gagerr',
      name: 'Gage R&R (10 pezzi x 3 operatori x 3 prove)',
      desc: 'Studio incrociato del sistema di misura con tolleranza 0,8 mm. Adatto a Gage R&R ANOVA e Xbar-R.',
      build: function () {
        var r = num.rng(404);
        var partEff = {}, opEff = { Anna: 0.012, Bruno: -0.008, Carla: 0.002 };
        for (var p = 1; p <= 10; p++) partEff['P' + String(p).padStart(2, '0')] = r.normal(0, 0.085);
        var pezzo = [], operatore = [], prova = [], misura = [];
        Object.keys(partEff).forEach(function (pk) {
          Object.keys(opEff).forEach(function (ok) {
            for (var t = 1; t <= 3; t++) {
              pezzo.push(pk); operatore.push(ok); prova.push(t);
              misura.push(num.round(10 + partEff[pk] + opEff[ok] + r.normal(0, 0.028), 4));
            }
          });
        });
        return ds('Gage R&R', { Pezzo: pezzo, Operatore: operatore, Prova: prova, Misura: misura },
          { tolerance: 0.8 });
      }
    },
    {
      id: 'doe23',
      name: 'DoE fattoriale 2^3 (velocità di attacco)',
      desc: 'Disegno 2^3 con 2 repliche: distanza elettrodi, flusso gas, potenza. Esempio classico di analisi fattoriale.',
      build: function () {
        var r = num.rng(505);
        var A = [], B = [], C = [], y = [], ordine = [];
        var k = 0;
        for (var rep = 1; rep <= 2; rep++) {
          for (var i = 0; i < 8; i++) {
            var a = (i & 1) ? 1 : -1, b = (i & 2) ? 1 : -1, c = (i & 4) ? 1 : -1;
            A.push(a === 1 ? 1.2 : 0.8);
            B.push(b === 1 ? 200 : 125);
            C.push(c === 1 ? 325 : 275);
            y.push(num.round(550 + 50 * a * -1 + 15 * b + 153 * c - 76 * a * c + r.normal(0, 18), 1));
            ordine.push(++k);
          }
        }
        return ds('DoE 2^3 attacco', {
          Ordine: ordine, Distanza: A, Flusso: B, Potenza: C, Velocità: y
        }, { factors: ['Distanza', 'Flusso', 'Potenza'], response: 'Velocità' });
      }
    },
    {
      id: 'doeccd',
      name: 'DoE superficie di risposta (CCD 2 fattori)',
      desc: 'Central composite design su tempo e temperatura con resa e purezza: ottimizzazione multi-risposta.',
      build: function () {
        var r = num.rng(606);
        var design = C3.doe.ccd({
          factors: [{ name: 'Tempo', low: 80, high: 90 }, { name: 'Temperatura', low: 170, high: 180 }],
          alphaType: 'rotatable', randomize: false, centerCube: 5, centerAxial: 0
        });
        var tempo = [], temperatura = [], resa = [], purezza = [], tipo = [];
        design.table.forEach(function (row) {
          var x1 = row.Tempo, x2 = row.Temperatura;
          tempo.push(row['Tempo (reale)']);
          temperatura.push(row['Temperatura (reale)']);
          tipo.push(row.PtType === 0 ? 'centro' : (row.PtType === -1 ? 'assiale' : 'fattoriale'));
          resa.push(num.round(79.9 + 0.995 * x1 + 0.515 * x2 - 1.376 * x1 * x1 - 1.001 * x2 * x2 + 0.25 * x1 * x2 + r.normal(0, 0.3), 2));
          purezza.push(num.round(70 + 0.3 * x1 - 1.1 * x2 - 0.4 * x1 * x1 + r.normal(0, 0.25), 2));
        });
        return ds('CCD resa e purezza', {
          Tempo: tempo, Temperatura: temperatura, Tipo: tipo, Resa: resa, Purezza: purezza
        }, { factors: ['Tempo', 'Temperatura'], response: 'Resa' });
      }
    },
    {
      id: 'regressione',
      name: 'Regressione multipla (resa di processo)',
      desc: '60 osservazioni con temperatura, pressione, catalizzatore e tempo: regressione multipla e diagnostica.',
      build: function () {
        var r = num.rng(707);
        var T = [], P = [], K = [], t = [], y = [], fornitore = [];
        for (var i = 0; i < 60; i++) {
          var temp = num.round(r.uniform(150, 210), 1);
          var pres = num.round(r.uniform(1.5, 4.5), 2);
          var cat = num.round(r.uniform(0.5, 2.5), 2);
          var tt = num.round(r.uniform(20, 60), 0);
          T.push(temp); P.push(pres); K.push(cat); t.push(tt);
          fornitore.push(['Alfa', 'Beta', 'Gamma'][i % 3]);
          y.push(num.round(12 + 0.28 * temp + 3.1 * pres + 5.4 * cat - 0.06 * tt +
            (i % 3 === 0 ? 1.8 : 0) + r.normal(0, 2.2), 2));
        }
        return ds('Resa di processo', {
          Temperatura: T, Pressione: P, Catalizzatore: K, Tempo: t, Fornitore: fornitore, Resa: y
        });
      }
    },
    {
      id: 'anova',
      name: 'ANOVA a una via (resistenza per materiale)',
      desc: '4 materiali x 10 provini: ANOVA, confronti multipli, test di uguaglianza delle varianze.',
      build: function () {
        var r = num.rng(808);
        var mat = [], res = [], macchina = [];
        var means = { 'Acciaio': 72, 'Alluminio': 65, 'Composito': 78, 'Titanio': 74 };
        Object.keys(means).forEach(function (m) {
          for (var i = 0; i < 10; i++) {
            mat.push(m);
            res.push(num.round(means[m] + r.normal(0, 3.4), 2));
            macchina.push('M' + (1 + (i % 2)));
          }
        });
        return ds('Resistenza materiali', { Materiale: mat, Macchina: macchina, Resistenza: res });
      }
    },
    {
      id: 'serie',
      name: 'Serie storica (domanda mensile)',
      desc: '48 mesi con trend e stagionalita: analisi di trend, decomposizione, Holt-Winters.',
      build: function () {
        var r = num.rng(909);
        var mese = [], anno = [], dom = [];
        var nomiMesi = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
        for (var i = 0; i < 48; i++) {
          var m = i % 12;
          var stag = [0.9, 0.85, 1.0, 1.05, 1.1, 1.15, 0.7, 0.5, 1.2, 1.25, 1.15, 1.05][m];
          mese.push(nomiMesi[m]);
          anno.push(2022 + Math.floor(i / 12));
          dom.push(num.round((1000 + 12 * i) * stag + r.normal(0, 45), 0));
        }
        return ds('Domanda mensile', { Anno: anno, Mese: mese, Domanda: dom }, { period: 12 });
      }
    },
    {
      id: 'pareto',
      name: 'Difetti per categoria (Pareto e FMEA)',
      desc: 'Registro di 400 difetti con categoria, linea e costo: Pareto, tabelle di contingenza, COPQ.',
      build: function () {
        var r = num.rng(111);
        var cats = [
          { name: 'Graffi superficiali', w: 34, cost: 12 },
          { name: 'Dimensione fuori tolleranza', w: 22, cost: 48 },
          { name: 'Bave', w: 15, cost: 8 },
          { name: 'Porosita', w: 11, cost: 65 },
          { name: 'Colore non conforme', w: 8, cost: 22 },
          { name: 'Montaggio errato', w: 5, cost: 90 },
          { name: 'Etichetta mancante', w: 3, cost: 4 },
          { name: 'Altro', w: 2, cost: 30 }
        ];
        var total = cats.reduce(function (a, c) { return a + c.w; }, 0);
        var categoria = [], linea = [], costo = [], turno = [];
        for (var i = 0; i < 400; i++) {
          var t = r.uniform() * total, acc = 0, pick = cats[0];
          for (var k = 0; k < cats.length; k++) {
            acc += cats[k].w;
            if (t <= acc) { pick = cats[k]; break; }
          }
          categoria.push(pick.name);
          linea.push('Linea ' + r.pick(['A', 'B', 'C']));
          turno.push('Turno ' + r.int(1, 3));
          costo.push(num.round(pick.cost * r.uniform(0.7, 1.4), 2));
        }
        return ds('Registro difetti', { Categoria: categoria, Linea: linea, Turno: turno, Costo: costo });
      }
    },
    {
      id: 'miscela',
      name: 'Miscela a 3 componenti',
      desc: 'Simplex centroid con punti assiali: modello di Scheffe e diagramma ternario.',
      build: function () {
        var r = num.rng(121);
        var design = C3.designs.simplexLattice({
          components: [{ name: 'Polimero' }, { name: 'Plastificante' }, { name: 'Carica' }],
          degree: 3, axial: true, randomize: false, replicates: 2
        });
        var A = [], B = [], C = [], y = [];
        design.proportions.forEach(function (p) {
          A.push(num.round(p[0], 4)); B.push(num.round(p[1], 4)); C.push(num.round(p[2], 4));
          y.push(num.round(11 * p[0] + 7 * p[1] + 4 * p[2] + 18 * p[0] * p[1] + 6 * p[0] * p[2] - 3 * p[1] * p[2] + r.normal(0, 0.25), 3));
        });
        return ds('Miscela polimerica', { Polimero: A, Plastificante: B, Carica: C, Elasticita: y },
          { components: ['Polimero', 'Plastificante', 'Carica'], response: 'Elasticita' });
      }
    },
    {
      id: 'attributi',
      name: 'Concordanza per attributi',
      desc: '3 valutatori, 20 pezzi, 2 prove, con standard di riferimento: kappa di Cohen e Fleiss.',
      build: function () {
        var r = num.rng(131);
        var valutatore = [], pezzo = [], prova = [], giudizio = [], standard = [];
        var truth = {};
        for (var p = 1; p <= 20; p++) truth['P' + String(p).padStart(2, '0')] = r.uniform() < 0.4 ? 'Scarto' : 'Buono';
        ['Anna', 'Bruno', 'Carla'].forEach(function (a, ai) {
          var err = [0.03, 0.10, 0.06][ai];
          Object.keys(truth).forEach(function (pk) {
            for (var t = 1; t <= 2; t++) {
              valutatore.push(a); pezzo.push(pk); prova.push(t);
              var g = truth[pk];
              if (r.uniform() < err) g = g === 'Buono' ? 'Scarto' : 'Buono';
              giudizio.push(g);
              standard.push(truth[pk]);
            }
          });
        });
        return ds('Concordanza attributi', {
          Valutatore: valutatore, Pezzo: pezzo, Prova: prova, Giudizio: giudizio, Standard: standard
        });
      }
    },
    {
      id: 'multivar',
      name: 'Multivariata (profili di processo)',
      desc: '90 lotti con 6 variabili correlate e una classe di esito: PCA, cluster, T2 di Hotelling.',
      build: function () {
        var r = num.rng(141);
        var cols = { Temperatura: [], Pressione: [], Umidità: [], Viscosità: [], pH: [], Densità: [], Esito: [] };
        for (var i = 0; i < 90; i++) {
          var f1 = r.normal(0, 1), f2 = r.normal(0, 1);
          var bad = i > 80;
          cols.Temperatura.push(num.round(180 + 6 * f1 + r.normal(0, 1.4) + (bad ? 9 : 0), 2));
          cols.Pressione.push(num.round(3 + 0.5 * f1 + r.normal(0, 0.12), 3));
          cols.Umidità.push(num.round(45 + 5 * f2 + r.normal(0, 1.1), 2));
          cols.Viscosità.push(num.round(120 - 8 * f2 + r.normal(0, 2.2) + (bad ? -12 : 0), 2));
          cols.pH.push(num.round(7 + 0.2 * f1 - 0.1 * f2 + r.normal(0, 0.05), 3));
          cols.Densità.push(num.round(1.02 + 0.01 * f1 + r.normal(0, 0.004), 4));
          cols.Esito.push(bad ? 'Non conforme' : (r.uniform() < 0.12 ? 'Non conforme' : 'Conforme'));
        }
        return ds('Profili di processo', cols);
      }
    },
    {
      id: 'affidabilita',
      name: 'Tempi a rottura (Weibull)',
      desc: '80 tempi a guasto da distribuzione di Weibull: identificazione distribuzione è capacità non normale.',
      build: function () {
        var r = num.rng(151);
        var t = [], fornitore = [];
        for (var i = 0; i < 80; i++) {
          var f = i % 2 === 0 ? 'Alfa' : 'Beta';
          var shape = f === 'Alfa' ? 2.2 : 1.6;
          var scale = f === 'Alfa' ? 1400 : 1150;
          t.push(num.round(C3.dist.weibull.rand(r, shape, scale), 1));
          fornitore.push(f);
        }
        return ds('Tempi a rottura', { Fornitore: fornitore, Ore: t }, { lsl: 500 });
      }
    },
    {
      id: 'screening',
      name: 'Screening 7 fattori (frazionario 2^(7-4))',
      desc: 'Disegno di risoluzione III per selezionare i fattori importanti prima di ottimizzare.',
      build: function () {
        var r = num.rng(161);
        var design = C3.doe.factorialDesign({
          factors: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(function (n) {
            return { name: 'Fattore ' + n, low: -1, high: 1 };
          }), fraction: 4, randomize: false, centerPoints: 0
        });
        var cols = {};
        design.factors.forEach(function (f) { cols[f.name] = []; });
        cols.Risposta = [];
        design.table.forEach(function (row) {
          design.factors.forEach(function (f) { cols[f.name].push(row[f.name]); });
          cols.Risposta.push(num.round(
            60 + 8 * row['Fattore A'] - 5 * row['Fattore C'] + 3.5 * row['Fattore E'] + r.normal(0, 1.1), 2));
        });
        return ds('Screening 7 fattori', cols, {
          factors: design.factors.map(function (f) { return f.name; }), response: 'Risposta'
        });
      }
    }
  ];

  function list() {
    return SAMPLES.map(function (s) { return { id: s.id, name: s.name, desc: s.desc }; });
  }

  function load(id) {
    var s = SAMPLES.filter(function (x) { return x.id === id; })[0];
    if (!s) return null;
    return s.build();
  }

  C3.samples = { list: list, load: load, all: SAMPLES };
})(typeof globalThis !== 'undefined' ? globalThis : this);
