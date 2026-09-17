/* CLAUDIO v3 - ui/views/data-view.js
 * Vista dati: griglia editabile, gestione colonne, colonne calcolate,
 * trasformazioni, filtri, riepilogo delle variabili.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3;
  var ui = C3.ui, h = ui.h, num = C3.numeric;

  C3.app.registerView({
    id: 'dati',
    label: 'Dati',
    icon: '▦',
    group: 'Dati',
    desc: 'Carica, digita o incolla i dati. Le colonne calcolate si aggiornano automaticamente; ogni analisi legge il dataset attivo.',
    render: function (el) {
      var ds = C3.app.ds();
      if (!ds) {
        el.appendChild(ui.empty('Nessun dataset',
          'Importa un file, incolla dati da Excel o carica un dataset di esempio.',
          h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '10px' } }, [
            h('button', { class: 'primary', onclick: C3.app.openImport }, 'Importa dati'),
            h('button', { onclick: C3.app.openSamples }, 'Dataset di esempio')
          ])));
        return;
      }

      var tabs = ui.tabs([
        { id: 'griglia', label: 'Griglia', render: function (b) { renderGrid(b, ds); } },
        { id: 'colonne', label: 'Colonne e formule', render: function (b) { renderColumns(b, ds); } },
        { id: 'trasforma', label: 'Trasforma e filtra', render: function (b) { renderTransform(b, ds); } },
        { id: 'riepilogo', label: 'Riepilogo variabili', render: function (b) { renderSummary(b, ds); } }
      ]);
      el.appendChild(tabs.el);
    }
  });

  /* ===================== GRIGLIA ===================== */
  function renderGrid(el, ds) {
    var PAGE = 200;
    var shown = { count: Math.min(PAGE, ds.nrows) };

    var toolbar = h('div', { class: 'row mb' }, [
      h('span', { class: 'small muted', text: ds.nrows + ' righe x ' + ds.columns.length + ' colonne' }),
      h('span', { class: 'spacer', style: { flex: 1 } }),
      h('button', {
        class: 'sm', onclick: function () {
          ds.addRows(10);
          C3.app.save();
          C3.app.refresh();
        }
      }, '+ 10 righe'),
      h('button', {
        class: 'sm', onclick: function () {
          var name = prompt('Nome della nuova colonna:', 'C' + (ds.columns.length + 1));
          if (!name) return;
          ds.addColumn(name, new Array(ds.nrows).fill(null), 'num');
          C3.app.save();
          C3.app.refresh();
        }
      }, '+ colonna'),
      h('button', {
        class: 'sm', onclick: function () {
          var name = prompt('Nome del dataset:', ds.name);
          if (name) { ds.name = name; C3.app.renderTopbar(); C3.app.save(); C3.app.refresh(); }
        }
      }, 'Rinomina foglio'),
      h('button', {
        class: 'sm', onclick: function () {
          C3.app.addDataset(ds.clone());
          C3.app.refresh();
        }
      }, 'Duplica foglio'),
      h('button', {
        class: 'sm danger', onclick: function () {
          if (!confirm('Eliminare il dataset "' + ds.name + '"?')) return;
          C3.app.removeDataset(C3.app.state.active);
        }
      }, 'Elimina foglio')
    ]);
    el.appendChild(toolbar);

    var wrap = h('div', { class: 'table-wrap', style: { maxHeight: '62vh' } });
    var table = h('table', { class: 'grid-table' });
    wrap.appendChild(table);
    el.appendChild(wrap);

    function build() {
      ui.clear(table);
      var thead = h('thead');
      var hr = h('tr', null, [h('th', { class: 'rowhead', text: '#' })].concat(
        ds.columns.map(function (c) {
          return h('th', null, [
            h('div', {
              style: { cursor: 'pointer' },
              title: 'Clicca per ordinare',
              onclick: function () {
                ds.sortBy(c.name, table.__desc !== c.name);
                table.__desc = table.__desc === c.name ? null : c.name;
                build();
              }
            }, [
              h('span', { text: c.name }),
              h('span', { class: 'coltype', text: ' ' + (c.type === 'num' ? '#' : (c.type === 'date' ? 'data' : 'abc')) })
            ]),
            c.formula ? h('div', { class: 'coltype mono', text: '= ' + c.formula }) : null,
            c.error ? h('div', { class: 'coltype', style: { color: 'var(--critical)' }, text: c.error }) : null
          ]);
        })));
      thead.appendChild(hr);
      table.appendChild(thead);

      var tbody = h('tbody');
      var limit = Math.min(shown.count, ds.nrows);
      for (var i = 0; i < limit; i++) {
        var tr = h('tr', null, [h('td', { class: 'rowhead', text: String(i + 1) })]);
        ds.columns.forEach(function (c) {
          var rowIndex = i;
          var td = h('td', { class: c.formula ? 'formula' : null });
          var inp = h('input', {
            value: c.values[rowIndex] == null ? '' : c.values[rowIndex],
            readonly: c.formula ? true : null
          });
          inp.addEventListener('change', function () {
            var v = inp.value;
            var parsed = c.type === 'num' ? (v === '' ? null : C3.data.toNumber(v)) : (v === '' ? null : v);
            ds.setCell(c.name, rowIndex, parsed);
            C3.app.save();
          });
          inp.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { inp.blur(); }
          });
          td.appendChild(inp);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);
    }
    build();

    if (ds.nrows > PAGE) {
      el.appendChild(h('div', { class: 'row mt' }, [
        h('span', { class: 'small muted', text: 'Mostrate ' + Math.min(shown.count, ds.nrows) + ' di ' + ds.nrows + ' righe' }),
        h('button', {
          class: 'sm', onclick: function () {
            shown.count = Math.min(ds.nrows, shown.count + 500);
            build();
          }
        }, 'Mostra altre 500')
      ]));
    }
  }

  /* ===================== COLONNE E FORMULE ===================== */
  function renderColumns(el, ds) {
    var split = h('div', { class: 'split' });
    var left = h('div', { class: 'panel options-panel' });
    var right = h('div');
    split.appendChild(left);
    split.appendChild(right);
    el.appendChild(split);

    // editor di formula
    left.appendChild(h('h3', null, 'Nuova colonna calcolata'));
    var f = ui.form([
      { id: 'name', type: 'text', label: 'Nome colonna', value: 'Calcolata' },
      {
        id: 'formula', type: 'textarea', label: 'Formula', rows: 3,
        value: ds.numericColumns()[0] ? ds.numericColumns()[0] + ' * 2' : '',
        hint: 'Esempi: Volume - 500 | ZSCORE(Volume) | IF(Difettosi > 5, 1, 0) | ROW()'
      }
    ]);
    left.appendChild(f.el);
    left.appendChild(h('button', {
      class: 'primary', onclick: function () {
        var v = f.values();
        try {
          var col = ds.addFormulaColumn(v.name, v.formula);
          if (col.error) throw new Error(col.error);
          C3.app.toast('Colonna "' + col.name + '" creata', 'success');
          C3.app.save();
          C3.app.refresh();
        } catch (e) {
          C3.app.toast(e.message, 'error');
        }
      }
    }, 'Crea colonna'));

    left.appendChild(h('div', { class: 'mt' }, ui.collapsible('Riferimento formule',
      h('div', { class: 'small' }, C3.data.FORMULA_HELP.map(function (x) {
        return h('div', { style: { marginBottom: '4px' } }, [
          h('code', { text: x.name }), ' ', h('span', { class: 'muted', text: x.desc })
        ]);
      })), false)));

    // elenco colonne
    var rows = ds.columns.map(function (c, i) {
      return { index: i, col: c };
    });
    right.appendChild(ui.panel('Colonne del dataset', { sub: ds.name },
      ui.table([
        { key: function (r) { return r.index + 1; }, label: '#', digits: 0 },
        { key: function (r) { return r.col.name; }, label: 'Nome' },
        {
          key: function (r) { return r.col.type; }, label: 'Tipo', html: true,
          format: function (v, r) {
            return '<span class="badge">' + (v === 'num' ? 'numerica' : (v === 'date' ? 'data' : 'categorica')) + '</span>';
          }
        },
        { key: function (r) { return r.col.formula || ''; }, label: 'Formula' },
        {
          key: function (r) { return r; }, label: 'Azioni', html: true,
          format: function () { return ''; }
        }
      ], rows, { wrap: true })));

    // pulsanti azione per colonna (costruiti a parte per avere i listener)
    var actions = h('div', { class: 'panel' }, [h('h3', null, 'Azioni sulle colonne')]);
    ds.columns.forEach(function (c) {
      actions.appendChild(h('div', { class: 'row', style: { borderBottom: '1px solid var(--grid)', padding: '5px 0' } }, [
        h('b', { text: c.name, style: { minWidth: '150px' } }),
        h('select', {
          style: { width: 'auto' },
          onchange: function (e) {
            ds.setType(c.name, e.target.value);
            C3.app.save();
            C3.app.refresh();
          }
        }, [
          h('option', { value: 'num', selected: c.type === 'num' ? true : null }, 'numerica'),
          h('option', { value: 'cat', selected: c.type === 'cat' ? true : null }, 'categorica'),
          h('option', { value: 'date', selected: c.type === 'date' ? true : null }, 'data')
        ]),
        h('button', {
          class: 'sm', onclick: function () {
            var nn = prompt('Nuovo nome per "' + c.name + '":', c.name);
            if (nn) { ds.renameColumn(c.name, nn); C3.app.save(); C3.app.refresh(); }
          }
        }, 'Rinomina'),
        c.formula ? h('button', {
          class: 'sm', onclick: function () {
            var nf = prompt('Modifica formula:', c.formula);
            if (nf) {
              c.formula = nf;
              ds.recomputeFormulas();
              C3.app.save();
              C3.app.refresh();
            }
          }
        }, 'Modifica formula') : null,
        h('button', {
          class: 'sm danger', onclick: function () {
            if (!confirm('Eliminare la colonna "' + c.name + '"?')) return;
            ds.removeColumn(c.name);
            C3.app.save();
            C3.app.refresh();
          }
        }, 'Elimina')
      ].filter(Boolean)));
    });
    right.appendChild(actions);
  }

  /* ===================== TRASFORMAZIONI ===================== */
  function renderTransform(el, ds) {
    var numCols = ds.numericColumns(), catCols = ds.categoricalColumns();
    var grid = h('div', { class: 'grid-2' });
    el.appendChild(grid);

    // filtro
    (function () {
      var f = ui.form([
        {
          id: 'expr', type: 'textarea', label: 'Condizione', rows: 2,
          value: numCols[0] ? numCols[0] + ' > ' + 0 : '',
          hint: 'Righe mantenute quando la condizione e vera. Es: Volume > 500 && Turno == "Turno 1"'
        },
        { id: 'newSheet', type: 'checkbox', label: 'Crea un nuovo foglio (altrimenti sostituisce)', value: true }
      ]);
      var p = ui.panel('Filtra righe', { sub: 'sottoinsieme dei dati' }, [
        f.el,
        h('button', {
          class: 'primary', onclick: function () {
            var v = f.values();
            try {
              var d2 = ds.filter(v.expr, ds.name + ' filtrato');
              if (!d2.nrows) { C3.app.toast('Il filtro non ha selezionato righe', 'error'); return; }
              if (v.newSheet) C3.app.addDataset(d2);
              else {
                ds.columns = d2.columns;
                C3.app.save();
              }
              C3.app.toast('Righe selezionate: ' + d2.nrows, 'success');
              C3.app.refresh();
            } catch (e) { C3.app.toast(e.message, 'error'); }
          }
        }, 'Applica filtro')
      ]);
      grid.appendChild(p);
    })();

    // stack / unstack
    (function () {
      var f = ui.form([
        { id: 'cols', type: 'multiselect', label: 'Colonne da impilare', options: numCols, size: 5 },
        { id: 'valueName', type: 'text', label: 'Nome colonna valori', value: 'Valore' },
        { id: 'groupName', type: 'text', label: 'Nome colonna gruppo', value: 'Gruppo' }
      ]);
      var f2 = ui.form([
        { id: 'value', type: 'select', label: 'Colonna valori', options: numCols },
        { id: 'group', type: 'select', label: 'Colonna gruppo', options: catCols }
      ]);
      grid.appendChild(ui.panel('Impila / separa colonne', { sub: 'formato lungo <-> largo' }, [
        h('h4', { text: 'Impila (largo -> lungo)', class: 'small' }), f.el,
        h('button', {
          class: 'sm primary', onclick: function () {
            var v = f.values();
            if (!v.cols.length) { C3.app.toast('Seleziona almeno una colonna', 'error'); return; }
            C3.app.addDataset(ds.stack(v.cols, v.valueName, v.groupName));
            C3.app.toast('Dati impilati', 'success');
            C3.app.refresh();
          }
        }, 'Impila'),
        h('h4', { text: 'Separa (lungo -> largo)', class: 'small', style: { marginTop: '14px' } }), f2.el,
        h('button', {
          class: 'sm primary', onclick: function () {
            var v = f2.values();
            C3.app.addDataset(ds.unstack(v.value, v.group));
            C3.app.toast('Dati separati', 'success');
            C3.app.refresh();
          }
        }, 'Separa')
      ]));
    })();

    // calcoli su colonna
    (function () {
      var f = ui.form([
        { id: 'col', type: 'select', label: 'Colonna numerica', options: numCols },
        {
          id: 'op', type: 'select', label: 'Operazione', options: [
            { value: 'z', label: 'Standardizza (z-score)' },
            { value: 'binEq', label: 'Classi di ampiezza uguale' },
            { value: 'binQ', label: 'Classi per quantili' },
            { value: 'lag', label: 'Valore ritardato' },
            { value: 'diff', label: 'Differenza' },
            { value: 'boxcox', label: 'Trasformazione Box-Cox (lambda ottimale)' },
            { value: 'rank', label: 'Rango' }
          ]
        },
        { id: 'k', type: 'number', label: 'Parametro k (classi o ritardo)', value: 4, min: 1 }
      ]);
      grid.appendChild(ui.panel('Trasforma una colonna', { sub: 'crea una nuova colonna' }, [
        f.el,
        h('button', {
          class: 'primary', onclick: function () {
            var v = f.values();
            var st = C3.stats;
            try {
              if (v.op === 'z') ds.standardize(v.col);
              else if (v.op === 'binEq') ds.bin(v.col, v.k || 4, 'equal');
              else if (v.op === 'binQ') ds.bin(v.col, v.k || 4, 'quantile');
              else if (v.op === 'lag') ds.lag(v.col, v.k || 1);
              else if (v.op === 'diff') ds.diff(v.col, v.k || 1);
              else if (v.op === 'rank') {
                ds.addColumn(v.col + '_rango', st.ranks(ds.numeric(v.col)).ranks, 'num');
              } else if (v.op === 'boxcox') {
                var vals = ds.numeric(v.col);
                var lam = st.boxCoxLambda(vals);
                var tr = st.boxCox(vals.map(function (x) { return x > 0 ? x : NaN; }), lam);
                ds.addColumn(v.col + '_bc', tr.map(function (x) { return isFinite(x) ? num.round(x, 8) : null; }), 'num');
                C3.app.toast('lambda ottimale = ' + lam, 'success');
              }
              C3.app.save();
              C3.app.refresh();
            } catch (e) { C3.app.toast(e.message, 'error'); }
          }
        }, 'Applica')
      ]));
    })();

    // aggregazione
    (function () {
      var f = ui.form([
        { id: 'by', type: 'multiselect', label: 'Raggruppa per', options: ds.names, size: 4 },
        { id: 'cols', type: 'multiselect', label: 'Colonne da aggregare', options: numCols, size: 4 },
        {
          id: 'agg', type: 'select', label: 'Funzione', options: [
            { value: 'mean', label: 'Media' }, { value: 'sum', label: 'Somma' },
            { value: 'count', label: 'Conteggio' }, { value: 'median', label: 'Mediana' },
            { value: 'sd', label: 'Deviazione standard' }, { value: 'min', label: 'Minimo' },
            { value: 'max', label: 'Massimo' }, { value: 'range', label: 'Range' },
            { value: 'cv', label: 'CV%' }, { value: 'distinct', label: 'Valori distinti' }
          ]
        }
      ]);
      grid.appendChild(ui.panel('Aggrega (tabella pivot)', { sub: 'crea un nuovo foglio riassuntivo' }, [
        f.el,
        h('button', {
          class: 'primary', onclick: function () {
            var v = f.values();
            var measures = (v.cols.length ? v.cols : [null]).map(function (c) {
              return { col: c, agg: v.agg };
            });
            measures.push({ agg: 'count', as: 'n' });
            var agg = ds.aggregate({ by: v.by, measures: measures });
            var d2 = C3.data.fromRows(agg.rows.map(function (r) {
              var o = {};
              Object.keys(r).forEach(function (k) {
                if (k.indexOf('__') !== 0) o[k] = r[k];
              });
              return o;
            }), ds.name + ' aggregato');
            C3.app.addDataset(d2);
            C3.app.refresh();
          }
        }, 'Crea tabella aggregata')
      ]));
    })();

    // campionamento e pulizia
    (function () {
      var f = ui.form([
        { id: 'n', type: 'number', label: 'Numerosita del campione', value: Math.min(50, ds.nrows), min: 1 },
        { id: 'seed', type: 'number', label: 'Seme casuale', value: 1 }
      ]);
      grid.appendChild(ui.panel('Campionamento e pulizia', null, [
        f.el,
        h('div', { class: 'row' }, [
          h('button', {
            class: 'sm', onclick: function () {
              var v = f.values();
              C3.app.addDataset(ds.sample(v.n, v.seed));
              C3.app.refresh();
            }
          }, 'Estrai campione'),
          h('button', {
            class: 'sm', onclick: function () {
              var before = ds.nrows;
              var keep = [];
              for (var i = 0; i < ds.nrows; i++) {
                var allEmpty = ds.columns.every(function (c) {
                  return c.values[i] === null || c.values[i] === undefined || c.values[i] === '';
                });
                if (!allEmpty) keep.push(i);
              }
              var d2 = ds.subsetRows(keep, ds.name);
              ds.columns = d2.columns;
              C3.app.toast('Rimosse ' + (before - keep.length) + ' righe vuote', 'success');
              C3.app.save();
              C3.app.refresh();
            }
          }, 'Rimuovi righe vuote'),
          h('button', {
            class: 'sm', onclick: function () {
              var seen = {}, keep = [];
              for (var i = 0; i < ds.nrows; i++) {
                var key = ds.columns.map(function (c) { return String(c.values[i]); }).join('');
                if (seen[key]) continue;
                seen[key] = 1;
                keep.push(i);
              }
              var removed = ds.nrows - keep.length;
              var d2 = ds.subsetRows(keep, ds.name);
              ds.columns = d2.columns;
              C3.app.toast('Rimossi ' + removed + ' duplicati', 'success');
              C3.app.save();
              C3.app.refresh();
            }
          }, 'Rimuovi duplicati')
        ])
      ]));
    })();
  }

  /* ===================== RIEPILOGO ===================== */
  function renderSummary(el, ds) {
    var rows = ds.summary();
    el.appendChild(ui.panel('Riepilogo delle variabili', { sub: ds.nrows + ' righe' },
      ui.table([
        { key: 'name', label: 'Variabile' },
        {
          key: 'type', label: 'Tipo', html: true,
          format: function (v) {
            return '<span class="badge">' + (v === 'num' ? 'numerica' : (v === 'date' ? 'data' : 'categorica')) + '</span>';
          }
        },
        { key: 'n', label: 'n valide', digits: 0 },
        { key: 'missing', label: 'mancanti', digits: 0 },
        { key: 'mean', label: 'Media', digits: 4 },
        { key: 'sd', label: 'Dev.st.', digits: 4 },
        { key: 'min', label: 'Minimo', digits: 4 },
        { key: 'max', label: 'Massimo', digits: 4 },
        { key: 'levels', label: 'Livelli', digits: 0 }
      ], rows)));

    // istogrammi rapidi delle variabili numeriche
    var numCols = ds.numericColumns();
    if (numCols.length) {
      var gridEl = h('div', { class: 'c3-grid-3' });
      el.appendChild(ui.panel('Distribuzioni', { sub: 'anteprima rapida di tutte le variabili numeriche' }, gridEl));
      numCols.slice(0, 12).forEach(function (c) {
        var box = h('div', { class: 'c3-subchart' });
        gridEl.appendChild(box);
        C3.plots.histogram(box, ds.numeric(c), {
          name: c, title: c, height: 190, normalCurve: true, subtitle: null
        });
      });
    }

    var catCols = ds.categoricalColumns();
    if (catCols.length) {
      var gridEl2 = h('div', { class: 'c3-grid-3' });
      el.appendChild(ui.panel('Variabili categoriche', { sub: 'frequenze per livello' }, gridEl2));
      catCols.slice(0, 9).forEach(function (c) {
        var box = h('div', { class: 'c3-subchart' });
        gridEl2.appendChild(box);
        var freq = C3.stats.frequency(ds.col(c));
        C3.plots.barChart(box, freq.rows.slice(0, 12).map(function (r) {
          return { label: r.level, value: r.count };
        }), { title: c, height: 200, valueLabel: 'Conteggio', rotate: -30 });
      });
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
