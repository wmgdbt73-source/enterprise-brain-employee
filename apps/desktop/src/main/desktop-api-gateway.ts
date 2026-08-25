import type {
  ProjectContract,
  TaskContract
} from '@enterprise-brain/contracts';
import type {
  DesktopApiError,
  DesktopResult,
  ProjectInput,
  TaskInput
} from '../shared/enterprise-brain.js';

export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchImplementation = (
  input: string,
  init?: RequestInit
) => Promise<FetchResponse>;

export class DesktopApiGateway {
  constructor(
    private readonly options: {
      baseUrl: string;
      fetchImplementation?: FetchImplementation;
    }
  ) {}
  listProjects(): Promise<DesktopResult<ProjectContract[]>> {
    return this.request('/projects').then((result) =>
      result.ok
        ? {
            ok: true,
            data: (result.data as { projects: ProjectContract[] }).projects
          }
        : result
    );
  }
  getProject(id: string): Promise<DesktopResult<ProjectContract>> {
    return this.request(`/projects/${encodeURIComponent(id)}`) as Promise<
      DesktopResult<ProjectContract>
    >;
  }
  createProject(input: ProjectInput): Promise<DesktopResult<ProjectContract>> {
    return this.request('/projects', {
      method: 'POST',
      body: input
    }) as Promise<DesktopResult<ProjectContract>>;
  }
  listTasks(projectId: string): Promise<DesktopResult<TaskContract[]>> {
    return this.request(
      `/projects/${encodeURIComponent(projectId)}/tasks`
    ).then((result) =>
      result.ok
        ? { ok: true, data: (result.data as { tasks: TaskContract[] }).tasks }
        : result
    );
  }
  getTask(id: string): Promise<DesktopResult<TaskContract>> {
    return this.request(`/tasks/${encodeURIComponent(id)}`) as Promise<
      DesktopResult<TaskContract>
    >;
  }
  createTask(
    projectId: string,
    input: TaskInput
  ): Promise<DesktopResult<TaskContract>> {
    return this.request(`/projects/${encodeURIComponent(projectId)}/tasks`, {
      method: 'POST',
      body: input
    }) as Promise<DesktopResult<TaskContract>>;
  }
  startTask(id: string): Promise<DesktopResult<TaskContract>> {
    return this.request(`/tasks/${encodeURIComponent(id)}/start`, {
      method: 'POST'
    }) as Promise<DesktopResult<TaskContract>>;
  }
  private async request(
    path: string,
    options: { method?: 'POST'; body?: unknown } = {}
  ): Promise<DesktopResult<unknown>> {
    try {
      const response = await (this.options.fetchImplementation ?? fetch)(
        new URL(path, this.options.baseUrl).toString(),
        {
          method: options.method ?? 'GET',
          headers: options.body
            ? { 'content-type': 'application/json' }
            : undefined,
          body: options.body ? JSON.stringify(options.body) : undefined
        }
      );
      const payload = await response.json();
      if (response.ok) return { ok: true, data: payload };
      return { ok: false, error: toApiError(payload, response.status) };
    } catch {
      return {
        ok: false,
        error: {
          code: 'API_UNAVAILABLE',
          message:
            'Unable to connect to Employee API. Start the API and retry.',
          details: {}
        }
      };
    }
  }
}
function toApiError(payload: unknown, status: number): DesktopApiError {
  if (typeof payload === 'object' && payload !== null && 'error' in payload) {
    const error = payload.error;
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      'message' in error
    ) {
      const errorRecord = error as Record<string, unknown>;
      return {
        code: String(errorRecord.code),
        message: String(errorRecord.message),
        details:
          typeof errorRecord.details === 'object' &&
          errorRecord.details !== null
            ? (errorRecord.details as Record<string, unknown>)
            : {}
      };
    }
  }
  return {
    code: `HTTP_${status}`,
    message: 'Employee API request failed.',
    details: {}
  };
}
