import type {
  AgentRunContract,
  AgentToolCompletionReceipt,
  AgentToolRequest
} from '@enterprise-brain/contracts';
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
          intent: request,
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
  ): Promise<AgentRunContract | 'CONFLICT' | undefined> {
    return this.prisma.$transaction(async (tx) => {
      const call = await tx.agentToolCall.findFirst({
        where: { id: receipt.toolCallId, agentRunId: runId },
        include: { agentRun: true }
      });
      if (!call || call.agentRun.userId !== userId) return undefined;
      if (call.status !== 'PENDING')
        return sameReceipt(call.receipt, receipt)
          ? toContract(call.agentRun)
          : 'CONFLICT';
      const now = new Date();
      const status = receipt.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED';
      await tx.agentToolCall.update({
        where: { id: call.id },
        data: { status, receipt, completedAt: now }
      });
      const updated = await tx.agentRun.update({
        where: { id: runId },
        data: { status, finishedAt: now, updatedAt: now }
      });
      return toContract(updated);
    });
  }
  async findForUser(
    runId: string,
    userId: string
  ): Promise<AgentRunContract | undefined> {
    const run = await this.prisma.agentRun.findFirst({
      where: { id: runId, userId }
    });
    return run ? toContract(run) : undefined;
  }
}
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
