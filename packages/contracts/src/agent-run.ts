import type {
  AgentRunId,
  AgentToolCallId,
  ProjectId,
  TaskId,
  UserId
} from './ids.js';

export type AgentRunStatus =
  'QUEUED' | 'RUNNING' | 'WAITING_HUMAN' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';
export type AgentToolName = 'list_directory' | 'read_file';
export type AgentToolCallStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED';

export type AgentToolIntent =
  | { name: 'list_directory'; relativePath: string }
  | { name: 'read_file'; relativePath: string };

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
  agentDefinitionKey: 'read-only-work-agent-v1';
  status: AgentRunStatus;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
}
