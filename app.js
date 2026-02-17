const SUPABASE_URL = "https://covnjmhxeuumpllhducc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_sHaJljJjWE3PYXWNHcCEcQ_YO1VC0JC";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);

let currentEditId = null;
let cache = []; // registros en memoria (para filtrar rápido)

const money = (n) => Number(n || 0).toLocaleString("es-SV", { style:"currency", currency:"USD" });
const num = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

function saldo(total, abonado){ return num(total) - num(abonado); }
function estadoDe(s){ return s <= 0 ? "Pagado" : "Pendiente"; }

function toast(msg, isError=false){
  const el = $("authMsg");
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#fecaca" : "#94a3b8";
}

function showAuthed(isAuthed){
  $("authCard").classList.toggle("hidden", isAuthed);
  $("app").classList.toggle("hidden", !isAuthed);
  $("btnLogout").classList.toggle("hidden", !isAuthed);
  $("btnExportReg").classList.toggle("hidden", !isAuthed);
  $("btnExportSum").classList.toggle("hidden", !isAuthed);
}

async function getUser(){
  const { data } = await sb.auth.getUser();
  return data.user;
}

// ---------------- AUTH ----------------
$("btnLogin").addEventListener("click", async () => {
  const email = $("email").value.trim();
  if (!email) return toast("Escribí tu correo.", true);

  toast("Enviando link...");
  const { error } = await sb.auth.signInWithOtp({ email });
  if (error) return toast("Error: " + error.message, true);

  toast("Listo. Revisá tu correo y abrí el link.");
});

$("btnLogout").addEventListener("click", async () => {
  await sb.auth.signOut();
  showAuthed(false);
});

// ---------------- CRUD ----------------
function readForm(){
  return {
    pedido_id: $("pedido_id").value.trim(),
    fecha: $("fecha").value || null,
    persona: $("persona").value.trim(),
    total: num($("total").value),
    abonado: num($("abonado").value),
    notas: $("notas").value.trim() || null
  };
}

function clearForm(){
  currentEditId = null;
  $("formTitle").textContent = "Agregar registro";
  $("pedido_id").value = "";
  $("fecha").value = "";
  $("persona").value = "";
  $("total").value = "";
  $("abonado").value = "";
  $("notas").value = "";
}

$("btnClear").addEventListener("click", clearForm);

$("btnSave").addEventListener("click", async () => {
  const user = await getUser();
  if (!user) return;

  const r = readForm();
  if (!r.pedido_id || !r.persona) return alert("Poné ID Pedido y Persona.");

  // Si estamos editando, actualizar. Si no, insertar.
  if (currentEditId){
    const { error } = await sb
      .from("temu_pedidos")
      .update({ pedido_id: r.pedido_id, fecha: r.fecha, persona: r.persona, total: r.total, abonado: r.abonado, notas: r.notas })
      .eq("id", currentEditId);
    if (error) return alert(error.message);
    clearForm();
    await load();
    return;
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

  if (error) return alert(error.message);

  // Para que sea rápido, dejá el ID puesto y limpiá el resto
  $("persona").value = "";
  $("total").value = "";
  $("abonado").value = "";
  $("notas").value = "";
  await load();
});

async function removeRow(id){
  if (!confirm("¿Eliminar este registro?")) return;
  const { error } = await sb.from("temu_pedidos").delete().eq("id", id);
  if (error) return alert(error.message);
  await load();
}

function openModal(row){
  currentEditId = row.id;
  $("modal").classList.remove("hidden");
  $("modalMsg").textContent = "";

  $("m_pedido_id").value = row.pedido_id ?? "";
  $("m_fecha").value = row.fecha ?? "";
  $("m_persona").value = row.persona ?? "";
  $("m_total").value = row.total ?? 0;
  $("m_abonado").value = row.abonado ?? 0;
  $("m_notas").value = row.notas ?? "";
}

$("btnClose").addEventListener("click", () => $("modal").classList.add("hidden"));

$("btnUpdate").addEventListener("click", async () => {
  if (!currentEditId) return;

  const payload = {
    pedido_id: $("m_pedido_id").value.trim(),
    fecha: $("m_fecha").value || null,
    persona: $("m_persona").value.trim(),
    total: num($("m_total").value),
    abonado: num($("m_abonado").value),
    notas: $("m_notas").value.trim() || null
  };

  if (!payload.pedido_id || !payload.persona) return $("modalMsg").textContent = "Falta ID o Persona.";

  const { error } = await sb.from("temu_pedidos").update(payload).eq("id", currentEditId);
  if (error) { $("modalMsg").textContent = error.message; return; }

  $("modal").classList.add("hidden");
  currentEditId = null;
  await load();
});

$("btnDelete").addEventListener("click", async () => {
  if (!currentEditId) return;
  await removeRow(currentEditId);
  $("modal").classList.add("hidden");
  currentEditId = null;
});

// ---------------- Filters ----------------
$("btnRefresh").addEventListener("click", load);
$("q").addEventListener("input", render);
$("estado").addEventListener("change", render);
$("order").addEventListener("change", render);

// ---------------- Export CSV ----------------
function toCSV(rows, headers){
  const esc = (s) => `"${String(s ?? "").replaceAll('"','""')}"`;
  const out = [];
  out.push(headers.map(esc).join(","));
  for (const r of rows){
    out.push(headers.map(h => esc(r[h])).join(","));
  }
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

$("btnExportReg").addEventListener("click", () => {
  const rows = cache.map(r => ({
    pedido_id: r.pedido_id,
    fecha: r.fecha ?? "",
    persona: r.persona,
    total: r.total,
    abonado: r.abonado,
    saldo: saldo(r.total, r.abonado),
    estado: estadoDe(saldo(r.total, r.abonado)),
    notas: r.notas ?? ""
  }));
  const csv = toCSV(rows, ["pedido_id","fecha","persona","total","abonado","saldo","estado","notas"]);
  download("temu_registros.csv", csv);
});

$("btnExportSum").addEventListener("click", () => {
  const { pedidos } = buildSummaries(cache);
  const rows = pedidos.map(p => ({
    pedido_id: p.pedido_id,
    total: p.total,
    abonado: p.abonado,
    saldo: p.saldo,
    estado: p.estado
  }));
  const csv = toCSV(rows, ["pedido_id","total","abonado","saldo","estado"]);
  download("temu_resumen_pedidos.csv", csv);
});

// ---------------- Data Load + Render ----------------
function buildSummaries(data){
  const byPedido = new Map();
  const byPersona = new Map();

  let totalAll = 0, abonadoAll = 0;

  for (const r of data){
    const t = num(r.total);
    const a = num(r.abonado);
    totalAll += t;
    abonadoAll += a;

    // Pedido
    const pk = r.pedido_id;
    const p = byPedido.get(pk) || { pedido_id: pk, total: 0, abonado: 0 };
    p.total += t; p.abonado += a;
    byPedido.set(pk, p);

    // Persona
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

  return {
    totalAll,
    abonadoAll,
    saldoAll: totalAll - abonadoAll,
    pedidos,
    personas
  };
}

function applyFilters(data){
  const q = $("q").value.trim().toLowerCase();
  const est = $("estado").value;

  let out = data;

  if (q){
    out = out.filter(r =>
      (r.pedido_id || "").toLowerCase().includes(q) ||
      (r.persona || "").toLowerCase().includes(q)
    );
  }

  if (est){
    out = out.filter(r => estadoDe(saldo(r.total, r.abonado)) === est);
  }

  // order
  const ord = $("order").value;
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

  // rows
  const tbody = $("rows");
  tbody.innerHTML = "";

  if (!data.length){
    $("emptyRows").classList.remove("hidden");
  } else {
    $("emptyRows").classList.add("hidden");
  }

  for (const r of data){
    const s = saldo(r.total, r.abonado);
    const est = estadoDe(s);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.pedido_id}</td>
      <td>${r.fecha ?? ""}</td>
      <td>${r.persona}</td>
      <td>${money(r.total)}</td>
      <td>${money(r.abonado)}</td>
      <td>${money(s)}</td>
      <td><span class="tag ${est === "Pendiente" ? "warn" : "ok"}">${est}</span></td>
      <td>${r.notas ?? ""}</td>
      <td class="ta-right">
        <button class="btn ghost btn-sm" data-edit="${r.id}">Editar</button>
        <button class="btn danger btn-sm" data-del="${r.id}">Borrar</button>
      </td>
    `;

    tr.querySelector(`[data-edit="${r.id}"]`).addEventListener("click", () => openModal(r));
    tr.querySelector(`[data-del="${r.id}"]`).addEventListener("click", () => removeRow(r.id));

    tbody.appendChild(tr);
  }

  // summaries (global from ALL cache, not filtered)
  const sum = buildSummaries(cache);

  $("kpiTotal").textContent = money(sum.totalAll);
  $("kpiAbonado").textContent = money(sum.abonadoAll);
  $("kpiSaldo").textContent = money(sum.saldoAll);
  $("kpiPedidos").textContent = String(sum.pedidos.length);

  // resumen pedidos
  const sp = $("sumPedidos");
  sp.innerHTML = "";
  for (const p of sum.pedidos){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.pedido_id}</td>
      <td>${money(p.total)}</td>
      <td>${money(p.abonado)}</td>
      <td>${money(p.saldo)}</td>
      <td>${p.estado}</td>
    `;
    sp.appendChild(tr);
  }

  // resumen personas
  const sn = $("sumPersonas");
  sn.innerHTML = "";
  for (const n of sum.personas){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${n.persona}</td>
      <td>${money(n.total)}</td>
      <td>${money(n.abonado)}</td>
      <td>${money(n.saldo)}</td>
    `;
    sn.appendChild(tr);
  }
}

async function load(){
  const user = await getUser();
  if (!user) return;

  const { data, error } = await sb
    .from("temu_pedidos")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return alert("Error: " + error.message);

  cache = data || [];
  render();
}

// Inject small button styles & tags (keep CSS file simple)
const style = document.createElement("style");
style.textContent = `
  .btn-sm{padding:8px 10px;border-radius:10px;font-weight:800}
  .tag{padding:4px 8px;border-radius:999px;font-size:.85rem;font-weight:800}
  .tag.ok{background:rgba(34,197,94,.14); border:1px solid rgba(34,197,94,.35); color:#bbf7d0}
  .tag.warn{background:rgba(245,158,11,.14); border:1px solid rgba(245,158,11,.35); color:#fde68a}
`;
document.head.appendChild(style);

// ---------------- Boot ----------------
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  showAuthed(!!session);
  if (session) await load();

  sb.auth.onAuthStateChange(async (_event, sessionNow) => {
    showAuthed(!!sessionNow);
    if (sessionNow) await load();
  });
})();
