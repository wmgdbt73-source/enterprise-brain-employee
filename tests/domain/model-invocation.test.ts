import { describe, expect, it } from 'vitest';
import { modelInputHash, modelRequestFingerprint, normalizeModelPrompt } from '../../packages/domain/src/index.js';

describe('model invocation prompt identity', () => {
  it('trims only outer prompt whitespace and produces stable SHA-256 identities', () => {
    const prompt = normalizeModelPrompt('  first line\n  second line  ');
    expect(prompt).toBe('first line\n  second line');
    expect(modelInputHash(prompt)).toHaveLength(64);
    expect(modelRequestFingerprint({ userId: 'user', taskId: 'task', agentId: 'agent', prompt })).toBe(modelRequestFingerprint({ agentId: 'agent', prompt, taskId: 'task', userId: 'user' }));
  });
});
