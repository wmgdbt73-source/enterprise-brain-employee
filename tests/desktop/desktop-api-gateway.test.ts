import { describe, expect, it, vi } from 'vitest';
import { DesktopApiGateway } from '../../apps/desktop/src/main/desktop-api-gateway.js';
import { createEnterpriseBrainBridge } from '../../apps/desktop/src/shared/enterprise-brain.js';
import { isAllowedTopLevelNavigation } from '../../apps/desktop/src/main/navigation-policy.js';
import { resolveOperation } from '../../apps/desktop/src/renderer/src/features/runtime/operation-state.js';
import { toTaskInput } from '../../apps/desktop/src/renderer/src/features/tasks/task-input.js';
import { AgentToolExecutor } from '../../apps/desktop/src/main/agent-runtime/agent-tool-executor.js';
import { DesktopAgentRunCoordinator } from '../../apps/desktop/src/main/agent-runtime/agent-run-coordinator.js';

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
  it('keeps the bearer token in Main gateway memory and never returns it to the bridge caller', async () => {
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: 'secret-token-value', user: { id: 'user-1', name: 'User', systemRole: 'EMPLOYEE' } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'user-1', name: 'User', systemRole: 'EMPLOYEE' }) });
    const gateway = new DesktopApiGateway({ baseUrl: 'http://api.test', fetchImplementation });
    await expect(gateway.login({ login: 'user@example.test', password: 'password' })).resolves.toEqual({ ok: true, data: { id: 'user-1', name: 'User', systemRole: 'EMPLOYEE' } });
    await gateway.getCurrentUser();
    expect(fetchImplementation.mock.calls[1][1].headers).toMatchObject({ authorization: 'Bearer secret-token-value' });
  });
  it('binds late login, logout, and 401 token mutation to the active auth generation', async () => {
    type DeferredResponse = { ok: boolean; status: number; json(): Promise<unknown> };
    let resolveOldRequest!: (value: DeferredResponse) => void;
    const oldRequest = new Promise<DeferredResponse>((resolve) => { resolveOldRequest = resolve; });
    const fetchImplementation = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: 'old-token-value-abcdefghijklmnopqrstuvwxyz', user: { id: 'old', name: 'Old', systemRole: 'EMPLOYEE' } }) })
      .mockImplementationOnce(() => oldRequest)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: 'new-token-value-abcdefghijklmnopqrstuvwxyz', user: { id: 'new', name: 'New', systemRole: 'EMPLOYEE' } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'new', name: 'New', systemRole: 'EMPLOYEE' } ) });
    const gateway = new DesktopApiGateway({ baseUrl: 'http://api.test', fetchImplementation });
    await gateway.login({ login: 'old', password: 'x' });
    const staleProtected = gateway.getCurrentUser();
    await gateway.login({ login: 'new', password: 'x' });
    resolveOldRequest({ ok: false, status: 401, json: async () => ({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required', details: {} } }) });
    await staleProtected;
    await gateway.getCurrentUser();
    expect(fetchImplementation.mock.calls[3][1].headers).toMatchObject({ authorization: 'Bearer new-token-value-abcdefghijklmnopqrstuvwxyz' });
  });
  it('does not install a delayed older login after a newer login succeeds', async () => {
    type DeferredResponse = { ok: boolean; status: number; json(): Promise<unknown> };
    let resolveOld!: (value: DeferredResponse) => void;
    const old = new Promise<DeferredResponse>((resolve) => { resolveOld = resolve; });
    const fetchImplementation = vi.fn()
      .mockImplementationOnce(() => old)
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: 'new-token-value-abcdefghijklmnopqrstuvwxyz', user: { id: 'new', name: 'New', systemRole: 'EMPLOYEE' } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 'new', name: 'New', systemRole: 'EMPLOYEE' } ) });
    const gateway = new DesktopApiGateway({ baseUrl: 'http://api.test', fetchImplementation });
    const stale = gateway.login({ login: 'old', password: 'x' });
    await gateway.login({ login: 'new', password: 'x' });
    resolveOld({ ok: true, status: 200, json: async () => ({ token: 'old-token-value-abcdefghijklmnopqrstuvwxyz', user: { id: 'old', name: 'Old', systemRole: 'EMPLOYEE' } }) });
    await stale;
    await gateway.getCurrentUser();
    expect(fetchImplementation.mock.calls[2][1].headers).toMatchObject({ authorization: 'Bearer new-token-value-abcdefghijklmnopqrstuvwxyz' });
  });
  it('exposes only the allowlisted preload bridge capabilities', () => {
    const invoke = vi.fn().mockResolvedValue({
      ok: true,
      data: { runtime: 'desktop', platform: 'darwin', appVersion: '1.0.0' }
    });
    const bridge = createEnterpriseBrainBridge(invoke);
    expect(Object.keys(bridge).sort()).toEqual([
      'agents',
      'artifacts',
      'auth',
      'confirmedWrites',
      'projects',
      'results',
      'runtime',
      'tasks',
      'workspace'
    ]);
    expect(Object.keys(bridge.agents)).toEqual(['run']);
    expect(Object.keys(bridge.confirmedWrites).sort()).toEqual(['approve', 'prepare', 'reject']);
    expect(Object.keys(bridge.artifacts).sort()).toEqual([
      'listForTask',
      'register'
    ]);
    expect(Object.keys(bridge.results).sort()).toEqual(['create', 'decide', 'get', 'listReviews', 'submitReview']);
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
    const executor = new AgentToolExecutor(
      {
        readFile: async () => ({
          relativePath: 'brief.md',
          content: 'private text',
          size: 12,
          encoding: 'utf-8'
        })
      } as never,
      {
        getCurrentUser: async () => ({ ok: true, data: { id: 'user' } })
      } as never
    );
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
  it('uses fixed Artifact API methods without arbitrary HTTP access', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 'artifact-1' })
    });
    const gateway = new DesktopApiGateway({
      baseUrl: 'http://api.test',
      fetchImplementation
    });
    await gateway.registerArtifact('run-1');
    expect(fetchImplementation).toHaveBeenCalledWith(
      'http://api.test/artifacts',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ agentRunId: 'run-1' })
      })
    );
  });
  it('uses a fixed Result candidate API path and forwards only the typed idempotency key', async () => {
    const fetchImplementation = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'result-1' }) });
    const gateway = new DesktopApiGateway({ baseUrl: 'http://api.test', fetchImplementation });
    await gateway.createResult('task-1', ['artifact-1'], '00000000-0000-4000-8000-000000000001');
    expect(fetchImplementation).toHaveBeenCalledWith('http://api.test/tasks/task-1/results', expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'idempotency-key': '00000000-0000-4000-8000-000000000001' }), body: JSON.stringify({ artifactIds: ['artifact-1'] }) }));
  });
  it('rejects generic write_file execution before any backend create call', async () => {
    const createAgentRun = vi.fn();
    const gateway = { createAgentRun } as never;
    const coordinator = new DesktopAgentRunCoordinator(gateway, {} as never);
    await expect(coordinator.run('task', { name: 'write_file', relativePath: 'a.md', payloadSize: 0, payloadSha256: 'a'.repeat(64), effect: 'CREATE', deviceId: 'device' })).resolves.toMatchObject({ ok: false, error: { code: 'AGENT_TOOL_REQUEST_INVALID' } });
    expect(createAgentRun).not.toHaveBeenCalled();
  });
});
