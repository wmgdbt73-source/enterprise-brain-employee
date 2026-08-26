import { describe, expect, it } from 'vitest';
import {
  asAgentRunId,
  asAgentToolCallId,
  asArtifactId,
  asProjectId,
  asTaskId,
  asUserId,
  createArtifact
} from '../../packages/domain/src/index.js';

describe('Artifact domain', () => {
  it('creates an immutable version-one local file reference', () => {
    const artifact = createArtifact({
      id: asArtifactId('artifact'),
      projectId: asProjectId('project'),
      taskId: asTaskId('task'),
      agentRunId: asAgentRunId('run'),
      sourceToolCallId: asAgentToolCallId('call'),
      type: 'FILE',
      storageKind: 'LOCAL_WORKSPACE',
      relativePath: 'docs/a.md',
      size: 1,
      encoding: 'utf-8',
      sha256: 'a'.repeat(64),
      version: 1,
      createdByUserId: asUserId('user'),
      createdAt: new Date()
    });
    expect(artifact.version).toBe(1);
    expect(Object.isFrozen(artifact)).toBe(true);
  });
});
