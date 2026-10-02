import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

/**
 * RFC 6238 TOTP (the scheme Google Authenticator, 1Password, Authy etc. use):
 * HMAC-SHA1, 6 digits, 30-second steps.
 */
const STEP_SECONDS = 30;
const DIGITS = 6;
/** Accept the previous and next step too, for clock drift on the phone. */
const WINDOW = 1;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = BASE32.indexOf(ch);
    if (i < 0) throw new Error('Invalid base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160-bit secret, base32 as authenticator apps expect. */
export const generateTotpSecret = () => base32Encode(randomBytes(20));

function hotp(secret: Buffer, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac('sha1', secret).update(msg).digest();
  const offset = mac[mac.length - 1] & 0xf;
  const code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(code).padStart(DIGITS, '0');
}

export const currentStep = (now = Date.now()) =>
  Math.floor(now / 1000 / STEP_SECONDS);

/** The code an app shows right now. For tests. */
export const totpNow = (secret: string, now = Date.now()) =>
  hotp(base32Decode(secret), currentStep(now));

/**
 * Returns the matched time step, or null. Callers store the step and refuse
 * anything at or before it, so a code can't be used twice.
 */
export function verifyTotp(
  secret: string,
  code: string,
  lastStep: number | null,
  now = Date.now(),
) {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secret);
  const step = currentStep(now);
  for (let d = -WINDOW; d <= WINDOW; d++) {
    const s = step + d;
    if (lastStep !== null && s <= lastStep) continue;
    const expected = Buffer.from(hotp(key, s));
    if (timingSafeEqual(expected, Buffer.from(code))) return s;
  }
  return null;
}

/** `issuer` is the name the authenticator app shows above the code. */
export function otpauthUri(secret: string, account: string, issuer: string) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const q = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${q.toString()}`;
}

// ---- secrets at rest ---------------------------------------------------------

/**
 * TOTP secrets (admins' and users') are encrypted in the database
 * (AES-256-GCM), so a database leak alone doesn't hand out working second
 * factors.
 */
const keyFrom = (secret: string) =>
  createHash('sha256').update(`totp:${secret}`).digest();

export function encryptSecret(plain: string, key: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(key), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data]
    .map((b) => b.toString('base64url'))
    .join('.');
}

export function decryptSecret(stored: string, key: string) {
  const [iv, tag, data] = stored
    .split('.')
    .map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(key), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    'utf8',
  );
}

// ---- recovery codes ----------------------------------------------------------

/** `abcd-efgh-jk` style: 10 codes, each usable once. Only hashes are stored. */
export function generateRecoveryCodes(n = 10) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: n }, () => {
    const raw = Array.from(
      randomBytes(10),
      (b) => chars[b % chars.length],
    ).join('');
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
  });
}

export const normaliseRecoveryCode = (code: string) =>
  code
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export const hashToken = (value: string) =>
  createHash('sha256').update(value).digest('hex');
