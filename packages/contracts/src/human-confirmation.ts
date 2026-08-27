import type { AgentRunId, AgentToolCallId, ProjectId, TaskId, UserId } from './ids.js';
import type { WriteFileEffect } from './agent-run.js';
export type HumanConfirmationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export interface HumanConfirmationContract { id: string; agentRunId: AgentRunId; toolCallId: AgentToolCallId; userId: UserId; projectId: ProjectId; taskId: TaskId; status: HumanConfirmationStatus; createdAt: string; decidedAt?: string; }
/** Safe server-derived confirmation display data. It intentionally excludes device and raw request data. */
export interface HumanConfirmationDetailContract {
  confirmation: HumanConfirmationContract;
  action: 'write_file';
  relativePath: string;
  effect: WriteFileEffect;
  payloadSize: number;
  payloadSha256: string;
  risk: 'MEDIUM' | 'HIGH';
  reason: string;
  requiredPermission: 'LOCAL_CREATE' | 'LOCAL_MODIFY';
}
export interface ApprovedWriteExecutionGrant { confirmationId: string; agentRunId: AgentRunId; toolCallId: AgentToolCallId; userId: UserId; projectId: ProjectId; taskId: TaskId; deviceId: string; relativePath: string; payloadSize: number; payloadSha256: string; effect: WriteFileEffect; expectedCurrentSha256?: string; }
