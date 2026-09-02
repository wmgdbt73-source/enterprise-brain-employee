import { createHash } from 'node:crypto';

/** Preserves all meaningful internal text while defining the outer-whitespace boundary. */
export function normalizeModelPrompt(prompt: string): string { return prompt.trim(); }
export function modelInputHash(prompt: string): string { return createHash('sha256').update(prompt, 'utf8').digest('hex'); }
/** Explicit field order keeps the fingerprint independent of JavaScript object iteration. */
export function modelRequestFingerprint(input: { userId: string; taskId: string; agentId: string; prompt: string }): string {
  return createHash('sha256').update(JSON.stringify({ version: 1, userId: input.userId, taskId: input.taskId, agentId: input.agentId, prompt: input.prompt }), 'utf8').digest('hex');
}
