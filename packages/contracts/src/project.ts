import type { ProjectId } from './ids.js';

export type ProjectStatus = 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';

export interface ProjectContract {
  id: ProjectId;
  name: string;
  goal?: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}
