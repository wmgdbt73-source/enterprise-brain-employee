import type { AgentToolIntent } from '@enterprise-brain/contracts';
import type { DesktopApiGateway } from '../desktop-api-gateway.js';
import { AgentToolExecutor } from './agent-tool-executor.js';
export class DesktopAgentRunCoordinator {
  constructor(
    private readonly gateway: DesktopApiGateway,
    private readonly executor: AgentToolExecutor
  ) {}
  async run(taskId: string, intent: AgentToolIntent) {
    if (intent.name === 'write_file')
      return { ok: false as const, error: { code: 'AGENT_TOOL_REQUEST_INVALID', message: 'write_file requires the confirmed write workflow', details: {} } };
    const created = await this.gateway.createAgentRun(taskId, intent);
    if (!created.ok) return created;
    const request = created.data.toolRequest;
    if (request.runId !== created.data.run.id || request.userId !== created.data.run.userId || request.projectId !== created.data.run.projectId) return { ok: false as const, error: { code: 'AGENT_TOOL_REQUEST_INVALID', message: 'ToolRequest scope does not match AgentRun', details: {} } };
    const executed = await this.executor.execute(request);
    const completed = await this.gateway.completeAgentRun(
      created.data.run.id,
      executed.receipt
    );
    return completed.ok
      ? {
          ok: true as const,
          data: { run: completed.data, localResult: executed.localResult }
        }
      : completed;
  }
}
