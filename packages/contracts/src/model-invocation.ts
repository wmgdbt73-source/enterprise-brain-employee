export type ModelInvocationStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

/** Server-owned record; raw provider payloads, reasoning, and credentials are excluded. */
export interface ModelInvocationContract {
  id: string;
  agentRunId: string;
  initiatedByUserId: string;
  provider: string;
  model: string;
  status: ModelInvocationStatus;
  inputText: string;
  outputText?: string;
  providerResponseId?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  errorCode?: string;
  createdAt: string;
  completedAt?: string;
}
export type BeginModelRunDisposition = 'CREATED' | 'EXISTING_RUNNING' | 'EXISTING_COMPLETED' | 'EXISTING_FAILED';
export interface ModelRunContext {
  organizationName: string;
  projectName: string;
  taskTitle: string;
  taskDescription?: string;
  taskStatus: string;
  agentName: string;
  agentDescription?: string;
  agentVersion: number;
}
