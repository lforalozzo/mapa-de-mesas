"use strict";
/* Edição da planta: seleção múltipla, alinhar/distribuir, copiar/colar, ajustes em lote
   e atalhos de teclado para criar mesas e elementos onde o ponteiro está. */

ui.multi = new Set();   // seleção com 2+ itens ("t:<id>" mesa, "z:<id>" área)
ui.clip = null;         // itens copiados
let lastPtr = null;     // última posição do ponteiro sobre o salão (onde os atalhos criam itens)
vp.addEventListener("pointermove", (e) => { lastPtr = { x: e.clientX, y: e.clientY }; });
vp.addEventListener("pointerleave", () => { lastPtr = null; });
const cursorPct = () => (lastPtr ? clientToPct(lastPtr.x, lastPtr.y) : null);

const keyOf = (kind, id) => kind + ":" + id;
function currentKeys() {
  if (ui.multi.size > 1) return [...ui.multi];
  if (ui.openTableId) return [keyOf("t", ui.openTableId)];
  if (ui.openZoneId) return [keyOf("z", ui.openZoneId)];
  return [];
}
function itemsOf(keys) {
  return keys.map((k) => (k[0] === "t" ? { kind: "t", o: tableById(k.slice(2)) } : { kind: "z", o: zoneById(k.slice(2)) })).filter((x) => x.o);
}
const selItems = () => itemsOf(currentKeys());
const selTables = () => selItems().filter((x) => x.kind === "t").map((x) => x.o);
function selectKeys(keys) {
  keys = [...new Set(keys)].filter((k) => itemsOf([k]).length);
  ui.multi = new Set(keys.length > 1 ? keys : []);
  ui.openTableId = keys.length === 1 && keys[0][0] === "t" ? keys[0].slice(2) : null;
  ui.openZoneId = keys.length === 1 && keys[0][0] === "z" ? keys[0].slice(2) : null;
  renderFloor(); renderTablePanel(); renderZonePanel();
}
function toggleKey(k) {
  const cur = currentKeys();
  const i = cur.indexOf(k);
  if (i >= 0) cur.splice(i, 1); else cur.push(k);
  selectKeys(cur);
}
const centerOf = (it) => (it.kind === "t" ? { x: it.o.x, y: it.o.y } : { x: it.o.x + it.o.w / 2, y: it.o.y + it.o.h / 2 });
function setCenter(it, x, y) {
  if (it.kind === "t") { it.o.x = clamp(x, 0.5, 99.5); it.o.y = clamp(y, 0.5, 99.5); }
  else { it.o.x = clamp(x - it.o.w / 2, 0, 100 - it.o.w); it.o.y = clamp(y - it.o.h / 2, 0, 100 - it.o.h); }
}

/* alinhar pela primeira selecionada; distribuir com espaços iguais entre as das pontas */
function alignItems(mode) {
  const its = selItems();
  if (its.length < 2) { toast("Selecione duas ou mais (Shift+clique ou Shift+arrastar)"); return; }
  const cs = its.map(centerOf);
  if (mode === "row") its.forEach((it, i) => setCenter(it, cs[i].x, cs[0].y));
  if (mode === "col") its.forEach((it, i) => setCenter(it, cs[0].x, cs[i].y));
  if (mode === "dh" || mode === "dv") {
    const k = mode === "dh" ? "x" : "y";
    const order = its.map((it, i) => ({ it, c: cs[i] })).sort((a, b) => a.c[k] - b.c[k]);
    const a = order[0].c[k], step = (order[order.length - 1].c[k] - a) / (order.length - 1);
    order.forEach((o, i) => setCenter(o.it, k === "x" ? a + step * i : o.c.x, k === "y" ? a + step * i : o.c.y));
  }
  commit();
}
function setTables(fn, msg) {
  const ts = selTables();
  if (!ts.length) return;
  ts.forEach(fn);
  commit();
  if (msg) toast(plural(ts.length, "mesa", "mesas") + ": " + msg);
}
function stepCap(d) { setTables((t) => { t.cap = clamp(t.cap + d, 1, 60); }); }
function stepScale(d) { setTables((t) => { t.scale = clamp(Math.round(((t.scale || 1) + d) * 100) / 100, 0.5, 2.5); }); }
function rotateSelection(deg) {
  const its = selItems();
  if (!its.length) return false;
  its.forEach((it) => { it.o.rot = ((((it.o.rot || 0) + deg) % 360) + 360) % 360; });
  commit();
  return true;
}
function deleteSelection() {
  const its = selItems();
  if (!its.length) return false;
  if (its.length === 1) { if (its[0].kind === "t") deleteTable(its[0].o); else deleteZone(its[0].o); return true; }
  const tids = new Set(its.filter((x) => x.kind === "t").map((x) => x.o.id));
  const zids = new Set(its.filter((x) => x.kind === "z").map((x) => x.o.id));
  state.guests.forEach((g) => { if (tids.has(g.table)) g.table = null; });
  state.tables = state.tables.filter((t) => !tids.has(t.id));
  state.zones = state.zones.filter((z) => !zids.has(z.id));
  ui.multi.clear(); ui.openTableId = ui.openZoneId = null;
  commit();
  toast(plural(its.length, "item excluído", "itens excluídos"), { action: { label: "Desfazer", fn: undo } });
  return true;
}
function copySelection() {
  const its = selItems();
  if (!its.length) return false;
  ui.clip = its.map((it) => ({ kind: it.kind, d: JSON.parse(JSON.stringify(it.o)) }));
  toast(plural(its.length, "item copiado", "itens copiados") + " — Ctrl+V cola onde o ponteiro estiver");
  return true;
}
function pasteClip(at) {
  if (!ui.clip || !ui.clip.length) return false;
  const cs = ui.clip.map((c) => (c.kind === "t" ? { x: c.d.x, y: c.d.y } : { x: c.d.x + c.d.w / 2, y: c.d.y + c.d.h / 2 }));
  const cx = cs.reduce((n, c) => n + c.x, 0) / cs.length, cy = cs.reduce((n, c) => n + c.y, 0) / cs.length;
  const target = at || cursorPct() || { x: cx + 4, y: cy + 4 };
  const keys = [];
  ui.clip.forEach((c, i) => {
    const d = JSON.parse(JSON.stringify(c.d));
    const it = { kind: c.kind, o: d };
    if (c.kind === "t") { d.id = uid("t"); d.label = nextTableLabel(); state.tables.push(d); }
    else { d.id = uid("z"); state.zones.push(d); }
    setCenter(it, cs[i].x + target.x - cx, cs[i].y + target.y - cy);
    keys.push(keyOf(c.kind, d.id));
  });
  if (ui.mode !== "plan") setMode("plan");
  commit();
  selectKeys(keys);
  return true;
}
function duplicateSelection() {
  const keep = ui.clip;
  const its = selItems();
  if (!its.length) return false;
  ui.clip = its.map((it) => ({ kind: it.kind, d: JSON.parse(JSON.stringify(it.o)) }));
  const cs = its.map(centerOf);
  pasteClip({ x: cs.reduce((n, c) => n + c.x, 0) / cs.length + 4, y: cs.reduce((n, c) => n + c.y, 0) / cs.length + 4 });
  ui.clip = keep;
  return true;
}
function selectAllTables() {
  if (ui.mode !== "plan") setMode("plan");
  selectKeys(state.tables.map((t) => keyOf("t", t.id)));
  toast(plural(state.tables.length, "mesa selecionada", "mesas selecionadas"));
}

/* ── Painel de vários itens ── */
function renderMultiPanel() {
  const p = $("mpanel");
  const its = ui.view === "salao" && ui.mode === "plan" && ui.multi.size > 1 ? itemsOf([...ui.multi]) : [];
  if (its.length < 2) { p.classList.remove("open"); return; }
  if (!p.classList.contains("open")) placePanel(p, centerOf(its[0]).x);
  p.classList.add("open");
  const ts = its.filter((x) => x.kind === "t").map((x) => x.o);
  $("mpTitle").textContent = plural(its.length, "item selecionado", "itens selecionados");
  $("mpTables").hidden = !ts.length;
  if (ts.length) {
    const same = (f) => (ts.every((t) => f(t) === f(ts[0])) ? String(f(ts[0])) : "");
    $("mpCap").value = same((t) => t.cap);
    $("mpShape").value = same((t) => t.shape);
    $("mpScale").value = Math.round((ts[0].scale || 1) * 100);
    $("mpScaleV").textContent = Math.round((ts[0].scale || 1) * 100) + "%";
  }
}
$("mpanel").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mp]");
  if (!b) return;
  const a = b.dataset.mp;
  if (a === "close") selectKeys([]);
  else if (["row", "col", "dh", "dv"].includes(a)) alignItems(a);
  else if (a === "rot") rotateSelection(90);
  else if (a === "dup") duplicateSelection();
  else if (a === "del") deleteSelection();
});
$("mpCap").addEventListener("change", () => { const v = int0($("mpCap").value); if (v) setTables((t) => { t.cap = v; }, v + " lugares"); });
$("mpShape").addEventListener("change", () => { const v = $("mpShape").value; if (v) setTables((t) => { t.shape = v; }, SHAPES[v].toLowerCase()); });
$("mpScale").addEventListener("input", () => {
  const k = +$("mpScale").value / 100;
  $("mpScaleV").textContent = $("mpScale").value + "%";
  selTables().forEach((t) => { t.scale = k; refreshTspot(t); });
});
$("mpScale").addEventListener("change", () => commit());
makePanelDraggable($("mpanel"));

/* ── Atalhos da edição da planta ── */
const ZONE_KEYS = { a: "rect", o: "ellipse", v: "triangle", t: "text" };
function planKey(e) {
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (mod) {
    if (k === "a" && ui.view === "salao") { e.preventDefault(); selectAllTables(); return true; }
    if (ui.mode !== "plan") return false;
    if (k === "c") { if (copySelection()) e.preventDefault(); return true; }
    if (k === "v") { e.preventDefault(); if (!pasteClip()) toast("Nada copiado — selecione e use Ctrl+C"); return true; }
    if (k === "d") { e.preventDefault(); duplicateSelection(); return true; }
    return false;
  }
  if (e.altKey || ui.mode !== "plan") return false;
  // criar: 1–4 mesas, A/O/V/T elementos, C cobrir a planta (no ponteiro, se estiver sobre o salão)
  const digit = /^Digit([1-4])$/.exec(e.code);
  if (digit && !e.shiftKey) {
    const shape = ["round", "rect", "square", "oval"][+digit[1] - 1];
    addTable(shape, cursorPct() || undefined);
    ui.multi.clear();
    return true;
  }
  if (digit && e.shiftKey && ui.mode === "plan" && selTables().length) {
    const shape = ["round", "rect", "square", "oval"][+digit[1] - 1];
    setTables((t) => { t.shape = shape; }, SHAPES[shape].toLowerCase());
    return true;
  }
  if (ZONE_KEYS[k] && !e.shiftKey) { addZone(ZONE_KEYS[k], cursorPct() || undefined); ui.multi.clear(); return true; }
  if (k === "c" && !e.shiftKey) { setDrawMask(!ui.drawMask); return true; }
  if (ui.mode !== "plan") return false;
  const its = selItems();
  if (!its.length) return false;
  if (e.key.startsWith("Arrow")) {
    e.preventDefault();
    const st = e.shiftKey ? 5 : 1;
    nudgeSelected(e.key === "ArrowLeft" ? -st : e.key === "ArrowRight" ? st : 0, e.key === "ArrowUp" ? -st : e.key === "ArrowDown" ? st : 0);
    return true;
  }
  if (k === "r") { rotateSelection(e.shiftKey ? 90 : 15); return true; }
  if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); deleteSelection(); return true; }
  if (e.key === "]") { stepCap(1); return true; }
  if (e.key === "[") { stepCap(-1); return true; }
  if (e.key === "}") { stepScale(0.1); return true; }
  if (e.key === "{") { stepScale(-0.1); return true; }
  if (e.key === "F2") {
    e.preventDefault();
    if (ui.openTableId) { $("tpMore").open = true; $("tpLabel").focus(); $("tpLabel").select(); }
    else if (ui.openZoneId && !isMask(zoneById(ui.openZoneId))) { $("zpName").focus(); $("zpName").select(); }
    return true;
  }
  return false;
}

function zoneAddItems() {
  return [
    { label: "Área retangular", icon: "area", kbd: "A", desc: "Pista, bar, palco, buffet…", action: () => addZone("rect", cursorPct() || undefined) },
    { label: "Área oval", icon: "oval", kbd: "O", action: () => addZone("ellipse") },
    { label: "Triângulo", icon: "triangle", kbd: "V", action: () => addZone("triangle") },
    { label: "Texto", icon: "text", kbd: "T", action: () => addZone("text") },
    bgData ? "-" : null,
    bgData ? { label: "Desenhar coberturas na planta", icon: "eraser", kbd: "C", checked: !!ui.drawMask, action: () => setDrawMask(!ui.drawMask) } : null
  ];
}
bindMenuButton($("btnZone"), zoneAddItems);
