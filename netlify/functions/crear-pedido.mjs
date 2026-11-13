// POST /.netlify/functions/crear-pedido
// Crea el pedido en Supabase y, si paga con Mercado Pago, el cobro (Checkout Pro).
import { CFG, ZONAS, REGIONES, getProductos, armarLineas, insPedido, updPedido, sacarPiezas, json } from '../lib/tienda.mjs';

const limpio = (s, n = 120) => String(s || '').trim().slice(0, n);

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ error: 'Datos inválidos' }, 400); }

  const cliente = { nombre: limpio(b.cliente?.nombre, 80), email: limpio(b.cliente?.email, 120), telefono: limpio(b.cliente?.telefono, 30) };
  const metodo = b.metodo === 'retiro' ? 'retiro' : 'despacho';
  const pago = b.pago === 'transferencia' ? 'transferencia' : 'mercadopago';
  const region = limpio(b.region, 60);
  const entrega = { metodo, region: metodo === 'despacho' ? region : null, direccion: metodo === 'despacho' ? limpio(b.direccion, 160) : null, comuna: metodo === 'despacho' ? limpio(b.comuna, 60) : null };

  if (!cliente.nombre || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cliente.email) || cliente.telefono.replace(/\D/g, '').length < 8)
    return json({ error: 'Revisa tu nombre, correo y teléfono.' }, 400);
  if (metodo === 'despacho' && (!REGIONES[region] || !entrega.direccion || !entrega.comuna))
    return json({ error: 'Falta la dirección de despacho.' }, 400);
  const items = Array.isArray(b.items) ? b.items.slice(0, 30) : [];
  if (!items.length) return json({ error: 'Tu carro está vacío.' }, 400);

  const rows = await getProductos([...new Set(items.map((i) => i.id))]);
  const { lineas, faltan } = armarLineas(items, rows);
  if (faltan.length) return json({ error: 'Ya no está disponible: ' + faltan.join(', ') + '. Quítalo del carro para seguir.', faltan }, 409);

  const subtotal = lineas.reduce((s, l) => s + l.precio * l.q, 0);
  const zona = ZONAS[REGIONES[region] || 'rm'];
  const envio = metodo === 'despacho' && subtotal < CFG.gratis ? zona.precio : 0;
  const total = subtotal + envio;

  const pedido = await insPedido({
    estado: pago === 'transferencia' ? 'esperando_transferencia' : 'pendiente_pago',
    pago, cliente, entrega, items: lineas, subtotal, envio, total,
  });

  if (pago === 'transferencia') {
    // Las piezas únicas quedan reservadas mientras llega la transferencia.
    await sacarPiezas(lineas);
    return json({ num: pedido.num, total, datos: process.env.TRANSFERENCIA_DATOS || 'Te enviaremos los datos de transferencia por WhatsApp.' });
  }

  const site = process.env.URL || new URL(req.url).origin;
  const mpItems = lineas.map((l) => ({ id: l.id, title: l.name + (l.label ? ' · ' + l.label : ''), quantity: l.q, unit_price: l.precio, currency_id: 'CLP' }));
  if (envio) mpItems.push({ id: 'envio', title: 'Despacho · ' + zona.nombre, quantity: 1, unit_price: envio, currency_id: 'CLP' });
  const [nombre, ...resto] = cliente.nombre.split(' ');
  const r = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.MP_ACCESS_TOKEN, 'Content-Type': 'application/json', 'X-Idempotency-Key': pedido.id },
    body: JSON.stringify({
      items: mpItems,
      payer: { name: nombre, surname: resto.join(' '), email: cliente.email },
      external_reference: pedido.id,
      notification_url: site + '/.netlify/functions/mp-webhook',
      back_urls: {
        success: site + '/?pago=ok&pedido=' + pedido.num,
        pending: site + '/?pago=pendiente&pedido=' + pedido.num,
        failure: site + '/?pago=error&pedido=' + pedido.num,
      },
      auto_return: 'approved',
      statement_descriptor: 'PAFFU',
    }),
  });
  const mp = await r.json();
  if (!r.ok || !mp.init_point) {
    await updPedido(pedido.id, { estado: 'error_pago', nota: 'Mercado Pago: ' + (mp.message || r.status) });
    return json({ error: 'No pudimos abrir Mercado Pago. Inténtalo de nuevo o escríbenos por WhatsApp.' }, 502);
  }
  await updPedido(pedido.id, { mp_preference: mp.id });
  return json({ num: pedido.num, total, url: mp.init_point });
};
