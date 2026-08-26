import { useEffect, useState } from 'react';
import type {
  AgentRunContract,
  ArtifactContract,
  TaskContract
} from '@enterprise-brain/contracts';
import type { DesktopApiError } from '../../../../shared/enterprise-brain.js';

export function TaskDetail({
  task,
  onStart,
  artifacts,
  onReadFile,
  onRegisterArtifact
}: {
  task?: TaskContract;
  onStart: (task: TaskContract) => Promise<void>;
  artifacts: ArtifactContract[];
  onReadFile: (
    task: TaskContract,
    relativePath: string
  ) => Promise<AgentRunContract | undefined>;
  onRegisterArtifact: (agentRunId: string) => Promise<void>;
}) {
  const [relativePath, setRelativePath] = useState('');
  const [eligibleRun, setEligibleRun] = useState<AgentRunContract>();
  const [error, setError] = useState<DesktopApiError>();
  useEffect(() => {
    setEligibleRun(undefined);
    setError(undefined);
  }, [task?.id]);
  async function readFile() {
    if (!task || relativePath.trim().length === 0) return;
    const run = await onReadFile(task, relativePath.trim());
    if (run?.status === 'SUCCEEDED') setEligibleRun(run);
  }
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
          <section className="artifact-panel">
            <p className="eyebrow">LOCAL ARTIFACTS · READ ONLY</p>
            <label>
              文件相对路径
              <input
                value={relativePath}
                onChange={(event) => setRelativePath(event.target.value)}
                placeholder="docs/brief.md"
              />
            </label>
            <button onClick={() => void readFile()}>
              Read file with Agent
            </button>
            {eligibleRun && (
              <button
                className="primary"
                onClick={() => void onRegisterArtifact(eligibleRun.id)}
              >
                Register Artifact
              </button>
            )}
            {error && <p>{error.message}</p>}
            <ul>
              {artifacts.map((artifact) => (
                <li key={artifact.id}>
                  {artifact.relativePath} · {artifact.size} bytes · FILE
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        '选择一个任务查看详情。'
      )}
    </aside>
  );
}
