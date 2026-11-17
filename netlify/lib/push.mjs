// Notificaciones push del panel (Web Push con VAPID), sin dependencias externas.
// Cifrado del mensaje según RFC 8291 (aes128gcm) y firma VAPID según RFC 8292.
import crypto from 'node:crypto';

// Llave pública VAPID (va también en panel/index.html). La privada vive solo en Netlify: VAPID_PRIVATE_KEY.
export const VAPID_PUBLIC = 'BAUR6bLGcEiTKqSO0sAtJG3KCRDwZ1eId4PrVvlnw-8xULrSfnIoHRWX5QTWR_UgHnaVbBM0b7sgvLj8x089zFo';
const CONTACTO = 'mailto:paffu.cl@gmail.com';

const b64u = (b) => Buffer.from(b).toString('base64url');
const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, len));

function firmaVapid(aud) {
  const pub = Buffer.from(VAPID_PUBLIC, 'base64url');
  const key = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: process.env.VAPID_PRIVATE_KEY.trim(), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk',
  });
  const h = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const p = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: CONTACTO }));
  const firma = crypto.sign('sha256', Buffer.from(h + '.' + p), { key, dsaEncoding: 'ieee-p1363' });
  return h + '.' + p + '.' + b64u(firma);
}

export function cifrar(sub, texto) {
  const uaPub = Buffer.from(sub.p256dh, 'base64url');
  const auth = Buffer.from(sub.auth, 'base64url');
  const ecdh = crypto.createECDH('prime256v1');
  const asPub = ecdh.generateKeys();
  const ikm = hkdf(auth, ecdh.computeSecret(uaPub), Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub]), 32);
  const salt = crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const c = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(texto, 'utf8'), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct]);
}

// Envía un aviso a un dispositivo. Devuelve el código HTTP (404/410 = suscripción vencida).
export async function enviarPush(sub, data) {
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      TTL: '86400', Urgency: 'high', 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream',
      Authorization: 'vapid t=' + firmaVapid(new URL(sub.endpoint).origin) + ', k=' + VAPID_PUBLIC,
    },
    body: cifrar(sub, JSON.stringify(data)),
    signal: AbortSignal.timeout(6000),
  });
  return r.status;
}
