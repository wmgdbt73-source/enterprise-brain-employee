import { DomainError, requireNonBlank } from './errors.js';
import type {
  AgentRunId,
  AgentToolCallId,
  ArtifactId,
  ProjectId,
  TaskId,
  UserId
} from './ids.js';

export interface Artifact {
  readonly id: ArtifactId;
  readonly projectId: ProjectId;
  readonly taskId: TaskId;
  readonly agentRunId: AgentRunId;
  readonly sourceToolCallId: AgentToolCallId;
  readonly type: 'FILE';
  readonly storageKind: 'LOCAL_WORKSPACE';
  readonly relativePath: string;
  readonly size: number;
  readonly encoding: 'utf-8';
  readonly sha256: string;
  readonly version: 1;
  readonly createdByUserId: UserId;
  readonly createdAt: Date;
}
export function createArtifact(input: Artifact): Artifact {
  const relativePath = requireNonBlank(input.relativePath, 'relativePath');
  if (!Number.isInteger(input.size) || input.size < 0)
    throw new DomainError(
      'INVALID_ARGUMENT',
      'size must be a non-negative integer'
    );
  if (input.encoding !== 'utf-8')
    throw new DomainError('INVALID_ARGUMENT', 'encoding must be utf-8');
  if (!/^[a-f0-9]{64}$/i.test(input.sha256))
    throw new DomainError('INVALID_ARGUMENT', 'sha256 must be a SHA-256 hash');
  return Object.freeze({
    ...input,
    relativePath,
    createdAt: new Date(input.createdAt)
  });
}
