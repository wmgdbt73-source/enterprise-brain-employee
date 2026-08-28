import type { ArtifactId, ResultId, TaskId, UserId } from './ids.js';
export type ResultStatus = 'DRAFT' | 'CANDIDATE' | 'HUMAN_REVIEW' | 'ACCEPTED' | 'REWORK';
export interface ResultContract { id: ResultId; taskId: TaskId; artifactIds: ArtifactId[]; status: ResultStatus; submittedBy: UserId; createdAt: string; submittedAt?: string; updatedAt: string; }
