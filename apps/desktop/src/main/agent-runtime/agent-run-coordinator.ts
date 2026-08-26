import type { AgentToolIntent } from '@enterprise-brain/contracts';
import type { DesktopApiGateway } from '../desktop-api-gateway.js';
import { AgentToolExecutor } from './agent-tool-executor.js';
export class DesktopAgentRunCoordinator {
  constructor(
    private readonly gateway: DesktopApiGateway,
    private readonly executor: AgentToolExecutor
  ) {}
  async run(taskId: string, intent: AgentToolIntent) {
    const created = await this.gateway.createAgentRun(taskId, intent);
    if (!created.ok) return created;
    const executed = await this.executor.execute(created.data.toolRequest);
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
