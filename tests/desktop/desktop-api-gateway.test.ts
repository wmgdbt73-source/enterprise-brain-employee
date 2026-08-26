import { describe, expect, it, vi } from 'vitest';
import { DesktopApiGateway } from '../../apps/desktop/src/main/desktop-api-gateway.js';
import { createEnterpriseBrainBridge } from '../../apps/desktop/src/shared/enterprise-brain.js';
import { isAllowedTopLevelNavigation } from '../../apps/desktop/src/main/navigation-policy.js';
import { resolveOperation } from '../../apps/desktop/src/renderer/src/features/runtime/operation-state.js';
import { toTaskInput } from '../../apps/desktop/src/renderer/src/features/tasks/task-input.js';
import { AgentToolExecutor } from '../../apps/desktop/src/main/agent-runtime/agent-tool-executor.js';

describe('Desktop Work Runtime gateway', () => {
  it('uses fixed Project API method, path and JSON body', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 'project-1',
        name: 'Alpha',
        status: 'ACTIVE',
        createdAt: 'x',
        updatedAt: 'x'
      })
    });
    const gateway = new DesktopApiGateway({
      baseUrl: 'http://api.test',
      fetchImplementation
    });
    await expect(
      gateway.createProject({ name: 'Alpha', goal: 'Goal' })
    ).resolves.toMatchObject({ ok: true });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'http://api.test/projects',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Alpha', goal: 'Goal' })
      })
    );
  });
  it('preserves structured API errors and turns network failure into a recoverable error', async () => {
    const structured = new DesktopApiGateway({
      baseUrl: 'http://api.test',
      fetchImplementation: async () => ({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'INVALID_STATE_TRANSITION',
            message: 'Cannot start',
            details: {}
          }
        })
      })
    });
    await expect(structured.startTask('task-1')).resolves.toEqual({
      ok: false,
      error: {
        code: 'INVALID_STATE_TRANSITION',
        message: 'Cannot start',
        details: {}
      }
    });
    const offline = new DesktopApiGateway({
      baseUrl: 'http://api.test',
      fetchImplementation: async () => {
        throw new Error('offline');
      }
    });
    await expect(offline.listProjects()).resolves.toMatchObject({
      ok: false,
      error: { code: 'API_UNAVAILABLE' }
    });
  });
  it('exposes only the allowlisted preload bridge capabilities', () => {
    const invoke = vi.fn().mockResolvedValue({
      ok: true,
      data: { runtime: 'desktop', platform: 'darwin', appVersion: '1.0.0' }
    });
    const bridge = createEnterpriseBrainBridge(invoke);
    expect(Object.keys(bridge).sort()).toEqual([
      'agents',
      'projects',
      'runtime',
      'tasks',
      'workspace'
    ]);
    expect(Object.keys(bridge.agents)).toEqual(['run']);
    expect(Object.keys(bridge.projects).sort()).toEqual([
      'create',
      'get',
      'list'
    ]);
    expect(Object.keys(bridge.tasks).sort()).toEqual([
      'create',
      'get',
      'list',
      'start'
    ]);
    expect(Object.keys(bridge.workspace).sort()).toEqual([
      'get',
      'listDirectory',
      'readFile',
      'select',
      'unbind'
    ]);
    expect(bridge).not.toHaveProperty('invoke');
    void bridge.runtime.getInfo();
    expect(invoke).toHaveBeenCalledWith('runtime:get-info');
  });
  it('clears a recoverable error after a successful retry result', () => {
    expect(resolveOperation({ ok: true, data: ['project-1'] })).toEqual({
      data: ['project-1'],
      error: undefined
    });
    expect(
      resolveOperation({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Missing', details: {} }
      })
    ).toEqual({
      error: { code: 'NOT_FOUND', message: 'Missing', details: {} }
    });
  });
  it('transforms Task form criteria and deadline into the API contract', () => {
    const input = {
      title: 'Task',
      description: 'Note',
      priority: 'P1' as const,
      acceptanceCriteria: 'One\n\n Two ',
      deadline: '2026-09-01T10:00'
    };
    expect(toTaskInput(input)).toEqual({
      title: 'Task',
      description: 'Note',
      priority: 'P1',
      acceptanceCriteria: ['One', 'Two'],
      deadline: new Date(input.deadline).toISOString()
    });
  });
  it('allows only configured renderer navigation and packaged files', () => {
    expect(
      isAllowedTopLevelNavigation(
        'http://127.0.0.1:5173/',
        'http://127.0.0.1:5173'
      )
    ).toBe(true);
    expect(
      isAllowedTopLevelNavigation(
        'https://example.com',
        'http://127.0.0.1:5173'
      )
    ).toBe(false);
    expect(
      isAllowedTopLevelNavigation(
        'http://127.0.0.1:5173@evil.example/',
        'http://127.0.0.1:5173'
      )
    ).toBe(false);
    expect(
      isAllowedTopLevelNavigation('not a valid url', 'http://127.0.0.1:5173')
    ).toBe(false);
    expect(
      isAllowedTopLevelNavigation(
        'file:///app/renderer/index.html',
        undefined,
        'file:///app/renderer/index.html'
      )
    ).toBe(true);
    expect(
      isAllowedTopLevelNavigation(
        'file:///other.html',
        undefined,
        'file:///app/renderer/index.html'
      )
    ).toBe(false);
  });
  it('keeps complete local file results out of the server completion receipt', async () => {
    const executor = new AgentToolExecutor({
      readFile: async () => ({
        relativePath: 'brief.md',
        content: 'private text',
        size: 12,
        encoding: 'utf-8'
      })
    } as never);
    const result = await executor.execute({
      id: 'call',
      runId: 'run',
      userId: 'user',
      projectId: 'project',
      name: 'read_file',
      relativePath: 'brief.md'
    });
    expect(result.localResult).toMatchObject({ content: 'private text' });
    expect(result.receipt).toMatchObject({
      status: 'SUCCEEDED',
      metadata: { relativePath: 'brief.md', size: 12 }
    });
    expect(JSON.stringify(result.receipt)).not.toContain('private text');
  });
});
