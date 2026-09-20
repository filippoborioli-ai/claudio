/* Test dell interfaccia: carica index.html in un DOM simulato, avvia
 * l applicazione e visita tutte le viste verificando che nessuna sollevi errori.
 * Richiede jsdom (dipendenza di sviluppo): node --test test/
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

let JSDOM;
try {
  JSDOM = require('jsdom').JSDOM;
} catch (e) {
  JSDOM = null;
}

const root = path.join(__dirname, '..');

function buildDom() {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
    runScripts: 'outside-only'
  });
  const win = dom.window;
  // API mancanti in jsdom usate dal software
  win.matchMedia = win.matchMedia || function () {
    return { matches: false, addEventListener: function () {}, removeEventListener: function () {} };
  };
  win.requestAnimationFrame = win.requestAnimationFrame || function (cb) { return setTimeout(cb, 0); };
  win.HTMLCanvasElement.prototype.getContext = function () {
    return {
      fillRect() {}, drawImage() {}, fillText() {}, beginPath() {}, stroke() {},
      canvas: { toDataURL: () => 'data:image/png;base64,' }
    };
  };
  win.URL.createObjectURL = win.URL.createObjectURL || (() => 'blob:mock');
  win.URL.revokeObjectURL = win.URL.revokeObjectURL || (() => {});
  const errors = [];
  win.addEventListener('error', (e) => errors.push(String(e.message)));
  const origError = win.console.error;
  win.console.error = function () {
    errors.push(Array.from(arguments).map(String).join(' '));
    if (process.env.UI_DEBUG) origError.apply(win.console, arguments);
  };

  // estrae l ordine dei file dal tag script di index.html
  const scripts = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map(m => m[1]);
  for (const src of scripts) {
    const code = fs.readFileSync(path.join(root, src), 'utf8');
    try {
      win.eval(code);
    } catch (e) {
      throw new Error('Errore caricando ' + src + ': ' + e.message);
    }
  }
  return { win, errors, dom };
}

test('l applicazione si avvia e tutte le viste si disegnano', { skip: !JSDOM ? 'jsdom non installato' : false }, () => {
  const { win, errors } = buildDom();
  const C3 = win.C3;
  assert.ok(C3, 'namespace C3 assente');
  assert.ok(C3.app, 'modulo app assente');
  assert.ok(C3.chart && C3.plots, 'moduli grafici assenti');

  C3.app.boot();
  assert.ok(C3.app.state.datasets.length > 0, 'nessun dataset iniziale');

  const views = [];
  // recupera gli id registrati leggendo la barra di navigazione
  const navItems = win.document.querySelectorAll('.nav-item');
  assert.ok(navItems.length >= 12, 'viste registrate: ' + navItems.length);

  const ids = ['dati', 'esplora', 'cruscotto', 'descrittive', 'test', 'anova', 'potenza',
    'regressione', 'multivariata', 'serie', 'spc', 'capacita', 'sixpack', 'msa',
    'doe-piano', 'doe-catalogo', 'doe-analisi', 'lean', 'doe-guida', 'sixsigma', 'guida'];

  const failures = [];
  for (const id of ids) {
    errors.length = 0;
    try {
      C3.app.navigate(id);
      const main = win.document.querySelector('main');
      const text = main ? main.textContent : '';
      if (text.length < 40) failures.push(id + ': contenuto quasi vuoto');
      if (/Errore nella vista|non eseguibile|non costruibile|non generabile/.test(text)) {
        failures.push(id + ': messaggio di errore nella vista -> ' +
          text.replace(/\s+/g, ' ').slice(0, 220));
      }
      if (errors.length) failures.push(id + ': console.error -> ' + errors.slice(0, 2).join(' | '));
    } catch (e) {
      failures.push(id + ': eccezione -> ' + e.message);
    }
  }
  assert.deepStrictEqual(failures, [], 'viste con problemi:\n' + failures.join('\n'));
});

test('i dataset di esempio funzionano con le viste principali', { skip: !JSDOM ? 'jsdom non installato' : false }, () => {
  const { win, errors } = buildDom();
  const C3 = win.C3;
  C3.app.boot();
  const combos = [
    ['gagerr', 'msa'],
    ['doe23', 'doe-analisi'],
    ['doeccd', 'doe-analisi'],
    ['difetti', 'spc'],
    ['anova', 'anova'],
    ['regressione', 'regressione'],
    ['serie', 'serie'],
    ['multivar', 'multivariata'],
    ['pareto', 'esplora'],
    ['affidabilita', 'capacita'],
    ['miscela', 'doe-analisi'],
    ['attributi', 'msa'],
    ['screening', 'doe-analisi'],
    ['riempimento', 'sixpack']
  ];
  const failures = [];
  for (const [sample, view] of combos) {
    errors.length = 0;
    try {
      const ds = C3.samples.load(sample);
      C3.app.addDataset(ds);
      C3.app.navigate(view);
      const text = win.document.querySelector('main').textContent;
      if (/Errore nella vista/.test(text)) {
        failures.push(sample + '/' + view + ': ' + text.replace(/\s+/g, ' ').slice(0, 200));
      }
      if (errors.length) failures.push(sample + '/' + view + ': console.error -> ' + errors[0]);
    } catch (e) {
      failures.push(sample + '/' + view + ': eccezione -> ' + e.message);
    }
  }
  assert.deepStrictEqual(failures, [], 'combinazioni con problemi:\n' + failures.join('\n'));
});

test('ogni opzione di ogni vista produce un risultato senza errori', { skip: !JSDOM ? 'jsdom non installato' : false }, () => {
  const { win, errors } = buildDom();
  const C3 = win.C3;
  C3.app.boot();
  // carica dataset adatti a tutte le viste
  ['gagerr', 'doeccd', 'difetti', 'anova', 'regressione', 'serie', 'multivar',
    'pareto', 'affidabilita', 'miscela', 'attributi'].forEach(function (s) {
    C3.app.addDataset(C3.samples.load(s), false);
  });

  const failures = [];
  const plan = [
    { view: 'spc', dataset: 'Riempimento bottiglie' },
    { view: 'test', dataset: 'Resistenza materiali' },
    { view: 'anova', dataset: 'Resistenza materiali' },
    { view: 'capacita', dataset: 'Riempimento bottiglie' },
    { view: 'msa', dataset: 'Gage R&R' },
    { view: 'doe-piano', dataset: null },
    { view: 'doe-analisi', dataset: 'CCD resa e purezza' },
    { view: 'regressione', dataset: 'Resa di processo' },
    { view: 'multivariata', dataset: 'Profili di processo' },
    { view: 'serie', dataset: 'Domanda mensile' },
    { view: 'potenza', dataset: null },
    { view: 'esplora', dataset: 'Registro difetti' }
  ];

  for (const step of plan) {
    if (step.dataset) {
      const idx = C3.app.state.datasets.findIndex(d => d.name === step.dataset);
      if (idx >= 0) C3.app.state.active = idx;
    }
    C3.app.navigate(step.view);
    const panel = win.document.querySelector('.options-panel');
    if (!panel) { failures.push(step.view + ': pannello opzioni assente'); continue; }

    // cicla ogni valore di ogni menu a tendina della prima colonna
    const selects = Array.from(panel.querySelectorAll('select:not([multiple])'));
    for (const sel of selects) {
      const opts = Array.from(sel.options).map(o => o.value);
      for (const val of opts.slice(0, 16)) {
        errors.length = 0;
        sel.value = val;
        const ev = new win.Event('change', { bubbles: true });
        try {
          sel.dispatchEvent(ev);
        } catch (e) {
          failures.push(step.view + ' select=' + val + ': eccezione -> ' + e.message);
          continue;
        }
        const text = win.document.querySelector('main').textContent;
        if (/Errore nella vista/.test(text)) {
          failures.push(step.view + ' opzione "' + val + '": ' + text.replace(/\s+/g, ' ').slice(0, 180));
        }
        if (errors.length) {
          failures.push(step.view + ' opzione "' + val + '": console.error -> ' + errors[0].slice(0, 180));
        }
      }
    }

    // clicca ogni "chip" (selettore di modalita)
    const chips = Array.from(win.document.querySelectorAll('.options-panel .chip'));
    for (const chip of chips) {
      errors.length = 0;
      try {
        chip.dispatchEvent(new win.Event('click', { bubbles: true }));
      } catch (e) {
        failures.push(step.view + ' chip "' + chip.textContent + '": eccezione -> ' + e.message);
        continue;
      }
      const text = win.document.querySelector('main').textContent;
      if (/Errore nella vista/.test(text)) {
        failures.push(step.view + ' modalita "' + chip.textContent + '": ' + text.replace(/\s+/g, ' ').slice(0, 180));
      }
      if (errors.length) {
        failures.push(step.view + ' modalita "' + chip.textContent + '": console.error -> ' + errors[0].slice(0, 180));
      }
    }
  }
  assert.deepStrictEqual(failures.slice(0, 15), [], 'opzioni con problemi:\n' + failures.slice(0, 15).join('\n'));
});

test('import/export: CSV e Excel fanno andata e ritorno', { skip: !JSDOM ? 'jsdom non installato' : false }, async () => {
  const { win } = buildDom();
  const C3 = win.C3;
  const ds = C3.samples.load('doe23');

  // CSV
  const csv = C3.io.toCSV(ds, { delimiter: ';' });
  const back = C3.io.datasetFromText(csv, { name: 'roundtrip' });
  assert.strictEqual(back.nrows, ds.nrows, 'righe CSV');
  assert.deepStrictEqual(back.names, ds.names, 'colonne CSV');
  const a = ds.numeric('Velocità'), b = back.numeric('Velocità');
  for (let i = 0; i < a.length; i++) {
    assert.ok(Math.abs(a[i] - b[i]) < 1e-9, 'valore CSV riga ' + i);
  }

  // testo incollato da Excel (tabulazioni)
  const pasted = 'A\tB\n1\t2,5\n3\t4,5';
  const dsp = C3.io.datasetFromClipboard(pasted);
  assert.strictEqual(dsp.nrows, 2);
  assert.strictEqual(dsp.numeric('B')[0], 2.5, 'virgola decimale interpretata');

  // Excel .xlsx: scrive e rilegge (lo zip generato usa il metodo "store", niente compressione)
  const blob = C3.io.toXlsx([ds]);
  const buf = await blob.arrayBuffer();
  const sheets = await C3.io.readXlsx(buf);
  assert.strictEqual(sheets.length, 1, 'un foglio');
  const matrix = sheets[0].matrix;
  assert.strictEqual(matrix.length, ds.nrows + 1, 'righe xlsx (intestazione inclusa)');
  assert.deepStrictEqual(matrix[0].map(String), ds.names, 'intestazioni xlsx');
  const dsx = C3.data.fromMatrix(matrix, true, 'xlsx');
  assert.ok(Math.abs(dsx.numeric('Velocità')[0] - a[0]) < 1e-9, 'valore xlsx');
});

test('salvataggio e ripristino del progetto', { skip: !JSDOM ? 'jsdom non installato' : false }, () => {
  const { win } = buildDom();
  const C3 = win.C3;
  C3.app.boot();
  const ds = C3.app.ds();
  ds.addFormulaColumn('doppio', ds.numericColumns()[0] + ' * 2');
  const json = C3.io.projectToJSON(C3.app.state);
  const proj = C3.io.projectFromJSON(json);
  assert.strictEqual(proj.datasets.length, C3.app.state.datasets.length);
  const col = proj.datasets[0].column('doppio');
  assert.ok(col, 'colonna calcolata conservata');
  assert.strictEqual(col.formula, ds.column('doppio').formula, 'formula conservata');
});
