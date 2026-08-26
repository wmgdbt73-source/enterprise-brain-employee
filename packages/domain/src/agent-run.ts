import type {
  AgentRunStatus,
  AgentToolIntent
} from '@enterprise-brain/contracts';
import { DomainError } from './errors.js';
import type { AgentRunId, ProjectId, TaskId, UserId } from './ids.js';

export interface AgentRun {
  readonly id: AgentRunId;
  readonly userId: UserId;
  readonly projectId: ProjectId;
  readonly taskId: TaskId;
  readonly agentDefinitionKey: 'read-only-work-agent-v1';
  readonly intent: AgentToolIntent;
  readonly status: AgentRunStatus;
  readonly createdAt: Date;
  readonly startedAt?: Date;
  readonly finishedAt?: Date;
  readonly updatedAt: Date;
}
export function createAgentRun(
  input: Omit<
    AgentRun,
    'status' | 'createdAt' | 'updatedAt' | 'startedAt' | 'finishedAt'
  >,
  now: Date
): AgentRun {
  return Object.freeze({
    ...input,
    status: 'QUEUED' as const,
    createdAt: new Date(now),
    updatedAt: new Date(now)
  });
}
export function startAgentRun(run: AgentRun, now: Date): AgentRun {
  return transition(run, 'RUNNING', now);
}
export function succeedAgentRun(run: AgentRun, now: Date): AgentRun {
  return transition(run, 'SUCCEEDED', now);
}
export function failAgentRun(run: AgentRun, now: Date): AgentRun {
  if (run.status !== 'QUEUED' && run.status !== 'RUNNING')
    throw new DomainError(
      'INVALID_STATE_TRANSITION',
      'AgentRun cannot fail from its current state'
    );
  return Object.freeze({
    ...run,
    status: 'FAILED' as const,
    finishedAt: new Date(now),
    updatedAt: new Date(now)
  });
}
function transition(
  run: AgentRun,
  status: 'RUNNING' | 'SUCCEEDED',
  now: Date
): AgentRun {
  if (
    (status === 'RUNNING' && run.status !== 'QUEUED') ||
    (status === 'SUCCEEDED' && run.status !== 'RUNNING')
  )
    throw new DomainError(
      'INVALID_STATE_TRANSITION',
      'Invalid AgentRun transition'
    );
  return Object.freeze({
    ...run,
    status,
    ...(status === 'RUNNING'
      ? { startedAt: new Date(now) }
      : { finishedAt: new Date(now) }),
    updatedAt: new Date(now)
  });
}
