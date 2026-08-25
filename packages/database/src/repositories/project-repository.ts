import type { ProjectContract } from '@enterprise-brain/contracts';
import type { CreatedProject, UserId } from '@enterprise-brain/domain';
import type { PrismaClient } from '../generated/prisma/client.js';

export interface ProjectRepositoryPort {
  create(createdProject: CreatedProject): Promise<ProjectContract>;
  listByMemberUserId(userId: UserId): Promise<ProjectContract[]>;
  findByIdForMember(
    projectId: string,
    userId: UserId
  ): Promise<ProjectContract | undefined>;
}

export class ProjectRepository implements ProjectRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async create(createdProject: CreatedProject): Promise<ProjectContract> {
    const { project, initialMember } = createdProject;

    const created = await this.prisma.$transaction(async (transaction) => {
      const createdProjectRecord = await transaction.project.create({
        data: {
          id: project.id,
          name: project.name,
          goal: project.goal,
          status: project.status,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt
        }
      });

      await transaction.projectMember.create({
        data: {
          id: initialMember.id,
          projectId: initialMember.projectId,
          userId: initialMember.userId,
          role: initialMember.role,
          createdAt: initialMember.createdAt,
          updatedAt: initialMember.updatedAt
        }
      });

      return createdProjectRecord;
    });

    return toProjectContract(created);
  }

  async listByMemberUserId(userId: UserId): Promise<ProjectContract[]> {
    const projects = await this.prisma.project.findMany({
      where: {
        members: {
          some: { userId }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return projects.map(toProjectContract);
  }

  async findByIdForMember(
    projectId: string,
    userId: UserId
  ): Promise<ProjectContract | undefined> {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        members: {
          some: { userId }
        }
      }
    });

    return project ? toProjectContract(project) : undefined;
  }
}

function toProjectContract(project: {
  id: string;
  name: string;
  goal: string | null;
  status: ProjectContract['status'];
  createdAt: Date;
  updatedAt: Date;
}): ProjectContract {
  return {
    id: project.id,
    name: project.name,
    ...(project.goal ? { goal: project.goal } : {}),
    status: project.status,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString()
  };
}
