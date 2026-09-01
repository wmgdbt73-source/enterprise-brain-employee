import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ProjectContract,
  TaskContract,
  ArtifactContract,
  AgentRunContract,
  ResultContract
  ,AvailableAgentContract
} from '@enterprise-brain/contracts';
import type {
  DesktopApiError,
  DesktopResult,
  ProjectInput,
  TaskInput
} from '../../shared/enterprise-brain.js';
import { ErrorState, State } from './components/State.js';
import { Sidebar } from './components/Sidebar.js';
import { ProjectHome } from './features/projects/ProjectHome.js';
import {
  ProjectWorkspace,
  type ProjectTab
} from './features/projects/ProjectWorkspace.js';
import { resolveOperation } from './features/runtime/operation-state.js';
import { LoginScreen } from './features/auth/LoginScreen.js';
import './styles.css';

export function App() {
  const [projects, setProjects] = useState<ProjectContract[]>([]);
  const [project, setProject] = useState<ProjectContract>();
  const [tasks, setTasks] = useState<TaskContract[]>([]);
  const [task, setTask] = useState<TaskContract>();
  const [artifacts, setArtifacts] = useState<ArtifactContract[]>([]);
  const [agents, setAgents] = useState<AvailableAgentContract[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>();
  const [tab, setTab] = useState<ProjectTab>('任务');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DesktopApiError>();
  const [currentUser, setCurrentUser] = useState<import('@enterprise-brain/contracts').CurrentUserContract>();
  const [runtimeLabel, setRuntimeLabel] = useState('Work · Desktop Runtime');
  const selectedTaskIdRef = useRef<string | undefined>(undefined);
  const selectedProjectIdRef = useRef<string | undefined>(undefined);
  const authGenerationRef = useRef(0);
  selectedTaskIdRef.current = task?.id;
  selectedProjectIdRef.current = project?.id;

  const clearAuthenticatedState = useCallback(() => {
    ++authGenerationRef.current;
    setCurrentUser(undefined); setProjects([]); setProject(undefined); setTasks([]); setTask(undefined); setArtifacts([]); setAgents([]); setSelectedAgentId(undefined); setError(undefined); setLoading(false);
  }, []);
  const loadProjects = useCallback(async (generation = authGenerationRef.current) => {
    setLoading(true);
    const operation = resolveOperation(
      await window.enterpriseBrain.projects.list()
    );
    if (generation !== authGenerationRef.current) return;
    if (operation.error?.code === 'AUTHENTICATION_REQUIRED') return clearAuthenticatedState();
    if (operation.data) setProjects(operation.data);
    setError(operation.error); setLoading(false);
  }, [clearAuthenticatedState]);
  const loadTasks = useCallback(async (projectId: string, generation = authGenerationRef.current) => {
    setLoading(true);
    const operation = resolveOperation(
      await window.enterpriseBrain.tasks.list(projectId)
    );
    if (generation !== authGenerationRef.current) return;
    if (operation.error?.code === 'AUTHENTICATION_REQUIRED') return clearAuthenticatedState();
    if (operation.data) setTasks(operation.data);
    setError(operation.error); setLoading(false);
  }, [clearAuthenticatedState]);
  useEffect(() => {
    const generation = authGenerationRef.current;
    void window.enterpriseBrain.auth.currentUser().then((result) => {
      if (generation !== authGenerationRef.current) return;
      const operation = resolveOperation(result);
      if (operation.data) { setCurrentUser(operation.data); void loadProjects(generation); }
      else setLoading(false);
    });
  }, [loadProjects]);
  const loadAgents = useCallback(async (generation = authGenerationRef.current) => { const list=window.enterpriseBrain.agents.list; if (!list) return; const result=await list(); if(generation!==authGenerationRef.current)return; if(!result.ok){if(result.error.code==='AUTHENTICATION_REQUIRED')clearAuthenticatedState();return;} setAgents(result.data);setSelectedAgentId(old=>result.data.some(a=>a.id===old)?old:result.data[0]?.id); },[clearAuthenticatedState]);
  useEffect(() => window.enterpriseBrain.auth.onAuthenticationLost?.(clearAuthenticatedState), [clearAuthenticatedState]);
  useEffect(() => {
    if (error?.code !== 'AUTHENTICATION_REQUIRED') return;
    clearAuthenticatedState();
  }, [error, clearAuthenticatedState]);
  useEffect(() => {
    if (project) void loadTasks(project.id);
  }, [project, loadTasks]);
  useEffect(() => {
    if (!task) return void setArtifacts([]);
    const generation = authGenerationRef.current;
    void window.enterpriseBrain.artifacts
      .listForTask(task.id)
      .then((result) => {
        const operation = resolveOperation(result);
        if (generation !== authGenerationRef.current) return;
        if (operation.error?.code === 'AUTHENTICATION_REQUIRED') return clearAuthenticatedState();
        if (operation.data) setArtifacts(operation.data);
      });
  }, [task, clearAuthenticatedState]);
  useEffect(() => {
    void window.enterpriseBrain.runtime.getInfo().then((result) => {
      const operation = resolveOperation(result);
      if (operation.data)
        setRuntimeLabel(
          `Work · Desktop Runtime · ${operation.data.platform} · v${operation.data.appVersion}`
        );
    });
  }, []);
  const retry = () =>
    project ? void loadTasks(project.id) : void loadProjects();
  function selectProject(value: ProjectContract) {
    setProject(value);
    setTask(undefined);
    setError(undefined);
  }
  async function login(input: { login: string; password: string }) {
    const generation = ++authGenerationRef.current;
    const result = await window.enterpriseBrain.auth.login(input);
    if (generation !== authGenerationRef.current) return result;
    if (result.ok) { setCurrentUser(result.data); setError(undefined); await Promise.all([loadProjects(generation),loadAgents(generation)]); }
    return result;
  }
  async function logout() {
    clearAuthenticatedState();
    await window.enterpriseBrain.auth.logout();
  }
  async function createProject(input: ProjectInput) {
    const generation = authGenerationRef.current;
    const operation = resolveOperation(
      await window.enterpriseBrain.projects.create(input)
    );
    if (generation !== authGenerationRef.current) return;
    if (operation.error?.code === 'AUTHENTICATION_REQUIRED') return clearAuthenticatedState();
    if (operation.error) return setError(operation.error);
    setError(undefined);
    await loadProjects(generation);
    if (operation.data && generation === authGenerationRef.current) setProject(operation.data);
  }
  async function createTask(input: TaskInput) {
    if (!project) return;
    const generation = authGenerationRef.current;
    const operation = resolveOperation(
      await window.enterpriseBrain.tasks.create(project.id, input)
    );
    if (generation !== authGenerationRef.current) return;
    if (operation.error?.code === 'AUTHENTICATION_REQUIRED') return clearAuthenticatedState();
    if (operation.error) return setError(operation.error);
    setError(undefined);
    await loadTasks(project.id, generation);
    if (operation.data && generation === authGenerationRef.current) setTask(operation.data);
  }
  async function startTask(value: TaskContract): Promise<DesktopResult<TaskContract>> {
    const generation = authGenerationRef.current;
    const operation = resolveOperation(
      await window.enterpriseBrain.tasks.start(value.id)
    );
    if (generation !== authGenerationRef.current) return { ok: false, error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required', details: {} } };
    if (operation.error?.code === 'AUTHENTICATION_REQUIRED') { clearAuthenticatedState(); return { ok: false, error: operation.error }; }
    if (operation.error) return { ok: false, error: operation.error };
    setError(undefined);
    if (operation.data) {
      setTask(operation.data);
      await loadTasks(operation.data.projectId, generation);
    }
    return operation.data
      ? { ok: true, data: operation.data }
      : { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Task start returned no data', details: {} } };
  }
  async function readFile(
    value: TaskContract,
    relativePath: string
  ): Promise<AgentRunContract | undefined> {
    const generation = authGenerationRef.current;
    if (!selectedAgentId) return undefined;
    const operation = resolveOperation(
      await window.enterpriseBrain.agents.run(value.id, selectedAgentId, {
        name: 'read_file',
        relativePath
      })
    );
    if (generation !== authGenerationRef.current) return undefined;
    if (operation.error?.code === 'AUTHENTICATION_REQUIRED') {
      clearAuthenticatedState();
      return undefined;
    }
    if (operation.error) {
      setError(operation.error);
      return undefined;
    }
    setError(undefined);
    return operation.data?.run;
  }
  async function registerArtifact(agentRunId: string) {
    const generation = authGenerationRef.current;
    const operation = resolveOperation(
      await window.enterpriseBrain.artifacts.register(agentRunId)
    );
    if (generation !== authGenerationRef.current) return;
    if (operation.error?.code === 'AUTHENTICATION_REQUIRED') return clearAuthenticatedState();
    if (operation.error) return setError(operation.error);
    setError(undefined);
    if (task) {
      const listed = resolveOperation(
        await window.enterpriseBrain.artifacts.listForTask(task.id)
      );
      if (generation === authGenerationRef.current) {
        if (listed.error?.code === 'AUTHENTICATION_REQUIRED') return clearAuthenticatedState();
        if (listed.data) setArtifacts(listed.data);
      }
    }
  }
  async function prepareWrite(value: TaskContract, input: { relativePath: string; content: string }) {
    const generation = authGenerationRef.current;
    const operation = resolveOperation(await window.enterpriseBrain.confirmedWrites.prepare(value.id, input));
    if (generation !== authGenerationRef.current) return undefined;
    if (operation.error?.code === 'AUTHENTICATION_REQUIRED') { clearAuthenticatedState(); return undefined; }
    if (operation.error) { setError(operation.error); return undefined; }
    setError(undefined);
    return operation.data?.confirmation;
  }
  async function approveWrite(confirmationId: string) {
    const generation = authGenerationRef.current;
    const operation = resolveOperation(await window.enterpriseBrain.confirmedWrites.approve(confirmationId));
    if (generation !== authGenerationRef.current) return;
    if (operation.error?.code === 'AUTHENTICATION_REQUIRED') return clearAuthenticatedState();
    if (operation.error) return setError(operation.error);
    setError(undefined);
  }
  async function rejectWrite(confirmationId: string) {
    const generation = authGenerationRef.current;
    const operation = resolveOperation(await window.enterpriseBrain.confirmedWrites.reject(confirmationId));
    if (generation !== authGenerationRef.current) return;
    if (operation.error?.code === 'AUTHENTICATION_REQUIRED') return clearAuthenticatedState();
    if (operation.error) return setError(operation.error);
    setError(undefined);
  }
  async function createResult(
    value: TaskContract,
    artifactIds: string[],
    idempotencyKey: string
  ): Promise<DesktopResult<ResultContract>> {
    // Candidate creation owns a recoverable, attempt-scoped error in TaskDetail.
    // Do not replace the workspace and discard its idempotency identity.
    return window.enterpriseBrain.results.create(value.id, artifactIds, idempotencyKey);
  }
  async function submitResult(resultId: string): Promise<DesktopResult<ResultContract>> {
    const generation = authGenerationRef.current;
    const selectedTask = task;
    const response = await window.enterpriseBrain.results.submitReview(resultId);
    if (generation !== authGenerationRef.current) return response;
    if (!response.ok && response.error.code === 'AUTHENTICATION_REQUIRED') clearAuthenticatedState();
    if (response.ok && selectedTask && selectedTaskIdRef.current === selectedTask.id) {
      const refreshed = resolveOperation(await window.enterpriseBrain.tasks.get(selectedTask.id));
      if (refreshed.data && generation === authGenerationRef.current && selectedTaskIdRef.current === selectedTask.id) {
        setTask(refreshed.data);
        await loadTasks(refreshed.data.projectId);
      }
    }
    return response;
  }
  const getResult = (resultId: string) => window.enterpriseBrain.results.get(resultId);
  const listResultReviews = (resultId: string) => window.enterpriseBrain.results.listReviews(resultId);
  const decideResult = async (resultId: string, decision: 'ACCEPT' | 'REWORK', comment?: string) => {
    const generation = authGenerationRef.current;
    const response = await window.enterpriseBrain.results.decide(resultId, decision, comment);
    if (generation !== authGenerationRef.current) return response;
    if (!response.ok && response.error.code === 'AUTHENTICATION_REQUIRED') { clearAuthenticatedState(); return response; }
    if (response.ok) {
      const decided = resolveOperation(await window.enterpriseBrain.results.get(resultId));
      const taskId = decided.data?.taskId;
      const projectId = decided.data?.projectId;
      if (taskId && generation === authGenerationRef.current && selectedTaskIdRef.current === taskId) {
        const refreshed = resolveOperation(await window.enterpriseBrain.tasks.get(taskId));
        if (refreshed.data && selectedTaskIdRef.current === taskId) {
        setTask(refreshed.data);
        if (selectedProjectIdRef.current === projectId) await loadTasks(refreshed.data.projectId);
        }
      }
    }
    return response;
  };

  return (
    <div className="app-shell">
      <Sidebar
        projects={projects}
        selectedProject={project}
        runtimeLabel={runtimeLabel}
        onSelectProject={selectProject}
      />
      <main className="content">
        {!currentUser ? (
          <LoginScreen onLogin={login} />
        ) : error ? (
          <ErrorState error={error} retry={retry} />
        ) : loading ? (
          <State
            title="正在连接 Work Runtime…"
            text="正在读取当前用户可访问的项目。"
          />
        ) : !project ? (
          <ProjectHome
            projects={projects}
            onCreate={createProject}
            onSelect={selectProject}
          />
        ) : (
          <ProjectWorkspace
            project={project}
            tab={tab}
            onTab={setTab}
            tasks={tasks}
            task={task}
            onCreateTask={createTask}
            onSelectTask={setTask}
            onStartTask={startTask}
            artifacts={artifacts}
            onReadFile={readFile}
            onRegisterArtifact={registerArtifact}
            onPrepareWrite={prepareWrite}
            onApproveWrite={approveWrite}
            onRejectWrite={rejectWrite}
            onCreateResult={createResult}
            onSubmitResult={submitResult}
            onGetResult={getResult}
            onListReviews={listResultReviews}
            onDecideReview={decideResult}
            agents={agents}
            selectedAgentId={selectedAgentId}
            onSelectAgent={setSelectedAgentId}
          />
        )}
        {currentUser && <button className="logout" onClick={() => void logout()}>Sign out · {currentUser.name}{currentUser.organization ? ` · ${currentUser.organization.name}${currentUser.department ? ` · ${currentUser.department.name}` : ''}` : ''}</button>}
      </main>
    </div>
  );
}
