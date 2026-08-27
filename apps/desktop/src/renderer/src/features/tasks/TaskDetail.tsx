import { useEffect, useState } from 'react';
import type {
  AgentRunContract,
  ArtifactContract,
  ResultContract,
  TaskContract
} from '@enterprise-brain/contracts';
import type { DesktopApiError } from '../../../../shared/enterprise-brain.js';

export function TaskDetail({
  task,
  onStart,
  artifacts,
  onReadFile,
  onRegisterArtifact,
  results,
  onPrepareWrite,
  onApproveWrite,
  onRejectWrite,
  onCreateResult,
  onSubmitResult
}: {
  task?: TaskContract;
  onStart: (task: TaskContract) => Promise<void>;
  artifacts: ArtifactContract[];
  results: ResultContract[];
  onReadFile: (
    task: TaskContract,
    relativePath: string
  ) => Promise<AgentRunContract | undefined>;
  onRegisterArtifact: (agentRunId: string) => Promise<void>;
  onPrepareWrite: (task: TaskContract, input: { relativePath: string; content: string }) => Promise<import('@enterprise-brain/contracts').HumanConfirmationDetailContract | undefined>;
  onApproveWrite: (confirmationId: string) => Promise<void>;
  onRejectWrite: (confirmationId: string) => Promise<void>;
  onCreateResult: (artifactIds: string[]) => Promise<void>;
  onSubmitResult: (id: string) => Promise<void>;
}) {
  const [relativePath, setRelativePath] = useState('');
  const [eligibleRun, setEligibleRun] = useState<AgentRunContract>();
  const [error, setError] = useState<DesktopApiError>();
  const [writePath, setWritePath] = useState('');
  const [writeContent, setWriteContent] = useState('');
  const [confirmation, setConfirmation] = useState<import('@enterprise-brain/contracts').HumanConfirmationDetailContract>();
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<string[]>([]);
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
                  <label><input type="checkbox" checked={selectedArtifactIds.includes(artifact.id)} onChange={() => setSelectedArtifactIds(current => current.includes(artifact.id) ? current.filter(id => id !== artifact.id) : [...current, artifact.id])} />
                  {artifact.relativePath} · {artifact.size} bytes · FILE
                  </label>
                </li>
              ))}
            </ul>
            <p>已选择 {selectedArtifactIds.length} 个 Artifact。</p>
            <button className="primary" disabled={selectedArtifactIds.length === 0} onClick={() => void onCreateResult(selectedArtifactIds)}>Confirm Result</button>
            <ul>{results.map(result => <li key={result.id}>{result.status} · {result.artifactIds.length} Artifacts {result.status === 'CANDIDATE' && <button onClick={() => void onSubmitResult(result.id)}>Submit for Human Review</button>}</li>)}</ul>
          </section>
          <section className="artifact-panel">
            <p className="eyebrow">CONFIRMED LOCAL WRITE · EMPLOYEE-SUPPLIED CONTENT</p>
            <label>文件相对路径<input value={writePath} onChange={(event) => setWritePath(event.target.value)} placeholder="docs/summary.md" /></label>
            <label>员工提供的内容<textarea value={writeContent} onChange={(event) => setWriteContent(event.target.value)} /></label>
            <p>内容由员工在 Desktop Runtime 中提供；本阶段不声明 Agent 或模型生成文件内容。</p>
            <button onClick={() => task && void onPrepareWrite(task, { relativePath: writePath, content: writeContent }).then(setConfirmation)}>Prepare write</button>
            {confirmation && <div><p>{confirmation.effect} · {confirmation.risk} · {confirmation.relativePath}</p><p>{confirmation.reason}</p><p>需要权限：{confirmation.requiredPermission} · UTF-8 {confirmation.payloadSize} bytes</p><button className="primary" onClick={() => void onApproveWrite(confirmation.confirmation.id)}>Approve and write</button><button onClick={() => void onRejectWrite(confirmation.confirmation.id)}>Reject</button></div>}
          </section>
        </>
      ) : (
        '选择一个任务查看详情。'
      )}
    </aside>
  );
}
