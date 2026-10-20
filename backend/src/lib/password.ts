import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;
const KEY_LENGTH = 64;

/**
 * Hashes a password with scrypt and a random 16-byte salt (FR-ACC-03).
 * @returns a self-describing string: scrypt$cost$salt$hash. The plain password is never stored.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELISM,
  }).toString('hex');
  return `scrypt$${COST}$${salt}$${hash}`;
}

/**
 * Checks a password against a stored scrypt hash in constant time.
 * @returns true only when the password matches
 */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const cost = Number(parts[1]);
  const salt = parts[2];
  const expected = Buffer.from(parts[3], 'hex');
  if (!Number.isFinite(cost) || expected.length === 0) return false;
  const actual = scryptSync(password, salt, expected.length, {
    N: cost,
    r: BLOCK_SIZE,
    p: PARALLELISM,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
