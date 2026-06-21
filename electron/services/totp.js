/**
 * RFC 6238 TOTP (Google Authenticator compatible).
 */
const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function normalizeSecret(secret) {
  return String(secret || '')
    .replace(/\s/g, '')
    .replace(/=+$/, '')
    .toUpperCase();
}

function base32Decode(input) {
  const normalized = normalizeSecret(input);
  if (!normalized) return Buffer.alloc(0);

  let bits = '';
  for (const char of normalized) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }

  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function isTotpSecret(value) {
  const v = normalizeSecret(value);
  if (!v) return false;
  if (/^\d{6,8}$/.test(v)) return false;
  return /^[A-Z2-7]+$/.test(v) && v.length >= 8;
}

function generateTotp(secret, options = {}) {
  const period = options.period || 30;
  const digits = options.digits || 6;
  const nowMs = options.time ?? Date.now();
  const epoch = Math.floor(nowMs / 1000);
  const counter = Math.floor(epoch / period);
  const remaining = period - (epoch % period);

  const key = base32Decode(secret);
  if (!key.length) {
    return { ok: false, error: 'invalid_secret', code: '', remaining, period };
  }

  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);

  const code = String(binary % (10 ** digits)).padStart(digits, '0');
  return {
    ok: true,
    code,
    remaining,
    period,
    progress: remaining / period,
  };
}

module.exports = { generateTotp, isTotpSecret, normalizeSecret };
