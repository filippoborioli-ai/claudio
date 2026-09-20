# CLAUDIO — guida al repository

Software di analisi dati (statistica, SPC, capacità, MSA, DoE, Lean Six Sigma) che gira interamente nel browser. Nessuna dipendenza a runtime, nessun build step: `index.html` carica i file `src/**` con normali tag `<script>`, in ordine di dipendenza.

## Comandi

```bash
node --test test/core.test.js test/ui.test.js   # 43 test: motore statistico + interfaccia in jsdom
python -m http.server 8765                      # server locale (oppure avvia.cmd)
node tools/visual-qa.mjs                        # controllo in Chromium reale (richiede playwright)
node tools/visual-qa.mjs --shots                # come sopra, salvando le schermate
node --check src/core/doe.js                    # controllo sintattico rapido
```

`tools/visual-qa.mjs` apre tutte le viste in un browser vero e segnala errori di console, SVG
degeneri e straripamenti di layout: è il controllo che ha trovato i problemi che jsdom non vede
(path SVG vuoti, colonne grid senza `min-width: 0`).

`jsdom` è l'unica dipendenza di sviluppo (serve solo ai test dell'interfaccia; se manca, quei test si saltano da soli).

## Architettura

```
src/core/     motore statistico — funziona sia in browser sia in Node (require)
src/viz/      chart.js (motore SVG) + plots.js (grafici di alto livello)
src/data/     dataset.js (modello tabellare + formule), io.js (CSV/XLSX/JSON), samples.js
src/ui/       components.js (widget), app.js (guscio), views/*.js (una vista per file)
```

Ordine di caricamento in `index.html`: core → viz → data → ui → views → `C3.app.boot()`.
**Aggiungendo un file nuovo va aggiunto anche il tag `<script>` in `index.html`** (i test dell'interfaccia leggono proprio quei tag, quindi un file dimenticato si nota subito).

### Convenzione dei moduli core

Ogni file di `src/core/` usa lo stesso involucro: funziona come `module.exports` in Node e come `C3.<nome>` nel browser.

```js
;(function (root, name, deps, factory) {
  var res = deps.map(function (d) {
    return (typeof module === 'object' && module.exports && typeof require === 'function')
      ? require('./' + d + '.js') : root.C3[d];
  });
  var api = factory.apply(null, res);
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.C3 = root.C3 || {})[name] = api;
})(globalThis, 'nomeModulo', ['numeric', 'dist'], function (num, dist) { ... });
```

`src/viz/`, `src/data/` e `src/ui/` sono solo browser e usano `C3.*` direttamente.

### Grafica

`C3.chart.render(target, spec)` disegna SVG da una specifica dichiarativa (scale, assi, marche, annotazioni, legenda, tooltip, export PNG/SVG). `C3.plots.*` costruisce le specifiche per i casi concreti (istogramma, boxplot, carta di controllo, contour, superficie, Pareto degli effetti, ecc.).

Palette in `chart.js` (`PALETTE.light` / `PALETTE.dark`): validata per daltonismo e contrasto. **Non inventare colori nuovi**: usare `seriesColor(i)`, `seqColor(t)`, `divColor(t)` e i colori di stato (`pal().status.critical` per i punti fuori controllo). Mai due assi y.

### Viste

Ogni vista si registra da sé:

```js
C3.app.registerView({
  id: 'mia-vista', label: 'Titolo', icon: '◆', group: 'Analisi',
  desc: 'Una riga che compare sotto il titolo.',
  render: function (el) { /* costruisce il DOM dentro el */ }
});
```

Schema ricorrente: `split` con pannello opzioni a sinistra (`ui.form`) e risultati a destra, ricalcolati a ogni `onChange`. Componenti in `ui`: `panel, form, table, kv, verdict, tabs, modal, collapsible, chartBox, anovaTable, coefTable, pValue, exportBar`.

## Scelte da non rompere

- **Effetti DoE = 2 × coefficiente** in unità codificate (convenzione Montgomery).
- **d2 calcolata per quadratura**, c4 in forma esatta, d3 da tabella ASTM: i test confrontano con i valori pubblicati.
- **Generatori frazionari**: tabella in `FRACTION_GENERATORS` accettata solo se raggiunge la risoluzione ottima nota (`KNOWN_RESOLUTION`); altrimenti parte la ricerca a minima aberrazione (lenta: usare solo come fallback).
- **Metodo di Lenth** quando non ci sono gradi di libertà per l'errore; `analyzeFactorial` riduce da sola l'ordine se i termini superano le prove.
- **Percentili**: interpolazione (n+1)p come nei software di qualità; `median` usa il tipo 7.
- **Formule delle colonne**: `evalFormula` compila con `new Function` ma **rifiuta ogni identificatore non in allowlist** — non allentare questo controllo.
- Le stringhe dell'interfaccia sono in italiano **con accenti** (i file sono UTF-8) e usano
  l'apostrofo tipografico `’` nelle elisioni: quello ASCII chiuderebbe le stringhe JS.
- **Gli identificatori restano ASCII**: id delle viste (`id: 'capacita'`), id dei dataset di
  esempio e chiavi di navigazione finiscono nell'URL e nei test.

## Trappole incontrate

- `Array.prototype.values` esiste: `g.values || g` prende l'iteratore invece dell'array. Usare `Array.isArray`.
- `qrSolve` deve reggere p > n (disegni saturi): il ciclo di Householder si ferma a `min(n, p)`.
- In jsdom mancano `matchMedia`, `getContext`, `URL.createObjectURL`: il test li fornisce.
- `node --test test/` non risolve la cartella su Windows: passare i file espliciti.
- Una sostituzione automatica degli accenti va fatta solo sulle stringhe visibili: id di vista e
  di dataset accentati rompono navigazione e test (già successo una volta).
- `analyzeRSM` codifica sui punti fattoriali, non su min/max: altrimenti nei CCD i coefficienti
  non coincidono con quelli del piano.

## Test

`test/core.test.js` verifica il motore contro tabelle e valori di riferimento.
`test/ui.test.js` carica `index.html` in jsdom, avvia l'app, visita tutte le viste, prova tutti i dataset di esempio e **cicla ogni opzione di ogni menu** cercando eccezioni e `console.error`. È il test che ha trovato la maggior parte dei bug reali: mantenerlo aggiornato quando si aggiunge una vista.
