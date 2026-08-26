import { useState } from 'react';
import type { ProjectContract } from '@enterprise-brain/contracts';
import type { ProjectInput } from '../../../../shared/enterprise-brain.js';
import { State } from '../../components/State.js';

export function ProjectHome({
  projects,
  onCreate,
  onSelect
}: {
  projects: ProjectContract[];
  onCreate: (input: ProjectInput) => Promise<void>;
  onSelect: (project: ProjectContract) => void;
}) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  return (
    <section className="page">
      <p className="eyebrow">WORK RUNTIME</p>
      <h1>当前项目</h1>
      <p>通过 Employee API 管理正式项目与任务状态。</p>
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) {
            void onCreate({ name, ...(goal.trim() ? { goal } : {}) });
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
      {projects.length === 0 ? (
        <State title="还没有项目" text="创建第一个项目，开始正式工作流。" />
      ) : (
        <div className="project-grid">
          {projects.map((project) => (
            <button
              className="project-card"
              key={project.id}
              onClick={() => onSelect(project)}
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
