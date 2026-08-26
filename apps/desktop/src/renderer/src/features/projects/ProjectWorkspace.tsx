import type {
  ProjectContract,
  TaskContract
} from '@enterprise-brain/contracts';
import type { TaskInput } from '../../../../shared/enterprise-brain.js';
import { State } from '../../components/State.js';
import { TaskDetail } from '../tasks/TaskDetail.js';
import { TaskForm } from '../tasks/TaskForm.js';
import { TaskList } from '../tasks/TaskList.js';
import { WorkspacePanel } from '../workspace/WorkspacePanel.js';

export const projectTabs = ['动态', '计划', '任务', '资产', '配置'] as const;
export type ProjectTab = (typeof projectTabs)[number];

export function ProjectWorkspace({
  project,
  tab,
  onTab,
  tasks,
  task,
  onCreateTask,
  onSelectTask,
  onStartTask
}: {
  project: ProjectContract;
  tab: ProjectTab;
  onTab: (tab: ProjectTab) => void;
  tasks: TaskContract[];
  task?: TaskContract;
  onCreateTask: (input: TaskInput) => Promise<void>;
  onSelectTask: (task: TaskContract) => void;
  onStartTask: (task: TaskContract) => Promise<void>;
}) {
  return (
    <section className="page">
      <p className="eyebrow">PROJECT WORKSPACE</p>
      <h1>{project.name}</h1>
      <p>{project.goal || '未设置项目目标'}</p>
      <div className="tabs">
        {projectTabs.map((item) => (
          <button
            key={item}
            className={tab === item ? 'active' : ''}
            onClick={() => onTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {tab === '配置' ? (
        <WorkspacePanel projectId={project.id} />
      ) : tab !== '任务' ? (
        <State
          title={`${tab}将在后续阶段实现`}
          text="本阶段只提供真实的项目与任务工作能力。"
        />
      ) : (
        <div className="tasks-layout">
          <section>
            <h2>任务 · {tasks.length}</h2>
            <TaskForm onSubmit={onCreateTask} />
            <TaskList tasks={tasks} onSelect={onSelectTask} />
          </section>
          <TaskDetail task={task} onStart={onStartTask} />
        </div>
      )}
    </section>
  );
}
