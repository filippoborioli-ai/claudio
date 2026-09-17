# CLAUDIO

Software di analisi dati per l'ingegneria di processo: statistica, controllo statistico di processo, capacità, analisi del sistema di misura, progettazione degli esperimenti e metodologie Lean Six Sigma, con una parte di grafici interattivi e cruscotti.

Funziona **interamente nel browser**: nessuna installazione, nessun server, nessun dato inviato in rete.

---

## Avvio

**Locale (consigliato):** doppio clic su `avvia.cmd` — apre il software nel browser predefinito con un piccolo server locale (serve Python o Node, praticamente sempre presenti).

**Online:** la stessa cartella pubblicata su GitHub Pages funziona da URL.

**Manuale:**

```bash
python -m http.server 8080      # oppure: npx serve .
# poi apri http://localhost:8080
```

> Aprire `index.html` con doppio clic funziona su alcuni browser ma non su tutti: molti bloccano il caricamento dei file locali. Se vedi la pagina di avvio bloccata, usa `avvia.cmd`.

---

## Cosa contiene

### Dati
- Import **CSV, TSV, TXT, Excel .xlsx, JSON**, incolla da Excel (Ctrl+V), digitazione diretta, 15 dataset di esempio
- Griglia editabile, tipi di colonna, **colonne calcolate con formule**, filtri, stack/unstack, ricodifica, binning, standardizzazione, ritardi, aggregazioni (pivot), campionamento, rimozione duplicati
- Export CSV, Excel .xlsx, JSON; salvataggio dell'intero progetto

### Visualizzazione (stile business intelligence)
- Costruttore di grafici: barre, linee, area, dispersione, boxplot, istogramma, torta/ciambella, Pareto, mappa di calore, KPI, tabella
- Field wells (asse, misura, aggregazione, serie), filtri e slicer, ordinamento, top N
- **Cruscotto** con riquadri ridimensionabili, filtri globali, cruscotto automatico, stampa/PDF
- Tutti i grafici esportabili in PNG e SVG; tema chiaro/scuro con palette verificata per il daltonismo

### Statistica
- Descrittive complete con IC, riassunto grafico, valori anomali (Grubbs, IQR)
- Normalità: **Anderson-Darling, Shapiro-Wilk, Ryan-Joiner**; probability plot; identificazione della distribuzione; trasformazioni **Box-Cox, Yeo-Johnson, Johnson**
- Test di ipotesi: t (1 campione, 2 campioni, appaiato), z, **equivalenza TOST**, varianze (F, Levene, Bartlett), proporzioni (normale, esatto, Fisher), tassi di Poisson, non parametrici (Mann-Whitney, Wilcoxon, segni, Kruskal-Wallis, Mood, Friedman, runs, KS), chi-quadro di associazione e di adattamento
- **ANOVA** a una via e fattoriale (SS tipo I e III), ANOVA di Welch, confronti multipli **Tukey, Fisher, Bonferroni, Šidák, Games-Howell, Dunnett**, componenti della varianza
- **Regressione** lineare, multipla, polinomiale, **logistica binaria**, stepwise, migliori sottoinsiemi, VIF, lack-of-fit, diagnostica completa (residui studentizzati, leverage, Cook, DFITS, PRESS, Durbin-Watson, ACF)
- Multivariata: **PCA**, k-means, cluster gerarchico, Mahalanobis, **T² di Hotelling**, analisi discriminante
- Serie storiche: trend, medie mobili, smorzamento esponenziale, **Holt-Winters**, decomposizione, ACF/PACF, previsione
- **Potenza e numerosità campionaria** (t, proporzioni, varianze, ANOVA, DoE), piani di campionamento in accettazione con curva OC

### Six Sigma
- **Carte di controllo**: I-MR, Xbar-R, Xbar-S, EWMA, CUSUM, media mobile, Z-MR, p, np, c, u, p'/u' di Laney, T² di Hotelling — con gli **8 test di Nelson** configurabili, fasi, stime di sigma (Rbar/d2, Sbar/c4, pooled, MSSD, mediana MR)
- **Capacità**: Cp, Cpk, Pp, Ppk, Cpm, Z.bench, PPM attesi e osservati, livello sigma, intervalli di confidenza, capacità non normale (distribuzione fittata, Box-Cox, Johnson), capacità per attributi (binomiale e Poisson), **sixpack**
- **MSA**: Gage R&R incrociato (ANOVA con pooling dell'interazione e metodo Xbar-R), annidato per prove distruttive, bias e linearità, concordanza per attributi (kappa di Cohen e Fleiss), verifica della risoluzione
- Pareto, **FMEA** con RPN e Action Priority AIAG-VDA, COPQ, DPMO/resa/livello sigma, rendimento a catena (RTY)

### DoE (progettazione degli esperimenti)
- **Creazione dei piani**: fattoriale completo e frazionario (generatori a **minima aberrazione calcolati**, non copiati), Plackett-Burman, **Definitive Screening Design**, CCD (alpha rotatabile/face/ortogonale), Box-Behnken, Taguchi (L4–L27, ortogonalità verificata a runtime), fattoriale generale, quadrato latino e greco-latino, blocchi randomizzati e incompleti bilanciati, split-plot, miscele (simplex lattice, centroid, vertici estremi), **D-optimal**
- Struttura di **alias** e risoluzione calcolate dal gruppo dei contrasti definenti, blocchi confusi, punti centrali, fold-over, potenza del disegno
- **Analisi**: effetti (= 2 × coefficiente), Pareto degli effetti, normal e half-normal plot, **metodo di Lenth** per disegni non replicati, ANOVA con lack-of-fit ed errore puro, test di curvatura, riduzione automatica del modello
- Grafici: effetti principali, interazioni, cube plot, **contour**, **superficie 3D**, diagramma ternario per le miscele, response trace
- Superficie di risposta: modello quadratico, **punto stazionario e analisi canonica**, previsione con IC e intervallo di predizione
- **Ottimizzazione multi-risposta** con desiderabilità di Derringer-Suich
- Taguchi: rapporti **S/N** (larger/smaller/nominal), tabelle di risposta, approccio in due passi

### Pagine metodologiche
- **Metodologie Lean**: principi, 8 sprechi, strumenti (5S, standard work, SMED, kanban, heijunka, TPM, poka-yoke, jidoka, kaizen), calcolatori (takt time, OEE, legge di Little, kanban, EPEI, SMED, bilanciamento linea, scorta di sicurezza), value stream con PCE, roadmap
- **Guida al DoE**: strategia per fasi, **selettore guidato del disegno**, tabella delle tecniche, concetti chiave, procedura di analisi, errori tipici
- **Metodologia Six Sigma**: percorso DMAIC con strumenti per fase, selettore dello strumento, FMEA interattiva, Pareto/COPQ, rendimento e sigma, project charter
- **Guida e riferimenti**: uso, formule, glossario, note di verifica dei calcoli

---

## Verifica dei calcoli

Il motore statistico è scritto da zero, senza librerie esterne, e verificato da una suite automatica:

```bash
node --test test/core.test.js test/ui.test.js
```

40 test che confrontano i risultati con **tabelle pubblicate e valori di riferimento**:

| Area | Riferimento |
|---|---|
| Distribuzioni | quantili di normale, t, χ², F, binomiale, Poisson, beta (errore < 1e-6) |
| Costanti SPC | d2 per quadratura, c4 esatto, A2/A3/D3/D4/B3/B4/E2 vs tabelle ASTM |
| Range studentizzato | q(0,95) e q(0,99) vs tavole di Tukey |
| Potenza | t e F non centrali vs valori di riferimento (es. 0,5645 per n=20, d=0,5) |
| Capacità | Cp=Cpk=1 → 2699,8 PPM; 6σ ↔ 3,4 DPMO |
| Kruskal-Wallis | esempio di Hollander & Wolfe (H=0,7714, p=0,68) |
| Disegni | ortogonalità X'X verificata, risoluzioni a minima aberrazione, conteggi CCD/Box-Behnken |
| Gage R&R | componenti recuperate da dati con varianze note |
| Interfaccia | tutte le viste e tutte le opzioni percorse in un DOM simulato |

---

## Struttura

```
claudio-v3/
  index.html            pagina unica dell'applicazione
  avvia.cmd             avvio locale con server
  assets/css/app.css    stile, tema chiaro e scuro
  src/core/             motore statistico (16 moduli, nessuna dipendenza)
  src/viz/              motore grafico SVG e grafici di alto livello
  src/data/             modello dati, import/export, dataset di esempio
  src/ui/               interfaccia e viste
  test/                 suite di verifica
```

I moduli di `src/core/` funzionano anche in Node:

```js
const control = require('./src/core/control.js');
console.log(control.constants(5));   // d2, d3, c4, A2, D3, D4, B3, B4
```

---

## Note

- I dati restano sul computer: il progetto è salvato nella memoria locale del browser e può essere esportato in JSON.
- Il file `.xlsx` viene letto e scritto senza librerie esterne (il vecchio `.xls` non è supportato: salvarlo come `.xlsx` o CSV).
- Riferimenti principali: Montgomery (*Design and Analysis of Experiments*, *Introduction to Statistical Quality Control*), AIAG MSA, ASTM per le costanti delle carte, Derringer-Suich per la desiderabilità, Lenth per i disegni non replicati, Jones-Nachtsheim per i DSD.
