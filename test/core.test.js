/* Test del motore statistico di CLAUDIO v3.
 * Esecuzione: node --test test/
 * I valori attesi provengono da tabelle pubblicate o da software di riferimento (R).
 */
const test = require('node:test');
const assert = require('node:assert');

const num = require('../src/core/numeric.js');
const dist = require('../src/core/dist.js');
const mat = require('../src/core/matrix.js');
const st = require('../src/core/stats.js');
const T = require('../src/core/tests.js');
const reg = require('../src/core/regression.js');
const anova = require('../src/core/anova.js');
const ctrl = require('../src/core/control.js');
const cap = require('../src/core/capability.js');
const msa = require('../src/core/msa.js');
const doe = require('../src/core/doe.js');
const designs = require('../src/core/designs.js');
const power = require('../src/core/power.js');
const mv = require('../src/core/multivariate.js');
const ts = require('../src/core/timeseries.js');
const ss = require('../src/core/sixsigma.js');
require('../src/data/dataset.js');
require('../src/data/samples.js');
const C3 = globalThis.C3;

const close = (a, b, tol = 1e-6, msg = '') =>
  assert.ok(Math.abs(a - b) < tol, `${msg} atteso ${b}, ottenuto ${a}`);

/* ============ funzioni speciali e distribuzioni ============ */
test('funzioni speciali', () => {
  close(num.lgamma(5), Math.log(24), 1e-12);
  close(num.erf(1), 0.8427007929497149, 1e-12);
  close(num.betaInc(0.5, 2, 3), 0.6875, 1e-10);
  close(num.gammaP(3, 2), 0.32332358381692457, 1e-10);
  assert.strictEqual(num.choose(10, 3), 120);
  close(num.integrate(Math.sin, 0, Math.PI), 2, 1e-12);
});

test('quantili delle distribuzioni contro tabelle', () => {
  close(dist.qnorm(0.975), 1.959963985, 1e-8);
  close(dist.normal.cdf(1.96), 0.9750021049, 1e-9);
  close(dist.t.inv(0.975, 10), 2.228138852, 1e-7);
  close(dist.chisq.inv(0.95, 5), 11.0704977, 1e-6);
  close(dist.F.inv(0.95, 3, 12), 3.4902948, 1e-6);
  close(dist.binomial.cdf(3, 10, 0.3), 0.6496107184, 1e-10);
  close(dist.poisson.cdf(3, 2.5), 0.7575761331, 1e-9);
  close(dist.beta.inv(0.5, 2, 2), 0.5, 1e-9);
});

test('stima dei parametri (MLE)', () => {
  const r = num.rng(42);
  const w = Array.from({ length: 4000 }, () => dist.weibull.rand(r, 2.5, 10));
  const [k, l] = dist.weibull.fit(w);
  close(k, 2.5, 0.12, 'shape Weibull');
  close(l, 10, 0.3, 'scale Weibull');
});

/* ============ algebra lineare ============ */
test('algebra lineare', () => {
  const A = [[4, 12, -16], [12, 37, -43], [-16, -43, 98]];
  close(mat.det(A), 36, 1e-6);
  const I = mat.mul(A, mat.inverse(A));
  for (let i = 0; i < 3; i++) close(I[i][i], 1, 1e-9);
  const qr = mat.qrSolve([[1, 1], [1, 2], [1, 3], [1, 4], [1, 5]], [5, 8, 11, 14, 17]);
  close(qr.beta[0], 2, 1e-10);
  close(qr.beta[1], 3, 1e-10);
  const e = mat.eigenSym([[2, 1], [1, 2]]);
  close(e.values[0], 3, 1e-10);
  close(e.values[1], 1, 1e-10);
});

/* ============ statistica descrittiva e normalita ============ */
test('descrittive', () => {
  const x = [2, 4, 4, 4, 5, 5, 7, 9];
  close(st.mean(x), 5, 1e-12);
  close(st.sd(x), 2.13809, 1e-5);
  close(st.median(x), 4.5, 1e-12);
  close(st.q1(x), 4, 1e-12);
  close(st.q3(x), 6.5, 1e-12);
});

test('test di normalita: errore di primo tipo vicino a 0,05', () => {
  let rej = { sw: 0, ad: 0, rj: 0 };
  const B = 600;
  for (let k = 0; k < B; k++) {
    const r = num.rng(5000 + k);
    const d = Array.from({ length: 30 }, () => r.normal(0, 1));
    if (st.shapiroWilk(d).p < 0.05) rej.sw++;
    if (st.andersonDarling(d).p < 0.05) rej.ad++;
    if (st.ryanJoiner(d).p < 0.05) rej.rj++;
  }
  for (const k of Object.keys(rej)) {
    const alpha = rej[k] / B;
    assert.ok(alpha > 0.02 && alpha < 0.09, `${k}: alfa empirico ${alpha}`);
  }
});

test('Box-Cox individua lambda corretto', () => {
  const r = num.rng(3);
  const ln = Array.from({ length: 800 }, () => Math.exp(r.normal(0, 1)));
  close(st.boxCoxLambda(ln), 0, 0.08);
});

/* ============ test di ipotesi ============ */
test('t test', () => {
  const a = [27, 28, 29, 30, 31], b = [22, 23, 24, 25, 26];
  const p = T.tTest2(a, b, { pooled: true });
  close(p.t, 5, 1e-12);
  close(p.df, 8, 1e-12);
  close(p.p, 0.001052826, 1e-8);
  const one = T.tTest1([5.1, 4.9, 5.6, 5.2, 5.0, 4.8, 5.3], 5);
  close(one.t, 1.264390846, 1e-7);
});

test('Kruskal-Wallis (esempio Hollander)', () => {
  const r = T.kruskalWallis([
    { level: 'A', values: [2.9, 3.0, 2.5, 2.6, 3.2] },
    { level: 'B', values: [3.8, 2.7, 4.0, 2.4] },
    { level: 'C', values: [2.8, 3.4, 3.7, 2.2, 2.0] }
  ]);
  close(r.H, 0.7714, 1e-3);
  close(r.p, 0.68, 1e-2);
});

test('chi quadro e Fisher', () => {
  const c = T.chiSquareTable([[20, 30], [30, 20]]);
  close(c.chisq, 4, 1e-12);
  close(c.p, 0.0455, 1e-4);
  const f = T.fisherExact([[3, 1], [1, 3]]);
  close(f.p, 0.4857142857, 1e-8);
});

/* ============ regressione e ANOVA ============ */
test('regressione lineare', () => {
  const data = { x: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], y: [2.1, 4.2, 5.9, 8.1, 9.8, 12.2, 13.9, 16.1, 18.0, 20.2] };
  const f = reg.linearModel(data, 'y', ['x']);
  close(f.beta[1], 2.0018, 1e-3);
  assert.ok(f.r2 > 0.999);
  assert.ok(f.pValues[1] < 1e-10);
});

test('ANOVA a una via e Tukey', () => {
  const g = [
    { level: 'A', values: [10, 12, 11, 13, 10] },
    { level: 'B', values: [20, 19, 21, 22, 20] },
    { level: 'C', values: [15, 14, 16, 15, 17] }
  ];
  const r = anova.oneWay(g, { compare: 'tukey' });
  close(r.F, 74, 1e-9);
  close(r.ss.between, 212.1333333, 1e-5);
  assert.strictEqual(r.comparisons.pairs.length, 3);
  assert.ok(r.comparisons.pairs.every(p => p.significant));
});

test('range studentizzato contro tabelle', () => {
  close(anova.qtukey(0.95, 2, 10), 3.151, 2e-3);
  close(anova.qtukey(0.95, 3, 12), 3.773, 2e-3);
  close(anova.qtukey(0.95, 4, 20), 3.958, 2e-3);
  close(anova.qtukey(0.99, 3, 10), 5.270, 3e-3);
});

test('ANOVA a due vie via GLM', () => {
  const d = {
    A: ['a1', 'a1', 'a1', 'a1', 'a2', 'a2', 'a2', 'a2'],
    B: ['b1', 'b1', 'b2', 'b2', 'b1', 'b1', 'b2', 'b2'],
    y: [3, 4, 6, 5, 7, 8, 12, 11]
  };
  const g = reg.glm({ data: d, y: 'y', terms: 'A + B + A*B', categorical: { A: true, B: true } });
  close(g.anovaAdj[0].ss, 50, 1e-9);
  close(g.anovaAdj[1].ss, 18, 1e-9);
  close(g.anovaAdj[2].ss, 2, 1e-9);
});

/* ============ carte di controllo ============ */
test('costanti SPC contro tabelle ASTM', () => {
  close(ctrl.d2(2), 1.128, 1e-3);
  close(ctrl.d2(5), 2.326, 1e-3);
  close(ctrl.d2(10), 3.078, 1e-3);
  close(ctrl.c4(5), 0.9400, 1e-4);
  close(ctrl.constants(5).A2, 0.577, 1e-3);
  close(ctrl.constants(5).D4, 2.114, 1e-3);
  close(ctrl.constants(7).D3, 0.076, 1e-3);
  close(ctrl.constants(10).B3, 0.284, 1e-3);
  close(ctrl.constants(10).B4, 1.716, 1e-3);
  close(ctrl.constants(2).E2, 2.660, 2e-3);
});

test('carta Xbar-R coerente con le formule classiche', () => {
  const r = num.rng(11);
  const v = Array.from({ length: 100 }, () => r.normal(50, 2));
  const chart = ctrl.variableChart({ values: v, size: 5, type: 'xbar-r' });
  const k = ctrl.constants(5);
  const { xbarbar, rbar } = chart.stages[0];
  close(chart.primary[0].ucl, xbarbar + k.A2 * rbar, 1e-9);
  close(chart.secondary[0].ucl, k.D4 * rbar, 1e-9);
});

test('test di Nelson rilevano uno scostamento', () => {
  const r = num.rng(7);
  const v = Array.from({ length: 40 }, (_, i) => r.normal(i >= 25 ? 56 : 50, 1));
  const chart = ctrl.imrChart({ values: v });
  assert.ok(chart.outOfControl > 0);
});

/* ============ capacita ============ */
test('indici di capacita', () => {
  const i = cap.indices(10, 1, 7, 13, 10);
  close(i.cp, 1, 1e-12);
  close(i.cpk, 1, 1e-12);
  close(i.ppmTotal, 2699.796, 1e-2);
  const j = cap.indices(11, 1, 7, 13, 10);
  close(j.cpk, 2 / 3, 1e-9);
  close(cap.ppmToSigma(3.4), 6, 1e-3);
  close(cap.sigmaToPpm(6), 3.4, 0.01);
});

/* ============ MSA ============ */
test('Gage R&R recupera le componenti note', () => {
  const r = num.rng(99);
  const parts = [], ops = [], vals = [];
  const partEff = {}, opEff = {};
  for (let p = 1; p <= 10; p++) partEff['P' + p] = r.normal(0, 1);
  ['A', 'B', 'C'].forEach(o => { opEff[o] = r.normal(0, 0.2); });
  for (let p = 1; p <= 10; p++) {
    for (const o of ['A', 'B', 'C']) {
      for (let t = 0; t < 3; t++) {
        parts.push('P' + p); ops.push(o);
        vals.push(20 + partEff['P' + p] + opEff[o] + r.normal(0, 0.1));
      }
    }
  }
  const g = msa.gageRRCrossed({ values: vals, parts, operators: ops, tolerance: 6 });
  assert.ok(g.balanced);
  close(Math.sqrt(g.varRepeat), 0.1, 0.03, 'ripetibilita');
  close(Math.sqrt(g.varPart), 1.0, 0.25, 'variazione pezzi');
  assert.ok(g.ndc >= 5);
});

/* ============ DoE ============ */
test('generatori frazionari a minima aberrazione', () => {
  const expectations = {
    '5-1': 5, '6-2': 4, '7-3': 4, '8-4': 4, '9-4': 4,
    '10-5': 4, '11-6': 4, '11-4': 5, '15-11': 3
  };
  Object.keys(expectations).forEach(key => {
    const [k, p] = key.split('-').map(Number);
    const g = doe.generatorsFor(k, p);
    assert.strictEqual(g.resolution, expectations[key], `risoluzione di 2^(${k}-${p})`);
  });
});

test('ortogonalita dei disegni', () => {
  const fr = doe.factorialDesign({
    factors: Array.from({ length: 5 }, (_, i) => ({ name: 'F' + (i + 1), low: -1, high: 1 })),
    fraction: 1, randomize: false
  });
  const X = fr.table.map(r => ['F1', 'F2', 'F3', 'F4', 'F5'].map(k => r[k]));
  const XtX = mat.crossprod(X);
  XtX.forEach((row, i) => row.forEach((v, j) => {
    if (i === j) close(v, 16, 1e-9); else close(v, 0, 1e-9);
  }));
  doe.taguchiCatalog().forEach(a => assert.ok(a.orthogonal, 'array ' + a.name));
  const pb = doe.plackettBurman({
    factors: Array.from({ length: 8 }, (_, i) => ({ name: 'X' + (i + 1), low: 0, high: 1 })),
    randomize: false
  });
  const Xpb = pb.table.map(r => Array.from({ length: 8 }, (_, i) => r['X' + (i + 1)]));
  mat.crossprod(Xpb).forEach((row, i) => row.forEach((v, j) => {
    if (i === j) close(v, 12, 1e-9); else close(v, 0, 1e-9);
  }));
});

test('conteggio prove di CCD e Box-Behnken', () => {
  const c2 = doe.ccd({ factors: [{ name: 'A', low: 0, high: 1 }, { name: 'B', low: 0, high: 1 }], randomize: false });
  close(c2.alpha, Math.SQRT2, 1e-4);
  const c3 = doe.ccd({
    factors: [{ name: 'A', low: 0, high: 1 }, { name: 'B', low: 0, high: 1 }, { name: 'C', low: 0, high: 1 }],
    randomize: false
  });
  close(c3.alpha, Math.pow(8, 0.25), 1e-4);
  const expected = { 3: 15, 4: 27, 5: 43, 6: 54, 7: 62 };
  Object.keys(expected).forEach(k => {
    const b = designs ? doe.boxBehnken({
      factors: Array.from({ length: Number(k) }, (_, i) => ({ name: 'F' + i, low: 0, high: 10 })),
      randomize: false
    }) : null;
    assert.strictEqual(b.totalRuns, expected[k], 'Box-Behnken k=' + k);
  });
});

test('analisi fattoriale: effetti = 2 x coefficiente', () => {
  const A = [-1, 1, -1, 1, -1, 1, -1, 1], B = [-1, -1, 1, 1, -1, -1, 1, 1], C = [-1, -1, -1, -1, 1, 1, 1, 1];
  const y = A.map((a, i) => 50 + 5 * a - 3 * B[i] + 2 * a * B[i] + 0.2 * C[i]);
  const r = doe.analyzeFactorial({ data: { A, B, C, y }, response: 'y', factors: ['A', 'B', 'C'], order: 2 });
  const eff = Object.fromEntries(r.effects.map(e => [e.term, e.effect]));
  close(eff.A, 10, 1e-9);
  close(eff.B, -6, 1e-9);
  close(eff['A*B'], 4, 1e-9);
  assert.ok(r.lenth, 'metodo di Lenth attivo senza gradi di liberta');
});

test('superficie di risposta: punto stazionario', () => {
  const r = num.rng(5);
  const cc = doe.ccd({
    factors: [{ name: 'X1', low: -1, high: 1 }, { name: 'X2', low: -1, high: 1 }],
    alphaType: 'rotatable', randomize: false
  });
  const X1 = cc.table.map(t => t.X1), X2 = cc.table.map(t => t.X2);
  const y = X1.map((x1, i) => {
    const x2 = X2[i];
    return 100 + 10 * x1 - 4 * x2 - 8 * x1 * x1 - 6 * x2 * x2 - 4 * x1 * x2;
  });
  const rsm = doe.analyzeRSM({ data: { X1, X2, y }, response: 'y', factors: ['X1', 'X2'], codedInput: true });
  const exact = mat.solveSPD([[16, 4], [4, 12]], [10, -4]);
  close(rsm.stationary.coded[0], exact[0], 1e-4);
  close(rsm.stationary.coded[1], exact[1], 1e-4);
  assert.strictEqual(rsm.stationary.nature, 'massimo');
});

test('RSM: la codifica si ancora ai punti fattoriali (CCD in unita reali)', () => {
  // dati generati da un modello noto in unita codificate del piano (fattoriali a +-1)
  const design = doe.ccd({
    factors: [{ name: 'A', low: 80, high: 90 }, { name: 'B', low: 170, high: 180 }],
    alphaType: 'rotatable', randomize: false, centerCube: 5, centerAxial: 0
  });
  const A = [], B = [], y = [];
  design.table.forEach(row => {
    const x1 = row.A, x2 = row.B;
    A.push(row['A (reale)']);
    B.push(row['B (reale)']);
    y.push(80 + 1.0 * x1 + 0.5 * x2 - 1.4 * x1 * x1 - 1.0 * x2 * x2 + 0.25 * x1 * x2);
  });
  const rsm = doe.analyzeRSM({ data: { A, B, y }, response: 'y', factors: ['A', 'B'] });
  // i punti fattoriali distano 5 dal centro: quella deve essere l unita di codifica
  close(rsm.ranges.A.half, 5, 1e-9, 'semiampiezza di codifica');
  const coef = Object.fromEntries(rsm.fit.names.map((n, i) => [n, rsm.fit.beta[i]]));
  close(coef.A, 1.0, 1e-4, 'coefficiente lineare in unita del piano');
  close(coef['A^2'], -1.4, 1e-4, 'coefficiente quadratico');
  close(coef['A*B'], 0.25, 1e-4, 'coefficiente di interazione');
  // punto stazionario: confronto con la soluzione analitica
  const exact = mat.solveSPD([[2 * 1.4, -0.25], [-0.25, 2 * 1.0]], [1.0, 0.5]);
  close(rsm.stationary.coded[0], exact[0], 1e-4, 'stazionario codificato');
  close(rsm.stationary.real[0], 85 + exact[0] * 5, 1e-3, 'stazionario in unita reali');
});

test('DSD ortogonale negli effetti principali', () => {
  [4, 6, 8, 12].forEach(m => {
    const d = designs.dsd({
      factors: Array.from({ length: m }, (_, i) => ({ name: 'X' + (i + 1), low: 0, high: 10 })),
      randomize: false
    });
    assert.ok(!d.error, 'DSD m=' + m);
    const X = d.table.map(r => Array.from({ length: m }, (_, i) => r['X' + (i + 1)]));
    mat.crossprod(X).forEach((row, i) => row.forEach((v, j) => {
      if (i !== j) close(v, 0, 1e-9, 'DSD m=' + m);
    }));
  });
});

test('miscele: modello di Scheffe', () => {
  const sc = designs.simplexCentroid({ components: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], randomize: false });
  const sl = designs.simplexLattice({ components: [{ name: 'A' }, { name: 'B' }, { name: 'C' }], degree: 2, randomize: false });
  const props = sc.proportions.concat(sl.proportions);
  const data = {
    A: props.map(p => p[0]), B: props.map(p => p[1]), C: props.map(p => p[2]),
    y: props.map(p => 10 * p[0] + 20 * p[1] + 5 * p[2] + 30 * p[0] * p[1])
  };
  const m = designs.mixtureModel(data, ['A', 'B', 'C'], 'y', 2);
  close(m.beta[0], 10, 1e-6);
  close(m.beta[1], 20, 1e-6);
  close(m.beta[2], 5, 1e-6);
  close(m.beta[3], 30, 1e-6);
});

test('quadrati latini e greco-latini', () => {
  const ls = designs.latinSquare({ treatments: ['A', 'B', 'C', 'D'] });
  assert.ok(ls.valid);
  assert.strictEqual(ls.totalRuns, 16);
  assert.ok(designs.graecoLatin({ treatments: ['A', 'B', 'C'] }).table);
  assert.ok(designs.graecoLatin({ treatments: ['A', 'B', 'C', 'D'] }).table, 'greco-latino di ordine 4');
  assert.ok(designs.graecoLatin({ treatments: ['A', 'B', 'C', 'D', 'E', 'F'] }).error, 'ordine 6 impossibile');
});

/* ============ potenza ============ */
test('potenza contro valori di riferimento R', () => {
  close(power.tPower1(20, 0.5, 1, 0.05, 'two'), 0.5645, 1e-3);
  close(power.tPower2(20, 20, 1, 1, 0.05, 'two'), 0.8689, 1e-3);
  close(power.tPower2(64, 64, 0.5, 1, 0.05, 'two'), 0.8015, 1e-3);
  assert.strictEqual(power.compute({ test: 't1', delta: 0.5, sigma: 1, power: 0.8 }).n, 34);
  close(power.pnf(dist.F.inv(0.95, 2, 10), 2, 10, 0), 0.95, 1e-6);
});

test('piano di campionamento', () => {
  const plan = power.singleSamplingPlan({ aql: 0.01, rql: 0.06, alpha: 0.05, beta: 0.1 });
  assert.ok(plan.pAcceptAQL >= 0.95);
  assert.ok(plan.pAcceptRQL <= 0.10);
});

/* ============ multivariata e serie storiche ============ */
test('PCA su dati correlati', () => {
  const r = num.rng(21);
  const data = { a: [], b: [], c: [] };
  for (let i = 0; i < 200; i++) {
    const f = r.normal(0, 1);
    data.a.push(f + r.normal(0, 0.1));
    data.b.push(2 * f + r.normal(0, 0.1));
    data.c.push(r.normal(0, 1));
  }
  const p = mv.pca(data, ['a', 'b', 'c']);
  assert.ok(p.components[0].proportion > 0.55);
  close(p.components.reduce((s, c) => s + c.eigenvalue, 0), 3, 1e-6);
});

test('serie storiche: trend e previsione', () => {
  const y = Array.from({ length: 40 }, (_, i) => 100 + 2 * i);
  const tr = ts.trendAnalysis(y, { model: 'linear', horizon: 3 });
  close(tr.coefficients[1], 2, 1e-9);
  close(tr.forecast[0].fit, 100 + 2 * 40, 1e-6);
  const hw = ts.holtWinters(
    Array.from({ length: 48 }, (_, i) => 100 + i + 10 * Math.sin(i * Math.PI / 6)), 12, { horizon: 4 });
  assert.ok(hw.accuracy.mape < 25);
});

/* ============ six sigma / lean ============ */
test('conversioni six sigma', () => {
  close(ss.sigmaFromDpmo(3.4), 6, 1e-3);
  close(ss.dpmoFromSigma(4), 6209.7, 1);
  const rty = ss.rolledThroughput([{ name: 'a', yield: 0.98 }, { name: 'b', yield: 0.97 }, { name: 'c', yield: 0.99 }]);
  close(rty.rty, 0.98 * 0.97 * 0.99, 1e-12);
  const o = ss.oee({ plannedTime: 480, downtime: 60, idealCycleTime: 1, totalCount: 380, rejects: 12 });
  close(o.availability, 420 / 480, 1e-12);
  close(o.performance, 380 / 420, 1e-12);
  close(o.quality, 368 / 380, 1e-12);
});

test('Pareto e FMEA', () => {
  const p = ss.pareto([
    { label: 'A', value: 50 }, { label: 'B', value: 30 }, { label: 'C', value: 15 }, { label: 'D', value: 5 }
  ]);
  close(p.rows[0].cumPct, 50, 1e-9);
  close(p.rows[1].cumPct, 80, 1e-9);
  const f = ss.fmea([{ item: 'x', failureMode: 'm', severity: 8, occurrence: 4, detection: 5 }]);
  assert.strictEqual(f.rows[0].rpn, 160);
});

/* ============ dataset e formule ============ */
test('dataset: colonne, formule, aggregazioni', () => {
  const d = C3.data.fromColumns({ a: [1, 2, 3, 4], g: ['x', 'x', 'y', 'y'] }, 'test');
  assert.strictEqual(d.nrows, 4);
  assert.strictEqual(d.column('a').type, 'num');
  assert.strictEqual(d.column('g').type, 'cat');
  d.addFormulaColumn('doppio', 'a * 2');
  assert.deepStrictEqual(d.col('doppio'), [2, 4, 6, 8]);
  d.addFormulaColumn('scarto', 'a - MEAN(a)');
  close(d.col('scarto')[0], -1.5, 1e-12);
  d.addFormulaColumn('classe', 'IF(a > 2, 1, 0)');
  assert.deepStrictEqual(d.col('classe'), [0, 0, 1, 1]);
  const agg = d.aggregate({ by: ['g'], measures: [{ col: 'a', agg: 'mean', as: 'media' }, { agg: 'count', as: 'n' }] });
  assert.strictEqual(agg.rows.length, 2);
  close(agg.rows[0].media, 1.5, 1e-12);
  const f = d.filter('a > 2');
  assert.strictEqual(f.nrows, 2);
});

test('formule: identificatori non validi vengono rifiutati', () => {
  const d = C3.data.fromColumns({ a: [1, 2, 3] }, 'x');
  assert.throws(() => C3.data.evalFormula(d, 'fetch("http://x")'), /non riconosciuto/i);
});

test('dataset di esempio caricabili', () => {
  const ids = C3.samples.list().map(s => s.id);
  assert.ok(ids.length >= 12);
  ids.forEach(id => {
    const d = C3.samples.load(id);
    assert.ok(d && d.nrows > 0, 'dataset ' + id);
    assert.ok(d.columns.length > 0);
  });
});

test('flusso completo: dataset -> carta di controllo -> capacita', () => {
  const d = C3.samples.load('riempimento');
  const vals = d.numeric('Volume');
  const chart = ctrl.variableChart({ values: vals, size: 5, type: 'xbar-r' });
  assert.ok(chart.primary.length === 25);
  const c = cap.normalCapability({ values: vals, lsl: 494, usl: 506, target: 500, subgroupSize: 5 });
  assert.ok(c.within.cpk > 0.5 && c.within.cpk < 3);
  assert.ok(isFinite(c.sigmaLevel));
});
