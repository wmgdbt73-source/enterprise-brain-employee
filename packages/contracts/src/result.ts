import type { ArtifactId, ProjectId, ResultId, TaskId, UserId } from './ids.js';

export type ResultStatus = 'DRAFT' | 'CANDIDATE' | 'HUMAN_REVIEW' | 'ACCEPTED' | 'REWORK';

export interface ResultContract {
  id: ResultId;
  projectId: ProjectId;
  taskId: TaskId;
  artifactIds: ArtifactId[];
  status: ResultStatus;
  createdByUserId: UserId;
  createdAt: string;
  updatedAt: string;
}
