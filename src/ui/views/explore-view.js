/* CLAUDIO v3 - ui/views/explore-view.js
 * Costruttore di grafici interattivo in stile business intelligence:
 * si scelgono asse, misura, aggregazione, serie e filtri; il grafico si
 * aggiorna subito e puo essere salvato come riquadro del cruscotto.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3;
  var ui = C3.ui, h = ui.h, num = C3.numeric, st = C3.stats;

  var CHART_TYPES = [
    { value: 'bar', label: 'Barre verticali' },
    { value: 'barh', label: 'Barre orizzontali' },
    { value: 'line', label: 'Linee' },
    { value: 'area', label: 'Area' },
    { value: 'scatter', label: 'Dispersione (X-Y)' },
    { value: 'box', label: 'Boxplot per gruppo' },
    { value: 'hist', label: 'Istogramma' },
    { value: 'pie', label: 'Torta' },
    { value: 'donut', label: 'Ciambella' },
    { value: 'pareto', label: 'Pareto' },
    { value: 'heat', label: 'Mappa di calore' },
    { value: 'kpi', label: 'Indicatore (KPI)' },
    { value: 'table', label: 'Tabella' }
  ];

  var AGGS = [
    { value: 'sum', label: 'Somma' }, { value: 'mean', label: 'Media' },
    { value: 'count', label: 'Conteggio righe' }, { value: 'median', label: 'Mediana' },
    { value: 'min', label: 'Minimo' }, { value: 'max', label: 'Massimo' },
    { value: 'sd', label: 'Deviazione standard' }, { value: 'cv', label: 'CV%' },
    { value: 'distinct', label: 'Valori distinti' }, { value: 'p25', label: 'Primo quartile' },
    { value: 'p75', label: 'Terzo quartile' }, { value: 'range', label: 'Range' }
  ];

  C3.app.registerView({
    id: 'esplora',
    label: 'Grafici interattivi',
    icon: '◨',
    group: 'Visualizzazione',
    desc: 'Costruisci un grafico scegliendo asse, misura e aggregazione, come in un cruscotto di business intelligence. Puoi filtrare i dati e salvare il risultato nel cruscotto.',
    render: function (el) {
      var ds = C3.app.ds();
      if (!ds) { el.appendChild(ui.empty('Nessun dataset', 'Carica dei dati per costruire un grafico.')); return; }
      renderBuilder(el, ds);
    }
  });

  function renderBuilder(el, ds) {
    var numCols = ds.numericColumns();
    var allCols = ds.names;
    var catCols = ds.categoricalColumns();

    var split = h('div', { class: 'split' });
    var left = h('div', { class: 'panel options-panel' });
    var right = h('div');
    split.appendChild(left);
    split.appendChild(right);
    el.appendChild(split);

    var filterState = {};

    var f = ui.form([
      { id: 'type', type: 'select', label: 'Tipo di grafico', options: CHART_TYPES },
      {
        id: 'x', type: 'select', label: 'Asse X / categoria',
        options: [{ value: '', label: '(nessuno)' }].concat(allCols),
        value: catCols[0] || allCols[0],
        when: function (v) { return ['pie', 'donut', 'kpi'].indexOf(v.type) < 0; }
      },
      {
        id: 'y', type: 'select', label: 'Misura (Y)',
        options: [{ value: '', label: '(conteggio righe)' }].concat(numCols),
        value: numCols[0] || ''
      },
      {
        id: 'agg', type: 'select', label: 'Aggregazione', options: AGGS, value: 'mean',
        when: function (v) { return ['scatter', 'hist', 'box'].indexOf(v.type) < 0; }
      },
      {
        id: 'series', type: 'select', label: 'Serie / colore',
        options: [{ value: '', label: '(nessuna)' }].concat(catCols),
        when: function (v) { return ['bar', 'barh', 'line', 'area', 'scatter', 'heat'].indexOf(v.type) >= 0; }
      },
      {
        id: 'cat', type: 'select', label: 'Categoria', options: catCols,
        when: function (v) { return ['pie', 'donut', 'pareto'].indexOf(v.type) >= 0; }
      },
      {
        id: 'sort', type: 'select', label: 'Ordinamento', options: [
          { value: 'none', label: 'Per categoria' },
          { value: 'desc', label: 'Valore decrescente' },
          { value: 'asc', label: 'Valore crescente' }
        ], value: 'none',
        when: function (v) { return ['bar', 'barh', 'pie', 'donut'].indexOf(v.type) >= 0; }
      },
      {
        id: 'top', type: 'number', label: 'Mostra solo le prime N categorie', value: 20, min: 2,
        when: function (v) { return ['bar', 'barh', 'pie', 'donut', 'pareto'].indexOf(v.type) >= 0; }
      },
      { id: 'labels', type: 'checkbox', label: 'Etichette con i valori', value: false },
      { id: 'title', type: 'text', label: 'Titolo del grafico', value: '' }
    ], function () { update(); });

    left.appendChild(h('h3', null, 'Costruzione'));
    left.appendChild(f.el);

    // filtri
    left.appendChild(h('h3', { style: { marginTop: '14px' } }, 'Filtri'));
    var filterHost = h('div');
    left.appendChild(filterHost);
    buildFilters();

    left.appendChild(h('div', { class: 'row mt' }, [
      h('button', {
        class: 'primary', onclick: function () {
          var spec = currentSpec();
          C3.app.state.dashboards.push({
            id: 'tile' + Date.now(), dataset: C3.app.state.active,
            spec: spec, width: 6
          });
          C3.app.save();
          C3.app.toast('Riquadro aggiunto al cruscotto', 'success');
        }
      }, 'Aggiungi al cruscotto'),
      h('button', {
        onclick: function () { C3.app.navigate('cruscotto'); }
      }, 'Apri cruscotto')
    ]));

    var chartHost = h('div', { class: 'panel' });
    var dataHost = h('div');
    right.appendChild(chartHost);
    right.appendChild(dataHost);

    function buildFilters() {
      ui.clear(filterHost);
      catCols.slice(0, 6).forEach(function (c) {
        var levels = ds.levels(c);
        if (levels.length > 40) return;
        var sel = h('select', {
          multiple: true, size: Math.min(4, levels.length),
          onchange: function () {
            var chosen = Array.prototype.filter.call(sel.options, function (o) { return o.selected; })
              .map(function (o) { return o.value; });
            filterState[c] = chosen.length ? chosen : null;
            update();
          }
        }, levels.map(function (L) { return h('option', { value: L }, L); }));
        filterHost.appendChild(h('label', { class: 'field' }, [
          h('span', { class: 'lab', text: c }), sel
        ]));
      });
      numCols.slice(0, 4).forEach(function (c) {
        var vals = st.clean(ds.numeric(c));
        if (!vals.length) return;
        var lo = st.min(vals), hi = st.max(vals);
        var inMin = h('input', { type: 'number', step: 'any', placeholder: num.fmt(lo, 3) });
        var inMax = h('input', { type: 'number', step: 'any', placeholder: num.fmt(hi, 3) });
        function onch() {
          var a = inMin.value === '' ? null : Number(inMin.value);
          var b = inMax.value === '' ? null : Number(inMax.value);
          filterState['#' + c] = (a == null && b == null) ? null : { min: a, max: b };
          update();
        }
        inMin.addEventListener('change', onch);
        inMax.addEventListener('change', onch);
        filterHost.appendChild(h('label', { class: 'field' }, [
          h('span', { class: 'lab', text: c + ' (intervallo)' }),
          h('div', { class: 'row tight' }, [inMin, inMax])
        ]));
      });
    }

    function filteredIndices() {
      var idx = [];
      for (var i = 0; i < ds.nrows; i++) {
        var ok = true;
        Object.keys(filterState).forEach(function (k) {
          if (!ok || !filterState[k]) return;
          if (k[0] === '#') {
            var colName = k.slice(1);
            var v = C3.data.toNumber(ds.column(colName).values[i]);
            var r = filterState[k];
            if (!isFinite(v)) { ok = false; return; }
            if (r.min != null && v < r.min) ok = false;
            if (r.max != null && v > r.max) ok = false;
          } else {
            var val = ds.column(k).values[i];
            var s = val === null || val === undefined || val === '' ? '(vuoto)' : String(val);
            if (filterState[k].indexOf(s) < 0) ok = false;
          }
        });
        if (ok) idx.push(i);
      }
      return idx;
    }

    function currentSpec() {
      var v = f.values();
      return {
        type: v.type, x: v.x, y: v.y, agg: v.agg, series: v.series, cat: v.cat,
        sort: v.sort, top: v.top, labels: v.labels, title: v.title,
        filters: JSON.parse(JSON.stringify(filterState))
      };
    }

    function update() {
      ui.clear(chartHost);
      ui.clear(dataHost);
      var spec = currentSpec();
      var idx = filteredIndices();
      if (!idx.length) {
        chartHost.appendChild(ui.empty('Nessuna riga', 'I filtri selezionati non lasciano dati.'));
        return;
      }
      chartHost.appendChild(h('div', { class: 'small muted mb', text: idx.length + ' righe su ' + ds.nrows + ' dopo i filtri' }));
      var box = h('div');
      chartHost.appendChild(box);
      try {
        var result = C3.explore.renderChart(box, ds, spec, idx);
        if (result && result.rows && result.columns) {
          dataHost.appendChild(ui.panel('Dati del grafico', { sub: 'valori aggregati' }, [
            ui.table(result.columns, result.rows),
            ui.exportBar(function () { return spec.title || 'dati-grafico'; },
              function () { return ui.rowsToCSV(result.columns, result.rows); })
          ]));
        }
      } catch (e) {
        chartHost.appendChild(ui.verdict(e.message, 'warn'));
      }
    }

    update();
  }

  /* ===================== RENDER DI UNA SPECIFICA ===================== */
  /** Disegna un grafico dalla specifica del costruttore. Usato anche dal cruscotto. */
  function renderChart(container, ds, spec, idx) {
    idx = idx || Array.from({ length: ds.nrows }, function (_, i) { return i; });
    var title = spec.title || autoTitle(spec);
    var type = spec.type;

    function sub(colName) {
      var c = ds.column(colName);
      if (!c) return [];
      return idx.map(function (i) { return c.values[i]; });
    }
    function subNum(colName) {
      var c = ds.column(colName);
      if (!c) return [];
      return idx.map(function (i) { return C3.data.toNumber(c.values[i]); });
    }

    if (type === 'kpi') {
      var vals = spec.y ? st.clean(subNum(spec.y)) : [];
      var value = spec.y ? applyAgg(vals, spec.agg) : idx.length;
      C3.plots.kpiTile(container, {
        label: title,
        value: num.fmt(value, 3),
        sub: (spec.y ? C3.data.aggLabel(spec.agg) + ' di ' + spec.y : 'righe') + ' su ' + idx.length + ' righe',
        spark: spec.y ? vals.slice(-40) : null
      });
      return null;
    }

    if (type === 'hist') {
      if (!spec.y) throw new Error('Scegli una misura numerica.');
      C3.plots.histogram(container, subNum(spec.y), { name: spec.y, title: title });
      return null;
    }

    if (type === 'scatter') {
      if (!spec.x || !spec.y) throw new Error('Servono due colonne numeriche (X e Y).');
      if (spec.series) {
        var groups = {};
        var gcol = sub(spec.series);
        var xv = subNum(spec.x), yv = subNum(spec.y);
        gcol.forEach(function (g, i) {
          var k = g == null ? '(vuoto)' : String(g);
          (groups[k] = groups[k] || { x: [], y: [] });
          groups[k].x.push(xv[i]);
          groups[k].y.push(yv[i]);
        });
        var names = Object.keys(groups).slice(0, 8);
        C3.chart.render(container, {
          title: title, height: 340,
          x: { label: spec.x, gridlines: true }, y: { label: spec.y },
          series: names.map(function (n, i) {
            return {
              type: 'points', name: n, color: C3.chart.seriesColor(i), markerSize: 4,
              points: groups[n].x.map(function (x, k) {
                return isFinite(x) && isFinite(groups[n].y[k]) ? { x: x, y: groups[n].y[k], label: n } : null;
              }).filter(Boolean)
            };
          })
        });
      } else {
        C3.plots.scatter(container, subNum(spec.x), subNum(spec.y), {
          xName: spec.x, yName: spec.y, title: title, fit: true, showCI: true
        });
      }
      return null;
    }

    if (type === 'box') {
      if (!spec.y) throw new Error('Scegli una misura numerica.');
      var groups2 = spec.x ? st.groupBy(subNum(spec.y), sub(spec.x))
        : [{ level: spec.y, values: st.clean(subNum(spec.y)) }];
      C3.plots.boxplot(container, groups2, {
        title: title, yLabel: spec.y, xLabel: spec.x, showPoints: groups2.length <= 8
      });
      return null;
    }

    if (type === 'pareto') {
      var catCol = spec.cat || spec.x;
      if (!catCol) throw new Error('Scegli una categoria.');
      var weights = spec.y ? subNum(spec.y) : null;
      var p = C3.sixsigma.paretoFromColumn(sub(catCol), weights, { maxCategories: spec.top || 12 });
      C3.plots.paretoChart(container, p, { title: title, yLabel: spec.y || 'Conteggio' });
      return {
        columns: [
          { key: 'label', label: catCol },
          { key: 'value', label: spec.y ? C3.data.aggLabel('sum') + ' ' + spec.y : 'Conteggio', digits: 3 },
          { key: 'pct', label: '%', digits: 2 },
          { key: 'cumPct', label: '% cumulata', digits: 2 }
        ], rows: p.rows
      };
    }

    if (type === 'pie' || type === 'donut') {
      var cc = spec.cat || spec.x;
      if (!cc) throw new Error('Scegli una categoria.');
      var agg = aggregateBy(ds, idx, [cc], spec.y, spec.agg);
      var rows = agg.rows;
      if (spec.sort === 'desc') rows.sort(function (a, b) { return b.value - a.value; });
      if (spec.sort === 'asc') rows.sort(function (a, b) { return a.value - b.value; });
      if (spec.top && rows.length > spec.top) {
        var head = rows.slice(0, spec.top - 1);
        var rest = rows.slice(spec.top - 1);
        head.push({ label: 'Altro (' + rest.length + ')', value: rest.reduce(function (a, r) { return a + r.value; }, 0) });
        rows = head;
      }
      C3.chart.renderPie(container, {
        title: title, donut: type === 'donut',
        data: rows.map(function (r) { return { label: r.label, value: r.value }; }),
        centerLabel: type === 'donut' ? num.fmt(rows.reduce(function (a, r) { return a + r.value; }, 0), 2) : null
      });
      return {
        columns: [{ key: 'label', label: cc }, { key: 'value', label: 'Valore', digits: 3 }],
        rows: rows
      };
    }

    if (type === 'heat') {
      if (!spec.x) throw new Error('La mappa di calore richiede una colonna sull asse X.');
      if (!spec.series) {
        // sceglie automaticamente una seconda dimensione categorica diversa dalla prima
        var alt = ds.categoricalColumns().filter(function (c) { return c !== spec.x; })[0];
        if (!alt) throw new Error('La mappa di calore richiede due colonne categoriche: nel dataset ce n e una sola.');
        spec = Object.assign({}, spec, { series: alt });
      }
      var xs = ds.levels(spec.x), ys = ds.levels(spec.series);
      var cells = [];
      var lookup = {};
      var agg2 = aggregateBy(ds, idx, [spec.x, spec.series], spec.y, spec.agg);
      agg2.rows.forEach(function (r) { lookup[r.keys[0] + '' + r.keys[1]] = r.value; });
      ys.forEach(function (yv, yi) {
        xs.forEach(function (xv, xi) {
          var v = lookup[xv + '' + yv];
          if (v == null) return;
          cells.push({ x: xi, y: ys.length - 1 - yi, value: v, xLabel: xv, yLabel: yv, text: num.fmt(v, 2) });
        });
      });
      var height = Math.max(240, 60 + ys.length * 34);
      C3.chart.render(container, {
        title: title, height: height,
        margin: { left: 110, bottom: 70, top: 8, right: 16 },
        x: { type: 'band', categories: xs, rotate: -30 },
        y: {
          domain: [-0.5, ys.length - 0.5], ticks: ys.length, gridlines: false,
          format: function (v) { return ys[ys.length - 1 - Math.round(v)] || ''; }
        },
        series: [{
          type: 'heat', cells: cells, cellLabels: ys.length * xs.length <= 120,
          cellHeight: (height - 80) / Math.max(1, ys.length), name: spec.y || 'conteggio'
        }],
        legend: false
      });
      var vmin = Math.min.apply(null, cells.map(function (c) { return c.value; }));
      var vmax = Math.max.apply(null, cells.map(function (c) { return c.value; }));
      C3.chart.colorScaleBar(container, vmin, vmax, { label: (spec.y || 'conteggio') });
      return null;
    }

    if (type === 'table') {
      var byCols = [spec.x, spec.series].filter(Boolean);
      var aggT = aggregateBy(ds, idx, byCols, spec.y, spec.agg);
      var cols = byCols.map(function (b, i) {
        return { key: function (r) { return r.keys[i]; }, label: b };
      }).concat([{ key: 'value', label: C3.data.aggLabel(spec.agg) + (spec.y ? ' ' + spec.y : ''), digits: 4 },
      { key: 'n', label: 'n', digits: 0 }]);
      container.appendChild(h('div', { class: 'c3-chart-title', text: title }));
      container.appendChild(ui.table(cols, aggT.rows));
      return { columns: cols, rows: aggT.rows };
    }

    // bar / barh / line / area
    var byCols2 = [spec.x].filter(Boolean);
    if (spec.series) byCols2.push(spec.series);
    if (!byCols2.length) throw new Error('Scegli una colonna per l asse X.');
    var aggr = aggregateBy(ds, idx, byCols2, spec.y, spec.agg);
    var xLevels = uniqueKeys(aggr.rows, 0);
    var sLevels = spec.series ? uniqueKeys(aggr.rows, 1) : [null];
    // ordinamento
    if (spec.sort === 'desc' || spec.sort === 'asc') {
      var totals = {};
      aggr.rows.forEach(function (r) { totals[r.keys[0]] = (totals[r.keys[0]] || 0) + (r.value || 0); });
      xLevels.sort(function (a, b) {
        return spec.sort === 'desc' ? (totals[b] - totals[a]) : (totals[a] - totals[b]);
      });
    }
    if (spec.top && xLevels.length > spec.top) xLevels = xLevels.slice(0, spec.top);

    var lookup2 = {};
    aggr.rows.forEach(function (r) { lookup2[r.keys.join('')] = r; });

    var seriesList = sLevels.map(function (sl, si) {
      var points = xLevels.map(function (xl, xi) {
        var key = spec.series ? (xl + '' + sl) : xl;
        var row = lookup2[key];
        return { x: xi, y: row ? row.value : null, label: xl + (sl ? ' / ' + sl : ''), n: row ? row.n : 0 };
      }).filter(function (p) { return p.y != null; });
      return {
        type: type === 'barh' ? 'bars' : (type === 'area' ? 'area' : (type === 'line' ? 'line' : 'bars')),
        name: sl || (C3.data.aggLabel(spec.agg) + (spec.y ? ' ' + spec.y : '')),
        points: points, color: C3.chart.seriesColor(si),
        groupCount: (type === 'bar' || type === 'barh') ? sLevels.length : 1,
        groupIndex: si,
        orientation: type === 'barh' ? 'h' : null,
        valueLabels: spec.labels,
        markerSize: 3.6,
        hideFromLegend: sLevels.length === 1
      };
    });

    var chartSpec = {
      title: title, height: spec.height || 330,
      series: seriesList
    };
    if (type === 'barh') {
      chartSpec.margin = { left: 130, right: 46, top: 10, bottom: 40 };
      chartSpec.x = { label: C3.data.aggLabel(spec.agg) + (spec.y ? ' ' + spec.y : ''), includeZero: true, gridlines: true };
      chartSpec.y = {
        domain: [-0.6, xLevels.length - 0.4], ticks: xLevels.length, gridlines: false,
        format: function (v) { return xLevels[Math.round(v)] || ''; }
      };
      seriesList.forEach(function (s) { s.barWidth = Math.max(8, 240 / Math.max(4, xLevels.length)); });
    } else {
      chartSpec.x = { type: 'band', categories: xLevels, label: spec.x, rotate: xLevels.length > 8 ? -30 : 0 };
      chartSpec.y = { label: C3.data.aggLabel(spec.agg) + (spec.y ? ' ' + spec.y : ''), includeZero: type !== 'line' };
    }
    C3.chart.render(container, chartSpec);

    var columns = [{ key: function (r) { return r.keys[0]; }, label: spec.x }];
    if (spec.series) columns.push({ key: function (r) { return r.keys[1]; }, label: spec.series });
    columns.push({ key: 'value', label: C3.data.aggLabel(spec.agg) + (spec.y ? ' ' + spec.y : ''), digits: 4 });
    columns.push({ key: 'n', label: 'n', digits: 0 });
    return { columns: columns, rows: aggr.rows };
  }

  function uniqueKeys(rows, pos) {
    var seen = {}, out = [];
    rows.forEach(function (r) {
      var k = r.keys[pos];
      if (k === undefined) return;
      if (!seen[k]) { seen[k] = 1; out.push(k); }
    });
    out.sort(function (a, b) {
      var na = parseFloat(a), nb = parseFloat(b);
      if (isFinite(na) && isFinite(nb)) return na - nb;
      return a < b ? -1 : (a > b ? 1 : 0);
    });
    return out;
  }

  function applyAgg(vals, agg) {
    if (!vals.length) return null;
    switch (agg) {
      case 'sum': return st.sum(vals);
      case 'mean': return st.mean(vals);
      case 'median': return st.median(vals);
      case 'min': return st.min(vals);
      case 'max': return st.max(vals);
      case 'sd': return st.sd(vals);
      case 'cv': return st.cv(vals);
      case 'range': return st.range(vals);
      case 'p25': return st.q1(vals);
      case 'p75': return st.q3(vals);
      case 'count': return vals.length;
      default: return st.mean(vals);
    }
  }

  /** Aggrega per una o due dimensioni sulle righe indicate. */
  function aggregateBy(ds, idx, byCols, measure, agg) {
    var groups = {}, order = [];
    idx.forEach(function (i) {
      var keys = byCols.map(function (b) {
        var v = ds.column(b).values[i];
        return v === null || v === undefined || v === '' ? '(vuoto)' : String(v);
      });
      var key = keys.join('');
      if (!groups[key]) { groups[key] = { keys: keys, vals: [], n: 0 }; order.push(key); }
      groups[key].n++;
      if (measure) {
        var mv = C3.data.toNumber(ds.column(measure).values[i]);
        if (isFinite(mv)) groups[key].vals.push(mv);
      }
    });
    var rows = order.map(function (k) {
      var g = groups[k];
      var value;
      if (!measure || agg === 'count') value = g.n;
      else if (agg === 'distinct') {
        var seen = {};
        g.vals.forEach(function (v) { seen[v] = 1; });
        value = Object.keys(seen).length;
      } else value = applyAgg(g.vals, agg);
      return { keys: g.keys, label: g.keys.join(' / '), value: value, n: g.n };
    });
    return { rows: rows, byCols: byCols };
  }

  function autoTitle(spec) {
    var aggLab = C3.data.aggLabel(spec.agg);
    if (spec.type === 'hist') return 'Distribuzione di ' + spec.y;
    if (spec.type === 'scatter') return spec.y + ' in funzione di ' + spec.x;
    if (spec.type === 'box') return spec.y + (spec.x ? ' per ' + spec.x : '');
    if (spec.type === 'pareto') return 'Pareto di ' + (spec.cat || spec.x);
    if (spec.type === 'kpi') return (spec.y ? aggLab + ' di ' + spec.y : 'Numero di righe');
    return (spec.y ? aggLab + ' di ' + spec.y : 'Conteggio') + (spec.x ? ' per ' + spec.x : '');
  }

  C3.explore = { renderChart: renderChart, aggregateBy: aggregateBy, CHART_TYPES: CHART_TYPES, AGGS: AGGS, autoTitle: autoTitle };
})(typeof globalThis !== 'undefined' ? globalThis : this);
