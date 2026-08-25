import { randomUUID } from 'node:crypto';
import type { ProjectContract } from '@enterprise-brain/contracts';
import {
  asProjectId,
  asProjectMemberId,
  createProject,
  DomainError
} from '@enterprise-brain/domain';
import type { ProjectRepositoryPort } from '@enterprise-brain/database';
import type { RequestContext } from '../../context/request-context.js';

export interface CreateProjectRequest {
  name: string;
  goal?: string;
}

export class ProjectNotFoundError extends Error {
  constructor() {
    super('Project not found');
  }
}

export class ProjectService {
  constructor(private readonly projects: ProjectRepositoryPort) {}

  async create(
    context: RequestContext,
    request: CreateProjectRequest
  ): Promise<ProjectContract> {
    const now = new Date();
    const createdProject = createProject(
      {
        id: asProjectId(randomUUID()),
        name: request.name,
        goal: request.goal,
        initialOwner: {
          memberId: asProjectMemberId(randomUUID()),
          userId: context.currentUser.id
        }
      },
      now
    );

    return this.projects.create(createdProject);
  }

  async list(context: RequestContext): Promise<ProjectContract[]> {
    return this.projects.listByMemberUserId(context.currentUser.id);
  }

  async getById(
    context: RequestContext,
    projectId: string
  ): Promise<ProjectContract> {
    const project = await this.projects.findByIdForMember(
      projectId,
      context.currentUser.id
    );

    if (!project) {
      throw new ProjectNotFoundError();
    }

    return project;
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
