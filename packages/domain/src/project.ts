import type { ProjectStatus } from '@enterprise-brain/contracts';
import { requireNonBlank } from './errors.js';
import type { ProjectId, ProjectMemberId, UserId } from './ids.js';
import { createProjectMember, type ProjectMember } from './project-member.js';

export interface Project {
  readonly id: ProjectId;
  readonly name: string;
  readonly goal?: string;
  readonly status: ProjectStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CreateProjectInput {
  id: ProjectId;
  name: string;
  goal?: string;
  initialOwner: {
    memberId: ProjectMemberId;
    userId: UserId;
  };
}

export interface CreatedProject {
  readonly project: Project;
  readonly initialMember: ProjectMember;
}

export function createProject(
  input: CreateProjectInput,
  now: Date
): CreatedProject {
  const project = Object.freeze({
    id: input.id,
    name: requireNonBlank(input.name, 'name'),
    goal: input.goal?.trim() || undefined,
    status: 'ACTIVE' as const,
    createdAt: new Date(now),
    updatedAt: new Date(now)
  });

  return Object.freeze({
    project,
    initialMember: createProjectMember(
      {
        id: input.initialOwner.memberId,
        projectId: input.id,
        userId: input.initialOwner.userId,
        role: 'OWNER'
      },
      now
    )
  });
}
