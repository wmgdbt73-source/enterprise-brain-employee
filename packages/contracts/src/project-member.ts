import type { ProjectId, ProjectMemberId, UserId } from './ids.js';

export type ProjectMemberRole = 'OWNER' | 'MEMBER' | 'REVIEWER';

export interface ProjectMemberContract {
  id: ProjectMemberId;
  projectId: ProjectId;
  userId: UserId;
  role: ProjectMemberRole;
  createdAt: string;
  updatedAt: string;
}
