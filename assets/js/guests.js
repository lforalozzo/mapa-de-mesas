"use strict";
/* Convidados: listas laterais (um lado de cada pessoa do casal), seleção,
   sentar/tirar/trocar, distribuição automática, cadastro e menus. */

const SIDE_PREF = "mdm:ui";
const sidesOpen = { a: true, b: true };
(function loadSidePref() {
  try { Object.assign(sidesOpen, JSON.parse(localStorage.getItem(SIDE_PREF)) || {}); } catch (e) { /* ok */ }
  if (isNarrow()) { sidesOpen.a = false; sidesOpen.b = false; }
})();

function buildSide(k) {
  const el = k === "a" ? $("sideA") : $("sideB");
  el.innerHTML =
    '<div class="side-head">' +
      '<div class="side-title"><i class="sdot ' + k + '"></i><h2><span data-role="title"></span><span class="cnt num" data-role="count"></span></h2>' +
        '<button class="btn-add" type="button" data-role="add" aria-label="Adicionar convidado" data-tip="Adicionar convidado" data-kbd="N">' + ic("plus") + "</button>" +
        '<button class="iconbtn" type="button" data-role="hide" aria-label="Esconder esta lista" data-tip="Esconder esta lista">' + ic(k === "a" ? "panel-l" : "panel-r") + "</button>" +
      "</div>" +
      '<div class="seg" data-role="seg">' +
        '<button type="button" data-v="" class="on">Todos</button><button type="button" data-v="sem" data-tip="Quem vai e ainda não tem mesa">Sem mesa</button>' +
        '<button type="button" data-v="pend" data-tip="Presença ainda não confirmada">Pendentes</button><button type="button" data-v="nao">Não vão</button>' +
      "</div>" +
      '<div class="side-filters">' +
        '<select data-role="group" name="grupo-' + k + '" aria-label="Filtrar por grupo"></select>' +
        '<select data-role="sort" name="ordem-' + k + '" aria-label="Ordenar"><option value="">Ordem: lista</option><option value="name">Ordem: A–Z</option><option value="seats">Ordem: maiores</option></select>' +
      "</div>" +
    "</div>" +
    '<div class="glist" data-role="list"></div>';
  const f = ui.side[k];
  el.querySelector('[data-role="seg"]').addEventListener("click", (e) => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    f.seg = b.dataset.v;
    el.querySelectorAll('[data-role="seg"] button').forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
    renderSide(k);
  });
  el.querySelector('[data-role="group"]').addEventListener("change", (e) => { f.group = e.target.value; renderSide(k); });
  el.querySelector('[data-role="sort"]').addEventListener("change", (e) => { f.sort = e.target.value; renderSide(k); });
  el.querySelector('[data-role="add"]').addEventListener("click", () => openGuestModal(null, k));
  el.querySelector('[data-role="hide"]').addEventListener("click", () => toggleSide(k, false));
  const list = el.querySelector('[data-role="list"]');
  list.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]");
    if (act) { runAction(act.dataset.act); return; }
    const card = e.target.closest(".gcard");
    if (!card) return;
    if (e.target.closest(".chip.note")) { openGuestModal(card.dataset.id); return; }
    selectGuest(card.dataset.id);
  });
  list.addEventListener("dblclick", (e) => { const c = e.target.closest(".gcard"); if (c) openGuestModal(c.dataset.id); });
  list.addEventListener("dragstart", (e) => {
    const c = e.target.closest(".gcard");
    if (!c) return;
    e.dataTransfer.setData("text/plain", c.dataset.id);
    e.dataTransfer.effectAllowed = "move";
    hideTip();
  });
  el.addEventListener("dragover", (e) => { if ([...e.dataTransfer.types].includes("text/plain")) e.preventDefault(); });
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    const g = guestById(e.dataTransfer.getData("text/plain"));
    if (g && g.table) unassign(g.id);
  });
}

function sideMembers(k) {
  if (k === "a") return { main: state.guests.filter((g) => g.side === "a" && !isStaff(g)), extra: [["Dos dois", state.guests.filter((g) => g.side === "ab" && !isStaff(g))]] };
  return {
    main: state.guests.filter((g) => g.side === "b" && !isStaff(g)),
    extra: [["Sem lado definido", state.guests.filter((g) => !g.side && !isStaff(g))], ["Equipe do evento", state.guests.filter(isStaff)]]
  };
}
function guestCard(g) {
  const t = g.table && tableById(g.table);
  const chips = [];
  if (t) chips.push('<span class="chip mesa">' + esc(tableName(t)) + "</span>");
  else if (going(g)) chips.push('<span class="chip sem">sem mesa</span>');
  else chips.push('<span class="chip nao">não vai</span>');
  chips.push('<span class="chip">' + esc(groupLabel(g.group)) + "</span>");
  if (totalKids(g)) chips.push('<span class="chip kid">' + plural(totalKids(g), "criança", "crianças") + "</span>");
  if (going(g) && g.invited === false && !isStaff(g) && g.group !== "noivos") chips.push('<span class="chip">convite não enviado</span>');
  if (g.notes) chips.push('<span class="chip note">nota</span>');
  const n = persons(g);
  return '<div class="gcard st-' + g.status + (g.id === ui.selectedId ? " sel" : "") + '" data-id="' + g.id + '" role="button" tabindex="0" aria-pressed="' + (g.id === ui.selectedId) + '" aria-label="' + esc(g.name + ", " + plural(n, "pessoa", "pessoas") + ", " + STATUS[g.status].toLowerCase() + ", " + (t ? tableName(t) : going(g) ? "sem mesa" : "não vai")) + '" draggable="' + (going(g) && finePointer() ? "true" : "false") + '">' +
    '<i class="stdot"></i><div class="gmain"><div class="gname">' + esc(g.name) + '</div><div class="gmeta">' + chips.join("") + "</div></div>" +
    '<div class="gseats"><div class="n">' + n + '</div><div class="d">' + (n === 1 ? "pessoa" : "pessoas") + "</div></div></div>";
}
function renderSide(k) {
  const el = k === "a" ? $("sideA") : $("sideB");
  el.classList.toggle("collapsed", !sidesOpen[k]);
  if (!el.firstChild) buildSide(k);
  const f = ui.side[k];
  el.querySelector('[data-role="title"]').textContent = sideLong(k);
  const gsel = el.querySelector('[data-role="group"]');
  const gopts = '<option value="">Grupos: todos</option>' + state.groups.map((g) => '<option value="' + esc(g.id) + '">' + esc(g.label) + "</option>").join("");
  if (gsel.dataset.sig !== gopts) { gsel.innerHTML = gopts; gsel.dataset.sig = gopts; }
  if (f.group && !groupById(f.group)) f.group = "";
  gsel.value = f.group;
  const w = qWords(ui.q);
  const match = (g) => {
    if (w.length && !textMatch(g.name, w) && !(g.table && textMatch(tableName(tableById(g.table)), w))) return false;
    if (f.group && g.group !== f.group) return false;
    if (f.seg === "sem" && (g.table || !going(g))) return false;
    if (f.seg === "pend" && g.status !== "pend") return false;
    if (f.seg === "nao" && going(g)) return false;
    return true;
  };
  const sorter = (arr) => {
    if (f.sort === "name") return [...arr].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (f.sort === "seats") return [...arr].sort((a, b) => seats(b) - seats(a));
    return arr;
  };
  const { main, extra } = sideMembers(k);
  let html = sorter(main.filter(match)).map(guestCard).join("");
  for (const [title, arr] of extra) {
    const m = sorter(arr.filter(match));
    if (m.length) html += '<div class="gdivider"><span>' + esc(title) + '</span><span class="num">' + m.reduce((n, g) => n + (going(g) ? persons(g) : 0), 0) + "</span></div>" + m.map(guestCard).join("");
  }
  if (!html) {
    html = !state.guests.length
      ? '<div class="glist-empty">Nenhum convidado ainda.<div class="row"><button class="btn primary" type="button" data-act="add-' + k + '">' + ic("plus") + 'Adicionar convidado</button><button class="btn" type="button" data-act="import">' + ic("upload") + "Importar planilha</button></div></div>"
      : '<div class="glist-empty">' + (main.length ? "Ninguém com esse filtro." : "Nenhum convidado de " + esc(sideShort(k)) + " ainda.") + "</div>";
  }
  const list = el.querySelector('[data-role="list"]');
  const sc = list.scrollTop;
  list.innerHTML = html;
  list.scrollTop = sc;
  const goingMain = [...main, ...extra[0][1]].filter(going);
  const people = goingMain.reduce((n, g) => n + persons(g), 0);
  const seated = goingMain.filter((g) => g.table).reduce((n, g) => n + persons(g), 0);
  el.querySelector('[data-role="count"]').textContent = plural(people, "pessoa", "pessoas") + " · " + nf.format(seated) + " sentadas";
}
function renderSides() {
  renderSide("a");
  renderSide("b");
  const narrow = isNarrow();
  $("sideScrim").hidden = !(narrow && (sidesOpen.a || sidesOpen.b));
  document.querySelectorAll("[data-toggle-side]").forEach((b) => {
    const k = b.dataset.toggleSide;
    b.classList.toggle("off", !sidesOpen[k]);
    b.querySelector('[data-role="sname"]').textContent = sideShort(k);
    b.dataset.tip = (sidesOpen[k] ? "Esconder" : "Mostrar") + " a lista de " + sideShort(k);
  });
}
function toggleSide(k, show) {
  sidesOpen[k] = show === undefined ? !sidesOpen[k] : show;
  if (isNarrow() && sidesOpen[k]) sidesOpen[k === "a" ? "b" : "a"] = false;
  if (!isNarrow()) try { localStorage.setItem(SIDE_PREF, JSON.stringify(sidesOpen)); } catch (e) { /* ok */ }
  renderSides();
  requestAnimationFrame(() => { const z = zoom; fitView(); zoom = z; applyView(); });
}
document.querySelectorAll("[data-toggle-side]").forEach((b) => b.addEventListener("click", () => toggleSide(b.dataset.toggleSide)));
$("sideScrim").addEventListener("click", () => { sidesOpen.a = sidesOpen.b = false; renderSides(); });

/* ── Seleção e ações ── */
function selectGuest(id, opts) {
  opts = opts || {};
  ui.selectedId = ui.selectedId === id && !opts.keep ? null : id;
  const g = ui.selectedId && guestById(ui.selectedId);
  if (g && ui.mode === "plan") setMode("seat");
  renderSides(); renderFloor(); renderTablePanel(); renderActionBar();
  if (g && isNarrow()) { sidesOpen.a = sidesOpen.b = false; renderSides(); }
  if (g && g.table && !opts.noFly) centerOn(g.table, Math.max(zoom, 1.5));
}
function assign(gid, tid) {
  const g = guestById(gid), t = tableById(tid);
  if (!g || !t) return;
  if (!going(g)) { toast(g.name + " está marcado como “não vai”", { err: true }); return; }
  if (g.table === tid) { ui.selectedId = null; renderAll(); return; }
  const after = occSeats(tid) + seats(g);
  if (after > t.cap && !assign.confirmed) {
    // estourar a lotação nunca acontece por um toque distraído
    ask(tableName(t) + " vai ficar lotada", "Com " + g.name + " ela fica com " + after + " pessoas para " + t.cap + " lugares. Sentar mesmo assim?", { ok: "Sentar mesmo assim" })
      .then((yes) => { if (yes) { assign.confirmed = true; assign(gid, tid); assign.confirmed = false; } });
    return;
  }
  g.table = tid;
  ui.selectedId = null;
  commit();
  const now = occSeats(tid);
  toast(g.name + " → " + tableName(t) + " (" + now + "/" + t.cap + ")" + (now > t.cap ? " — ficou lotada" : ""), { err: now > t.cap, action: { label: "Desfazer", fn: undo } });
}
function unassign(gid) {
  const g = guestById(gid);
  if (!g || !g.table) return;
  const prev = tableName(tableById(g.table));
  g.table = null;
  if (ui.selectedId === gid) ui.selectedId = null;
  commit();
  toast(g.name + " saiu da " + prev, { action: { label: "Desfazer", fn: undo } });
}
function swapTables(a, b) {
  const ga = occupants(a.id), gb = occupants(b.id);
  if (!ga.length && !gb.length) { renderFloor(); return; }
  ga.forEach((g) => { g.table = b.id; });
  gb.forEach((g) => { g.table = a.id; });
  commit();
  const warn = occSeats(a.id) > a.cap || occSeats(b.id) > b.cap;
  toast((ga.length && gb.length ? "Convidados trocados: " + tableName(a) + " ↔ " + tableName(b) : "Convidados movidos para a " + tableName(ga.length ? b : a)) + (warn ? " — ficou mesa lotada" : ""),
    { err: warn, action: { label: "Desfazer", fn: undo } });
}
function setStatus(g, st) {
  g.status = st;
  if (st === "nao") g.table = null;
  commit();
  toast(g.name + ": " + STATUS[st].toLowerCase());
}
function deleteGuest(g) {
  state.guests = state.guests.filter((x) => x.id !== g.id);
  if (ui.selectedId === g.id) ui.selectedId = null;
  ui.list.picked.delete(g.id);
  commit();
  toast(g.name + " excluído da lista", { action: { label: "Desfazer", fn: undo } });
}
const phoneDigits = (p) => String(p || "").replace(/\D/g, "");
function waLink(p) {
  let d = phoneDigits(p);
  if (d.length >= 10 && d.length <= 11) d = "55" + d;
  return "https://wa.me/" + d;
}
function tablePickItems(g) {
  if (!state.tables.length) return [{ label: "Nenhuma mesa criada ainda", disabled: true }];
  const need = seats(g);
  return sortedTables().map((t) => {
    const free = t.cap - occSeats(t.id) + (g.table === t.id ? need : 0);
    return { label: tableFull(t), checked: g.table === t.id, kbd: free >= need ? plural(free, "livre", "livres") : free > 0 ? "só " + free + " livre" + (free > 1 ? "s" : "") : "cheia", action: () => assign(g.id, t.id) };
  });
}
function guestMenuItems(g) {
  const items = [{ label: "Editar…", icon: "pencil", action: () => openGuestModal(g.id) }];
  if (going(g)) items.push({ label: g.table ? "Mudar de mesa" : "Sentar na mesa", icon: "seat", sub: () => tablePickItems(g) });
  if (g.table) {
    items.push({ label: "Tirar da mesa", icon: "unseat", action: () => unassign(g.id) });
    items.push({ label: "Ver a mesa no salão", icon: "eye", action: () => { setView("salao"); openTable(g.table); centerOn(g.table); } });
  }
  items.push("-");
  items.push({ label: "Situação", icon: "check", kbd: STATUS[g.status], sub: () => Object.entries(STATUS).map(([k, v]) => ({ label: v, checked: g.status === k, action: () => setStatus(g, k) })) });
  items.push({ label: "Convite enviado", checked: !!g.invited, action: () => { g.invited = !g.invited; commit(); } });
  items.push({ label: "Lado", icon: "users", kbd: sideShort(g.side), sub: () => ["a", "b", "ab", ""].map((k) => ({ label: sideShort(k), checked: g.side === k, action: () => { g.side = k; commit(); } })) });
  items.push({ label: "Grupo", icon: "tag", kbd: groupLabel(g.group), sub: () => state.groups.map((gr) => ({ label: gr.label, checked: g.group === gr.id, action: () => { g.group = gr.id; commit(); } })) });
  if (phoneDigits(g.phone).length >= 8) {
    items.push("-");
    items.push({ label: "Conversar no WhatsApp", icon: "chat", desc: g.phone, action: () => window.open(waLink(g.phone), "_blank", "noopener") });
    items.push({ label: "Ligar", icon: "phone", action: () => { location.href = "tel:" + phoneDigits(g.phone); } });
  }
  items.push("-");
  items.push({ label: "Excluir convidado", icon: "trash", danger: true, action: () => deleteGuest(g) });
  return items;
}
function guestTip(g) {
  if (!g) return null;
  const t = g.table && tableById(g.table);
  const rows = [
    ["Lado", sideShort(g.side)],
    ["Grupo", groupLabel(g.group)],
    ["Situação", STATUS[g.status]],
    ["Mesa", t ? tableFull(t) : going(g) ? "sem mesa" : "—"],
    ["Convite", g.invited ? "enviado" : g.invited === false ? "não enviado" : "não informado"]
  ];
  if (g.phone) rows.push(["Telefone", g.phone]);
  return '<div class="tt"><i class="stdot ' + g.status + '" style="width:8px;height:8px;border-radius:9999px;display:inline-block"></i>' + esc(g.name) + "</div>" +
    '<div class="ts">' + esc(personDetail(g)) + " · " + plural(seats(g), "lugar", "lugares") + "</div>" +
    '<div class="tl">' + rows.map(([a, b]) => "<span>" + esc(a) + "</span><span>" + esc(b) + "</span>").join("") + "</div>" +
    (g.notes ? '<div class="tn">' + esc(g.notes) + "</div>" : "") +
    '<div class="th">' + (going(g) ? "Clique e depois clique numa mesa · duplo clique edita · botão direito: mais ações" : "Duplo clique edita · botão direito: mais ações") + "</div>";
}

/* ── Distribuição automática de quem está sem mesa ── */
async function autoDistribute() {
  const pending = state.guests.filter((g) => going(g) && !g.table && !isStaff(g) && seats(g) > 0);
  if (!pending.length) { toast("Todo mundo que vai já tem mesa"); return; }
  if (!state.tables.length) { toast("Crie as mesas primeiro, em Editar planta", { err: true }); return; }
  const need = pending.reduce((n, g) => n + seats(g), 0);
  if (!(await ask("Distribuir quem está sem mesa?", plural(pending.length, "convite", "convites") + " (" + plural(need, "lugar", "lugares") + ") vão para as mesas com espaço, mantendo juntos quem é do mesmo lado e grupo. Quem já está sentado não muda. Dá para desfazer.", { ok: "Distribuir" }))) return;
  pending.sort((a, b) => (a.side + "|" + a.group).localeCompare(b.side + "|" + b.group) || seats(b) - seats(a));
  const free = new Map(state.tables.map((t) => [t.id, t.cap - occSeats(t.id)]));
  let placed = 0;
  for (const g of pending) {
    const need = seats(g);
    let best = null, bestScore = -Infinity;
    for (const t of state.tables) {
      const f = free.get(t.id);
      if (f < need) continue;
      const occ = state.guests.filter((x) => x.table === t.id && going(x));
      let score = occ.length ? 0 : 0.5;
      for (const o of occ) {
        if (o.group === g.group && o.side === g.side) score += 4;
        else if (o.side === g.side) score += 1.5;
        else if (o.side && g.side && o.side !== "ab" && g.side !== "ab") score -= 1;
        if (o.group === g.group) score += 1;
      }
      score -= (f - need) * 0.05;
      if (score > bestScore) { bestScore = score; best = t; }
    }
    if (best) { g.table = best.id; free.set(best.id, free.get(best.id) - need); placed++; }
  }
  commit();
  const left = pending.length - placed;
  toast(plural(placed, "convite distribuído", "convites distribuídos") + (left ? " · " + plural(left, "convite ficou", "convites ficaram") + " sem lugar livre" : ""), { err: !placed, action: placed ? { label: "Desfazer", fn: undo } : null });
}

/* ── Convidado selecionado ── */
function renderActionBar() {
  const bar = $("abar");
  const g = ui.view === "salao" && ui.selectedId ? guestById(ui.selectedId) : null;
  if (!g) { bar.classList.remove("open"); return; }
  bar.classList.add("open");
  $("abDot").className = "adot st-" + g.status;
  $("abName").textContent = g.name;
  $("abSub").textContent = personDetail(g) + (g.phone ? " · " + g.phone : "");
  const t = g.table && tableById(g.table);
  const chips = ['<span class="chip"><i class="sd ' + sideClass(g.side) + '"></i>' + esc(sideShort(g.side)) + "</span>", '<span class="chip">' + esc(groupLabel(g.group)) + "</span>"];
  if (t) chips.push('<span class="chip mesa">' + esc(tableFull(t)) + "</span>");
  else if (going(g)) chips.push('<span class="chip sem">sem mesa</span>');
  chips.push('<span class="chip ' + (g.status === "ok" ? "ok" : g.status === "nao" ? "nao" : "sem") + '">' + STATUS[g.status].toLowerCase() + "</span>");
  if (totalKids(g)) chips.push('<span class="chip kid">' + plural(totalKids(g), "criança", "crianças") + "</span>");
  if (g.notes) chips.push('<span class="chip note">' + esc(g.notes.length > 48 ? g.notes.slice(0, 47) + "…" : g.notes) + "</span>");
  $("abChips").innerHTML = chips.join("");
  $("abHint").hidden = !going(g);
  const verb = finePointer() ? "Clique" : "Toque";
  $("abHint").textContent = t ? verb + " noutra mesa para mudar " + shortName(g.name) + " de lugar" : verb + " numa mesa do salão para sentar" + (finePointer() ? " — ou arraste o card até ela" : "");
  $("abUnseat").hidden = !g.table;
}
$("abClose").addEventListener("click", () => { ui.selectedId = null; renderAll(); });
$("abEdit").addEventListener("click", () => openGuestModal(ui.selectedId));
$("abUnseat").addEventListener("click", () => unassign(ui.selectedId));
$("abMore").addEventListener("click", (e) => { const g = guestById(ui.selectedId); if (g) openMenu(() => guestMenuItems(g), null, { anchor: e.currentTarget, align: "end" }); });
$("abChips").addEventListener("click", (e) => { if (e.target.closest(".chip.note")) openGuestModal(ui.selectedId); });

/* ── Busca do salão ── */
$("q").addEventListener("input", (e) => { ui.q = e.target.value; renderSides(); renderFloor(); });
$("q").addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.target.value = ""; ui.q = ""; renderSides(); renderFloor(); e.target.blur(); return; }
  if (e.key !== "Enter") return;
  const q = norm(ui.q);
  if (!q) return;
  const tq = q.replace(/^mesa\s+/, "");
  const t = state.tables.find((x) => norm(x.label) === tq || norm(tableName(x)) === q) || state.tables.find((x) => q.length >= 2 && x.alias && textMatch(x.alias, q));
  const found = state.guests.filter((x) => textMatch(x.name, q));
  if (found.length > 1) {
    openMenu(found.slice(0, 30).map((g) => ({
      label: g.name, kbd: g.table ? tableName(tableById(g.table)) : going(g) ? "sem mesa" : "não vai",
      action: () => showGuest(g)
    })), null, { anchor: $("q").closest(".search"), keyboard: true });
  } else if (found.length === 1) showGuest(found[0]);
  else if (t) { openTable(t.id); centerOn(t.id); }
  else toast("Nada encontrado para “" + ui.q + "”", { err: true });
});
/* mostra onde a pessoa está sentada (só consulta — não seleciona para mover) */
function showGuest(g) {
  if (!going(g)) { toast(g.name + " está marcado como “não vai”"); return; }
  if (!g.table) { toast(g.name + " ainda está sem mesa"); return; }
  ui.flashId = g.id;
  openTable(g.table);
  centerOn(g.table);
  setTimeout(() => { ui.flashId = null; }, 4000);
}

/* ── Cadastro de convidado ── */
let editingId = null;
function openGuestModal(id, side) {
  editingId = id || null;
  const g = id ? guestById(id) : null;
  $("gTitle").textContent = g ? "Editar convidado" : "Novo convidado";
  $("gDelete").hidden = !g;
  $("fNome").value = g ? g.name : "";
  $("fAd").value = g ? g.adults : 1;
  $("fKA").value = g ? g.kidsA : 0;
  $("fKB").value = g ? g.kidsB : 0;
  $("fKALbl").textContent = kidLabel("a");
  $("fKBLbl").textContent = kidLabel("b");
  $("fLado").innerHTML = ["a", "b", "ab", ""].map((k) => '<option value="' + k + '">' + esc(sideShort(k)) + "</option>").join("");
  $("fLado").value = g ? g.side : side === "a" || side === "b" ? side : "";
  $("fGrupo").innerHTML = state.groups.map((x) => '<option value="' + esc(x.id) + '">' + esc(x.label) + "</option>").join("");
  $("fGrupo").value = g ? g.group : (groupById("amigos") ? "amigos" : state.groups[0].id);
  $("fSit").value = g ? g.status : "pend";
  $("fMesa").innerHTML = '<option value="">— sem mesa —</option>' + sortedTables().map((t) => {
    const free = t.cap - occSeats(t.id);
    return '<option value="' + t.id + '">' + esc(tableFull(t)) + " (" + (free > 0 ? plural(free, "livre", "livres") : "cheia") + ")</option>";
  }).join("");
  $("fMesa").value = g && g.table ? g.table : "";
  $("fInv").checked = g ? !!g.invited : false;
  $("gSaveNext").hidden = !!g;
  $("gdlg").dataset.side = side || "";
  $("fTel").value = g ? g.phone : "";
  $("fNotes").value = g ? g.notes : "";
  $("gdlg").showModal();
  setTimeout(() => $("fNome").focus(), 10);
}
$("gform").addEventListener("submit", (e) => {
  const name = $("fNome").value.trim();
  if (!name) { e.preventDefault(); $("fNome").focus(); return; }
  let g = editingId ? guestById(editingId) : null;
  const isNew = !g;
  if (!g) { g = newGuest(); state.guests.push(g); }
  g.name = name;
  g.adults = int0($("fAd").value);
  g.kidsA = int0($("fKA").value);
  g.kidsB = int0($("fKB").value);
  g.side = $("fLado").value;
  g.group = $("fGrupo").value;
  g.status = $("fSit").value;
  g.invited = $("fInv").checked;
  g.phone = $("fTel").value.trim();
  g.notes = $("fNotes").value.trim();
  g.table = g.status === "nao" ? null : $("fMesa").value || null;
  ui.selectedId = null;
  commit();
  toast(isNew ? "Convidado adicionado: " + name : "Alterações salvas");
  if (isNew && e.submitter && e.submitter.value === "next") {
    const grp = g.group, sd = g.side;
    setTimeout(() => { openGuestModal(null, $("gdlg").dataset.side); $("fGrupo").value = grp; $("fLado").value = sd; }, 0);
  }
});
$("gDelete").addEventListener("click", () => {
  const g = guestById(editingId);
  $("gdlg").close();
  if (g) deleteGuest(g);
});
