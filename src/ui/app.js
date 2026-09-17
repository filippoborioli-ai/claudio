/* CLAUDIO v3 - ui/app.js
 * Guscio dell applicazione: stato, navigazione, gestione dei dataset,
 * importazione/esportazione, tema, salvataggio locale del progetto.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3 = root.C3 || {};
  var ui = C3.ui, h = ui.h;

  var state = {
    datasets: [],
    active: 0,
    dashboards: [],
    view: 'dati',
    settings: {
      theme: 'auto',
      alpha: 0.05,
      conf: 0.95,
      decimals: 4
    }
  };

  var views = [];
  var mainEl = null, navEl = null, topEl = null, toastHost = null;

  /* ===================== STATO E PERSISTENZA ===================== */
  var STORAGE_KEY = 'claudio_v3_progetto';

  function save() {
    try {
      var payload = C3.io.projectToJSON(state);
      if (payload.length < 4500000) localStorage.setItem(STORAGE_KEY, payload);
      localStorage.setItem('claudio_v3_settings', JSON.stringify(state.settings));
    } catch (e) {
      console.warn('salvataggio non riuscito', e);
    }
  }

  function restore() {
    try {
      var s = localStorage.getItem('claudio_v3_settings');
      if (s) Object.assign(state.settings, JSON.parse(s));
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      var proj = C3.io.projectFromJSON(raw);
      if (!proj.datasets.length) return false;
      state.datasets = proj.datasets;
      state.dashboards = proj.dashboards || [];
      state.active = Math.min(proj.active || 0, state.datasets.length - 1);
      return true;
    } catch (e) {
      console.warn('ripristino non riuscito', e);
      return false;
    }
  }

  function ds() { return state.datasets[state.active] || null; }

  function addDataset(d, activate) {
    state.datasets.push(d);
    if (activate !== false) state.active = state.datasets.length - 1;
    renderTopbar();
    save();
    return d;
  }

  function removeDataset(i) {
    state.datasets.splice(i, 1);
    if (state.active >= state.datasets.length) state.active = Math.max(0, state.datasets.length - 1);
    renderTopbar();
    render();
    save();
  }

  /* ===================== NAVIGAZIONE ===================== */
  function registerView(v) { views.push(v); }

  function navigate(id) {
    state.view = id;
    if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
    renderNav();
    render();
    if (mainEl) mainEl.scrollTop = 0;
  }

  function render() {
    if (!mainEl) return;
    var v = views.filter(function (x) { return x.id === state.view; })[0] || views[0];
    if (!v) return;
    ui.clear(mainEl);
    var head = h('div', { class: 'view-head' }, [
      h('h1', { text: v.label }),
      v.desc ? h('p', { html: v.desc }) : null
    ]);
    mainEl.appendChild(head);
    var body = h('div');
    mainEl.appendChild(body);
    try {
      v.render(body, { ds: ds(), state: state });
    } catch (e) {
      console.error(e);
      body.appendChild(ui.verdict('<b>Errore nella vista:</b> ' + e.message +
        '<br><span class="small muted">Dettagli nella console del browser (F12).</span>', 'bad'));
    }
  }

  function renderNav() {
    if (!navEl) return;
    ui.clear(navEl);
    var groups = {};
    var order = [];
    views.forEach(function (v) {
      var g = v.group || 'Generale';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(v);
    });
    order.forEach(function (g) {
      var section = h('div', { class: 'nav-group' }, [h('h4', { text: g })]);
      groups[g].forEach(function (v) {
        var item = h('div', {
          class: 'nav-item' + (v.id === state.view ? ' active' : ''),
          onclick: function () { navigate(v.id); }
        }, [h('span', { class: 'ico', text: v.icon || '•' }), h('span', { text: v.label })]);
        section.appendChild(item);
      });
      navEl.appendChild(section);
    });
  }

  function renderTopbar() {
    if (!topEl) return;
    ui.clear(topEl);
    var sel = h('select', {
      style: { width: 'auto', minWidth: '190px' },
      onchange: function () {
        state.active = Number(sel.value);
        save();
        render();
      }
    }, state.datasets.map(function (d, i) {
      return h('option', { value: i, selected: i === state.active ? true : null },
        d.name + ' (' + d.nrows + 'x' + d.columns.length + ')');
    }));
    if (!state.datasets.length) sel.appendChild(h('option', null, 'nessun dataset'));

    topEl.appendChild(h('span', { class: 'small muted', text: 'Dataset' }));
    topEl.appendChild(sel);
    topEl.appendChild(h('button', {
      class: 'sm', title: 'Importa da file (CSV, TXT, XLSX, JSON)',
      onclick: openImport
    }, 'Importa'));
    topEl.appendChild(h('button', {
      class: 'sm', title: 'Dataset di esempio', onclick: openSamples
    }, 'Esempi'));
    topEl.appendChild(h('button', {
      class: 'sm', title: 'Esporta il dataset attivo', onclick: openExport
    }, 'Esporta'));
    topEl.appendChild(h('span', { class: 'spacer' }));
    topEl.appendChild(h('span', { class: 'small muted', text: 'alpha' }));
    var alphaInput = h('input', {
      type: 'number', step: '0.01', min: '0.001', max: '0.2',
      style: { width: '68px' }, value: state.settings.alpha,
      onchange: function () {
        var v = Number(alphaInput.value);
        if (v > 0 && v < 0.5) {
          state.settings.alpha = v;
          state.settings.conf = 1 - v;
          save();
          render();
        }
      }
    });
    topEl.appendChild(alphaInput);
    topEl.appendChild(h('button', {
      class: 'sm', title: 'Tema chiaro/scuro', onclick: toggleTheme
    }, themeIcon()));
    topEl.appendChild(h('button', {
      class: 'sm', title: 'Salva il progetto su file', onclick: function () {
        C3.io.download(C3.io.projectToJSON(state), 'progetto-claudio.json', 'application/json');
      }
    }, 'Salva'));
    topEl.appendChild(h('button', {
      class: 'sm', title: 'Apri un progetto salvato', onclick: openProject
    }, 'Apri'));
  }

  function themeIcon() {
    var t = state.settings.theme;
    return t === 'dark' ? 'Scuro' : (t === 'light' ? 'Chiaro' : 'Auto');
  }

  function toggleTheme() {
    var order = ['auto', 'light', 'dark'];
    var i = order.indexOf(state.settings.theme);
    state.settings.theme = order[(i + 1) % 3];
    applyTheme();
    save();
    renderTopbar();
  }

  function applyTheme() {
    var t = state.settings.theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    if (C3.chart) C3.chart.redrawAll();
    setTimeout(render, 10);
  }

  /* ===================== IMPORTAZIONE ===================== */
  function openImport() {
    var fileInput = h('input', { type: 'file', accept: '.csv,.txt,.tsv,.xlsx,.xlsm,.json', multiple: true });
    var drop = h('div', { class: 'dropzone' }, [
      h('div', { html: '<b>Trascina qui i file</b> oppure clicca per scegliere' }),
      h('div', { class: 'small muted', text: 'CSV, TXT, TSV, Excel .xlsx, JSON' })
    ]);
    drop.addEventListener('click', function () { fileInput.click(); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) {
      handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', function () { handleFiles(fileInput.files); });

    var pasteArea = h('textarea', {
      rows: 7,
      placeholder: 'Incolla qui i dati copiati da Excel (Ctrl+V): la prima riga viene usata come intestazione.'
    });

    var content = h('div', null, [
      drop, fileInput,
      h('h4', { text: 'Oppure incolla i dati', style: { marginTop: '16px', marginBottom: '6px' } }),
      pasteArea,
      h('div', { class: 'row', style: { marginTop: '8px' } }, [
        h('button', {
          class: 'primary', onclick: function () {
            var txt = pasteArea.value.trim();
            if (!txt) { toast('Nessun dato incollato', 'error'); return; }
            var d = C3.io.datasetFromClipboard(txt);
            addDataset(d);
            modalRef.close();
            toast('Importate ' + d.nrows + ' righe e ' + d.columns.length + ' colonne', 'success');
            navigate('dati');
          }
        }, 'Importa testo incollato'),
        h('button', {
          onclick: function () {
            var d = new C3.data.Dataset('Nuovo foglio');
            d.addColumn('C1', new Array(20).fill(null));
            d.addColumn('C2', new Array(20).fill(null));
            d.addColumn('C3', new Array(20).fill(null));
            addDataset(d);
            modalRef.close();
            navigate('dati');
          }
        }, 'Crea foglio vuoto')
      ])
    ]);

    var modalRef = ui.modal('Importa dati', content, { buttons: [{ label: 'Chiudi' }] });

    function handleFiles(files) {
      Array.prototype.forEach.call(files, function (f) {
        C3.io.readFile(f).then(function (list) {
          list.forEach(function (d) { addDataset(d); });
          toast('Importato: ' + f.name, 'success');
          modalRef.close();
          navigate('dati');
        }).catch(function (err) {
          toast('Errore su ' + f.name + ': ' + err.message, 'error');
        });
      });
    }
  }

  function openSamples() {
    var list = C3.samples.list();
    var content = h('div', null, [
      h('p', { class: 'small muted', text: 'Dataset generati con seme fisso: identici a ogni avvio, pensati per provare ogni analisi.' }),
      h('div', { class: 'cards' }, list.map(function (s) {
        return h('div', { class: 'card' }, [
          h('h4', { text: s.name }),
          h('p', { text: s.desc }),
          h('button', {
            class: 'sm primary', onclick: function () {
              var d = C3.samples.load(s.id);
              addDataset(d);
              modalRef.close();
              toast('Caricato: ' + d.name, 'success');
              navigate('dati');
            }
          }, 'Carica')
        ]);
      }))
    ]);
    var modalRef = ui.modal('Dataset di esempio', content, { buttons: [{ label: 'Chiudi' }] });
  }

  function openExport() {
    var d = ds();
    if (!d) { toast('Nessun dataset attivo', 'error'); return; }
    var content = h('div', { class: 'row' }, [
      h('button', {
        class: 'primary', onclick: function () {
          C3.io.download(C3.io.toCSV(d, { delimiter: ';' }), d.name + '.csv', 'text/csv;charset=utf-8');
        }
      }, 'CSV (separatore ;)'),
      h('button', {
        onclick: function () {
          C3.io.download(C3.io.toCSV(d, { delimiter: ',' }), d.name + '.csv', 'text/csv;charset=utf-8');
        }
      }, 'CSV (separatore ,)'),
      h('button', {
        onclick: function () {
          C3.io.download(C3.io.toXlsx(state.datasets), 'claudio-dati.xlsx');
        }
      }, 'Excel .xlsx (tutti i fogli)'),
      h('button', {
        onclick: function () {
          C3.io.download(JSON.stringify(d.rows(), null, 1), d.name + '.json', 'application/json');
        }
      }, 'JSON')
    ]);
    ui.modal('Esporta dati', content, { buttons: [{ label: 'Chiudi' }] });
  }

  function openProject() {
    var input = h('input', { type: 'file', accept: '.json' });
    input.addEventListener('change', function () {
      var f = input.files[0];
      if (!f) return;
      f.text().then(function (txt) {
        var proj = C3.io.projectFromJSON(txt);
        state.datasets = proj.datasets;
        state.dashboards = proj.dashboards || [];
        state.active = 0;
        renderTopbar();
        render();
        save();
        toast('Progetto caricato: ' + proj.datasets.length + ' dataset', 'success');
      }).catch(function (e) { toast('File non valido: ' + e.message, 'error'); });
    });
    input.click();
  }

  /* ===================== NOTIFICHE ===================== */
  function toast(msg, kind) {
    if (!toastHost) return;
    var t = h('div', { class: 'toast' + (kind ? ' ' + kind : ''), text: msg });
    toastHost.appendChild(t);
    setTimeout(function () {
      t.style.opacity = '0';
      t.style.transition = 'opacity .3s';
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 320);
    }, kind === 'error' ? 6000 : 3200);
  }

  /* ===================== AVVIO ===================== */
  function boot() {
    var app = document.getElementById('app');
    ui.clear(app);
    app.appendChild(h('div', { class: 'brand' }, [
      h('div', { class: 'brand-logo', text: 'C3' }),
      h('div', null, [
        h('div', { class: 'brand-name', text: 'CLAUDIO' }),
        h('div', { class: 'brand-ver', text: 'analisi dati e Lean Six Sigma' })
      ])
    ]));
    topEl = h('div', { class: 'topbar' });
    app.appendChild(topEl);
    navEl = h('nav', { class: 'sidebar' });
    app.appendChild(navEl);
    mainEl = h('main');
    app.appendChild(mainEl);
    toastHost = h('div', { class: 'toast-host' });
    document.body.appendChild(toastHost);

    applyTheme();
    var restored = restore();
    if (!restored) {
      addDataset(C3.samples.load('riempimento'), true);
      addDataset(C3.samples.load('doe23'), false);
      state.active = 0;
    }

    // scorciatoie da tastiera
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); save(); toast('Progetto salvato in locale', 'success'); }
    });
    // incolla globale
    document.addEventListener('paste', function (e) {
      if (['INPUT', 'TEXTAREA', 'SELECT'].indexOf(document.activeElement.tagName) >= 0) return;
      var txt = (e.clipboardData || root.clipboardData).getData('text');
      if (!txt || txt.indexOf('\n') < 0) return;
      var d = C3.io.datasetFromClipboard(txt);
      if (d.nrows > 0) {
        addDataset(d);
        toast('Dati incollati: ' + d.nrows + ' righe', 'success');
        navigate('dati');
      }
    });

    var hash = (location.hash || '').replace('#', '');
    state.view = views.some(function (v) { return v.id === hash; }) ? hash : 'dati';
    window.addEventListener('hashchange', function () {
      var hid = (location.hash || '').replace('#', '');
      if (hid && hid !== state.view && views.some(function (v) { return v.id === hid; })) navigate(hid);
    });

    renderTopbar();
    renderNav();
    render();
  }

  C3.app = {
    state: state, ds: ds, addDataset: addDataset, removeDataset: removeDataset,
    registerView: registerView, navigate: navigate, render: render, refresh: render,
    renderTopbar: renderTopbar, toast: toast, save: save, boot: boot,
    settings: state.settings,
    openImport: openImport, openSamples: openSamples, openExport: openExport
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
