"use strict";
/* Mapa de Mesas — núcleo: estado, armazenamento local, migração, tema e utilidades.
   Scripts clássicos (sem módulos) para funcionar também aberto direto do disco (file://). */

const SCHEMA = 4;
const LS = {
  index: "mdm:index",
  current: "mdm:current",
  ev: (id) => "mdm:ev:" + id,
  legacy: ["casamento-mesas-v3", "casamento-mesas-v2", "casamento-mesas-v1"],
  legacyDone: "mdm:legacy-imported"
};

/* ── Utilidades ── */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const nf = new Intl.NumberFormat("pt-BR");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = (p) => (p || "") + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const ic = (name, cls) => '<svg class="ic' + (cls ? " " + cls : "") + '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
const plural = (n, one, many) => nf.format(n) + " " + (n === 1 ? one : many);
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "grupo";
const int0 = (v) => Math.max(0, parseInt(v, 10) || 0);
const isNarrow = () => window.matchMedia("(max-width: 1100px)").matches;
/* busca por palavras: "claudia souza" acha "Cláudia e Roberto Souza" */
const qWords = (q) => norm(q).split(/\s+/).filter(Boolean);
const textMatch = (text, q) => { const w = Array.isArray(q) ? q : qWords(q); if (!w.length) return true; const t = norm(text); return w.every((x) => t.includes(x)); };

const ACCENTS = [
  ["#9f4a5e", "Rosé"], ["#4f46e5", "Índigo"], ["#2563eb", "Azul"], ["#0f766e", "Verde-água"], ["#4d7c0f", "Oliva"],
  ["#a16207", "Dourado"], ["#c2410c", "Terracota"], ["#be185d", "Rosa"], ["#9f1239", "Vinho"],
  ["#7c3aed", "Violeta"], ["#3f3f46", "Grafite"]
];
const SIDE_COLORS = [
  ["#0ea5e9", "Azul-céu"], ["#d946ef", "Fúcsia"], ["#10b981", "Esmeralda"], ["#f59e0b", "Âmbar"],
  ["#f43f5e", "Coral"], ["#8b5cf6", "Lavanda"], ["#14b8a6", "Turquesa"], ["#64748b", "Ardósia"]
];
const TITLE_FONTS = [
  { id: "cormorant", name: "Clássica" },
  { id: "playfair", name: "Elegante" },
  { id: "script", name: "Manuscrita" },
  { id: "sans", name: "Simples" }
];
const SHAPES = { round: "Redonda", rect: "Retangular", square: "Quadrada", oval: "Oval" };
const DEFAULT_CAP = { round: 10, rect: 12, square: 8, oval: 10 };
const STATUS = { ok: "Confirmado", pend: "Pendente", nao: "Não vai" };

const DEFAULT_SETTINGS = { chairs: true, zones: true, bg: true, names: "auto", kidsASeat: true, snap: true, sideA: true, sideB: true };
const defaultGroups = () => [
  { id: "noivos", label: "Noivos" },
  { id: "familia", label: "Família" },
  { id: "padrinhos", label: "Padrinhos" },
  { id: "amigos", label: "Amigos" },
  { id: "trabalho", label: "Trabalho" },
  { id: "staff", label: "Equipe do evento", staff: true }
];

function blankState() {
  const now = new Date().toISOString();
  return {
    schema: SCHEMA,
    id: uid("e"),
    event: { hostA: "", hostB: "", title: "", date: "", time: "", venue: "", city: "", kidA: "0 a 5 anos", kidB: "6 a 12 anos" },
    theme: { accent: "#9f4a5e", colorA: "#0ea5e9", colorB: "#d946ef", titleFont: "cormorant" },
    groups: defaultGroups(),
    floor: { w: 1300, h: 900, bg: null },
    tables: [],
    zones: [],
    guests: [],
    settings: { ...DEFAULT_SETTINGS },
    meta: { createdAt: now, updatedAt: now, exportedAt: null }
  };
}

function newGuest(over) {
  return Object.assign({
    id: uid("g"), name: "", adults: 1, kidsA: 0, kidsB: 0, phone: "",
    invited: false, status: "pend", side: "", group: "amigos", table: null, notes: ""
  }, over || {});
}

/* completa campos ausentes — vale para backup importado e versões futuras/antigas */
function normalizeState(s) {
  const b = blankState();
  s.schema = SCHEMA;
  s.id = s.id || b.id;
  s.event = Object.assign(b.event, s.event || {});
  s.theme = Object.assign(b.theme, s.theme || {});
  s.groups = Array.isArray(s.groups) && s.groups.length ? s.groups : b.groups;
  s.floor = Object.assign(b.floor, s.floor || {});
  s.tables = Array.isArray(s.tables) ? s.tables : [];
  s.zones = Array.isArray(s.zones) ? s.zones : [];
  s.guests = Array.isArray(s.guests) ? s.guests : [];
  s.settings = Object.assign({ ...DEFAULT_SETTINGS }, s.settings || {});
  s.meta = Object.assign(b.meta, s.meta || {});
  for (const t of s.tables) {
    t.id = t.id || uid("t");
    t.label = String(t.label ?? "");
    t.shape = SHAPES[t.shape] ? t.shape : "round";
    t.cap = clamp(int0(t.cap) || DEFAULT_CAP[t.shape], 1, 60);
    t.x = Number.isFinite(+t.x) ? +t.x : 50;
    t.y = Number.isFinite(+t.y) ? +t.y : 50;
    t.scale = +t.scale || 1;
    t.rot = +t.rot || 0;
    t.alias = t.alias || "";
    t.notes = t.notes || "";
  }
  for (const z of s.zones) {
    z.id = z.id || uid("z");
    z.shape = ["rect", "ellipse", "triangle", "text", "mask", "maskellipse"].includes(z.shape) ? z.shape : "rect";
    z.rot = +z.rot || 0;
    z.label = z.label || "";
    if (isMask(z)) z.fill = /^#[0-9a-f]{6}$/i.test(z.fill || "") ? z.fill : "#ffffff";
  }
  const gids = new Set(s.groups.map((g) => g.id));
  const tids = new Set(s.tables.map((t) => t.id));
  for (const g of s.guests) {
    g.id = g.id || uid("g");
    g.name = String(g.name || "").trim() || "Sem nome";
    g.adults = int0(g.adults);
    g.kidsA = int0(g.kidsA);
    g.kidsB = int0(g.kidsB);
    g.phone = g.phone || "";
    g.notes = g.notes || "";
    g.invited = g.invited === null || g.invited === undefined ? null : !!g.invited; // null = não informado
    g.status = STATUS[g.status] ? g.status : "pend";
    g.side = ["a", "b", "ab"].includes(g.side) ? g.side : "";
    if (!gids.has(g.group)) g.group = s.groups[0].id;
    if (g.table && !tids.has(g.table)) g.table = null;
    if (g.status === "nao") g.table = null;
  }
  return s;
}

/* versão anterior (ferramenta de um casamento só, chave casamento-mesas-v3) → schema 4 */
function migrateLegacy(old) {
  const s = blankState();
  const sideMap = { noivo: "a", noiva: "b", noivos: "ab" };
  const groupMap = { "família": "familia", familia: "familia", padrinhos: "padrinhos", amigos: "amigos", trabalho: "trabalho", staff: "staff", noivos: "noivos" };
  s.tables = (old.tables || []).map((t) => ({
    id: t.id, label: String(t.label ?? ""), alias: t.alias || "", shape: t.shape || "round",
    cap: t.cap, x: t.x, y: t.y, scale: t.scale || 1, rot: 0, notes: t.notes || ""
  }));
  s.zones = (old.zones || []).map((z) => ({ id: z.id, label: z.label, shape: z.shape === "ellipse" ? "ellipse" : "rect", x: z.x, y: z.y, w: z.w, h: z.h }));
  s.guests = (old.guests || []).map((g) => newGuest({
    id: g.id, name: g.name, adults: g.adults, kidsA: g.k05, kidsB: g.k612, phone: g.phone || "",
    invited: !!g.invited, status: g.going === false ? "nao" : g.conf === "ok" ? "ok" : "pend",
    side: sideMap[g.side] || "", group: groupMap[g.grupo] || "amigos", table: g.going === false ? null : g.table || null, notes: g.notes || ""
  }));
  const st = old.settings || {};
  s.settings = Object.assign({ ...DEFAULT_SETTINGS }, {
    chairs: st.chairs !== false, zones: st.zones !== false, names: st.names || "auto", kidsASeat: st.k05Seats !== false
  });
  s.meta.migratedFrom = "v3";
  return normalizeState(s);
}

/* ── Armazenamento: lista de eventos + um registro por evento ── */
function readJSON(key) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function writeJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) {
    toast("Não foi possível salvar neste navegador (espaço cheio?). Salve um backup agora.", { err: true });
    return false;
  }
}
function listEvents() { return readJSON(LS.index) || []; }
function indexEntry(s) {
  return { id: s.id, title: displayTitle(s) + (s.meta.copy ? " (cópia)" : ""), date: s.event.date, guests: s.guests.length, updatedAt: s.meta.updatedAt, demo: !!s.meta.demo };
}
function persist(s) {
  if (!writeJSON(LS.ev(s.id), s)) return;
  const idx = listEvents().filter((e) => e.id !== s.id);
  idx.unshift(indexEntry(s));
  writeJSON(LS.index, idx);
  try { localStorage.setItem(LS.current, s.id); } catch (e) { /* ok */ }
}
function loadEventById(id) {
  const s = readJSON(LS.ev(id));
  return s && Array.isArray(s.guests) ? normalizeState(s) : null;
}
function removeEvent(id) {
  try { localStorage.removeItem(LS.ev(id)); } catch (e) { /* ok */ }
  writeJSON(LS.index, listEvents().filter((e) => e.id !== id));
  idbDelPrefix("bg:" + id);
}
function findLegacy() {
  if (localStorage.getItem(LS.legacyDone)) return null;
  for (const k of LS.legacy) {
    const v = readJSON(k);
    if (v && Array.isArray(v.guests) && Array.isArray(v.tables)) return { key: k, data: v };
  }
  return null;
}

/* IndexedDB guarda a imagem de fundo (grande demais para o localStorage) */
let dbP = null;
function idb() {
  if (!dbP) dbP = new Promise((res, rej) => {
    const r = indexedDB.open("mapa-de-mesas", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbP;
}
async function idbTx(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction("files", mode);
    const req = fn(tx.objectStore("files"));
    tx.oncomplete = () => res(req && req.result);
    tx.onerror = () => rej(tx.error);
  });
}
const idbGet = (k) => idbTx("readonly", (st) => st.get(k)).catch(() => null);
const idbPut = (k, v) => idbTx("readwrite", (st) => st.put(v, k));
const idbDel = (k) => idbTx("readwrite", (st) => st.delete(k)).catch(() => null);
const idbDelPrefix = (p) => idbTx("readwrite", (st) => st.delete(IDBKeyRange.bound(p, p + "￿"))).catch(() => null);
/* imagem de fundo: cada envio ganha uma chave própria, para o desfazer poder voltar à anterior */
const bgKey = (s) => (s.floor.bg && s.floor.bg.key) || "bg:" + s.id;

/* ── Estado atual + desfazer/refazer ── */
let state = null;
let bgData = null; // dataURL da imagem de fundo do evento atual
let undoStack = [], redoStack = [], lastSnap = null;

function setState(s, { fresh } = {}) {
  state = normalizeState(s);
  undoStack = []; redoStack = [];
  lastSnap = JSON.stringify(state);
  if (fresh) persist(state);
  else try { localStorage.setItem(LS.current, state.id); } catch (e) { /* ok */ }
}
function commit(opts) {
  if (lastSnap) {
    undoStack.push(lastSnap);
    if (undoStack.length > 80) undoStack.shift();
    redoStack = [];
  }
  state.meta.updatedAt = new Date().toISOString();
  persist(state);
  lastSnap = JSON.stringify(state);
  if (!opts || !opts.silent) renderAll();
}
function restoreSnap(json) {
  const prevBg = bgKey(state) + (state.floor.bg ? "" : "-none");
  state = JSON.parse(json);
  lastSnap = json;
  if (ui.selectedId && !guestById(ui.selectedId)) ui.selectedId = null;
  if (ui.openTableId && !tableById(ui.openTableId)) ui.openTableId = null;
  if (ui.openZoneId && !zoneById(ui.openZoneId)) ui.openZoneId = null;
  persist(state);
  applyTheme();
  renderAll();
  if (prevBg !== bgKey(state) + (state.floor.bg ? "" : "-none") && typeof loadBgForCurrent === "function") loadBgForCurrent();
}
/* preferências de exibição: salvam, mas não entram no desfazer */
function commitQuiet() {
  persist(state);
  lastSnap = JSON.stringify(state);
  renderAll();
}
function undo() {
  if (!undoStack.length) { toast("Nada para desfazer"); return; }
  redoStack.push(JSON.stringify(state));
  restoreSnap(undoStack.pop());
  toast("Desfeito", { action: { label: "Refazer", fn: redo } });
}
function redo() {
  if (!redoStack.length) { toast("Nada para refazer"); return; }
  undoStack.push(JSON.stringify(state));
  restoreSnap(redoStack.pop());
  toast("Refeito");
}

/* estado de interface (não vai para o arquivo) */
const ui = {
  view: "salao",
  mode: "seat",           // seat = organizar convidados · plan = editar planta
  selectedId: null,        // convidado selecionado
  openTableId: null,
  openZoneId: null,
  q: "",
  side: { a: { seg: "", group: "" }, b: { seg: "", group: "" } },
  list: { q: "", side: "", group: "", status: "", sort: { col: null, dir: 1 }, picked: new Set() }
};

/* ── Leitura derivada ── */
const guestById = (id) => state.guests.find((g) => g.id === id);
const tableById = (id) => state.tables.find((t) => t.id === id);
const zoneById = (id) => state.zones.find((z) => z.id === id);
const groupById = (id) => state.groups.find((g) => g.id === id);
const groupLabel = (id) => (groupById(id) || {}).label || "—";
const isStaff = (g) => !!(groupById(g.group) || {}).staff;
const going = (g) => g.status !== "nao";
const kidsSeat = (g) => (g.kidsB || 0) + (state.settings.kidsASeat ? (g.kidsA || 0) : 0);
const seats = (g) => (g.adults || 0) + kidsSeat(g);          // lugares na mesa
const persons = (g) => (g.adults || 0) + (g.kidsA || 0) + (g.kidsB || 0); // pessoas (bebês no colo contam)
const totalKids = (g) => (g.kidsA || 0) + (g.kidsB || 0);
const occupants = (tid) => state.guests.filter((g) => g.table === tid && going(g));
const occSeats = (tid) => occupants(tid).reduce((n, g) => n + seats(g), 0);
/* coberturas: retângulos/círculos que escondem partes da imagem da planta (ex.: mesas já desenhadas no PDF) */
const isMask = (z) => z.shape === "mask" || z.shape === "maskellipse";
const isNumLabel = (l) => /^\d+[a-z]?$/i.test(String(l).trim());
const tableName = (t) => (t ? (isNumLabel(t.label) ? "Mesa " + t.label : t.label || "Mesa") : "");
const tableFull = (t) => tableName(t) + (t.alias ? " · " + t.alias : "");
const hostName = (k) => (k === "a" ? state.event.hostA : state.event.hostB) || "";
const sideShort = (k) => (k === "a" ? hostName("a") || "Lado A" : k === "b" ? hostName("b") || "Lado B" : k === "ab" ? "Dos dois" : "Sem lado");
const sideLong = (k) => (k === "a" || k === "b" ? (hostName(k) ? "Convidados de " + hostName(k) : sideShort(k)) : sideShort(k));
const sideClass = (k) => (k === "a" || k === "b" || k === "ab" ? k : "n");
const kidLabel = (k) => "Crianças " + ((k === "a" ? state.event.kidA : state.event.kidB) || (k === "a" ? "faixa 1" : "faixa 2"));

function tableStatus(t) {
  const n = occSeats(t.id);
  return n === 0 ? "empty" : n > t.cap ? "over" : n === t.cap ? "full" : "partial";
}
function personDetail(g) {
  const parts = [plural(g.adults || 0, "adulto", "adultos")];
  if (g.kidsA) parts.push(g.kidsA + " " + (state.event.kidA ? "de " + state.event.kidA : "criança(s)") + (state.settings.kidsASeat ? "" : " (no colo)"));
  if (g.kidsB) parts.push(g.kidsB + " " + (state.event.kidB ? "de " + state.event.kidB : "criança(s)"));
  return parts.join(" · ");
}
function shortName(name) {
  let s = String(name).replace(/\(.*?\)/g, " ").replace(/\s+/g, " ").trim();
  const parts = s.split(/ e | & | \+ /i);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    const first = (p) => p.trim().split(" ")[0];
    s = first(parts[0]) + " e " + first(parts[1]);
  } else {
    s = s.split(" ").slice(0, 2).join(" ");
  }
  return s.length > 22 ? s.slice(0, 21) + "…" : s;
}
/* cadeiras pintadas pelo lado; o casal ("dos dois") alterna as duas cores */
function seatFills(occ) {
  const fills = [];
  for (const g of occ) {
    const k = sideClass(g.side);
    for (let i = 0; i < (g.adults || 0); i++) fills.push("a-" + (k === "ab" ? (i % 2 ? "b" : "a") : k));
    for (let i = 0; i < kidsSeat(g); i++) fills.push("k-" + (k === "ab" ? (i % 2 ? "b" : "a") : k));
  }
  return fills;
}
function nextTableLabel() {
  const nums = state.tables.map((t) => parseInt(t.label, 10)).filter((n) => Number.isFinite(n));
  return String(nums.length ? Math.max(...nums) + 1 : 1);
}
function sortedTables() {
  return [...state.tables].sort((a, b) => {
    const na = parseInt(a.label, 10), nb = parseInt(b.label, 10);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    if (Number.isFinite(na) !== Number.isFinite(nb)) return Number.isFinite(na) ? -1 : 1;
    return String(a.label).localeCompare(String(b.label), "pt-BR", { numeric: true });
  });
}

/* ── Textos do evento ── */
function displayTitle(s) {
  s = s || state;
  const e = s.event;
  if (e.title) return e.title;
  if (e.hostA && e.hostB) return e.hostA + " & " + e.hostB;
  return e.hostA || e.hostB || "Meu evento";
}
function eventDate(s) {
  s = s || state;
  if (!s.event.date) return null;
  const d = new Date(s.event.date + "T" + (s.event.time || "12:00") + ":00");
  return isNaN(d) ? null : d;
}
function dateLong(s) {
  const d = eventDate(s);
  return d ? new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" }).format(d) : "";
}
/* dias que faltam: com horário definido conta até a hora exata; sem horário, por dia do calendário */
function daysLeft() {
  const d = eventDate();
  if (!d) return null;
  if (state.event.time) return Math.floor((d - new Date()) / 86400000);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  return Math.round((day - today) / 86400000);
}
function countdown() {
  const n = daysLeft();
  if (n === null) return "";
  const sameDay = eventDate().toDateString() === new Date().toDateString();
  if (sameDay) return "é hoje";
  if (n === 1) return "é amanhã";
  if (n === 0) return "falta menos de 1 dia";
  if (n > 1) return "faltam " + nf.format(n) + " dias";
  return "foi há " + plural(-n, "dia", "dias");
}
function eventSubtitle(withCountdown) {
  const parts = [];
  const dl = dateLong();
  if (dl) parts.push(dl + (state.event.time ? " às " + state.event.time : ""));
  const place = [state.event.venue, state.event.city].filter(Boolean).join(", ");
  if (place) parts.push(place);
  if (withCountdown) { const c = countdown(); if (c) parts.push(c); }
  return parts.join(" · ");
}

/* ── Tema ── */
function luminance(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return 0;
  const n = parseInt(m[1], 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
/* cor principal + texto legível sobre ela + versão escura para texto sobre branco */
function setAccentVars(acc) {
  const r = document.documentElement;
  const L = luminance(acc);
  r.style.setProperty("--accent", acc);
  r.style.setProperty("--on-accent", L > 0.45 ? "#18181b" : "#ffffff");
  r.style.setProperty("--accent-text", L > 0.3 ? "color-mix(in srgb, " + acc + " 50%, black)" : L > 0.15 ? "color-mix(in srgb, " + acc + " 78%, black)" : "color-mix(in srgb, " + acc + " 92%, black)");
}
function accentTextHex(acc) {
  const L = luminance(acc), k = L > 0.3 ? 0.5 : L > 0.15 ? 0.78 : 0.92;
  const n = parseInt(String(acc).replace("#", ""), 16);
  return "#" + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.round(c * k).toString(16).padStart(2, "0")).join("");
}
function applyTheme() {
  const r = document.documentElement;
  const th = state ? state.theme : blankState().theme;
  setAccentVars(th.accent);
  r.style.setProperty("--side-a", th.colorA);
  r.style.setProperty("--side-b", th.colorB);
  r.dataset.titleFont = th.titleFont || "cormorant";
  document.title = state && (state.event.hostA || state.event.hostB || state.event.title) ? "Mesas — " + displayTitle() : "Mapa de Mesas";
}

/* ── Avisos ── */
let toastTimer = null;
function toast(msg, opts) {
  opts = opts || {};
  const el = $("toast");
  el.innerHTML = '<span class="tmsg"></span>';
  el.firstChild.textContent = msg;
  if (opts.action) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = opts.action.label;
    b.addEventListener("click", () => { el.classList.remove("show"); opts.action.fn(); });
    el.appendChild(b);
  } else el.style.paddingRight = "14px";
  if (opts.action) el.style.paddingRight = "";
  el.classList.toggle("err", !!opts.err);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), opts.action ? 5000 : 2800);
}
/* confirmação no estilo da ferramenta (no lugar do confirm() nativo) */
function ask(title, body, { ok = "Confirmar", danger = false, cancel = "Cancelar" } = {}) {
  return choose(title, body, [{ v: "no", label: cancel }, { v: "yes", label: ok, primary: !danger, danger }]).then((v) => v === "yes");
}
/* diálogo com vários botões; Esc ou fechar devolve null */
function choose(title, body, buttons) {
  return new Promise((resolve) => {
    const d = $("askdlg");
    $("askTitle").textContent = title;
    $("askBody").textContent = body || "";
    const foot = d.querySelector(".dlg-foot");
    foot.innerHTML = '<span class="spacer"></span>' + buttons.map((b) => '<button type="submit" class="btn' + (b.danger ? " danger-solid" : b.primary ? " primary" : "") + '" value="' + esc(b.v) + '">' + esc(b.label) + "</button>").join("");
    d.returnValue = "";
    d.addEventListener("close", function h() { d.removeEventListener("close", h); resolve(d.returnValue || null); });
    d.showModal();
    const last = foot.querySelector("button:last-child");
    if (last) last.focus();
  });
}

/* carrega script de vendor/ sob demanda (PDF e Excel), também offline */
const loadedScripts = {};
function loadScript(src) {
  if (!loadedScripts[src]) loadedScripts[src] = new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = res;
    s.onerror = () => { delete loadedScripts[src]; rej(new Error("Falha ao carregar " + src)); };
    document.head.appendChild(s);
  });
  return loadedScripts[src];
}
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function fileBase() {
  const t = slug(displayTitle()).slice(0, 40);
  return t && t !== "meu-evento" ? t : "evento";
}
