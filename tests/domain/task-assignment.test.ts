import { describe, expect, it } from 'vitest';
import {
  addProjectMember,
  asProjectMemberId,
  asTaskId,
  assignTask,
  createTask,
  unassignTask
} from '../../packages/domain/src/index.js';
import {
  createProjectFixture,
  memberId,
  now,
  projectId,
  reviewerId
} from './fixtures.js';
import { expectDomainError } from './assertions.js';

describe('Task assignment rules', () => {
  it('allows OWNER, MEMBER, and REVIEWER to be assignees', () => {
    const fixture = createProjectFixture();
    const member = addProjectMember(
      fixture.members,
      {
        id: asProjectMemberId('member-task'),
        projectId,
        userId: memberId,
        role: 'MEMBER'
      },
      now
    );
    const reviewer = addProjectMember(
      [...fixture.members, member],
      {
        id: asProjectMemberId('reviewer-task'),
        projectId,
        userId: reviewerId,
        role: 'REVIEWER'
      },
      now
    );
    const members = [...fixture.members, member, reviewer];
    const task = createTask(
      { id: asTaskId('task-assignment'), projectId, title: 'Assignment' },
      members,
      now
    );

    expect(
      assignTask(task, fixture.owner.userId, members, now).assigneeId
    ).toBe(fixture.owner.userId);
    expect(assignTask(task, memberId, members, now).assigneeId).toBe(memberId);
    expect(assignTask(task, reviewerId, members, now).assigneeId).toBe(
      reviewerId
    );
  });

  it('rejects an assignee without membership in the task project', () => {
    const fixture = createProjectFixture();
    const task = createTask(
      { id: asTaskId('task-membership'), projectId, title: 'Membership' },
      fixture.members,
      now
    );

    expectDomainError(
      () => assignTask(task, memberId, fixture.members, now),
      'PROJECT_MEMBERSHIP_REQUIRED'
    );
  });

  it('allows a task to become unassigned', () => {
    const fixture = createProjectFixture();
    const task = createTask(
      {
        id: asTaskId('task-unassign'),
        projectId,
        title: 'Unassign',
        assigneeId: fixture.owner.userId
      },
      fixture.members,
      now
    );

    expect(unassignTask(task, now).assigneeId).toBeUndefined();
  });
});
