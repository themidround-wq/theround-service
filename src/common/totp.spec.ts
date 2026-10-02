import {
  base32Decode,
  base32Encode,
  decryptSecret,
  encryptSecret,
  generateRecoveryCodes,
  totpNow,
  verifyTotp,
} from './totp';

// RFC 6238 appendix B: SHA1 key "12345678901234567890". The RFC lists
// 8-digit codes; authenticator apps use the last 6.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));
const VECTORS: [number, string][] = [
  [59, '287082'],
  [1111111109, '081804'],
  [1111111111, '050471'],
  [1234567890, '005924'],
  [2000000000, '279037'],
];

describe('totp', () => {
  it.each(VECTORS)('matches RFC 6238 at t=%i', (t, code) => {
    expect(totpNow(RFC_SECRET, t * 1000)).toBe(code);
  });

  it('round-trips base32', () => {
    const buf = Buffer.from('any bytes \u0000ÿ here');
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
  });

  it('accepts one step of clock drift and rejects replays', () => {
    const now = 1_700_000_000_000;
    const code = totpNow(RFC_SECRET, now - 30_000);
    const step = verifyTotp(RFC_SECRET, code, null, now);
    expect(step).not.toBeNull();
    expect(verifyTotp(RFC_SECRET, code, step, now)).toBeNull();
    expect(
      verifyTotp(RFC_SECRET, totpNow(RFC_SECRET, now - 120_000), null, now),
    ).toBeNull();
    expect(verifyTotp(RFC_SECRET, 'abcdef', null, now)).toBeNull();
  });

  it('encrypts secrets so only the right key opens them', () => {
    const sealed = encryptSecret(RFC_SECRET, 'key-a');
    expect(sealed).not.toContain(RFC_SECRET);
    expect(decryptSecret(sealed, 'key-a')).toBe(RFC_SECRET);
    expect(() => decryptSecret(sealed, 'key-b')).toThrow();
  });

  it('makes 10 distinct recovery codes', () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    codes.forEach((c) =>
      expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{2}$/),
    );
  });
});
