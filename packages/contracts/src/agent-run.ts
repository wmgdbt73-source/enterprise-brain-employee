import type {
  AgentRunId,
  AgentToolCallId,
  ProjectId,
  TaskId,
  UserId
} from './ids.js';

export type AgentRunStatus =
  'QUEUED' | 'RUNNING' | 'WAITING_HUMAN' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type AgentRunKind = 'TOOL' | 'MODEL';
export type AgentToolName = 'list_directory' | 'read_file' | 'write_file';
export type AgentToolCallStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
/** A persisted catalog key is server-owned; clients select by AgentDefinition id. */
export type AgentDefinitionKey = string;
export type AgentRuntimeProfile = 'READ_ONLY_WORK' | 'CONFIRMED_WRITE_WORK';
export type AgentDefinitionStatus = 'ACTIVE' | 'DISABLED';
export type AgentAssignmentScopeType = 'ORGANIZATION' | 'DEPARTMENT' | 'USER';
export type AgentAssignmentStatus = 'ACTIVE' | 'DISABLED';
export interface AvailableAgentContract { id: string; key: string; name: string; description?: string; version: number; runtimeProfile: AgentRuntimeProfile; assignmentSources: AgentAssignmentScopeType[]; }
export interface AgentDefinitionContract { id: string; organizationId: string; key: string; name: string; description?: string; status: AgentDefinitionStatus; version: number; runtimeProfile: AgentRuntimeProfile; createdAt: string; updatedAt: string; }
export interface AgentAssignmentContract { id: string; organizationId: string; agentDefinitionId: string; scopeType: AgentAssignmentScopeType; scopeId: string; status: AgentAssignmentStatus; createdAt: string; updatedAt: string; }
export type WriteFileEffect = 'CREATE' | 'REPLACE';

export type AgentToolIntent =
  | { name: 'list_directory'; relativePath: string }
  | { name: 'read_file'; relativePath: string }
  | { name: 'write_file'; relativePath: string; payloadSize: number; payloadSha256: string; effect: WriteFileEffect; expectedCurrentSha256?: string; deviceId: string };

/** The renderer's generic Agent entrypoint is deliberately read-only. */
export type ReadOnlyAgentToolIntent = Exclude<AgentToolIntent, { name: 'write_file' }>;

export type AgentToolRequest = AgentToolIntent & {
  id: AgentToolCallId;
  runId: AgentRunId;
  userId: UserId;
  projectId: ProjectId;
};

export type AgentToolCompletionReceipt =
  | {
      toolCallId: AgentToolCallId;
      status: 'SUCCEEDED';
      metadata: {
        relativePath: string;
        entryCount?: number;
        size?: number;
        encoding?: 'utf-8';
        sha256?: string;
        effect?: WriteFileEffect;
      };
    }
  | {
      toolCallId: AgentToolCallId;
      status: 'FAILED';
      error: { code: string; message: string; details: Record<string, never> };
    };

export interface AgentRunContract {
  id: AgentRunId;
  userId: UserId;
  projectId: ProjectId;
  taskId: TaskId;
  agentDefinitionKey: AgentDefinitionKey;
  agentVersion: number;
  /** TOOL is retained as the compatibility default for pre-EB-020 run records. */
  kind?: AgentRunKind;
  status: AgentRunStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}
