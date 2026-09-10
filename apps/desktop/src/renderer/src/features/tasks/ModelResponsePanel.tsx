import { useEffect, useRef, useState } from 'react';
import type { AvailableAgentContract, ModelInvocationContract, TaskContract } from '@enterprise-brain/contracts';
import type { DesktopApiError, DesktopResult } from '../../../../shared/enterprise-brain.js';

type Attempt = { taskId: string; agentId: string; prompt: string; idempotencyKey: string };
const toolLabels: Record<string, string> = {
  get_task_snapshot: 'Read the current task details',
  list_task_artifacts: 'List registered task artifacts'
};

function invocationError(errorCode?: string): string {
  switch (errorCode) {
    case 'MODEL_PROVIDER_NOT_CONFIGURED': return 'The AI service is not configured for this environment.';
    case 'MODEL_PROVIDER_RATE_LIMITED': return 'The AI service is busy. Try again shortly.';
    case 'MODEL_PROVIDER_TIMEOUT': return 'The AI service took too long to respond. Try again.';
    case 'MODEL_TOOL_AUTHORIZATION_REVOKED': return 'A permitted read could not be completed because access changed.';
    case 'MODEL_TOOL_EXECUTION_FAILED': return 'A permitted read could not be completed.';
    case 'MODEL_TOOL_INVALID': return 'The requested tool operation was not permitted.';
    default: return 'The AI response could not be completed. Try again.';
  }
}

function toolStatus(status: NonNullable<ModelInvocationContract['toolCalls']>[number]['status']): string {
  switch (status) {
    case 'PENDING': return 'requested';
    case 'SUCCEEDED': return 'completed';
    case 'FAILED': return 'failed';
    case 'CANCELLED': return 'cancelled';
  }
}

export function ModelExecutionTrace({ invocation }: { invocation: ModelInvocationContract }) {
  const outcome = invocation.status === 'COMPLETED'
    ? 'Suggestion ready'
    : invocation.status === 'FAILED'
      ? invocationError(invocation.errorCode)
      : 'Generating a suggestion';
  return <section className="model-execution-trace" data-testid={`model-execution-trace-${invocation.id}`} aria-label="AI execution trace">
    <p><strong>Execution trace</strong></p>
    <ol>
      <li>Execution started</li>
      <li>{invocation.status === 'RUNNING' ? 'Model is preparing a response' : 'Model response processed'}</li>
      {(invocation.toolCalls ?? []).map((tool) => <li key={`${tool.sequence}-${tool.name}`}>
        {toolLabels[tool.name] ?? 'Permitted read tool'}: {toolStatus(tool.status)}
      </li>)}
      <li>{outcome}</li>
    </ol>
    {invocation.status === 'COMPLETED' && invocation.outputText && <p>{invocation.outputText}</p>}
    {invocation.status === 'FAILED' && <p className="agent-error">{outcome}</p>}
    <p className="muted">Tool details and file contents stay protected. AI output is a suggestion, not a result approval.</p>
  </section>;
}

export function ModelResponsePanel({ task, agents, selectedAgentId, onSelectAgent, create, list }: {
  task: TaskContract;
  agents: AvailableAgentContract[];
  selectedAgentId?: string;
  onSelectAgent: (id: string) => void;
  create: (task: TaskContract, agentId: string, prompt: string, idempotencyKey: string) => Promise<DesktopResult<ModelInvocationContract>>;
  list: (task: TaskContract) => Promise<DesktopResult<ModelInvocationContract[]>>;
}) {
  const [prompt, setPrompt] = useState(''); const [items, setItems] = useState<ModelInvocationContract[]>([]); const [attempt, setAttempt] = useState<Attempt>(); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false); const [error, setError] = useState<DesktopApiError>(); const taskIdRef = useRef(task.id); const attemptRef = useRef<Attempt | undefined>(undefined); taskIdRef.current = task.id;
  function setCurrentAttempt(value: Attempt | undefined) { attemptRef.current = value; setAttempt(value); }
  useEffect(() => { setPrompt(''); setItems([]); setCurrentAttempt(undefined); setBusy(false); setLoading(false); setError(undefined); void refresh(); }, [task.id]);
  async function refresh() { const requested = task; setLoading(true); const response = await list(requested); if (taskIdRef.current !== requested.id) return; setLoading(false); if (!response.ok) { setError(response.error); return; } setError(undefined); setItems(response.data); }
  async function submit(value: Attempt) { if (busy) return; const requested = task; setBusy(true); const response = await create(requested, value.agentId, value.prompt, value.idempotencyKey); if (taskIdRef.current !== requested.id || attemptRef.current !== value) return; setBusy(false); if (!response.ok) { setError(response.error); return; } setError(undefined); setItems(previous => [response.data, ...previous.filter(item => item.id !== response.data.id)]); if (response.data.status !== 'FAILED') setCurrentAttempt(undefined); }
  function ask() { const normalized = prompt.trim(); if (!selectedAgentId || !normalized || normalized.length > 8000 || busy) return; const value = { taskId: task.id, agentId: selectedAgentId, prompt: normalized, idempotencyKey: crypto.randomUUID() }; setCurrentAttempt(value); void submit(value); }
  function tryAgain() { const normalized = prompt.trim(); if (!selectedAgentId || !normalized || busy) return; const value = { taskId: task.id, agentId: selectedAgentId, prompt: normalized, idempotencyKey: crypto.randomUUID() }; setCurrentAttempt(value); void submit(value); }
  function changePrompt(value: string) { setPrompt(value); if (attempt && value.trim() !== attempt.prompt) setCurrentAttempt(undefined); }
  return <section className="artifact-panel" data-testid="model-response-panel">
    <p className="eyebrow">AI RESPONSE · TEXT SUGGESTIONS</p>
    <p>Agent responses are text suggestions only. They do not modify Tasks, files, permissions, or tools.</p>
    <label>Agent<select data-testid="model-agent-select" value={selectedAgentId ?? ''} disabled={busy || agents.length === 0} onChange={event => { onSelectAgent(event.target.value); setCurrentAttempt(undefined); }}><option value="">Select an Agent</option>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name} · v{agent.version}</option>)}</select></label>
    {selectedAgentId && <p data-testid="selected-model-agent">Selected Agent: {agents.find(agent => agent.id === selectedAgentId)?.name ?? 'Assigned Agent'}</p>}
    <label>Prompt<textarea data-testid="model-prompt" value={prompt} disabled={busy} maxLength={8000} onInput={event => changePrompt(event.currentTarget.value)} /></label>
    <button data-testid="ask-agent" className="primary" disabled={busy || !selectedAgentId || !prompt.trim() || prompt.trim().length > 8000} onClick={ask}>{busy ? 'Asking Agent…' : 'Ask Agent'}</button>
    {attempt && error && <button data-testid="retry-model-response" disabled={busy} onClick={() => void submit(attempt)}>{error.code === 'MODEL_PROVIDER_FAILED' ? 'Try again' : 'Retry'}</button>}
    <button data-testid="refresh-model-responses" disabled={loading} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh responses'}</button>
    {error && <p data-testid="model-response-error" className="agent-error">{error.message}</p>}
    {items[0]?.status === 'FAILED' && !error && <button data-testid="try-model-again" disabled={busy} onClick={tryAgain}>Try again</button>}
    <div data-testid="model-response-history">{items.map(item => <ModelExecutionTrace key={item.id} invocation={item} />)}</div>
  </section>;
}
