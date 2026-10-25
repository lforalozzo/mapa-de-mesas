"use strict";
/* Cabeçalho, troca de visualização, planilha de convidados, resumo com contagem
   regressiva, configuração do evento, meus eventos e boas-vindas. */

/* ── Cabeçalho ── */
function peopleStats() {
  const real = state.guests.filter((g) => !isStaff(g));
  const go = real.filter(going);
  const total = go.reduce((n, g) => n + persons(g), 0);
  const seated = go.filter((g) => g.table).reduce((n, g) => n + persons(g), 0);
  return { real, go, total, seated };
}
function renderHeader() {
  const named = state.event.hostA || state.event.hostB || state.event.title;
  $("brandTitle").textContent = named ? displayTitle() : "Mapa de Mesas";
  const parts = [];
  const dl = dateLong();
  if (dl) parts.push(esc(dl));
  if (state.event.venue) parts.push(esc(state.event.venue));
  const c = countdown();
  // a contagem fica num bloco que não encolhe: no celular ela continua visível
  $("brandSub").innerHTML = parts.length || c
    ? '<span class="bs-rest"><span class="bs-long">' + parts.join(" · ") + '</span><span class="bs-short">' + (eventDate() ? esc(new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(eventDate())) : "") + "</span></span>" + (c ? '<b class="bs-cd">' + esc(c) + "</b>" : "")
    : '<span class="bs-rest">Clique para definir nomes, data e local</span>';
  const { total, seated } = peopleStats();
  $("pgText").innerHTML = "<b class=\"num\">" + nf.format(seated) + "</b> de " + plural(total, "pessoa sentada", "pessoas sentadas");
  const pct = total ? Math.round((seated / total) * 100) : 0;
  $("pgPct").textContent = pct + "%";
  $("pgFill").style.width = pct + "%";
  const unsaved = state.guests.length > 0 && (!state.meta.exportedAt || state.meta.exportedAt < state.meta.updatedAt);
  $("unsavedDot").hidden = !unsaved;
  $("mFile").dataset.tip = unsaved ? "Há alterações sem backup — Arquivo › Salvar backup (Ctrl+S)" : "Novo evento, backup, importar convidados";
  $("btnUndo").disabled = !undoStack.length;
  $("btnRedo").disabled = !redoStack.length;
  document.querySelectorAll('[data-role="sname-a"]').forEach((e) => { e.textContent = sideShort("a"); });
  document.querySelectorAll('[data-role="sname-b"]').forEach((e) => { e.textContent = sideShort("b"); });
}

/* ── Primeiros passos (some quando tudo foi feito ou quando a pessoa fecha) ── */
function renderSteps() {
  const box = $("steps");
  if (!state || ui.view !== "salao" || state.meta.onboarded || state.meta.demo) { box.hidden = true; return; }
  const real = state.guests.filter((g) => !isStaff(g));
  const steps = [
    { done: state.tables.length > 0, t: "Monte o salão", d: "Envie a planta do local ou crie as mesas", act: [["Criar mesas", "many"], ["Enviar planta", "bg-upload"]] },
    { done: real.length > 0, t: "Adicione os convidados", d: "Um convite por linha: pessoa, casal ou família", act: [["Adicionar", "add-a"], ["Importar planilha", "import"]] },
    { done: real.some((g) => g.table), t: "Sente os convidados", d: (finePointer() ? "Clique" : "Toque") + " num convidado da lista e depois numa mesa", act: [] },
    { done: !!state.meta.didExport, t: "Imprima ou exporte", d: "Lista por mesa para o cerimonial e o buffet", act: [["Lista por mesa", "print-mesas"]] }
  ];
  const n = steps.filter((s) => s.done).length;
  if (n === steps.length) { state.meta.onboarded = true; persist(state); box.hidden = true; toast("Primeiros passos concluídos — bom planejamento!"); return; }
  const next = steps.findIndex((s) => !s.done);
  box.hidden = false;
  box.classList.toggle("min", !!ui.stepsMin);
  box.innerHTML = '<div class="steps-head"><b>Primeiros passos</b><span class="num">' + n + " de " + steps.length + "</span>" +
    '<button class="iconbtn" type="button" data-steps="min" aria-label="' + (ui.stepsMin ? "Mostrar" : "Recolher") + '">' + ic(ui.stepsMin ? "chev-right" : "chev-down") + "</button>" +
    '<button class="iconbtn" type="button" data-steps="close" aria-label="Fechar primeiros passos">' + ic("x") + "</button></div>" +
    (ui.stepsMin ? "" : '<ol class="steps-list">' + steps.map((s, i) =>
      '<li class="' + (s.done ? "done" : i === next ? "next" : "") + '"><i class="sk">' + (s.done ? ic("check") : i + 1) + '</i><div><b>' + esc(s.t) + "</b>" +
      (i === next ? '<span>' + esc(s.d) + "</span>" + (s.act.length ? '<div class="sa">' + s.act.map(([l, a], j) => '<button class="btn sm' + (j ? "" : " primary") + '" type="button" data-act="' + a + '">' + esc(l) + "</button>").join("") + "</div>" : "") : "") +
      "</div></li>").join("") + "</ol>");
}
$("steps").addEventListener("click", (e) => {
  const b = e.target.closest("[data-steps]");
  if (b && b.dataset.steps === "close") { state.meta.onboarded = true; persist(state); renderSteps(); toast("A ajuda continua no botão ? do topo"); return; }
  if (b) { ui.stepsMin = !ui.stepsMin; renderSteps(); return; }
  const a = e.target.closest("[data-act]");
  if (a) runAction(a.dataset.act);
});
function renderAll() {
  if (!state) return;
  renderHeader();
  renderSteps();
  if (ui.view === "salao") {
    renderSides();
    renderFloor();
    renderTablePanel();
    renderZonePanel();
    renderActionBar();
  } else if (ui.view === "lista") renderList();
  else if (ui.view === "resumo") renderResumo();
}

function setView(v) {
  ui.view = v;
  $("vSalao").hidden = v !== "salao";
  $("vLista").hidden = v !== "lista";
  $("vResumo").hidden = v !== "resumo";
  renderSteps();
  document.querySelectorAll("#vTabs button").forEach((b) => { b.classList.toggle("on", b.dataset.v === v); b.setAttribute("aria-pressed", b.dataset.v === v); });
  closeMenu();
  renderAll();
  if (v === "salao") requestAnimationFrame(fitView);
}

/* ── Planilha de convidados ── */
const L_COLS = [
  ["ck", ""], ["name", "Nome"], ["side", "Lado"], ["group", "Grupo"], ["adults", "Adultos"], ["kidsA", "kidA"], ["kidsB", "kidB"],
  ["seats", "Pessoas"], ["status", "Situação"], ["table", "Mesa"], ["invited", "Convite"], ["phone", "Telefone"], ["diet", "Restrição"], ["notes", "Notas"], ["act", ""]
];
const COL_LABEL = { name: "Nome", side: "Lado", group: "Grupo", adults: "Adultos", kidsA: "Crianças faixa 1", kidsB: "Crianças faixa 2", status: "Situação", table: "Mesa", invited: "Convite enviado", phone: "Telefone", diet: "Restrição alimentar", notes: "Notas" };
function listMatches() {
  const f = ui.list, q = norm(f.q);
  return state.guests.filter((g) => {
    if (q && !textMatch(g.name, q) && !phoneDigits(g.phone).includes(q.replace(/\D/g, "") || "§") && !textMatch(g.notes, q)) return false;
    if (f.side && (f.side === "-" ? g.side : g.side !== f.side)) return false;
    if (f.group && g.group !== f.group) return false;
    switch (f.status) {
      case "ok": case "pend": case "nao": if (g.status !== f.status) return false; break;
      case "sem": if (g.table || !going(g) || isStaff(g)) return false; break;
      case "noinv": if (g.invited !== false || !going(g) || isStaff(g)) return false; break;
    }
    return true;
  });
}
function listSortVal(g, col) {
  switch (col) {
    case "name": return norm(g.name);
    case "side": return sideShort(g.side);
    case "group": return groupLabel(g.group);
    case "adults": return g.adults;
    case "kidsA": return g.kidsA;
    case "kidsB": return g.kidsB;
    case "seats": return persons(g);
    case "status": return g.status;
    case "table": { const t = g.table && tableById(g.table); const n = t ? parseInt(t.label, 10) : NaN; return t ? (Number.isFinite(n) ? n : 9999) : 99999; }
    case "invited": return g.invited ? 1 : 0;
    case "phone": return g.phone;
    case "diet": return g.diet;
    case "notes": return g.notes;
  }
  return 0;
}
function renderList() {
  const f = ui.list;
  const sideOpts = '<option value="">Todos os lados</option>' + ["a", "b", "ab"].map((k) => '<option value="' + k + '">' + esc(sideShort(k)) + "</option>").join("") + '<option value="-">Sem lado</option>';
  if ($("lfSide").dataset.sig !== sideOpts) { $("lfSide").innerHTML = sideOpts; $("lfSide").dataset.sig = sideOpts; }
  $("lfSide").value = f.side;
  const grpOpts = '<option value="">Todos os grupos</option>' + state.groups.map((g) => '<option value="' + esc(g.id) + '">' + esc(g.label) + "</option>").join("");
  if ($("lfGroup").dataset.sig !== grpOpts) { $("lfGroup").innerHTML = grpOpts; $("lfGroup").dataset.sig = grpOpts; }
  $("lfGroup").value = f.group;
  $("lfStatus").value = f.status;
  let list = listMatches();
  if (f.sort.col) {
    list = [...list].sort((a, b) => {
      const va = listSortVal(a, f.sort.col), vb = listSortVal(b, f.sort.col);
      const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
      return r * f.sort.dir;
    });
  }
  for (const id of [...f.picked]) if (!guestById(id)) f.picked.delete(id);
  const allPicked = list.length > 0 && list.every((g) => f.picked.has(g.id));
  $("lHead").innerHTML = "<tr>" + L_COLS.map(([c, lbl]) => {
    if (c === "ck") return '<th class="ck"><input type="checkbox" id="lAll" aria-label="Selecionar todos"' + (allPicked ? " checked" : "") + "></th>";
    if (c === "act") return "<th></th>";
    const label = c === "kidsA" ? state.event.kidA || "Crianças 1" : c === "kidsB" ? state.event.kidB || "Crianças 2" : lbl;
    return '<th data-col="' + c + '" tabindex="0" aria-sort="' + (f.sort.col === c ? (f.sort.dir > 0 ? "ascending" : "descending") : "none") + '">' + esc(label) + (f.sort.col === c ? '<span class="sort" aria-hidden="true">' + (f.sort.dir > 0 ? "▲" : "▼") + "</span>" : "") + "</th>";
  }).join("") + "</tr>";
  const opt = (v, sel, l) => '<option value="' + esc(v) + '"' + (sel === v ? " selected" : "") + ">" + esc(l) + "</option>";
  const tables = sortedTables();
  const tableOpts = (g) => '<option value="">—</option>' + tables.map((t) => {
    const free = t.cap - occSeats(t.id);
    return opt(t.id, g.table || "", tableName(t) + (g.table === t.id ? "" : free > 0 ? " (" + free + " livres)" : " (cheia)"));
  }).join("");
  const sideSel = ["a", "b", "ab", ""].map((k) => [k, sideShort(k)]);
  const rows = list.map((g) => {
    const id = g.id, nm = (fld) => ' name="c-' + id + "-" + fld + '" data-id="' + id + '" data-f="' + fld + '" aria-label="' + esc((COL_LABEL[fld] || fld) + " — " + g.name) + '"';
    return '<tr class="' + (going(g) ? "" : "nao") + (f.picked.has(id) ? " picked" : "") + '" data-id="' + id + '">' +
      '<td class="ck"><input type="checkbox" data-pick="' + id + '" aria-label="Selecionar ' + esc(g.name) + '"' + (f.picked.has(id) ? " checked" : "") + "></td>" +
      '<td style="min-width:230px"><input type="text"' + nm("name") + ' value="' + esc(g.name) + '"></td>' +
      '<td style="min-width:130px"><div class="sidecell"><i class="sd ' + sideClass(g.side) + '" style="width:8px;height:8px;border-radius:9999px;flex-shrink:0"></i><select' + nm("side") + ">" + sideSel.map(([k, l]) => opt(k, g.side, l)).join("") + "</select></div></td>" +
      '<td style="min-width:130px"><select' + nm("group") + ">" + state.groups.map((x) => opt(x.id, g.group, x.label)).join("") + "</select></td>" +
      '<td><input class="numcell" type="number" min="0" max="30"' + nm("adults") + ' value="' + g.adults + '"></td>' +
      '<td><input class="numcell" type="number" min="0" max="20"' + nm("kidsA") + ' value="' + g.kidsA + '"></td>' +
      '<td><input class="numcell" type="number" min="0" max="20"' + nm("kidsB") + ' value="' + g.kidsB + '"></td>' +
      '<td class="ro">' + persons(g) + "</td>" +
      '<td style="min-width:140px"><div class="stcell"><i class="stdot ' + g.status + '"></i><select' + nm("status") + ">" + Object.entries(STATUS).map(([k, v]) => opt(k, g.status, v)).join("") + "</select></div></td>" +
      '<td style="min-width:150px"><select' + nm("table") + (going(g) ? "" : " disabled") + ">" + tableOpts(g) + "</select></td>" +
      '<td class="ck"><input type="checkbox"' + nm("invited") + (g.invited ? " checked" : "") + ' aria-label="Convite enviado"></td>' +
      '<td style="min-width:140px"><input type="tel"' + nm("phone") + ' value="' + esc(g.phone) + '"></td>' +
      '<td style="min-width:150px"><input type="text" list="dietList"' + nm("diet") + ' value="' + esc(g.diet) + '"></td>' +
      '<td style="min-width:220px"><input type="text"' + nm("notes") + ' value="' + esc(g.notes) + '"></td>' +
      '<td class="act"><button class="iconbtn" type="button" data-rowmenu="' + id + '" aria-label="Mais ações">' + ic("more") + "</button></td></tr>";
  }).join("");
  const wrap = $("lWrap"), sc = wrap.scrollTop;
  $("lBody").innerHTML = rows || '<tr><td colspan="' + L_COLS.length + '" class="lempty">' +
    (state.guests.length ? "Nenhum convidado com esses filtros." : 'Nenhum convidado ainda. Use <b>Importar planilha</b> ou <b>Novo convidado</b>.') + "</td></tr>";
  wrap.scrollTop = sc;
  const people = list.filter((g) => going(g) && !isStaff(g)).reduce((n, g) => n + persons(g), 0);
  $("lCount").textContent = plural(list.length, "convite", "convites") + " · " + plural(people, "pessoa vai", "pessoas vão");
  $("bulkbar").hidden = !f.picked.size;
  $("bulkN").textContent = plural(f.picked.size, "selecionado", "selecionados");
}
$("lq").addEventListener("input", (e) => { ui.list.q = e.target.value; renderList(); });
$("lfSide").addEventListener("change", (e) => { ui.list.side = e.target.value; renderList(); });
$("lfGroup").addEventListener("change", (e) => { ui.list.group = e.target.value; renderList(); });
$("lfStatus").addEventListener("change", (e) => { ui.list.status = e.target.value; renderList(); });
$("lAdd").addEventListener("click", () => openGuestModal(null, ""));
$("lImport").addEventListener("click", () => openImport());
$("lTemplate").addEventListener("click", () => downloadTemplate("xlsx"));
$("lHead").addEventListener("keydown", (e) => {
  const th = e.target.closest("th[data-col]");
  if (th && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); th.click(); }
});
$("lHead").addEventListener("click", (e) => {
  if (e.target.id === "lAll") {
    const list = listMatches();
    if (e.target.checked) list.forEach((g) => ui.list.picked.add(g.id)); else list.forEach((g) => ui.list.picked.delete(g.id));
    renderList();
    return;
  }
  const th = e.target.closest("th[data-col]");
  if (!th) return;
  const s = ui.list.sort;
  if (s.col === th.dataset.col) { if (s.dir === 1) s.dir = -1; else { s.col = null; s.dir = 1; } }
  else { s.col = th.dataset.col; s.dir = 1; }
  renderList();
});
$("lBody").addEventListener("change", (e) => {
  const el = e.target;
  if (el.dataset.pick) {
    if (el.checked) ui.list.picked.add(el.dataset.pick); else ui.list.picked.delete(el.dataset.pick);
    renderList();
    return;
  }
  const g = guestById(el.dataset.id);
  if (!g || !el.dataset.f) return;
  switch (el.dataset.f) {
    case "name": { const v = el.value.trim(); if (v) g.name = v; else el.value = g.name; break; }
    case "side": g.side = el.value; break;
    case "group": g.group = el.value; break;
    case "adults": case "kidsA": case "kidsB": g[el.dataset.f] = int0(el.value); break;
    case "status": g.status = el.value; if (g.status === "nao") g.table = null; break;
    case "table": g.table = el.value || null; break;
    case "invited": g.invited = el.checked; break;
    case "phone": g.phone = el.value.trim(); break;
    case "diet": g.diet = el.value.trim(); break;
    case "notes": g.notes = el.value.trim(); break;
  }
  commit();
});
$("lBody").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rowmenu]");
  if (b) { const g = guestById(b.dataset.rowmenu); if (g) openMenu(() => guestMenuItems(g), null, { anchor: b, align: "end" }); }
});
/* ações em lote */
function bulkApply(fn, msg) {
  const gs = [...ui.list.picked].map(guestById).filter(Boolean);
  gs.forEach(fn);
  commit();
  toast(plural(gs.length, "convidado", "convidados") + ": " + msg, { action: { label: "Desfazer", fn: undo } });
}
$("bulkbar").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-bulk]");
  if (!b) return;
  const k = b.dataset.bulk;
  const at = { anchor: b };
  if (k === "clear") { ui.list.picked.clear(); renderList(); return; }
  if (k === "status") openMenu(Object.entries(STATUS).map(([s, l]) => ({ label: l, action: () => bulkApply((g) => { g.status = s; if (s === "nao") g.table = null; }, l.toLowerCase()) })), null, at);
  if (k === "side") openMenu(["a", "b", "ab", ""].map((s) => ({ label: sideShort(s), action: () => bulkApply((g) => { g.side = s; }, sideShort(s)) })), null, at);
  if (k === "group") openMenu(state.groups.map((gr) => ({ label: gr.label, action: () => bulkApply((g) => { g.group = gr.id; }, gr.label) })), null, at);
  if (k === "invited") openMenu([{ label: "Marcar convite enviado", action: () => bulkApply((g) => { g.invited = true; }, "convite enviado") }, { label: "Marcar convite não enviado", action: () => bulkApply((g) => { g.invited = false; }, "convite não enviado") }], null, at);
  if (k === "table") openMenu(() => [{ label: "Tirar da mesa", icon: "unseat", action: () => bulkApply((g) => { g.table = null; }, "sem mesa") }, "-"].concat(sortedTables().map((t) => ({
    label: tableFull(t), kbd: (t.cap - occSeats(t.id)) + " livres",
    action: () => bulkApply((g) => { if (going(g)) g.table = t.id; }, tableName(t))
  }))), null, at);
  if (k === "delete") {
    const n = ui.list.picked.size;
    if (!(await ask("Excluir " + plural(n, "convidado", "convidados") + "?", "Se a pessoa só não vai ao evento, prefira mudar a situação para “Não vai”. Dá para desfazer.", { ok: "Excluir", danger: true }))) return;
    state.guests = state.guests.filter((g) => !ui.list.picked.has(g.id));
    ui.list.picked.clear();
    commit();
    toast(plural(n, "convidado excluído", "convidados excluídos"), { action: { label: "Desfazer", fn: undo } });
  }
});

/* ── Resumo ── */
let cdTimer = null;
/* contagem regressiva: dias (mesma regra do cabeçalho) e, com horário definido, horas e minutos */
function milestone(d) {
  if (d === 365) return "Falta um ano!";
  if (d === 180) return "Faltam seis meses!";
  if (d === 100) return "Faltam 100 dias!";
  if (d === 30) return "Falta um mês!";
  if (d > 7 && d <= 14) return "Faltam duas semanas";
  if (d >= 2 && d <= 7) return "Última semana!";
  if (d === 1) return "É amanhã!";
  return "";
}
function countdownHtml() {
  const d = daysLeft();
  if (d === null) return '<div class="cd-empty"><p>Defina a data do evento para ver a contagem regressiva.</p><button class="btn primary" type="button" data-act="event">' + ic("calendar") + "Definir data</button></div>";
  const ev = eventDate(), now = new Date();
  if (ev.toDateString() === now.toDateString()) return '<div class="cd-done">É hoje! Felicidades!</div>';
  if (d < 0 || ev < now) { const p = Math.max(1, -d); return '<div class="cd-done">' + (p < 2 ? "O grande dia foi ontem." : "O grande dia foi há " + nf.format(p) + " dias.") + " Felicidades!</div>"; }
  const cell = (v, l) => '<div class="cd-cell"><b class="num">' + nf.format(v) + "</b><span>" + l + "</span></div>";
  let cells = cell(d, d === 1 ? "dia" : "dias");
  if (state.event.time) {
    const ms = ev - now;
    const h = Math.floor((ms / 3600000) % 24), m = Math.floor((ms / 60000) % 60);
    cells += cell(h, h === 1 ? "hora" : "horas") + cell(m, m === 1 ? "minuto" : "minutos");
  }
  const ms = milestone(d);
  return '<div class="cd-wrap"><div class="cd">' + cells + "</div>" + (ms ? '<div class="cd-ms">' + esc(ms) + "</div>" : "") + "</div>";
}
function renderResumo() {
  clearInterval(cdTimer);
  const ps = peopleStats();
  const go = ps.go;
  const sum = (arr, f) => arr.reduce((n, g) => n + f(g), 0);
  const staff = state.guests.filter((g) => isStaff(g) && going(g));
  const byStatus = (s) => ps.real.filter((g) => g.status === s);
  const okP = sum(byStatus("ok"), persons), pendP = sum(byStatus("pend"), persons), naoG = byStatus("nao").length;
  const invitedG = ps.real.filter((g) => g.invited).length;
  const invKnown = ps.real.filter((g) => g.invited !== null).length;
  const adults = sum(go, (g) => g.adults), kA = sum(go, (g) => g.kidsA), kB = sum(go, (g) => g.kidsB);
  const staffP = sum(staff, (g) => g.adults + g.kidsA + g.kidsB);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const rrow = (l, v, x, cls) => '<div class="rrow' + (cls ? " " + cls : "") + '"><span class="rl">' + l + '</span><span class="rv">' + v + "</span>" + '<span class="rx">' + (x === undefined ? "" : x) + "</span>" + "</div>";
  const cap = sum(state.tables, (t) => t.cap);
  const occT = state.tables.map((t) => ({ t, n: occSeats(t.id) }));
  const over = occT.filter((o) => o.n > o.t.cap), freeT = occT.filter((o) => o.n < o.t.cap);
  const semMesa = go.filter((g) => !g.table);
  const notInv = go.filter((g) => g.invited === false && g.group !== "noivos");
  const withNotes = state.guests.filter((g) => g.notes);

  const sideRow = (k, label) => {
    const arr = go.filter((g) => (k === "-" ? !g.side : g.side === k));
    if (!arr.length && (k === "ab" || k === "-")) return "";
    const p = sum(arr, persons), s = sum(arr.filter((g) => g.table), persons);
    return rrow('<i class="sdot ' + (k === "-" ? "n sd" : k === "ab" ? "sd ab" : k) + '" style="' + (k === "-" ? "background:var(--side-n)" : "") + '"></i>' + esc(label), nf.format(p), s + " sentadas");
  };
  const bar = (parts) => '<div class="rbar">' + parts.map(([v, c]) => '<i style="width:' + v + "%;background:" + c + '"></i>').join("") + "</div>";
  const todo = [];
  if (semMesa.length) todo.push(["sem", plural(semMesa.length, "convite sem mesa", "convites sem mesa") + " (" + plural(sum(semMesa, persons), "pessoa", "pessoas") + ")"]);
  if (over.length) todo.push(["over", plural(over.length, "mesa lotada", "mesas lotadas")]);
  if (byStatus("pend").length) todo.push(["pend", plural(byStatus("pend").length, "confirmação pendente", "confirmações pendentes")]);
  if (notInv.length) todo.push(["noinv", plural(notInv.length, "convite não enviado", "convites não enviados")]);
  if (withNotes.length) todo.push(["notes", plural(withNotes.length, "convidado com anotação", "convidados com anotação")]);

  $("rWrap").innerHTML = '<div class="rgrid">' +
    '<div class="rcard span2 hero"><div class="hero-l"><div class="hero-t">' + esc(displayTitle()) + '</div><div class="hero-s">' + esc(eventSubtitle(false) || "Data e local ainda não definidos") + "</div></div>" +
      '<div class="hero-r" id="cdBox">' + countdownHtml() + "</div></div>" +
    '<div class="rcard"><h3>' + ic("users") + 'Convidados<button class="btn sm" type="button" data-go-list="">Ver lista</button></h3>' +
      '<div class="rbig"><b>' + nf.format(ps.total) + "</b><span>" + (ps.total === 1 ? "pessoa vai" : "pessoas vão") + " · " + plural(ps.real.length, "convite", "convites") + "</span></div>" +
      bar([[pct(okP, okP + pendP), "var(--ok)"], [pct(pendP, okP + pendP), "var(--warn)"]]) +
      '<div class="rrows">' + rrow('<i class="stdot ok"></i>Confirmadas', nf.format(okP), pct(okP, okP + pendP) + "%") +
        rrow('<i class="stdot pend"></i>Pendentes', nf.format(pendP), pct(pendP, okP + pendP) + "%") +
        rrow('<i class="stdot nao"></i>Não vão', nf.format(sum(byStatus("nao"), persons)), plural(naoG, "convite", "convites")) +
        (invKnown ? rrow("Convites enviados", invitedG + " de " + invKnown, pct(invitedG, invKnown) + "%") : "") + "</div>" +
      (state.settings.kidsASeat ? "" : '<span class="hint">Pessoas, contando bebês no colo. Nas mesas contam ' + plural(sum(go, seats), "lugar", "lugares") + ".</span>") + "</div>" +
    '<div class="rcard"><h3>' + ic("print") + 'Para o buffet<button class="btn sm" type="button" data-print="resumo">Imprimir</button></h3>' +
      '<div class="rrows">' + rrow("Adultos", nf.format(adults)) +
        rrow("Crianças " + esc(state.event.kidA || "faixa 1"), nf.format(kA), state.settings.kidsASeat ? "" : "no colo") +
        rrow("Crianças " + esc(state.event.kidB || "faixa 2"), nf.format(kB)) +
        rrow("Total de convidados", nf.format(adults + kA + kB), undefined, "total") +
        rrow("Equipe do evento", nf.format(staffP)) + "</div>" +
      (dietCounts().length ? '<div class="fsub">Restrições alimentares</div><div class="rrows">' + dietCounts().map(([k, n]) => rrow(esc(k), nf.format(n), n === 1 ? "pessoa" : "pessoas")).join("") + "</div>" : "") +
      '<span class="hint">Pessoas que vão (confirmadas e pendentes), sem a equipe. Ainda pendentes: ' + plural(pendP, "pessoa", "pessoas") + ".</span></div>" +
    '<div class="rcard"><h3>' + ic("swap") + "Por lado</h3><div class=\"rrows\">" +
      sideRow("a", sideShort("a")) + sideRow("b", sideShort("b")) + sideRow("ab", "Dos dois") + sideRow("-", "Sem lado") + "</div></div>" +
    '<div class="rcard"><h3>' + ic("tag") + "Por grupo</h3><div class=\"rrows\">" +
      state.groups.map((gr) => { const arr = state.guests.filter((g) => g.group === gr.id && going(g)); return arr.length ? rrow(esc(gr.label), nf.format(sum(arr, persons)), plural(arr.length, "convite", "convites")) : ""; }).join("") +
      "</div></div>" +
    '<div class="rcard"><h3>' + ic("round") + "Mesas</h3>" +
      '<div class="rbig"><b>' + nf.format(state.tables.length) + "</b><span>" + (state.tables.length === 1 ? "mesa" : "mesas") + " · " + plural(cap, "lugar", "lugares") + "</span></div>" +
      bar([[pct(sum(occT, (o) => Math.min(o.n, o.t.cap)), cap), "var(--accent)"]]) +
      '<div class="rrows">' + rrow("Lugares ocupados", nf.format(sum(occT, (o) => Math.min(o.n, o.t.cap))), pct(sum(occT, (o) => Math.min(o.n, o.t.cap)), cap) + "%") +
        rrow("Lugares livres", nf.format(sum(freeT, (o) => o.t.cap - o.n))) +
        rrow("Mesas completas", nf.format(occT.filter((o) => o.n === o.t.cap).length)) + "</div>" +
      (freeT.length ? '<div class="fsub">Com lugar livre</div><div class="rlist">' + freeT.sort((a, b) => (b.t.cap - b.n) - (a.t.cap - a.n)).slice(0, 30).map((o) =>
        '<button type="button" data-open-table="' + o.t.id + '"><span class="rl">' + esc(tableFull(o.t)) + '</span><span class="rx">' + plural(o.t.cap - o.n, "livre", "livres") + "</span></button>").join("") + "</div>" : "") +
    "</div>" +
    '<div class="rcard"><h3>' + ic("check") + "Pendências</h3>" +
      (todo.length ? '<div class="rlist">' + todo.map(([k, l]) => '<button type="button" data-todo="' + k + '"><i class="stdot ' + (k === "over" ? "nao" : "pend") + '"></i><span class="rl">' + esc(l) + "</span>" + ic("chev-right", "chev") + "</button>").join("") + "</div>"
        : '<p class="rempty">Tudo certo por aqui: todo mundo confirmado, convidado e com mesa.</p>') +
    "</div>" +
    "</div>";
  if (eventDate()) cdTimer = setInterval(() => { const b = $("cdBox"); if (b && ui.view === "resumo") b.innerHTML = countdownHtml(); else clearInterval(cdTimer); }, 20000);
}
$("rWrap").addEventListener("click", (e) => {
  const t = e.target.closest("[data-open-table]");
  if (t) { setView("salao"); openTable(t.dataset.openTable); centerOn(t.dataset.openTable); return; }
  const p = e.target.closest("[data-print]");
  if (p) { printDoc(p.dataset.print); return; }
  const a = e.target.closest("[data-act]");
  if (a) { runAction(a.dataset.act); return; }
  const gl = e.target.closest("[data-go-list]");
  if (gl) { Object.assign(ui.list, { q: "", side: "", group: "", status: gl.dataset.goList }); $("lq").value = ""; setView("lista"); return; }
  const td = e.target.closest("[data-todo]");
  if (!td) return;
  const k = td.dataset.todo;
  if (k === "over") { const o = state.tables.find((x) => occSeats(x.id) > x.cap); setView("salao"); if (o) { openTable(o.id); centerOn(o.id); } return; }
  if (k === "notes") { Object.assign(ui.list, { q: "", status: "", side: "", group: "" }); ui.list.sort = { col: "notes", dir: -1 }; setView("lista"); return; }
  Object.assign(ui.list, { q: "", side: "", group: "", status: k }); $("lq").value = "";
  setView("lista");
});

/* ── Configurar evento ── */
function swatchesHtml(list, current, key) {
  const known = list.some(([c]) => c.toLowerCase() === String(current).toLowerCase());
  return list.map(([c, n]) => '<button type="button" class="swatch' + (c.toLowerCase() === String(current).toLowerCase() ? " on" : "") + '" style="background:' + c + '" data-sw="' + key + '" data-c="' + c + '" aria-label="' + esc(n) + '" data-tip="' + esc(n) + '"></button>').join("") +
    '<label class="swatch-custom' + (known ? "" : " on") + '" data-tip="Outra cor"' + (known ? "" : ' style="background:' + esc(current) + ';border-style:solid"') + ">" + (known ? ic("plus") : "") +
    '<input type="color" data-swc="' + key + '" value="' + esc(current) + '" aria-label="Escolher outra cor"></label>';
}
function renderEventDlg() {
  const e = state.event, th = state.theme;
  const setv = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v || ""; };
  setv("eA", e.hostA); setv("eB", e.hostB); setv("eTitle", e.title); setv("eDate", e.date); setv("eTime", e.time);
  setv("eVenue", e.venue); setv("eCity", e.city); setv("eKA", e.kidA); setv("eKB", e.kidB);
  $("eTitle").placeholder = "automático: " + (e.hostA && e.hostB ? e.hostA + " & " + e.hostB : "nomes do casal");
  $("swAccent").innerHTML = swatchesHtml(ACCENTS, th.accent, "accent");
  $("swA").innerHTML = swatchesHtml(SIDE_COLORS, th.colorA, "colorA");
  $("swB").innerHTML = swatchesHtml(SIDE_COLORS, th.colorB, "colorB");
  $("lblColorA").textContent = "Cor de " + sideShort("a");
  $("lblColorB").textContent = "Cor de " + sideShort("b");
  const sample = e.hostA && e.hostB ? e.hostA + " & " + e.hostB : "Ana & Pedro";
  $("fontPick").innerHTML = TITLE_FONTS.map((f) => '<button type="button" data-font="' + f.id + '" class="' + (th.titleFont === f.id ? "on" : "") + '"><span class="fp-sample" style="font-family:' + fontFamilyFor(f.id) + '">' + esc(sample) + '</span><span class="fp-name">' + esc(f.name) + "</span></button>").join("");
  const counts = {};
  state.guests.forEach((g) => { counts[g.group] = (counts[g.group] || 0) + 1; });
  $("groupList").innerHTML = state.groups.map((g) =>
    '<div class="grow" data-gid="' + esc(g.id) + '"><input type="text" value="' + esc(g.label) + '" data-gl aria-label="Nome do grupo">' +
    '<label class="chk" data-tip="Equipe não entra na contagem de convidados"><input type="checkbox" data-gs' + (g.staff ? " checked" : "") + "> Equipe</label>" +
    '<span class="gcount">' + plural(counts[g.id] || 0, "convidado", "convidados") + "</span>" +
    '<button class="iconbtn danger" type="button" data-gdel aria-label="Excluir grupo"' + (state.groups.length < 2 ? " disabled" : "") + ">" + ic("trash") + "</button></div>").join("");
}
function fontFamilyFor(id) {
  return { cormorant: "'Cormorant Garamond Var', Georgia, serif", playfair: "'Playfair Display Var', Georgia, serif", script: "'Great Vibes', cursive", sans: "var(--font)" }[id];
}
function openEventDlg(tab, notice) {
  renderEventDlg();
  setEvTab(tab || "dados");
  $("evNotice").hidden = !notice;
  if (notice) $("evNotice").textContent = notice;
  $("evdlg").showModal();
}
function setEvTab(t) {
  document.querySelectorAll("#evTabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
  document.querySelectorAll("#evBody [data-tab]").forEach((s) => { s.hidden = s.dataset.tab !== t; });
}
$("evTabs").addEventListener("click", (e) => { const b = e.target.closest("button[data-t]"); if (b) setEvTab(b.dataset.t); });
const EV_FIELDS = { eA: "hostA", eB: "hostB", eTitle: "title", eDate: "date", eTime: "time", eVenue: "venue", eCity: "city", eKA: "kidA", eKB: "kidB" };
for (const [id, key] of Object.entries(EV_FIELDS)) {
  $(id).addEventListener("input", () => { state.event[key] = $(id).value.trim(); renderHeader(); applyTheme(); });
  $(id).addEventListener("change", () => { state.event[key] = $(id).value.trim(); delete state.meta.copy; commit(); renderEventDlg(); });
}
$("evdlg").addEventListener("click", (e) => {
  const sw = e.target.closest("[data-sw]");
  if (sw) { state.theme[sw.dataset.sw] = sw.dataset.c; applyTheme(); commit(); renderEventDlg(); return; }
  const fb = e.target.closest("[data-font]");
  if (fb) { state.theme.titleFont = fb.dataset.font; applyTheme(); commit(); renderEventDlg(); return; }
  const del = e.target.closest("[data-gdel]");
  if (del) { deleteGroup(del.closest(".grow").dataset.gid); }
});
$("evdlg").addEventListener("input", (e) => {
  if (e.target.dataset.swc) { state.theme[e.target.dataset.swc] = e.target.value; applyTheme(); }
});
$("evdlg").addEventListener("change", (e) => {
  if (e.target.dataset.swc) { state.theme[e.target.dataset.swc] = e.target.value; applyTheme(); commit(); renderEventDlg(); return; }
  const row = e.target.closest(".grow");
  if (!row) return;
  const g = groupById(row.dataset.gid);
  if (!g) return;
  if (e.target.matches("[data-gl]")) { const v = e.target.value.trim(); if (v) g.label = v; else e.target.value = g.label; }
  if (e.target.matches("[data-gs]")) g.staff = e.target.checked;
  commit();
});
$("groupAdd").addEventListener("click", () => {
  let id = slug("grupo"), n = 2;
  while (groupById(id)) id = "grupo-" + n++;
  state.groups.push({ id, label: "Novo grupo" });
  commit();
  renderEventDlg();
  const inp = $("groupList").querySelector('[data-gid="' + id + '"] input[data-gl]');
  if (inp) { inp.focus(); inp.select(); }
});
async function deleteGroup(id) {
  const g = groupById(id);
  if (!g || state.groups.length < 2) return;
  const used = state.guests.filter((x) => x.group === id);
  const fallback = state.groups.find((x) => x.id !== id && !x.staff) || state.groups.find((x) => x.id !== id);
  if (used.length && !(await ask("Excluir o grupo “" + g.label + "”?", plural(used.length, "convidado vai", "convidados vão") + " para o grupo “" + fallback.label + "”.", { ok: "Excluir grupo", danger: true }))) return;
  used.forEach((x) => { x.group = fallback.id; });
  state.groups = state.groups.filter((x) => x.id !== id);
  commit();
  renderEventDlg();
}

/* ── Meus eventos (vários eventos no mesmo navegador) ── */
function renderEventsDlg() {
  const evs = listEvents();
  const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
  $("evList").innerHTML = evs.map((e) => {
    const d = e.date ? new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" }).format(new Date(e.date + "T12:00:00")) : "sem data";
    return '<div class="evrow' + (state && e.id === state.id ? " cur" : "") + '" data-ev="' + esc(e.id) + '"><div class="evmain"><div class="evt">' + esc(e.title) + (e.demo ? ' <span class="chip">exemplo</span>' : "") + '</div><div class="evs">' + esc(d) + " · " + plural(e.guests || 0, "convite", "convites") + " · alterado " + esc(fmt.format(new Date(e.updatedAt))) + "</div></div>" +
      '<button class="iconbtn" type="button" data-evmenu aria-label="Ações do evento">' + ic("more") + "</button></div>";
  }).join("") || '<p class="hint">Nenhum evento salvo.</p>';
}
function openEventsDlg() { renderEventsDlg(); $("evsdlg").showModal(); }
function switchEvent(id) {
  const s = loadEventById(id);
  if (!s) { toast("Evento não encontrado", { err: true }); return; }
  setState(s);
  afterStateChange();
  toast("Aberto: " + displayTitle());
}
function afterStateChange() {
  ui.selectedId = ui.openTableId = ui.openZoneId = null;
  ui.list.picked.clear();
  Object.assign(ui.list, { q: "", side: "", group: "", status: "", sort: { col: null, dir: 1 } });
  $("lq").value = "";
  for (const k of ["a", "b"]) Object.assign(ui.side[k], { seg: "", group: "", sort: "" });
  document.querySelectorAll('.side [data-role="seg"] button').forEach((b) => b.classList.toggle("on", b.dataset.v === ""));
  document.querySelectorAll('.side [data-role="sort"]').forEach((s) => { s.value = ""; });
  ui.q = ""; $("q").value = "";
  applyTheme();
  renderAll();
  loadBgForCurrent(true).then(() => requestAnimationFrame(fitView));
}
$("evList").addEventListener("click", (e) => {
  const row = e.target.closest(".evrow");
  if (!row) return;
  const id = row.dataset.ev;
  if (e.target.closest("[data-evmenu]")) {
    openMenu([
      { label: "Abrir", icon: "folder", action: () => { $("evsdlg").close(); switchEvent(id); } },
      { label: "Duplicar", icon: "copy", desc: "Cópia completa, com os convidados", action: () => duplicateEvent(id) },
      { label: "Duplicar só o salão", icon: "copy", desc: "Mesmo local e mesas, sem convidados — para outro casal", action: () => duplicateEvent(id, true) },
      "-",
      { label: "Excluir deste navegador", icon: "trash", danger: true, action: () => deleteEventFlow(id) }
    ], null, { anchor: e.target.closest("[data-evmenu]"), align: "end" });
    return;
  }
  $("evsdlg").close();
  if (!state || id !== state.id) switchEvent(id);
});
async function duplicateEvent(id, floorOnly) {
  const s = loadEventById(id);
  if (!s) return;
  const bg = await idbGet(bgKey(s));
  s.id = uid("e");
  delete s.meta.demo;
  if (floorOnly) {
    s.guests = [];
    s.tables.forEach((t) => { t.alias = ""; t.notes = ""; });
    s.event = Object.assign(blankState().event, { venue: s.event.venue, city: s.event.city, kidA: s.event.kidA, kidB: s.event.kidB, title: "Novo evento em " + (s.event.venue || "salão copiado") });
  } else s.event.title = displayTitle(s) + " (cópia)";
  s.meta = Object.assign(s.meta, { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), exportedAt: null });
  if (bg && s.floor.bg) { s.floor.bg.key = "bg:" + s.id + ":" + Date.now().toString(36); await idbPut(s.floor.bg.key, bg); }
  persist(s);
  if (state) persist(state);
  renderEventsDlg();
  toast(floorOnly ? "Salão copiado para um evento novo — abra-o na lista" : "Cópia criada");
}
async function deleteEventFlow(id) {
  const e = listEvents().find((x) => x.id === id);
  if (!e) return;
  if (!(await ask("Excluir “" + e.title + "” deste navegador?", "Não dá para desfazer. Se quiser guardar, salve um backup antes.", { ok: "Excluir evento", danger: true }))) return;
  removeEvent(id);
  if (state && id === state.id) {
    const rest = listEvents();
    if (rest.length) switchEvent(rest[0].id);
    else { state = null; $("evsdlg").close(); openWelcome(0); return; }
  }
  renderEventsDlg();
  if (!$("evsdlg").open) openEventsDlg();
}
$("evsNew").addEventListener("click", () => { $("evsdlg").close(); openWelcome(1); });
$("evsOpen").addEventListener("click", () => { $("evsdlg").close(); $("fileJson").click(); });

/* ── Boas-vindas / novo evento em 3 passos ── */
let wStep = 0;
function openWelcome(step) {
  const d = $("welcome");
  const legacy = findLegacy();
  $("wMigrate").hidden = !legacy;
  if (legacy) $("wMigrate").innerHTML = "<span>Encontramos uma lista de mesas da versão anterior desta ferramenta neste navegador (" + plural(legacy.data.guests.length, "convidado", "convidados") + ').</span><button class="btn" type="button" data-w-act="legacy">Importar</button>';
  $("wSw").innerHTML = swatchesHtml(ACCENTS, (state && state.theme.accent) || ACCENTS[0][0], "w");
  ["wA", "wB", "wDate", "wTime", "wVenue", "wCity"].forEach((id) => { $(id).value = ""; });
  delete $("wSw").dataset.c;
  wStep = step || 0;
  showWStep();
  if (!d.open) d.showModal();
}
function showWStep() {
  document.querySelectorAll("#wSteps section").forEach((s) => { s.hidden = +s.dataset.w !== wStep; });
  $("wFoot").hidden = wStep === 0;
  $("wNext").textContent = wStep === 3 ? "Criar evento" : "Continuar";
  if (wStep === 1 && finePointer()) setTimeout(() => $("wA").focus(), 20);
}
$("welcome").addEventListener("cancel", (e) => { if (!state) e.preventDefault(); });
$("welcome").addEventListener("click", (e) => {
  const sw = e.target.closest("[data-sw]");
  if (sw) { $("wSw").querySelectorAll(".swatch").forEach((x) => x.classList.toggle("on", x === sw)); $("wSw").dataset.c = sw.dataset.c; setAccentVars(sw.dataset.c); return; }
  const a = e.target.closest("[data-w-act]");
  if (!a) return;
  const act = a.dataset.wAct;
  if (act === "new") { wStep = 1; showWStep(); }
  if (act === "open") $("fileJson").click();
  if (act === "demo") { $("welcome").close(); loadDemo(); }
  if (act === "legacy") importLegacy();
});
$("wSw").addEventListener("input", (e) => { if (e.target.dataset.swc) { $("wSw").dataset.c = e.target.value; setAccentVars(e.target.value); } });
$("welcome").addEventListener("close", () => applyTheme());
/* digitar a quantidade de mesas marca a opção "Criar mesas em grade" */
["wQty", "wCap"].forEach((id) => ["focus", "input"].forEach((ev) => $(id).addEventListener(ev, () => { const r = document.querySelector('input[name="wPlan"][value="grid"]'); if (r) r.checked = true; })));
$("wBack").addEventListener("click", () => { wStep = Math.max(0, wStep - 1); showWStep(); });
$("wNext").addEventListener("click", () => {
  if (wStep < 3) { wStep++; showWStep(); return; }
  const s = blankState();
  s.event.hostA = $("wA").value.trim();
  s.event.hostB = $("wB").value.trim();
  s.event.date = $("wDate").value;
  s.event.venue = $("wVenue").value.trim();
  s.event.time = $("wTime").value;
  s.event.city = $("wCity").value.trim();
  if ($("wSw").dataset.c) s.theme.accent = $("wSw").dataset.c;
  const plan = (document.querySelector('input[name="wPlan"]:checked') || {}).value;
  const guests = (document.querySelector('input[name="wGuests"]:checked') || {}).value;
  if (state) persist(state);
  setState(s, { fresh: true });
  $("welcome").close();
  if (ui.view !== "salao") setView("salao");
  afterStateChange();
  if (plan === "grid") {
    setMode("plan");
    requestAnimationFrame(() => addManyTables({ qty: clamp(int0($("wQty").value), 1, 200) || 15, shape: "round", cap: clamp(int0($("wCap").value), 1, 40) || 10, start: 1, cols: Math.ceil(Math.sqrt(clamp(int0($("wQty").value), 1, 200) * 1.5)) }));
  }
  if (plan === "bg") { setMode("plan"); $("fileBg").click(); }
  if (guests === "import") openImport();
  else if (guests === "template") { downloadTemplate("xlsx"); setTimeout(() => toast("Modelo baixado — quando preencher, use Arquivo › Importar convidados"), plan === "grid" ? 4500 : 0); }
  else if (plan !== "grid") toast("Evento criado — siga os primeiros passos no canto do salão");
});
function importLegacy() {
  const legacy = findLegacy();
  if (!legacy) return;
  const s = migrateLegacy(legacy.data);
  if (state) persist(state);
  setState(s, { fresh: true });
  try { localStorage.setItem(LS.legacyDone, "1"); } catch (e) { /* ok */ }
  $("welcome").close();
  afterStateChange();
  openEventDlg("dados", "Importamos os dados da versão anterior: " + plural(s.guests.length, "convidado", "convidados") + " e " + plural(s.tables.length, "mesa", "mesas") + ". Confira os nomes do casal — eles aparecem nas listas e nas impressões.");
}

/* ── Exemplo fictício ── */
/* planta desenhada do salão de exemplo (paredes, palco, bar, colunas) — mostra o recurso de fundo */
const DEMO_PLAN = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1300 860\" width=\"1300\" height=\"860\" font-family=\"Arial, Helvetica, sans-serif\"><rect width=\"1300\" height=\"860\" fill=\"#ffffff\"/><path d=\"M600 820 H40 V40 H1260 V560 M1260 660 V820 H700\" fill=\"none\" stroke=\"#3f3f46\" stroke-width=\"12\" stroke-linecap=\"square\"/><g stroke=\"#3f3f46\" stroke-width=\"2\" fill=\"#fff\"><rect x=\"34\" y=\"170\" width=\"12\" height=\"90\"/><rect x=\"34\" y=\"380\" width=\"12\" height=\"90\"/><rect x=\"34\" y=\"590\" width=\"12\" height=\"90\"/><rect x=\"170\" y=\"34\" width=\"120\" height=\"12\"/><rect x=\"1010\" y=\"34\" width=\"120\" height=\"12\"/></g><g fill=\"none\" stroke=\"#71717a\" stroke-width=\"1.5\" stroke-dasharray=\"6 4\"><path d=\"M600 820 A100 100 0 0 1 700 820\"/><path d=\"M1260 560 A100 100 0 0 0 1160 660\"/></g><rect x=\"470\" y=\"46\" width=\"360\" height=\"78\" fill=\"#f4f4f5\" stroke=\"#52525b\" stroke-width=\"2\"/><path d=\"M600 124 v12 h100 v-12 M612 136 v10 h76 v-10\" fill=\"none\" stroke=\"#52525b\" stroke-width=\"1.5\"/><path d=\"M46 690 H210 V814\" fill=\"none\" stroke=\"#52525b\" stroke-width=\"16\"/><g fill=\"#3f3f46\"><rect x=\"441\" y=\"291\" width=\"18\" height=\"18\"/><rect x=\"841\" y=\"291\" width=\"18\" height=\"18\"/><rect x=\"441\" y=\"551\" width=\"18\" height=\"18\"/><rect x=\"841\" y=\"551\" width=\"18\" height=\"18\"/></g><g fill=\"#71717a\" font-size=\"17\"><text x=\"650\" y=\"92\" text-anchor=\"middle\">Palco</text><text x=\"120\" y=\"770\" text-anchor=\"middle\">Bar</text><text x=\"1240\" y=\"545\" text-anchor=\"end\">Cozinha</text><text x=\"650\" y=\"848\" text-anchor=\"middle\">Entrada</text></g><g stroke=\"#71717a\" stroke-width=\"2\"><path d=\"M1080 846 h100 M1080 840 v12 M1180 840 v12\"/></g><text x=\"1130\" y=\"838\" fill=\"#71717a\" font-size=\"13\" text-anchor=\"middle\">5 m</text></svg>";
async function loadDemo() {
  const old = listEvents().find((e) => e.demo);
  if (old) {
    if (state && state.id === old.id) { toast("Você já está no exemplo"); return; }
    switchEvent(old.id);
    toast("Exemplo aberto — para recomeçá-lo, exclua-o em Arquivo › Meus eventos", { action: { label: "Meus eventos", fn: openEventsDlg } });
    return;
  }
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const first = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Felipe", "Gabriela", "Henrique", "Isabela", "João", "Karina", "Lucas", "Mariana", "Nicolas", "Olívia", "Paulo", "Rafaela", "Sérgio", "Tatiana", "Vinícius", "Júlia", "Marcos", "Letícia", "Rodrigo", "Camila", "André", "Beatriz", "Fernando", "Larissa", "Gustavo"];
  const last = ["Almeida", "Barbosa", "Costa", "Dias", "Ferreira", "Gomes", "Lima", "Martins", "Nunes", "Oliveira", "Pereira", "Ribeiro", "Santos", "Souza", "Teixeira", "Vieira", "Moreira", "Rocha", "Carvalho", "Melo"];
  const s = blankState();
  const d = new Date(); d.setDate(d.getDate() + 96);
  Object.assign(s.event, { hostA: "Ana", hostB: "Pedro", date: d.toISOString().slice(0, 10), time: "19:30", venue: "Salão Jardim (exemplo)", city: "Porto Alegre" });
  s.theme.accent = "#0f766e";
  const bgKeyDemo = "bg:" + s.id + ":demo";
  s.floor = { w: 1300, h: 860, bg: { key: bgKeyDemo, name: "planta-exemplo.svg", w: 1300, h: 860, opacity: 0.9 } };
  s.zones = [
    { id: "z1", label: "Pista de dança", shape: "rect", x: 38, y: 38, w: 24, h: 26 },
    { id: "z3", label: "Doces", shape: "ellipse", x: 84, y: 80, w: 12, h: 13 }
  ];
  const tables = [{ id: "fam", label: "Família", shape: "oval", cap: 10, x: 50, y: 21, scale: 1.1, rot: 0, alias: "Noivos e pais" }];
  const cols = [10, 20, 30, 70, 80, 90];
  let n = 1;
  for (const y of [32, 52, 72]) for (const x of cols) tables.push({ id: "t" + n, label: String(n), shape: "round", cap: 10, x, y, scale: 1, rot: 0, alias: "" }), n++;
  tables.push({ id: "t" + n, label: String(n), shape: "rect", cap: 12, x: 33, y: 80, scale: 1, rot: 0, alias: "Amigos da faculdade" }); n++;
  tables.push({ id: "t" + n, label: String(n), shape: "rect", cap: 12, x: 67, y: 80, scale: 1, rot: 0, alias: "" });
  s.tables = tables.map((t) => Object.assign({ notes: "" }, t));
  const guests = [newGuest({ name: "Ana e Pedro (noivos)", adults: 2, side: "ab", group: "noivos", status: "ok", invited: true, table: "fam" })];
  guests.push(newGuest({ name: "Marta e Jorge Lima", adults: 2, side: "a", group: "familia", status: "ok", invited: true, table: "fam", notes: "Pais da Ana" }));
  guests.push(newGuest({ name: "Cláudia e Roberto Souza", adults: 2, side: "b", group: "familia", status: "ok", invited: true, table: "fam", notes: "Pais do Pedro" }));
  const groupsBy = ["familia", "familia", "amigos", "amigos", "amigos", "padrinhos", "trabalho"];
  for (let i = 0; i < 72; i++) {
    const side = i % 2 ? "b" : "a";
    const couple = rnd() < 0.55;
    const f1 = pick(first);
    let f2 = pick(first);
    while (f2 === f1) f2 = pick(first);
    const name = couple ? f1 + " e " + f2 + " " + pick(last) : f1 + " " + pick(last);
    const kidsB = couple && rnd() < 0.18 ? 1 : 0, kidsA = couple && rnd() < 0.15 ? 1 : 0;
    const r = rnd();
    const dr = rnd();
    guests.push(newGuest({
      name, adults: couple ? 2 : 1, kidsA, kidsB, side, group: pick(groupsBy), diet: dr < 0.06 ? "Vegetariano" : dr < 0.09 ? "Sem glúten" : dr < 0.11 ? "Alergia a frutos do mar" : "",
      status: r < 0.62 ? "ok" : r < 0.92 ? "pend" : "nao", invited: rnd() < 0.85,
      phone: rnd() < 0.7 ? "(51) 9" + String(8000 + Math.floor(rnd() * 1999)) + "-" + String(1000 + Math.floor(rnd() * 8999)) : ""
    }));
  }
  guests.push(newGuest({ name: "Fotógrafo — Estúdio Luz", adults: 2, group: "staff", status: "ok", invited: true }));
  guests.push(newGuest({ name: "Banda Aurora", adults: 5, group: "staff", status: "ok", invited: true, notes: "Jantar às 21h" }));
  s.guests = guests;
  await idbPut(bgKeyDemo, { data: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(DEMO_PLAN), w: 1300, h: 860, name: "planta-exemplo.svg" });
  setState(s, { fresh: false });
  // senta ~70% com a mesma lógica do “Distribuir”
  const pend = state.guests.filter((g) => going(g) && !g.table && !isStaff(g)).slice(0, 52);
  const free = new Map(state.tables.map((t) => [t.id, t.cap - occSeats(t.id)]));
  for (const g of pend) {
    const t = state.tables.filter((x) => free.get(x.id) >= seats(g)).sort((a, b) => {
      const sc = (x) => state.guests.filter((o) => o.table === x.id && o.side === g.side).length - state.guests.filter((o) => o.table === x.id && o.side && o.side !== g.side).length * 2;
      return sc(b) - sc(a);
    })[0];
    if (t) { g.table = t.id; free.set(t.id, free.get(t.id) - seats(g)); }
  }
  state.meta.exportedAt = new Date().toISOString();
  state.meta.demo = true;
  persist(state);
  lastSnap = JSON.stringify(state);
  if (ui.view !== "salao") setView("salao");
  afterStateChange();
  toast("Exemplo carregado — explore à vontade; para começar o seu, Arquivo › Novo evento");
}
