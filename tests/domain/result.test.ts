import { describe, expect, it } from 'vitest';
import { asArtifactId, asProjectId, asResultId, asTaskId, asUserId, createResultCandidate, rehydrateResult } from '../../packages/domain/src/index.js';

const input = {
  id: asResultId('result-1'), projectId: asProjectId('project-1'), taskId: asTaskId('task-1'),
  artifactIds: [asArtifactId('artifact-a')], createdByUserId: asUserId('user-1')
};

describe('Result domain', () => {
  it('creates only an immutable CANDIDATE', () => {
    const result = createResultCandidate(input, new Date('2026-08-29T00:00:00.000Z'));
    expect(result.status).toBe('CANDIDATE');
    expect(Object.isFrozen(result)).toBe(true);
  });
  it('rejects empty and duplicate Artifact composition', () => {
    expect(() => createResultCandidate({ ...input, artifactIds: [] }, new Date())).toThrow('must not be empty');
    expect(() => createResultCandidate({ ...input, artifactIds: [asArtifactId('artifact-a'), asArtifactId('artifact-a')] }, new Date())).toThrow('duplicates');
  });
  it('rehydrates trusted persisted statuses without exposing a status setter', () => {
    expect(rehydrateResult({ ...createResultCandidate(input, new Date()), status: 'HUMAN_REVIEW' })).toMatchObject({ status: 'HUMAN_REVIEW' });
  });
});
