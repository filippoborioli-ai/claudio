/* CLAUDIO v3 - ui/components.js
 * Componenti di interfaccia riutilizzabili: pannelli, moduli, tabelle,
 * schede, finestre modali, blocchi di risultato, selettori di colonna.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3 = root.C3 || {};
  var num = C3.numeric;

  /** Crea un elemento HTML. */
  function h(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'dataset') Object.keys(v).forEach(function (dk) { e.dataset[dk] = v[dk]; });
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    (Array.isArray(children) ? children : (children == null ? [] : [children])).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    });
    return e;
  }

  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

  /** Pannello con titolo. */
  function panel(title, opts, children) {
    opts = opts || {};
    var head = title ? h('h3', null, [
      title,
      opts.sub ? h('span', { class: 'sub', text: opts.sub }) : null,
      opts.actions ? h('span', { style: { marginLeft: 'auto', display: 'flex', gap: '6px' } }, opts.actions) : null
    ]) : null;
    return h('section', { class: 'panel' + (opts.class ? ' ' + opts.class : '') },
      [head].concat(Array.isArray(children) ? children : [children]).filter(Boolean));
  }

  /* ===================== CONTROLLI DI MODULO ===================== */
  /**
   * Costruisce un modulo da una specifica dichiarativa.
   * fields: [{ id, type, label, options, value, hint, min, max, step, when }]
   * type: select | multiselect | number | text | checkbox | radio | textarea | chips | columns
   * Ritorna { el, values(), set(id, v), onChange(cb), refresh() }
   */
  function form(fields, onChange) {
    var values = {};
    var els = {};
    var wrap = h('div', { class: 'form' });
    var api = {
      el: wrap,
      values: function () { return Object.assign({}, values); },
      get: function (id) { return values[id]; },
      set: function (id, v) {
        values[id] = v;
        var el = els[id];
        if (!el) return;
        if (el.type === 'checkbox') el.checked = !!v;
        else if (el.multiple) {
          Array.prototype.forEach.call(el.options, function (o) { o.selected = (v || []).indexOf(o.value) >= 0; });
        } else el.value = v;
        applyVisibility();
      },
      setOptions: function (id, options, keepValue) {
        var el = els[id];
        if (!el) return;
        var prev = values[id];
        clear(el);
        (options || []).forEach(function (o) {
          var opt = typeof o === 'object' ? o : { value: o, label: o };
          el.appendChild(h('option', { value: opt.value }, opt.label));
        });
        if (keepValue && (el.multiple ? (prev || []).length : prev != null)) api.set(id, prev);
        else {
          if (el.multiple) values[id] = [];
          else values[id] = options && options.length ? (typeof options[0] === 'object' ? options[0].value : options[0]) : null;
          api.set(id, values[id]);
        }
      },
      fields: fields
    };

    function emit(id) {
      applyVisibility();
      if (onChange) onChange(api.values(), id, api);
    }

    function applyVisibility() {
      fields.forEach(function (f) {
        if (!f.when || !f.__wrap) return;
        var show = f.when(values);
        f.__wrap.classList.toggle('hidden', !show);
      });
    }

    fields.forEach(function (f) {
      var id = f.id;
      values[id] = f.value !== undefined ? f.value
        : (f.type === 'checkbox' ? false : (f.type === 'multiselect' ? [] : (f.options && f.options.length
          ? (typeof f.options[0] === 'object' ? f.options[0].value : f.options[0]) : '')));
      var input, fieldWrap;
      if (f.type === 'checkbox') {
        input = h('input', { type: 'checkbox', checked: values[id] ? true : null });
        input.addEventListener('change', function () { values[id] = input.checked; emit(id); });
        fieldWrap = h('label', { class: 'check' }, [input, h('span', { text: f.label })]);
      } else if (f.type === 'radio') {
        var group = h('div', { class: 'row tight' });
        (f.options || []).forEach(function (o) {
          var opt = typeof o === 'object' ? o : { value: o, label: o };
          var r = h('input', { type: 'radio', name: 'r_' + id, value: opt.value, checked: values[id] === opt.value ? true : null });
          r.addEventListener('change', function () { values[id] = opt.value; emit(id); });
          group.appendChild(h('label', { class: 'check' }, [r, h('span', { text: opt.label })]));
        });
        fieldWrap = h('label', { class: 'field' }, [h('span', { class: 'lab', text: f.label }), group]);
      } else if (f.type === 'chips') {
        var chipWrap = h('div', { class: 'chips' });
        (f.options || []).forEach(function (o) {
          var opt = typeof o === 'object' ? o : { value: o, label: o };
          var chip = h('span', { class: 'chip' + (values[id] === opt.value ? ' on' : ''), text: opt.label });
          chip.addEventListener('click', function () {
            values[id] = opt.value;
            Array.prototype.forEach.call(chipWrap.children, function (c) { c.classList.remove('on'); });
            chip.classList.add('on');
            emit(id);
          });
          chipWrap.appendChild(chip);
        });
        fieldWrap = h('label', { class: 'field' }, [
          f.label ? h('span', { class: 'lab', text: f.label }) : null, chipWrap,
          f.hint ? h('span', { class: 'hint', text: f.hint }) : null
        ]);
        input = chipWrap;
      } else if (f.type === 'textarea') {
        input = h('textarea', { rows: f.rows || 4, placeholder: f.placeholder || '' });
        input.value = values[id] || '';
        input.addEventListener('input', function () { values[id] = input.value; if (f.live) emit(id); });
        input.addEventListener('change', function () { values[id] = input.value; emit(id); });
        fieldWrap = h('label', { class: 'field' }, [
          h('span', { class: 'lab', text: f.label }), input,
          f.hint ? h('span', { class: 'hint', text: f.hint }) : null
        ]);
      } else if (f.type === 'select' || f.type === 'multiselect') {
        input = h('select', { multiple: f.type === 'multiselect' ? true : null, size: f.size || null });
        (f.options || []).forEach(function (o) {
          var opt = typeof o === 'object' ? o : { value: o, label: o };
          input.appendChild(h('option', { value: opt.value }, opt.label));
        });
        if (f.type === 'multiselect') {
          Array.prototype.forEach.call(input.options, function (o) {
            o.selected = (values[id] || []).indexOf(o.value) >= 0;
          });
        } else if (values[id] != null) input.value = values[id];
        input.addEventListener('change', function () {
          values[id] = f.type === 'multiselect'
            ? Array.prototype.filter.call(input.options, function (o) { return o.selected; }).map(function (o) { return o.value; })
            : input.value;
          emit(id);
        });
        fieldWrap = h('label', { class: 'field' }, [
          h('span', { class: 'lab', text: f.label }), input,
          f.hint ? h('span', { class: 'hint', text: f.hint }) : null
        ]);
      } else {
        input = h('input', {
          type: f.type === 'number' ? 'number' : 'text',
          step: f.step || (f.type === 'number' ? 'any' : null),
          min: f.min, max: f.max, placeholder: f.placeholder || ''
        });
        input.value = values[id] == null ? '' : values[id];
        var handler = function () {
          var v = input.value;
          values[id] = f.type === 'number' ? (v === '' ? null : Number(String(v).replace(',', '.'))) : v;
          emit(id);
        };
        input.addEventListener('change', handler);
        if (f.live) input.addEventListener('input', handler);
        fieldWrap = h('label', { class: 'field' }, [
          h('span', { class: 'lab', text: f.label }), input,
          f.hint ? h('span', { class: 'hint', text: f.hint }) : null
        ]);
      }
      els[id] = input;
      f.__wrap = fieldWrap;
      wrap.appendChild(fieldWrap);
    });
    applyVisibility();
    api.inputs = els;
    return api;
  }

  /* ===================== TABELLE ===================== */
  /**
   * Tabella di risultati.
   * columns: [{key, label, digits, align, format, className}]
   */
  function table(columns, rows, opts) {
    opts = opts || {};
    var thead = h('thead', null, h('tr', null, columns.map(function (c) {
      return h('th', { class: c.align === 'right' || c.digits != null ? 'num' : '' }, c.label);
    })));
    var tbody = h('tbody', null, rows.map(function (r, ri) {
      return h('tr', { class: r.__class || (opts.rowClass ? opts.rowClass(r, ri) : null) }, columns.map(function (c) {
        var v = typeof c.key === 'function' ? c.key(r, ri) : r[c.key];
        var txt;
        if (c.format) txt = c.format(v, r, ri);
        else if (typeof v === 'number') txt = num.fmt(v, c.digits);
        else txt = v === null || v === undefined ? '' : String(v);
        var cls = (c.align === 'right' || typeof v === 'number' || c.digits != null) ? 'num' : '';
        if (c.className) cls += ' ' + (typeof c.className === 'function' ? c.className(v, r) : c.className);
        var td = h('td', { class: cls.trim() || null });
        if (c.html) td.innerHTML = txt; else td.textContent = txt;
        return td;
      }));
    }));
    var t = h('table', { class: 'data' }, [
      opts.caption ? h('caption', { text: opts.caption }) : null, thead, tbody
    ].filter(Boolean));
    return opts.wrap === false ? t : h('div', { class: 'table-wrap' + (opts.short ? ' short' : '') }, t);
  }

  /** Tabella chiave-valore. */
  function kv(pairs, opts) {
    opts = opts || {};
    var dl = h('dl', { class: 'kv' });
    pairs.forEach(function (p) {
      if (!p) return;
      dl.appendChild(h('dt', { text: p[0] }));
      var v = p[1];
      var dd = h('dd');
      if (v instanceof Node) dd.appendChild(v);
      else if (typeof v === 'number') dd.textContent = num.fmt(v, p[2]);
      else dd.innerHTML = v == null ? '-' : String(v);
      dl.appendChild(dd);
    });
    return dl;
  }

  /** Blocco di verdetto colorato. */
  function verdict(text, kind) {
    return h('div', { class: 'verdict' + (kind ? ' ' + kind : ''), html: text });
  }

  /** Schede. */
  function tabs(items, opts) {
    opts = opts || {};
    var bar = h('div', { class: 'tabs' });
    var body = h('div', { class: 'tab-body' });
    var current = null;
    function select(id) {
      current = id;
      Array.prototype.forEach.call(bar.children, function (c) {
        c.classList.toggle('active', c.dataset.id === id);
      });
      clear(body);
      var item = items.filter(function (i) { return i.id === id; })[0];
      if (!item) return;
      if (typeof item.render === 'function') item.render(body);
      else if (item.content) body.appendChild(item.content);
      if (opts.onSelect) opts.onSelect(id);
    }
    items.forEach(function (it) {
      var t = h('div', { class: 'tab', dataset: { id: it.id }, text: it.label });
      t.addEventListener('click', function () { select(it.id); });
      bar.appendChild(t);
    });
    var el = h('div', null, [bar, body]);
    select(opts.active || (items[0] && items[0].id));
    return { el: el, select: select, body: body, get current() { return current; } };
  }

  /** Finestra modale. */
  function modal(title, content, opts) {
    opts = opts || {};
    var box = h('div', { class: 'modal' }, [
      h('h3', null, title),
      content,
      h('div', { class: 'row', style: { marginTop: '14px', justifyContent: 'flex-end' } },
        (opts.buttons || [{ label: 'Chiudi' }]).map(function (b) {
          var btn = h('button', { class: b.primary ? 'primary' : '' }, b.label);
          btn.addEventListener('click', function () {
            if (b.onClick && b.onClick() === false) return;
            close();
          });
          return btn;
        }))
    ]);
    var back = h('div', { class: 'modal-backdrop' }, box);
    back.addEventListener('click', function (e) { if (e.target === back) close(); });
    function close() { if (back.parentNode) back.parentNode.removeChild(back); }
    document.body.appendChild(back);
    return { close: close, el: box };
  }

  /** Sezione a scomparsa. */
  function collapsible(title, content, open) {
    var body = h('div', { class: open === false ? 'hidden' : '' }, content);
    var head = h('div', {
      class: 'row', style: { cursor: 'pointer', fontWeight: '600', marginBottom: '6px' }
    }, [h('span', { text: (open === false ? '▸ ' : '▾ ') + title })]);
    head.addEventListener('click', function () {
      var hidden = body.classList.toggle('hidden');
      head.firstChild.textContent = (hidden ? '▸ ' : '▾ ') + title;
    });
    return h('div', { class: 'mb' }, [head, body]);
  }

  /** Riga di pulsanti per esportare un risultato. */
  function exportBar(getName, getData) {
    return h('div', { class: 'row', style: { marginTop: '8px' } }, [
      h('button', {
        class: 'sm', onclick: function () {
          C3.io.download(getData(), getName() + '.csv', 'text/csv;charset=utf-8');
        }
      }, 'Esporta CSV'),
      h('button', {
        class: 'sm', onclick: function () {
          navigator.clipboard.writeText(getData()).then(function () {
            C3.app.toast('Copiato negli appunti', 'success');
          });
        }
      }, 'Copia')
    ]);
  }

  /** Converte una tabella di risultati in CSV. */
  function rowsToCSV(columns, rows) {
    var head = columns.map(function (c) { return c.label; }).join(';');
    var body = rows.map(function (r, ri) {
      return columns.map(function (c) {
        var v = typeof c.key === 'function' ? c.key(r, ri) : r[c.key];
        if (typeof v === 'number') return String(num.round(v, 8)).replace('.', ',');
        return v == null ? '' : String(v).replace(/;/g, ',');
      }).join(';');
    }).join('\n');
    return head + '\n' + body;
  }

  /** Contenitore per un grafico con pulsanti di esportazione. */
  function chartBox(opts) {
    opts = opts || {};
    var host = h('div');
    var tools = h('div', { class: 'row', style: { justifyContent: 'flex-end', gap: '5px' } }, [
      h('button', {
        class: 'sm ghost', title: 'Salva come PNG', onclick: function () {
          var chart = host.__chart;
          if (!chart || !chart.toPNG) return;
          chart.toPNG(2, function (url) {
            C3.io.downloadDataURL(url, (opts.name || 'grafico') + '.png');
          });
        }
      }, 'PNG'),
      h('button', {
        class: 'sm ghost', title: 'Salva come SVG', onclick: function () {
          var chart = host.__chart;
          if (!chart || !chart.toSVG) return;
          C3.io.download(chart.toSVG(), (opts.name || 'grafico') + '.svg', 'image/svg+xml');
        }
      }, 'SVG')
    ]);
    var box = h('div', null, [host, tools]);
    box.host = host;
    box.setChart = function (c) { host.__chart = c; return c; };
    return box;
  }

  /** Blocco vuoto informativo. */
  function empty(title, message, action) {
    return h('div', { class: 'empty' }, [
      h('h3', { text: title }),
      h('p', { class: 'small', html: message }),
      action || null
    ]);
  }

  /** Selettore di colonne con ricerca. */
  function columnPicker(ds, opts) {
    opts = opts || {};
    var cols = opts.numericOnly ? ds.numericColumns()
      : (opts.categoricalOnly ? ds.categoricalColumns() : ds.names);
    var selected = (opts.value || []).slice();
    var list = h('div', { class: 'chips', style: { maxHeight: '160px', overflow: 'auto' } });
    function refresh() {
      clear(list);
      cols.forEach(function (c) {
        var on = selected.indexOf(c) >= 0;
        var chip = h('span', { class: 'chip' + (on ? ' on' : ''), text: c });
        chip.addEventListener('click', function () {
          var i = selected.indexOf(c);
          if (i >= 0) selected.splice(i, 1);
          else {
            if (opts.max && selected.length >= opts.max) selected.shift();
            selected.push(c);
          }
          refresh();
          if (opts.onChange) opts.onChange(selected.slice());
        });
        list.appendChild(chip);
      });
    }
    refresh();
    return {
      el: h('label', { class: 'field' }, [
        h('span', { class: 'lab', text: opts.label || 'Colonne' }), list
      ]),
      values: function () { return selected.slice(); },
      set: function (v) { selected = v.slice(); refresh(); }
    };
  }

  /** Formatta un p-value con evidenza. */
  function pValue(p, alpha) {
    alpha = alpha || 0.05;
    var s = num.fmtP(p);
    return '<span class="' + (p < alpha ? 'sig' : '') + '" style="' +
      (p < alpha ? 'color:var(--critical);font-weight:600' : '') + '">' + s + '</span>';
  }

  /** Tabella ANOVA standard. */
  function anovaTable(rows, opts) {
    opts = opts || {};
    return table([
      { key: 'source', label: 'Fonte' },
      { key: 'df', label: 'GdL', digits: 0 },
      { key: 'ss', label: 'SS', digits: 4 },
      { key: 'ms', label: 'MS', digits: 4 },
      { key: 'F', label: 'F', digits: 3 },
      { key: 'p', label: 'p', html: true, format: function (v) { return v == null ? '' : pValue(v, opts.alpha); } }
    ], rows, { caption: opts.caption });
  }

  /** Tabella dei coefficienti di un modello. */
  function coefTable(fit, opts) {
    opts = opts || {};
    return table([
      { key: 'name', label: 'Termine' },
      { key: 'coef', label: 'Coefficiente', digits: 5 },
      { key: 'se', label: 'Errore std', digits: 5 },
      { key: opts.zStat ? 'z' : 't', label: opts.zStat ? 'z' : 't', digits: 3 },
      { key: 'p', label: 'p', html: true, format: function (v) { return pValue(v, opts.alpha); } },
      opts.vif ? { key: function (r, i) { return i > 0 && opts.vif ? opts.vif[i - 1] : null; }, label: 'VIF', digits: 2 } : null
    ].filter(Boolean), fit.coefTable, { caption: opts.caption });
  }

  C3.ui = {
    h: h, clear: clear, panel: panel, form: form, table: table, kv: kv, verdict: verdict,
    tabs: tabs, modal: modal, collapsible: collapsible, exportBar: exportBar,
    rowsToCSV: rowsToCSV, chartBox: chartBox, empty: empty, columnPicker: columnPicker,
    pValue: pValue, anovaTable: anovaTable, coefTable: coefTable
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
