import { useEffect, useRef, useState } from 'react';
import type {
  AgentRunContract,
  ArtifactContract,
  TaskContract
} from '@enterprise-brain/contracts';
import type { DesktopApiError, DesktopResult } from '../../../../shared/enterprise-brain.js';
import { resultConfirmationAttempt, type ResultConfirmationAttempt } from './result-confirmation.js';

export function TaskDetail({
  task,
  onStart,
  artifacts,
  onReadFile,
  onRegisterArtifact
  ,onPrepareWrite,
  onApproveWrite,
  onRejectWrite
  ,onCreateResult
  ,onSubmitResult
  ,onGetResult
  ,onListReviews
  ,onDecideReview
}: {
  task?: TaskContract;
  onStart: (task: TaskContract) => Promise<DesktopResult<TaskContract> | void>;
  artifacts: ArtifactContract[];
  onReadFile: (
    task: TaskContract,
    relativePath: string
  ) => Promise<AgentRunContract | undefined>;
  onRegisterArtifact: (agentRunId: string) => Promise<void>;
  onPrepareWrite: (task: TaskContract, input: { relativePath: string; content: string }) => Promise<import('@enterprise-brain/contracts').HumanConfirmationDetailContract | undefined>;
  onApproveWrite: (confirmationId: string) => Promise<void>;
  onRejectWrite: (confirmationId: string) => Promise<void>;
  onCreateResult: (task: TaskContract, artifactIds: string[], idempotencyKey: string) => Promise<DesktopResult<import('@enterprise-brain/contracts').ResultContract>>;
  onSubmitResult?: (resultId: string) => Promise<DesktopResult<import('@enterprise-brain/contracts').ResultContract>>;
  onGetResult?: (resultId: string) => Promise<DesktopResult<import('@enterprise-brain/contracts').ResultContract>>;
  onListReviews?: (resultId: string) => Promise<DesktopResult<import('@enterprise-brain/contracts').ReviewContract[]>>;
  onDecideReview?: (resultId: string, decision: 'ACCEPT' | 'REWORK', comment?: string) => Promise<DesktopResult<import('@enterprise-brain/contracts').ReviewContract>>;
}) {
  const [relativePath, setRelativePath] = useState('');
  const [eligibleRun, setEligibleRun] = useState<AgentRunContract>();
  const [error, setError] = useState<DesktopApiError>();
  const [writePath, setWritePath] = useState('');
  const [writeContent, setWriteContent] = useState('');
  const [confirmation, setConfirmation] = useState<import('@enterprise-brain/contracts').HumanConfirmationDetailContract>();
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<string[]>([]);
  const [candidate, setCandidate] = useState<import('@enterprise-brain/contracts').ResultContract>();
  const [pendingAttempt, setPendingAttempt] = useState<ResultConfirmationAttempt>();
  const [resultSubmitting, setResultSubmitting] = useState(false);
  const [resultError, setResultError] = useState<DesktopApiError>();
  const [resultIdInput, setResultIdInput] = useState('');
  const [reviews, setReviews] = useState<import('@enterprise-brain/contracts').ReviewContract[]>([]);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const activeResultRef = useRef<string | undefined>(undefined);
  const taskIdRef = useRef(task?.id);
  const pendingAttemptRef = useRef<ResultConfirmationAttempt | undefined>(undefined);
  taskIdRef.current = task?.id;
  function setAttempt(value: ResultConfirmationAttempt | undefined) {
    pendingAttemptRef.current = value;
    setPendingAttempt(value);
  }
  useEffect(() => {
    setEligibleRun(undefined);
    setError(undefined);
    setSelectedArtifactIds([]);
    setCandidate(undefined);
    setAttempt(undefined);
    setResultSubmitting(false);
    setResultError(undefined);
    setReviews([]); setReviewComment(''); setResultIdInput(''); activeResultRef.current = undefined;
  }, [task?.id]);
  async function submitResult(attempt: ResultConfirmationAttempt) {
    if (!task || resultSubmitting) return;
    const submittedTask = task;
    setResultSubmitting(true);
    const result = await onCreateResult(
      submittedTask,
      [...attempt.artifactIds],
      attempt.idempotencyKey
    );
    // A Task switch or later attempt makes this response stale. It must not
    // update another detail view or consume that newer attempt's retry key.
    if (
      taskIdRef.current !== submittedTask.id ||
      pendingAttemptRef.current !== attempt
    ) return;
    setResultSubmitting(false);
    if (!result.ok) {
      setResultError(result.error);
      return;
    }
    setResultError(undefined);
    setCandidate(result.data);
    setAttempt(undefined);
  }
  async function openResult(id: string) {
    if (!onGetResult || !onListReviews || !id.trim()) return;
    const requested = id.trim(); activeResultRef.current = requested; setReviewBusy(true);
    const [loaded, listed] = await Promise.all([onGetResult(requested), onListReviews(requested)]);
    if (activeResultRef.current !== requested) return;
    setReviewBusy(false);
    if (!loaded.ok) { setResultError(loaded.error); return; }
    if (!listed.ok) { setResultError(listed.error); return; }
    setCandidate(loaded.data); setReviews(listed.data); setResultError(undefined);
  }
  async function decide(decision: 'ACCEPT' | 'REWORK') {
    if (!candidate || !onDecideReview || reviewBusy) return;
    const id = candidate.id; activeResultRef.current = id; setReviewBusy(true);
    const response = await onDecideReview(id, decision, reviewComment);
    if (activeResultRef.current !== id) return;
    setReviewBusy(false);
    if (!response.ok) { setResultError(response.error); return; }
    setReviews((value) => [...value, response.data]);
    if (onGetResult) { const current = await onGetResult(id); if (activeResultRef.current === id && current.ok) setCandidate(current.data); }
  }
  async function submitCandidateForReview() {
    if (!candidate || !onSubmitResult || resultSubmitting) return;
    const id = candidate.id; activeResultRef.current = id; setResultSubmitting(true);
    const response = await onSubmitResult(id);
    if (activeResultRef.current !== id) return;
    setResultSubmitting(false);
    if (!response.ok) { setResultError(response.error); return; }
    setCandidate(response.data); setResultError(undefined);
  }
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
            <dt>依赖任务</dt>
            <dd>{task.dependencyIds.length ? task.dependencyIds.join('；') : '无'}</dd>
          </dl>
          {task.status === 'TODO' && (
            <button className="primary" onClick={() => void onStart(task).then((result) => {
              if (result && !result.ok) setError(result.error);
            })}>
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
          <section className="artifact-panel">
            <p className="eyebrow">RESULT CANDIDATE · EMPLOYEE CONFIRMATION</p>
            <p>选择已登记的 Artifact 后明确创建候选结果。不会提交人工评审、不会验收，也不会改变任务状态。</p>
            {artifacts.map((artifact) => <label key={`result-${artifact.id}`}><input type="checkbox" disabled={resultSubmitting} checked={selectedArtifactIds.includes(artifact.id)} onChange={() => { setSelectedArtifactIds((ids) => ids.includes(artifact.id) ? ids.filter((id) => id !== artifact.id) : [...ids, artifact.id]); }} /> {artifact.relativePath}</label>)}
            <button className="primary" disabled={!selectedArtifactIds.length || resultSubmitting} onClick={() => {
              if (!task) return;
              const attempt = resultConfirmationAttempt(selectedArtifactIds, pendingAttempt, () => crypto.randomUUID());
              setAttempt(attempt);
              void submitResult(attempt);
            }}>Create Result Candidate</button>
            {resultError && <div className="result-error"><p>{resultError.message}</p><button onClick={() => pendingAttempt && void submitResult(pendingAttempt)} disabled={!pendingAttempt || resultSubmitting}>Retry Result Candidate</button></div>}
            {candidate && <p>Result Candidate: {candidate.status} · {candidate.id}</p>}
            {candidate?.status === 'CANDIDATE' && onSubmitResult && <button disabled={resultSubmitting} onClick={() => void submitCandidateForReview()}>Submit for Human Review</button>}
            {candidate?.status === 'HUMAN_REVIEW' && <p>Waiting for Human Review. This does not complete the Task.</p>}
            <label>Open Result ID<input value={resultIdInput} onInput={(event) => setResultIdInput(event.currentTarget.value)} placeholder="Result ID" /></label>
            <button disabled={reviewBusy} onClick={() => void openResult(resultIdInput)}>Open Result</button>
            {candidate && <section><p>Result {candidate.status} · Creator {candidate.createdByUserId} · Submitted {candidate.submittedByUserId || '—'} {candidate.submittedAt || ''}</p><p>Artifacts: {candidate.artifactIds.join(', ')}</p><p>Task status is not changed by Human Review.</p>{reviews.map((review) => <p key={review.id}>{review.decision} · {review.reviewerId} · {review.comment || 'No comment'}</p>)}{candidate.status === 'HUMAN_REVIEW' && onDecideReview && <><label>Review comment<textarea value={reviewComment} onInput={(event) => setReviewComment(event.currentTarget.value)} /></label><button disabled={reviewBusy} onClick={() => void decide('ACCEPT')}>Accept Result</button><button disabled={reviewBusy} onClick={() => void decide('REWORK')}>Request Rework</button></>}</section>}
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
