/* CLAUDIO v3 - data/io.js
 * Importazione ed esportazione dati: CSV/TSV/testo, Excel .xlsx (lettura e
 * scrittura senza librerie esterne), appunti, JSON, download di file e immagini.
 */
;(function (root) {
  'use strict';
  var C3 = root.C3 = root.C3 || {};

  /* ===================== TESTO DELIMITATO ===================== */
  /** Riconosce il separatore più probabile. */
  function detectDelimiter(text) {
    var sample = text.split(/\r?\n/).slice(0, 12).join('\n');
    var cands = ['\t', ';', ',', '|'];
    var best = ',', bestScore = -1;
    cands.forEach(function (d) {
      var counts = sample.split(/\r?\n/).filter(Boolean).map(function (line) {
        return line.split(d).length;
      });
      if (!counts.length) return;
      var mean = counts.reduce(function (a, b) { return a + b; }, 0) / counts.length;
      if (mean < 2) return;
      var variance = counts.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0) / counts.length;
      var score = mean - variance * 2;
      if (score > bestScore) { bestScore = score; best = d; }
    });
    return best;
  }

  /** Parser CSV con virgolette e newline dentro i campi. */
  function parseDelimited(text, opts) {
    opts = opts || {};
    var delim = opts.delimiter || detectDelimiter(text);
    var rows = [], row = [], field = '', inQuotes = false;
    text = String(text).replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
        continue;
      }
      if (c === '"') { inQuotes = true; continue; }
      if (c === delim) { row.push(field); field = ''; continue; }
      if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
      if (c === '\r') continue;
      field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    // scarta righe completamente vuote in coda
    while (rows.length && rows[rows.length - 1].every(function (v) { return v === ''; })) rows.pop();
    var matrix = rows.map(function (r) {
      return r.map(function (v) { return v.trim(); });
    });
    return { matrix: matrix, delimiter: delim };
  }

  /** Crea un Dataset da testo delimitato. */
  function datasetFromText(text, opts) {
    opts = opts || {};
    var parsed = parseDelimited(text, opts);
    var m = parsed.matrix;
    if (!m.length) return new C3.data.Dataset(opts.name);
    var header = opts.header;
    if (header === undefined) {
      // intestazione se la prima riga non è prevalentemente numerica
      var first = m[0];
      var numCount = first.filter(function (v) { return v !== '' && isFinite(Number(v.replace(',', '.'))); }).length;
      header = numCount < first.length / 2;
    }
    var ds = C3.data.fromMatrix(m, header, opts.name || 'Dati importati');
    ds.columns.forEach(function (c) {
      if (c.type === 'num') c.values = c.values.map(C3.data.toNumber);
    });
    return ds;
  }

  /** Esporta in CSV. */
  function toCSV(ds, opts) {
    opts = opts || {};
    var delim = opts.delimiter || ',';
    function esc(v) {
      if (v === null || v === undefined) return '';
      var s = String(v);
      if (s.indexOf(delim) >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }
    var lines = [ds.names.map(esc).join(delim)];
    var n = ds.nrows;
    for (var i = 0; i < n; i++) {
      lines.push(ds.columns.map(function (c) { return esc(c.values[i]); }).join(delim));
    }
    return lines.join('\r\n');
  }

  /* ===================== ZIP (lettura) ===================== */
  function readUint16(dv, off) { return dv.getUint16(off, true); }
  function readUint32(dv, off) { return dv.getUint32(off, true); }

  /** Estrae le voci di un archivio zip. Ritorna Promise di { nome: Uint8Array }. */
  function unzip(arrayBuffer) {
    var dv = new DataView(arrayBuffer);
    var bytes = new Uint8Array(arrayBuffer);
    // End of Central Directory
    var eocd = -1;
    for (var i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i--) {
      if (readUint32(dv, i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.reject(new Error('File non valido: non sembra un archivio xlsx/zip.'));
    var count = readUint16(dv, eocd + 10);
    var cdOffset = readUint32(dv, eocd + 16);
    var entries = [];
    var p = cdOffset;
    for (var k = 0; k < count; k++) {
      if (readUint32(dv, p) !== 0x02014b50) break;
      var method = readUint16(dv, p + 10);
      var compSize = readUint32(dv, p + 20);
      var nameLen = readUint16(dv, p + 28);
      var extraLen = readUint16(dv, p + 30);
      var commentLen = readUint16(dv, p + 32);
      var localOffset = readUint32(dv, p + 42);
      var name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
      entries.push({ name: name, method: method, compSize: compSize, localOffset: localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    var out = {};
    var chain = Promise.resolve();
    entries.forEach(function (e) {
      chain = chain.then(function () {
        var lh = e.localOffset;
        if (readUint32(dv, lh) !== 0x04034b50) return;
        var nameLen2 = readUint16(dv, lh + 26);
        var extraLen2 = readUint16(dv, lh + 28);
        var dataStart = lh + 30 + nameLen2 + extraLen2;
        var data = bytes.subarray(dataStart, dataStart + e.compSize);
        if (e.method === 0) { out[e.name] = data; return; }
        if (e.method !== 8) return;
        if (typeof DecompressionStream === 'undefined') {
          throw new Error('Il browser non supporta la decompressione integrata: salva il file in formato CSV.');
        }
        var ds = new DecompressionStream('deflate-raw');
        var stream = new Blob([data]).stream().pipeThrough(ds);
        return new Response(stream).arrayBuffer().then(function (buf) {
          out[e.name] = new Uint8Array(buf);
        });
      });
    });
    return chain.then(function () { return out; });
  }

  function xmlDoc(u8) {
    var text = new TextDecoder().decode(u8);
    return new DOMParser().parseFromString(text, 'application/xml');
  }

  function colLetterToIndex(ref) {
    var m = String(ref).match(/^([A-Z]+)/);
    if (!m) return 0;
    var s = m[1], n = 0;
    for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
    return n - 1;
  }

  /** Converte il seriale data di Excel in stringa ISO. */
  function excelDate(serial) {
    var ms = Math.round((serial - 25569) * 86400 * 1000);
    var d = new Date(ms);
    if (isNaN(d.getTime())) return serial;
    var iso = d.toISOString();
    return (serial % 1 === 0) ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ');
  }

  /** Legge un file .xlsx. Ritorna Promise di [{name, matrix}]. */
  function readXlsx(arrayBuffer) {
    return unzip(arrayBuffer).then(function (files) {
      // stringhe condivise
      var shared = [];
      if (files['xl/sharedStrings.xml']) {
        var sdoc = xmlDoc(files['xl/sharedStrings.xml']);
        var siList = sdoc.getElementsByTagName('si');
        for (var i = 0; i < siList.length; i++) {
          var tNodes = siList[i].getElementsByTagName('t');
          var s = '';
          for (var j = 0; j < tNodes.length; j++) s += tNodes[j].textContent;
          shared.push(s);
        }
      }
      // stili -> individua i formati data
      var dateStyles = {};
      if (files['xl/styles.xml']) {
        var stdoc = xmlDoc(files['xl/styles.xml']);
        var numFmts = {};
        var nf = stdoc.getElementsByTagName('numFmt');
        for (var q = 0; q < nf.length; q++) {
          numFmts[nf[q].getAttribute('numFmtId')] = nf[q].getAttribute('formatCode') || '';
        }
        var cellXfs = stdoc.getElementsByTagName('cellXfs')[0];
        if (cellXfs) {
          var xfs = cellXfs.getElementsByTagName('xf');
          for (var x = 0; x < xfs.length; x++) {
            var id = xfs[x].getAttribute('numFmtId');
            var builtinDate = id && ((+id >= 14 && +id <= 22) || (+id >= 45 && +id <= 47));
            var custom = numFmts[id] || '';
            if (builtinDate || /[dmyhs]/i.test(custom) && /[-/:]/.test(custom)) dateStyles[x] = true;
          }
        }
      }
      // mappa dei fogli
      var wb = xmlDoc(files['xl/workbook.xml']);
      var relsDoc = files['xl/_rels/workbook.xml.rels'] ? xmlDoc(files['xl/_rels/workbook.xml.rels']) : null;
      var rels = {};
      if (relsDoc) {
        var rl = relsDoc.getElementsByTagName('Relationship');
        for (var r = 0; r < rl.length; r++) {
          rels[rl[r].getAttribute('Id')] = rl[r].getAttribute('Target');
        }
      }
      var sheetNodes = wb.getElementsByTagName('sheet');
      var sheets = [];
      for (var sIdx = 0; sIdx < sheetNodes.length; sIdx++) {
        var nameAttr = sheetNodes[sIdx].getAttribute('name');
        var rid = sheetNodes[sIdx].getAttribute('r:id') ||
          sheetNodes[sIdx].getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        var target = rels[rid] || ('worksheets/sheet' + (sIdx + 1) + '.xml');
        var path = target.indexOf('/') === 0 ? target.slice(1) : ('xl/' + target.replace(/^\//, ''));
        if (!files[path]) path = 'xl/worksheets/sheet' + (sIdx + 1) + '.xml';
        if (!files[path]) continue;
        var doc = xmlDoc(files[path]);
        var rowNodes = doc.getElementsByTagName('row');
        var matrix = [];
        for (var ri = 0; ri < rowNodes.length; ri++) {
          var rowIdx = Number(rowNodes[ri].getAttribute('r') || (ri + 1)) - 1;
          var cells = rowNodes[ri].getElementsByTagName('c');
          var arr = matrix[rowIdx] = matrix[rowIdx] || [];
          for (var ci = 0; ci < cells.length; ci++) {
            var cell = cells[ci];
            var ref = cell.getAttribute('r');
            var colIdx = ref ? colLetterToIndex(ref) : ci;
            var t = cell.getAttribute('t');
            var sAttr = cell.getAttribute('s');
            var vNode = cell.getElementsByTagName('v')[0];
            var value = null;
            if (t === 's') {
              value = vNode ? shared[Number(vNode.textContent)] : '';
            } else if (t === 'inlineStr') {
              var isNode = cell.getElementsByTagName('t');
              value = isNode.length ? isNode[0].textContent : '';
            } else if (t === 'b') {
              value = vNode && vNode.textContent === '1' ? 'VERO' : 'FALSO';
            } else if (vNode) {
              var numv = Number(vNode.textContent);
              value = isFinite(numv) ? numv : vNode.textContent;
              if (sAttr != null && dateStyles[Number(sAttr)] && typeof value === 'number') {
                value = excelDate(value);
              }
            }
            arr[colIdx] = value;
          }
        }
        // normalizza (riempie i buchi)
        var maxLen = 0;
        matrix.forEach(function (rr) { if (rr && rr.length > maxLen) maxLen = rr.length; });
        var clean = [];
        for (var m2 = 0; m2 < matrix.length; m2++) {
          var rowArr = matrix[m2] || [];
          var norm = [];
          for (var cc = 0; cc < maxLen; cc++) norm.push(rowArr[cc] === undefined ? null : rowArr[cc]);
          if (norm.some(function (v) { return v !== null && v !== ''; })) clean.push(norm);
        }
        sheets.push({ name: nameAttr || ('Foglio' + (sIdx + 1)), matrix: clean });
      }
      return sheets;
    });
  }

  /* ===================== ZIP (scrittura, senza compressione) ===================== */
  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(u8) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function strBytes(s) { return new TextEncoder().encode(s); }

  /** Crea un archivio zip (metodo store) da { nome: stringa }. */
  function zipStore(files) {
    var parts = [], central = [], offset = 0;
    Object.keys(files).forEach(function (name) {
      var data = typeof files[name] === 'string' ? strBytes(files[name]) : files[name];
      var nameB = strBytes(name);
      var crc = crc32(data);
      var local = new Uint8Array(30 + nameB.length);
      var dv = new DataView(local.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0, true);
      dv.setUint16(8, 0, true);
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, nameB.length, true);
      dv.setUint16(28, 0, true);
      local.set(nameB, 30);
      parts.push(local, data);
      var cd = new Uint8Array(46 + nameB.length);
      var cdv = new DataView(cd.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, data.length, true);
      cdv.setUint32(24, data.length, true);
      cdv.setUint16(28, nameB.length, true);
      cdv.setUint32(42, offset, true);
      cd.set(nameB, 46);
      central.push(cd);
      offset += local.length + data.length;
    });
    var centralSize = central.reduce(function (a, c) { return a + c.length; }, 0);
    var end = new Uint8Array(22);
    var edv = new DataView(end.buffer);
    edv.setUint32(0, 0x06054b50, true);
    edv.setUint16(8, central.length, true);
    edv.setUint16(10, central.length, true);
    edv.setUint32(12, centralSize, true);
    edv.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function escapeXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  function colIndexToLetter(i) {
    var s = '';
    i++;
    while (i > 0) {
      var rem = (i - 1) % 26;
      s = String.fromCharCode(65 + rem) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  }

  /** Crea un file xlsx da uno o più dataset (un foglio per dataset). */
  function toXlsx(datasets) {
    var list = Array.isArray(datasets) ? datasets : [datasets];
    var sheetXmls = [], sheetEntries = [];
    list.forEach(function (ds, si) {
      var rowsXml = [];
      var headerCells = ds.names.map(function (nm, ci) {
        return '<c r="' + colIndexToLetter(ci) + '1" t="inlineStr"><is><t>' + escapeXml(nm) + '</t></is></c>';
      }).join('');
      rowsXml.push('<row r="1">' + headerCells + '</row>');
      var n = ds.nrows;
      for (var i = 0; i < n; i++) {
        var cells = ds.columns.map(function (c, ci) {
          var v = c.values[i];
          var ref = colIndexToLetter(ci) + (i + 2);
          if (v === null || v === undefined || v === '') return '';
          var numv = C3.data.toNumber(v);
          if (c.type === 'num' && isFinite(numv)) {
            return '<c r="' + ref + '"><v>' + numv + '</v></c>';
          }
          return '<c r="' + ref + '" t="inlineStr"><is><t>' + escapeXml(v) + '</t></is></c>';
        }).join('');
        rowsXml.push('<row r="' + (i + 2) + '">' + cells + '</row>');
      }
      sheetXmls.push('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<sheetData>' + rowsXml.join('') + '</sheetData></worksheet>');
      sheetEntries.push({ name: (ds.name || ('Foglio' + (si + 1))).slice(0, 28).replace(/[\\/?*[\]:]/g, '_'), id: si + 1 });
    });

    var files = {};
    files['[Content_Types].xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheetEntries.map(function (s) {
        return '<Override PartName="/xl/worksheets/sheet' + s.id + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      }).join('') + '</Types>';
    files['_rels/.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';
    files['xl/workbook.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheetEntries.map(function (s) {
        return '<sheet name="' + escapeXml(s.name) + '" sheetId="' + s.id + '" r:id="rId' + s.id + '"/>';
      }).join('') + '</sheets></workbook>';
    files['xl/_rels/workbook.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheetEntries.map(function (s) {
        return '<Relationship Id="rId' + s.id + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + s.id + '.xml"/>';
      }).join('') + '</Relationships>';
    sheetXmls.forEach(function (xml, i) {
      files['xl/worksheets/sheet' + (i + 1) + '.xml'] = xml;
    });
    return zipStore(files);
  }

  /* ===================== FILE E DOWNLOAD ===================== */
  function download(blobOrString, filename, mime) {
    var blob = blobOrString instanceof Blob ? blobOrString
      : new Blob(['﻿' + blobOrString], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  function downloadDataURL(dataURL, filename) {
    var a = document.createElement('a');
    a.href = dataURL;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); }, 200);
  }

  /** Legge un File dell’utente e produce uno o più Dataset. */
  function readFile(file) {
    var name = file.name.replace(/\.[^.]+$/, '');
    var ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'xlsx' || ext === 'xlsm' || ext === 'xls') {
      if (ext === 'xls') {
        return Promise.reject(new Error('Il formato .xls (Excel 97-2003) non è supportato: salva come .xlsx o .csv.'));
      }
      return file.arrayBuffer().then(readXlsx).then(function (sheets) {
        return sheets.map(function (sh) {
          var ds = C3.data.fromMatrix(sh.matrix, true, sh.name);
          ds.columns.forEach(function (c) {
            if (c.type === 'num') c.values = c.values.map(C3.data.toNumber);
          });
          return ds;
        });
      });
    }
    if (ext === 'json') {
      return file.text().then(function (txt) {
        var obj = JSON.parse(txt);
        if (Array.isArray(obj)) return [C3.data.fromRows(obj, name)];
        if (obj.columns) {
          var ds = new C3.data.Dataset(obj.name || name);
          obj.columns.forEach(function (c) { ds.addColumn(c.name, c.values, c.type); });
          return [ds];
        }
        return [C3.data.fromColumns(obj, name)];
      });
    }
    return file.text().then(function (txt) {
      return [datasetFromText(txt, { name: name })];
    });
  }

  /** Dataset dagli appunti (testo incollato da Excel). */
  function datasetFromClipboard(text, opts) {
    return datasetFromText(text, Object.assign({ name: 'Dati incollati' }, opts || {}));
  }

  /** Serializza un progetto (dataset + impostazioni) in JSON. */
  function projectToJSON(state) {
    return JSON.stringify({
      version: 3,
      created: new Date().toISOString(),
      datasets: state.datasets.map(function (d) {
        return {
          name: d.name,
          columns: d.columns.map(function (c) {
            return { name: c.name, type: c.type, formula: c.formula, values: c.values };
          }),
          meta: d.meta
        };
      }),
      dashboards: state.dashboards || [],
      active: state.active || 0
    }, null, 1);
  }

  function projectFromJSON(text) {
    var obj = JSON.parse(text);
    var datasets = (obj.datasets || []).map(function (d) {
      var ds = new C3.data.Dataset(d.name);
      (d.columns || []).forEach(function (c) {
        var col = ds.addColumn(c.name, c.values, c.type);
        col.formula = c.formula || null;
      });
      ds.meta = d.meta || {};
      return ds;
    });
    return { datasets: datasets, dashboards: obj.dashboards || [], active: obj.active || 0 };
  }

  C3.io = {
    detectDelimiter: detectDelimiter, parseDelimited: parseDelimited,
    datasetFromText: datasetFromText, datasetFromClipboard: datasetFromClipboard,
    toCSV: toCSV, readXlsx: readXlsx, toXlsx: toXlsx, unzip: unzip, zipStore: zipStore,
    download: download, downloadDataURL: downloadDataURL, readFile: readFile,
    projectToJSON: projectToJSON, projectFromJSON: projectFromJSON,
    colIndexToLetter: colIndexToLetter
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
