import { describe, expect, it, vi } from 'vitest';
import { DesktopApiGateway } from '../../apps/desktop/src/main/desktop-api-gateway.js';
import { createEnterpriseBrainBridge } from '../../apps/desktop/src/shared/enterprise-brain.js';

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
    const bridge = createEnterpriseBrainBridge(vi.fn());
    expect(Object.keys(bridge).sort()).toEqual([
      'projects',
      'runtime',
      'tasks'
    ]);
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
    expect(bridge).not.toHaveProperty('invoke');
  });
});
