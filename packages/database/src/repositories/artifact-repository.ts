import {
  normalizeToolCompletionForRequest,
  normalizeToolRequest,
  type ArtifactContract
} from '@enterprise-brain/contracts';
import {
  asAgentRunId,
  asAgentToolCallId,
  asArtifactId,
  asProjectId,
  asTaskId,
  asUserId,
  createArtifact
} from '@enterprise-brain/domain';
import type { PrismaClient } from '../generated/prisma/client.js';
type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$use' | '$extends'
>;

export type ArtifactRegistration =
  | { artifact: ArtifactContract; created: boolean }
  | 'NOT_FOUND'
  | 'SOURCE_INVALID';

export class ArtifactRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async registerFromRunForUser(input: {
    artifactId: string;
    agentRunId: string;
    userId: string;
    now: Date;
  }): Promise<ArtifactRegistration> {
    try {
      return await this.prisma.$transaction((tx) =>
        this.registerInTransaction(tx, input)
      );
    } catch (error) {
      if (!isSourceToolCallUniqueConflict(error)) throw error;
      const artifact = await this.findExistingSourceArtifactForUser(
        input.agentRunId,
        input.userId
      );
      if (!artifact) return 'NOT_FOUND';
      return { artifact, created: false };
    }
  }

  async listForTaskForMember(
    taskId: string,
    userId: string
  ): Promise<ArtifactContract[] | undefined> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, project: { members: { some: { userId } } } },
      include: { artifacts: { orderBy: { createdAt: 'desc' } } }
    });
    if (!task) return undefined;
    return task.artifacts.map(toContract);
  }

  private async registerInTransaction(
    tx: TransactionClient,
    input: { artifactId: string; agentRunId: string; userId: string; now: Date }
  ): Promise<ArtifactRegistration> {
    const run = await tx.agentRun.findFirst({
      where: {
        id: input.agentRunId,
        userId: input.userId,
        project: { members: { some: { userId: input.userId } } }
      }
    });
    if (!run) return 'NOT_FOUND';
    const calls = await tx.agentToolCall.findMany({
      where: { agentRunId: run.id }
    });
    if (calls.length !== 1) return 'SOURCE_INVALID';
    const call = await tx.agentToolCall.findUnique({
      where: { agentRunId_sequence: { agentRunId: run.id, sequence: 1 } }
    });
    if (!call || call.id !== calls[0]?.id) return 'SOURCE_INVALID';
    if (
      run.status !== 'SUCCEEDED' ||
      call.status !== 'SUCCEEDED' ||
      call.name !== 'read_file'
    )
      return 'SOURCE_INVALID';
    const request = normalizeToolRequest(call.request);
    if (!request || !hasMatchingFormalProvenance(request, call, run)) return 'SOURCE_INVALID';
    const completion = normalizeToolCompletionForRequest(request, call.receipt);
    if (completion.kind !== 'READ_FILE_SUCCESS') return 'SOURCE_INVALID';
    const existing = await tx.artifact.findUnique({
      where: { sourceToolCallId: call.id }
    });
    if (existing) return { artifact: toContract(existing), created: false };
    const artifact = createArtifact({
      id: asArtifactId(input.artifactId),
      projectId: asProjectId(run.projectId),
      taskId: asTaskId(run.taskId),
      agentRunId: asAgentRunId(run.id),
      sourceToolCallId: asAgentToolCallId(call.id),
      type: 'FILE',
      storageKind: 'LOCAL_WORKSPACE',
      relativePath: completion.relativePath,
      size: completion.size,
      encoding: completion.encoding,
      sha256: completion.sha256,
      version: 1,
      createdByUserId: asUserId(run.userId),
      createdAt: input.now
    });
    const created = await tx.artifact.create({
      data: {
        id: artifact.id,
        projectId: artifact.projectId,
        taskId: artifact.taskId,
        agentRunId: artifact.agentRunId,
        sourceToolCallId: artifact.sourceToolCallId,
        type: artifact.type,
        storageKind: artifact.storageKind,
        relativePath: artifact.relativePath,
        size: artifact.size,
        encoding: artifact.encoding,
        sha256: artifact.sha256,
        version: artifact.version,
        createdByUserId: artifact.createdByUserId,
        createdAt: artifact.createdAt
      }
    });
    return { artifact: toContract(created), created: true };
  }

  private async findExistingSourceArtifactForUser(
    agentRunId: string,
    userId: string
  ): Promise<ArtifactContract | undefined> {
    const run = await this.prisma.agentRun.findFirst({
      where: {
        id: agentRunId,
        userId,
        project: { members: { some: { userId } } }
      }
    });
    if (!run) return undefined;
    const source = await this.prisma.agentToolCall.findUnique({
      where: { agentRunId_sequence: { agentRunId, sequence: 1 } }
    });
    if (!source) return undefined;
    const artifact = await this.prisma.artifact.findUnique({
      where: { sourceToolCallId: source.id }
    });
    return artifact ? toContract(artifact) : undefined;
  }
}

function toContract(artifact: {
  id: string;
  projectId: string;
  taskId: string;
  agentRunId: string;
  sourceToolCallId: string;
  type: ArtifactContract['type'];
  storageKind: ArtifactContract['storageKind'];
  relativePath: string;
  size: number;
  encoding: string;
  sha256: string;
  version: number;
  createdByUserId: string;
  createdAt: Date;
}): ArtifactContract {
  return {
    id: artifact.id,
    projectId: artifact.projectId,
    taskId: artifact.taskId,
    agentRunId: artifact.agentRunId,
    sourceToolCallId: artifact.sourceToolCallId,
    type: artifact.type,
    storageKind: artifact.storageKind,
    relativePath: artifact.relativePath,
    size: artifact.size,
    encoding: artifact.encoding as 'utf-8',
    sha256: artifact.sha256,
    version: 1,
    createdByUserId: artifact.createdByUserId,
    createdAt: artifact.createdAt.toISOString()
  };
}

export function isSourceToolCallUniqueConflict(error: unknown): boolean {
  if (!isRecord(error) || error.code !== 'P2002') return false;
  const adapterError = isRecord(error.meta)
    ? error.meta.driverAdapterError
    : undefined;
  if (!isRecord(adapterError) || !isRecord(adapterError.cause)) return false;
  const constraint = adapterError.cause.constraint;
  return (
    adapterError.cause.kind === 'UniqueConstraintViolation' &&
    isRecord(constraint) &&
    Array.isArray(constraint.fields) &&
    constraint.fields.length === 1 &&
    constraint.fields[0] === 'source_tool_call_id'
  );
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function hasMatchingFormalProvenance(
  request: { id: string; runId: string; userId: string; projectId: string; name: string },
  call: { id: string; agentRunId: string; name: string },
  run: { id: string; userId: string; projectId: string }
): boolean {
  return request.id === call.id && request.runId === run.id && request.runId === call.agentRunId &&
    request.userId === run.userId && request.projectId === run.projectId && request.name === call.name;
}
