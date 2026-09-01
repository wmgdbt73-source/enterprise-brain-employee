import type {
  AgentAssignmentContract,
  AgentAssignmentScopeType,
  AgentDefinitionContract,
  AgentRuntimeProfile,
  CurrentUserContract,
  DepartmentContract,
  DepartmentMemberContract,
  DepartmentRole,
  EmployeeDirectoryEntryContract,
  LoginResponse,
  OrganizationContract,
  PermissionAction,
  PermissionEffect,
  PermissionOverrideContract,
  PermissionResource,
  PermissionScopeType
} from '@enterprise-brain/contracts';

export class AdminApiError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}

type TokenSource = () => string;
type AuthenticationLoss = () => void;

export class AdminApiClient {
  private readonly baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';

  constructor(private readonly token: TokenSource, private readonly onAuthenticationLoss: AuthenticationLoss) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.token();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers }
    });
    if (response.status === 401) {
      this.onAuthenticationLoss();
      throw new AdminApiError('AUTHENTICATION_REQUIRED', 'Your session has ended.');
    }
    if (!response.ok) {
      const body = await response.json().catch(() => undefined) as { error?: { code?: string; message?: string } } | undefined;
      throw new AdminApiError(body?.error?.code ?? `HTTP_${response.status}`, body?.error?.message ?? 'Request failed.');
    }
    return response.status === 204 ? undefined as T : response.json() as Promise<T>;
  }

  login(login: string, password: string) { return this.request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ login, password }) }); }
  logout() { return this.request<{ revoked: boolean }>('/auth/logout', { method: 'POST' }); }
  me() { return this.request<CurrentUserContract>('/me'); }
  organization() { return this.request<OrganizationContract>('/organization'); }
  async employees() { return (await this.request<{ employees: EmployeeDirectoryEntryContract[] }>('/employees')).employees; }
  async departments() { return (await this.request<{ departments: DepartmentContract[] }>('/departments')).departments; }
  createDepartment(name: string) { return this.request<DepartmentContract>('/departments', { method: 'POST', body: JSON.stringify({ name }) }); }
  async departmentMembers(id: string) { return (await this.request<{ members: DepartmentMemberContract[] }>(`/departments/${encodeURIComponent(id)}/members`)).members; }
  assignDepartment(userId: string, departmentId: string, role: DepartmentRole) { return this.request<DepartmentMemberContract>(`/employees/${encodeURIComponent(userId)}/department`, { method: 'PUT', body: JSON.stringify({ departmentId, role }) }); }
  async overrides(userId: string) { return (await this.request<{ overrides: PermissionOverrideContract[] }>(`/employees/${encodeURIComponent(userId)}/permission-overrides`)).overrides; }
  putOverride(userId: string, input: { scopeType: PermissionScopeType; scopeId: string; resource: PermissionResource; action: PermissionAction; effect: PermissionEffect }) { return this.request<PermissionOverrideContract>(`/employees/${encodeURIComponent(userId)}/permission-overrides`, { method: 'PUT', body: JSON.stringify(input) }); }
  deleteOverride(userId: string, overrideId: string) { return this.request<void>(`/employees/${encodeURIComponent(userId)}/permission-overrides/${encodeURIComponent(overrideId)}`, { method: 'DELETE' }); }
  agents() { return this.request<AgentDefinitionContract[]>('/agents'); }
  createAgent(input: { key: string; name: string; description?: string; runtimeProfile: AgentRuntimeProfile }) { return this.request<AgentDefinitionContract>('/agents', { method: 'POST', body: JSON.stringify(input) }); }
  assignments(agentId: string) { return this.request<AgentAssignmentContract[]>(`/agents/${encodeURIComponent(agentId)}/assignments`); }
  assignAgent(agentId: string, scopeType: AgentAssignmentScopeType, scopeId: string) { return this.request<AgentAssignmentContract>(`/agents/${encodeURIComponent(agentId)}/assignments`, { method: 'PUT', body: JSON.stringify({ scopeType, scopeId }) }); }
  deleteAssignment(agentId: string, assignmentId: string) { return this.request<void>(`/agents/${encodeURIComponent(agentId)}/assignments/${encodeURIComponent(assignmentId)}`, { method: 'DELETE' }); }
}
