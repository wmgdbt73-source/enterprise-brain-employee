import type { ArtifactId, ProjectId, ResultId, TaskId, UserId } from './ids.js';

export type ResultStatus = 'DRAFT' | 'CANDIDATE' | 'HUMAN_REVIEW' | 'ACCEPTED' | 'REWORK';
export type ReviewDecision = 'ACCEPT' | 'REWORK';

export interface ReviewContract {
  id: string;
  resultId: ResultId;
  reviewerId: UserId;
  decision: ReviewDecision;
  comment?: string;
  reviewedAt: string;
}

export interface ResultContract {
  id: ResultId;
  projectId: ProjectId;
  taskId: TaskId;
  artifactIds: ArtifactId[];
  status: ResultStatus;
  createdByUserId: UserId;
  submittedByUserId?: UserId;
  submittedAt?: string;
  createdAt: string;
  updatedAt: string;
}
