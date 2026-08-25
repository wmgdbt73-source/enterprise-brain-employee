import type {
  ProjectContract,
  TaskContract,
  TaskPriority
} from '@enterprise-brain/contracts';

export interface RuntimeInfo {
  runtime: 'desktop';
  platform: string;
  appVersion: string;
}

export interface ProjectInput {
  name: string;
  goal?: string;
}

export interface TaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  acceptanceCriteria?: string[];
  deadline?: string;
}

export interface DesktopApiError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

export type DesktopResult<T> =
  { ok: true; data: T } | { ok: false; error: DesktopApiError };

export interface EnterpriseBrainBridge {
  runtime: { getInfo(): Promise<DesktopResult<RuntimeInfo>> };
  projects: {
    list(): Promise<DesktopResult<ProjectContract[]>>;
    get(id: string): Promise<DesktopResult<ProjectContract>>;
    create(input: ProjectInput): Promise<DesktopResult<ProjectContract>>;
  };
  tasks: {
    list(projectId: string): Promise<DesktopResult<TaskContract[]>>;
    get(id: string): Promise<DesktopResult<TaskContract>>;
    create(
      projectId: string,
      input: TaskInput
    ): Promise<DesktopResult<TaskContract>>;
    start(id: string): Promise<DesktopResult<TaskContract>>;
  };
}

type Invoke = (channel: string, payload?: unknown) => Promise<unknown>;

export function createEnterpriseBrainBridge(
  invoke: Invoke
): EnterpriseBrainBridge {
  return {
    runtime: {
      getInfo: () =>
        invoke('runtime:get-info') as Promise<DesktopResult<RuntimeInfo>>
    },
    projects: {
      list: () =>
        invoke('projects:list') as Promise<DesktopResult<ProjectContract[]>>,
      get: (id) =>
        invoke('projects:get', { id }) as Promise<
          DesktopResult<ProjectContract>
        >,
      create: (input) =>
        invoke('projects:create', input) as Promise<
          DesktopResult<ProjectContract>
        >
    },
    tasks: {
      list: (projectId) =>
        invoke('tasks:list', { projectId }) as Promise<
          DesktopResult<TaskContract[]>
        >,
      get: (id) =>
        invoke('tasks:get', { id }) as Promise<DesktopResult<TaskContract>>,
      create: (projectId, input) =>
        invoke('tasks:create', { projectId, input }) as Promise<
          DesktopResult<TaskContract>
        >,
      start: (id) =>
        invoke('tasks:start', { id }) as Promise<DesktopResult<TaskContract>>
    }
  };
}

declare global {
  interface Window {
    enterpriseBrain: EnterpriseBrainBridge;
  }
}
