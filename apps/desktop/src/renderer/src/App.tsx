import { useCallback, useEffect, useState } from 'react';
import type {
  ProjectContract,
  TaskContract,
  TaskPriority
} from '@enterprise-brain/contracts';
import type {
  DesktopApiError,
  ProjectInput,
  TaskInput
} from '../../shared/enterprise-brain.js';
import './styles.css';

const tabs = ['动态', '计划', '任务', '资产', '配置'] as const;
const disabledNavigation = [
  '新对话',
  '插件',
  '自动化',
  '资料库',
  '助理',
  '蜂群'
];

export function App() {
  const [projects, setProjects] = useState<ProjectContract[]>([]);
  const [project, setProject] = useState<ProjectContract>();
  const [tasks, setTasks] = useState<TaskContract[]>([]);
  const [detail, setDetail] = useState<TaskContract>();
  const [tab, setTab] = useState<(typeof tabs)[number]>('任务');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<DesktopApiError>();

  const loadProjects = useCallback(async () => {
    setLoading(true);
    const result = await window.enterpriseBrain.projects.list();
    if (result.ok) setProjects(result.data);
    else setError(result.error);
    setLoading(false);
  }, []);
  const loadTasks = useCallback(async (id: string) => {
    setLoading(true);
    const result = await window.enterpriseBrain.tasks.list(id);
    if (result.ok) setTasks(result.data);
    else setError(result.error);
    setLoading(false);
  }, []);
  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);
  useEffect(() => {
    if (project) void loadTasks(project.id);
  }, [project, loadTasks]);
  const retry = () =>
    project ? void loadTasks(project.id) : void loadProjects();
  async function createProject(input: ProjectInput) {
    const result = await window.enterpriseBrain.projects.create(input);
    if (!result.ok) return setError(result.error);
    await loadProjects();
    setProject(result.data);
  }
  async function createTask(input: TaskInput) {
    if (!project) return;
    const result = await window.enterpriseBrain.tasks.create(project.id, input);
    if (!result.ok) return setError(result.error);
    await loadTasks(project.id);
    setDetail(result.data);
  }
  async function startTask(task: TaskContract) {
    const result = await window.enterpriseBrain.tasks.start(task.id);
    if (!result.ok) return setError(result.error);
    setDetail(result.data);
    await loadTasks(result.data.projectId);
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          ✦{' '}
          <span>
            Enterprise Brain<small>Employee</small>
          </span>
        </div>
        <div className="runtime">Work · Desktop Runtime</div>
        <nav>
          {disabledNavigation.map((item) => (
            <button key={item} disabled>
              {item}
              <small>后续实现</small>
            </button>
          ))}
        </nav>
        <p>当前项目</p>
        <nav>
          {projects.map((item) => (
            <button
              key={item.id}
              className={project?.id === item.id ? 'selected' : ''}
              onClick={() => {
                setProject(item);
                setDetail(undefined);
              }}
            >
              {item.name}
            </button>
          ))}
        </nav>
        <p>个人项目</p>
        <nav>
          <button disabled>后续实现</button>
        </nav>
        <p>历史对话</p>
        <nav>
          <button disabled>后续实现</button>
        </nav>
        <div className="bottom">
          {['Profile', 'Notification', 'Settings', 'Daily Dashboard'].map(
            (item) => (
              <button key={item} disabled>
                {item}
                <small>后续实现</small>
              </button>
            )
          )}
        </div>
      </aside>
      <main className="content">
        {error ? (
          <ErrorState error={error} retry={retry} />
        ) : loading ? (
          <State
            title="正在连接 Work Runtime…"
            text="正在读取当前用户可访问的项目。"
          />
        ) : !project ? (
          <Home
            projects={projects}
            createProject={createProject}
            select={setProject}
          />
        ) : (
          <Workspace
            project={project}
            tab={tab}
            setTab={setTab}
            tasks={tasks}
            detail={detail}
            createTask={createTask}
            selectTask={setDetail}
            startTask={startTask}
          />
        )}
      </main>
    </div>
  );
}

function Home({
  projects,
  createProject,
  select
}: {
  projects: ProjectContract[];
  createProject: (input: ProjectInput) => Promise<void>;
  select: (project: ProjectContract) => void;
}) {
  return (
    <section className="page">
      <p className="eyebrow">WORK RUNTIME</p>
      <h1>当前项目</h1>
      <p>通过 Employee API 管理正式项目与任务状态。</p>
      <ProjectForm submit={createProject} />
      {projects.length === 0 ? (
        <State title="还没有项目" text="创建第一个项目，开始正式工作流。" />
      ) : (
        <div className="project-grid">
          {projects.map((project) => (
            <button
              className="project-card"
              key={project.id}
              onClick={() => select(project)}
            >
              <small>{project.status}</small>
              <h2>{project.name}</h2>
              <p>{project.goal || '未设置项目目标'}</p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
function Workspace({
  project,
  tab,
  setTab,
  tasks,
  detail,
  createTask,
  selectTask,
  startTask
}: {
  project: ProjectContract;
  tab: (typeof tabs)[number];
  setTab: (value: (typeof tabs)[number]) => void;
  tasks: TaskContract[];
  detail?: TaskContract;
  createTask: (input: TaskInput) => Promise<void>;
  selectTask: (task: TaskContract) => void;
  startTask: (task: TaskContract) => Promise<void>;
}) {
  return (
    <section className="page">
      <p className="eyebrow">PROJECT WORKSPACE</p>
      <h1>{project.name}</h1>
      <p>{project.goal || '未设置项目目标'}</p>
      <div className="tabs">
        {tabs.map((item) => (
          <button
            key={item}
            className={tab === item ? 'active' : ''}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {tab !== '任务' ? (
        <State
          title={`${tab}将在后续阶段实现`}
          text="本阶段只提供真实的项目与任务工作能力。"
        />
      ) : (
        <div className="tasks-layout">
          <section>
            <h2>任务 · {tasks.length}</h2>
            <TaskForm submit={createTask} />
            {tasks.length === 0 ? (
              <State title="还没有任务" text="创建一个未分配任务开始工作。" />
            ) : (
              <div className="task-list">
                {tasks.map((task) => (
                  <button
                    key={task.id}
                    className="task-row"
                    onClick={() => selectTask(task)}
                  >
                    <small>{task.status}</small>
                    <span>
                      <b>{task.title}</b>
                      <em>
                        {task.priority}
                        {task.deadline
                          ? ` · ${new Date(task.deadline).toLocaleDateString()}`
                          : ''}
                        {task.assigneeId ? ` · ${task.assigneeId}` : ''}
                      </em>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
          <Detail task={detail} start={startTask} />
        </div>
      )}
    </section>
  );
}
function ProjectForm({
  submit
}: {
  submit: (input: ProjectInput) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) {
          void submit({ name, ...(goal.trim() ? { goal } : {}) });
          setName('');
          setGoal('');
        }
      }}
    >
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="项目名称"
        required
      />
      <input
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        placeholder="项目目标（可选）"
      />
      <button className="primary">创建项目</button>
    </form>
  );
}
function TaskForm({ submit }: { submit: (input: TaskInput) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('P2');
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim()) {
          void submit({
            title,
            ...(description.trim() ? { description } : {}),
            priority
          });
          setTitle('');
          setDescription('');
        }
      }}
    >
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="创建未分配任务"
        required
      />
      <input
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="说明（可选）"
      />
      <select
        value={priority}
        onChange={(event) => setPriority(event.target.value as TaskPriority)}
      >
        {(['P0', 'P1', 'P2', 'P3'] as const).map((value) => (
          <option key={value}>{value}</option>
        ))}
      </select>
      <button className="primary">创建任务</button>
    </form>
  );
}
function Detail({
  task,
  start
}: {
  task?: TaskContract;
  start: (task: TaskContract) => Promise<void>;
}) {
  return (
    <aside className="detail">
      {task ? (
        <>
          <p className="eyebrow">TASK DETAIL</p>
          <h2>{task.title}</h2>
          <p>{task.description || '没有任务说明。'}</p>
          <dl>
            <dt>状态</dt>
            <dd>{task.status}</dd>
            <dt>优先级</dt>
            <dd>{task.priority}</dd>
            <dt>负责人</dt>
            <dd>{task.assigneeId || '未分配'}</dd>
          </dl>
          {task.status === 'TODO' && (
            <button className="primary" onClick={() => void start(task)}>
              Start Task
            </button>
          )}
        </>
      ) : (
        '选择一个任务查看详情。'
      )}
    </aside>
  );
}
function State({ title, text }: { title: string; text: string }) {
  return (
    <section className="state">
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}
function ErrorState({
  error,
  retry
}: {
  error: DesktopApiError;
  retry: () => void;
}) {
  return (
    <section className="state error">
      <p className="eyebrow">RECOVERABLE ERROR</p>
      <h2>
        {error.code === 'API_UNAVAILABLE'
          ? '无法连接 Employee API'
          : error.message}
      </h2>
      <p>Desktop 已启动。请启动 Employee API 后重试。</p>
      <button className="primary" onClick={retry}>
        重试
      </button>
    </section>
  );
}
