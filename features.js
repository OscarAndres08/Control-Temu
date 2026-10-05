// Funciones de la versión 1.1. No requieren tablas nuevas.
const cents = value => Math.round(num(value) * 100);
let sharePerson = "";
let paymentRecord = null;
let paymentBusy = false;
function actionButton(label, callback, style = "ghost") {
  const button = document.createElement("button");
  button.type = "button"; button.className = `btn ${style} btn-sm`;
  button.textContent = label; button.addEventListener("click", callback);
  return button;
}
function closeFeatureDialogs() {
  $("shareDialog")?.close(); $("paymentDialog")?.close(); paymentRecord = null;
  if ($("shareText")) $("shareText").value = "";
  $("whatsappLink")?.removeAttribute("href");
}
function shareRecords(person, pedido = "") {
  return cache.filter(r => (r.persona || "").trim() === person.trim() &&
    (pedido ? r.pedido_id === pedido : !closedSet.has(r.pedido_id) && cents(r.total) > cents(r.abonado)));
}
function buildAccountMessage(person, records) {
  const lines = [`Hola, ${person} 👋`, "Te comparto el detalle de tu cuenta:", ""];
  const groups = new Map();
  for (const record of records) {
    const list = groups.get(record.pedido_id) || []; list.push(record); groups.set(record.pedido_id, list);
  }
  let total = 0, paid = 0;
  for (const [pedido, rows] of groups) {
    lines.push(`📦 *Pedido ${pedido}*`);
    let groupTotal = 0, groupPaid = 0;
    for (const row of rows) {
      const products = productsForRecord(row.id);
      if (products.length) {
        for (const product of products) lines.push(`• ${product.cantidad} × ${product.producto} — ${money(product.precio_unitario)} c/u = ${money(productSubtotal(product))}`);
      } else lines.push(`• Registro sin desglose de productos: ${money(row.total)}`);
      groupTotal += cents(row.total); groupPaid += cents(row.abonado);
    }
    total += groupTotal; paid += groupPaid;
    lines.push(`Total: ${money(groupTotal / 100)}`, `Abonado: ${money(groupPaid / 100)}`, `Saldo: ${money((groupTotal - groupPaid) / 100)}`, "");
  }
  if (!records.length) return `Hola, ${person} 👋\nNo tenés saldos pendientes en pedidos abiertos. ¡Gracias!`;
  lines.push(`💵 *Total: ${money(total / 100)}*`, `✅ *Abonado: ${money(paid / 100)}*`,
    total >= paid ? `📌 *Saldo pendiente: ${money((total - paid) / 100)}*` : `📌 *Saldo a favor: ${money((paid - total) / 100)}*`, "", "¡Gracias! 😊");
  return lines.join("\n");
}
function updateWhatsappLink() {
  const message = $("shareText").value.trim();
  if (message) $("whatsappLink").href = `https://wa.me/?text=${encodeURIComponent(message)}`;
  else $("whatsappLink").removeAttribute("href");
  $("shareNotice").textContent = message.length > 3500 ? "El mensaje es largo. Si WhatsApp no lo abre completo, usá Copiar mensaje y pegalo en la conversación." : "No se guarda ningún número de teléfono. El mensaje solo se envía cuando lo confirmás en WhatsApp.";
}
function refreshShareMessage() {
  $("shareText").value = buildAccountMessage(sharePerson, shareRecords(sharePerson, $("shareScope").value));
  updateWhatsappLink();
}
function openShare(person, pedido = "") {
  sharePerson = person;
  const select = $("shareScope"); select.replaceChildren();
  select.add(new Option("Cuenta pendiente · pedidos abiertos", ""));
  const ids = [...new Set(cache.filter(r => (r.persona || "").trim() === person.trim()).map(r => r.pedido_id))];
  for (const id of ids) select.add(new Option(`Pedido ${id}${closedSet.has(id) ? " · cerrado" : ""}`, id));
  select.value = pedido; refreshShareMessage(); $("shareDialog").showModal();
}
on("closeShare", "click", () => $("shareDialog").close());
on("shareScope", "change", refreshShareMessage);
on("shareText", "input", updateWhatsappLink);
on("copyShare", "click", async () => {
  try { await navigator.clipboard.writeText($("shareText").value); notify("Mensaje copiado.", "success"); }
  catch { $("shareText").focus(); $("shareText").select(); notify("Seleccionamos el mensaje: copialo con el menú del dispositivo.", "info"); }
});
function openPayment(row) {
  if (closedSet.has(row.pedido_id) || cents(row.total) <= cents(row.abonado)) return;
  paymentRecord = {...row};
  $("paymentInfo").textContent = `${row.persona} · Pedido ${row.pedido_id}\nTotal: ${money(row.total)} · Abonado: ${money(row.abonado)}\nSaldo pendiente: ${money((cents(row.total) - cents(row.abonado)) / 100)}`;
  $("paymentAmount").value = "";
  $("paymentAmount").max = ((cents(row.total) - cents(row.abonado)) / 100).toFixed(2);
  $("paymentError").textContent = ""; $("paymentPreview").textContent = "";
  $("paymentDialog").showModal(); $("paymentAmount").focus();
}
on("closePayment", "click", () => { if (!paymentBusy) $("paymentDialog").close(); });
on("paymentDialog", "cancel", e => { if (paymentBusy) e.preventDefault(); });
on("paymentAmount", "input", () => {
  if (!paymentRecord) return;
  const amount = cents($("paymentAmount").value);
  $("paymentPreview").textContent = `Saldo después del abono: ${money((cents(paymentRecord.total) - cents(paymentRecord.abonado) - amount) / 100)}`;
});
on("paymentForm", "submit", async e => {
  e.preventDefault();
  if (paymentBusy || !paymentRecord) return;
  const row = {...paymentRecord};
  const raw = $("paymentAmount").value.trim();
  const amount = cents(raw), pending = cents(row.total) - cents(row.abonado);
  if (!/^\d+(\.\d{1,2})?$/.test(raw) || amount <= 0 || amount > pending) {
    $("paymentError").textContent = "Ingresá un monto positivo, con hasta dos decimales, que no supere el saldo."; return;
  }
  paymentBusy = true; $("savePayment").disabled = true; $("closePayment").disabled = true;
  $("savePayment").textContent = "Guardando…"; $("paymentError").textContent = "";
  try {
    const user = await getUser();
    if (!user) throw new Error("Iniciá sesión nuevamente.");
    const closed = await sb.from("temu_pedidos_cerrados").select("pedido_id").eq("user_id", user.id).eq("pedido_id", row.pedido_id);
    if (closed.error) throw closed.error;
    if (closed.data?.length) throw new Error("Este pedido está cerrado. Actualizá los registros.");
    // Compare-and-set: evita sobrescribir un abono cambiado desde otro dispositivo.
    let query = sb.from("temu_pedidos").update({abonado: (cents(row.abonado) + amount) / 100})
      .eq("id", row.id).eq("user_id", user.id).eq("total", row.total).eq("pedido_id", row.pedido_id);
    query = row.abonado == null ? query.is("abonado", null) : query.eq("abonado", row.abonado);
    const result = await query.select("id");
    if (result.error) throw result.error;
    if (!result.data?.length) throw new Error("El registro cambió o no tenés permiso. Cerrá esta ventana, actualizá y revisá el saldo antes de intentarlo otra vez.");
    $("paymentDialog").close(); paymentRecord = null;
    await load(); notify(`Abono de ${money(amount / 100)} guardado.`, "success");
  } catch (error) {
    $("paymentError").textContent = `${error.message || "No se pudo confirmar el abono."} Si hubo una interrupción de conexión, actualizá y verificá el saldo antes de reintentar.`;
  } finally {
    paymentBusy = false; $("savePayment").disabled = false; $("closePayment").disabled = false;
    $("savePayment").textContent = "Guardar abono";
  }
});
