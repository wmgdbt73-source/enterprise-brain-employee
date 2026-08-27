import type {
  AgentRunId,
  AgentToolCallId,
  ProjectId,
  TaskId,
  UserId
} from './ids.js';

export type AgentRunStatus =
  'QUEUED' | 'RUNNING' | 'WAITING_HUMAN' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type AgentToolName = 'list_directory' | 'read_file' | 'write_file';
export type AgentToolCallStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type AgentDefinitionKey = 'read-only-work-agent-v1' | 'confirmed-write-work-agent-v1';
export type WriteFileEffect = 'CREATE' | 'REPLACE';

export type AgentToolIntent =
  | { name: 'list_directory'; relativePath: string }
  | { name: 'read_file'; relativePath: string }
  | { name: 'write_file'; relativePath: string; payloadSize: number; payloadSha256: string; effect: WriteFileEffect; expectedCurrentSha256?: string; deviceId: string };

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
  status: AgentRunStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}
