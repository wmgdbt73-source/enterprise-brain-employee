import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ProjectContract,
  TaskContract,
  ArtifactContract,
  AgentRunContract,
  ResultContract
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
import './styles.css';

export function App() {
  const [projects, setProjects] = useState<ProjectContract[]>([]);
  const [project, setProject] = useState<ProjectContract>();
  const [tasks, setTasks] = useState<TaskContract[]>([]);
  const [task, setTask] = useState<TaskContract>();
  const [artifacts, setArtifacts] = useState<ArtifactContract[]>([]);
  const [tab, setTab] = useState<ProjectTab>('任务');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DesktopApiError>();
  const [runtimeLabel, setRuntimeLabel] = useState('Work · Desktop Runtime');
  const selectedTaskIdRef = useRef<string | undefined>(undefined);
  const selectedProjectIdRef = useRef<string | undefined>(undefined);
  selectedTaskIdRef.current = task?.id;
  selectedProjectIdRef.current = project?.id;

  const loadProjects = useCallback(async () => {
    setLoading(true);
    const operation = resolveOperation(
      await window.enterpriseBrain.projects.list()
    );
    if (operation.data) setProjects(operation.data);
    setError(operation.error);
    setLoading(false);
  }, []);
  const loadTasks = useCallback(async (projectId: string) => {
    setLoading(true);
    const operation = resolveOperation(
      await window.enterpriseBrain.tasks.list(projectId)
    );
    if (operation.data) setTasks(operation.data);
    setError(operation.error);
    setLoading(false);
  }, []);
  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);
  useEffect(() => {
    if (project) void loadTasks(project.id);
  }, [project, loadTasks]);
  useEffect(() => {
    if (!task) return void setArtifacts([]);
    void window.enterpriseBrain.artifacts
      .listForTask(task.id)
      .then((result) => {
        const operation = resolveOperation(result);
        if (operation.data) setArtifacts(operation.data);
      });
  }, [task]);
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
  async function createProject(input: ProjectInput) {
    const operation = resolveOperation(
      await window.enterpriseBrain.projects.create(input)
    );
    if (operation.error) return setError(operation.error);
    setError(undefined);
    await loadProjects();
    if (operation.data) setProject(operation.data);
  }
  async function createTask(input: TaskInput) {
    if (!project) return;
    const operation = resolveOperation(
      await window.enterpriseBrain.tasks.create(project.id, input)
    );
    if (operation.error) return setError(operation.error);
    setError(undefined);
    await loadTasks(project.id);
    if (operation.data) setTask(operation.data);
  }
  async function startTask(value: TaskContract): Promise<DesktopResult<TaskContract>> {
    const operation = resolveOperation(
      await window.enterpriseBrain.tasks.start(value.id)
    );
    if (operation.error) return { ok: false, error: operation.error };
    setError(undefined);
    if (operation.data) {
      setTask(operation.data);
      await loadTasks(operation.data.projectId);
    }
    return operation.data
      ? { ok: true, data: operation.data }
      : { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Task start returned no data', details: {} } };
  }
  async function readFile(
    value: TaskContract,
    relativePath: string
  ): Promise<AgentRunContract | undefined> {
    const operation = resolveOperation(
      await window.enterpriseBrain.agents.run(value.id, {
        name: 'read_file',
        relativePath
      })
    );
    if (operation.error) {
      setError(operation.error);
      return undefined;
    }
    setError(undefined);
    return operation.data?.run;
  }
  async function registerArtifact(agentRunId: string) {
    const operation = resolveOperation(
      await window.enterpriseBrain.artifacts.register(agentRunId)
    );
    if (operation.error) return setError(operation.error);
    setError(undefined);
    if (task) {
      const listed = resolveOperation(
        await window.enterpriseBrain.artifacts.listForTask(task.id)
      );
      if (listed.data) setArtifacts(listed.data);
    }
  }
  async function prepareWrite(value: TaskContract, input: { relativePath: string; content: string }) {
    const operation = resolveOperation(await window.enterpriseBrain.confirmedWrites.prepare(value.id, input));
    if (operation.error) { setError(operation.error); return undefined; }
    setError(undefined);
    return operation.data?.confirmation;
  }
  async function approveWrite(confirmationId: string) {
    const operation = resolveOperation(await window.enterpriseBrain.confirmedWrites.approve(confirmationId));
    if (operation.error) return setError(operation.error);
    setError(undefined);
  }
  async function rejectWrite(confirmationId: string) {
    const operation = resolveOperation(await window.enterpriseBrain.confirmedWrites.reject(confirmationId));
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
    const selectedTask = task;
    const response = await window.enterpriseBrain.results.submitReview(resultId);
    if (response.ok && selectedTask && selectedTaskIdRef.current === selectedTask.id) {
      const refreshed = resolveOperation(await window.enterpriseBrain.tasks.get(selectedTask.id));
      if (refreshed.data && selectedTaskIdRef.current === selectedTask.id) {
        setTask(refreshed.data);
        await loadTasks(refreshed.data.projectId);
      }
    }
    return response;
  }
  const getResult = (resultId: string) => window.enterpriseBrain.results.get(resultId);
  const listResultReviews = (resultId: string) => window.enterpriseBrain.results.listReviews(resultId);
  const decideResult = async (resultId: string, decision: 'ACCEPT' | 'REWORK', comment?: string) => {
    const response = await window.enterpriseBrain.results.decide(resultId, decision, comment);
    if (response.ok) {
      const decided = resolveOperation(await window.enterpriseBrain.results.get(resultId));
      const taskId = decided.data?.taskId;
      const projectId = decided.data?.projectId;
      if (taskId && selectedTaskIdRef.current === taskId) {
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
        {error ? (
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
          />
        )}
      </main>
    </div>
  );
}
