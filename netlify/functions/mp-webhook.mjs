// Aviso de Mercado Pago. Siempre confirmamos el pago consultando la API con nuestro token,
// así un aviso falso no puede marcar pedidos como pagados.
import crypto from 'node:crypto';
import { getPedido, updPedido, sacarPiezas, json } from '../lib/tienda.mjs';

function firmaValida(req, dataId) {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) return true; // opcional: igual verificamos contra la API
  const sig = req.headers.get('x-signature') || '';
  const reqId = req.headers.get('x-request-id') || '';
  const parts = Object.fromEntries(sig.split(',').map((p) => p.trim().split('=')));
  if (!parts.ts || !parts.v1) return false;
  const manifest = 'id:' + String(dataId).toLowerCase() + ';request-id:' + reqId + ';ts:' + parts.ts + ';';
  const h = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
  return h.length === parts.v1.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(parts.v1));
}

export default async (req) => {
  const url = new URL(req.url);
  let body = {};
  try { body = await req.json(); } catch {}
  const tipo = body.type || body.topic || url.searchParams.get('type') || url.searchParams.get('topic');
  const payId = body.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id');
  if (tipo !== 'payment' || !payId) return json({ ok: true, ignorado: true });
  if (!firmaValida(req, payId)) return json({ error: 'firma' }, 401);

  const r = await fetch('https://api.mercadopago.com/v1/payments/' + encodeURIComponent(payId), {
    headers: { Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN },
  });
  if (!r.ok) return json({ error: 'pago no encontrado' }, 200);
  const pay = await r.json();
  const pedido = pay.external_reference ? await getPedido(pay.external_reference) : null;
  if (!pedido) return json({ ok: true, sinPedido: true });

  const yaListo = ['pagado', 'pagado_revisar', 'preparando', 'despachado', 'entregado'].includes(pedido.estado);
  if (yaListo) return json({ ok: true });

  if (pay.status === 'approved') {
    if (Number(pay.transaction_amount) < Number(pedido.total)) {
      await updPedido(pedido.id, { estado: 'pagado_revisar', mp_payment: String(pay.id), nota: 'Monto pagado menor al total del pedido.' });
      return json({ ok: true });
    }
    const conflicto = await sacarPiezas(pedido.items || []);
    await updPedido(pedido.id, {
      estado: conflicto.length ? 'pagado_revisar' : 'pagado',
      mp_payment: String(pay.id),
      pagado_at: new Date().toISOString(),
      nota: conflicto.length ? 'Pieza ya vendida a otra persona: ' + conflicto.join(', ') + '. Devolver el dinero desde Mercado Pago o ofrecer cambio.' : null,
    });
  } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(pay.status)) {
    await updPedido(pedido.id, { estado: 'pago_rechazado', mp_payment: String(pay.id) });
  } else {
    await updPedido(pedido.id, { estado: 'pago_pendiente', mp_payment: String(pay.id) });
  }
  return json({ ok: true });
};
