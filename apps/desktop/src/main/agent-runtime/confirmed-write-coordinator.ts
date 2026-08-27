import type { AgentRunContract, ApprovedWriteExecutionGrant, HumanConfirmationContract, HumanConfirmationDetailContract } from '@enterprise-brain/contracts';
import type { DesktopApiGateway } from '../desktop-api-gateway.js';
import { LocalWriteService } from '../workspace/local-write-service.js';
import type { WorkspaceService } from '../workspace/workspace-service.js';
import { ApprovedWriteExecutionGrantStore } from './approved-write-execution-grant-store.js';
import { PendingWritePayloadStore, type PendingWritePayload } from './pending-write-payload-store.js';

type WriteInput = { relativePath: string; content: string };
type SafeConfirmation = { run: AgentRunContract; confirmation: HumanConfirmationDetailContract };
export class ConfirmedWriteCoordinator {
  constructor(private readonly gateway: DesktopApiGateway, private readonly workspace: WorkspaceService, private readonly writer = new LocalWriteService(), private readonly payloads = new PendingWritePayloadStore(), private readonly grants = new ApprovedWriteExecutionGrantStore()) {}
  async prepare(taskId: string, input: WriteInput) {
    try {
      const task = await this.gateway.getTask(taskId); if (!task.ok) return task;
      const context = await this.workspace.getConfirmedWriteContext(task.data.projectId);
      const prepared = await this.writer.prepare(context.localPath, input.relativePath, input.content);
      const created = await this.gateway.createAgentRun(taskId, { name: 'write_file', relativePath: prepared.relativePath, payloadSize: prepared.payloadSize, payloadSha256: prepared.payloadSha256, effect: prepared.effect, ...(prepared.expectedCurrentSha256 ? { expectedCurrentSha256: prepared.expectedCurrentSha256 } : {}), deviceId: context.deviceId });
      if (!created.ok || !created.data.humanConfirmation || created.data.toolRequest.name !== 'write_file') return created.ok ? fail('HUMAN_CONFIRMATION_INVALID', 'Write confirmation was not created') : created;
      const detail = await this.gateway.getHumanConfirmation(created.data.humanConfirmation.id); if (!detail.ok) return detail;
      const request = created.data.toolRequest;
      if (!sameCreation(taskId, created.data.run, request, created.data.humanConfirmation, detail.data, context.deviceId, prepared)) return fail('HUMAN_CONFIRMATION_INVALID', 'Write confirmation provenance does not match pending operation');
      this.payloads.put({ confirmationId: detail.data.confirmation.id, agentRunId: created.data.run.id, toolCallId: request.id, userId: created.data.run.userId, projectId: created.data.run.projectId, taskId: created.data.run.taskId, deviceId: context.deviceId, relativePath: prepared.relativePath, payloadSize: prepared.payloadSize, payloadSha256: prepared.payloadSha256, effect: prepared.effect, ...(prepared.expectedCurrentSha256 ? { expectedCurrentSha256: prepared.expectedCurrentSha256 } : {}), content: input.content });
      return { ok: true as const, data: { run: created.data.run, confirmation: detail.data } satisfies SafeConfirmation };
    } catch { return fail('LOCAL_WRITE_PRECONDITION_FAILED', 'Unable to prepare confirmed local write'); }
  }
  async approve(confirmationId: string) {
    const pending = this.payloads.get(confirmationId); if (!pending) return fail('LOCAL_WRITE_PRECONDITION_FAILED', 'Write payload is unavailable');
    const [detail, current, context] = await Promise.all([this.gateway.getHumanConfirmation(confirmationId), this.gateway.getCurrentUser(), this.workspace.getConfirmedWriteContext(pending.projectId)]);
    if (!detail.ok || !current.ok) return !detail.ok ? detail : current;
    if (current.data.id !== pending.userId || context.deviceId !== pending.deviceId || !sameDetail(detail.data, pending)) return fail('LOCAL_PERMISSION_DENIED', 'Pending write provenance does not match current authorization');
    const approved = await this.gateway.approveHumanConfirmation(confirmationId); if (!approved.ok) return approved;
    const grant = approved.data.executionGrant; if (!grant) return { ok: true as const, data: { confirmation: approved.data.confirmation } };
    if (!sameGrant(grant, pending)) return fail('LOCAL_PERMISSION_DENIED', 'Approved write grant does not match pending operation');
    if (!this.grants.put(grant)) return fail('LOCAL_WRITE_PRECONDITION_FAILED', 'Write grant was already consumed');
    const oneShotGrant = this.grants.take(grant.toolCallId); const payload = this.payloads.take(confirmationId);
    if (!oneShotGrant || !payload) return fail('LOCAL_WRITE_PRECONDITION_FAILED', 'Write grant was already consumed');
    try { await this.writer.execute(context.localPath, oneShotGrant, payload.content); }
    catch {
      const completed = await this.gateway.completeAgentRun(oneShotGrant.agentRunId, failedReceipt(oneShotGrant.toolCallId));
      return completed.ok ? { ok: true as const, data: { confirmation: approved.data.confirmation, run: completed.data } } : completed;
    }
    const completed = await this.gateway.completeAgentRun(oneShotGrant.agentRunId, successReceipt(oneShotGrant));
    return completed.ok ? { ok: true as const, data: { confirmation: approved.data.confirmation, run: completed.data } } : completed;
  }
  async reject(confirmationId: string) { const result = await this.gateway.rejectHumanConfirmation(confirmationId); if (result.ok) this.payloads.remove(confirmationId); return result.ok ? { ok: true as const, data: { confirmation: result.data.confirmation } } : result; }
}
function sameDetail(detail: HumanConfirmationDetailContract, pending: Pick<PendingWritePayload, 'relativePath'|'payloadSize'|'payloadSha256'|'effect'>) { return detail.action === 'write_file' && detail.relativePath === pending.relativePath && detail.payloadSize === pending.payloadSize && detail.payloadSha256 === pending.payloadSha256 && detail.effect === pending.effect; }
function sameCreation(taskId: string, run: AgentRunContract, request: Extract<import('@enterprise-brain/contracts').AgentToolRequest, { name: 'write_file' }>, confirmation: HumanConfirmationContract, detail: HumanConfirmationDetailContract, deviceId: string, prepared: { relativePath: string; payloadSize: number; payloadSha256: string; effect: 'CREATE' | 'REPLACE'; expectedCurrentSha256?: string }) {
  const fieldsMatch = (value: HumanConfirmationContract) => value.agentRunId === run.id && value.toolCallId === request.id && value.userId === run.userId && value.projectId === run.projectId && value.taskId === run.taskId;
  return run.taskId === taskId && run.status === 'WAITING_HUMAN' && run.agentDefinitionKey === 'confirmed-write-work-agent-v1' && request.name === 'write_file' && request.runId === run.id && request.userId === run.userId && request.projectId === run.projectId && request.deviceId === deviceId && confirmation.status === 'PENDING' && confirmation.id === detail.confirmation.id && fieldsMatch(confirmation) && fieldsMatch(detail.confirmation) && sameDetail(detail, prepared) && request.relativePath === prepared.relativePath && request.payloadSize === prepared.payloadSize && request.payloadSha256 === prepared.payloadSha256 && request.effect === prepared.effect && request.expectedCurrentSha256 === prepared.expectedCurrentSha256;
}
function sameGrant(grant: ApprovedWriteExecutionGrant, pending: PendingWritePayload) { return grant.confirmationId === pending.confirmationId && grant.agentRunId === pending.agentRunId && grant.toolCallId === pending.toolCallId && grant.userId === pending.userId && grant.projectId === pending.projectId && grant.taskId === pending.taskId && grant.deviceId === pending.deviceId && grant.relativePath === pending.relativePath && grant.payloadSize === pending.payloadSize && grant.payloadSha256 === pending.payloadSha256 && grant.effect === pending.effect && grant.expectedCurrentSha256 === pending.expectedCurrentSha256; }
function successReceipt(g: ApprovedWriteExecutionGrant) { return { toolCallId: g.toolCallId, status: 'SUCCEEDED' as const, metadata: { relativePath: g.relativePath, size: g.payloadSize, encoding: 'utf-8' as const, sha256: g.payloadSha256, effect: g.effect } }; }
function failedReceipt(toolCallId: string) { return { toolCallId, status: 'FAILED' as const, error: { code: 'LOCAL_IO_ERROR', message: 'Confirmed local write failed', details: {} } }; }
function fail(code: string, message: string) { return { ok: false as const, error: { code, message, details: {} } }; }
