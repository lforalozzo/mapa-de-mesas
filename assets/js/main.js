"use strict";
/* Menus da barra superior, atalhos de teclado, menu de contexto e inicialização. */

function fileMenuItems() {
  const n = listEvents().length;
  const unsaved = state.guests.length > 0 && (!state.meta.exportedAt || state.meta.exportedAt < state.meta.updatedAt);
  return [
    unsaved ? { label: "Salvar backup agora", icon: "download", desc: "Há alterações que ainda não estão em nenhum backup", action: saveBackup } : null,
    unsaved ? "-" : null,
    { label: "Novo evento…", icon: "plus", action: () => openWelcome(1) },
    { label: "Meus eventos…", icon: "folder", kbd: n > 1 ? String(n) : "", action: openEventsDlg },
    "-",
    { label: "Salvar backup", icon: "download", kbd: "Ctrl+S", desc: "Um arquivo com tudo, inclusive a planta, para guardar ou abrir em outro computador", action: saveBackup },
    { label: "Abrir backup…", icon: "upload", action: () => $("fileJson").click() },
    "-",
    { label: "Importar convidados…", icon: "sheet", desc: "Excel, LibreOffice, CSV ou colar da planilha", action: openImport },
    { label: "Baixar modelo de planilha", icon: "download", desc: "Excel com as colunas certas e listas suspensas, pronto para preencher e importar", action: () => downloadTemplate("xlsx") },
    "-",
    { label: "Configurar evento…", icon: "gear", action: () => openEventDlg() },
    { label: "Ver um exemplo", icon: "eye", desc: "Abre um evento fictício separado do seu", action: loadDemo },
    "-",
    { label: "Excluir este evento…", icon: "trash", danger: true, action: () => deleteEventFlow(state.id) }
  ];
}
function viewMenuItems() {
  const st = state.settings;
  const tog = (k) => () => { st[k] = !st[k]; commitQuiet(); };
  return [
    { label: "Lista de " + sideShort("a"), checked: !!sidesOpen.a, keep: true, action: () => toggleSide("a") },
    { label: "Lista de " + sideShort("b"), checked: !!sidesOpen.b, keep: true, action: () => toggleSide("b") },
    "-",
    { label: "Cadeiras", checked: !!st.chairs, keep: true, action: tog("chairs") },
    { label: "Áreas do salão", checked: !!st.zones, keep: true, action: tog("zones") },
    bgData ? { label: "Imagem de fundo", checked: !!st.bg, keep: true, action: tog("bg") } : null,
    { label: "Nomes nas mesas", sub: () => [["auto", "Conforme o zoom"], ["always", "Sempre"], ["never", "Nunca"]].map(([k, l]) => ({ label: l, checked: st.names === k, action: () => { st.names = k; commitQuiet(); setLvl(); } })) },
    "-",
    { label: "Crianças " + (state.event.kidA || "da faixa 1") + " ocupam lugar", checked: !!st.kidsASeat, keep: true, desc: "Desligado: ficam no colo e não contam lugar", action: tog("kidsASeat") },
    { label: "Grade de encaixe na planta", checked: !!st.snap, keep: true, action: tog("snap") },
    "-",
    { label: "Ajustar à tela", icon: "fit", kbd: "F", action: () => { setView("salao"); animView(); fitView(); } }
  ];
}
function exportMenuItems() {
  return [
    { header: "Imprimir ou salvar em PDF" },
    { label: "Lista por mesa", icon: "print", desc: "Para o cerimonial e o buffet", action: () => printDoc("mesas") },
    { label: "Encontre sua mesa", icon: "print", desc: "Ordem alfabética, para a entrada do salão", action: () => printDoc("alfa") },
    { label: "Lista de presença", icon: "print", desc: "Para a recepção marcar quem chegou", action: () => printDoc("recepcao") },
    { label: "Placas das mesas", icon: "print", desc: "Número e nomes, duas por folha", action: () => printDoc("placas") },
    { label: "Cartões de lugar", icon: "print", desc: "Um cartão por convite, com o nome e a mesa", action: () => printDoc("cartoes") },
    { label: "Planta do salão", icon: "print", action: () => printDoc("planta") },
    { label: "Resumo para o buffet", icon: "print", action: () => printDoc("resumo") },
    { header: "Planilhas" },
    { label: "Excel completo (.xlsx)", icon: "sheet", desc: "Convidados, por mesa, mesas e resumo — dá para editar e importar de volta", action: exportXlsx },
    { label: "Planilha simples de convidados", icon: "sheet", desc: "CSV — abre no Excel e no Google Planilhas", action: () => exportCsv("convidados") },
    { label: "Planilha simples por mesa", icon: "sheet", desc: "CSV", action: () => exportCsv("mesas") },
    { label: "Modelo de planilha para preencher", icon: "download", desc: "Excel vazio com as colunas certas, para começar ou completar a lista", action: () => downloadTemplate("xlsx") },
    { header: "Compartilhar" },
    { label: "Imagem da planta (PNG)", icon: "image", action: exportPng },
    { label: "Página “Encontre sua mesa”", icon: "file", desc: "Arquivo para publicar na internet ou mandar aos convidados: cada um digita o nome e vê a mesa", action: exportGuestPage },
    { label: "Copiar lista por mesa", icon: "copy", desc: "Texto pronto para colar no WhatsApp", action: copyByTableText },
    "-",
    { label: "Backup completo", icon: "download", kbd: "Ctrl+S", action: saveBackup }
  ];
}
function moreMenuItems() {
  return [
    { label: "Exibir", icon: "eye", sub: viewMenuItems },
    { label: "Exportar e imprimir", icon: "download", sub: exportMenuItems },
    { label: "Configurar evento", icon: "gear", action: () => openEventDlg() },
    { label: "Ajuda e atalhos", icon: "help", action: () => $("helpdlg").showModal() }
  ];
}

/* ── Menu de contexto: decide pelo que está sob o ponteiro ── */
function contextFor(target, x, y) {
  if (!state || document.querySelector("dialog[open]")) return false;
  const card = target.closest(".gcard, .orow, #lBody tr[data-id]");
  if (card) {
    const g = guestById(card.dataset.id);
    if (g) { openMenu(() => guestMenuItems(g), { x, y }); return true; }
  }
  const spot = target.closest(".tspot");
  if (spot) {
    const t = tableById(spot.dataset.id);
    if (!t) return false;
    if (ui.mode === "plan") { ui.openTableId = t.id; ui.openZoneId = null; renderFloor(); renderTablePanel(); renderZonePanel(); }
    openMenu(() => tableMenuItems(t), { x, y });
    return true;
  }
  const z = target.closest(".zone");
  if (z && ui.mode === "plan") {
    const zz = zoneById(z.dataset.zid);
    if (zz) { ui.openZoneId = zz.id; ui.openTableId = null; renderFloor(); renderZonePanel(); renderTablePanel(); openMenu(() => zoneMenuItems(zz), { x, y }); return true; }
  }
  if (target.closest("#viewport") && !target.closest(".fpanel, .abar, .zoomctl, .empty-floor, .edit-hint")) {
    openMenu(() => floorMenuItems(x, y), { x, y });
    return true;
  }
  return false;
}
function runAction(act) {
  if (act.startsWith("add-")) openGuestModal(null, act.slice(4));
  else if (act === "import") openImport();
  else if (act === "event") openEventDlg();
  else if (act === "bg-upload") $("fileBg").click();
  else if (act === "many") openMany();
  else if (act === "print-mesas") printDoc("mesas");
}
function openMany() {
  const n = parseInt(nextTableLabel(), 10);
  $("mStart").value = Number.isFinite(n) ? n : 1;
  $("manydlg").showModal();
  if (finePointer()) { $("mQty").focus(); $("mQty").select(); }
}
$("manyForm").addEventListener("submit", () => {
  const shape = $("mShape").value;
  if (ui.mode !== "plan") setMode("plan");
  addManyTables({ qty: clamp(int0($("mQty").value), 1, 200) || 1, shape, cap: clamp(int0($("mCap").value), 1, 60) || DEFAULT_CAP[shape], start: int0($("mStart").value), cols: clamp(int0($("mCols").value), 1, 30) || 5 });
});
$("mShape").addEventListener("change", () => { $("mCap").value = DEFAULT_CAP[$("mShape").value]; });

/* ── Atalhos ── */
document.addEventListener("keydown", (e) => {
  if (menuKey(e)) return;
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === "s") { e.preventDefault(); if (state) saveBackup(); return; }
  if (!state || document.querySelector("dialog[open]")) return;
  if (mod && k === "k") { e.preventDefault(); focusSearch(); return; }
  if (e.key === "Escape" && typing && e.target.closest(".fpanel, .lbar, .side")) { e.target.blur(); return; }
  if (mod && !typing) {
    if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
    else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); redo(); }
    else if (ui.view === "salao") planKey(e);
    return;
  }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".gcard, .tspot")) { e.preventDefault(); e.target.click(); return; }
  if (e.key === "ContextMenu" && e.target.matches && e.target.matches(".gcard, .tspot, .orow")) { const r = e.target.getBoundingClientRect(); e.preventDefault(); contextFor(e.target, r.left + 20, r.bottom - 4); return; }
  if (typing || e.altKey) return;
  if (e.key === "Escape") {
    if (dragging()) { floorCancel(); return; } // Esc no meio do arrasto: tudo volta ao lugar
    if (ui.drawMask) { setDrawMask(false); return; }
    if (ui.selectedId || ui.openTableId || ui.openZoneId || ui.multi.size) { ui.selectedId = ui.openTableId = ui.openZoneId = null; ui.multi.clear(); renderAll(); }
    else if (ui.mode === "plan") setMode("seat");
    else if (isNarrow() && (sidesOpen.a || sidesOpen.b)) { sidesOpen.a = sidesOpen.b = false; renderSides(); }
    return;
  }
  if (e.key === "/") { e.preventDefault(); focusSearch(); return; }
  if (e.key === "?") { $("helpdlg").showModal(); return; }
  if (k === "n") { e.preventDefault(); openGuestModal(null, ""); return; }
  if (ui.view !== "salao") return;
  if (k === "e") { setMode(ui.mode === "plan" ? "seat" : "plan"); return; }
  if (planKey(e)) return;
  if (k === "f") { animView(); fitView(); return; }
  if (e.key === "+" || e.key === "=") { zoomCenter(1.4); return; }
  if (e.key === "-" || e.key === "_") { zoomCenter(1 / 1.4); return; }
  if (ui.mode !== "plan") return;
});
function focusSearch() {
  if (ui.view === "lista") { $("lq").focus(); $("lq").select(); return; }
  if (ui.view !== "salao") setView("salao");
  if (ui.mode !== "seat") setMode("seat");
  $("q").focus();
  $("q").select();
}

/* ── Ligações dos botões ── */
bindMenuButton($("mFile"), fileMenuItems);
bindMenuButton($("mView"), viewMenuItems);
bindMenuButton($("mExport"), exportMenuItems, "end");
bindMenuButton($("mMore"), moreMenuItems, "end");
bindMenuButton($("btnBg"), bgMenuItems);
$("brand").addEventListener("click", () => openEventDlg());
$("btnEvent").addEventListener("click", () => openEventDlg());
$("btnHelp").addEventListener("click", () => $("helpdlg").showModal());
$("btnUndo").addEventListener("click", undo);
$("btnRedo").addEventListener("click", redo);
$("progress").addEventListener("click", () => setView("resumo"));
$("vTabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (b) setView(b.dataset.v); });
$("modeSeg").addEventListener("click", (e) => { const b = e.target.closest("button[data-m]"); if (b) setMode(b.dataset.m); });
document.querySelectorAll("[data-add]").forEach((b) => b.addEventListener("click", () => addTable(b.dataset.add)));
document.querySelectorAll("[data-addz]").forEach((b) => b.addEventListener("click", () => addZone(b.dataset.addz)));
$("btnMany").addEventListener("click", openMany);
$("btnSnap").addEventListener("click", () => { state.settings.snap = !state.settings.snap; commitQuiet(); toast(state.settings.snap ? "Grade de encaixe ligada" : "Grade de encaixe desligada"); });
$("btnAuto").addEventListener("click", autoDistribute);
$("zIn").addEventListener("click", () => zoomCenter(1.4));
$("zOut").addEventListener("click", () => zoomCenter(1 / 1.4));
$("zFit").addEventListener("click", () => { animView(); fitView(); });
$("editDone").addEventListener("click", () => setMode("seat"));
$("emptyFloor").addEventListener("click", (e) => { const b = e.target.closest("[data-act]"); if (b) runAction(b.dataset.act); });

let wasNarrow = isNarrow(), lastW = window.innerWidth, lastH = window.innerHeight;
window.addEventListener("resize", () => {
  if (!state) return;
  const wChanged = Math.abs(window.innerWidth - lastW) > 40, hBig = Math.abs(window.innerHeight - lastH) > 150 && !/^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "");
  lastW = window.innerWidth; lastH = window.innerHeight;
  if (!wChanged && !hBig) return;
  const n = isNarrow();
  if (n && !wasNarrow) { sidesOpen.a = sidesOpen.b = false; }
  if (!n && wasNarrow) { try { Object.assign(sidesOpen, JSON.parse(localStorage.getItem(SIDE_PREF)) || { a: true, b: true }); } catch (e) { sidesOpen.a = sidesOpen.b = true; } }
  wasNarrow = n;
  if (ui.view === "salao") { renderSides(); updateHints(); fitView(); }
});
setInterval(() => { if (state) renderHeader(); }, 5 * 60 * 1000);

/* ── Botão voltar (celular): fecha o que estiver aberto antes de sair da página ── */
function overlayOpen() { return !!(menuOpen() || (isNarrow() && (sidesOpen.a || sidesOpen.b)) || ui.selectedId || ui.openTableId || ui.openZoneId || (ui.multi && ui.multi.size)); }
function closeTopOverlay() {
  if (menuOpen()) { closeMenu(); return; }
  if (isNarrow() && (sidesOpen.a || sidesOpen.b)) { sidesOpen.a = sidesOpen.b = false; renderSides(); return; }
  if (ui.selectedId) { ui.selectedId = null; renderAll(); return; }
  ui.openTableId = ui.openZoneId = null; if (ui.multi) ui.multi.clear(); renderAll();
}
let backArmed = false;
setInterval(() => {
  if (!isNarrow() || document.querySelector("dialog[open]")) return;
  if (overlayOpen() && !backArmed) { history.pushState({ mdm: 1 }, ""); backArmed = true; }
}, 300);
window.addEventListener("popstate", () => {
  if (!backArmed) return;
  backArmed = false;
  if (overlayOpen()) closeTopOverlay();
});

/* ── Início ── */
(function init() {
  updateHints();
  const evs = listEvents();
  const cur = localStorage.getItem(LS.current);
  let s = (cur && loadEventById(cur)) || (evs[0] && loadEventById(evs[0].id));
  if (s) {
    setState(s);
    afterStateChange();
    const legacy = findLegacy();
    if (legacy) toast("Há uma lista da versão anterior neste navegador", { action: { label: "Importar", fn: importLegacy } });
  } else {
    applyTheme();
    openWelcome(0);
  }
  // funciona sem internet depois da primeira visita (só no site publicado, não em file://)
  if (/^https?:$/.test(location.protocol)) {
    const l = document.createElement("link");
    l.rel = "manifest"; l.href = "manifest.webmanifest";
    document.head.appendChild(l);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  }
})();
