"use strict";
/* Entrada e saída: importar planilhas (Excel, LibreOffice, CSV, colar), modelo de
   planilha, backup, impressões/PDF, Excel, CSV, imagem da planta e página do convidado. */

/* ── Leitura de planilhas ── */
function parseDelimited(text) {
  text = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const sample = text.split("\n").slice(0, 8).join("\n");
  const count = (ch) => (sample.match(new RegExp(ch === "|" ? "\\|" : ch, "g")) || []).length;
  const delim = [["\t", count("\t")], [";", count(";")], [",", count(",")]].sort((a, b) => b[1] - a[1])[0];
  const d = delim[1] ? delim[0] : "\t";
  const rows = [];
  let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
      else cell += c;
    } else if (c === '"' && cell === "") q = true;
    else if (c === d) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((c) => String(c).trim()));
}
async function readTextSmart(file) {
  const buf = await file.arrayBuffer();
  let t = new TextDecoder("utf-8").decode(buf);
  if (t.includes("�")) t = new TextDecoder("windows-1252").decode(buf);
  return t;
}
async function readSheets(file) {
  if (/\.(xlsx|xlsm|xls|ods)$/i.test(file.name) || /spreadsheet|excel/i.test(file.type)) {
    await loadScript("vendor/xlsx.full.min.js");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    return wb.SheetNames.map((name) => ({
      name,
      rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: "" }).map((r) => r.map((c) => String(c ?? "").trim()))
    })).map(trimSheet).filter((s) => s.rows.length);
  }
  return [trimSheet({ name: file.name, rows: parseDelimited(await readTextSmart(file)) })];
}
/* linhas em branco são mantidas: servem para achar o fim da lista (planilhas de cerimonial
   costumam ter outros quadros embaixo) */
function trimSheet(s) {
  const rows = s.rows;
  while (rows.length && !rows[rows.length - 1].some((c) => c !== "")) rows.pop();
  return s;
}

/* ── Importar convidados ── */
const IMP_FIELDS = () => [
  { k: "name", l: "Nome", req: true, syn: ["nome", "nomes", "convidado", "convidados", "nome completo", "nome do convidado", "name", "familia", "família", "grupo familiar"] },
  { k: "adults", l: "Adultos", syn: ["adultos", "adulto", "adults", "qtd adultos", "n adultos", "quantidade de adultos"] },
  { k: "kidsA", l: kidLabel("a"), syn: ["criancas " + norm(state.event.kidA), norm(state.event.kidA), "0 a 5", "0-5", "ate 5", "isentas", "isento", "bebes", "bebe", "criancas pequenas", "criancas 0"] },
  { k: "kidsB", l: kidLabel("b"), syn: ["criancas " + norm(state.event.kidB), norm(state.event.kidB), "6 a 12", "6-12", "meia", "criancas 6", "criancas"] },
  { k: "total", l: "Total de pessoas", syn: ["total", "pessoas", "qtd", "quantidade", "n pessoas", "numero de pessoas", "qtd pessoas", "lugares", "total de pessoas"] },
  { k: "side", l: "Lado", syn: ["lado", "convidado de", "de quem", "noivo/noiva", "noiva/noivo", "side", "convidado por"] },
  { k: "group", l: "Grupo", syn: ["grupo", "categoria", "tipo", "relacao", "parentesco", "group", "circulo"] },
  { k: "status", l: "Situação", syn: ["situacao", "confirmado", "confirmacao", "presenca", "presenca confirmada", "rsvp", "status", "vai"] },
  { k: "table", l: "Mesa", syn: ["mesa", "table", "n mesa", "numero da mesa", "n da mesa"] },
  { k: "invited", l: "Convite enviado", syn: ["convite enviado", "convite", "enviado", "invited", "convite entregue"] },
  { k: "phone", l: "Telefone", syn: ["telefone", "celular", "whatsapp", "fone", "contato", "phone", "tel", "telefones"] },
  { k: "notes", l: "Observações", syn: ["observacoes", "observacao", "obs", "notas", "nota", "comentarios", "notes", "anotacoes"] },
  { k: "id", l: "Código", syn: ["codigo", "id", "cod"] }
];
let imp = null;

function openImport() {
  imp = { sheets: null, sheet: 0, header: -1, map: {}, name: "" };
  $("impPaste").value = "";
  showImpStep(1);
  $("impdlg").showModal();
}
function showImpStep(n) {
  document.querySelectorAll("#impBody [data-step]").forEach((s) => { s.hidden = +s.dataset.step !== n; });
  $("impBack").hidden = n === 1;
  $("impNext").textContent = n === 1 ? "Continuar" : "Importar";
  imp.step = n;
  if (n === 1) $("impNext").disabled = !$("impPaste").value.trim();
  else renderImpPreview();
}
function headerScan(rows) {
  const fields = IMP_FIELDS();
  let best = { row: -1, hits: 0 };
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const hits = rows[r].filter((c) => { const n = norm(c); return n && fields.some((f) => f.syn.some((s) => s && (n === s || (s.length >= 4 && n.includes(s))))); }).length;
    if (hits > best.hits && rows[r].filter((c) => /[a-zà-ú]/i.test(c)).length >= Math.min(2, rows[r].filter(Boolean).length)) best = { row: r, hits };
  }
  return best;
}
function guessHeader(rows) { return headerScan(rows).row; }
function guessMap(rows, header) {
  const fields = IMP_FIELDS();
  const map = {};
  fields.forEach((f) => { map[f.k] = -1; });
  if (header < 0) {
    map.name = 0;
    const r1 = rows[0] || [];
    const numCol = r1.findIndex((c, i) => i > 0 && /^\d{1,2}$/.test(String(c).trim()));
    if (numCol > 0) map.total = numCol;
    return map;
  }
  const heads = rows[header].map(norm);
  const used = new Set();
  for (const pass of ["exact", "includes"]) {
    for (const f of fields) {
      if (map[f.k] >= 0) continue;
      const i = heads.findIndex((h, idx) => !used.has(idx) && h && f.syn.some((s) => s && (pass === "exact" ? h === s : h.includes(s) && s.length >= 3)));
      if (i >= 0) { map[f.k] = i; used.add(i); }
    }
  }
  return map;
}
async function loadImportSource(sheets, name) {
  if (!sheets.length || !sheets[0].rows.length) { toast("Não encontrei linhas nessa planilha", { err: true }); return; }
  imp.sheets = sheets;
  imp.name = name;
  // aba com o cabeçalho mais reconhecível (planilhas de cerimonial costumam ter várias abas)
  let bestI = 0, bestScore = -1;
  sheets.forEach((s, i) => {
    const sc = headerScan(s.rows).hits * 10 + (/convid|lista|guest/i.test(s.name) ? 5 : 0) + Math.min(4, s.rows.length / 50);
    if (sc > bestScore) { bestScore = sc; bestI = i; }
  });
  imp.sheet = bestI;
  prepareSheet();
  showImpStep(2);
}
function prepareSheet() {
  const rows = imp.sheets[imp.sheet].rows;
  imp.header = guessHeader(rows);
  imp.map = guessMap(rows, imp.header);
  renderImpMap();
}
function impRows() {
  const rows = imp.sheets[imp.sheet].rows;
  const body = imp.header >= 0 ? rows.slice(imp.header + 1) : rows;
  // a lista termina numa linha de totais (sem nome, só números) ou em 3+ linhas vazias
  const m = imp.map || {};
  const numCols = ["adults", "kidsA", "kidsB", "total"].map((k) => m[k]).filter((i) => i >= 0);
  const out = [];
  let blanks = 0, seen = false;
  for (const r of body) {
    const empty = !r.some((c) => c !== "");
    if (empty) { blanks++; if (seen && blanks >= 3 && !imp.all) break; continue; }
    blanks = 0;
    const nm = m.name >= 0 ? String(r[m.name] || "").trim() : "";
    const isTotal = m.name >= 0 && (isTotalName(nm) || !nm) && numCols.some((i) => /^\d+$/.test(String(r[i] || "").trim()));
    if (seen && isTotal && !imp.all) break;
    seen = true;
    out.push(r);
  }
  imp.cut = out.length < body.filter((r) => r.some((c) => c !== "")).length;
  return out;
}
function renderImpMap() {
  const rows = imp.sheets[imp.sheet].rows;
  const heads = imp.header >= 0 ? rows[imp.header] : (rows[0] || []).map((_, i) => "Coluna " + (i + 1));
  const ncols = Math.max(...rows.slice(0, 50).map((r) => r.length));
  const colOpts = '<option value="-1">— não usar —</option>' + Array.from({ length: ncols }, (_, i) => {
    const ex = (impRows().find((r) => r[i]) || [])[i] || "";
    return '<option value="' + i + '">' + esc((heads[i] || "Coluna " + (i + 1)) + (ex && ex !== heads[i] ? " (ex.: " + String(ex).slice(0, 24) + ")" : "")) + "</option>";
  }).join("");
  $("impSrc").innerHTML = ic("sheet") + "<b>" + esc(imp.name) + "</b>" +
    (imp.sheets.length > 1 ? '<span>· aba</span><select id="impSheet" aria-label="Aba da planilha">' + imp.sheets.map((s, i) => '<option value="' + i + '"' + (i === imp.sheet ? " selected" : "") + ">" + esc(s.name) + "</option>").join("") + "</select>" : "") +
    '<label class="chk" style="display:inline-flex;gap:6px;align-items:center;margin-left:auto"><input type="checkbox" id="impHasHeader"' + (imp.header >= 0 ? " checked" : "") + "> A primeira linha é o cabeçalho</label>";
  $("impMap").innerHTML = IMP_FIELDS().map((f) => '<div class="fcol' + (f.req ? " req" : "") + '"><label for="map-' + f.k + '">' + esc(f.l) + '</label><select id="map-' + f.k + '" data-map="' + f.k + '">' + colOpts + "</select></div>").join("");
  IMP_FIELDS().forEach((f) => { $("map-" + f.k).value = imp.map[f.k]; });
  $("impSide").innerHTML = ["", "a", "b", "ab"].map((k) => '<option value="' + k + '">' + esc(sideShort(k)) + "</option>").join("");
  $("impGroup").innerHTML = state.groups.map((g) => '<option value="' + esc(g.id) + '">' + esc(g.label) + "</option>").join("");
  if (groupById("amigos")) $("impGroup").value = "amigos";
  $("impMode").value = state.guests.length ? "update" : "add";
  renderSideMap();
  renderImpPreview();
}
/* valores da coluna Lado (ex.: NOIVA, NOIVO, Família dele) → qual lado do casal */
function renderSideMap() {
  const box = $("impSideMap");
  if (!imp.sideMap) imp.sideMap = {};
  if (imp.map.side < 0) { box.hidden = true; return; }
  const seen = new Map();
  for (const r of impRows()) {
    const raw = String(r[imp.map.side] ?? "").trim();
    const n = norm(raw);
    if (n && !seen.has(n)) seen.set(n, raw);
    if (seen.size >= 12) break;
  }
  if (!seen.size) { box.hidden = true; return; }
  box.hidden = false;
  const def = $("impSide").value;
  const gendered = [...seen.keys()].some((n) => /noiv[ao]/.test(n));
  box.innerHTML = '<div class="fsub" style="margin:0">Como ler a coluna Lado' + (gendered ? ' <span class="hint">— confira: a ferramenta não sabe quem é a noiva e quem é o noivo</span>' : "") + "</div>" + [...seen].map(([n, raw]) => {
    const v = n in imp.sideMap ? imp.sideMap[n] : parseSide(raw, def);
    return '<div class="smrow"><span>“' + esc(raw) + '” é</span><select data-sidemap="' + esc(n) + '" aria-label="Lado para ' + esc(raw) + '">' +
      ["a", "b", "ab", ""].map((k) => '<option value="' + k + '"' + (k === v ? " selected" : "") + ">" + esc(k === "a" || k === "b" ? "Convidado de " + sideShort(k) : sideShort(k)) + "</option>").join("") + "</select></div>";
  }).join("");
}
function parseSide(v, def) {
  const n = norm(v);
  if (!n) return def;
  if (imp && imp.sideMap && n in imp.sideMap) return imp.sideMap[n];
  const A = norm(state.event.hostA), B = norm(state.event.hostB);
  if (["a", "lado a", "1", "noivo"].includes(n) || (A && (n === A || n.includes(A)))) return "a";
  if (["b", "lado b", "2", "noiva"].includes(n) || (B && (n === B || n.includes(B)))) return "b";
  if (/^(ambos|os dois|dos dois|noivos|casal|amb)/.test(n)) return "ab";
  if (/noiv[ao]$/.test(n)) return n.endsWith("o") ? "a" : "b";
  return def;
}
const parseYes = (v) => { const n = norm(v); return !/^(sem|nao|n$|no$|0$|false)/.test(n) && /^(s$|sim|x$|ok|yes|y$|true|1$|enviad|entregue|✓|✔)/.test(n); };
/* situação: primeiro o que é claramente "ainda não sei", depois não, depois sim */
function parseStatus(v) {
  const n = norm(v);
  if (!n) return "pend";
  if (/^(sem (resp|retor|confirm|resposta)|nao (confirm|respond|sabe|sei|retorn)|n\/?a$|aguard|talvez|pendente|a confirmar|\?)/.test(n)) return "pend";
  if (/^(nao|n$|no$|recus|desist|ausente|x nao)/.test(n)) return "nao";
  if (/^(sim|s$|ok|confirm|vai|yes|y$|x$|✓|✔|1$|true|presente)/.test(n)) return "ok";
  return "pend";
}
const isTotalName = (s) => /^(total|totais|subtotal|soma|sub-total)\b/i.test(norm(s));
const parseNum = (v) => { const m = String(v ?? "").match(/\d+/); return m ? parseInt(m[0], 10) : null; };
function parsedImport() {
  const m = imp.map, def = { side: $("impSide").value, group: $("impGroup").value };
  const cell = (r, k) => (m[k] >= 0 ? String(r[m[k]] ?? "").trim() : "");
  return impRows().map((r) => {
    const name = cell(r, "name").replace(/\s+/g, " ");
    if (!name || isTotalName(name)) return { skip: true, raw: r };
    const kA = parseNum(cell(r, "kidsA")) || 0, kB = parseNum(cell(r, "kidsB")) || 0;
    let adults = parseNum(cell(r, "adults"));
    const total = parseNum(cell(r, "total"));
    if (adults === null && total !== null) adults = Math.max(0, total - kA - kB);
    if (adults === null) adults = Math.min(3, name.split(/ e | & | \+ /i).filter(Boolean).length) || 1;
    const groupRaw = cell(r, "group");
    let tableRaw = cell(r, "table").replace(/^mesa\s*/i, "").trim();
    return {
      id: cell(r, "id"), name, adults, kidsA: kA, kidsB: kB,
      side: m.side >= 0 ? parseSide(cell(r, "side"), def.side) : def.side,
      groupRaw, group: def.group,
      status: m.status >= 0 ? parseStatus(cell(r, "status")) : "pend",
      table: tableRaw,
      invited: m.invited >= 0 ? parseYes(cell(r, "invited")) : null,
      phone: cell(r, "phone"), notes: cell(r, "notes")
    };
  });
}
function findTableByLabel(lbl) {
  const n = norm(lbl);
  return n ? state.tables.find((t) => norm(t.label) === n || norm(tableName(t)) === n || norm(t.alias) === n) : null;
}
function matchExisting(p) {
  if (p.id) { const g = guestById(p.id); if (g) return g; }
  const n = norm(p.name);
  return state.guests.find((g) => norm(g.name) === n) || null;
}
function renderImpPreview() {
  const list = parsedImport();
  const ok = list.filter((p) => !p.skip);
  const mode = $("impMode").value;
  const people = ok.reduce((n, p) => n + p.adults + p.kidsA + p.kidsB, 0);
  const upd = mode === "update" ? ok.filter(matchExisting).length : 0;
  const missingTables = new Set(ok.map((p) => p.table).filter((l) => l && !findTableByLabel(l)));
  $("impCount").textContent = plural(ok.length, "convidado", "convidados") + " · " + plural(people, "pessoa", "pessoas") +
    (upd ? " · " + upd + " já existem (serão atualizados)" : "") +
    (missingTables.size ? " · " + plural(missingTables.size, "mesa nova", "mesas novas") : "") +
    (list.length - ok.length ? " · " + plural(list.length - ok.length, "linha sem nome ignorada", "linhas sem nome ignoradas") : "") +
    (imp.cut ? " · parei no fim da lista (linha de totais ou em branco)" : "");
  $("impAllWrap").hidden = !imp.cut && !imp.all;
  $("impNext").disabled = !ok.length || imp.map.name < 0;
  const show = list.slice(0, 60);
  $("impPreview").innerHTML = imp.map.name < 0 ? '<p class="hint" style="padding:12px">Escolha qual coluna tem o <b>nome</b> do convidado.</p>' :
    "<table><thead><tr><th>Nome</th><th>Adultos</th><th>Crianças</th><th>Lado</th><th>Grupo</th><th>Situação</th><th>Mesa</th>" + (mode === "update" ? "<th></th>" : "") + "</tr></thead><tbody>" +
    show.map((p) => {
      if (p.skip) return '<tr class="skip"><td colspan="' + (mode === "update" ? 8 : 7) + '">' + esc(p.raw.filter(Boolean).join(" · ").slice(0, 80) || "(linha vazia)") + "</td></tr>";
      const ex = mode === "update" ? matchExisting(p) : null, m = imp.map;
      const side = ex && m.side < 0 ? ex.side : p.side;
      const grp = ex && m.group < 0 ? groupLabel(ex.group) : p.groupRaw || groupLabel(p.group);
      const st = ex && m.status < 0 ? ex.status : p.status;
      const tbl = ex && (m.table < 0 || !p.table) ? (ex.table ? tableById(ex.table).label : "") : p.table;
      return "<tr><td>" + esc(p.name) + '</td><td class="n">' + p.adults + '</td><td class="n">' + (p.kidsA + p.kidsB || "") + "</td><td>" + esc(sideShort(side)) + "</td><td>" + esc(grp) + "</td><td>" + STATUS[st] + "</td><td>" + esc(tbl) + "</td>" +
      (mode === "update" ? "<td>" + (ex ? '<span class="chip">atualiza</span>' : '<span class="chip ok">novo</span>') + "</td>" : "") + "</tr>";
    }).join("") +
    "</tbody></table>" + (list.length > show.length ? '<p class="hint" style="padding:6px 8px">… e mais ' + (list.length - show.length) + " linhas</p>" : "");
}
function runImport() {
  const list = parsedImport().filter((p) => !p.skip);
  if (!list.length) return;
  const mode = $("impMode").value;
  if (mode === "replace") { state.guests = []; }
  // grupos novos citados na planilha viram grupos de verdade
  const groupFor = (raw, def) => {
    const n = norm(raw);
    if (!n) return def;
    let g = state.groups.find((x) => norm(x.label) === n || x.id === n || norm(x.label).startsWith(n));
    if (!g) {
      let id = slug(raw), k = 2;
      while (groupById(id)) id = slug(raw) + "-" + k++;
      const t = raw.trim();
      g = { id, label: (t === t.toUpperCase() ? t.toLowerCase() : t).replace(/^./, (c) => c.toUpperCase()) };
      if (/equipe|staff|fornecedor|servi/.test(n)) g.staff = true;
      state.groups.push(g);
    }
    return g.id;
  };
  // mesas citadas e ainda inexistentes
  const missing = [...new Set(list.map((p) => p.table).filter((l) => l && !findTableByLabel(l)))];
  let created = 0;
  if (missing.length && $("impMkTables").checked) {
    const cols = Math.ceil(Math.sqrt(missing.length * 1.5));
    const rows = Math.ceil(missing.length / cols);
    missing.sort((a, b) => String(a).localeCompare(String(b), "pt-BR", { numeric: true })).forEach((lbl, i) => {
      state.tables.push({ id: uid("t"), label: lbl, alias: "", shape: "round", cap: 10, scale: 1, rot: 0, notes: "",
        x: clamp(((i % cols) + 0.5) * (100 / cols), 3, 97), y: clamp((Math.floor(i / cols) + 0.5) * (100 / rows), 4, 96) });
      created++;
    });
  }
  let added = 0, updated = 0;
  for (const p of list) {
    const t = p.table ? findTableByLabel(p.table) : null;
    const ex = mode === "update" ? matchExisting(p) : null;
    const m = imp.map;
    if (ex) {
      ex.name = p.name;
      if (m.adults >= 0 || m.total >= 0) ex.adults = p.adults;
      if (m.kidsA >= 0) ex.kidsA = p.kidsA;
      if (m.kidsB >= 0) ex.kidsB = p.kidsB;
      if (m.side >= 0) ex.side = p.side;
      if (m.group >= 0) ex.group = groupFor(p.groupRaw, ex.group);
      if (m.status >= 0) ex.status = p.status;
      if (m.invited >= 0 && p.invited !== null) ex.invited = p.invited;
      if (m.phone >= 0 && p.phone) ex.phone = p.phone;
      if (m.notes >= 0) ex.notes = p.notes;
      if (m.table >= 0 && p.table) ex.table = t ? t.id : ex.table; // célula vazia não tira ninguém da mesa
      if (ex.status === "nao") ex.table = null;
      updated++;
    } else {
      state.guests.push(newGuest({
        name: p.name, adults: p.adults, kidsA: p.kidsA, kidsB: p.kidsB, side: p.side, group: groupFor(p.groupRaw, p.group),
        status: p.status, invited: p.invited, phone: p.phone, notes: p.notes, table: p.status !== "nao" && t ? t.id : null
      }));
      added++;
    }
  }
  $("impdlg").close();
  commit();
  if (created) requestAnimationFrame(fitView);
  toast([added && plural(added, "convidado adicionado", "convidados adicionados"), updated && plural(updated, "atualizado", "atualizados"), created && plural(created, "mesa criada", "mesas criadas")].filter(Boolean).join(" · "),
    { action: { label: "Desfazer", fn: undo } });
}
$("impPick").addEventListener("click", () => $("fileGuests").click());
$("fileGuests").addEventListener("change", async () => {
  const f = $("fileGuests").files[0];
  $("fileGuests").value = "";
  if (!f) return;
  if (!$("impdlg").open) openImport();
  try { await loadImportSource(await readSheets(f), f.name); }
  catch (err) { console.error(err); toast("Não consegui ler esse arquivo. Salve como .xlsx ou .csv e tente de novo.", { err: true }); }
});
$("impPaste").addEventListener("input", () => { $("impNext").disabled = !$("impPaste").value.trim(); });
const drop = $("impDrop");
drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", async (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  const f = e.dataTransfer.files[0];
  if (!f) return;
  try { await loadImportSource(await readSheets(f), f.name); } catch (err) { toast("Não consegui ler esse arquivo.", { err: true }); }
});
$("impNext").addEventListener("click", () => {
  if (imp.step === 1) loadImportSource([{ name: "Texto colado", rows: parseDelimited($("impPaste").value) }], "Texto colado");
  else runImport();
});
$("impBack").addEventListener("click", () => showImpStep(1));
$("impBody").addEventListener("change", (e) => {
  if (e.target.id === "impSheet") { imp.sheet = +e.target.value; prepareSheet(); return; }
  if (e.target.id === "impHasHeader") {
    const rows = imp.sheets[imp.sheet].rows;
    imp.header = e.target.checked ? (guessHeader(rows) >= 0 ? guessHeader(rows) : 0) : -1;
    imp.map = guessMap(rows, imp.header);
    renderImpMap();
    return;
  }
  if (e.target.id === "impAll") { imp.all = e.target.checked; renderImpPreview(); return; }
  if (e.target.dataset.sidemap !== undefined) { imp.sideMap[e.target.dataset.sidemap] = e.target.value; renderImpPreview(); return; }
  if (e.target.dataset.map) { imp.map[e.target.dataset.map] = +e.target.value; if (e.target.dataset.map === "side" || e.target.dataset.map === "name") renderSideMap(); renderImpPreview(); return; }
  if (e.target.id === "impSide") renderSideMap();
  if (["impSide", "impGroup", "impMode"].includes(e.target.id)) renderImpPreview();
});

/* ── Modelo de planilha (as mesmas colunas da exportação — dá para ir e voltar) ── */
function canonicalHeaders() {
  return ["Nome", "Adultos", "Crianças " + (state.event.kidA || "0 a 5 anos"), "Crianças " + (state.event.kidB || "6 a 12 anos"), "Lado", "Grupo", "Situação", "Mesa", "Convite enviado", "Telefone", "Observações", "Código"];
}
function guestRow(g) {
  const t = g.table && tableById(g.table);
  return [g.name, g.adults, g.kidsA, g.kidsB, sideShort(g.side), groupLabel(g.group), STATUS[g.status], t ? t.label : "", g.invited === null ? "" : g.invited ? "Sim" : "Não", g.phone, g.notes, g.id];
}
function templateRows() {
  const A = state.event.hostA || "Lado A", B = state.event.hostB || "Lado B";
  return [canonicalHeaders(),
    ["Maria e João Silva", 2, 1, 0, A, "Família", "Confirmado", "", "Sim", "(11) 98888-7777", "", ""],
    ["Carla Souza", 1, 0, 0, B, "Amigos", "Pendente", "", "Não", "", "Vegetariana", ""],
    ["Pedro, Ana e filhos", 2, 0, 2, "Dos dois", "Padrinhos", "Pendente", "5", "Sim", "", "", ""]];
}
function helpRows() {
  const A = state.event.hostA || "Lado A", B = state.event.hostB || "Lado B";
  return [["Coluna", "O que colocar", "Valores aceitos"],
    ["Nome", "Nome do convite: uma pessoa, casal ou família (uma linha por convite)", "Obrigatório"],
    ["Adultos", "Quantos adultos vêm neste convite", "Número. Em branco: 2 se o nome tiver “e”, senão 1"],
    ["Crianças " + (state.event.kidA || "0 a 5 anos"), "Crianças da primeira faixa", "Número"],
    ["Crianças " + (state.event.kidB || "6 a 12 anos"), "Crianças da segunda faixa", "Número"],
    ["Lado", "De quem é o convidado", A + ", " + B + ", Dos dois — ou A / B"],
    ["Grupo", "Família, Amigos, Padrinhos, Trabalho, Equipe do evento…", "Texto livre; grupos novos são criados"],
    ["Situação", "Presença", "Confirmado, Pendente, Não vai (também Sim / Não)"],
    ["Mesa", "Número ou nome da mesa, se já souber", "Mesas que não existirem podem ser criadas"],
    ["Convite enviado", "Se o convite já foi entregue", "Sim / Não"],
    ["Telefone", "Para confirmar presença (abre o WhatsApp)", "Qualquer formato"],
    ["Observações", "Restrição alimentar, acessibilidade, recados", "Texto livre"],
    ["Código", "Preenchido pela ferramenta ao exportar; mantenha para atualizar a lista depois", "Não altere"]];
}
async function downloadTemplate(kind) {
  if (kind === "csv") { download("modelo-convidados.csv", toCsv(templateRows()), "text/csv;charset=utf-8"); return; }
  try {
    await loadScript("vendor/xlsx.full.min.js");
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(templateRows());
    ws["!cols"] = [32, 9, 14, 14, 14, 16, 13, 8, 15, 18, 30, 12].map((w) => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, "Convidados");
    const hs = XLSX.utils.aoa_to_sheet(helpRows());
    hs["!cols"] = [{ wch: 22 }, { wch: 60 }, { wch: 52 }];
    XLSX.utils.book_append_sheet(wb, hs, "Como preencher");
    XLSX.writeFile(wb, "modelo-convidados.xlsx");
  } catch (err) { toast("Não foi possível gerar o Excel; baixando o modelo em CSV", { err: true }); downloadTemplate("csv"); }
}
$("impTemplate").addEventListener("click", () => downloadTemplate("xlsx"));
$("impTemplateCsv").addEventListener("click", () => downloadTemplate("csv"));

/* ── CSV / Excel ── */
function toCsv(rows) {
  const q = (v) => { const s = String(v ?? ""); return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return "﻿" + rows.map((r) => r.map(q).join(";")).join("\r\n");
}
function guestsSorted() { return [...state.guests].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")); }
function byTableRows() {
  const rows = [["Mesa", "Apelido", "Convidado", "Lugares", "Adultos", "Crianças " + (state.event.kidA || "1"), "Crianças " + (state.event.kidB || "2"), "Lado", "Grupo", "Situação", "Observações"]];
  for (const t of sortedTables()) for (const g of occupants(t.id)) rows.push([t.label, t.alias, g.name, seats(g), g.adults, g.kidsA, g.kidsB, sideShort(g.side), groupLabel(g.group), STATUS[g.status], g.notes]);
  for (const g of state.guests.filter((x) => going(x) && !x.table)) rows.push([isStaff(g) ? "Equipe (sem mesa)" : "Sem mesa", "", g.name, seats(g), g.adults, g.kidsA, g.kidsB, sideShort(g.side), groupLabel(g.group), STATUS[g.status], g.notes]);
  return rows;
}
function tablesRows() {
  return [["Mesa", "Apelido", "Formato", "Lugares", "Ocupados", "Livres", "Convidados"]].concat(sortedTables().map((t) => {
    const n = occSeats(t.id);
    return [t.label, t.alias, SHAPES[t.shape], t.cap, n, t.cap - n, occupants(t.id).map((g) => g.name).join("; ")];
  }));
}
function findRows() {
  return [["Nome", "Mesa"]].concat(guestsSorted().filter((g) => going(g) && g.table && !isStaff(g)).map((g) => [g.name, tableFull(tableById(g.table))]));
}
function summaryRows() {
  const go = state.guests.filter((g) => going(g) && !isStaff(g));
  const staff = state.guests.filter((g) => going(g) && isStaff(g));
  const s = (arr, f) => arr.reduce((n, g) => n + f(g), 0);
  return [["Item", "Quantidade"],
    ["Adultos", s(go, (g) => g.adults)],
    ["Crianças " + (state.event.kidA || "faixa 1"), s(go, (g) => g.kidsA)],
    ["Crianças " + (state.event.kidB || "faixa 2"), s(go, (g) => g.kidsB)],
    ["Total de convidados", s(go, (g) => g.adults + g.kidsA + g.kidsB)],
    ["Confirmados (pessoas)", s(go.filter((g) => g.status === "ok"), persons)],
    ["Pendentes (pessoas)", s(go.filter((g) => g.status === "pend"), persons)],
    ["Equipe do evento", s(staff, (g) => g.adults + g.kidsA + g.kidsB)],
    ["Mesas", state.tables.length],
    ["Lugares nas mesas", s(state.tables, (t) => t.cap)]];
}
async function exportXlsx() {
  try {
    await loadScript("vendor/xlsx.full.min.js");
    const wb = XLSX.utils.book_new();
    const add = (rows, name, widths) => { const ws = XLSX.utils.aoa_to_sheet(rows); if (widths) ws["!cols"] = widths.map((w) => ({ wch: w })); XLSX.utils.book_append_sheet(wb, ws, name); };
    add([canonicalHeaders()].concat(guestsSorted().map(guestRow)), "Convidados", [32, 9, 14, 14, 14, 16, 13, 8, 15, 18, 30, 12]);
    add(byTableRows(), "Por mesa", [10, 20, 32, 8, 8, 12, 12, 14, 16, 12, 30]);
    add(tablesRows(), "Mesas", [10, 20, 12, 9, 9, 8, 80]);
    add(findRows(), "Encontre sua mesa", [36, 24]);
    add(summaryRows(), "Resumo", [30, 12]);
    wb.Props = { Title: displayTitle(), Author: "Mapa de Mesas" };
    XLSX.writeFile(wb, fileBase() + "-convidados.xlsx");
    toast("Planilha Excel gerada");
  } catch (err) { console.error(err); toast("Não foi possível gerar o Excel", { err: true }); }
}
function exportCsv(kind) {
  if (kind === "mesas") download(fileBase() + "-por-mesa.csv", toCsv(byTableRows()), "text/csv;charset=utf-8");
  else download(fileBase() + "-convidados.csv", toCsv([canonicalHeaders()].concat(guestsSorted().map(guestRow))), "text/csv;charset=utf-8");
  toast("CSV gerado (abre no Excel e no Google Planilhas)");
}
async function copyByTableText() {
  const lines = ["*" + displayTitle() + "*" + (eventSubtitle() ? " — " + eventSubtitle() : ""), ""];
  for (const t of sortedTables()) {
    const occ = occupants(t.id);
    if (!occ.length) continue;
    lines.push("*" + tableFull(t) + "* (" + occSeats(t.id) + "/" + t.cap + ")");
    occ.forEach((g) => lines.push("• " + g.name + (persons(g) > 1 ? " (" + persons(g) + ")" : "")));
    lines.push("");
  }
  try { await navigator.clipboard.writeText(lines.join("\n")); toast("Lista por mesa copiada — cole no WhatsApp ou e-mail"); }
  catch (e) { download(fileBase() + "-por-mesa.txt", lines.join("\n"), "text/plain;charset=utf-8"); }
}

/* ── Desenho da planta em SVG (para imagem e impressão) ── */
function mixWhite(hex, pct) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c + (255 - c) * (1 - pct)));
  return "#" + ch.map((c) => c.toString(16).padStart(2, "0")).join("");
}
function floorSvg(opts) {
  opts = opts || {};
  const W = FW(), H = FH(), th = state.theme;
  const col = { a: th.colorA, b: th.colorB, n: "#a1a1aa" };
  const fillOf = (f) => { const [kind, k] = f.split("-"); return kind === "a" ? col[k] : mixWhite(col[k], 0.35); };
  const stroke = { empty: "#d4d4d8", partial: th.accent, full: "#10b981", over: "#f43f5e" };
  let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" font-family="Segoe UI, Helvetica, Arial, sans-serif">';
  s += '<rect width="' + W + '" height="' + H + '" fill="#ffffff"/>';
  if (bgData && state.settings.bg) s += '<image href="' + bgData + '" x="0" y="0" width="' + W + '" height="' + H + '" preserveAspectRatio="none" opacity="' + (state.floor.bg ? state.floor.bg.opacity : 0.6) + '"/>';
  if (state.settings.zones) for (const z of state.zones) {
    const x = (z.x / 100) * W, y = (z.y / 100) * H, w = (z.w / 100) * W, h = (z.h / 100) * H;
    if (z.shape === "rect") s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8" fill="#fafafa" fill-opacity=".85" stroke="#a1a1aa" stroke-width="1.5" stroke-dasharray="5 4"/>';
    if (z.shape === "ellipse") s += '<ellipse cx="' + (x + w / 2) + '" cy="' + (y + h / 2) + '" rx="' + w / 2 + '" ry="' + h / 2 + '" fill="#fafafa" fill-opacity=".85" stroke="#a1a1aa" stroke-width="1.5" stroke-dasharray="5 4"/>';
    const fs = z.shape === "text" ? clamp(h * 0.42, 11, 44) : 12;
    s += '<text x="' + (x + w / 2) + '" y="' + (y + h / 2) + '" text-anchor="middle" dominant-baseline="central" font-size="' + fs + '" font-weight="600" fill="' + (z.shape === "text" ? "#3f3f46" : "#71717a") + '">' + esc(z.label) + "</text>";
  }
  for (const t of state.tables) {
    const G = tableGeo(t), cx = (t.x / 100) * W, cy = (t.y / 100) * H;
    const occ = occupants(t.id), n = occSeats(t.id), st = tableStatus(t), fills = seatFills(occ);
    s += '<g transform="translate(' + cx.toFixed(1) + " " + cy.toFixed(1) + ") rotate(" + (t.rot || 0) + ')">';
    if (state.settings.chairs) G.chairs.forEach(([x, y], i) => {
      const f = fills[i];
      s += '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="4.5" fill="' + (f ? fillOf(f) : "#ffffff") + '" stroke="' + (f ? fillOf(f) : "#d4d4d8") + '" stroke-width="1.5"/>';
    });
    const sa = 'fill="#ffffff" stroke="' + stroke[st] + '" stroke-width="2"' + (st === "empty" ? ' stroke-dasharray="4 3"' : "");
    if (t.shape === "round") s += '<circle r="' + G.w / 2 + '" ' + sa + "/>";
    else if (t.shape === "oval") s += '<ellipse rx="' + G.w / 2 + '" ry="' + G.h / 2 + '" ' + sa + "/>";
    else s += '<rect x="' + -G.w / 2 + '" y="' + -G.h / 2 + '" width="' + G.w + '" height="' + G.h + '" rx="6" ' + sa + "/>";
    s += "</g>";
    const names = opts.names !== false && occ.length && G.h >= 44 ? occ.slice(0, Math.max(1, Math.floor((Math.min(G.w, G.h) - 26) / 8))) : [];
    const top = cy - (names.length * 7.5) / 2 - 6;
    s += '<text x="' + cx + '" y="' + (names.length ? top : cy - 2) + '" text-anchor="middle" font-size="' + (names.length ? 10 : 15) + '" font-weight="700" fill="#18181b">' + esc(t.label) + "</text>";
    names.forEach((g, i) => { s += '<text x="' + cx + '" y="' + (top + 10 + i * 7.5) + '" text-anchor="middle" font-size="6.2" fill="#3f3f46">' + esc(shortName(g.name)) + "</text>"; });
    s += '<text x="' + cx + '" y="' + (names.length ? top + 12 + names.length * 7.5 : cy + 12) + '" text-anchor="middle" font-size="' + (names.length ? 7 : 9) + '" fill="#71717a">' + n + "/" + t.cap + "</text>";
  }
  return s + "</svg>";
}
async function exportPng() {
  try {
    const svg = floorSvg({ names: true });
    const img = await decodeImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
    const k = clamp(3000 / FW(), 1.5, 3);
    const c = document.createElement("canvas");
    c.width = Math.round(FW() * k); c.height = Math.round(FH() * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    c.toBlob((b) => { download(fileBase() + "-planta.png", b); toast("Imagem da planta gerada"); }, "image/png");
  } catch (err) { console.error(err); toast("Não foi possível gerar a imagem", { err: true }); }
}

/* ── Impressão / PDF ── */
const PRINT_TITLES = { mesas: "Lista por mesa", alfa: "Encontre sua mesa", recepcao: "Lista de presença", placas: "Placas das mesas", planta: "Planta do salão", resumo: "Resumo para o buffet" };
function printDoc(kind) {
  const pv = $("printView");
  const head = '<div class="phead"><div class="ptitle">' + esc(displayTitle()) + '</div><div class="pkind">' + esc(PRINT_TITLES[kind]) + '</div><div class="psub">' +
    esc([eventSubtitle(), "impresso em " + new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())].filter(Boolean).join(" · ")) + "</div></div>";
  let body = "", landscape = false;
  const kidsTxt = (g) => (totalKids(g) ? ' <span class="pk">(' + esc(personDetail(g)) + ")</span>" : "");
  const noteTxt = (g) => (g.notes ? ' <span class="pnote">— ' + esc(g.notes) + "</span>" : "");
  const sumP = (arr) => arr.reduce((n, g) => n + persons(g), 0);
  const going_ = state.guests.filter(going);
  if (kind === "mesas") {
    body = '<div class="pgrid">' + sortedTables().map((t) => {
      const occ = occupants(t.id);
      if (!occ.length) return "";
      return "<section><h2><span>" + esc(tableName(t)) + (t.alias ? ' <span class="pal">· ' + esc(t.alias) + "</span>" : "") + "</span><span>" + plural(sumP(occ), "pessoa", "pessoas") + " · " + occSeats(t.id) + "/" + t.cap + "</span></h2><ol>" +
        occ.map((g) => "<li>" + esc(g.name) + " — " + persons(g) + kidsTxt(g) + noteTxt(g) + "</li>").join("") + "</ol>" + (t.notes ? '<p class="pnotes">' + esc(t.notes) + "</p>" : "") + "</section>";
    }).join("");
    const sem = going_.filter((g) => !g.table && !isStaff(g));
    if (sem.length) body += "<section><h2><span>Sem mesa</span><span>" + plural(sumP(sem), "pessoa", "pessoas") + "</span></h2><ol>" + sem.map((g) => "<li>" + esc(g.name) + " — " + persons(g) + noteTxt(g) + "</li>").join("") + "</ol></section>";
    const staff = going_.filter((g) => !g.table && isStaff(g));
    if (staff.length) body += "<section><h2><span>Equipe do evento (sem mesa)</span><span>" + plural(sumP(staff), "pessoa", "pessoas") + "</span></h2><ol>" + staff.map((g) => "<li>" + esc(g.name) + " — " + persons(g) + noteTxt(g) + "</li>").join("") + "</ol></section>";
    body += "</div>";
  } else if (kind === "alfa") {
    // cada pessoa do casal aparece pelo próprio nome: "Roberto Souza" acha "Cláudia e Roberto Souza"
    const entries = [];
    for (const g of going_) {
      if (!g.table || isStaff(g)) continue;
      const t = tableById(g.table);
      entries.push({ n: g.name, t });
      const parts = g.name.replace(/\(.*?\)/g, " ").split(/ e | & /i).map((x) => x.trim()).filter(Boolean);
      if (parts.length === 2) {
        const w1 = parts[0].split(/\s+/), w2 = parts[1].split(/\s+/);
        const second = w2.length > 1 ? parts[1] : w1.length > 1 ? w2[0] + " " + w1.slice(1).join(" ") : "";
        if (second && norm(second.split(" ")[0]) !== norm(w1[0])) entries.push({ n: second, t, ref: w1[0] });
      }
    }
    entries.sort((a, b) => a.n.localeCompare(b.n, "pt-BR"));
    let last = "";
    body = '<div class="pgrid c2 big">' + entries.map((x) => {
      const L = norm(x.n).charAt(0).toUpperCase();
      const letter = L !== last ? '<div class="alpha-letter">' + esc(L) + "</div>" : "";
      last = L;
      return letter + '<div class="alpha-row"><span>' + esc(x.n) + (x.ref ? ' <span class="pk">(com ' + esc(x.ref) + ")</span>" : "") + "</span><b>" + esc(tableName(x.t)) + "</b></div>";
    }).join("") + "</div>";
  } else if (kind === "recepcao") {
    body = '<table class="psum"><thead><tr><th style="width:28px"></th><th>Nome</th><th class="n">Pessoas</th><th>Crianças</th><th>Mesa</th><th>Situação</th><th>Observações</th></tr></thead><tbody>' +
      guestsSorted().filter((g) => going(g) && !isStaff(g)).map((g) => {
        const k = [g.kidsA ? g.kidsA + " (" + (state.event.kidA || "faixa 1") + ")" : "", g.kidsB ? g.kidsB + " (" + (state.event.kidB || "faixa 2") + ")" : ""].filter(Boolean).join(", ");
        return "<tr><td>☐</td><td>" + esc(g.name) + '</td><td class="n">' + persons(g) + "</td><td>" + esc(k) + "</td><td>" + esc(g.table ? tableName(tableById(g.table)) : "—") + "</td><td>" + (g.status === "ok" ? "Confirmado" : "<b>Pendente</b>") + "</td><td>" + esc(g.notes) + "</td></tr>";
      }).join("") + "</tbody></table>";
  } else if (kind === "placas") {
    body = '<div class="placas">' + sortedTables().map((t) => {
      const occ = occupants(t.id);
      return '<div class="placa"><div class="pt">' + esc(displayTitle()) + '</div><div class="pa">' + (isNumLabel(t.label) ? "Mesa" : "") + '</div><div class="pn">' + esc(t.label) + "</div>" + (t.alias ? '<div class="pa">' + esc(t.alias) + "</div>" : "") +
        "<ul>" + occ.map((g) => "<li>" + esc(g.name) + "</li>").join("") + "</ul></div>";
    }).join("") + "</div>";
  } else if (kind === "planta") {
    landscape = FW() >= FH();
    body = '<div class="pplan">' + floorSvg({ names: true }) + "</div>";
  } else if (kind === "resumo") {
    const row = (label, arr, cls) => {
      const a = arr.reduce((n, g) => n + g.adults, 0), ka = arr.reduce((n, g) => n + g.kidsA, 0), kb = arr.reduce((n, g) => n + g.kidsB, 0);
      const pend = arr.filter((g) => g.status === "pend").reduce((n, g) => n + persons(g), 0);
      return "<tr" + (cls ? ' class="' + cls + '"' : "") + "><td>" + label + '</td><td class="n">' + a + '</td><td class="n">' + ka + '</td><td class="n">' + kb + '</td><td class="n"><b>' + (a + ka + kb) + '</b></td><td class="n">' + (pend || "") + "</td></tr>";
    };
    const guestsGo = going_.filter((g) => !isStaff(g));
    const staffGo = going_.filter(isStaff);
    const noted = guestsSorted().filter((g) => going(g) && g.notes);
    body = '<table class="psum"><tbody>' + summaryRows().slice(1).map((r, i) => "<tr" + (i === 3 ? ' class="tot"' : "") + "><td>" + esc(r[0]) + '</td><td class="n">' + nf.format(r[1]) + "</td></tr>").join("") + "</tbody></table>" +
      '<table class="psum"><thead><tr><th>Mesa</th><th class="n">Adultos</th><th class="n">' + esc(state.event.kidA || "Crianças 1") + '</th><th class="n">' + esc(state.event.kidB || "Crianças 2") + '</th><th class="n">Total</th><th class="n">Pendentes</th></tr></thead><tbody>' +
      sortedTables().map((t) => row(esc(tableFull(t)), occupants(t.id))).join("") +
      (guestsGo.some((g) => !g.table) ? row("<i>Convidados sem mesa</i>", guestsGo.filter((g) => !g.table)) : "") +
      (staffGo.length ? row("<i>Equipe do evento</i>", staffGo) : "") +
      row("<b>Total</b>", going_, "tot") + "</tbody></table>" +
      (noted.length ? '<h2 style="margin-top:6px">Observações dos convidados</h2><table class="psum"><thead><tr><th>Nome</th><th>Mesa</th><th>Observação</th></tr></thead><tbody>' +
        noted.map((g) => "<tr><td>" + esc(g.name) + "</td><td>" + esc(g.table ? tableName(tableById(g.table)) : "—") + "</td><td>" + esc(g.notes) + "</td></tr>").join("") + "</tbody></table>" : "");
  }
  pv.className = landscape ? "landscape" : "";
  pv.innerHTML = (landscape ? "<style>@page { size: A4 landscape; margin: 10mm; }</style>" : "") + head + body;
  setTimeout(() => window.print(), 60);
}

/* ── Página "Encontre sua mesa" (arquivo HTML para publicar ou mandar aos convidados) ── */
async function exportGuestPage() {
  const data = guestsSorted().filter((g) => going(g) && g.table && !isStaff(g)).map((g) => [g.name, tableName(tableById(g.table))]);
  if (!data.length) { toast("Ninguém sentado ainda — distribua os convidados nas mesas primeiro", { err: true }); return; }
  const th = state.theme;
  const tf = th.titleFont || "cormorant";
  let fontCss = "", family = "system-ui, sans-serif", weight = 600;
  if (tf !== "sans") {
    try {
      await loadScript("assets/fonts/fontdata.js");
      fontCss = "@font-face{font-family:'Titulo';src:url(data:font/woff2;base64," + window.MDM_FONTS[tf] + ") format('woff2');font-weight:100 900}";
      family = "'Titulo', Georgia, serif";
    } catch (e) { family = "Georgia, serif"; }
    if (tf === "script") weight = 400;
  }
  const acc = accentTextHex(th.accent);
  const html = '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Encontre sua mesa — ' + esc(displayTitle()) + "</title>" +
    "<style>" + fontCss + ":root{--a:" + acc + ";--soft:" + th.accent + "}*{box-sizing:border-box;margin:0}body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#fafafa;color:#18181b;padding:32px 16px 40px}" +
    "main{max-width:560px;margin:0 auto}h1{font-family:" + family + ";font-weight:" + weight + ";font-size:" + (tf === "script" ? "48px" : "38px") + ";text-align:center;line-height:1.1}" +
    ".orn{display:flex;align-items:center;gap:10px;justify-content:center;margin:14px 0 10px}.orn span{height:1px;width:56px;background:color-mix(in srgb,var(--soft) 45%,white)}.orn i{width:6px;height:6px;border-radius:50%;background:var(--soft)}" +
    ".sub{text-align:center;color:#52525b;font-size:15px}.cd{text-align:center;color:var(--a);font-weight:600;font-size:15px;margin:6px 0 24px}" +
    "label{display:block;font-size:14px;color:#52525b;margin-bottom:6px}input{width:100%;font:inherit;font-size:18px;padding:14px 16px;border:1px solid #d4d4d8;border-radius:12px;background:#fff;outline:none}input:focus{border-color:var(--a);box-shadow:0 0 0 3px color-mix(in srgb,var(--soft) 25%,white)}" +
    "ul{list-style:none;padding:0;margin-top:14px;background:#fff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden}ul:empty{display:none}li{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border-top:1px solid #f4f4f5;font-size:16px}li:first-child{border-top:none}" +
    "li b{color:var(--a);white-space:nowrap;font-variant-numeric:tabular-nums;font-size:17px}.msg{padding:18px 16px;text-align:center;color:#52525b;display:block}.hint{text-align:center;color:#71717a;font-size:13px;margin-top:18px}</style></head><body><main>" +
    "<h1>" + esc(displayTitle()) + '</h1><div class="orn" aria-hidden="true"><span></span><i></i><span></span></div><p class="sub">' + esc(eventSubtitle()) + '</p><p class="cd" id="cd"></p>' +
    '<label for="q">Encontre sua mesa</label><input id="q" type="search" placeholder="Digite seu nome" autocomplete="off"><ul id="l" aria-live="polite"></ul><p class="hint">Não encontrou seu nome? Procure a equipe do cerimonial.</p></main>' +
    "<script>const D=" + JSON.stringify(data).replace(/</g, "\\u003c") + ";const E=" + JSON.stringify(state.event.date ? state.event.date + "T" + (state.event.time || "12:00") + ":00" : "") + ";" +
    "const n=s=>s.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().trim();const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));" +
    "function r(){const q=n(document.getElementById('q').value),w=q.split(/\\s+/).filter(Boolean),l=document.getElementById('l');" +
    "if(q.replace(/\\s/g,'').length<3){l.innerHTML=q?'<li class=\"msg\">Continue digitando…</li>':'';return}" +
    "const m=D.filter(x=>{const t=n(x[0]);return w.every(p=>t.includes(p))});" +
    "l.innerHTML=m.slice(0,40).map(x=>'<li><span>'+esc(x[0])+'</span><b>'+esc(x[1])+'</b></li>').join('')||'<li class=\"msg\">Nenhum nome encontrado</li>'}" +
    "document.getElementById('q').addEventListener('input',r);" +
    "if(E){const d=Math.round((new Date(E.slice(0,10)+'T00:00:00')-new Date(new Date().toDateString()))/864e5);document.getElementById('cd').textContent=d>1?'Faltam '+d+' dias':d===1?'É amanhã!':d===0?'É hoje!':''}" +
    "<\/script></body></html>";
  download("encontre-sua-mesa.html", html, "text/html;charset=utf-8");
  toast("Página gerada — mostra a mesa só de quem digita o nome; sem telefones nem notas");
}

/* ── Backup completo (.json) ── */
async function saveBackup() {
  const data = JSON.parse(JSON.stringify(state));
  data.app = "mapa-de-mesas";
  const bg = state.floor.bg ? await idbGet(bgKey(state)) : null;
  if (bg) data.bgImage = bg;
  const d = new Date();
  download(fileBase() + "-backup-" + d.toISOString().slice(0, 10) + ".json", JSON.stringify(data), "application/json");
  state.meta.exportedAt = d.toISOString();
  persist(state);
  lastSnap = JSON.stringify(state);
  renderHeader();
  toast("Backup salvo — guarde o arquivo em local seguro (nuvem, e-mail)");
}
async function openBackupFile(file) {
  if (!file) return;
  let obj;
  try { obj = JSON.parse(await file.text()); } catch (e) { toast("Arquivo inválido — use um backup .json desta ferramenta", { err: true }); return; }
  if (!obj || !Array.isArray(obj.guests) || !Array.isArray(obj.tables)) { toast("Arquivo inválido — use um backup .json desta ferramenta", { err: true }); return; }
  const bg = obj.bgImage;
  delete obj.bgImage;
  delete obj.app;
  let s = obj.event ? normalizeState(obj) : migrateLegacy(obj);
  if (listEvents().some((e) => e.id === s.id)) {
    const v = await choose("Este evento já está salvo neste navegador", "Substituir pela versão do arquivo, ou abrir o arquivo como um evento separado?",
      [{ v: "", label: "Cancelar" }, { v: "copy", label: "Abrir como cópia" }, { v: "replace", label: "Substituir", primary: true }]);
    if (!v) return;
    if (v === "copy") { s.id = uid("e"); s.meta.copy = true; if (s.floor.bg) s.floor.bg.key = null; }
  }
  if (bg && bg.data) {
    const key = "bg:" + s.id + ":" + Date.now().toString(36);
    await idbPut(key, bg);
    if (s.floor.bg) s.floor.bg.key = key; else s.floor.bg = { key, name: bg.name || "planta", w: bg.w, h: bg.h, opacity: 0.6 };
  }
  if (state) persist(state);
  s.meta.exportedAt = new Date().toISOString();
  setState(s, { fresh: true });
  if ($("welcome").open) $("welcome").close();
  afterStateChange();
  if (s.meta.migratedFrom && !s.event.hostA && !s.event.hostB) openEventDlg("dados", "Este backup é da versão anterior. Confira os nomes do casal — eles aparecem nas listas e nas impressões.");
  else toast("Backup aberto: " + displayTitle());
}
$("fileJson").addEventListener("change", () => { const f = $("fileJson").files[0]; $("fileJson").value = ""; openBackupFile(f); });
