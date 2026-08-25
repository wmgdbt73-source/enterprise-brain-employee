import {
  asProjectId,
  asProjectMemberId,
  asTaskId,
  asUserId,
  createProject,
  type ProjectMember
} from '../../packages/domain/src/index.js';

export const now = new Date('2026-08-25T00:00:00.000Z');
export const projectId = asProjectId('project-1');
export const ownerId = asUserId('user-owner');
export const memberId = asUserId('user-member');
export const reviewerId = asUserId('user-reviewer');

export function createProjectFixture(): {
  owner: ProjectMember;
  members: readonly ProjectMember[];
} {
  const created = createProject(
    {
      id: projectId,
      name: 'Employee Alpha',
      initialOwner: {
        memberId: asProjectMemberId('member-owner'),
        userId: ownerId
      }
    },
    now
  );

  return { owner: created.initialMember, members: [created.initialMember] };
}

export const taskId = asTaskId('task-1');
