import type { IpcMain } from 'electron';
import type { DesktopApiGateway } from './desktop-api-gateway.js';
import type { RuntimeInfo, TaskInput } from '../shared/enterprise-brain.js';
import {
  LocalCapabilityFailure,
  type LocalCapabilityError
} from './workspace/workspace-types.js';
import type { WorkspaceService } from './workspace/workspace-service.js';
import type { DesktopAgentRunCoordinator } from './agent-runtime/agent-run-coordinator.js';
import type { ConfirmedWriteCoordinator } from './agent-runtime/confirmed-write-coordinator.js';

export function registerRuntimeHandlers(
  ipc: Pick<IpcMain, 'handle'>,
  gateway: DesktopApiGateway,
  runtimeInfo: Omit<RuntimeInfo, 'runtime'>,
  workspace?: WorkspaceService,
  agents?: DesktopAgentRunCoordinator,
  confirmedWrites?: ConfirmedWriteCoordinator
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
  if (workspace) {
    ipc.handle('workspace:get', (_event, payload: { projectId: string }) =>
      handleWorkspace(() => workspace.get(payload.projectId))
    );
    ipc.handle('workspace:select', (_event, payload: { projectId: string }) =>
      handleWorkspace(() => workspace.select(payload.projectId))
    );
    ipc.handle('workspace:unbind', (_event, payload: { projectId: string }) =>
      handleWorkspace(() => workspace.unbind(payload.projectId))
    );
    ipc.handle(
      'workspace:list-directory',
      (_event, payload: { projectId: string; relativePath?: string }) =>
        handleWorkspace(() =>
          workspace.listDirectory(payload.projectId, payload.relativePath)
        )
    );
    ipc.handle(
      'workspace:read-file',
      (_event, payload: { projectId: string; relativePath: string }) =>
        handleWorkspace(() =>
          workspace.readFile(payload.projectId, payload.relativePath)
        )
    );
  }
  if (agents) {
    ipc.handle('agent-runs:run', (_event, payload) =>
      agents.run(payload.taskId, payload.intent)
    );
  }
  if (confirmedWrites) {
    ipc.handle('confirmed-writes:prepare', (_event, payload) => confirmedWrites.prepare(payload.taskId, payload.input));
    ipc.handle('confirmed-writes:approve', (_event, payload) => confirmedWrites.approve(payload.confirmationId));
    ipc.handle('confirmed-writes:reject', (_event, payload) => confirmedWrites.reject(payload.confirmationId));
  }
  ipc.handle('artifacts:register', (_event, payload: { agentRunId: string }) =>
    gateway.registerArtifact(payload.agentRunId)
  );
  ipc.handle('artifacts:list-for-task', (_event, payload: { taskId: string }) =>
    gateway.listArtifactsForTask(payload.taskId)
  );
  ipc.handle('results:create', (_event, payload: { taskId: string; artifactIds: string[] }) => gateway.createResult(payload.taskId, payload.artifactIds));
  ipc.handle('results:list-for-task', (_event, payload: { taskId: string }) => gateway.listResultsForTask(payload.taskId));
  ipc.handle('results:get', (_event, payload: { id: string }) => gateway.getResult(payload.id));
  ipc.handle('results:submit-review', (_event, payload: { id: string }) => gateway.submitResultForReview(payload.id));
}

async function handleWorkspace<T>(operation: () => Promise<T>) {
  try {
    return { ok: true as const, data: await operation() };
  } catch (error) {
    const local: LocalCapabilityError =
      error instanceof LocalCapabilityFailure
        ? error.error
        : {
            code: 'LOCAL_IO_ERROR',
            message: 'Local workspace operation failed',
            details: {}
          };
    return { ok: false as const, error: local };
  }
}
