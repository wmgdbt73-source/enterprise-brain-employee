import type { ProjectContract } from '@enterprise-brain/contracts';

const disabledNavigation = [
  '新对话',
  '插件',
  '自动化',
  '资料库',
  '助理',
  '蜂群'
];

export function Sidebar({
  projects,
  selectedProject,
  runtimeLabel,
  onSelectProject
}: {
  projects: ProjectContract[];
  selectedProject?: ProjectContract;
  runtimeLabel: string;
  onSelectProject: (project: ProjectContract) => void;
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        ✦{' '}
        <span>
          Enterprise Brain<small>Employee</small>
        </span>
      </div>
      <div className="runtime">{runtimeLabel}</div>
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
        {projects.map((project) => (
          <button
            key={project.id}
            className={selectedProject?.id === project.id ? 'selected' : ''}
            onClick={() => onSelectProject(project)}
          >
            {project.name}
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
  );
}
