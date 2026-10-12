"use strict";
/* Componentes de interface: menu (suspenso e de contexto), dicas (tooltips),
   toque longo, diálogos e painéis arrastáveis. */

const finePointer = () => window.matchMedia("(pointer: fine)").matches;

/* ── Menu ──
   item: { label, icon, desc, kbd, action, danger, disabled, checked, swatch, sub, keep }
   "-" = separador · { header } = título de seção. Submenus abrem no lugar (funciona no toque). */
const menuEl = $("menu");
let menuState = null;

function openMenu(items, where, opts) {
  opts = opts || {};
  if (menuState && opts.anchor && menuState.anchor === opts.anchor) { closeMenu(); return; }
  closeMenu();
  hideTip();
  menuState = { pages: [{ title: null, src: items }], where, anchor: opts.anchor || null, align: opts.align || "start", hot: -1 };
  // dentro de um diálogo aberto o menu precisa morar no próprio diálogo (camada superior), senão fica atrás
  const host = document.querySelector("dialog[open]") || document.body;
  if (menuEl.parentElement !== host) host.appendChild(menuEl);
  menuState.prevFocus = document.activeElement;
  if (menuState.anchor) { menuState.anchor.classList.add("open"); menuState.anchor.setAttribute("aria-expanded", "true"); }
  drawMenu();
  if (opts.keyboard || (menuState.prevFocus && menuState.prevFocus.matches && menuState.prevFocus.matches(".gcard, .tspot, .orow"))) moveHot(1);
}
function closeMenu(restore) {
  if (!menuState) return;
  if (menuState.anchor) { menuState.anchor.classList.remove("open"); menuState.anchor.setAttribute("aria-expanded", "false"); }
  const back = menuState.prevFocus, hadFocus = menuEl.contains(document.activeElement);
  menuState = null;
  if ((restore || hadFocus) && back && back.isConnected && back.focus) back.focus();
  menuEl.hidden = true;
  menuEl.innerHTML = "";
}
const menuOpen = () => !!menuState;
function pageItems(page) {
  return (typeof page.src === "function" ? page.src() : page.src).filter((x) => x !== null && x !== undefined && x !== false);
}
function drawMenu() {
  const page = menuState.pages[menuState.pages.length - 1];
  const items = pageItems(page);
  page.items = items;
  const lead = items.some((it) => it && (it.icon || it.checked !== undefined || it.swatch));
  let html = "";
  if (menuState.pages.length > 1) html += '<button type="button" class="mi mback" data-i="back">' + ic("chev-left") + '<span class="ml">' + esc(page.title) + '</span></button><div class="msep"></div>';
  items.forEach((it, i) => {
    if (it === "-") { html += '<div class="msep"></div>'; return; }
    if (it.header) { html += '<div class="mh">' + esc(it.header) + "</div>"; return; }
    let l = "";
    if (it.checked !== undefined) l = '<span class="mcheck">' + (it.checked ? ic("check") : "") + "</span>";
    else if (it.swatch) l = '<span class="mcheck"><span class="mswatch" style="background:' + esc(it.swatch) + '"></span></span>';
    else if (it.icon) l = ic(it.icon);
    else if (lead) l = '<span class="mcheck"></span>';
    html += '<button type="button" role="menuitem" class="mi' + (it.danger ? " danger" : "") + (it.desc ? " two" : "") + '" data-i="' + i + '"' + (it.disabled ? " disabled" : "") + ">" + l +
      '<span class="ml">' + esc(it.label) + (it.desc ? '<span class="md">' + esc(it.desc) + "</span>" : "") + "</span>" +
      (it.kbd ? '<span class="mk">' + esc(it.kbd) + "</span>" : "") + (it.sub ? ic("chev-right", "chev") : "") + "</button>";
  });
  menuEl.innerHTML = html;
  menuEl.hidden = false;
  menuState.hot = -1;
  placeMenu();
}
function placeMenu() {
  const m = menuEl.getBoundingClientRect();
  const W = window.innerWidth, H = window.innerHeight;
  let x, y;
  if (menuState.anchor) {
    const r = menuState.anchor.getBoundingClientRect();
    x = menuState.align === "end" ? r.right - m.width : r.left;
    y = r.bottom + 4;
    if (y + m.height > H - 8 && r.top - m.height - 4 > 8) y = r.top - m.height - 4;
  } else {
    x = menuState.where.x; y = menuState.where.y;
    if (x + m.width > W - 8) x = Math.max(8, x - m.width);
    if (y + m.height > H - 8) y = Math.max(8, H - m.height - 8);
  }
  menuEl.style.left = clamp(x, 8, Math.max(8, W - m.width - 8)) + "px";
  menuEl.style.top = clamp(y, 8, Math.max(8, H - m.height - 8)) + "px";
}
function activateMenuItem(btn) {
  if (!btn || btn.disabled) return;
  if (btn.dataset.i === "back") { menuState.pages.pop(); drawMenu(); return; }
  const page = menuState.pages[menuState.pages.length - 1];
  const it = page.items[+btn.dataset.i];
  if (!it) return;
  if (it.sub) { const kb = menuEl.contains(document.activeElement); menuState.pages.push({ title: it.label, src: it.sub }); drawMenu(); if (kb) moveHot(1); return; }
  if (it.keep) { if (it.action) it.action(); drawMenu(); return; }
  closeMenu();
  if (it.action) it.action();
}
menuEl.addEventListener("click", (e) => activateMenuItem(e.target.closest(".mi")));
menuEl.addEventListener("pointermove", (e) => {
  const b = e.target.closest(".mi");
  menuEl.querySelectorAll(".mi.hot").forEach((x) => x !== b && x.classList.remove("hot"));
});
menuEl.addEventListener("contextmenu", (e) => e.preventDefault());
function moveHot(d) {
  const btns = [...menuEl.querySelectorAll(".mi:not(:disabled)")];
  if (!btns.length) return;
  let i = btns.findIndex((b) => b.classList.contains("hot"));
  btns.forEach((b) => b.classList.remove("hot"));
  i = i < 0 ? (d > 0 ? 0 : btns.length - 1) : (i + d + btns.length) % btns.length;
  btns[i].classList.add("hot");
  btns[i].focus({ preventScroll: true });
  btns[i].scrollIntoView({ block: "nearest" });
}
function menuKey(e) {
  if (!menuState) return false;
  const hot = menuEl.querySelector(".mi.hot");
  switch (e.key) {
    case "Escape":
      if (menuState.pages.length > 1) { menuState.pages.pop(); drawMenu(); moveHot(1); } else closeMenu(true);
      break;
    case "ArrowDown": moveHot(1); break;
    case "ArrowUp": moveHot(-1); break;
    case "ArrowLeft": if (menuState.pages.length > 1) { menuState.pages.pop(); drawMenu(); } break;
    case "ArrowRight": if (hot && hot.querySelector(".chev")) activateMenuItem(hot); break;
    case "Enter": case " ": if (hot) activateMenuItem(hot); break;
    case "Tab": closeMenu(); return false;
    default: return true; // deixa passar, mas não dispara atalhos
  }
  e.preventDefault();
  return true;
}
document.addEventListener("pointerdown", (e) => {
  if (!menuState) return;
  if (menuEl.contains(e.target)) return;
  if (menuState.anchor && menuState.anchor.contains(e.target)) return;
  closeMenu();
}, true);
window.addEventListener("resize", closeMenu);
window.addEventListener("blur", closeMenu);
/* botão que abre menu suspenso */
function bindMenuButton(btn, items, align) {
  btn.addEventListener("click", (e) => openMenu(items, null, { anchor: btn, align, keyboard: e.detail === 0 }));
}

/* ── Dicas (tooltips) ── */
const tipEl = $("tip");
let tipTimer = null, tipFor = null, tipMuted = null;
const TIP_SEL = "[data-tip], .tspot, .gcard, .orow";

function hideTip() {
  clearTimeout(tipTimer);
  tipFor = null;
  tipEl.hidden = true;
}
document.addEventListener("pointerover", (e) => {
  if (e.pointerType !== "mouse") return;
  const el = e.target.closest(TIP_SEL);
  if (el === tipFor) return;
  if (!el) { hideTip(); tipMuted = null; return; }
  if (el === tipMuted) return;
  tipMuted = null;
  clearTimeout(tipTimer);
  const quick = !tipEl.hidden;
  tipFor = el;
  tipTimer = setTimeout(() => showTip(el), quick ? 60 : 450);
});
document.addEventListener("pointerout", (e) => { if (!e.relatedTarget) hideTip(); });
document.addEventListener("pointerdown", () => { tipMuted = tipFor; hideTip(); }, true);
document.addEventListener("keydown", () => hideTip(), true);
document.addEventListener("wheel", () => hideTip(), { passive: true, capture: true });

function showTip(el) {
  if (menuState || !el.isConnected || (typeof floorBusy === "function" && floorBusy())) return;
  let html = null, prefs = ["below", "above", "right", "left"];
  if (el.classList.contains("tspot")) { html = tableTip(tableById(el.dataset.id)); prefs = ["right", "left", "below", "above"]; }
  else if (el.classList.contains("gcard") || el.classList.contains("orow")) {
    html = guestTip(guestById(el.dataset.id));
    const side = el.closest(".side");
    prefs = side && side.dataset.side === "b" ? ["left", "right", "below"] : el.classList.contains("orow") ? ["left", "right", "below"] : ["right", "left", "below"];
  } else if (el.dataset.tip) {
    html = "<div>" + esc(el.dataset.tip) + (el.dataset.kbd ? "<kbd>" + esc(el.dataset.kbd) + "</kbd>" : "") + "</div>";
  }
  if (!html) return;
  tipEl.innerHTML = html;
  tipEl.hidden = false;
  placeTip(el.getBoundingClientRect(), prefs);
}
function placeTip(r, prefs) {
  const t = tipEl.getBoundingClientRect();
  const W = window.innerWidth, H = window.innerHeight, g = 8;
  const fits = {
    below: r.bottom + g + t.height < H - 4,
    above: r.top - g - t.height > 4,
    right: r.right + g + t.width < W - 4,
    left: r.left - g - t.width > 4
  };
  const p = prefs.find((k) => fits[k]) || prefs[0];
  let x, y;
  if (p === "below" || p === "above") {
    x = r.left + r.width / 2 - t.width / 2;
    y = p === "below" ? r.bottom + g : r.top - g - t.height;
  } else {
    x = p === "right" ? r.right + g : r.left - g - t.width;
    y = r.top + r.height / 2 - t.height / 2;
  }
  tipEl.style.left = clamp(x, 4, W - t.width - 4) + "px";
  tipEl.style.top = clamp(y, 4, H - t.height - 4) + "px";
}

/* ── Menu de contexto: botão direito e toque longo ── */
let lastCtxAt = 0, longPress = null, eatClick = false;
function fireContext(target, x, y) {
  if (Date.now() - lastCtxAt < 700) return true;
  if (target.closest("input, textarea, select, .menu, dialog")) return false;
  const ok = contextFor(target, x, y);
  if (ok) lastCtxAt = Date.now();
  return ok;
}
document.addEventListener("contextmenu", (e) => {
  if (e.target.closest("input, textarea")) return;
  if (fireContext(e.target, e.clientX, e.clientY)) e.preventDefault();
});
document.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "mouse") return;
  const target = e.target, x = e.clientX, y = e.clientY;
  clearTimeout(longPress && longPress.t);
  longPress = {
    x, y,
    t: setTimeout(() => {
      longPress = null;
      if (fireContext(target, x, y)) { eatClick = true; if (navigator.vibrate) navigator.vibrate(8); if (typeof floorCancel === "function") floorCancel(); }
    }, 520)
  };
}, true);
document.addEventListener("pointermove", (e) => {
  if (longPress && Math.hypot(e.clientX - longPress.x, e.clientY - longPress.y) > 10) { clearTimeout(longPress.t); longPress = null; }
}, true);
const endLong = () => { if (longPress) { clearTimeout(longPress.t); longPress = null; } };
document.addEventListener("pointerup", endLong, true);
document.addEventListener("pointercancel", endLong, true);
document.addEventListener("click", (e) => {
  if (eatClick) { eatClick = false; e.stopPropagation(); e.preventDefault(); }
}, true);

/* ── Diálogos ── */
document.addEventListener("click", (e) => {
  const c = e.target.closest("[data-close]");
  if (c) { const d = c.closest("dialog"); if (d) d.close(); }
});
/* clicar no fundo escurecido fecha (exceto boas-vindas e confirmação) */
document.querySelectorAll("dialog").forEach((d) => {
  d.addEventListener("pointerdown", (e) => {
    if (e.target !== d || d.id === "welcome" || d.id === "askdlg") return;
    const r = d.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
  });
});

/* ── Painéis flutuantes arrastáveis pelo cabeçalho ── */
function makePanelDraggable(panel) {
  const head = panel.querySelector(".fpanel-head");
  let drag = null;
  head.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button, input, select")) return;
    const r = panel.getBoundingClientRect();
    drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    try { head.setPointerCapture(e.pointerId); } catch (err) { /* ok */ }
  });
  head.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const m = panel.parentElement.getBoundingClientRect();
    const r = panel.getBoundingClientRect();
    panel.style.left = clamp(e.clientX - m.left - drag.dx, 4, m.width - r.width - 4) + "px";
    panel.style.top = clamp(e.clientY - m.top - drag.dy, 4, m.height - r.height - 4) + "px";
    panel.style.right = "auto";
  });
  const end = () => { drag = null; };
  head.addEventListener("pointerup", end);
  head.addEventListener("pointercancel", end);
}
/* abre o painel do lado oposto ao elemento (mesa à direita → painel à esquerda) */
function placePanel(panel, xPct) {
  if (window.matchMedia("(max-width: 760px)").matches) { panel.style.left = ""; panel.style.right = ""; panel.style.top = ""; return; }
  panel.style.top = "12px";
  if (xPct > 50) { panel.style.left = "12px"; panel.style.right = "auto"; }
  else { panel.style.left = "auto"; panel.style.right = "12px"; }
}
