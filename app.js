const SUPABASE_URL = "https://covnjmhxeuumpllhducc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sHaJljJjWE3PYXWNHcCEcQ_YO1VC0JC";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
const on = (id, evt, fn) => { const el = $(id); if (el) el.addEventListener(evt, fn); };

let currentEditId = null;
let cache = [];
let closedSet = new Set();

// ===== PWA: registrar SW =====
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try { await navigator.serviceWorker.register("/sw.js"); } catch (_) {}
  });
}

// ===== TOASTS =====
function notify(message, type="info", ms=3200) {
  const host = $("toasts");
  if (!host) return;

  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <div class="toast-dot"></div>
    <div class="toast-msg">${message}</div>
    <button class="toast-x" aria-label="Cerrar">×</button>
  `;

  const remove = () => {
    el.classList.add("toast-hide");
    setTimeout(() => el.remove(), 180);
  };

  el.querySelector(".toast-x")?.addEventListener("click", remove);
  host.appendChild(el);
  setTimeout(remove, ms);
}

async function confirmModal(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "c-overlay";
    overlay.innerHTML = `
      <div class="c-card">
        <div class="c-title">Confirmar</div>
        <div class="c-msg">${message}</div>
        <div class="c-actions">
          <button class="btn ghost" id="cCancel">Cancelar</button>
          <button class="btn primary" id="cOk">Aceptar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const done = (val) => {
      overlay.classList.add("c-hide");
      setTimeout(() => overlay.remove(), 180);
      resolve(val);
    };

    overlay.querySelector("#cCancel")?.addEventListener("click", () => done(false));
    overlay.querySelector("#cOk")?.addEventListener("click", () => done(true));
    overlay.addEventListener("click", (e) => { if (e.target === overlay) done(false); });
  });
}

// ===== LOGIN POR USUARIO =====
const APP_DOMAIN = "controltemu.local";
const cleanUsername = (u) => (u || "").trim().toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9._-]/g, "");
const usernameToEmail = (username) => { const u = cleanUsername(username); return u ? `${u}@${APP_DOMAIN}` : null; };

const money = (n) => Number(n || 0).toLocaleString("es-SV", { style:"currency", currency:"USD" });
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const saldo = (t,a) => num(t) - num(a);
const estadoDe = (s) => (s <= 0 ? "Pagado" : "Pendiente");
const estadoClassOf = (estadoTxt) =>
  estadoTxt === "Pendiente" ? "warn" :
  estadoTxt === "Cerrado"   ? "closed" : "ok";

function showAuthed(isAuthed){
  $("authCard")?.classList.toggle("hidden", isAuthed);
  $("app")?.classList.toggle("hidden", !isAuthed);
  $("btnLogout")?.classList.toggle("hidden", !isAuthed);
  $("btnExportReg")?.classList.toggle("hidden", !isAuthed);
  $("btnExportSum")?.classList.toggle("hidden", !isAuthed);
}

async function getUser(){
  const { data } = await sb.auth.getUser();
  return data.user;
}

async function setProfileUsername(username) {
  const user = await getUser();
  if (!user) return;
  const u = cleanUsername(username);
  if (!u) return;
  await sb.from("profiles").upsert({ id: user.id, username: u });
}

let deferredPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;

  // mostrar botón
  const b = document.getElementById("btnInstall");
  if (b) b.classList.remove("hidden");
});

window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  const b = document.getElementById("btnInstall");
  if (b) b.classList.add("hidden");
});

on("btnInstall", "click", async () => {
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;

  const b = document.getElementById("btnInstall");
  if (b) b.classList.add("hidden");

  // opcional: toast
  if (choice?.outcome === "accepted") {
    if (typeof notify === "function") notify("Instalación iniciada ✅", "success");
  } else {
    if (typeof notify === "function") notify("Instalación cancelada.", "info");
  }
});

// ===== AUTH =====
/*on("btnRegisterUser","click", async () => {
  const username = $("username")?.value;
  const pass = $("password")?.value;
  const email = usernameToEmail(username);

  if (!email || !pass) return notify("Poné usuario y contraseña.", "warn");

  const { error } = await sb.auth.signUp({ email, password: pass });
  if (error) {
    const m = (error.message || "").toLowerCase();
    if (m.includes("already registered")) return notify("Ese usuario ya existe. Dale Entrar ✅", "info");
    return notify("Error: " + error.message, "error");
  }

  await setProfileUsername(username);
  notify("Cuenta creada ✅ Ahora dale Entrar.", "success");
});*/

on("btnLoginUser","click", async () => {
  const username = $("username")?.value;
  const pass = $("password")?.value;
  const email = usernameToEmail(username);

  if (!email || !pass) return notify("Poné usuario y contraseña.", "warn");

  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) return notify("Error: " + error.message, "error");

  showAuthed(true);
  await load();
  notify("Sesión iniciada ✅", "success");
});

on("btnLogout","click", async () => {
  await sb.auth.signOut();

  if ($("username")) $("username").value = "";
  if ($("password")) $("password").value = "";

  clearForm();
  cache = [];
  closedSet = new Set();
  render();
  showAuthed(false);

  notify("Sesión cerrada.", "info");
});

// ===== CRUD =====
function readForm(){
  return {
    pedido_id: $("pedido_id")?.value.trim() || "",
    fecha: $("fecha")?.value || null,
    persona: $("persona")?.value.trim() || "",
    total: num($("total")?.value),
    abonado: num($("abonado")?.value),
    notas: $("notas")?.value.trim() || null
  };
}

function clearForm(){
  currentEditId = null;
  if ($("formTitle")) $("formTitle").textContent = "Agregar registro";
  if ($("pedido_id")) $("pedido_id").value = "";
  if ($("fecha")) $("fecha").value = "";
  if ($("persona")) $("persona").value = "";
  if ($("total")) $("total").value = "";
  if ($("abonado")) $("abonado").value = "";
  if ($("notas")) $("notas").value = "";
}

on("btnClear","click", clearForm);

on("btnSave","click", async () => {
  const user = await getUser();
  if (!user) return notify("Tenés que iniciar sesión.", "warn");

  const r = readForm();
  if (!r.pedido_id || !r.persona) return notify("Falta ID Pedido o Persona.", "warn");
  if (closedSet.has(r.pedido_id)) return notify("Ese pedido está CERRADO.", "warn");

  if (currentEditId){
    const { data: row } = await sb.from("temu_pedidos").select("pedido_id").eq("id", currentEditId).maybeSingle();
    if (row?.pedido_id && closedSet.has(row.pedido_id)) return notify("Pedido CERRADO: no se puede editar.", "warn");

    const { error } = await sb.from("temu_pedidos").update({
      pedido_id: r.pedido_id, fecha: r.fecha, persona: r.persona,
      total: r.total, abonado: r.abonado, notas: r.notas
    }).eq("id", currentEditId);

    if (error) return notify("Error: " + error.message, "error");

    clearForm();
    await load();
    return notify("Registro actualizado ✅", "success");
  }

  const { error } = await sb.from("temu_pedidos").insert([{
    user_id: user.id,
    pedido_id: r.pedido_id,
    fecha: r.fecha,
    persona: r.persona,
    total: r.total,
    abonado: r.abonado,
    notas: r.notas
  }]);

  if (error) return notify("Error guardando: " + error.message, "error");

  if ($("persona")) $("persona").value = "";
  if ($("total")) $("total").value = "";
  if ($("abonado")) $("abonado").value = "";
  if ($("notas")) $("notas").value = "";

  await load();
  notify("Registro guardado ✅", "success");
});

async function removeRow(id){
  const row = cache.find(x => x.id === id);
  if (row?.pedido_id && closedSet.has(row.pedido_id)) return notify("Pedido CERRADO: no se puede borrar.", "warn");

  const ok = await confirmModal("¿Eliminar este registro?");
  if (!ok) return;

  const { error } = await sb.from("temu_pedidos").delete().eq("id", id);
  if (error) return notify("Error: " + error.message, "error");

  await load();
  notify("Registro eliminado.", "info");
}

function openModal(row){
  if (closedSet.has(row.pedido_id)) return notify("Pedido CERRADO: no se puede editar.", "warn");

  currentEditId = row.id;
  $("modal")?.classList.remove("hidden");
  if ($("modalMsg")) $("modalMsg").textContent = "";

  if ($("m_pedido_id")) $("m_pedido_id").value = row.pedido_id ?? "";
  if ($("m_fecha")) $("m_fecha").value = row.fecha ?? "";
  if ($("m_persona")) $("m_persona").value = row.persona ?? "";
  if ($("m_total")) $("m_total").value = row.total ?? 0;
  if ($("m_abonado")) $("m_abonado").value = row.abonado ?? 0;
  if ($("m_notas")) $("m_notas").value = row.notas ?? "";
}

on("btnClose","click", () => $("modal")?.classList.add("hidden"));

on("btnUpdate","click", async () => {
  if (!currentEditId) return;

  const payload = {
    pedido_id: $("m_pedido_id")?.value.trim() || "",
    fecha: $("m_fecha")?.value || null,
    persona: $("m_persona")?.value.trim() || "",
    total: num($("m_total")?.value),
    abonado: num($("m_abonado")?.value),
    notas: $("m_notas")?.value.trim() || null
  };

  if (!payload.pedido_id || !payload.persona) return ($("modalMsg").textContent = "Falta ID o Persona.");
  if (closedSet.has(payload.pedido_id)) return ($("modalMsg").textContent = "Pedido CERRADO: no se puede editar.");

  const { error } = await sb.from("temu_pedidos").update(payload).eq("id", currentEditId);
  if (error) return ($("modalMsg").textContent = error.message);

  $("modal")?.classList.add("hidden");
  currentEditId = null;
  await load();
  notify("Cambios guardados ✅", "success");
});

on("btnDelete","click", async () => {
  if (!currentEditId) return;
  const row = cache.find(x => x.id === currentEditId);
  if (row?.pedido_id && closedSet.has(row.pedido_id)) return notify("Pedido CERRADO: no se puede borrar.", "warn");
  await removeRow(currentEditId);
  $("modal")?.classList.add("hidden");
  currentEditId = null;
});

// ===== CERRAR / REABRIR =====
async function closePedido(pedidoId){
  const user = await getUser();
  if (!user) return;

  const ok = await confirmModal(`¿Cerrar el pedido ${pedidoId}? Ya no podrás editar nada en ese pedido.`);
  if (!ok) return;

  const { error } = await sb.from("temu_pedidos_cerrados").insert([{ user_id: user.id, pedido_id: pedidoId }]);
  if (error) return notify("Error al cerrar: " + error.message, "error");

  await load();
  notify(`Pedido ${pedidoId} cerrado ✅`, "success");
}

async function reopenPedido(pedidoId){
  const user = await getUser();
  if (!user) return;

  const ok = await confirmModal(`¿Reabrir el pedido ${pedidoId}?`);
  if (!ok) return;

  const { error } = await sb.from("temu_pedidos_cerrados").delete().eq("user_id", user.id).eq("pedido_id", pedidoId);
  if (error) return notify("Error al reabrir: " + error.message, "error");

  await load();
  notify(`Pedido ${pedidoId} reabierto ✅`, "success");
}

// ===== FILTROS =====
on("btnRefresh","click", () => { load(); notify("Actualizado ✅", "info", 1200); });
on("q","input", render);
on("estado","change", render);
on("order","change", render);
on("showClosed","change", render);

// ===== EXPORT =====
function toCSV(rows, headers){
  const esc = (s) => `"${String(s ?? "").replaceAll('"','""')}"`;
  const out = [];
  out.push(headers.map(esc).join(","));
  for (const r of rows) out.push(headers.map(h => esc(r[h])).join(","));
  return out.join("\n");
}
function download(filename, text){
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

on("btnExportReg","click", () => {
  const showClosed = $("showClosed")?.checked;
  const rows = cache
    .filter(r => showClosed || !closedSet.has(r.pedido_id))
    .map(r => ({
      pedido_id: r.pedido_id,
      fecha: r.fecha ?? "",
      persona: r.persona,
      total: r.total,
      abonado: r.abonado,
      saldo: saldo(r.total, r.abonado),
      estado: closedSet.has(r.pedido_id) ? "Cerrado" : estadoDe(saldo(r.total, r.abonado)),
      notas: r.notas ?? ""
    }));
  download("temu_registros.csv", toCSV(rows, ["pedido_id","fecha","persona","total","abonado","saldo","estado","notas"]));
  notify("CSV de registros descargado ✅", "success");
});

on("btnExportSum","click", () => {
  const showClosed = $("showClosed")?.checked;
  const { pedidos } = buildSummaries(cache);
  const rows = pedidos
    .filter(p => showClosed || !closedSet.has(p.pedido_id))
    .map(p => ({
      pedido_id: p.pedido_id,
      total: p.total,
      abonado: p.abonado,
      saldo: p.saldo,
      estado: closedSet.has(p.pedido_id) ? "Cerrado" : p.estado
    }));
  download("temu_resumen_pedidos.csv", toCSV(rows, ["pedido_id","total","abonado","saldo","estado"]));
  notify("CSV de resumen descargado ✅", "success");
});

// ===== RENDER =====
function buildSummaries(data){
  const byPedido = new Map();
  const byPersona = new Map();
  let totalAll = 0, abonadoAll = 0;

  for (const r of data){
    const t = num(r.total);
    const a = num(r.abonado);
    totalAll += t;
    abonadoAll += a;

    const pk = r.pedido_id;
    const p = byPedido.get(pk) || { pedido_id: pk, total: 0, abonado: 0 };
    p.total += t; p.abonado += a;
    byPedido.set(pk, p);

    const nk = (r.persona || "").trim();
    const n = byPersona.get(nk) || { persona: nk, total: 0, abonado: 0 };
    n.total += t; n.abonado += a;
    byPersona.set(nk, n);
  }

  const pedidos = [...byPedido.values()]
    .map(p => {
      const s = p.total - p.abonado;
      return { ...p, saldo: s, estado: estadoDe(s) };
    })
    .sort((a,b) => a.pedido_id.localeCompare(b.pedido_id));

  const personas = [...byPersona.values()]
    .map(n => ({ ...n, saldo: n.total - n.abonado }))
    .sort((a,b) => a.persona.localeCompare(b.persona));

  return { totalAll, abonadoAll, saldoAll: totalAll - abonadoAll, pedidos, personas };
}

function applyFilters(data){
  const q = $("q")?.value.trim().toLowerCase() || "";
  const est = $("estado")?.value || "";
  const showClosed = $("showClosed")?.checked;

  let out = data;
  if (!showClosed) out = out.filter(r => !closedSet.has(r.pedido_id));
  if (q) out = out.filter(r => (r.pedido_id||"").toLowerCase().includes(q) || (r.persona||"").toLowerCase().includes(q));
  if (est) out = out.filter(r => estadoDe(saldo(r.total, r.abonado)) === est);

  const ord = $("order")?.value || "created_desc";
  const copy = [...out];
  const by = {
    created_desc: (a,b) => new Date(b.created_at) - new Date(a.created_at),
    created_asc: (a,b) => new Date(a.created_at) - new Date(b.created_at),
    fecha_desc: (a,b) => (b.fecha || "").localeCompare(a.fecha || ""),
    fecha_asc:  (a,b) => (a.fecha || "").localeCompare(b.fecha || ""),
    pedido_asc: (a,b) => (a.pedido_id||"").localeCompare(b.pedido_id||""),
    persona_asc:(a,b) => (a.persona||"").localeCompare(b.persona||""),
  }[ord];
  copy.sort(by);
  return copy;
}

function render(){
  const data = applyFilters(cache);

  const tbody = $("rows");
  if (tbody) tbody.innerHTML = "";
  $("emptyRows")?.classList.toggle("hidden", data.length > 0);

  for (const r of data){
    const s = saldo(r.total, r.abonado);
    const isClosed = closedSet.has(r.pedido_id);
    const est = isClosed ? "Cerrado" : estadoDe(s);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.pedido_id}</td>
      <td>${r.fecha ?? ""}</td>
      <td>${r.persona}</td>
      <td>${money(r.total)}</td>
      <td>${money(r.abonado)}</td>
      <td>${money(s)}</td>
      <td><span class="tag ${estadoClassOf(est)}">${est}</span></td>
      <td>${r.notas ?? ""}</td>
      <td class="ta-right">
        <button class="btn ghost btn-sm" data-edit="${r.id}" ${isClosed ? "disabled" : ""}>Editar</button>
        <button class="btn danger btn-sm" data-del="${r.id}" ${isClosed ? "disabled" : ""}>Borrar</button>
      </td>
    `;

    const btnEdit = tr.querySelector(`[data-edit="${r.id}"]`);
    const btnDel = tr.querySelector(`[data-del="${r.id}"]`);
    if (!isClosed){
      btnEdit?.addEventListener("click", () => openModal(r));
      btnDel?.addEventListener("click", () => removeRow(r.id));
    }
    tbody?.appendChild(tr);
  }

  const showClosed = $("showClosed")?.checked;
  const kpiData = showClosed ? cache : cache.filter(r => !closedSet.has(r.pedido_id));
  const sum = buildSummaries(kpiData);

  $("kpiTotal") && ($("kpiTotal").textContent = money(sum.totalAll));
  $("kpiAbonado") && ($("kpiAbonado").textContent = money(sum.abonadoAll));
  $("kpiSaldo") && ($("kpiSaldo").textContent = money(sum.saldoAll));
  $("kpiPedidos") && ($("kpiPedidos").textContent = String(sum.pedidos.length));

  // === Resumen por pedido (estado pill)
  const sp = $("sumPedidos");
  if (sp) sp.innerHTML = "";

  const pedidosVisibles = sum.pedidos.filter(p => showClosed || !closedSet.has(p.pedido_id));

  for (const p of pedidosVisibles){
    const isClosed = closedSet.has(p.pedido_id);
    const estadoTxt = isClosed ? "Cerrado" : p.estado;
    const canClose = !isClosed && (p.estado === "Pagado");

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.pedido_id}</td>
      <td>${money(p.total)}</td>
      <td>${money(p.abonado)}</td>
      <td>${money(p.saldo)}</td>
      <td><span class="tag ${estadoClassOf(estadoTxt)}">${estadoTxt}</span></td>
      <td class="ta-right">
        ${
          isClosed
            ? (showClosed ? `<button class="btn ghost btn-sm" data-reopen="${p.pedido_id}">Reabrir</button>` : `<span class="tag closed">Cerrado</span>`)
            : (canClose ? `<button class="btn ghost btn-sm" data-close="${p.pedido_id}">Cerrar</button>` : `<button class="btn ghost btn-sm" disabled title="Solo se puede cerrar cuando esté Pagado">Cerrar</button>`)
        }
      </td>
    `;

    tr.querySelector(`[data-close="${p.pedido_id}"]`)?.addEventListener("click", () => closePedido(p.pedido_id));
    tr.querySelector(`[data-reopen="${p.pedido_id}"]`)?.addEventListener("click", () => reopenPedido(p.pedido_id));
    sp?.appendChild(tr);
  }
  
  // === Resumen por persona (con estado pill)
  const sn = $("sumPersonas");
  if (sn) sn.innerHTML = "";

  for (const n of sum.personas){
    const estPersona = estadoDe(n.saldo); // Pendiente/Pagado
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${n.persona}</td>
      <td>${money(n.total)}</td>
      <td>${money(n.abonado)}</td>
      <td>${money(n.saldo)}</td>
      <td><span class="tag ${estadoClassOf(estPersona)}">${estPersona}</span></td>
    `;
    sn?.appendChild(tr);
  }
}

async function load(){
  const user = await getUser();
  if (!user) return;

  const { data: closed, error: e1 } = await sb
    .from("temu_pedidos_cerrados")
    .select("pedido_id")
    .eq("user_id", user.id);

  if (e1){
    console.error(e1);
    notify("Error cargando cerrados: " + e1.message, "error");
    return;
  }
  closedSet = new Set((closed || []).map(x => x.pedido_id));

  const { data, error } = await sb
    .from("temu_pedidos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error){
    console.error(error);
    notify("Error cargando datos: " + error.message, "error");
    return;
  }

  cache = data || [];
  render();
}

// ===== Boot =====
(async () => {
  const { data: { session } } = await sb.auth.getSession();

  if (session) {
    const user = await getUser();
    if (!user) {
      await sb.auth.signOut();
      showAuthed(false);
      notify("Sesión inválida. Iniciá sesión.", "warn");
      return;
    }
    showAuthed(true);
    await load();
  } else {
    showAuthed(false);
  }

  sb.auth.onAuthStateChange(async (_event, sessionNow) => {
    if (!sessionNow) {
      showAuthed(false);
      return;
    }
    const user = await getUser();
    if (!user) {
      await sb.auth.signOut();
      showAuthed(false);
      notify("Sesión inválida. Iniciá sesión.", "warn");
      return;
    }
    showAuthed(true);
    await load();
  });
})();