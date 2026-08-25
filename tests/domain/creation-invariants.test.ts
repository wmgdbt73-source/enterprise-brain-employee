import { describe, expect, it } from 'vitest';
import {
  asProjectId,
  asProjectMemberId,
  asTaskId,
  asUserId,
  applyTaskAction,
  createUser,
  createProject,
  createTask,
  DomainError
} from '../../packages/domain/src/index.js';
import { createProjectFixture, now, projectId } from './fixtures.js';

describe('creation invariants', () => {
  it('creates an ACTIVE project and its initial OWNER membership', () => {
    const created = createProject(
      {
        id: projectId,
        name: 'Employee Alpha',
        initialOwner: {
          memberId: asProjectMemberId('member-owner'),
          userId: asUserId('user-owner')
        }
      },
      now
    );

    expect(created.project.status).toBe('ACTIVE');
    expect(created.initialMember.role).toBe('OWNER');
    expect(created.project).not.toHaveProperty('ownerId');
    expect(created.project).not.toHaveProperty('memberIds');
  });

  it('creates an unassigned TODO task', () => {
    const fixture = createProjectFixture();
    const task = createTask(
      { id: asTaskId('task-unassigned'), projectId, title: 'Unassigned task' },
      fixture.members,
      now
    );

    expect(task.status).toBe('TODO');
    expect(task.assigneeId).toBeUndefined();
  });

  it('keeps User system roles separate from Project roles', () => {
    const user = createUser(
      {
        id: asUserId('employee-1'),
        name: 'Employee',
        systemRole: 'EMPLOYEE'
      },
      now
    );

    expect(user.systemRole).toBe('EMPLOYEE');
    expect(() =>
      createUser(
        {
          id: asUserId('invalid-role'),
          name: 'Invalid',
          systemRole: 'PROJECT_OWNER' as never
        },
        now
      )
    ).toThrow(DomainError);
  });

  it('rejects a task without a project identity', () => {
    expect(() => asProjectId('')).toThrow('ProjectId must not be empty');
  });

  it('rejects a blank task title', () => {
    const fixture = createProjectFixture();

    expect(() =>
      createTask(
        { id: asTaskId('task-blank'), projectId, title: '  ' },
        fixture.members,
        now
      )
    ).toThrow(DomainError);
  });

  it('keeps identity invariant and updates timestamp after a transition', () => {
    const fixture = createProjectFixture();
    const laterNow = new Date('2026-08-25T00:01:00.000Z');
    const task = createTask(
      { id: asTaskId('task-identity'), projectId, title: 'Identity' },
      fixture.members,
      now
    );
    const inProgress = applyTaskAction(task, 'START', laterNow);

    expect(inProgress.status).toBe('IN_PROGRESS');
    expect(inProgress.id).toBe(task.id);
    expect(inProgress.projectId).toBe(task.projectId);
    expect(inProgress.createdAt).toEqual(task.createdAt);
    expect(inProgress.updatedAt).toEqual(laterNow);
    expect(inProgress.updatedAt).not.toEqual(task.updatedAt);
  });
});
