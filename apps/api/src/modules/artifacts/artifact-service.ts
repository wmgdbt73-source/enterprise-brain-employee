import { randomUUID } from 'node:crypto';
import type { ArtifactContract } from '@enterprise-brain/contracts';
import type { ArtifactRepository } from '@enterprise-brain/database';
import type { RequestContext } from '../../context/request-context.js';

export class ArtifactNotFoundError extends Error {}
export class ArtifactSourceInvalidError extends Error {}

export class ArtifactService {
  constructor(private readonly artifacts: ArtifactRepository) {}

  async register(
    context: RequestContext,
    agentRunId: string
  ): Promise<{ artifact: ArtifactContract; created: boolean }> {
    const result = await this.artifacts.registerFromRunForUser({
      artifactId: randomUUID(),
      agentRunId,
      userId: context.currentUser.id,
      now: new Date()
    });
    if (result === 'NOT_FOUND') throw new ArtifactNotFoundError();
    if (result === 'SOURCE_INVALID') throw new ArtifactSourceInvalidError();
    return result;
  }

  async list(
    context: RequestContext,
    taskId: string
  ): Promise<ArtifactContract[]> {
    const artifacts = await this.artifacts.listForTaskForMember(
      taskId,
      context.currentUser.id
    );
    if (!artifacts) throw new ArtifactNotFoundError();
    return artifacts;
  }
}
