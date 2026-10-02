import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signed per-address token for unsubscribe links, so nobody can unsubscribe
 * someone else by guessing the URL. Stateless: no table of tokens to keep.
 */
export function unsubscribeToken(email: string, secret: string) {
  return createHmac('sha256', `unsubscribe:${secret}`)
    .update(email.toLowerCase())
    .digest('base64url');
}

export function verifyUnsubscribeToken(
  email: string,
  token: string,
  secret: string,
) {
  const expected = Buffer.from(unsubscribeToken(email, secret));
  const actual = Buffer.from(token);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
