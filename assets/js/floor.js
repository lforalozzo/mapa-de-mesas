"use strict";
/* Salão: desenho das mesas e áreas, zoom/arrasto, edição da planta e imagem de fundo. */

const CHAIR = 9;   // diâmetro da cadeira (px lógicos)
const SNAP = 10;   // passo da grade de encaixe (px lógicos)
const vp = $("viewport");
const floorEl = $("floor");
const itemsEl = $("floorItems");
const floorBgEl = $("floorBg");
const FW = () => state.floor.w || 1300;
const FH = () => state.floor.h || 900;
let fit = 1, zoom = 1, tx = 0, ty = 0;
let bgVersion = 0, bgShown = -1;

/* ── Geometria: corpo da mesa + posição de cada cadeira (relativas ao centro) ── */
function tableGeo(t) {
  const k = clamp(t.scale || 1, 0.5, 2.5);
  const cap = t.cap;
  const chairs = [];
  let w, h;
  if (t.shape === "rect") {
    const top = Math.ceil(cap / 2), bot = cap - top;
    w = Math.max(112 * k, top * 17 + 12);
    h = 52 * k;
    const span = w - 16;
    const row = (n, y) => { for (let i = 0; i < n; i++) chairs.push([n === 1 ? 0 : -span / 2 + (i * span) / (n - 1), y]); };
    row(top, -(h / 2 + 6));
    row(bot, h / 2 + 6);
  } else if (t.shape === "square") {
    const per = [0, 0, 0, 0]; // topo, direita, base, esquerda
    for (let i = 0; i < cap; i++) per[[0, 2, 1, 3][i % 4]]++;
    w = h = Math.max(64 * k, Math.max(...per) * 17 + 14);
    const span = w - 18, off = w / 2 + 6;
    const line = (n, f) => { for (let i = 0; i < n; i++) chairs.push(f(n === 1 ? 0 : -span / 2 + (i * span) / (n - 1))); };
    line(per[0], (p) => [p, -off]);
    line(per[1], (p) => [off, p]);
    line(per[2], (p) => [-p, off]);
    line(per[3], (p) => [-off, -p]);
  } else if (t.shape === "oval") {
    w = Math.max(96 * k, cap * 9.5);
    h = w / 2;
    const rx = w / 2 + 7, ry = h / 2 + 7;
    for (let i = 0; i < cap; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / cap; chairs.push([rx * Math.cos(a), ry * Math.sin(a)]); }
  } else {
    const r = Math.max(38 * k, (cap * 13) / (2 * Math.PI) - 4);
    w = h = 2 * r;
    for (let i = 0; i < cap; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / cap; chairs.push([(r + 6) * Math.cos(a), (r + 6) * Math.sin(a)]); }
  }
  let ex = w / 2, ey = h / 2;
  for (const [x, y] of chairs) { ex = Math.max(ex, Math.abs(x) + CHAIR / 2 + 1); ey = Math.max(ey, Math.abs(y) + CHAIR / 2 + 1); }
  return { w, h, chairs, W: 2 * ex + 4, H: 2 * ey + 4 };
}

function hitTables() {
  const hits = new Set();
  const q = norm(ui.q), w = qWords(q);
  const tq = q.replace(/^mesa\s+/, "");
  if (q.length >= 2 || /^\d+$/.test(q)) {
    for (const g of state.guests) if (g.table && going(g) && textMatch(g.name, w)) hits.add(g.table);
    for (const t of state.tables) if (norm(t.label) === tq || (q.length >= 2 && t.alias && textMatch(t.alias, w))) hits.add(t.id);
  }
  const sel = ui.selectedId && guestById(ui.selectedId);
  if (sel && sel.table) hits.add(sel.table);
  return hits;
}

function tspotHtml(t, hits) {
  const G = tableGeo(t);
  const occ = occupants(t.id);
  const n = occ.reduce((s, g) => s + seats(g), 0);
  const st = n === 0 ? "empty" : n > t.cap ? "over" : n === t.cap ? "full" : "partial";
  const fills = seatFills(occ);
  const cx = G.W / 2, cy = G.H / 2;
  const rad = (((t.rot || 0) % 360) * Math.PI) / 180;
  const BW = Math.abs(Math.cos(rad)) * G.W + Math.abs(Math.sin(rad)) * G.H;
  const BH = Math.abs(Math.sin(rad)) * G.W + Math.abs(Math.cos(rad)) * G.H;
  const chairs = G.chairs.map(([x, y], i) =>
    '<i class="chair' + (i < fills.length ? " " + fills[i] : "") + '" style="left:' + (cx + x).toFixed(1) + "px;top:" + (cy + y).toFixed(1) + 'px"></i>').join("");
  const rot = (((t.rot || 0) % 360) + 360) % 360;
  const sideways = (rot > 45 && rot < 135) || (rot > 225 && rot < 315);
  let lw, lh;
  if (t.shape === "round") { lw = G.w * 0.8; lh = G.h * 0.82; }
  else if (t.shape === "oval") { lw = G.w * 0.76; lh = G.h * 0.92; }
  else { lw = G.w - 8; lh = G.h - 4; }
  if (sideways && t.shape !== "round" && t.shape !== "square") [lw, lh] = [lh, lw];
  const wide = lw > 92;
  const stacked = t.shape === "round" || t.shape === "square" || lh > lw * 0.9;
  const rows = Math.max(1, Math.floor((lh - (stacked ? 30 : 16)) / 8.5));
  const maxN = rows * (wide ? 2 : 1);
  let names;
  if (!occ.length) names = '<span class="tfree">Livre · ' + t.cap + " lugares</span>";
  else {
    let shown = occ, more = 0;
    if (occ.length > maxN) { shown = occ.slice(0, Math.max(1, maxN - 1)); more = occ.length - shown.length; }
    names = '<div class="tnames' + (wide ? " two" : "") + '">' + shown.map((g) =>
      "<span>" + (totalKids(g) ? '<i class="kd"></i>' : "") + esc(shortName(g.name)) + ' <span class="gseat">·' + seats(g) + "</span></span>").join("") +
      (more ? '<span class="more">+ ' + more + "</span>" : "") + "</div>";
  }
  const num = '<span class="tnum' + (String(t.label).length > 3 ? " long" : "") + '">' + esc(t.label) + "</span>";
  const tag = '<span class="tocc num">' + n + "/" + t.cap + "</span>";
  const alias = t.alias ? '<span class="talias">' + esc(t.alias) + "</span>" : "";
  const label = stacked ? num + alias + names + tag : '<span class="thead">' + num + tag + "</span>" + alias + names;
  const cls = "tspot " + t.shape + " " + st +
    (t.id === ui.openTableId ? " open" : hits.has(t.id) ? " hit" : "") +
    (ui.selectedId && ui.mode === "seat" ? " selmode" : "");
  const aria = tableName(t) + (t.alias ? ", " + t.alias : "") + ", " + n + " de " + t.cap + " lugares";
  return '<div class="' + cls + '" data-id="' + t.id + '" role="button" tabindex="0" aria-label="' + esc(aria) + '" style="left:' + ((t.x / 100) * FW()).toFixed(1) + "px;top:" + ((t.y / 100) * FH()).toFixed(1) + "px;width:" + BW.toFixed(0) + "px;height:" + BH.toFixed(0) + 'px">' +
    '<div class="trot" style="width:' + G.W.toFixed(0) + "px;height:" + G.H.toFixed(0) + "px;left:" + ((BW - G.W) / 2).toFixed(1) + "px;top:" + ((BH - G.H) / 2).toFixed(1) + "px" + (rot ? ";transform:rotate(" + rot + "deg)" : "") + '">' + chairs +
    '<div class="tshape" style="width:' + G.w.toFixed(0) + "px;height:" + G.h.toFixed(0) + 'px"></div></div>' +
    '<div class="tlabel" style="width:' + lw.toFixed(0) + "px;height:" + lh.toFixed(0) + 'px">' + label + "</div>" +
    '<i class="handle" aria-hidden="true"></i></div>';
}
function zoneHtml(z) {
  const w = (z.w / 100) * FW(), h = (z.h / 100) * FH();
  const fs = ' font-size:' + (z.shape === "text" ? clamp(h * 0.42, 11, 44) : clamp(Math.min(w, h) * 0.11, 11, 22)).toFixed(0) + "px;";
  return '<div class="zone' + (z.shape === "ellipse" ? " ellipse" : z.shape === "text" ? " text" : "") + (z.id === ui.openZoneId && ui.mode === "plan" ? " zopen" : "") +
    '" data-zid="' + z.id + '" style="left:' + ((z.x / 100) * FW()).toFixed(1) + "px;top:" + ((z.y / 100) * FH()).toFixed(1) + "px;width:" + w.toFixed(1) + "px;height:" + h.toFixed(1) + "px;" + fs + '"><span>' + esc(z.label) + '</span><i class="handle" aria-hidden="true"></i></div>';
}
function refreshTspot(t) {
  const el = itemsEl.querySelector('.tspot[data-id="' + t.id + '"]');
  if (!el) return null;
  el.outerHTML = tspotHtml(t, new Set());
  return itemsEl.querySelector('.tspot[data-id="' + t.id + '"]');
}

function renderFloor() {
  if (!state) return;
  floorEl.style.width = FW() + "px";
  floorEl.style.height = FH() + "px";
  const hits = hitTables();
  hits.delete(ui.openTableId);
  itemsEl.innerHTML = state.zones.map(zoneHtml).join("") + state.tables.map((t) => tspotHtml(t, hits)).join("");
  const plan = ui.mode === "plan";
  floorEl.classList.toggle("plan", plan);
  floorEl.classList.toggle("snap", plan && !!state.settings.snap);
  floorEl.classList.toggle("no-chairs", !state.settings.chairs);
  floorEl.classList.toggle("no-zones", !state.settings.zones && !plan);
  floorEl.classList.toggle("no-bg", !state.settings.bg);
  vp.classList.toggle("plan", plan);
  if (bgData) {
    if (bgShown !== bgVersion) { floorBgEl.src = bgData; bgShown = bgVersion; }
    floorBgEl.hidden = false;
    floorBgEl.style.opacity = state.floor.bg ? state.floor.bg.opacity : 0.6;
  } else { floorBgEl.hidden = true; floorBgEl.removeAttribute("src"); bgShown = -1; }
  $("emptyFloor").hidden = !!(state.tables.length || bgData || state.zones.length);
  $("editHint").hidden = !plan;
  $("bgOpacityWrap").hidden = !bgData;
  if (bgData) $("bgOpacity").value = Math.round((state.floor.bg ? state.floor.bg.opacity : 0.6) * 100);
  $("btnSnap").setAttribute("aria-pressed", state.settings.snap ? "true" : "false");
}

/* ── Zoom e deslocamento ── */
const scaleNow = () => fit * zoom;
function setLvl() {
  const mode = state.settings.names, s = scaleNow();
  floorEl.dataset.lvl = mode === "always" ? "near" : mode === "never" ? "far" : s < 1.25 ? "far" : s < 2.2 ? "mid" : "near";
  $("zoomLbl").textContent = Math.round(zoom * 100) + "%";
}
function clampPan() {
  const r = vp.getBoundingClientRect();
  const W = FW() * scaleNow(), H = FH() * scaleNow(), m = 80;
  tx = W <= r.width ? (r.width - W) / 2 : clamp(tx, r.width - W - m, m);
  ty = H <= r.height ? (r.height - H) / 2 : clamp(ty, r.height - H - m, m);
}
function applyView() {
  clampPan();
  floorEl.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scaleNow() + ")";
  setLvl();
}
function animView() { floorEl.classList.add("anim"); setTimeout(() => floorEl.classList.remove("anim"), 380); }
function contentBox() {
  if (bgData || (!state.tables.length && !state.zones.length)) return { x: 0, y: 0, w: FW(), h: FH() };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of state.tables) {
    const G = tableGeo(t), cx = (t.x / 100) * FW(), cy = (t.y / 100) * FH(), m = Math.max(G.W, G.H) / 2;
    x0 = Math.min(x0, cx - m); x1 = Math.max(x1, cx + m); y0 = Math.min(y0, cy - m); y1 = Math.max(y1, cy + m);
  }
  if (state.settings.zones) for (const z of state.zones) {
    x0 = Math.min(x0, (z.x / 100) * FW()); y0 = Math.min(y0, (z.y / 100) * FH());
    x1 = Math.max(x1, ((z.x + z.w) / 100) * FW()); y1 = Math.max(y1, ((z.y + z.h) / 100) * FH());
  }
  const pad = 40;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(FW(), x1 + pad); y1 = Math.min(FH(), y1 + pad);
  return { x: x0, y: y0, w: Math.max(200, x1 - x0), h: Math.max(160, y1 - y0) };
}
function fitView() {
  const r = vp.getBoundingClientRect();
  if (!r.width || !r.height || !state) return;
  const b = contentBox();
  fit = Math.min(r.width / b.w, r.height / b.h) * 0.96;
  zoom = 1;
  tx = r.width / 2 - (b.x + b.w / 2) * fit;
  ty = r.height / 2 - (b.y + b.h / 2) * fit;
  applyView();
}
function zoomAt(mx, my, f, anim) {
  const z2 = clamp(zoom * f, 0.6, 8);
  if (z2 === zoom) return;
  const k = z2 / zoom;
  tx = mx - (mx - tx) * k;
  ty = my - (my - ty) * k;
  zoom = z2;
  if (anim) animView();
  applyView();
}
function zoomCenter(f) { const r = vp.getBoundingClientRect(); zoomAt(r.width / 2, r.height / 2, f, true); }
function centerOn(tid, zTarget) {
  const t = tableById(tid);
  if (!t) return;
  const r = vp.getBoundingClientRect();
  zoom = Math.max(zoom, zTarget || 1.8);
  const s = scaleNow();
  tx = r.width / 2 - (t.x / 100) * FW() * s;
  ty = r.height / 2 - (t.y / 100) * FH() * s;
  animView();
  applyView();
}
function clientToPct(cx, cy) {
  const r = vp.getBoundingClientRect(), s = scaleNow();
  return { x: clamp((((cx - r.left - tx) / s) / FW()) * 100, 1, 99), y: clamp((((cy - r.top - ty) / s) / FH()) * 100, 1, 99) };
}
function viewCenterPct() { const r = vp.getBoundingClientRect(); return clientToPct(r.left + r.width / 2, r.top + r.height / 2); }
vp.addEventListener("wheel", (e) => {
  e.preventDefault();
  const r = vp.getBoundingClientRect();
  if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)));
  else { tx -= e.deltaX; applyView(); }
}, { passive: false });

/* ── Ponteiro: arrastar fundo, mesas, áreas; pinça para zoom ── */
const ptrs = new Map();
let panStart = null, pinchStart = null, panMoved = false;
let tableDrag = null, tableResize = null, zoneDrag = null, zoneResize = null, swapDrag = null;
const floorBusy = () => panMoved && ptrs.size > 0;
// capturar o ponteiro só quando o arrasto começa — capturar já no pointerdown
// redireciona o clique para o viewport e a mesa nunca recebe o click.
const capture = (id) => { try { vp.setPointerCapture(id); } catch (err) { /* ponteiro já solto */ } };
const snapPx = (v, e) => (state.settings.snap && !(e && e.altKey) ? Math.round(v / SNAP) * SNAP : v);

function floorCancel() {
  tableDrag = tableResize = zoneDrag = zoneResize = null;
  if (swapDrag) { swapDrag.el.classList.remove("swapping"); swapDrag = null; }
  panStart = null; pinchStart = null; panMoved = false;
  ptrs.clear();
  vp.classList.remove("panning");
}

let spaceHeld = false;
document.addEventListener("keydown", (e) => { if (e.code === "Space" && !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) && !e.target.matches(".gcard, .tspot") && ui.view === "salao" && !document.querySelector("dialog[open]")) { spaceHeld = true; vp.classList.add("panning"); e.preventDefault(); } });
document.addEventListener("keyup", (e) => { if (e.code === "Space") { spaceHeld = false; if (!panStart) vp.classList.remove("panning"); } });
vp.addEventListener("pointerdown", (e) => {
  if (e.target.closest(".fpanel, .abar, .zoomctl, .edit-hint button, .empty-floor")) return;
  if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
  if (e.button === 1) e.preventDefault();
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1 && (e.button === 1 || spaceHeld)) { panMoved = false; panStart = { x: e.clientX, y: e.clientY, tx, ty }; return; }
  if (ptrs.size === 1) {
    panMoved = false;
    const spot = e.target.closest(".tspot");
    const zEl = e.target.closest(".zone");
    if (ui.mode === "plan") {
      const h = e.target.closest(".handle");
      if (h && spot) { const t = tableById(spot.dataset.id); tableResize = { t, sx: e.clientX, sy: e.clientY, o: t.scale || 1 }; return; }
      if (h && zEl) { const z = zoneById(zEl.dataset.zid); zoneResize = { z, el: zEl, sx: e.clientX, sy: e.clientY, ow: z.w, oh: z.h }; return; }
      if (spot) { const t = tableById(spot.dataset.id); tableDrag = { t, el: spot, sx: e.clientX, sy: e.clientY, ox: t.x, oy: t.y }; return; }
      if (zEl) { const z = zoneById(zEl.dataset.zid); zoneDrag = { z, el: zEl, sx: e.clientX, sy: e.clientY, ox: z.x, oy: z.y }; return; }
    } else if (spot) {
      const t = tableById(spot.dataset.id);
      swapDrag = { t, el: spot, sx: e.clientX, sy: e.clientY, ox: (t.x / 100) * FW(), oy: (t.y / 100) * FH(), target: null };
      return;
    }
    panStart = { x: e.clientX, y: e.clientY, tx, ty };
  } else if (ptrs.size === 2) {
    if (tableDrag || zoneDrag || zoneResize || tableResize || swapDrag) return;
    [...ptrs.keys()].forEach(capture);
    const [a, b] = [...ptrs.values()];
    pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    panStart = null;
  }
});
vp.addEventListener("pointermove", (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const s = scaleNow();
  const startMove = (d, th) => { if (!panMoved && d > th) { panMoved = true; capture(e.pointerId); hideTip(); } return panMoved; };
  if (tableDrag) {
    const dx = e.clientX - tableDrag.sx, dy = e.clientY - tableDrag.sy;
    if (startMove(Math.hypot(dx, dy), 4)) {
      const t = tableDrag.t;
      const px = snapPx((tableDrag.ox / 100) * FW() + dx / s, e), py = snapPx((tableDrag.oy / 100) * FH() + dy / s, e);
      t.x = clamp((px / FW()) * 100, 0.5, 99.5);
      t.y = clamp((py / FH()) * 100, 0.5, 99.5);
      tableDrag.el.style.left = (t.x / 100) * FW() + "px";
      tableDrag.el.style.top = (t.y / 100) * FH() + "px";
    }
    return;
  }
  if (swapDrag) {
    const dx = e.clientX - swapDrag.sx, dy = e.clientY - swapDrag.sy;
    if (!panMoved && Math.hypot(dx, dy) > 6) { startMove(99, 0); swapDrag.el.classList.add("swapping"); }
    if (!panMoved) return;
    swapDrag.el.style.left = swapDrag.ox + dx / s + "px";
    swapDrag.el.style.top = swapDrag.oy + dy / s + "px";
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const tgt = under ? under.closest(".tspot") : null;
    if (swapDrag.target && swapDrag.target !== tgt) swapDrag.target.classList.remove("dragover");
    swapDrag.target = tgt && tgt !== swapDrag.el ? tgt : null;
    if (swapDrag.target) swapDrag.target.classList.add("dragover");
    return;
  }
  if (tableResize) {
    const dx = e.clientX - tableResize.sx, dy = e.clientY - tableResize.sy;
    if (startMove(Math.hypot(dx, dy), 3)) {
      const d = (Math.abs(dx) > Math.abs(dy) ? dx : dy) / s;
      tableResize.t.scale = clamp(tableResize.o + d / 110, 0.5, 2.5);
      refreshTspot(tableResize.t);
    }
    return;
  }
  if (zoneResize) {
    const dx = e.clientX - zoneResize.sx, dy = e.clientY - zoneResize.sy;
    if (startMove(Math.hypot(dx, dy), 3)) {
      const z = zoneResize.z;
      z.w = clamp(zoneResize.ow + (dx / s / FW()) * 100, 2, 100 - z.x);
      z.h = clamp(zoneResize.oh + (dy / s / FH()) * 100, 2, 100 - z.y);
      zoneResize.el.style.width = (z.w / 100) * FW() + "px";
      zoneResize.el.style.height = (z.h / 100) * FH() + "px";
      if (z.shape === "text") zoneResize.el.style.fontSize = clamp((z.h / 100) * FH() * 0.42, 11, 44) + "px";
    }
    return;
  }
  if (zoneDrag) {
    const dx = e.clientX - zoneDrag.sx, dy = e.clientY - zoneDrag.sy;
    if (startMove(Math.hypot(dx, dy), 4)) {
      const z = zoneDrag.z;
      const px = snapPx((zoneDrag.ox / 100) * FW() + dx / s, e), py = snapPx((zoneDrag.oy / 100) * FH() + dy / s, e);
      z.x = clamp((px / FW()) * 100, 0, 100 - z.w);
      z.y = clamp((py / FH()) * 100, 0, 100 - z.h);
      zoneDrag.el.style.left = (z.x / 100) * FW() + "px";
      zoneDrag.el.style.top = (z.y / 100) * FH() + "px";
    }
    return;
  }
  if (ptrs.size === 2 && pinchStart) {
    const [a, b] = [...ptrs.values()];
    const r = vp.getBoundingClientRect();
    const target = clamp(pinchStart.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.d), 0.6, 8);
    zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, target / zoom);
    panMoved = true;
  } else if (panStart) {
    const dx = e.clientX - panStart.x, dy = e.clientY - panStart.y;
    if (!panMoved && Math.hypot(dx, dy) > 5) { panMoved = true; vp.classList.add("panning"); capture(e.pointerId); hideTip(); }
    if (panMoved) { tx = panStart.tx + dx; ty = panStart.ty + dy; applyView(); }
  }
});
function endPtr(e) {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinchStart = null;
  if (ptrs.size) return;
  panStart = null;
  vp.classList.remove("panning");
  const moved = panMoved;
  if (tableDrag) { tableDrag = null; if (moved) commit(); }
  if (tableResize) { tableResize = null; if (moved) commit(); }
  if (zoneDrag || zoneResize) { zoneDrag = zoneResize = null; if (moved) commit(); }
  if (swapDrag) {
    const src = swapDrag.t, tgtEl = swapDrag.target;
    swapDrag.el.classList.remove("swapping");
    if (tgtEl) tgtEl.classList.remove("dragover");
    swapDrag = null;
    if (moved) {
      const dst = tgtEl ? tableById(tgtEl.dataset.id) : null;
      if (dst && dst.id !== src.id) swapTables(src, dst);
      else renderFloor();
    }
  }
}
vp.addEventListener("pointerup", endPtr);
vp.addEventListener("pointercancel", endPtr);
vp.addEventListener("lostpointercapture", (e) => { if (ptrs.has(e.pointerId)) endPtr(e); });
window.addEventListener("blur", () => {
  if (!ptrs.size) return;
  const moved = panMoved, editing = tableDrag || tableResize || zoneDrag || zoneResize;
  floorCancel();
  if (moved && editing) commit(); else renderFloor();
});
vp.addEventListener("click", (e) => {
  if (panMoved) { e.stopPropagation(); e.preventDefault(); panMoved = false; }
}, true);
vp.addEventListener("dblclick", (e) => {
  if (e.target.closest(".tspot, .zone, .fpanel, .abar, .zoomctl, .empty-floor, .edit-hint")) return;
  const r = vp.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, 1.6, true);
});
floorEl.addEventListener("click", (e) => {
  const tEl = e.target.closest(".tspot");
  if (tEl) {
    const id = tEl.dataset.id;
    if (ui.mode === "seat" && ui.selectedId) { assign(ui.selectedId, id); return; }
    ui.openTableId = ui.openTableId === id && ui.mode === "seat" ? null : id;
    ui.openZoneId = null;
    renderFloor(); renderTablePanel(); renderZonePanel();
    if (e.detail === 0 && ui.openTableId) $("tpanel").focus();
    return;
  }
  const zEl = e.target.closest(".zone");
  if (zEl && ui.mode === "plan") {
    ui.openZoneId = zEl.dataset.zid;
    ui.openTableId = null;
    renderFloor(); renderTablePanel(); renderZonePanel();
    return;
  }
  if (ui.openTableId || ui.openZoneId) {
    ui.openTableId = null; ui.openZoneId = null;
    renderFloor(); renderTablePanel(); renderZonePanel();
  }
});
/* soltar um card de convidado (arrastar do mouse) sobre a mesa */
floorEl.addEventListener("dragover", (e) => {
  const tEl = e.target.closest(".tspot");
  if (!tEl) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  itemsEl.querySelectorAll(".tspot.dragover").forEach((x) => x !== tEl && x.classList.remove("dragover"));
  tEl.classList.add("dragover");
});
floorEl.addEventListener("dragleave", (e) => {
  const tEl = e.target.closest(".tspot");
  if (tEl && !tEl.contains(e.relatedTarget)) tEl.classList.remove("dragover");
});
floorEl.addEventListener("drop", (e) => {
  const tEl = e.target.closest(".tspot");
  if (!tEl) return;
  e.preventDefault();
  const gid = e.dataTransfer.getData("text/plain");
  if (gid && guestById(gid)) assign(gid, tEl.dataset.id);
});

/* ── Modo: organizar convidados × editar planta ── */
function setMode(m) {
  if (ui.mode === m) return;
  ui.mode = m;
  ui.selectedId = null;
  if (m === "seat") ui.openZoneId = null;
  document.querySelectorAll("#modeSeg button").forEach((b) => { b.classList.toggle("on", b.dataset.m === m); b.setAttribute("aria-pressed", b.dataset.m === m); });
  document.querySelectorAll(".tb-group").forEach((g) => { g.hidden = g.dataset.for !== m; });
  updateHints();
  $("tpMore").open = m === "plan";
  $("tpanel").classList.toggle("plan", m === "plan");
  renderAll();
}

function updateHints() {
  const touch = !finePointer();
  $("lgHint").textContent = ui.mode === "plan"
    ? (touch ? "Arraste mesas e áreas · toque longo no salão adiciona ali" : "Arraste mesas e áreas · alça no canto redimensiona · botão direito no salão adiciona ali")
    : (touch ? "Toque num convidado e depois numa mesa · toque longo abre mais opções" : "Clique num convidado e depois numa mesa · botão direito abre mais opções");
  $("editHint").querySelector("span").textContent = touch ? "Editando a planta — arraste para mover; toque longo para mais opções" : "Editando a planta — arraste para mover, alça no canto redimensiona, botão direito para mais opções";
}

/* ── Criar, mover e apagar mesas/áreas ── */
const snapPct = (x, y) => (state.settings.snap
  ? { x: ((Math.round(((x / 100) * FW()) / SNAP) * SNAP) / FW()) * 100, y: ((Math.round(((y / 100) * FH()) / SNAP) * SNAP) / FH()) * 100 }
  : { x, y });
/* muda a altura do salão sem esticar o que já está desenhado (posições guardadas em %) */
function setFloorHeight(h) {
  const old = FH();
  h = Math.round(h);
  if (h === old) return;
  const k = old / h;
  for (const t of state.tables) t.y = clamp(t.y * k, 0.5, 99.5);
  for (const z of state.zones) { z.y = clamp(z.y * k, 0, 98); z.h = clamp(z.h * k, 1, 100 - z.y); }
  state.floor.h = h;
}
function freeSpot(p) {
  let { x, y } = p, tries = 0;
  while (tries++ < 12 && state.tables.some((t) => Math.abs(t.x - x) < 3 && Math.abs(t.y - y) < 3)) { x += 4; y += 4; }
  return { x: clamp(x, 3, 97), y: clamp(y, 3, 97) };
}
function addTable(shape, at) {
  const f = freeSpot(at || viewCenterPct());
  const p = snapPct(f.x, f.y);
  const t = { id: uid("t"), label: nextTableLabel(), alias: "", shape, cap: DEFAULT_CAP[shape], x: p.x, y: p.y, scale: 1, rot: 0, notes: "" };
  state.tables.push(t);
  if (ui.mode !== "plan") setMode("plan");
  ui.openTableId = t.id;
  ui.openZoneId = null;
  commit();
  toast(tableName(t) + " criada — arraste para posicionar");
  return t;
}
function addZone(kind, at) {
  const p = at || viewCenterPct();
  const w = kind === "text" ? 14 : 12, h = kind === "text" ? 5 : 14;
  const z = { id: uid("z"), label: kind === "text" ? "Texto" : "Nova área", shape: kind === "text" ? "text" : "rect", x: clamp(p.x - w / 2, 0, 100 - w), y: clamp(p.y - h / 2, 0, 100 - h), w, h };
  state.zones.push(z);
  if (ui.mode !== "plan") setMode("plan");
  ui.openZoneId = z.id;
  ui.openTableId = null;
  commit();
  setTimeout(() => { $("zpName").focus(); $("zpName").select(); }, 30);
}
function addManyTables({ qty, shape, cap, start, cols }) {
  const G = tableGeo({ shape, cap, scale: 1 });
  cols = clamp(cols, 1, qty);
  const rows = Math.ceil(qty / cols);
  let dx = G.W + 40, dy = G.H + 40;
  dx = Math.min(dx, (FW() * 0.94) / cols);
  dy = Math.min(dy, (FH() * 0.94) / rows);
  const gw = (cols - 1) * dx, gh = (rows - 1) * dy;
  const place = (cx, cy) => ({ ox: clamp(cx - gw / 2, dx / 2, FW() - gw - dx / 2), oy: clamp(cy - gh / 2, dy / 2, FH() - gh - dy / 2) });
  const overlaps = (o) => {
    let n = 0;
    for (const t of state.tables) {
      const G = tableGeo(t), x = (t.x / 100) * FW(), y = (t.y / 100) * FH(), m = Math.max(G.W, G.H) / 2 + 10;
      if (x > o.ox - dx / 2 - m && x < o.ox + gw + dx / 2 + m && y > o.oy - dy / 2 - m && y < o.oy + gh + dy / 2 + m) n++;
    }
    return n;
  };
  const c = viewCenterPct();
  const cands = [place((c.x / 100) * FW(), (c.y / 100) * FH())];
  if (state.tables.length) {
    const ys = state.tables.map((t) => (t.y / 100) * FH()), xs = state.tables.map((t) => (t.x / 100) * FW());
    cands.push(place(FW() / 2, Math.max(...ys) + dy + gh / 2), place(Math.max(...xs) + dx + gw / 2, FH() / 2),
      place(FW() / 2, Math.min(...ys) - dy - gh / 2), place(Math.min(...xs) - dx - gw / 2, FH() / 2));
  }
  const best = cands.map((o) => ({ o, n: overlaps(o) })).sort((a, b) => a.n - b.n)[0];
  const { ox, oy } = best.o;
  const used = new Set(state.tables.map((t) => String(t.label)));
  let n = start;
  for (let i = 0; i < qty; i++) {
    while (used.has(String(n))) n++;
    used.add(String(n));
    state.tables.push({
      id: uid("t"), label: String(n), alias: "", shape, cap, scale: 1, rot: 0, notes: "",
      x: clamp(((ox + (i % cols) * dx) / FW()) * 100, 1, 99), y: clamp(((oy + Math.floor(i / cols) * dy) / FH()) * 100, 1, 99)
    });
    n++;
  }
  commit();
  fitView();
  toast(plural(qty, "mesa criada", "mesas criadas") + (best.n ? " — algumas ficaram por cima de outras; arraste para o lugar certo" : " — arraste cada uma para o lugar certo"), { err: best.n > 0, action: { label: "Desfazer", fn: undo } });
}
function duplicateTable(t) {
  const c = Object.assign({}, t, { id: uid("t"), label: nextTableLabel(), x: clamp(t.x + 4, 1, 99), y: clamp(t.y + 4, 1, 99) });
  state.tables.push(c);
  ui.openTableId = c.id;
  commit();
  toast(tableName(c) + " criada a partir da " + tableName(t));
}
function rotateTable(t, deg) {
  t.rot = ((((t.rot || 0) + deg) % 360) + 360) % 360;
  commit();
}
function deleteTable(t) {
  const occ = occupants(t.id);
  state.guests.forEach((g) => { if (g.table === t.id) g.table = null; });
  state.tables = state.tables.filter((x) => x.id !== t.id);
  if (ui.openTableId === t.id) ui.openTableId = null;
  commit();
  toast(tableName(t) + " excluída" + (occ.length ? " — " + plural(occ.length, "convite ficou", "convites ficaram") + " sem mesa" : ""), { action: { label: "Desfazer", fn: undo } });
}
function deleteZone(z) {
  state.zones = state.zones.filter((x) => x.id !== z.id);
  if (ui.openZoneId === z.id) ui.openZoneId = null;
  commit();
  toast("Área excluída", { action: { label: "Desfazer", fn: undo } });
}
function duplicateZone(z) {
  const c = Object.assign({}, z, { id: uid("z"), x: clamp(z.x + 3, 0, 100 - z.w), y: clamp(z.y + 3, 0, 100 - z.h) });
  state.zones.push(c);
  ui.openZoneId = c.id;
  commit();
}
function emptyTable(t) {
  const occ = occupants(t.id);
  occ.forEach((g) => { g.table = null; });
  commit();
  toast(tableName(t) + " esvaziada — " + plural(occ.length, "convite voltou", "convites voltaram") + " para a lista", { action: { label: "Desfazer", fn: undo } });
}
/* teclado na edição: mover, girar, duplicar, excluir o item selecionado */
function nudgeSelected(dx, dy) {
  const t = ui.openTableId && tableById(ui.openTableId);
  const z = !t && ui.openZoneId && zoneById(ui.openZoneId);
  if (t) { t.x = clamp(t.x + (dx * SNAP / FW()) * 100, 0.5, 99.5); t.y = clamp(t.y + (dy * SNAP / FH()) * 100, 0.5, 99.5); }
  else if (z) { z.x = clamp(z.x + (dx * SNAP / FW()) * 100, 0, 100 - z.w); z.y = clamp(z.y + (dy * SNAP / FH()) * 100, 0, 100 - z.h); }
  else return false;
  renderFloor();
  persist(state);
  clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(() => commit({ silent: true }), 600);
  return true;
}
let nudgeTimer = null;

/* ── Painel da mesa ── */
function openTable(id) {
  ui.openTableId = id;
  ui.openZoneId = null;
  renderFloor(); renderTablePanel(); renderZonePanel();
}
function renderTablePanel() {
  const panel = $("tpanel");
  const t = ui.view === "salao" && ui.openTableId ? tableById(ui.openTableId) : null;
  if (!t) { panel.classList.remove("open"); delete panel.dataset.for; return; }
  panel.classList.add("open");
  if (panel.dataset.for !== t.id) { placePanel(panel, t.x); panel.dataset.for = t.id; $("tpMore").open = ui.mode === "plan"; }
  const occ = occupants(t.id);
  const n = occSeats(t.id);
  $("tpTitle").innerHTML = esc(tableName(t)) + (t.alias ? ' <span class="sub">· ' + esc(t.alias) + "</span>" : "");
  const occEl = $("tpOcc");
  occEl.textContent = n + "/" + t.cap;
  occEl.className = "fpanel-occ num" + (n > t.cap ? " over" : n === t.cap ? " full" : "");
  if (document.activeElement !== $("tpLabel")) $("tpLabel").value = t.label;
  if (document.activeElement !== $("tpAlias")) $("tpAlias").value = t.alias || "";
  $("tpShape").value = t.shape;
  $("tpCapV").textContent = t.cap;
  $("tpRot").value = t.rot || 0;
  $("tpRotV").textContent = (t.rot || 0) + "°";
  if (document.activeElement !== $("tpNotes")) $("tpNotes").value = t.notes || "";
  const fills = seatFills(occ);
  let dots = "";
  for (let i = 0; i < Math.max(t.cap, n); i++) dots += '<i class="' + (i >= t.cap ? "ex" : fills[i] || "") + '"></i>';
  $("tpDots").innerHTML = dots;
  $("tpList").innerHTML = occ.map((g) =>
    '<div class="orow' + (g.id === ui.selectedId || g.id === ui.flashId ? " sel" : "") + '" draggable="' + (finePointer() ? "true" : "false") + '" data-id="' + g.id + '">' +
    '<div class="omain"><div class="oname"><i class="stdot ' + g.status + '"></i>' + esc(g.name) + '</div><div class="odet">' + plural(seats(g), "lugar", "lugares") + " · " + esc(personDetail(g)) + "</div></div>" +
    '<button class="iconbtn" type="button" data-edit="' + g.id + '" aria-label="Editar convidado" data-tip="Editar convidado">' + ic("pencil") + "</button>" +
    '<button class="iconbtn danger" type="button" data-unseat="' + g.id + '" aria-label="Tirar da mesa" data-tip="Tirar da mesa">' + ic("x") + "</button></div>"
  ).join("") || '<div class="fpanel-empty">Mesa vazia.<br>Arraste convidados para cá, ou clique num convidado da lista e depois nesta mesa.</div>';
}
$("tpClose").addEventListener("click", () => { ui.openTableId = null; renderFloor(); renderTablePanel(); });
$("tpMenu").addEventListener("click", (e) => { const t = tableById(ui.openTableId); if (t) openMenu(() => tableMenuItems(t), null, { anchor: e.currentTarget, align: "end" }); });
$("tpLabel").addEventListener("change", () => {
  const t = tableById(ui.openTableId), v = $("tpLabel").value.trim();
  if (!t) return;
  if (!v) { $("tpLabel").value = t.label; return; }
  const dup = state.tables.find((x) => x.id !== t.id && norm(x.label) === norm(v));
  if (dup) { toast("Já existe a " + tableName(dup) + " — use outro número (o próximo livre é " + nextTableLabel() + ")", { err: true }); $("tpLabel").value = t.label; return; }
  t.label = v;
  commit();
});
$("tpAlias").addEventListener("change", () => { const t = tableById(ui.openTableId); if (t) { t.alias = $("tpAlias").value.trim(); commit(); } });
$("tpShape").addEventListener("change", () => { const t = tableById(ui.openTableId); if (t) { t.shape = $("tpShape").value; commit(); } });
$("tpCapDec").addEventListener("click", () => { const t = tableById(ui.openTableId); if (t && t.cap > 1) { t.cap--; commit(); } });
$("tpCapInc").addEventListener("click", () => { const t = tableById(ui.openTableId); if (t && t.cap < 60) { t.cap++; commit(); } });
$("tpRot").addEventListener("input", () => {
  const t = tableById(ui.openTableId);
  if (!t) return;
  t.rot = +$("tpRot").value;
  $("tpRotV").textContent = t.rot + "°";
  refreshTspot(t);
});
$("tpRot").addEventListener("change", () => commit());
$("tpNotes").addEventListener("change", () => { const t = tableById(ui.openTableId); if (t) { t.notes = $("tpNotes").value.trim(); commit(); } });
$("tpList").addEventListener("click", (e) => {
  const un = e.target.closest("[data-unseat]");
  if (un) { unassign(un.dataset.unseat); return; }
  const ed = e.target.closest("[data-edit]");
  if (ed) { openGuestModal(ed.dataset.edit); return; }
  const row = e.target.closest(".orow");
  if (row) selectGuest(row.dataset.id, { noFly: true });
});
$("tpList").addEventListener("dblclick", (e) => { const row = e.target.closest(".orow"); if (row && !e.target.closest("button")) openGuestModal(row.dataset.id); });
$("tpList").addEventListener("dragstart", (e) => {
  const row = e.target.closest(".orow");
  if (!row) return;
  e.dataTransfer.setData("text/plain", row.dataset.id);
  e.dataTransfer.effectAllowed = "move";
});
$("tpBody").addEventListener("dragover", (e) => e.preventDefault());
$("tpBody").addEventListener("drop", (e) => {
  e.preventDefault();
  const gid = e.dataTransfer.getData("text/plain");
  if (gid && ui.openTableId) assign(gid, ui.openTableId);
});

/* ── Painel da área ── */
function renderZonePanel() {
  const p = $("zpanel");
  const z = ui.view === "salao" && ui.mode === "plan" && ui.openZoneId ? zoneById(ui.openZoneId) : null;
  if (!z) { p.classList.remove("open"); delete p.dataset.for; return; }
  p.classList.add("open");
  if (p.dataset.for !== z.id) { placePanel(p, z.x + z.w / 2); p.dataset.for = z.id; }
  $("zpTitle").textContent = z.shape === "text" ? "Texto na planta" : "Área do salão";
  if (document.activeElement !== $("zpName")) $("zpName").value = z.label;
  $("zpShape").value = z.shape;
  if (document.activeElement !== $("zpW")) $("zpW").value = Math.round(z.w);
  if (document.activeElement !== $("zpH")) $("zpH").value = Math.round(z.h);
}
$("zpClose").addEventListener("click", () => { ui.openZoneId = null; renderZonePanel(); renderFloor(); });
$("zpName").addEventListener("input", () => {
  const z = zoneById(ui.openZoneId);
  if (!z) return;
  z.label = $("zpName").value;
  const el = itemsEl.querySelector('.zone[data-zid="' + z.id + '"] span');
  if (el) el.textContent = z.label;
});
$("zpName").addEventListener("change", () => { const z = zoneById(ui.openZoneId); if (z) { z.label = $("zpName").value.trim(); commit(); } });
$("zpShape").addEventListener("change", () => { const z = zoneById(ui.openZoneId); if (z) { z.shape = $("zpShape").value; commit(); } });
$("zpW").addEventListener("change", () => { const z = zoneById(ui.openZoneId), v = parseFloat($("zpW").value); if (z && v >= 2 && v <= 100) { z.w = v; z.x = Math.min(z.x, 100 - v); commit(); } });
$("zpH").addEventListener("change", () => { const z = zoneById(ui.openZoneId), v = parseFloat($("zpH").value); if (z && v >= 2 && v <= 100) { z.h = v; z.y = Math.min(z.y, 100 - v); commit(); } });
$("zpDelete").addEventListener("click", () => { const z = zoneById(ui.openZoneId); if (z) deleteZone(z); });

/* ── Dica e menus da mesa / área / salão ── */
function tableTip(t) {
  if (!t) return null;
  const occ = occupants(t.id), n = occSeats(t.id), free = t.cap - n;
  const kids = occ.reduce((k, g) => k + totalKids(g), 0);
  let h = '<div class="tt">' + esc(tableName(t)) + (t.alias ? ' <span class="ts">· ' + esc(t.alias) + "</span>" : "") + "</div>";
  h += '<div class="ts">' + SHAPES[t.shape] + " · " + n + " de " + t.cap + " lugares · " +
    (free > 0 ? plural(free, "livre", "livres") : free === 0 ? "completa" : "lotada (+" + -free + ")") + (kids ? " · " + plural(kids, "criança", "crianças") : "") + "</div>";
  if (occ.length) {
    const max = 14;
    h += '<div class="tl">' + occ.slice(0, max).map((g) => "<span>" + esc(g.name) + "</span><span>" + seats(g) + "</span>").join("") +
      (occ.length > max ? "<span>+ " + plural(occ.length - max, "convite", "convites") + "</span><span></span>" : "") + "</div>";
  }
  if (t.notes) h += '<div class="tn">' + esc(t.notes) + "</div>";
  h += '<div class="th">' + (ui.mode === "plan" ? "Arraste para mover · alça no canto redimensiona · botão direito para opções"
    : ui.selectedId ? "Clique para sentar o convidado selecionado aqui"
    : "Clique para detalhes · arraste sobre outra mesa para trocar os convidados") + "</div>";
  return h;
}
function tableMenuItems(t) {
  const occ = occupants(t.id);
  const sel = ui.selectedId && guestById(ui.selectedId);
  const items = [];
  if (sel && ui.mode === "seat" && sel.table !== t.id) items.push({ label: "Sentar " + shortName(sel.name) + " aqui", icon: "seat", action: () => assign(sel.id, t.id) });
  items.push({ label: "Ver detalhes", icon: "eye", action: () => openTable(t.id) });
  items.push({
    label: "Trocar convidados com", icon: "swap",
    sub: () => sortedTables().filter((x) => x.id !== t.id).map((x) => ({ label: tableFull(x), kbd: occSeats(x.id) + "/" + x.cap, action: () => swapTables(t, x) }))
  });
  items.push({ label: "Esvaziar mesa", icon: "unseat", disabled: !occ.length, action: () => emptyTable(t) });
  items.push("-");
  items.push({ label: "Lugares", icon: "users", kbd: String(t.cap), sub: () => [4, 6, 8, 10, 12, 14, 16, 18, 20, 24].map((c) => ({ label: c + " lugares", checked: t.cap === c, action: () => { t.cap = c; commit(); } })) });
  items.push({ label: "Formato", icon: t.shape, sub: () => Object.entries(SHAPES).map(([k, v]) => ({ label: v, checked: t.shape === k, action: () => { t.shape = k; commit(); } })) });
  items.push({ label: "Girar 90°", icon: "rotate", kbd: "Shift+R", action: () => rotateTable(t, 90) });
  items.push({ label: "Duplicar", icon: "copy", kbd: "Ctrl+D", action: () => duplicateTable(t) });
  items.push("-");
  items.push({ label: "Excluir mesa", icon: "trash", danger: true, kbd: "Del", action: () => deleteTable(t) });
  return items;
}
function zoneMenuItems(z) {
  return [
    { label: "Editar nome e tamanho", icon: "pencil", action: () => { if (ui.mode !== "plan") setMode("plan"); ui.openZoneId = z.id; ui.openTableId = null; renderAll(); $("zpName").focus(); } },
    { label: "Tipo", icon: "area", sub: () => [["rect", "Retângulo"], ["ellipse", "Elipse"], ["text", "Só texto"]].map(([k, v]) => ({ label: v, checked: z.shape === k, action: () => { z.shape = k; commit(); } })) },
    { label: "Duplicar", icon: "copy", action: () => duplicateZone(z) },
    "-",
    { label: "Excluir", icon: "trash", danger: true, kbd: "Del", action: () => deleteZone(z) }
  ];
}
function floorMenuItems(x, y) {
  const p = clientToPct(x, y);
  const items = [];
  if (ui.mode === "plan") {
    items.push({ header: "Adicionar aqui" });
    for (const [k, v] of Object.entries(SHAPES)) items.push({ label: "Mesa " + v.toLowerCase(), icon: k, action: () => addTable(k, p) });
    items.push({ label: "Área", icon: "area", action: () => addZone("rect", p) });
    items.push({ label: "Texto", icon: "text", action: () => addZone("text", p) });
    items.push("-");
    items.push({ label: "Imagem de fundo", icon: "image", sub: bgMenuItems });
  } else {
    items.push({ label: "Editar planta", icon: "pencil", kbd: "E", action: () => setMode("plan") });
  }
  items.push({ label: "Ajustar à tela", icon: "fit", kbd: "F", action: () => { animView(); fitView(); } });
  items.push("-");
  items.push({ label: "Mostrar cadeiras", checked: !!state.settings.chairs, keep: true, action: () => toggleSetting("chairs") });
  items.push({ label: "Mostrar áreas", checked: !!state.settings.zones, keep: true, action: () => toggleSetting("zones") });
  if (bgData) items.push({ label: "Mostrar imagem de fundo", checked: !!state.settings.bg, keep: true, action: () => toggleSetting("bg") });
  return items;
}
function toggleSetting(k) { state.settings[k] = !state.settings[k]; commitQuiet(); }

/* ── Imagem de fundo (planta do local) ── */
async function loadBgForCurrent(prune) {
  const s = state;
  let data = null;
  if (s.floor.bg) { const v = await idbGet(bgKey(s)); data = (v && v.data) || null; }
  if (s !== state) return;
  bgData = data;
  bgVersion++;
  renderFloor();
  // ao abrir o evento, apaga versões antigas da imagem que nenhum desfazer alcança mais
  if (prune) idbTx("readwrite", (st) => {
    const req = st.openCursor(IDBKeyRange.bound("bg:" + s.id, "bg:" + s.id + "￿"));
    req.onsuccess = () => { const c = req.result; if (!c) return; if (!s.floor.bg || c.key !== bgKey(s)) c.delete(); c.continue(); };
  }).catch(() => null);
}
function readAsDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
}
function decodeImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("imagem inválida")); im.src = src; });
}
async function imageFileToData(file) {
  const src = await readAsDataURL(file);
  const im = await decodeImage(src);
  let w = im.naturalWidth, h = im.naturalHeight;
  const max = 3200;
  if (Math.max(w, h) <= max && file.size < 4e6) return { data: src, w, h };
  const k = Math.min(1, max / Math.max(w, h));
  w = Math.round(w * k); h = Math.round(h * k);
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(im, 0, 0, w, h);
  return { data: c.toDataURL(/png/i.test(file.type) ? "image/png" : "image/jpeg", 0.9), w, h };
}
async function pdfToImage(file) {
  await loadScript("vendor/pdf.worker.min.js"); // define globalThis.pdfjsWorker → roda sem Web Worker (vale em file://)
  await loadScript("vendor/pdf.min.js");
  const lib = window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";
  const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const page = await pdf.getPage(1);
  const v1 = page.getViewport({ scale: 1 });
  const scale = clamp(2600 / Math.max(v1.width, v1.height), 0.5, 6);
  const view = page.getViewport({ scale });
  const c = document.createElement("canvas");
  c.width = Math.round(view.width); c.height = Math.round(view.height);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: view }).promise;
  const pages = pdf.numPages;
  pdf.destroy();
  return { data: c.toDataURL("image/png"), w: c.width, h: c.height, pages };
}
async function setBackgroundFromFile(file) {
  if (!file) return;
  try {
    toast("Preparando a imagem…");
    const isPdf = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name);
    const r = isPdf ? await pdfToImage(file) : await imageFileToData(file);
    const key = "bg:" + state.id + ":" + Date.now().toString(36);
    await idbPut(key, { data: r.data, w: r.w, h: r.h, name: file.name });
    bgData = r.data;
    bgVersion++;
    state.floor.bg = { key, name: file.name, w: r.w, h: r.h, opacity: state.floor.bg ? state.floor.bg.opacity : 0.6 };
    setFloorHeight(clamp((FW() * r.h) / r.w, 300, 3900));
    state.settings.bg = true;
    if (ui.mode !== "plan") setMode("plan");
    commit();
    fitView();
    toast(isPdf && r.pages > 1 ? "Planta aplicada (usada a página 1 de " + r.pages + ")" : "Planta aplicada — agora desenhe as mesas por cima");
  } catch (err) {
    console.error(err);
    toast("Não foi possível usar esse arquivo. Tente uma imagem PNG/JPG ou um PDF.", { err: true });
  }
}
async function removeBackground() {
  if (!(await ask("Remover a imagem de fundo?", "As mesas e áreas continuam onde estão. Dá para desfazer.", { ok: "Remover", danger: true }))) return;
  bgData = null;
  bgVersion++;
  state.floor.bg = null;
  commit();
  toast("Imagem de fundo removida", { action: { label: "Desfazer", fn: undo } });
}
function setFloorRatio(rw, rh) {
  setFloorHeight((FW() * rh) / rw);
  commit();
  fitView();
}
function bgMenuItems() {
  const has = !!bgData;
  const ratio = (rw, rh, label) => ({ label, checked: !has && Math.abs(FH() - Math.round((FW() * rh) / rw)) < 2, disabled: has, action: () => setFloorRatio(rw, rh) });
  return [
    { label: has ? "Trocar imagem ou PDF…" : "Enviar imagem ou PDF…", icon: "upload", desc: "Foto ou planta do salão; as mesas ficam por cima", action: () => $("fileBg").click() },
    { label: "Mostrar imagem", checked: has && !!state.settings.bg, disabled: !has, keep: true, action: () => toggleSetting("bg") },
    { label: "Remover imagem", icon: "trash", danger: true, disabled: !has, action: removeBackground },
    "-",
    { header: has ? "Proporção do salão (definida pela imagem)" : "Proporção do salão" },
    ratio(3, 2, "Paisagem 3:2"), ratio(4, 3, "Paisagem 4:3"), ratio(16, 9, "Panorâmica 16:9"), ratio(1, 1, "Quadrada 1:1"), ratio(2, 3, "Retrato 2:3")
  ];
}
$("fileBg").addEventListener("change", () => { const f = $("fileBg").files[0]; $("fileBg").value = ""; setBackgroundFromFile(f); });
$("bgOpacity").addEventListener("input", () => {
  if (!state.floor.bg) return;
  state.floor.bg.opacity = +$("bgOpacity").value / 100;
  floorBgEl.style.opacity = state.floor.bg.opacity;
});
$("bgOpacity").addEventListener("change", () => commit({ silent: true }));
/* arrastar um arquivo de imagem direto sobre o salão também define o fundo */
vp.addEventListener("dragover", (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes("Files")) e.preventDefault(); });
vp.addEventListener("drop", (e) => {
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (!f) return;
  e.preventDefault();
  if (/^image\//.test(f.type) || /pdf/i.test(f.type) || /\.pdf$/i.test(f.name)) setBackgroundFromFile(f);
});

makePanelDraggable($("tpanel"));
makePanelDraggable($("zpanel"));
