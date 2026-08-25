import type { TaskAction, TaskStatus } from '@enterprise-brain/contracts';
import { DomainError } from './errors.js';

const transitions: Readonly<
  Record<TaskStatus, Readonly<Partial<Record<TaskAction, TaskStatus>>>>
> = {
  TODO: { START: 'IN_PROGRESS' },
  IN_PROGRESS: { SUBMIT_FOR_REVIEW: 'READY_FOR_REVIEW' },
  READY_FOR_REVIEW: {
    REQUEST_REWORK: 'IN_PROGRESS',
    ACCEPT_AFTER_HUMAN_REVIEW: 'ACCEPTED'
  },
  ACCEPTED: { CLOSE: 'CLOSED' },
  CLOSED: {}
};

export function transitionTaskStatus(
  currentStatus: TaskStatus,
  action: TaskAction
): TaskStatus {
  const nextStatus = transitions[currentStatus][action];
  if (!nextStatus) {
    throw new DomainError(
      'INVALID_STATE_TRANSITION',
      `Action ${action} is not allowed from ${currentStatus}`,
      { currentStatus, action }
    );
  }

  return nextStatus;
}
