import type { AgentRunId, AgentToolCallId, ProjectId, TaskId, UserId } from './ids.js';
import type { WriteFileEffect } from './agent-run.js';
export type HumanConfirmationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface HumanConfirmationContract { id: string; agentRunId: AgentRunId; toolCallId: AgentToolCallId; userId: UserId; projectId: ProjectId; taskId: TaskId; status: HumanConfirmationStatus; createdAt: string; decidedAt?: string; }
export interface ApprovedWriteExecutionGrant { confirmationId: string; agentRunId: AgentRunId; toolCallId: AgentToolCallId; userId: UserId; projectId: ProjectId; taskId: TaskId; deviceId: string; relativePath: string; payloadSize: number; payloadSha256: string; effect: WriteFileEffect; expectedCurrentSha256?: string; }
