// Lógica compartida de la tienda Paffu para las funciones de Netlify.
// Precios, envíos y piezas únicas: debe calzar con index.html.

export const CFG = { gratis: 50000 };

export const ZONAS = {
  local:   { nombre: "Región de O'Higgins", precio: 3490 },
  rm:      { nombre: 'Región Metropolitana', precio: 3990 },
  centro:  { nombre: 'Zona centro', precio: 4990 },
  norte:   { nombre: 'Zona norte', precio: 6490 },
  sur:     { nombre: 'Zona sur', precio: 6490 },
  extremo: { nombre: 'Zona extrema', precio: 9990 },
};

export const REGIONES = {
  'Arica y Parinacota': 'extremo', 'Tarapacá': 'norte', 'Antofagasta': 'norte', 'Atacama': 'norte',
  'Coquimbo': 'centro', 'Valparaíso': 'centro', 'Metropolitana de Santiago': 'rm', "O'Higgins": 'local',
  'Maule': 'centro', 'Ñuble': 'sur', 'Biobío': 'sur', 'La Araucanía': 'sur', 'Los Ríos': 'sur',
  'Los Lagos': 'sur', 'Aysén': 'extremo', 'Magallanes': 'extremo',
};

export const unica = (p) => p && p.id !== 'giftcard';
const dc = (p, n) => (p.dcto ? Math.round((n * (100 - p.dcto)) / 100) : n);
export function oprice(p, t) {
  if (!p.tallas || !p.tallas.length) return p.price;
  const v = p.tallas.find((x) => x[0] === t);
  return v ? v[1] : null;
}
export const vprice = (p, t) => { const o = oprice(p, t); return o == null ? null : dc(p, o); };

export function etiqueta(p, t) {
  if (!t) return '';
  if (p.vlabel === 'Modelo') { const i = t.lastIndexOf(' · '); return i < 0 ? 'Talla ' + t : t.slice(0, i) + ' · Talla ' + t.slice(i + 3); }
  if (p.vlabel === 'Diseño') return 'Diseño ' + t;
  return (p.vlabel || 'Talla') + ' ' + t;
}

// ---------- Supabase (REST con la service role key; solo en el servidor) ----------
const SB = () => process.env.SUPABASE_URL || 'https://tzqpnvpxstkxwcwxavfb.supabase.co'; // URL pública del proyecto
const KEY = () => process.env.SUPABASE_SERVICE_ROLE_KEY;
async function sb(path, opt = {}) {
  const r = await fetch(SB() + '/rest/v1/' + path, {
    ...opt,
    // Llaves nuevas (sb_secret_...) van solo en apikey; las antiguas (JWT) también en Authorization.
    headers: { apikey: KEY(), ...(KEY().startsWith('eyJ') ? { Authorization: 'Bearer ' + KEY() } : {}), 'Content-Type': 'application/json', Prefer: 'return=representation', ...(opt.headers || {}) },
  });
  const txt = await r.text();
  const data = txt ? JSON.parse(txt) : null;
  if (!r.ok) throw new Error('Supabase ' + r.status + ': ' + txt);
  return data;
}
export const getProductos = (ids) => sb('productos?select=*&id=in.(' + ids.map((i) => '"' + String(i).replace(/"/g, '') + '"').join(',') + ')');
export const updProducto = (id, fields) => sb('productos?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ ...fields, updated_at: new Date().toISOString() }) });
export const insPedido = (row) => sb('pedidos', { method: 'POST', body: JSON.stringify(row) }).then((d) => d[0]);
export const getPedido = (id) => sb('pedidos?select=*&id=eq.' + encodeURIComponent(id)).then((d) => d[0]);
export const updPedido = (id, fields) => sb('pedidos?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify(fields) });

// Revisa disponibilidad y calcula precios desde la base (nunca desde el navegador).
export function armarLineas(items, rows) {
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const lineas = [], faltan = [];
  for (const it of items) {
    const p = byId[it.id];
    const t = it.t || '';
    if (!p || p.st !== 'ok') { faltan.push(p ? p.name : it.id); continue; }
    const tieneVar = p.tallas && p.tallas.length;
    if (tieneVar && !p.tallas.some((x) => x[0] === t)) { faltan.push(p.name + (t ? ' (' + etiqueta(p, t) + ')' : '')); continue; }
    const q = unica(p) ? 1 : Math.max(1, Math.min(20, parseInt(it.q, 10) || 1));
    lineas.push({ id: p.id, name: p.name, t, label: etiqueta(p, t), q, precio: vprice(p, t), oprecio: oprice(p, t) });
  }
  return { lineas, faltan, byId };
}

// Saca del catálogo las piezas vendidas o reservadas. Devuelve las que ya no estaban.
export async function sacarPiezas(lineas) {
  const ids = [...new Set(lineas.map((l) => l.id))];
  const rows = await getProductos(ids);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const conflicto = [];
  for (const id of ids) {
    const p = byId[id];
    if (!p || !unica(p)) continue;
    const mias = lineas.filter((l) => l.id === id);
    let tallas = p.tallas || [];
    let st = p.st;
    for (const l of mias) {
      if (l.t && tallas.length) {
        if (!tallas.some((x) => x[0] === l.t)) conflicto.push(l.name + ' (' + l.label + ')');
        tallas = tallas.filter((x) => x[0] !== l.t);
      } else if (st !== 'ok') conflicto.push(l.name);
    }
    const sinPiezas = !tallas.length;
    await updProducto(id, { tallas: (p.tallas && p.tallas.length) ? tallas : p.tallas, st: sinPiezas ? 'out' : st, stock: sinPiezas ? 0 : p.stock });
  }
  return conflicto;
}

export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
