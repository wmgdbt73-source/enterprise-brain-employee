import { useEffect, useRef, useState } from 'react';
import type { AvailableAgentContract, ModelInvocationContract, TaskContract } from '@enterprise-brain/contracts';
import type { DesktopApiError, DesktopResult } from '../../../../shared/enterprise-brain.js';

type Attempt = { taskId: string; agentId: string; prompt: string; idempotencyKey: string };
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
    <label>Prompt<textarea data-testid="model-prompt" value={prompt} disabled={busy} maxLength={8000} onInput={event => changePrompt(event.currentTarget.value)} /></label>
    <button data-testid="ask-agent" className="primary" disabled={busy || !selectedAgentId || !prompt.trim() || prompt.trim().length > 8000} onClick={ask}>{busy ? 'Asking Agent…' : 'Ask Agent'}</button>
    {attempt && error && <button data-testid="retry-model-response" disabled={busy} onClick={() => void submit(attempt)}>{error.code === 'MODEL_PROVIDER_FAILED' ? 'Try again' : 'Retry'}</button>}
    <button data-testid="refresh-model-responses" disabled={loading} onClick={() => void refresh()}>{loading ? 'Refreshing…' : 'Refresh responses'}</button>
    {error && <p data-testid="model-response-error" className="agent-error">{error.message}</p>}
    {items[0]?.status === 'FAILED' && !error && <button data-testid="try-model-again" disabled={busy} onClick={tryAgain}>Try again</button>}
    <ul data-testid="model-response-history">{items.map(item => <li key={item.id}><strong>{item.status}</strong> · {item.model} · {item.createdAt}{item.completedAt ? ` · ${item.completedAt}` : ''}{item.status === 'COMPLETED' ? <p>{item.outputText}</p> : item.status === 'FAILED' ? <p>{item.errorCode}</p> : <p>RUNNING</p>}</li>)}</ul>
  </section>;
}
