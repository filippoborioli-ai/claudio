/* CLAUDIO v3 - ui/views/dashboard-view.js
 * Cruscotto: riquadri salvati dal costruttore di grafici, filtri globali
 * (slicer) applicati a tutti i riquadri, riquadri KPI automatici.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3;
  var ui = C3.ui, h = ui.h, num = C3.numeric, st = C3.stats;

  var globalFilters = {};

  C3.app.registerView({
    id: 'cruscotto',
    label: 'Cruscotto',
    icon: '▣',
    group: 'Visualizzazione',
    desc: 'Riquadri salvati dal costruttore di grafici. I filtri in alto valgono per tutti i riquadri costruiti sul dataset attivo.',
    render: function (el) {
      var ds = C3.app.ds();
      if (!ds) { el.appendChild(ui.empty('Nessun dataset', 'Carica dei dati.')); return; }
      var tiles = C3.app.state.dashboards;

      // barra dei filtri
      var bar = h('div', { class: 'slicer-bar' });
      var catCols = ds.categoricalColumns().slice(0, 8);
      catCols.forEach(function (c) {
        var levels = ds.levels(c);
        if (levels.length > 60) return;
        var sel = h('select', {
          multiple: true, size: Math.min(3, levels.length),
          onchange: function () {
            var chosen = Array.prototype.filter.call(sel.options, function (o) { return o.selected; })
              .map(function (o) { return o.value; });
            globalFilters[c] = chosen.length ? chosen : null;
            C3.app.refresh();
          }
        }, levels.map(function (L) {
          return h('option', {
            value: L,
            selected: globalFilters[c] && globalFilters[c].indexOf(L) >= 0 ? true : null
          }, L);
        }));
        bar.appendChild(h('div', { class: 'slicer' }, [h('span', { class: 'lab', text: c }), sel]));
      });
      bar.appendChild(h('div', { style: { flex: 1 } }));
      bar.appendChild(h('button', {
        class: 'sm', onclick: function () { globalFilters = {}; C3.app.refresh(); }
      }, 'Azzera filtri'));
      bar.appendChild(h('button', {
        class: 'sm', onclick: function () { C3.app.navigate('esplora'); }
      }, '+ Nuovo riquadro'));
      bar.appendChild(h('button', {
        class: 'sm', onclick: function () { addKpiRow(ds); }
      }, '+ Riga di KPI'));
      bar.appendChild(h('button', {
        class: 'sm', onclick: function () { window.print(); }
      }, 'Stampa / PDF'));
      if (catCols.length) el.appendChild(bar);

      var idx = filteredIndices(ds);
      el.appendChild(h('div', { class: 'small muted mb', text: idx.length + ' righe su ' + ds.nrows + ' dopo i filtri' }));

      if (!tiles.length) {
        el.appendChild(ui.empty('Cruscotto vuoto',
          'Vai in <b>Grafici interattivi</b>, costruisci un grafico e premi <b>Aggiungi al cruscotto</b>.',
          h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '10px' } }, [
            h('button', { class: 'primary', onclick: function () { C3.app.navigate('esplora'); } }, 'Costruisci un grafico'),
            h('button', { onclick: function () { autoDashboard(ds); } }, 'Crea cruscotto automatico')
          ])));
        return;
      }

      var grid = h('div', { class: 'dash-grid' });
      el.appendChild(grid);

      tiles.forEach(function (tile, i) {
        var tileDs = C3.app.state.datasets[tile.dataset] || ds;
        var tileEl = h('div', { class: 'dash-tile w' + (tile.width || 6) });
        var tools = h('div', { class: 'tile-tools' }, [
          h('button', {
            class: 'sm ghost', title: 'Larghezza', onclick: function () {
              var order = [3, 4, 6, 8, 12];
              var cur = order.indexOf(tile.width || 6);
              tile.width = order[(cur + 1) % order.length];
              C3.app.save();
              C3.app.refresh();
            }
          }, '↔'),
          h('button', {
            class: 'sm ghost', title: 'Elimina riquadro', onclick: function () {
              C3.app.state.dashboards.splice(i, 1);
              C3.app.save();
              C3.app.refresh();
            }
          }, '✕')
        ]);
        tileEl.appendChild(tools);
        var host = h('div');
        tileEl.appendChild(host);
        grid.appendChild(tileEl);
        var useIdx = tile.dataset === C3.app.state.active ? idx
          : Array.from({ length: tileDs.nrows }, function (_, k) { return k; });
        try {
          C3.explore.renderChart(host, tileDs, tile.spec, useIdx);
        } catch (e) {
          host.appendChild(ui.verdict('Riquadro non disegnabile: ' + e.message, 'bad'));
        }
      });
    }
  });

  function filteredIndices(ds) {
    var idx = [];
    for (var i = 0; i < ds.nrows; i++) {
      var ok = true;
      Object.keys(globalFilters).forEach(function (k) {
        if (!ok || !globalFilters[k]) return;
        var col = ds.column(k);
        if (!col) return;
        var val = col.values[i];
        var s = val === null || val === undefined || val === '' ? '(vuoto)' : String(val);
        if (globalFilters[k].indexOf(s) < 0) ok = false;
      });
      if (ok) idx.push(i);
    }
    return idx;
  }

  function addKpiRow(ds) {
    var numCols = ds.numericColumns().slice(0, 4);
    numCols.forEach(function (c) {
      C3.app.state.dashboards.push({
        id: 'kpi' + Date.now() + c, dataset: C3.app.state.active, width: 3,
        spec: { type: 'kpi', y: c, agg: 'mean', title: 'Media ' + c }
      });
    });
    C3.app.save();
    C3.app.refresh();
  }

  /** Cruscotto automatico: KPI + distribuzioni + confronti. */
  function autoDashboard(ds) {
    var numCols = ds.numericColumns();
    var catCols = ds.categoricalColumns();
    var tiles = [];
    numCols.slice(0, 4).forEach(function (c) {
      tiles.push({
        id: 'a' + c, dataset: C3.app.state.active, width: 3,
        spec: { type: 'kpi', y: c, agg: 'mean', title: 'Media ' + c }
      });
    });
    if (numCols[0]) {
      tiles.push({
        id: 'h' + numCols[0], dataset: C3.app.state.active, width: 6,
        spec: { type: 'hist', y: numCols[0], agg: 'mean' }
      });
    }
    if (catCols[0] && numCols[0]) {
      tiles.push({
        id: 'b1', dataset: C3.app.state.active, width: 6,
        spec: { type: 'bar', x: catCols[0], y: numCols[0], agg: 'mean', sort: 'desc', top: 12 }
      });
      tiles.push({
        id: 'bx1', dataset: C3.app.state.active, width: 6,
        spec: { type: 'box', x: catCols[0], y: numCols[0] }
      });
    }
    if (numCols.length >= 2) {
      tiles.push({
        id: 's1', dataset: C3.app.state.active, width: 6,
        spec: { type: 'scatter', x: numCols[0], y: numCols[1] }
      });
    }
    if (catCols[0]) {
      tiles.push({
        id: 'p1', dataset: C3.app.state.active, width: 4,
        spec: { type: 'pie', cat: catCols[0], agg: 'count', top: 8 }
      });
    }
    C3.app.state.dashboards = C3.app.state.dashboards.concat(tiles);
    C3.app.save();
    C3.app.refresh();
    C3.app.toast('Cruscotto automatico creato: ' + tiles.length + ' riquadri', 'success');
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
