import type {
  AgentRunContract,
  AgentToolCompletionReceipt,
  AgentToolIntent,
  AgentToolRequest,
  ArtifactContract,
  ResultContract, ReviewContract, ReviewDecision,
  CurrentUserContract,
  LoginRequest,
  HumanConfirmationContract,
  HumanConfirmationDetailContract,
  ApprovedWriteExecutionGrant,
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
  private bearerToken: string | undefined;
  private authGeneration = 0;
  constructor(
    private readonly options: {
      baseUrl: string;
      fetchImplementation?: FetchImplementation;
      onAuthenticationLost?: () => void;
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
  async login(input: LoginRequest): Promise<DesktopResult<CurrentUserContract>> {
    const generation = ++this.authGeneration;
    const result = await this.request('/auth/login', { method: 'POST', body: input, includeAuthorization: false });
    if (!result.ok) return result;
    const payload = result.data as { token?: unknown; user?: CurrentUserContract };
    if (typeof payload.token !== 'string' || !payload.user) return { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Invalid login response', details: {} } };
    // An earlier login response must never replace a newer session.
    if (generation !== this.authGeneration) return { ok: false, error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required', details: {} } };
    this.bearerToken = payload.token;
    return { ok: true, data: payload.user };
  }
  async logout(): Promise<DesktopResult<void>> {
    const token = this.bearerToken;
    // Invalidate synchronously: late requests/logouts cannot affect a later login.
    ++this.authGeneration;
    this.bearerToken = undefined;
    const result = await this.request('/auth/logout', { method: 'POST', includeAuthorization: false, authorizationToken: token });
    return result.ok ? { ok: true, data: undefined } : result;
  }
  getCurrentUser(): Promise<DesktopResult<CurrentUserContract>> {
    return this.request('/me') as Promise<DesktopResult<CurrentUserContract>>;
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
  createAgentRun(
    taskId: string,
    intent: AgentToolIntent
  ): Promise<DesktopResult<{ run: AgentRunContract; toolRequest: AgentToolRequest; humanConfirmation?: HumanConfirmationContract }>> {
    return this.request(`/tasks/${encodeURIComponent(taskId)}/agent-runs`, {
      method: 'POST',
      body: intent
    }) as Promise<
      DesktopResult<{ run: AgentRunContract; toolRequest: AgentToolRequest; humanConfirmation?: HumanConfirmationContract }>
    >;
  }
  getHumanConfirmation(id: string): Promise<DesktopResult<HumanConfirmationDetailContract>> {
    return this.request(`/human-confirmations/${encodeURIComponent(id)}`) as Promise<DesktopResult<HumanConfirmationDetailContract>>;
  }
  approveHumanConfirmation(id: string): Promise<DesktopResult<{ confirmation: HumanConfirmationContract; executionGrant?: ApprovedWriteExecutionGrant }>> {
    return this.request(`/human-confirmations/${encodeURIComponent(id)}/approve`, { method: 'POST' }) as Promise<DesktopResult<{ confirmation: HumanConfirmationContract; executionGrant?: ApprovedWriteExecutionGrant }>>;
  }
  rejectHumanConfirmation(id: string): Promise<DesktopResult<{ confirmation: HumanConfirmationContract }>> {
    return this.request(`/human-confirmations/${encodeURIComponent(id)}/reject`, { method: 'POST' }) as Promise<DesktopResult<{ confirmation: HumanConfirmationContract }>>;
  }
  completeAgentRun(
    runId: string,
    receipt: AgentToolCompletionReceipt
  ): Promise<DesktopResult<AgentRunContract>> {
    return this.request(
      `/agent-runs/${encodeURIComponent(runId)}/tool-results`,
      {
        method: 'POST',
        body: receipt
      }
    ) as Promise<DesktopResult<AgentRunContract>>;
  }
  registerArtifact(
    agentRunId: string
  ): Promise<DesktopResult<ArtifactContract>> {
    return this.request('/artifacts', {
      method: 'POST',
      body: { agentRunId }
    }) as Promise<DesktopResult<ArtifactContract>>;
  }
  listArtifactsForTask(
    taskId: string
  ): Promise<DesktopResult<ArtifactContract[]>> {
    return this.request(`/tasks/${encodeURIComponent(taskId)}/artifacts`).then(
      (result) =>
        result.ok
          ? {
              ok: true,
              data: (result.data as { artifacts: ArtifactContract[] }).artifacts
            }
          : result
    );
  }
  createResult(taskId: string, artifactIds: string[], idempotencyKey: string): Promise<DesktopResult<ResultContract>> {
    return this.request(`/tasks/${encodeURIComponent(taskId)}/results`, { method: 'POST', body: { artifactIds }, headers: { 'idempotency-key': idempotencyKey } }) as Promise<DesktopResult<ResultContract>>;
  }
  getResult(id: string): Promise<DesktopResult<ResultContract>> {
    return this.request(`/results/${encodeURIComponent(id)}`) as Promise<DesktopResult<ResultContract>>;
  }
  submitResultForReview(id: string): Promise<DesktopResult<ResultContract>> {
    return this.request(`/results/${encodeURIComponent(id)}/submit-review`, { method: 'POST', body: {} }) as Promise<DesktopResult<ResultContract>>;
  }
  createReview(id: string, decision: ReviewDecision, comment?: string): Promise<DesktopResult<ReviewContract>> {
    return this.request(`/results/${encodeURIComponent(id)}/reviews`, { method: 'POST', body: { decision, ...(comment ? { comment } : {}) } }) as Promise<DesktopResult<ReviewContract>>;
  }
  listReviews(id: string): Promise<DesktopResult<ReviewContract[]>> {
    return this.request(`/results/${encodeURIComponent(id)}/reviews`).then((result) => result.ok ? { ok: true, data: (result.data as { reviews: ReviewContract[] }).reviews } : result);
  }
  private async request(
    path: string,
    options: { method?: 'POST'; body?: unknown; headers?: Record<string, string>; includeAuthorization?: boolean; authorizationToken?: string } = {}
  ): Promise<DesktopResult<unknown>> {
    const generation = this.authGeneration;
    const token = options.authorizationToken ?? this.bearerToken;
    try {
      const response = await (this.options.fetchImplementation ?? fetch)(
        new URL(path, this.options.baseUrl).toString(),
        {
          method: options.method ?? 'GET',
          headers: {
            ...(options.body ? { 'content-type': 'application/json' } : {}),
            ...(options.includeAuthorization !== false && token ? { authorization: `Bearer ${token}` } : {}),
            ...options.headers
          },
          body: options.body ? JSON.stringify(options.body) : undefined
        }
      );
      const payload = await response.json();
      if (response.ok) return { ok: true, data: payload };
      if (response.status === 401 && generation === this.authGeneration && token === this.bearerToken) {
        this.bearerToken = undefined;
        ++this.authGeneration;
        this.options.onAuthenticationLost?.();
      }
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
