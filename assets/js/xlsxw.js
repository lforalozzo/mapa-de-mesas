"use strict";
/* Gerador mínimo de .xlsx, sem dependências: cabeçalho colorido, linha congelada,
   filtro, larguras de coluna, listas suspensas e abas ocultas. O arquivo é um zip
   sem compressão com o XML da planilha — abre no Excel, LibreOffice e Google Planilhas. */
const XW = (() => {
  const enc = new TextEncoder();
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  function zip(files) {
    const parts = [], central = [];
    let offset = 0;
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc.encode(f.name), data = f.data, crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    }
    const size = central.reduce((n, a) => n + a.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, size, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  const x = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  const col = (i) => { let s = ""; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  const sheetName = (n) => String(n).replace(/[[\]:*?/\\]/g, " ").slice(0, 31);

  /* estilos: 0 normal · 1 cabeçalho (negrito, branco sobre a cor do evento) · 2 título · 3 nota cinza · 4 texto com quebra */
  function sheetXml(sh, first) {
    const rows = sh.rows;
    const ncol = Math.max(1, ...rows.map((r) => r.length));
    let s = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
    s += '<sheetViews><sheetView workbookViewId="0"' + (first ? ' tabSelected="1"' : "") + ">" +
      (sh.freeze ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/>' : "") + "</sheetView></sheetViews>";
    s += '<sheetFormatPr defaultRowHeight="16"/>';
    if (sh.widths) s += "<cols>" + sh.widths.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join("") + "</cols>";
    s += "<sheetData>";
    rows.forEach((r, ri) => {
      const st = sh.styles && sh.styles[ri] !== undefined ? sh.styles[ri] : sh.header && ri === 0 ? 1 : sh.wrap ? 4 : 0;
      s += '<row r="' + (ri + 1) + '"' + (st === 1 ? ' ht="22" customHeight="1"' : "") + ">";
      for (let ci = 0; ci < Math.max(r.length, st === 1 ? ncol : 0); ci++) {
        const v = r[ci], ref = col(ci) + (ri + 1), sa = st ? ' s="' + st + '"' : "";
        if (v === null || v === undefined || v === "") { if (st) s += '<c r="' + ref + '"' + sa + "/>"; continue; }
        if (typeof v === "number" && isFinite(v)) s += '<c r="' + ref + '"' + sa + "><v>" + v + "</v></c>";
        else s += '<c r="' + ref + '"' + sa + ' t="inlineStr"><is><t xml:space="preserve">' + x(v) + "</t></is></c>";
      }
      s += "</row>";
    });
    s += "</sheetData>";
    if (sh.filter) s += '<autoFilter ref="A1:' + col(ncol - 1) + Math.max(rows.length, 2) + '"/>';
    const vals = (sh.validations || []).filter(Boolean);
    if (vals.length) {
      s += '<dataValidations count="' + vals.length + '">' + vals.map((v) => {
        const sq = col(v.col) + "2:" + col(v.col) + (v.rows || 3000);
        const msg = v.prompt ? ' showInputMessage="1" promptTitle="' + x(v.title || "") + '" prompt="' + x(v.prompt) + '"' : "";
        if (v.list) return '<dataValidation type="list" allowBlank="1" showErrorMessage="1"' + (v.loose ? ' errorStyle="information" errorTitle="Valor novo" error="Esse valor não está na lista; tudo bem se for de propósito."' : ' error="Escolha um valor da lista."') + msg + ' sqref="' + sq + '"><formula1>' + x(v.list) + "</formula1></dataValidation>";
        if (v.whole) return '<dataValidation type="whole" operator="between" allowBlank="1" showErrorMessage="1" error="Use um número inteiro"' + msg + ' sqref="' + sq + '"><formula1>' + v.whole[0] + "</formula1><formula2>" + v.whole[1] + "</formula2></dataValidation>";
        return "";
      }).join("") + "</dataValidations>";
    }
    return s + '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>';
  }

  function build(sheets, opts) {
    opts = opts || {};
    const accent = String(opts.accent || "#4f46e5").replace("#", "").toUpperCase();
    const files = [];
    const add = (name, str) => files.push({ name, data: enc.encode(str) });
    add("[Content_Types].xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("") + "</Types>");
    add("_rels/.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    add("xl/workbook.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
      sheets.map((sh, i) => '<sheet name="' + x(sheetName(sh.name)) + '" sheetId="' + (i + 1) + '"' + (sh.hidden ? ' state="hidden"' : "") + ' r:id="rId' + (i + 1) + '"/>').join("") + "</sheets></workbook>");
    add("xl/_rels/workbook.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join("") +
      '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    add("xl/styles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF52525B"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF' + accent + '"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf>' +
      '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
    sheets.forEach((sh, i) => add("xl/worksheets/sheet" + (i + 1) + ".xml", sheetXml(sh, i === 0)));
    return zip(files);
  }
  return { build, col };
})();
