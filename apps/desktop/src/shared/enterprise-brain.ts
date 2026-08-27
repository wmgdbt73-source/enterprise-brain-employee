import type {
  AgentRunContract,
  ReadOnlyAgentToolIntent,
  ArtifactContract,
  HumanConfirmationContract,
  HumanConfirmationDetailContract,
  LocalPermission,
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

export interface WorkspaceBindingView {
  id: string;
  userId: string;
  projectId: string;
  localPath: string;
  permissions: LocalPermission[];
  createdAt: string;
  updatedAt: string;
}
export interface DirectoryListing {
  path: string;
  entries: Array<{
    name: string;
    relativePath: string;
    kind: 'FILE' | 'DIRECTORY' | 'SYMLINK';
  }>;
}
export interface TextFile {
  relativePath: string;
  content: string;
  size: number;
  encoding: 'utf-8';
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
  workspace: {
    get(projectId: string): Promise<DesktopResult<WorkspaceBindingView | null>>;
    select(
      projectId: string
    ): Promise<
      DesktopResult<{ cancelled: boolean; binding?: WorkspaceBindingView }>
    >;
    unbind(projectId: string): Promise<DesktopResult<void>>;
    listDirectory(
      projectId: string,
      relativePath?: string
    ): Promise<DesktopResult<DirectoryListing>>;
    readFile(
      projectId: string,
      relativePath: string
    ): Promise<DesktopResult<TextFile>>;
  };
  agents: {
    run(
      taskId: string,
      intent: ReadOnlyAgentToolIntent
    ): Promise<DesktopResult<{ run: AgentRunContract; localResult?: unknown }>>;
  };
  artifacts: {
    register(agentRunId: string): Promise<DesktopResult<ArtifactContract>>;
    listForTask(taskId: string): Promise<DesktopResult<ArtifactContract[]>>;
  };
  confirmedWrites: {
    prepare(taskId: string, input: { relativePath: string; content: string }): Promise<DesktopResult<{ run: AgentRunContract; confirmation: HumanConfirmationDetailContract }>>;
    approve(confirmationId: string): Promise<DesktopResult<{ confirmation: HumanConfirmationContract; run?: AgentRunContract }>>;
    reject(confirmationId: string): Promise<DesktopResult<{ confirmation: HumanConfirmationContract }>>;
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
    },
    workspace: {
      get: (projectId) =>
        invoke('workspace:get', { projectId }) as Promise<
          DesktopResult<WorkspaceBindingView | null>
        >,
      select: (projectId) =>
        invoke('workspace:select', { projectId }) as Promise<
          DesktopResult<{ cancelled: boolean; binding?: WorkspaceBindingView }>
        >,
      unbind: (projectId) =>
        invoke('workspace:unbind', { projectId }) as Promise<
          DesktopResult<void>
        >,
      listDirectory: (projectId, relativePath = '') =>
        invoke('workspace:list-directory', {
          projectId,
          relativePath
        }) as Promise<DesktopResult<DirectoryListing>>,
      readFile: (projectId, relativePath) =>
        invoke('workspace:read-file', { projectId, relativePath }) as Promise<
          DesktopResult<TextFile>
        >
    },
    agents: {
      run: (taskId, intent) =>
        invoke('agent-runs:run', { taskId, intent }) as Promise<
          DesktopResult<{ run: AgentRunContract; localResult?: unknown }>
        >
    },
    artifacts: {
      register: (agentRunId) =>
        invoke('artifacts:register', { agentRunId }) as Promise<
          DesktopResult<ArtifactContract>
        >,
      listForTask: (taskId) =>
        invoke('artifacts:list-for-task', { taskId }) as Promise<
          DesktopResult<ArtifactContract[]>
        >
    }
    ,confirmedWrites: {
      prepare: (taskId, input) => invoke('confirmed-writes:prepare', { taskId, input }) as Promise<DesktopResult<{ run: AgentRunContract; confirmation: HumanConfirmationDetailContract }>>,
      approve: async (confirmationId) => {
        const result = await invoke('confirmed-writes:approve', { confirmationId }) as DesktopResult<{ confirmation: HumanConfirmationContract; run?: AgentRunContract }>;
        return result.ok ? { ok: true as const, data: { confirmation: result.data.confirmation, ...(result.data.run ? { run: result.data.run } : {}) } } : result;
      },
      reject: (confirmationId) => invoke('confirmed-writes:reject', { confirmationId }) as Promise<DesktopResult<{ confirmation: HumanConfirmationContract }>>
    }
  };
}

declare global {
  interface Window {
    enterpriseBrain: EnterpriseBrainBridge;
  }
}
