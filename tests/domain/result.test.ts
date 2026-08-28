import { describe, expect, it } from 'vitest';
import { asArtifactId, asResultId, asTaskId, asUserId, createResult, submitResultForReview } from '../../packages/domain/src/index.js';

describe('Result domain', () => {
  const now = new Date('2026-08-29T00:00:00.000Z');
  const candidate = () => createResult({ id: asResultId('result'), taskId: asTaskId('task'), artifactIds: [asArtifactId('artifact')], submittedBy: asUserId('user'), createdAt: now, updatedAt: now });
  it('creates only CANDIDATE and transitions to HUMAN_REVIEW', () => {
    expect(candidate().status).toBe('CANDIDATE');
    expect(submitResultForReview(candidate(), new Date('2026-08-29T01:00:00.000Z')).status).toBe('HUMAN_REVIEW');
  });
  it('rejects empty or duplicate Artifact IDs', () => {
    expect(() => createResult({ id: asResultId('result'), taskId: asTaskId('task'), artifactIds: [], submittedBy: asUserId('user'), createdAt: now, updatedAt: now })).toThrow();
    expect(() => createResult({ id: asResultId('result'), taskId: asTaskId('task'), artifactIds: [asArtifactId('artifact'), asArtifactId('artifact')], submittedBy: asUserId('user'), createdAt: now, updatedAt: now })).toThrow();
  });
});
