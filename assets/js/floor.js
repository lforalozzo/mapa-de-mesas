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
let nameFont = 6.5; // fonte lógica dos nomes nas mesas; ajustada ao zoom para dar ≈10px na tela
let bgVersion = 0, bgShown = -1;

/* ── Geometria: corpo da mesa + posição de cada cadeira (relativas ao centro) ── */
function tableGeo(t) {
  const k = clamp((t.scale || 1) * ((state && state.floor.tscale) || 1), 0.3, 4);
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

/* corpo da mesa em SVG: contorno de base + arco de ocupação (parcial) + halo de seleção */
function tableBodySvg(t, G, st, frac) {
  const w = G.w, h = G.h, i = 1.6;
  const round = t.shape === "round" || t.shape === "oval";
  const shp = (cls, d, extra) => round
    ? '<ellipse class="' + cls + '" cx="' + (w / 2).toFixed(1) + '" cy="' + (h / 2).toFixed(1) + '" rx="' + (w / 2 - d).toFixed(1) + '" ry="' + (h / 2 - d).toFixed(1) + '"' + (extra || "") + "/>"
    : '<rect class="' + cls + '" x="' + d.toFixed(1) + '" y="' + d.toFixed(1) + '" width="' + (w - 2 * d).toFixed(1) + '" height="' + (h - 2 * d).toFixed(1) + '" rx="' + Math.max(2, 6 - d) + '"' + (extra || "") + "/>";
  let s = '<svg class="tshape" width="' + w.toFixed(0) + '" height="' + h.toFixed(0) + '" viewBox="0 0 ' + w.toFixed(1) + " " + h.toFixed(1) + '" aria-hidden="true">' + shp("th", -4.5) + shp("tb", i);
  if (st === "partial") {
    // começa no topo (redonda) / canto superior (retangular) e anda no sentido horário
    const start = t.shape === "round" ? ' transform="rotate(-90 ' + (w / 2).toFixed(1) + " " + (h / 2).toFixed(1) + ')"' : "";
    s += shp("tp", i, ' pathLength="100" stroke-dasharray="' + (frac * 100).toFixed(1) + ' 100"' + start);
  }
  return s + "</svg>";
}
/* cadeiras além da lotação: segundo anel, em vermelho */
function extraChairs(t, G, extra, cx, cy) {
  if (extra <= 0) return "";
  const out = [];
  const n = Math.min(extra, 16);
  if (t.shape === "round" || t.shape === "oval") {
    const rx = G.w / 2 + 19, ry = G.h / 2 + 19;
    for (let k = 0; k < n; k++) { const a = -Math.PI / 2 + ((k - (n - 1) / 2) * 0.36); out.push([rx * Math.cos(a), ry * Math.sin(a)]); }
  } else {
    const y = -(G.h / 2 + 19), span = Math.min(G.w, n * 13);
    for (let k = 0; k < n; k++) out.push([n === 1 ? 0 : -span / 2 + (k * span) / (n - 1), y]);
  }
  return out.map(([x, y]) => '<i class="chair xs" style="left:' + (cx + x).toFixed(1) + "px;top:" + (cy + y).toFixed(1) + 'px"></i>').join("");
}
function tspotHtml(t, hits) {
  const G = tableGeo(t);
  const occ = occupants(t.id);
  const n = occ.reduce((s, g) => s + seats(g), 0);
  const free = t.cap - n;
  const st = n === 0 ? "empty" : n > t.cap ? "over" : n === t.cap ? "full" : "partial";
  const fills = seatFills(occ);
  const cx = G.W / 2, cy = G.H / 2;
  const rad = (((t.rot || 0) % 360) * Math.PI) / 180;
  const BW = Math.abs(Math.cos(rad)) * G.W + Math.abs(Math.sin(rad)) * G.H;
  const BH = Math.abs(Math.sin(rad)) * G.W + Math.abs(Math.cos(rad)) * G.H;
  const chairs = G.chairs.map(([x, y], i) =>
    '<i class="chair' + (i < fills.length ? " " + fills[i] : "") + '" style="left:' + (cx + x).toFixed(1) + "px;top:" + (cy + y).toFixed(1) + 'px"></i>').join("") +
    extraChairs(t, G, n - t.cap, cx, cy);
  const rot = (((t.rot || 0) % 360) + 360) % 360;
  const sideways = (rot > 45 && rot < 135) || (rot > 225 && rot < 315);
  let lw, lh;
  if (t.shape === "round") { lw = G.w * 0.8; lh = G.h * 0.82; }
  else if (t.shape === "oval") { lw = G.w * 0.76; lh = G.h * 0.92; }
  else { lw = G.w - 8; lh = G.h - 4; }
  if (sideways && t.shape !== "round" && t.shape !== "square") [lw, lh] = [lh, lw];
  // nomes: fonte com tamanho fixo NA TELA (≈10px), então aproximar o zoom mostra mais nomes
  const lineH = nameFont * 1.3;
  const wide = lw > nameFont * 15;
  const stacked = t.shape === "round" || t.shape === "square" || lh > lw * 0.9;
  const rows = Math.max(1, Math.floor((lh - (stacked ? 26 : 14)) / lineH));
  const maxN = rows * (wide ? 2 : 1);
  let names = "";
  if (occ.length) {
    let shown = occ, more = 0;
    if (occ.length > maxN) { shown = occ.slice(0, Math.max(1, maxN - 1)); more = occ.length - shown.length; }
    names = '<div class="tnames' + (wide ? " two" : "") + '">' + shown.map((g) =>
      "<span>" + (totalKids(g) ? '<i class="kd"></i>' : "") + esc(shortName(g.name)) + ' <span class="gseat">·' + seats(g) + "</span></span>").join("") +
      (more ? '<span class="more">+ ' + more + "</span>" : "") + "</div>";
  }
  const sub = st === "empty" ? t.cap + " lugares" : st === "partial" ? plural(free, "livre", "livres") : st === "full" ? "cheia" : -free + " a mais";
  const num = '<span class="tnum' + (String(t.label).length > 3 ? " long" : "") + '">' + esc(t.label) + "</span>";
  const tag = '<span class="tsub">' + esc(sub) + "</span>";
  const alias = t.alias ? '<span class="talias">' + esc(t.alias) + "</span>" : "";
  const label = num + tag + alias + names;
  let fit = "";
  const sel = ui.selectedId && ui.mode === "seat" && guestById(ui.selectedId);
  if (sel) { const need = seats(sel); fit = free + (sel.table === t.id ? need : 0) >= need ? " fits" : " nofit"; }
  const cls = "tspot " + t.shape + " " + st +
    (t.id === ui.openTableId ? " open" : hits.has(t.id) ? " hit" : "") + (ui.multi && ui.multi.has("t:" + t.id) ? " msel" : "") + fit;
  const aria = tableName(t) + (t.alias ? ", " + t.alias : "") + ", " + n + " de " + t.cap + " lugares, " + sub;
  return '<div class="' + cls + '" data-id="' + t.id + '" role="button" tabindex="0" aria-label="' + esc(aria) + '" style="left:' + ((t.x / 100) * FW()).toFixed(1) + "px;top:" + ((t.y / 100) * FH()).toFixed(1) + "px;width:" + BW.toFixed(0) + "px;height:" + BH.toFixed(0) + 'px">' +
    '<div class="trot" style="width:' + G.W.toFixed(0) + "px;height:" + G.H.toFixed(0) + "px;left:" + ((BW - G.W) / 2).toFixed(1) + "px;top:" + ((BH - G.H) / 2).toFixed(1) + "px" + (rot ? ";transform:rotate(" + rot + "deg)" : "") + '">' + chairs +
    tableBodySvg(t, G, st, Math.min(1, n / t.cap)) + "</div>" +
    '<div class="tlabel" style="width:' + lw.toFixed(0) + "px;height:" + lh.toFixed(0) + 'px">' + label + "</div>" +
    (st === "over" ? '<i class="tbadge">+' + -free + "</i>" : "") +
    '<i class="handle" aria-hidden="true"></i></div>';
}
function zoneHtml(z) {
  if (isMask(z)) {
    return '<div class="zone mask' + (z.shape === "maskellipse" ? " ellipse" : "") + (z.id === ui.openZoneId && ui.mode === "plan" ? " zopen" : "") + '" data-zid="' + z.id +
      '" style="left:' + ((z.x / 100) * FW()).toFixed(1) + "px;top:" + ((z.y / 100) * FH()).toFixed(1) + "px;width:" + ((z.w / 100) * FW()).toFixed(1) + "px;height:" + ((z.h / 100) * FH()).toFixed(1) + "px;background:" + esc(z.fill || "#ffffff") + '"><i class="handle" aria-hidden="true"></i></div>';
  }
  const w = (z.w / 100) * FW(), h = (z.h / 100) * FH();
  const fs = ' font-size:' + (z.shape === "text" ? clamp(h * 0.42, 11, 44) : clamp(Math.min(w, h) * 0.11, 11, 22)).toFixed(0) + "px;";
  const rot = z.rot ? "transform:rotate(" + z.rot + "deg);" : "";
  const tri = z.shape === "triangle" ? '<svg class="zshape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points="50,1.5 98.5,98.5 1.5,98.5" vector-effect="non-scaling-stroke"/></svg>' : "";
  return '<div class="zone' + (z.shape === "ellipse" ? " ellipse" : z.shape === "text" ? " text" : z.shape === "triangle" ? " triangle" : "") + (z.id === ui.openZoneId && ui.mode === "plan" ? " zopen" : "") + (ui.multi && ui.multi.has("z:" + z.id) ? " msel" : "") +
    '" data-zid="' + z.id + '" style="left:' + ((z.x / 100) * FW()).toFixed(1) + "px;top:" + ((z.y / 100) * FH()).toFixed(1) + "px;width:" + w.toFixed(1) + "px;height:" + h.toFixed(1) + "px;" + fs + rot + '">' + tri + "<span>" + esc(z.label) + '</span><i class="handle" aria-hidden="true"></i></div>';
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
  // ordem de baixo para cima: coberturas da planta, áreas, mesas
  itemsEl.innerHTML = (bgData ? state.zones.filter(isMask).map(zoneHtml).join("") : "") + state.zones.filter((z) => !isMask(z)).map(zoneHtml).join("") + state.tables.map((t) => tspotHtml(t, hits)).join("");
  vp.classList.toggle("drawing", ui.mode === "plan" && !!ui.drawMask);
  $("btnMask").setAttribute("aria-pressed", ui.drawMask ? "true" : "false");
  $("btnMask").hidden = !bgData;
  if (typeof renderMultiPanel === "function") renderMultiPanel();
  const plan = ui.mode === "plan";
  floorEl.classList.toggle("plan", plan);
  floorEl.classList.toggle("snap", plan && !!state.settings.snap);
  floorEl.classList.toggle("no-chairs", !state.settings.chairs);
  floorEl.classList.toggle("no-zones", !state.settings.zones && !plan);
  floorEl.classList.toggle("no-bg", !state.settings.bg);
  floorEl.classList.toggle("has-bg", !!bgData && !!state.settings.bg);
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
let nameTimer = null;
function setLvl() {
  const mode = state.settings.names, s = scaleNow();
  floorEl.dataset.lvl = mode === "always" ? "near" : mode === "never" ? "far" : s < 0.95 ? "far" : s < 1.7 ? "mid" : "near";
  $("zoomLbl").textContent = Math.round(zoom * 100) + "%";
  const nf2 = Math.round(clamp(9.5 / s, 3.2, 7) * 2) / 2;
  if (nf2 !== nameFont) {
    nameFont = nf2;
    floorEl.style.setProperty("--nfs", nameFont + "px");
    // redesenha quando o zoom assenta (quantos nomes cabem depende do tamanho da fonte)
    clearTimeout(nameTimer);
    nameTimer = setTimeout(() => { if (!tableDrag && !zoneDrag && !groupDrag && !swapDrag && !marquee && !maskDraw && !tableResize && !zoneResize) renderFloor(); }, 120);
  }
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
  floorEl.style.setProperty("--inv", (1 / scaleNow()).toFixed(3)); // alças com tamanho fixo na tela
  const r = vp.getBoundingClientRect();
  vp.classList.toggle("nopan", FW() * scaleNow() <= r.width + 1 && FH() * scaleNow() <= r.height + 1);
  setLvl();
}
function animView() { floorEl.classList.add("anim"); setTimeout(() => floorEl.classList.remove("anim"), 380); }
function contentBox() {
  if ((bgData && !isNarrow()) || (!state.tables.length && !state.zones.length)) return { x: 0, y: 0, w: FW(), h: FH() };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of state.tables) {
    const G = tableGeo(t), cx = (t.x / 100) * FW(), cy = (t.y / 100) * FH(), m = Math.max(G.W, G.H) / 2;
    x0 = Math.min(x0, cx - m); x1 = Math.max(x1, cx + m); y0 = Math.min(y0, cy - m); y1 = Math.max(y1, cy + m);
  }
  if (state.settings.zones) for (const z of state.zones) {
    if (isMask(z)) continue;
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
  ty = (r.height - occludedBottom()) / 2 - (t.y / 100) * FH() * s;
  animView();
  applyView();
}
function clientToPct(cx, cy) {
  const r = vp.getBoundingClientRect(), s = scaleNow();
  return { x: clamp((((cx - r.left - tx) / s) / FW()) * 100, 1, 99), y: clamp((((cy - r.top - ty) / s) / FH()) * 100, 1, 99) };
}
function viewCenterPct() { const r = vp.getBoundingClientRect(); return clientToPct(r.left + r.width / 2, r.top + r.height / 2); }
vp.addEventListener("wheel", (e) => {
  if (e.target.closest(".fpanel, .steps, .abar, .zoomctl, .empty-floor")) return; // rolar o painel, não o mapa
  e.preventDefault();
  const r = vp.getBoundingClientRect();
  // trackpad (dois dedos) move a vista; pinça no trackpad (ctrl) e roda do mouse dão zoom
  const trackpad = !e.ctrlKey && e.deltaMode === 0 && (e.deltaX !== 0 || (Math.abs(e.deltaY) < 50 && !Number.isInteger(e.deltaY)));
  if (trackpad) { tx -= e.deltaX; ty -= e.deltaY; applyView(); return; }
  zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)));
}, { passive: false });

/* ── Ponteiro: arrastar fundo, mesas, áreas; pinça para zoom ── */
const ptrs = new Map();
let panStart = null, pinchStart = null, panMoved = false;
let tableDrag = null, tableResize = null, zoneDrag = null, zoneResize = null, swapDrag = null, maskDraw = null, groupDrag = null, marquee = null;
const floorBusy = () => panMoved && ptrs.size > 0;
const dragging = () => !!(tableDrag || tableResize || zoneDrag || zoneResize || swapDrag || maskDraw || groupDrag || marquee);
function clientToPctRaw(cx, cy) {
  const r = vp.getBoundingClientRect(), s = scaleNow();
  return { x: clamp((((cx - r.left - tx) / s) / FW()) * 100, 0, 100), y: clamp((((cy - r.top - ty) / s) / FH()) * 100, 0, 100) };
}
/* ferramenta "Cobrir": arrastar sobre a planta desenha um retângulo que esconde aquela parte da imagem */
function setDrawMask(on) {
  if (on && !bgData) { toast("Envie a imagem da planta primeiro (botão Fundo)", { err: true }); on = false; }
  ui.drawMask = !!on;
  if (on && ui.mode !== "plan") setMode("plan");
  renderFloor();
  if (on) toast("Arraste sobre a planta para cobrir o que já está desenhado nela · Esc para sair");
}
// capturar o ponteiro só quando o arrasto começa — capturar já no pointerdown
// redireciona o clique para o viewport e a mesa nunca recebe o click.
const capture = (id) => { try { vp.setPointerCapture(id); } catch (err) { /* ponteiro já solto */ } };
const snapPx = (v, e) => (state.settings.snap && !(e && e.altKey) ? Math.round(v / SNAP) * SNAP : v);
const moveTh = (e) => (e.pointerType === "touch" ? 10 : 5); // dedo treme mais que o mouse

/* cancela qualquer arrasto em curso e devolve tudo ao lugar (Esc, segundo dedo, toque longo, troca de janela) */
function floorCancel() {
  if (tableDrag) { tableDrag.t.x = tableDrag.ox; tableDrag.t.y = tableDrag.oy; }
  if (zoneDrag) { zoneDrag.z.x = zoneDrag.ox; zoneDrag.z.y = zoneDrag.oy; }
  if (tableResize) tableResize.t.scale = tableResize.o;
  if (zoneResize) { zoneResize.z.w = zoneResize.ow; zoneResize.z.h = zoneResize.oh; }
  if (groupDrag) groupDrag.its.forEach((g) => setCenter(g.it, g.c.x, g.c.y));
  const had = dragging();
  tableDrag = tableResize = zoneDrag = zoneResize = groupDrag = null;
  if (marquee) { marquee.el.remove(); marquee = null; }
  if (maskDraw) { maskDraw.el.remove(); maskDraw = null; }
  if (swapDrag) { swapDrag.el.classList.remove("swapping"); swapDrag = null; }
  panStart = null; pinchStart = null; panMoved = false;
  ptrs.clear();
  vp.classList.remove("panning", "dragging");
  hideTip();
  if (had) renderFloor();
}
/* perto da borda, a vista anda sozinha durante o arrasto */
function edgePan(cx, cy) {
  const r = vp.getBoundingClientRect(), m = 40, st = 14;
  const dx = cx < r.left + m ? st : cx > r.right - m ? -st : 0;
  const dy = cy < r.top + m ? st : cy > r.bottom - m ? -st : 0;
  if (dx || dy) { tx += dx; ty += dy; applyView(); }
}
function resizeTip(text, cx, cy) {
  tipEl.innerHTML = "<div>" + esc(text) + "</div>";
  tipEl.hidden = false;
  tipEl.style.left = cx + 16 + "px";
  tipEl.style.top = cy + 16 + "px";
}

let spaceHeld = false;
document.addEventListener("keydown", (e) => { if (e.code === "Space" && !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target.tagName) && !e.target.matches(".gcard, .tspot") && ui.view === "salao" && !document.querySelector("dialog[open]")) { spaceHeld = true; vp.classList.add("panning"); e.preventDefault(); } });
document.addEventListener("keyup", (e) => { if (e.code === "Space") { spaceHeld = false; if (!panStart) vp.classList.remove("panning"); } });
vp.addEventListener("pointerdown", (e) => {
  if (ptrs.size === 0) panMoved = false; // um gesto novo nunca herda o "arrastou" do anterior
  if (e.target.closest(".fpanel, .abar, .zoomctl, .edit-hint button, .empty-floor, .steps")) return;
  if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
  if (e.button === 1) e.preventDefault();
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 2) {
    // segundo dedo: a pinça sempre vence — desfaz o arrasto que tinha começado
    if (dragging()) {
      const keep = new Map(ptrs);
      floorCancel();
      keep.forEach((v, k) => ptrs.set(k, v));
    }
    [...ptrs.keys()].forEach(capture);
    const [a, b] = [...ptrs.values()];
    pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    panStart = null;
    panMoved = true;
    return;
  }
  if (ptrs.size > 2) return;
  const base = { sx: e.clientX, sy: e.clientY, tx0: tx, ty0: ty, pid: e.pointerId, th: moveTh(e) };
  if (e.button === 1 || spaceHeld) { panStart = { x: e.clientX, y: e.clientY, tx, ty }; return; }
  const spot = e.target.closest(".tspot");
  const zEl = e.target.closest(".zone");
  if (ui.mode === "plan" && ui.drawMask && !e.target.closest(".handle")) {
    const el = document.createElement("div");
    el.className = "zone mask drawing";
    itemsEl.appendChild(el);
    maskDraw = Object.assign({ p0: clientToPctRaw(e.clientX, e.clientY), el }, base);
    return;
  }
  if (ui.mode === "plan" && e.shiftKey && !spot && !zEl) {
    const el = document.createElement("div");
    el.className = "marquee";
    itemsEl.appendChild(el);
    marquee = Object.assign({ p0: clientToPctRaw(e.clientX, e.clientY), el }, base);
    return;
  }
  if (ui.mode === "plan" && !e.shiftKey && ui.multi.size > 1 && !e.target.closest(".handle")) {
    const k = spot ? "t:" + spot.dataset.id : zEl ? "z:" + zEl.dataset.zid : null;
    if (k && ui.multi.has(k)) {
      const its = itemsOf([...ui.multi]).map((it) => ({ it, c: centerOf(it), el: itemsEl.querySelector(it.kind === "t" ? '.tspot[data-id="' + it.o.id + '"]' : '.zone[data-zid="' + it.o.id + '"]') }));
      groupDrag = Object.assign({ its, anchor: its.find((x) => keyOf(x.it.kind, x.it.o.id) === k) }, base);
      return;
    }
  }
  if (ui.mode === "plan") {
    const h = e.target.closest(".handle");
    if (h && spot) {
      const t = tableById(spot.dataset.id), rr = spot.getBoundingClientRect();
      const ccx = rr.left + rr.width / 2, ccy = rr.top + rr.height / 2;
      tableResize = Object.assign({ t, o: t.scale || 1, ccx, ccy, d0: Math.max(8, Math.hypot(e.clientX - ccx, e.clientY - ccy)) }, base);
      return;
    }
    if (h && zEl) { const z = zoneById(zEl.dataset.zid); zoneResize = Object.assign({ z, el: zEl, ow: z.w, oh: z.h }, base); return; }
    if (spot) { const t = tableById(spot.dataset.id); tableDrag = Object.assign({ t, el: spot, ox: t.x, oy: t.y }, base); return; }
    if (zEl) { const z = zoneById(zEl.dataset.zid); zoneDrag = Object.assign({ z, el: zEl, ox: z.x, oy: z.y }, base); return; }
  } else if (spot && e.pointerType !== "touch") {
    // trocar convidados arrastando uma mesa sobre outra — só com mouse; no toque, arrastar move a vista
    const t = tableById(spot.dataset.id);
    swapDrag = Object.assign({ t, el: spot, ox: (t.x / 100) * FW(), oy: (t.y / 100) * FH(), target: null }, base);
    return;
  }
  panStart = { x: e.clientX, y: e.clientY, tx, ty };
});
vp.addEventListener("pointermove", (e) => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const s = scaleNow();
  if (ptrs.size === 2 && pinchStart) {
    const [a, b] = [...ptrs.values()];
    const r = vp.getBoundingClientRect();
    const target = clamp(pinchStart.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / pinchStart.d), 0.6, 8);
    zoomAt((a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top, target / zoom);
    return;
  }
  const D = groupDrag || marquee || maskDraw || tableDrag || swapDrag || tableResize || zoneResize || zoneDrag;
  if (D && e.pointerId !== D.pid) return;
  const startMove = (th) => {
    if (!panMoved && Math.hypot(e.clientX - D.sx, e.clientY - D.sy) > th) {
      panMoved = true; capture(e.pointerId); hideTip(); cancelLongPress(); vp.classList.add("dragging");
    }
    return panMoved;
  };
  // deslocamento lógico, descontando o quanto a vista andou sozinha na borda
  const ddx = () => (e.clientX - D.sx - (tx - D.tx0)) / s, ddy = () => (e.clientY - D.sy - (ty - D.ty0)) / s;
  if (groupDrag) {
    if (startMove(D.th)) {
      edgePan(e.clientX, e.clientY);
      const a = groupDrag.anchor.c;
      const ax = snapPx((a.x / 100) * FW() + ddx(), e), ay = snapPx((a.y / 100) * FH() + ddy(), e);
      const mx = (ax / FW()) * 100 - a.x, my = (ay / FH()) * 100 - a.y;
      for (const g of groupDrag.its) {
        setCenter(g.it, g.c.x + mx, g.c.y + my);
        if (!g.el) continue;
        g.el.style.left = (g.it.o.x / 100) * FW() + "px";
        g.el.style.top = (g.it.o.y / 100) * FH() + "px";
      }
    }
    return;
  }
  if (marquee) {
    if (startMove(3)) {
      const p = clientToPctRaw(e.clientX, e.clientY), a = marquee.p0;
      marquee.p1 = p;
      Object.assign(marquee.el.style, { left: (Math.min(a.x, p.x) / 100) * FW() + "px", top: (Math.min(a.y, p.y) / 100) * FH() + "px", width: (Math.abs(p.x - a.x) / 100) * FW() + "px", height: (Math.abs(p.y - a.y) / 100) * FH() + "px" });
      // prévia ao vivo do que vai ser selecionado
      const x0 = Math.min(a.x, p.x), x1 = Math.max(a.x, p.x), y0 = Math.min(a.y, p.y), y1 = Math.max(a.y, p.y);
      for (const t of state.tables) { const el = itemsEl.querySelector('.tspot[data-id="' + t.id + '"]'); if (el) el.classList.toggle("msel", t.x >= x0 && t.x <= x1 && t.y >= y0 && t.y <= y1); }
    }
    return;
  }
  if (maskDraw) {
    if (startMove(3)) {
      const p = clientToPctRaw(e.clientX, e.clientY), a = maskDraw.p0;
      const x0 = Math.min(a.x, p.x), y0 = Math.min(a.y, p.y);
      Object.assign(maskDraw.el.style, { left: (x0 / 100) * FW() + "px", top: (y0 / 100) * FH() + "px", width: (Math.abs(p.x - a.x) / 100) * FW() + "px", height: (Math.abs(p.y - a.y) / 100) * FH() + "px", background: ui.lastMaskFill || "#ffffff" });
      maskDraw.p1 = p;
    }
    return;
  }
  if (tableDrag) {
    if (startMove(D.th)) {
      edgePan(e.clientX, e.clientY);
      const t = tableDrag.t;
      const px = snapPx((tableDrag.ox / 100) * FW() + ddx(), e), py = snapPx((tableDrag.oy / 100) * FH() + ddy(), e);
      t.x = clamp((px / FW()) * 100, 0.5, 99.5);
      t.y = clamp((py / FH()) * 100, 0.5, 99.5);
      tableDrag.el.style.left = (t.x / 100) * FW() + "px";
      tableDrag.el.style.top = (t.y / 100) * FH() + "px";
    }
    return;
  }
  if (swapDrag) {
    if (!panMoved && startMove(D.th)) swapDrag.el.classList.add("swapping");
    if (!panMoved) return;
    edgePan(e.clientX, e.clientY);
    swapDrag.el.style.left = swapDrag.ox + ddx() + "px";
    swapDrag.el.style.top = swapDrag.oy + ddy() + "px";
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const tgt = under ? under.closest(".tspot") : null;
    if (swapDrag.target && swapDrag.target !== tgt) swapDrag.target.classList.remove("dragover");
    swapDrag.target = tgt && tgt !== swapDrag.el ? tgt : null;
    if (swapDrag.target) swapDrag.target.classList.add("dragover");
    return;
  }
  if (tableResize) {
    if (startMove(3)) {
      // escala pela distância ao centro: a alça fica embaixo do ponteiro
      const d = Math.hypot(e.clientX - tableResize.ccx, e.clientY - tableResize.ccy);
      const raw = tableResize.o * (d / tableResize.d0);
      tableResize.t.scale = clamp(e.altKey ? raw : Math.round(raw * 20) / 20, 0.5, 2.5);
      refreshTspot(tableResize.t);
      resizeTip(Math.round(tableResize.t.scale * 100) + "% · " + tableResize.t.cap + " lugares", e.clientX, e.clientY);
    }
    return;
  }
  if (zoneResize) {
    if (startMove(3)) {
      const z = zoneResize.z, sn = isMask(z) ? (v) => v : snapPx;
      const wpx = sn((zoneResize.ow / 100) * FW() + ddx(), e), hpx = sn((zoneResize.oh / 100) * FH() + ddy(), e);
      z.w = clamp((wpx / FW()) * 100, 1, 100 - z.x);
      z.h = clamp((hpx / FH()) * 100, 1, 100 - z.y);
      zoneResize.el.style.width = (z.w / 100) * FW() + "px";
      zoneResize.el.style.height = (z.h / 100) * FH() + "px";
      if (z.shape === "text") zoneResize.el.style.fontSize = clamp((z.h / 100) * FH() * 0.42, 11, 44) + "px";
    }
    return;
  }
  if (zoneDrag) {
    if (startMove(D.th)) {
      edgePan(e.clientX, e.clientY);
      const z = zoneDrag.z;
      const sn = isMask(z) ? (v) => v : snapPx; // cobertura encaixa livre, para casar com o desenho da planta
      const px = sn((zoneDrag.ox / 100) * FW() + ddx(), e), py = sn((zoneDrag.oy / 100) * FH() + ddy(), e);
      z.x = clamp((px / FW()) * 100, 0, 100 - z.w);
      z.y = clamp((py / FH()) * 100, 0, 100 - z.h);
      zoneDrag.el.style.left = (z.x / 100) * FW() + "px";
      zoneDrag.el.style.top = (z.y / 100) * FH() + "px";
    }
    return;
  }
  if (panStart) {
    const dx = e.clientX - panStart.x, dy = e.clientY - panStart.y;
    if (!panMoved && Math.hypot(dx, dy) > moveTh(e)) { panMoved = true; vp.classList.add("panning"); capture(e.pointerId); hideTip(); cancelLongPress(); }
    if (panMoved) { tx = panStart.tx + dx; ty = panStart.ty + dy; applyView(); }
  }
});
function endPtr(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinchStart = null;
  if (ptrs.size) return;
  panStart = null;
  vp.classList.remove("panning", "dragging");
  const moved = panMoved;
  if (tableResize) hideTip();
  if (tableDrag) { tableDrag = null; if (moved) commit(); }
  if (tableResize) { tableResize = null; if (moved) commit(); }
  if (zoneDrag || zoneResize) { zoneDrag = zoneResize = null; if (moved) commit(); }
  if (groupDrag) { groupDrag = null; if (moved) commit(); }
  if (marquee) {
    const { p0: a, p1: b, el } = marquee;
    marquee = null;
    el.remove();
    if (moved && b) {
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      const inside = (c) => c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1;
      const keys = state.tables.filter((t) => inside(t)).map((t) => "t:" + t.id)
        .concat(state.zones.filter((z) => inside({ x: z.x + z.w / 2, y: z.y + z.h / 2 }) && (!isMask(z) || bgData)).map((z) => "z:" + z.id));
      selectKeys(keys);
      if (keys.length > 1) toast(plural(keys.length, "item selecionado", "itens selecionados") + " — arraste qualquer um para mover todos");
    }
  }
  if (maskDraw) {
    const { p0: a, p1: b, el } = maskDraw;
    maskDraw = null;
    el.remove();
    if (moved && b && Math.abs(b.x - a.x) >= 0.5 && Math.abs(b.y - a.y) >= 0.5) {
      state.zones.push({ id: uid("z"), label: "", shape: "mask", fill: ui.lastMaskFill || "#ffffff", x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });
      commit();
    }
  }
  if (swapDrag) {
    const src = swapDrag.t, tgtEl = swapDrag.target;
    swapDrag.el.classList.remove("swapping");
    if (tgtEl) tgtEl.classList.remove("dragover");
    swapDrag = null;
    if (moved) {
      const dst = tgtEl ? tableById(tgtEl.dataset.id) : null;
      if (dst && dst.id !== src.id) swapTables(src, dst);
      else { renderFloor(); toast("Para mudar a mesa de lugar, entre em Editar planta (tecla E). Aqui, soltar sobre outra mesa troca os convidados.", { action: { label: "Editar planta", fn: () => setMode("plan") } }); }
    }
  }
}
vp.addEventListener("pointerup", endPtr);
vp.addEventListener("pointercancel", (e) => { if (dragging()) floorCancel(); else endPtr(e); });
vp.addEventListener("lostpointercapture", (e) => { if (ptrs.has(e.pointerId)) endPtr(e); });
window.addEventListener("blur", () => {
  spaceHeld = false;
  vp.classList.remove("panning");
  if (ptrs.size) floorCancel();
});
vp.addEventListener("click", (e) => {
  if (panMoved && e.detail !== 0) { e.stopPropagation(); e.preventDefault(); panMoved = false; }
}, true);
vp.addEventListener("dblclick", (e) => {
  if (e.target.closest(".tspot, .zone, .fpanel, .abar, .zoomctl, .empty-floor, .edit-hint, .steps")) return;
  const r = vp.getBoundingClientRect();
  zoomAt(e.clientX - r.left, e.clientY - r.top, 1.6, true);
});
floorEl.addEventListener("click", (e) => {
  const tEl = e.target.closest(".tspot");
  if (tEl) {
    const id = tEl.dataset.id;
    if (ui.mode === "seat" && ui.selectedId) { assign(ui.selectedId, id); return; }
    if (ui.mode === "plan" && e.shiftKey) { toggleKey("t:" + id); return; }
    ui.multi.clear();
    ui.openTableId = ui.openTableId === id && ui.mode === "seat" ? null : id;
    ui.openZoneId = null;
    renderFloor(); renderTablePanel(); renderZonePanel();
    if (ui.openTableId) revealTable(ui.openTableId);
    if (e.detail === 0 && ui.openTableId) $("tpanel").focus();
    return;
  }
  const zEl = e.target.closest(".zone");
  if (zEl && ui.mode === "plan") {
    if (e.shiftKey) { toggleKey("z:" + zEl.dataset.zid); return; }
    ui.multi.clear();
    ui.openZoneId = zEl.dataset.zid;
    ui.openTableId = null;
    renderFloor(); renderTablePanel(); renderZonePanel();
    return;
  }
  if (e.shiftKey && ui.mode === "plan") return;
  if (ui.openTableId || ui.openZoneId || ui.multi.size) {
    ui.openTableId = null; ui.openZoneId = null; ui.multi.clear();
    renderFloor(); renderTablePanel(); renderZonePanel();
  }
});
/* soltar um card de convidado (arrastar do mouse) sobre a mesa */
const clearDragover = () => document.querySelectorAll(".dragover, .dropin").forEach((x) => x.classList.remove("dragover", "dropin"));
floorEl.addEventListener("dragover", (e) => {
  edgePan(e.clientX, e.clientY);
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
  clearDragover();
  if (!tEl) return;
  e.preventDefault();
  const gid = e.dataTransfer.getData("text/plain");
  if (gid && guestById(gid)) assign(gid, tEl.dataset.id);
});
document.addEventListener("dragend", () => { clearDragover(); ui.dragGuest = null; });
/* mostra a mesa sem ela ficar escondida atrás do painel ou da barra do convidado */
function occludedBottom() {
  let b = 0;
  if ($("abar").classList.contains("open")) b = Math.max(b, $("abar").offsetHeight + 24);
  if (window.matchMedia("(max-width: 760px)").matches && $("tpanel").classList.contains("open")) b = Math.max(b, $("tpanel").offsetHeight + 16);
  return b;
}
function revealTable(tid, opts) {
  const t = tableById(tid);
  if (!t) return;
  const r = vp.getBoundingClientRect(), s = scaleNow();
  const ob = occludedBottom();
  const x = tx + (t.x / 100) * FW() * s, y = ty + (t.y / 100) * FH() * s;
  const m = 60;
  if (!(opts && opts.force) && x > m && x < r.width - m && y > m && y < r.height - ob - m) return; // já está à vista
  tx += r.width / 2 - x;
  ty += (r.height - ob) / 2 - y;
  animView();
  applyView();
}

/* ── Modo: organizar convidados × editar planta ── */
function setMode(m) {
  if (ui.mode === m) return;
  ui.mode = m;
  ui.selectedId = null;
  if (ui.multi) ui.multi.clear();
  if (m === "seat") ui.drawMask = false;
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
  $("editHint").querySelector("span").textContent = touch ? "Editando a planta: arraste para mover · toque longo para mais opções" : "Editando a planta: arraste para mover · botões acima criam mesas e áreas · botão direito: mais opções";
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
function freeSpot(p, shape) {
  const G = tableGeo({ shape: shape || "round", cap: DEFAULT_CAP[shape || "round"], scale: 1 });
  const R = Math.max(G.W, G.H) / 2;
  const px0 = (p.x / 100) * FW(), py0 = (p.y / 100) * FH();
  const ok = (x, y) => x > R && x < FW() - R && y > R && y < FH() - R &&
    !state.tables.some((t) => { const g = tableGeo(t); return Math.hypot((t.x / 100) * FW() - x, (t.y / 100) * FH() - y) < R + Math.max(g.W, g.H) / 2 + 6; });
  for (let ring = 0; ring < 8; ring++) {
    const n = ring ? 8 * ring : 1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, d = ring * (R * 2 + 8);
      const x = clamp(px0 + Math.cos(a) * d, R, FW() - R), y = clamp(py0 + Math.sin(a) * d, R, FH() - R);
      if (ok(x, y)) return { x: (x / FW()) * 100, y: (y / FH()) * 100 };
    }
  }
  return { x: clamp(p.x, 3, 97), y: clamp(p.y, 3, 97) };
}
function addTable(shape, at) {
  const f = freeSpot(at || viewCenterPct(), shape);
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
  const mask = kind === "mask" || kind === "maskellipse";
  const w = kind === "text" ? 14 : mask ? 6 : 12, h = kind === "text" ? 5 : mask ? 8 : 14;
  const z = { id: uid("z"), rot: 0, label: kind === "text" ? "Texto" : mask ? "" : "Nova área", shape: kind === "text" || kind === "ellipse" || kind === "triangle" ? kind : mask ? kind : "rect", x: clamp(p.x - w / 2, 0, 100 - w), y: clamp(p.y - h / 2, 0, 100 - h), w, h };
  if (mask) z.fill = ui.lastMaskFill || "#ffffff";
  state.zones.push(z);
  if (ui.mode !== "plan") setMode("plan");
  ui.openZoneId = z.id;
  ui.openTableId = null;
  commit();
  if (!mask && finePointer()) setTimeout(() => { $("zpName").focus(); $("zpName").select(); }, 30);
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
  const its = selItems();
  if (!its.length) return false;
  for (const it of its) { const c = centerOf(it); setCenter(it, c.x + (dx * SNAP / FW()) * 100, c.y + (dy * SNAP / FH()) * 100); }
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
  $("tpScale").value = Math.round((t.scale || 1) * 100);
  $("tpScaleV").textContent = Math.round((t.scale || 1) * 100) + "%";
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
$("tpScale").addEventListener("input", () => {
  const t = tableById(ui.openTableId);
  if (!t) return;
  t.scale = +$("tpScale").value / 100;
  $("tpScaleV").textContent = $("tpScale").value + "%";
  refreshTspot(t);
});
$("tpScale").addEventListener("change", () => commit());
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
  $("zpTitle").textContent = isMask(z) ? "Cobertura da planta" : z.shape === "text" ? "Texto na planta" : "Área do salão";
  $("zpNameRow").hidden = isMask(z);
  $("zpFillRow").hidden = !isMask(z);
  $("zpPick").hidden = !window.EyeDropper;
  if (isMask(z)) $("zpFill").value = z.fill || "#ffffff";
  $("zpDelete").lastChild.textContent = isMask(z) ? "Excluir cobertura" : "Excluir área";
  if (document.activeElement !== $("zpName")) $("zpName").value = z.label;
  $("zpShape").value = z.shape;
  if (document.activeElement !== $("zpW")) $("zpW").value = Math.round(z.w);
  if (document.activeElement !== $("zpH")) $("zpH").value = Math.round(z.h);
  $("zpRot").value = z.rot || 0;
  $("zpRotV").textContent = (z.rot || 0) + "°";
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
$("zpRot").addEventListener("input", () => {
  const z = zoneById(ui.openZoneId);
  if (!z) return;
  z.rot = +$("zpRot").value;
  $("zpRotV").textContent = z.rot + "°";
  const el = itemsEl.querySelector('.zone[data-zid="' + z.id + '"]');
  if (el) el.style.transform = z.rot ? "rotate(" + z.rot + "deg)" : "";
});
$("zpRot").addEventListener("change", () => commit());
function setMaskFill(c) {
  const z = zoneById(ui.openZoneId);
  if (!z || !isMask(z)) return;
  z.fill = c;
  ui.lastMaskFill = c;
  commit();
}
$("zpFill").addEventListener("input", () => { const z = zoneById(ui.openZoneId); const el = z && itemsEl.querySelector('.zone[data-zid="' + z.id + '"]'); if (el) el.style.background = $("zpFill").value; });
$("zpFill").addEventListener("change", () => setMaskFill($("zpFill").value));
$("zpWhite").addEventListener("click", () => setMaskFill("#ffffff"));
/* conta-gotas: pega a cor do papel da planta para a cobertura sumir no desenho */
$("zpPick").addEventListener("click", async () => {
  try { const r = await new window.EyeDropper().open(); if (r && r.sRGBHex) setMaskFill(r.sRGBHex.length === 7 ? r.sRGBHex : "#ffffff"); } catch (e) { /* cancelado */ }
});
$("btnMask").addEventListener("click", () => setDrawMask(!ui.drawMask));

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
function multiMenuItems() {
  return [
    { header: plural(ui.multi.size, "item selecionado", "itens selecionados") },
    { label: "Alinhar em linha", icon: "align-row", action: () => alignItems("row") },
    { label: "Alinhar em coluna", icon: "align-col", action: () => alignItems("col") },
    { label: "Distribuir na horizontal", icon: "dist-h", action: () => alignItems("dh") },
    { label: "Distribuir na vertical", icon: "dist-v", action: () => alignItems("dv") },
    "-",
    { label: "Lugares", icon: "users", sub: () => [4, 6, 8, 10, 12, 14, 16, 20].map((c) => ({ label: c + " lugares", action: () => setTables((x) => { x.cap = c; }, c + " lugares") })) },
    { label: "Formato", icon: "round", sub: () => Object.entries(SHAPES).map(([k, v]) => ({ label: v, action: () => setTables((x) => { x.shape = k; }, v.toLowerCase()) })) },
    { label: "Girar 90°", icon: "rotate", kbd: "Shift+R", action: () => rotateSelection(90) },
    { label: "Copiar", icon: "copy", kbd: "Ctrl+C", action: copySelection },
    { label: "Duplicar", icon: "copy", kbd: "Ctrl+D", action: duplicateSelection },
    "-",
    { label: "Excluir", icon: "trash", danger: true, kbd: "Del", action: deleteSelection }
  ];
}
function tableMenuItems(t) {
  if (ui.mode === "plan" && ui.multi.has("t:" + t.id)) return multiMenuItems();
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
  if (ui.multi.has("z:" + z.id)) return multiMenuItems();
  return [
    { label: isMask(z) ? "Cor e tamanho" : "Editar nome e tamanho", icon: "pencil", action: () => { if (ui.mode !== "plan") setMode("plan"); ui.openZoneId = z.id; ui.openTableId = null; renderAll(); if (!isMask(z)) $("zpName").focus(); } },
    { label: "Tipo", icon: "area", sub: () => (isMask(z) ? [["mask", "Cobertura retangular"], ["maskellipse", "Cobertura redonda"]] : [["rect", "Retângulo"], ["ellipse", "Elipse"], ["triangle", "Triângulo"], ["text", "Só texto"]]).map(([k, v]) => ({ label: v, checked: z.shape === k, action: () => { z.shape = k; if (isMask(z) && !z.fill) z.fill = "#ffffff"; commit(); } })) },
    { label: "Girar 90°", icon: "rotate", kbd: "Shift+R", action: () => { z.rot = (((z.rot || 0) + 90) % 360); commit(); } },
    { label: "Duplicar", icon: "copy", kbd: "Ctrl+D", action: () => duplicateZone(z) },
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
    items.push({ label: "Área retangular", icon: "area", kbd: "A", action: () => addZone("rect", p) });
    items.push({ label: "Área oval", icon: "oval", kbd: "O", action: () => addZone("ellipse", p) });
    items.push({ label: "Triângulo", icon: "triangle", kbd: "V", action: () => addZone("triangle", p) });
    items.push({ label: "Texto", icon: "text", kbd: "T", action: () => addZone("text", p) });
    if (ui.clip) items.push({ label: "Colar aqui", icon: "copy", kbd: "Ctrl+V", action: () => pasteClip(p) });
    if (bgData) items.push({ label: "Cobertura da planta", icon: "eraser", desc: "Esconde algo já desenhado na imagem", action: () => addZone("mask", p) });
    items.push("-");
    if (bgData) items.push({ label: "Desenhar coberturas", icon: "eraser", checked: !!ui.drawMask, action: () => setDrawMask(!ui.drawMask) });
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
    toast((isPdf && r.pages > 1 ? "Planta aplicada (página 1 de " + r.pages + ")." : "Planta aplicada.") + " Se as mesas ficarem pequenas ou grandes demais para o desenho, ajuste em Fundo › Tamanho de todas as mesas.", { action: { label: "Ajustar", fn: () => openMenu(bgMenuItems, null, { anchor: $("btnBg") }) } });
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
    ratio(3, 2, "Paisagem 3:2"), ratio(4, 3, "Paisagem 4:3"), ratio(16, 9, "Panorâmica 16:9"), ratio(1, 1, "Quadrada 1:1"), ratio(2, 3, "Retrato 2:3"),
    "-",
    { label: "Tamanho de todas as mesas", icon: "round", desc: "Para casar com a escala do desenho da planta", kbd: Math.round((state.floor.tscale || 1) * 100) + "%",
      sub: () => [40, 50, 60, 70, 80, 90, 100, 120, 140, 170, 200].map((v) => ({ label: v + "%", checked: Math.round((state.floor.tscale || 1) * 100) === v, action: () => { state.floor.tscale = v / 100; commit(); } })) }
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
