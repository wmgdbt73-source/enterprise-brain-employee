import type { TaskContract } from '@enterprise-brain/contracts';
import { State } from '../../components/State.js';

export function TaskList({
  tasks,
  onSelect
}: {
  tasks: TaskContract[];
  onSelect: (task: TaskContract) => void;
}) {
  return tasks.length === 0 ? (
    <State title="还没有任务" text="创建一个未分配任务开始工作。" />
  ) : (
    <div className="task-list">
      {tasks.map((task) => (
        <button
          key={task.id}
          className="task-row"
          onClick={() => onSelect(task)}
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
  );
}
