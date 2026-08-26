import { useCallback, useEffect, useState } from 'react';
import type {
  ProjectContract,
  TaskContract
} from '@enterprise-brain/contracts';
import type {
  DesktopApiError,
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
  const [tab, setTab] = useState<ProjectTab>('任务');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DesktopApiError>();
  const [runtimeLabel, setRuntimeLabel] = useState('Work · Desktop Runtime');

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
  async function startTask(value: TaskContract) {
    const operation = resolveOperation(
      await window.enterpriseBrain.tasks.start(value.id)
    );
    if (operation.error) return setError(operation.error);
    setError(undefined);
    if (operation.data) {
      setTask(operation.data);
      await loadTasks(operation.data.projectId);
    }
  }

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
          />
        )}
      </main>
    </div>
  );
}
