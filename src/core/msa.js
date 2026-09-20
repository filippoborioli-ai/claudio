/* CLAUDIO v3 - core/msa.js
 * Analisi del sistema di misura (MSA):
 * Gage R&R incrociato (metodo ANOVA con pooling dell’interazione e metodo Xbar-R),
 * Gage R&R annidato (prove distruttive), studio di bias e linearità,
 * analisi di concordanza per attributi (kappa di Cohen e Fleiss, Kendall).
 */
;(function (root, name, deps, factory) {
  var res = deps.map(function (d) {
    return (typeof module === 'object' && module.exports && typeof require === 'function')
      ? require('./' + d + '.js') : root.C3[d];
  });
  var api = factory.apply(null, res);
  if (typeof module === 'object' && module.exports) module.exports = api;
  (root.C3 = root.C3 || {})[name] = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, 'msa',
['numeric', 'dist', 'stats', 'control', 'anova', 'regression'],
function (num, dist, st, ctrl, av, reg) {
  'use strict';

  /**
   * Gage R&R incrociato - metodo ANOVA.
   * spec: { values, parts, operators, tolerance, studyVar (default 6),
   *         alphaPool (default 0.25), historicalSd, processSd }
   */
  function gageRRCrossed(spec) {
    var vc = av.varianceComponents(spec.values, spec.parts, spec.operators, { nested: false });
    if (!vc.balanced) return { balanced: false, error: 'Il disegno non è bilanciato: ogni operatore deve misurare ogni pezzo lo stesso numero di volte.' };
    var a = vc.a, b = vc.b, nrep = vc.nrep;
    var tab = vc.table;
    var msA = tab[0].ms, msB = tab[1].ms;
    var abRow = tab.find(function (r) { return r.source === 'A*B'; });
    var msAB = abRow ? abRow.ms : null;
    var msE = tab[tab.length - 1].ms;
    var dfA = tab[0].df, dfB = tab[1].df, dfAB = abRow ? abRow.df : 0, dfE = tab[tab.length - 1].df;
    var alphaPool = spec.alphaPool == null ? 0.25 : spec.alphaPool;
    var pooled = false, pAB = abRow ? abRow.p : 1;
    var varPart, varOper, varInter, varRepeat, table2;

    if (nrep < 2) {
      // nessun replicato: l’interazione non è stimabile e fa da termine di errore
      varRepeat = msAB != null ? msAB : msE;
      varInter = 0;
      varPart = Math.max(0, (msA - varRepeat) / b);
      varOper = Math.max(0, (msB - varRepeat) / a);
      pooled = true;
      var dfErr = abRow ? dfAB : dfE;
      var ssErr = abRow ? abRow.ss : tab[tab.length - 1].ss;
      table2 = [
        { source: 'Pezzo', df: dfA, ss: tab[0].ss, ms: msA, F: msA / varRepeat, p: 1 - dist.F.cdf(msA / varRepeat, dfA, dfErr) },
        { source: 'Operatore', df: dfB, ss: tab[1].ss, ms: msB, F: msB / varRepeat, p: 1 - dist.F.cdf(msB / varRepeat, dfB, dfErr) },
        { source: 'Errore (interazione residua)', df: dfErr, ss: ssErr, ms: varRepeat, F: null, p: null },
        { source: 'Totale', df: dfA + dfB + dfErr, ss: tab[0].ss + tab[1].ss + ssErr, ms: null, F: null, p: null }
      ];
    } else if (abRow && pAB > alphaPool) {
      pooled = true;
      var ssPool = abRow.ss + tab[tab.length - 1].ss;
      var dfPool = dfAB + dfE;
      var msPool = ssPool / dfPool;
      varRepeat = msPool;
      varInter = 0;
      varPart = Math.max(0, (msA - msPool) / (b * nrep));
      varOper = Math.max(0, (msB - msPool) / (a * nrep));
      table2 = [
        { source: 'Pezzo', df: dfA, ss: tab[0].ss, ms: msA, F: msA / msPool, p: 1 - dist.F.cdf(msA / msPool, dfA, dfPool) },
        { source: 'Operatore', df: dfB, ss: tab[1].ss, ms: msB, F: msB / msPool, p: 1 - dist.F.cdf(msB / msPool, dfB, dfPool) },
        { source: 'Ripetibilità', df: dfPool, ss: ssPool, ms: msPool, F: null, p: null },
        { source: 'Totale', df: dfA + dfB + dfPool, ss: tab[0].ss + tab[1].ss + ssPool, ms: null, F: null, p: null }
      ];
    } else {
      varRepeat = msE;
      varInter = Math.max(0, (msAB - msE) / nrep);
      varPart = Math.max(0, (msA - msAB) / (b * nrep));
      varOper = Math.max(0, (msB - msAB) / (a * nrep));
      table2 = [
        { source: 'Pezzo', df: dfA, ss: tab[0].ss, ms: msA, F: msA / msAB, p: 1 - dist.F.cdf(msA / msAB, dfA, dfAB) },
        { source: 'Operatore', df: dfB, ss: tab[1].ss, ms: msB, F: msB / msAB, p: 1 - dist.F.cdf(msB / msAB, dfB, dfAB) },
        { source: 'Pezzo*Operatore', df: dfAB, ss: abRow.ss, ms: msAB, F: msAB / msE, p: 1 - dist.F.cdf(msAB / msE, dfAB, dfE) },
        { source: 'Ripetibilità', df: dfE, ss: tab[tab.length - 1].ss, ms: msE, F: null, p: null },
        { source: 'Totale', df: dfA + dfB + dfAB + dfE, ss: tab[0].ss + tab[1].ss + abRow.ss + tab[tab.length - 1].ss, ms: null, F: null, p: null }
      ];
    }

    var varRepro = varOper + varInter;
    var varGage = varRepeat + varRepro;
    var varTotal = varGage + varPart;
    if (spec.processSd) {
      // usa la variabilità storica di processo come riferimento
      varTotal = Math.max(varGage, Math.pow(spec.processSd, 2));
      varPart = Math.max(0, varTotal - varGage);
    }
    var k = spec.studyVar || 6;
    function row(label, v) {
      return {
        source: label, varComp: v,
        pctContribution: 100 * v / varTotal,
        sd: Math.sqrt(v),
        studyVar: k * Math.sqrt(v),
        pctStudyVar: 100 * Math.sqrt(v) / Math.sqrt(varTotal),
        pctTolerance: spec.tolerance ? 100 * k * Math.sqrt(v) / spec.tolerance : null
      };
    }
    var rows = [
      row('Gage R&R totale', varGage),
      row('  Ripetibilità (EV)', varRepeat),
      row('  Riproducibilità (AV)', varRepro)
    ];
    if (varInter > 0 || !pooled) {
      rows.push(row('    Operatore', varOper));
      rows.push(row('    Pezzo*Operatore', varInter));
    } else {
      rows.push(row('    Operatore', varOper));
    }
    rows.push(row('Pezzo-a-pezzo (PV)', varPart));
    rows.push(row('Variazione totale', varTotal));

    var ndc = Math.floor(1.41 * Math.sqrt(varPart) / Math.sqrt(varGage));
    var pctRR = 100 * Math.sqrt(varGage) / Math.sqrt(varTotal);
    return {
      balanced: true, method: 'ANOVA', pooledInteraction: pooled, pInteraction: pAB,
      nParts: a, nOperators: b, nReplicates: nrep, n: vc.N,
      anova: table2, components: rows,
      varGage: varGage, varPart: varPart, varTotal: varTotal,
      varRepeat: varRepeat, varRepro: varRepro, varOper: varOper, varInter: varInter,
      pctStudyVarRR: pctRR,
      pctContributionRR: 100 * varGage / varTotal,
      pctToleranceRR: spec.tolerance ? 100 * k * Math.sqrt(varGage) / spec.tolerance : null,
      ndc: ndc, studyVarMultiplier: k, tolerance: spec.tolerance,
      verdict: rrVerdict(pctRR, ndc),
      levelsParts: vc.levelsA, levelsOperators: vc.levelsB,
      cells: vc.cells, meanCell: vc.meanCell, meanPart: vc.meanA, meanOperator: vc.meanB,
      grand: vc.grand,
      xbarR: gageRRXbarR(spec),
      runChart: runChartData(spec)
    };
  }

  /** Giudizio AIAG sul sistema di misura. */
  function rrVerdict(pctRR, ndc) {
    var out = [];
    if (pctRR < 10) out.push('Sistema di misura accettabile (%Study Var < 10%).');
    else if (pctRR < 30) out.push('Sistema di misura marginale (10-30%): accettabile solo valutando costi e criticità.');
    else out.push('Sistema di misura non accettabile (%Study Var > 30%): va migliorato prima di usare i dati.');
    if (ndc >= 5) out.push('Categorie distinte ' + ndc + ' (>= 5): risoluzione adeguata a distinguere i pezzi.');
    else out.push('Categorie distinte ' + ndc + ' (< 5): risoluzione insufficiente per il controllo di processo.');
    return out.join(' ');
  }

  /** Metodo Xbar-R (media e range) come confronto. */
  function gageRRXbarR(spec) {
    var byOp = {}, byPart = {}, opList = [], partList = [];
    for (var i = 0; i < spec.values.length; i++) {
      var v = parseFloat(spec.values[i]);
      if (!isFinite(v)) continue;
      var o = String(spec.operators[i]), p = String(spec.parts[i]);
      if (opList.indexOf(o) < 0) opList.push(o);
      if (partList.indexOf(p) < 0) partList.push(p);
      (byOp[o] = byOp[o] || {});
      (byOp[o][p] = byOp[o][p] || []).push(v);
      (byPart[p] = byPart[p] || []).push(v);
    }
    opList.sort(); partList.sort();
    var ranges = [], opMeans = [];
    var nrep = null;
    opList.forEach(function (o) {
      var vals = [];
      partList.forEach(function (p) {
        var c = byOp[o][p] || [];
        if (c.length) { ranges.push(st.range(c)); nrep = nrep || c.length; }
        vals = vals.concat(c);
      });
      opMeans.push(st.mean(vals));
    });
    var rbar = st.mean(ranges);
    var d2rep = ctrl.d2(nrep || 2);
    var ev = rbar / d2rep;
    var xdiff = st.range(opMeans);
    var d2op = ctrl.d2(opList.length);
    var avRaw = xdiff / d2op;
    var nParts = partList.length;
    var av = Math.sqrt(Math.max(0, avRaw * avRaw - ev * ev / (nParts * (nrep || 2))));
    var partMeans = partList.map(function (p) { return st.mean(byPart[p]); });
    var rp = st.range(partMeans);
    var pv = rp / ctrl.d2(nParts);
    var rr = Math.sqrt(ev * ev + av * av);
    var tv = Math.sqrt(rr * rr + pv * pv);
    var k = spec.studyVar || 6;
    return {
      method: 'Xbar-R (media e range)',
      rbar: rbar, ev: ev, av: av, pv: pv, rr: rr, tv: tv,
      pctEV: 100 * ev / tv, pctAV: 100 * av / tv, pctPV: 100 * pv / tv, pctRR: 100 * rr / tv,
      pctToleranceRR: spec.tolerance ? 100 * k * rr / spec.tolerance : null,
      ndc: Math.floor(1.41 * pv / rr),
      nrep: nrep, nParts: nParts, nOperators: opList.length
    };
  }

  /** Dati per il gage run chart. */
  function runChartData(spec) {
    var out = [];
    for (var i = 0; i < spec.values.length; i++) {
      var v = parseFloat(spec.values[i]);
      if (!isFinite(v)) continue;
      out.push({
        part: String(spec.parts[i]), operator: String(spec.operators[i]),
        value: v, order: i
      });
    }
    return out;
  }

  /**
   * Gage R&R annidato (ogni pezzo misurato da un solo operatore, prove distruttive).
   * spec: { values, parts, operators, tolerance }
   */
  function gageRRNested(spec) {
    var vc = av.varianceComponents(spec.values, spec.operators, spec.parts, { nested: true });
    if (!vc.balanced) return { balanced: false, error: 'Disegno annidato non bilanciato.' };
    var tab = vc.table;
    var msOp = tab[0].ms, msPart = tab[1].ms, msE = tab[2].ms;
    var nrep = vc.nrep, nPartsPerOp = vc.b;
    var varRepeat = msE;
    var varPart = Math.max(0, (msPart - msE) / nrep);
    var varOper = Math.max(0, (msOp - msPart) / (nPartsPerOp * nrep));
    var varGage = varRepeat + varOper;
    var varTotal = varGage + varPart;
    var k = spec.studyVar || 6;
    function row(label, v) {
      return {
        source: label, varComp: v, pctContribution: 100 * v / varTotal,
        sd: Math.sqrt(v), studyVar: k * Math.sqrt(v),
        pctStudyVar: 100 * Math.sqrt(v) / Math.sqrt(varTotal),
        pctTolerance: spec.tolerance ? 100 * k * Math.sqrt(v) / spec.tolerance : null
      };
    }
    var pctRR = 100 * Math.sqrt(varGage) / Math.sqrt(varTotal);
    return {
      balanced: true, method: 'ANOVA annidato (nested)',
      anova: tab.map(function (r, i) {
        return {
          source: ['Operatore', 'Pezzo(Operatore)', 'Ripetibilità'][i] || r.source,
          df: r.df, ss: r.ss, ms: r.ms, F: r.F, p: r.p
        };
      }),
      components: [
        row('Gage R&R totale', varGage),
        row('  Ripetibilità', varRepeat),
        row('  Riproducibilità', varOper),
        row('Pezzo-a-pezzo', varPart),
        row('Variazione totale', varTotal)
      ],
      pctStudyVarRR: pctRR, ndc: Math.floor(1.41 * Math.sqrt(varPart) / Math.sqrt(varGage)),
      verdict: rrVerdict(pctRR, Math.floor(1.41 * Math.sqrt(varPart) / Math.sqrt(varGage))),
      nOperators: vc.a, nPartsPerOperator: vc.b, nReplicates: nrep
    };
  }

  /**
   * Studio di bias e linearità.
   * spec: { reference: [], measured: [], tolerance, processVar }
   */
  function biasLinearity(spec) {
    var ref = [], mea = [], bias = [];
    for (var i = 0; i < spec.reference.length; i++) {
      var r = parseFloat(spec.reference[i]), m = parseFloat(spec.measured[i]);
      if (!isFinite(r) || !isFinite(m)) continue;
      ref.push(r); mea.push(m); bias.push(m - r);
    }
    var fit = reg.polyFit(ref, bias, 1);
    var n = bias.length;
    var meanBias = st.mean(bias);
    var sdBias = st.sd(bias);
    var tstat = meanBias / (sdBias / Math.sqrt(n));
    var pv = 2 * (1 - dist.t.cdf(Math.abs(tstat), n - 1));
    var tc = dist.t.inv(0.975, n - 1);
    // bias per livello di riferimento
    var byRef = {};
    ref.forEach(function (r, k) { (byRef[r] = byRef[r] || []).push(bias[k]); });
    var levels = Object.keys(byRef).map(parseFloat).sort(function (a, b) { return a - b; });
    return {
      n: n, meanBias: meanBias, sdBias: sdBias, t: tstat, p: pv,
      ciBias: [meanBias - tc * sdBias / Math.sqrt(n), meanBias + tc * sdBias / Math.sqrt(n)],
      pctBias: spec.processVar ? 100 * Math.abs(meanBias) / spec.processVar : null,
      pctBiasTolerance: spec.tolerance ? 100 * Math.abs(meanBias) / spec.tolerance : null,
      linearity: {
        slope: fit.beta[1], intercept: fit.beta[0],
        pSlope: fit.pValues[1], pIntercept: fit.pValues[0],
        r2: fit.r2, s: fit.s,
        pctLinearity: spec.processVar ? 100 * Math.abs(fit.beta[1]) * spec.processVar / spec.processVar : null,
        linearityAbs: Math.abs(fit.beta[1]) * (st.max(ref) - st.min(ref))
      },
      byLevel: levels.map(function (L) {
        var b = byRef[L];
        var m = st.mean(b), s = b.length > 1 ? st.sd(b) : 0;
        var tci = b.length > 1 ? dist.t.inv(0.975, b.length - 1) * s / Math.sqrt(b.length) : 0;
        return {
          reference: L, n: b.length, meanBias: m, sd: s,
          ci: [m - tci, m + tci],
          p: b.length > 1 ? 2 * (1 - dist.t.cdf(Math.abs(m / (s / Math.sqrt(b.length))), b.length - 1)) : null
        };
      }),
      points: ref.map(function (r, k) { return { reference: r, measured: mea[k], bias: bias[k] }; }),
      fit: fit,
      verdict: (pv > 0.05 ? 'Bias non significativo. ' : 'Bias significativo: il sistema misura sistematicamente ' + (meanBias > 0 ? 'in eccesso. ' : 'in difetto. ')) +
        (fit.pValues[1] > 0.05 ? 'Linearità accettabile.' : 'Linearità significativa: il bias cambia con la grandezza misurata.')
    };
  }

  /**
   * Analisi di concordanza per attributi.
   * spec: { ratings: [[...prove per valutatore]] come mappa appraiser -> array di array,
   *         standard: [] (opzionale), items }
   * Formato richiesto: spec.data = [{ appraiser, item, trial, rating }], spec.standard = {item: valore}
   */
  function attributeAgreement(spec) {
    var rows = spec.data;
    var appraisers = [], items = [], ratingsSet = [];
    rows.forEach(function (r) {
      if (appraisers.indexOf(String(r.appraiser)) < 0) appraisers.push(String(r.appraiser));
      if (items.indexOf(String(r.item)) < 0) items.push(String(r.item));
      if (ratingsSet.indexOf(String(r.rating)) < 0) ratingsSet.push(String(r.rating));
    });
    appraisers.sort(); items.sort(); ratingsSet.sort();
    var std = spec.standard || null;

    function get(app, item) {
      return rows.filter(function (r) {
        return String(r.appraiser) === app && String(r.item) === item;
      }).map(function (r) { return String(r.rating); });
    }

    // entro valutatore
    var within = appraisers.map(function (app) {
      var agree = 0, tot = 0;
      items.forEach(function (it) {
        var rs = get(app, it);
        if (rs.length < 2) return;
        tot++;
        if (rs.every(function (v) { return v === rs[0]; })) agree++;
      });
      return {
        appraiser: app, inspected: tot, matched: agree,
        pct: tot ? 100 * agree / tot : null,
        ci: tot ? wilsonCI(agree, tot) : null
      };
    });

    // valutatore vs standard
    var vsStandard = std ? appraisers.map(function (app) {
      var agree = 0, tot = 0;
      items.forEach(function (it) {
        var rs = get(app, it);
        if (!rs.length || std[it] == null) return;
        tot++;
        if (rs.every(function (v) { return v === String(std[it]); })) agree++;
      });
      var kap = kappaVsStandard(app, rows, std, items, ratingsSet);
      return {
        appraiser: app, inspected: tot, matched: agree,
        pct: tot ? 100 * agree / tot : null,
        ci: tot ? wilsonCI(agree, tot) : null,
        kappa: kap.kappa, kappaSE: kap.se, kappaZ: kap.z, kappaP: kap.p
      };
    }) : null;

    // fra valutatori
    var betweenAgree = 0, betweenTot = 0;
    items.forEach(function (it) {
      var all = [];
      appraisers.forEach(function (app) { all = all.concat(get(app, it)); });
      if (!all.length) return;
      betweenTot++;
      if (all.every(function (v) { return v === all[0]; })) betweenAgree++;
    });

    // tutti vs standard
    var allVsStd = null;
    if (std) {
      var ag = 0, tt = 0;
      items.forEach(function (it) {
        var all = [];
        appraisers.forEach(function (app) { all = all.concat(get(app, it)); });
        if (!all.length || std[it] == null) return;
        tt++;
        if (all.every(function (v) { return v === String(std[it]); })) ag++;
      });
      allVsStd = { inspected: tt, matched: ag, pct: tt ? 100 * ag / tt : null, ci: tt ? wilsonCI(ag, tt) : null };
    }

    return {
      appraisers: appraisers, items: items, categories: ratingsSet,
      within: within, vsStandard: vsStandard,
      between: {
        inspected: betweenTot, matched: betweenAgree,
        pct: betweenTot ? 100 * betweenAgree / betweenTot : null,
        ci: betweenTot ? wilsonCI(betweenAgree, betweenTot) : null,
        fleissKappa: fleissKappa(rows, items, ratingsSet)
      },
      allVsStandard: allVsStd,
      verdict: (function () {
        var p = betweenTot ? 100 * betweenAgree / betweenTot : 0;
        if (p >= 90) return 'Concordanza elevata (>= 90%): sistema di valutazione affidabile.';
        if (p >= 80) return 'Concordanza marginale (80-90%): servono criteri più chiari o formazione.';
        return 'Concordanza insufficiente (< 80%): rivedere definizioni operative e addestramento.';
      })()
    };
  }

  function wilsonCI(x, n, conf) {
    var zc = dist.qnorm(1 - (1 - (conf || 0.95)) / 2);
    var ph = x / n;
    var den = 1 + zc * zc / n;
    var c = ph + zc * zc / (2 * n);
    var h = zc * Math.sqrt(ph * (1 - ph) / n + zc * zc / (4 * n * n));
    return [100 * (c - h) / den, 100 * (c + h) / den];
  }

  /** Kappa di Cohen di un valutatore contro lo standard (media sulle prove). */
  function kappaVsStandard(app, rows, std, items, cats) {
    var pairs = rows.filter(function (r) {
      return String(r.appraiser) === app && std[String(r.item)] != null;
    }).map(function (r) { return [String(r.rating), String(std[String(r.item)])]; });
    return cohenKappa(pairs, cats);
  }

  /** Kappa di Cohen su coppie [valutato, riferimento]. */
  function cohenKappa(pairs, cats) {
    var k = cats.length, i, j;
    var m = {}, n = pairs.length;
    cats.forEach(function (a) { m[a] = {}; cats.forEach(function (b) { m[a][b] = 0; }); });
    pairs.forEach(function (p) { if (m[p[0]] && m[p[0]][p[1]] != null) m[p[0]][p[1]]++; });
    var po = 0, pe = 0;
    var rowS = {}, colS = {};
    cats.forEach(function (a) {
      rowS[a] = 0; colS[a] = 0;
    });
    cats.forEach(function (a) {
      cats.forEach(function (b) {
        rowS[a] += m[a][b]; colS[b] += m[a][b];
      });
    });
    cats.forEach(function (a) {
      po += m[a][a] / n;
      pe += (rowS[a] / n) * (colS[a] / n);
    });
    var kappa = (po - pe) / (1 - pe);
    var se = Math.sqrt(po * (1 - po) / (n * Math.pow(1 - pe, 2)));
    var z = kappa / se;
    return { kappa: kappa, se: se, z: z, p: 1 - dist.normal.cdf(z), po: po, pe: pe, n: n };
  }

  /** Kappa di Fleiss (più valutatori sugli stessi item). */
  function fleissKappa(rows, items, cats) {
    var N = 0, k = cats.length;
    var counts = [];
    items.forEach(function (it) {
      var c = new Array(k).fill(0), tot = 0;
      rows.forEach(function (r) {
        if (String(r.item) !== it) return;
        var idx = cats.indexOf(String(r.rating));
        if (idx >= 0) { c[idx]++; tot++; }
      });
      if (tot > 1) { counts.push({ c: c, n: tot }); N++; }
    });
    if (!N) return null;
    var nBar = st.mean(counts.map(function (o) { return o.n; }));
    var pj = new Array(k).fill(0);
    counts.forEach(function (o) {
      for (var j = 0; j < k; j++) pj[j] += o.c[j] / (N * o.n);
    });
    var Pi = counts.map(function (o) {
      var s = 0;
      for (var j = 0; j < k; j++) s += o.c[j] * (o.c[j] - 1);
      return s / (o.n * (o.n - 1));
    });
    var Pbar = st.mean(Pi);
    var Pe = pj.reduce(function (a, p) { return a + p * p; }, 0);
    var kap = (Pbar - Pe) / (1 - Pe);
    var se = Math.sqrt(2 / (N * nBar * (nBar - 1))) / (1 - Pe) *
      Math.sqrt(Pe - (2 * nBar - 3) * Pe * Pe + 2 * (nBar - 2) *
        pj.reduce(function (a, p) { return a + p * p * p; }, 0));
    return { kappa: kap, se: se, z: kap / se, p: 1 - dist.normal.cdf(kap / se), items: N };
  }

  /** Interpretazione dei valori di kappa (Landis & Koch). */
  function kappaVerdict(k) {
    if (k == null || !isFinite(k)) return 'n/d';
    if (k < 0) return 'peggiore del caso';
    if (k < 0.2) return 'concordanza minima';
    if (k < 0.4) return 'concordanza debole';
    if (k < 0.6) return 'concordanza moderata';
    if (k < 0.8) return 'concordanza sostanziale';
    if (k < 0.9) return 'concordanza forte';
    return 'concordanza quasi perfetta';
  }

  /** Risoluzione del sistema di misura (regola del 10%). */
  function resolutionCheck(increment, tolerance, processSd) {
    return {
      increment: increment,
      pctTolerance: tolerance ? 100 * increment / tolerance : null,
      pctProcess: processSd ? 100 * increment / (6 * processSd) : null,
      ok: tolerance ? increment <= tolerance / 10 : null,
      note: 'La risoluzione dello strumento deve essere <= 10% della tolleranza (regola del 10) o <= 10% della variabilità di processo.'
    };
  }

  return {
    gageRRCrossed: gageRRCrossed, gageRRNested: gageRRNested, gageRRXbarR: gageRRXbarR,
    biasLinearity: biasLinearity, attributeAgreement: attributeAgreement,
    cohenKappa: cohenKappa, fleissKappa: fleissKappa, kappaVerdict: kappaVerdict,
    resolutionCheck: resolutionCheck, rrVerdict: rrVerdict, runChartData: runChartData
  };
});
