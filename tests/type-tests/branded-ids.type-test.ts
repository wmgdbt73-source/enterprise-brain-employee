import {
  asProjectId,
  asUserId,
  type ProjectId
} from '../../packages/domain/src/index.js';

const projectId: ProjectId = asProjectId('project-1');
const userId = asUserId('user-1');

// @ts-expect-error UserId cannot be used where ProjectId is required.
const invalidProjectId: ProjectId = userId;

void projectId;
void invalidProjectId;
