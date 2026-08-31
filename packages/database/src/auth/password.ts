import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
const KEY_LENGTH = 64;
const VERSION = 'scrypt-v1';

export function normalizeLogin(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

export async function encodePassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await derive(password, salt);
  return `${VERSION}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 3 || parts[0] !== VERSION || !/^[0-9a-f]{32}$/i.test(parts[1]) || !/^[0-9a-f]{128}$/i.test(parts[2])) return false;
  try {
    const actual = await derive(password, Buffer.from(parts[1], 'hex'));
    const expected = Buffer.from(parts[2], 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, value) => {
      if (error) reject(error);
      else resolve(Buffer.from(value));
    });
  });
}
