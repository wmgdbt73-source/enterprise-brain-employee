import { describe, expect, it } from 'vitest';
import { createSessionToken, hashSessionToken, normalizeLogin, encodePassword, verifyPassword } from '../../packages/database/src/index.js';

describe('demo session authentication primitives', () => {
  it('normalizes logins and uses versioned salted scrypt password hashes', async () => {
    const encoded = await encodePassword('correct horse battery staple');
    expect(normalizeLogin('  Employee@Example.Test ')).toBe('employee@example.test');
    expect(encoded).toMatch(/^scrypt-v1\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(await verifyPassword('correct horse battery staple', encoded)).toBe(true);
    expect(await verifyPassword('wrong', encoded)).toBe(false);
    expect(await verifyPassword('correct horse battery staple', 'malformed')).toBe(false);
  });

  it('keeps raw session tokens separate from their persisted hashes', () => {
    const first = createSessionToken(); const second = createSessionToken();
    expect(first).not.toBe(second);
    expect(hashSessionToken(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(first)).not.toBe(first);
  });
});
