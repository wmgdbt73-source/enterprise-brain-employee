import type { AgentRunContract, HumanConfirmationDetailContract } from '@enterprise-brain/contracts';
import type { DesktopApiGateway } from '../desktop-api-gateway.js';
import { LocalWriteService } from '../workspace/local-write-service.js';
import type { WorkspaceService } from '../workspace/workspace-service.js';
import { ApprovedWriteExecutionGrantStore } from './approved-write-execution-grant-store.js';
import { PendingWritePayloadStore } from './pending-write-payload-store.js';

type WriteInput = { relativePath: string; content: string };
type SafeConfirmation = { run: AgentRunContract; confirmation: HumanConfirmationDetailContract };

export class ConfirmedWriteCoordinator {
  constructor(
    private readonly gateway: DesktopApiGateway,
    private readonly workspace: WorkspaceService,
    private readonly writer = new LocalWriteService(),
    private readonly payloads = new PendingWritePayloadStore(),
    private readonly grants = new ApprovedWriteExecutionGrantStore()
  ) {}

  async prepare(taskId: string, input: WriteInput) {
    try {
      const task = await this.gateway.getTask(taskId);
      if (!task.ok) return task;
      const context = await this.workspace.getConfirmedWriteContext(task.data.projectId);
      const prepared = await this.writer.prepare(context.localPath, input.relativePath, input.content);
      const created = await this.gateway.createAgentRun(taskId, { name: 'write_file', relativePath: prepared.relativePath, payloadSize: prepared.payloadSize, payloadSha256: prepared.payloadSha256, effect: prepared.effect, ...(prepared.expectedCurrentSha256 ? { expectedCurrentSha256: prepared.expectedCurrentSha256 } : {}), deviceId: context.deviceId });
      if (!created.ok || !created.data.humanConfirmation || created.data.toolRequest.name !== 'write_file') return created.ok ? fail('HUMAN_CONFIRMATION_INVALID', 'Write confirmation was not created') : created;
      const detail = await this.gateway.getHumanConfirmation(created.data.humanConfirmation.id);
      if (!detail.ok) return detail;
      this.payloads.put(created.data.toolRequest.id, input.content);
      return { ok: true as const, data: { run: created.data.run, confirmation: detail.data } satisfies SafeConfirmation };
    } catch { return fail('LOCAL_WRITE_PRECONDITION_FAILED', 'Unable to prepare confirmed local write'); }
  }

  async approve(confirmationId: string) {
    const approved = await this.gateway.approveHumanConfirmation(confirmationId);
    if (!approved.ok) return approved;
    const grant = approved.data.executionGrant;
    if (!grant) return { ok: true as const, data: { confirmation: approved.data.confirmation } };
    this.grants.put(grant);
    const oneShotGrant = this.grants.take(grant.toolCallId);
    const payload = this.payloads.take(grant.toolCallId);
    if (!oneShotGrant || !payload) return fail('LOCAL_WRITE_PRECONDITION_FAILED', 'Write payload is unavailable');
    try {
      const context = await this.workspace.getConfirmedWriteContext(oneShotGrant.projectId);
      if (context.deviceId !== oneShotGrant.deviceId) return fail('LOCAL_PERMISSION_DENIED', 'Approved write is bound to another device');
      await this.writer.execute(context.localPath, oneShotGrant, payload.content);
      const completed = await this.gateway.completeAgentRun(oneShotGrant.agentRunId, { toolCallId: oneShotGrant.toolCallId, status: 'SUCCEEDED', metadata: { relativePath: oneShotGrant.relativePath, size: oneShotGrant.payloadSize, encoding: 'utf-8', sha256: oneShotGrant.payloadSha256, effect: oneShotGrant.effect } });
      return completed.ok ? { ok: true as const, data: { confirmation: approved.data.confirmation, run: completed.data } } : completed;
    } catch {
      const completed = await this.gateway.completeAgentRun(oneShotGrant.agentRunId, { toolCallId: oneShotGrant.toolCallId, status: 'FAILED', error: { code: 'LOCAL_IO_ERROR', message: 'Confirmed local write failed', details: {} } });
      return completed.ok ? { ok: true as const, data: { confirmation: approved.data.confirmation, run: completed.data } } : completed;
    }
  }

  async reject(confirmationId: string) {
    const result = await this.gateway.rejectHumanConfirmation(confirmationId);
    return result.ok ? { ok: true as const, data: { confirmation: result.data.confirmation } } : result;
  }
}
function fail(code: string, message: string) { return { ok: false as const, error: { code, message, details: {} } }; }
