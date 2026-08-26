import type {
  AgentRunContract,
  AgentToolCompletionReceipt,
  AgentToolRequest
} from '@enterprise-brain/contracts';
import { normalizeToolCompletion } from '@enterprise-brain/contracts';
import type { PrismaClient } from '../generated/prisma/client.js';

export class AgentRunRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async createRunning(
    run: AgentRunContract,
    request: AgentToolRequest
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.agentRun.create({
        data: {
          id: run.id,
          userId: run.userId,
          projectId: run.projectId,
          taskId: run.taskId,
          agentDefinitionKey: run.agentDefinitionKey,
          intent: { name: request.name, relativePath: request.relativePath },
          status: 'RUNNING',
          createdAt: new Date(run.createdAt),
          startedAt: new Date(run.startedAt!),
          updatedAt: new Date(run.updatedAt)
        }
      });
      await tx.agentToolCall.create({
        data: {
          id: request.id,
          agentRunId: run.id,
          sequence: 1,
          name: request.name,
          request,
          status: 'PENDING',
          createdAt: new Date(run.createdAt)
        }
      });
    });
  }
  async complete(
    runId: string,
    userId: string,
    receipt: AgentToolCompletionReceipt
  ): Promise<AgentRunContract | 'CONFLICT' | 'INVALID' | undefined> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const call = await tx.agentToolCall.findFirst({
          where: { id: receipt.toolCallId, agentRunId: runId },
          include: { agentRun: true }
        });
        if (
          !call ||
          call.agentRun.userId !== userId ||
          !(await tx.projectMember.findUnique({
            where: {
              projectId_userId: { projectId: call.agentRun.projectId, userId }
            }
          }))
        )
          return undefined;
        if (normalizeToolCompletion(call.request, receipt).kind === 'INVALID')
          return 'INVALID';
        if (call.status !== 'PENDING')
          return sameReceipt(call.receipt, receipt)
            ? toContract(call.agentRun)
            : 'CONFLICT';
        const now = new Date();
        const status = receipt.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED';
        const won = await tx.agentToolCall.updateMany({
          where: { id: call.id, agentRunId: runId, status: 'PENDING' },
          data: { status, receipt, completedAt: now }
        });
        if (won.count !== 1) {
          const stored = await tx.agentToolCall.findUnique({
            where: { id: call.id },
            include: { agentRun: true }
          });
          return stored && sameReceipt(stored.receipt, receipt)
            ? toContract(stored.agentRun)
            : 'CONFLICT';
        }
        const runWon = await tx.agentRun.updateMany({
          where: { id: runId, status: 'RUNNING' },
          data: { status, finishedAt: now, updatedAt: now }
        });
        if (runWon.count !== 1) throw new CompletionCasConflict();
        const updated = await tx.agentRun.findUniqueOrThrow({
          where: { id: runId }
        });
        return toContract(updated);
      });
    } catch (error) {
      if (error instanceof CompletionCasConflict) return 'CONFLICT';
      throw error;
    }
  }
  async findForUser(
    runId: string,
    userId: string
  ): Promise<AgentRunContract | undefined> {
    const run = await this.prisma.agentRun.findFirst({
      where: { id: runId, userId, project: { members: { some: { userId } } } }
    });
    return run ? toContract(run) : undefined;
  }
}
class CompletionCasConflict extends Error {}
function sameReceipt(
  value: unknown,
  receipt: AgentToolCompletionReceipt
): boolean {
  return stableJson(value) === stableJson(receipt);
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
function toContract(run: {
  id: string;
  userId: string;
  projectId: string;
  taskId: string;
  status: AgentRunContract['status'];
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  updatedAt: Date;
}): AgentRunContract {
  return {
    id: run.id,
    userId: run.userId,
    projectId: run.projectId,
    taskId: run.taskId,
    agentDefinitionKey: 'read-only-work-agent-v1',
    status: run.status,
    createdAt: run.createdAt.toISOString(),
    ...(run.startedAt ? { startedAt: run.startedAt.toISOString() } : {}),
    ...(run.finishedAt ? { finishedAt: run.finishedAt.toISOString() } : {}),
    updatedAt: run.updatedAt.toISOString()
  };
}
