import { describe, expect, it, vi } from 'vitest';
import type { AgentRunContract, ApprovedWriteExecutionGrant, HumanConfirmationContract, HumanConfirmationDetailContract } from '../../packages/contracts/src/index.js';
import { ConfirmedWriteCoordinator } from '../../apps/desktop/src/main/agent-runtime/confirmed-write-coordinator.js';
import { createEnterpriseBrainBridge } from '../../apps/desktop/src/shared/enterprise-brain.js';

const ids = { run: 'run', call: 'call', confirmation: 'confirmation', user: 'user', project: 'project', task: 'task', device: 'device', hash: 'a'.repeat(64) };
function detail(): HumanConfirmationDetailContract { return { confirmation: { id: ids.confirmation, agentRunId: ids.run, toolCallId: ids.call, userId: ids.user, projectId: ids.project, taskId: ids.task, status: 'PENDING', createdAt: 'now' }, action: 'write_file', relativePath: 'docs/file.md', effect: 'CREATE', payloadSize: 4, payloadSha256: ids.hash, risk: 'MEDIUM', reason: 'Employee requested local write', requiredPermission: 'LOCAL_CREATE' } as unknown as HumanConfirmationDetailContract; }
function run(): AgentRunContract { return { id: ids.run, userId: ids.user, projectId: ids.project, taskId: ids.task, agentDefinitionKey: 'confirmed-write-work-agent-v1', status: 'WAITING_HUMAN', createdAt: 'now', updatedAt: 'now' } as unknown as AgentRunContract; }
function grant(extra: Record<string, unknown> = {}): ApprovedWriteExecutionGrant { return { confirmationId: ids.confirmation, agentRunId: ids.run, toolCallId: ids.call, userId: ids.user, projectId: ids.project, taskId: ids.task, deviceId: ids.device, relativePath: 'docs/file.md', payloadSize: 4, payloadSha256: ids.hash, effect: 'CREATE', ...extra } as unknown as ApprovedWriteExecutionGrant; }
function setup() {
  const execute = vi.fn().mockResolvedValue(undefined);
  const completeAgentRun = vi.fn().mockResolvedValue({ ok: true, data: { ...run(), status: 'SUCCEEDED' } });
  const approveHumanConfirmation = vi.fn().mockResolvedValue({ ok: true, data: { confirmation: { ...detail().confirmation, status: 'APPROVED' }, executionGrant: grant() } });
  const rejectHumanConfirmation = vi.fn().mockResolvedValue({ ok: true, data: { confirmation: { ...detail().confirmation, status: 'REJECTED' } } });
  const gateway = { getTask: vi.fn().mockResolvedValue({ ok: true, data: { id: ids.task, projectId: ids.project } }), listAvailableAgents: vi.fn().mockResolvedValue({ok:true,data:[{id:'writer',runtimeProfile:'CONFIRMED_WRITE_WORK'}]}), createAgentRun: vi.fn().mockResolvedValue({ ok: true, data: { run: run(), toolRequest: { id: ids.call, runId: ids.run, userId: ids.user, projectId: ids.project, name: 'write_file', relativePath: 'docs/file.md', payloadSize: 4, payloadSha256: ids.hash, effect: 'CREATE', deviceId: ids.device }, humanConfirmation: detail().confirmation } }), getHumanConfirmation: vi.fn().mockResolvedValue({ ok: true, data: detail() }), getCurrentUser: vi.fn().mockResolvedValue({ ok: true, data: { id: ids.user } }), approveHumanConfirmation, rejectHumanConfirmation, completeAgentRun };
  const workspace = { getConfirmedWriteContext: vi.fn().mockResolvedValue({ localPath: '/workspace', deviceId: ids.device }) };
  const writer = { prepare: vi.fn().mockResolvedValue({ relativePath: 'docs/file.md', payloadSize: 4, payloadSha256: ids.hash, effect: 'CREATE' }), execute };
  return { coordinator: new ConfirmedWriteCoordinator(gateway as never, workspace as never, writer as never), gateway, execute, approveHumanConfirmation, rejectHumanConfirmation, completeAgentRun };
}
type CreationResponse = { data: { run: AgentRunContract; humanConfirmation: HumanConfirmationContract } };

describe('ConfirmedWriteCoordinator', () => {
  it('does not call approve when its Main-only pending payload is missing', async () => {
    const { coordinator, approveHumanConfirmation } = setup();
    await expect(coordinator.approve(ids.confirmation)).resolves.toMatchObject({ ok: false });
    expect(approveHumanConfirmation).not.toHaveBeenCalled();
  });
  it.each([
    ['wrong Task', (created: CreationResponse) => { created.data.run = { ...created.data.run, taskId: 'other-task' as never }; }],
    ['wrong Run status', (created: CreationResponse) => { created.data.run = { ...created.data.run, status: 'RUNNING' }; }],
    ['wrong Agent definition key', (created: CreationResponse) => { created.data.run = { ...created.data.run, agentDefinitionKey: 'read-only-work-agent-v1' }; }],
    ['non-pending confirmation', (created: CreationResponse) => { created.data.humanConfirmation = { ...created.data.humanConfirmation, status: 'APPROVED' }; }],
    ['mismatched confirmation identity', (created: CreationResponse) => { created.data.humanConfirmation = { ...created.data.humanConfirmation, id: 'other-confirmation' as never }; }]
  ])('fails closed for %s creation provenance without retaining a payload', async (_label, mutate) => {
    const { coordinator, gateway, execute, approveHumanConfirmation } = setup();
    const created = await gateway.createAgentRun();
    mutate(created);
    gateway.createAgentRun.mockResolvedValue(created);
    await expect(coordinator.prepare(ids.task, { relativePath: 'docs/file.md', content: 'text' })).resolves.toMatchObject({ ok: false, error: { code: 'HUMAN_CONFIRMATION_INVALID' } });
    await coordinator.approve(ids.confirmation);
    expect(execute).not.toHaveBeenCalled();
    expect(approveHumanConfirmation).not.toHaveBeenCalled();
  });
  it('fails closed on grant provenance mismatch without writing', async () => {
    const { coordinator, gateway, execute } = setup();
    await coordinator.prepare(ids.task, { relativePath: 'docs/file.md', content: 'text' });
    gateway.approveHumanConfirmation.mockResolvedValue({ ok: true, data: { confirmation: { ...detail().confirmation, status: 'APPROVED' }, executionGrant: grant({ deviceId: 'other-device' }) } });
    await expect(coordinator.approve(ids.confirmation)).resolves.toMatchObject({ ok: false });
    expect(execute).not.toHaveBeenCalled();
  });
  it('removes pending payload after reject and never writes it', async () => {
    const { coordinator, execute, approveHumanConfirmation } = setup();
    await coordinator.prepare(ids.task, { relativePath: 'docs/file.md', content: 'text' });
    await expect(coordinator.reject(ids.confirmation)).resolves.toMatchObject({ ok: true });
    await expect(coordinator.approve(ids.confirmation)).resolves.toMatchObject({ ok: false });
    expect(execute).not.toHaveBeenCalled();
    expect(approveHumanConfirmation).not.toHaveBeenCalled();
  });
  it('clears pending payloads and one-shot grant state at an authentication boundary', async () => {
    const { coordinator, approveHumanConfirmation, execute } = setup();
    await coordinator.prepare(ids.task, { relativePath: 'docs/file.md', content: 'text' });
    coordinator.clearSensitiveState();
    await expect(coordinator.approve(ids.confirmation)).resolves.toMatchObject({ ok: false });
    expect(approveHumanConfirmation).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
  });
  it('does not repeat a successful local mutation when backend completion fails', async () => {
    const { coordinator, execute, completeAgentRun } = setup();
    completeAgentRun.mockResolvedValue({ ok: false, error: { code: 'API_UNAVAILABLE', message: 'offline', details: {} } });
    await coordinator.prepare(ids.task, { relativePath: 'docs/file.md', content: 'text' });
    await expect(coordinator.approve(ids.confirmation)).resolves.toMatchObject({ ok: false, error: { code: 'API_UNAVAILABLE' } });
    await coordinator.approve(ids.confirmation);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('never returns grants or local provenance through the renderer bridge', async () => {
    const bridge = createEnterpriseBrainBridge(vi.fn().mockResolvedValue({ ok: true, data: { confirmation: detail().confirmation, executionGrant: grant(), deviceId: ids.device, localPath: '/workspace', content: 'text' } }));
    const result = await bridge.confirmedWrites.approve(ids.confirmation);
    expect(result).toEqual({ ok: true, data: { confirmation: detail().confirmation } });
  });
});
