import type { ProjectMemberRole } from '@enterprise-brain/contracts';
import { DomainError } from './errors.js';
import type { ProjectId, ProjectMemberId, UserId } from './ids.js';

export interface ProjectMember {
  readonly id: ProjectMemberId;
  readonly projectId: ProjectId;
  readonly userId: UserId;
  readonly role: ProjectMemberRole;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateProjectMemberInput {
  id: ProjectMemberId;
  projectId: ProjectId;
  userId: UserId;
  role: ProjectMemberRole;
}

const projectMemberRoles = new Set<ProjectMemberRole>([
  'OWNER',
  'MEMBER',
  'REVIEWER'
]);

export function createProjectMember(
  input: CreateProjectMemberInput,
  now: Date
): ProjectMember {
  if (!projectMemberRoles.has(input.role)) {
    throw new DomainError('INVALID_ARGUMENT', 'Unsupported ProjectMemberRole');
  }

  return Object.freeze({
    id: input.id,
    projectId: input.projectId,
    userId: input.userId,
    role: input.role,
    createdAt: new Date(now),
    updatedAt: new Date(now)
  });
}

/**
 * Validates only the supplied in-memory ProjectMember collection. A future
 * persistence layer must enforce the same uniqueness across requests/processes.
 */
export function addProjectMember(
  currentMembers: readonly ProjectMember[],
  input: CreateProjectMemberInput,
  now: Date
): ProjectMember {
  if (
    currentMembers.some(
      (member) =>
        member.projectId === input.projectId && member.userId === input.userId
    )
  ) {
    throw new DomainError(
      'DUPLICATE_PROJECT_MEMBER',
      'User is already a member of this project',
      { projectId: input.projectId, userId: input.userId }
    );
  }

  if (
    input.role === 'OWNER' &&
    currentMembers.some(
      (member) =>
        member.projectId === input.projectId && member.role === 'OWNER'
    )
  ) {
    throw new DomainError(
      'OWNER_ALREADY_EXISTS',
      'Project already has an owner',
      { projectId: input.projectId }
    );
  }

  return createProjectMember(input, now);
}

export function isProjectMember(
  members: readonly ProjectMember[],
  projectId: ProjectId,
  userId: UserId
): boolean {
  return members.some(
    (member) => member.projectId === projectId && member.userId === userId
  );
}
