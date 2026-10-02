import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify<string, Buffer, number, Buffer>(scrypt);

const KEYLEN = 64;

/** `scrypt$<salt b64>$<hash b64>` */
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEYLEN);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scryptAsync(
    password,
    Buffer.from(salt, 'base64'),
    expected.length,
  );
  return timingSafeEqual(actual, expected);
}

/** Hashed once at boot; compared against when the email is unknown so a
 *  failed lookup costs the same as a wrong password. */
export const DUMMY_HASH = hashPassword(randomBytes(16).toString('hex'));
