import { describe, expect, it } from 'vitest';
import {
  asAgentRunId,
  asProjectId,
  asTaskId,
  asUserId,
  createAgentRun,
  failAgentRun,
  startAgentRun,
  succeedAgentRun
} from '../../packages/domain/src/index.js';

const input = {
  id: asAgentRunId('run'),
  userId: asUserId('user'),
  projectId: asProjectId('project'),
  taskId: asTaskId('task'),
  agentDefinitionKey: 'read-only-work-agent-v1' as const,
  intent: { name: 'list_directory' as const, relativePath: '' }
};
describe('AgentRun state machine', () => {
  it('runs only QUEUED to RUNNING to terminal success or failure', () => {
    const queued = createAgentRun(input, new Date('2026-08-26T00:00:00.000Z'));
    const running = startAgentRun(queued, new Date('2026-08-26T00:01:00.000Z'));
    expect(succeedAgentRun(running, new Date()).status).toBe('SUCCEEDED');
    expect(failAgentRun(running, new Date()).status).toBe('FAILED');
    expect(() => startAgentRun(running, new Date())).toThrow(
      'Invalid AgentRun transition'
    );
  });
});
