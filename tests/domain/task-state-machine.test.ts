import { describe, expect, it } from 'vitest';
import {
  applyTaskAction,
  asTaskId,
  createTask
} from '../../packages/domain/src/index.js';
import { createProjectFixture, now, projectId } from './fixtures.js';
import { expectDomainError } from './assertions.js';

describe('Task state machine', () => {
  it('follows the formal lifecycle through CLOSED', () => {
    const fixture = createProjectFixture();
    const todo = createTask(
      { id: asTaskId('task-lifecycle'), projectId, title: 'Lifecycle' },
      fixture.members,
      now
    );
    const inProgress = applyTaskAction(todo, 'START', now);
    const readyForReview = applyTaskAction(
      inProgress,
      'SUBMIT_FOR_REVIEW',
      now
    );
    const accepted = applyTaskAction(
      readyForReview,
      'ACCEPT_AFTER_HUMAN_REVIEW',
      now
    );
    const closed = applyTaskAction(accepted, 'CLOSE', now);

    expect(
      [todo, inProgress, readyForReview, accepted, closed].map(
        (task) => task.status
      )
    ).toEqual([
      'TODO',
      'IN_PROGRESS',
      'READY_FOR_REVIEW',
      'ACCEPTED',
      'CLOSED'
    ]);
  });

  it('returns a task to IN_PROGRESS only through REQUEST_REWORK', () => {
    const fixture = createProjectFixture();
    const task = createTask(
      { id: asTaskId('task-rework'), projectId, title: 'Rework' },
      fixture.members,
      now
    );
    const ready = applyTaskAction(
      applyTaskAction(task, 'START', now),
      'SUBMIT_FOR_REVIEW',
      now
    );

    expect(applyTaskAction(ready, 'REQUEST_REWORK', now).status).toBe(
      'IN_PROGRESS'
    );
  });

  it('rejects illegal transitions', () => {
    const fixture = createProjectFixture();
    const task = createTask(
      { id: asTaskId('task-invalid'), projectId, title: 'Invalid' },
      fixture.members,
      now
    );

    expectDomainError(
      () => applyTaskAction(task, 'CLOSE', now),
      'INVALID_STATE_TRANSITION'
    );
  });

  it('rejects an untrusted arbitrary action string without changing task state', () => {
    const fixture = createProjectFixture();
    const task = createTask(
      { id: asTaskId('task-untrusted'), projectId, title: 'Untrusted' },
      fixture.members,
      now
    );

    expectDomainError(
      () => applyTaskAction(task, 'SET_ACCEPTED' as never, now),
      'INVALID_STATE_TRANSITION'
    );
    expect(task.status).toBe('TODO');
  });

  it('keeps ACCEPTED distinct from CLOSED until CLOSE is called', () => {
    const fixture = createProjectFixture();
    const task = createTask(
      { id: asTaskId('task-accepted'), projectId, title: 'Accepted' },
      fixture.members,
      now
    );
    const accepted = applyTaskAction(
      applyTaskAction(
        applyTaskAction(task, 'START', now),
        'SUBMIT_FOR_REVIEW',
        now
      ),
      'ACCEPT_AFTER_HUMAN_REVIEW',
      now
    );

    expect(accepted.status).toBe('ACCEPTED');
    expect(applyTaskAction(accepted, 'CLOSE', now).status).toBe('CLOSED');
  });
});
