import type {
  AgentRunId,
  AgentToolCallId,
  ArtifactId,
  ProjectId,
  TaskId,
  UserId
} from './ids.js';

export type ArtifactType = 'FILE';
export type ArtifactStorageKind = 'LOCAL_WORKSPACE';

export interface ArtifactContract {
  id: ArtifactId;
  projectId: ProjectId;
  taskId: TaskId;
  agentRunId: AgentRunId;
  sourceToolCallId: AgentToolCallId;
  type: ArtifactType;
  storageKind: ArtifactStorageKind;
  relativePath: string;
  size: number;
  encoding: 'utf-8';
  sha256: string;
  version: 1;
  createdByUserId: UserId;
  createdAt: string;
}

export interface RegisterArtifactRequest {
  agentRunId: AgentRunId;
}
