import type { IpcMain } from 'electron';
import type { DesktopApiGateway } from './desktop-api-gateway.js';
import type { RuntimeInfo, TaskInput } from '../shared/enterprise-brain.js';

export function registerRuntimeHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  gateway: DesktopApiGateway,
  runtimeInfo: Omit<RuntimeInfo, 'runtime'>
): void {
  ipc.handle('runtime:get-info', () => ({
    ok: true,
    data: { runtime: 'desktop', ...runtimeInfo }
  }));
  ipc.handle('projects:list', () => gateway.listProjects());
  ipc.handle('projects:get', (_event, payload: { id: string }) =>
    gateway.getProject(payload.id)
  );
  ipc.handle('projects:create', (_event, payload) =>
    gateway.createProject(payload)
  );
  ipc.handle('tasks:list', (_event, payload: { projectId: string }) =>
    gateway.listTasks(payload.projectId)
  );
  ipc.handle('tasks:get', (_event, payload: { id: string }) =>
    gateway.getTask(payload.id)
  );
  ipc.handle(
    'tasks:create',
    (_event, payload: { projectId: string; input: TaskInput }) =>
      gateway.createTask(payload.projectId, payload.input)
  );
  ipc.handle('tasks:start', (_event, payload: { id: string }) =>
    gateway.startTask(payload.id)
  );
}
