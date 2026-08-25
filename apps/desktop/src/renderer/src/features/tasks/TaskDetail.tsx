import type { TaskContract } from '@enterprise-brain/contracts';

export function TaskDetail({
  task,
  onStart
}: {
  task?: TaskContract;
  onStart: (task: TaskContract) => Promise<void>;
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
            <dt>截止时间</dt>
            <dd>
              {task.deadline
                ? new Date(task.deadline).toLocaleString()
                : '未设置'}
            </dd>
            <dt>验收标准</dt>
            <dd>
              {task.acceptanceCriteria.length
                ? task.acceptanceCriteria.join('；')
                : '未设置'}
            </dd>
          </dl>
          {task.status === 'TODO' && (
            <button className="primary" onClick={() => void onStart(task)}>
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
