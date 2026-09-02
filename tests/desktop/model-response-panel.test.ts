import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { ModelResponsePanel } from '../../apps/desktop/src/renderer/src/features/tasks/ModelResponsePanel.js';
import type { AvailableAgentContract, ModelInvocationContract, TaskContract } from '../../packages/contracts/src/index.js';
import type { DesktopResult } from '../../apps/desktop/src/shared/enterprise-brain.js';

const agent: AvailableAgentContract = { id: 'agent-a', key: 'assistant', name: 'Task Assistant', version: 1, runtimeProfile: 'READ_ONLY_WORK', assignmentSources: ['USER'] };
const taskA = task('task-a'); const taskB = task('task-b');
let dom: JSDOM | undefined; let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); root = undefined; dom?.window.close(); dom = undefined; });

describe('Task model response panel', () => {
  it('submits a Task model response once and renders the completed output', async () => {
    const calls: Array<{ key: string; agentId: string; prompt: string }> = [];
    mount(); await render(taskA, async (_task, agentId, prompt, key) => { calls.push({ key, agentId, prompt }); return success(invocation('COMPLETED')); });
    await input('[data-testid="model-prompt"]', ' Build a plan '); await click('[data-testid="ask-agent"]');
    expect(calls).toHaveLength(1); expect(calls[0]).toMatchObject({ agentId: 'agent-a', prompt: 'Build a plan' }); expect(text()).toContain('Suggestion');
  });
  it('preserves the idempotency key after an uncertain network failure', async () => {
    const keys: string[] = []; let count = 0;
    mount(); await render(taskA, async (_task, _agentId, _prompt, key) => { keys.push(key); count += 1; return count === 1 ? failure('API_UNAVAILABLE') : success(invocation('COMPLETED')); });
    await input('[data-testid="model-prompt"]', 'Plan'); await click('[data-testid="ask-agent"]'); await click('[data-testid="retry-model-response"]');
    expect(keys).toHaveLength(2); expect(keys[1]).toBe(keys[0]);
  });
  it('starts a new attempt after a persisted failed invocation', async () => {
    const keys: string[] = [];
    mount(); await render(taskA, async (_task, _agentId, _prompt, key) => { keys.push(key); return success(invocation('FAILED')); });
    await input('[data-testid="model-prompt"]', 'Plan'); await click('[data-testid="ask-agent"]'); await click('[data-testid="try-model-again"]');
    expect(keys).toHaveLength(2); expect(keys[1]).not.toBe(keys[0]);
  });
  it('ignores delayed model responses after switching Tasks or authentication generations', async () => {
    let resolve!: (result: DesktopResult<ModelInvocationContract>) => void;
    mount(); await render(taskA, () => new Promise(done => { resolve = done; }));
    await input('[data-testid="model-prompt"]', 'Plan'); await click('[data-testid="ask-agent"]'); await render(taskB, async () => success(invocation('COMPLETED', 'task-b')));
    await act(async () => resolve(success(invocation('COMPLETED', 'task-a'))));
    expect(text()).not.toContain('task-a-response');
  });
  it('loads and refreshes Task model response history without unmounting the Workspace', async () => {
    let calls = 0;
    mount(); await render(taskA, async () => success(invocation('COMPLETED')), async () => { calls += 1; return calls === 1 ? success([invocation('COMPLETED')]) : failure('API_UNAVAILABLE'); });
    expect(text()).toContain('Suggestion'); await click('[data-testid="refresh-model-responses"]');
    expect(document.querySelector('[data-testid="model-response-panel"]')).not.toBeNull(); expect(text()).toContain('API unavailable');
  });
  it('clears model response state on logout or authentication loss', async () => {
    mount(); await render(taskA, async () => success(invocation('COMPLETED'))); await input('[data-testid="model-prompt"]', 'Plan'); await click('[data-testid="ask-agent"]');
    await act(async () => root?.unmount()); root = createRoot(document.getElementById('root')!); await render(taskB, async () => success(invocation('COMPLETED', 'task-b')));
    expect(text()).not.toContain('Suggestion'); expect((document.querySelector('[data-testid="model-prompt"]') as HTMLTextAreaElement).value).toBe('');
  });
  it('blocks duplicate submission while a model response is pending', async () => {
    let resolve!: (result: DesktopResult<ModelInvocationContract>) => void; let calls = 0;
    mount(); await render(taskA, () => { calls += 1; return new Promise(done => { resolve = done; }); });
    await input('[data-testid="model-prompt"]', 'Plan'); await click('[data-testid="ask-agent"]'); await click('[data-testid="ask-agent"]'); expect(calls).toBe(1);
    await act(async () => resolve(success(invocation('COMPLETED'))));
  });
});

function mount() { dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://desktop.test' }); Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, React }); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; root = createRoot(document.getElementById('root')!); }
async function render(current: TaskContract, create: (task: TaskContract, agentId: string, prompt: string, key: string) => Promise<DesktopResult<ModelInvocationContract>>, list: (task: TaskContract) => Promise<DesktopResult<ModelInvocationContract[]>> = async () => success([])) { await act(async () => root?.render(createElement(ModelResponsePanel, { task: current, agents: [agent], selectedAgentId: agent.id, onSelectAgent: () => {}, create, list }))); await act(async () => { await Promise.resolve(); }); }
async function click(selector: string) { const button = document.querySelector(selector) as HTMLButtonElement; if (!button) throw new Error(`Missing ${selector}`); await act(async () => button.click()); }
async function input(selector: string, value: string) { const element = document.querySelector(selector) as HTMLTextAreaElement; await act(async () => { const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set; setter?.call(element, value); element.dispatchEvent(new window.Event('input', { bubbles: true })); element.dispatchEvent(new window.Event('change', { bubbles: true })); }); }
function task(id: string): TaskContract { return { id, projectId: 'project', title: id, priority: 'P2', status: 'IN_PROGRESS', acceptanceCriteria: [], dependencyIds: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }; }
function invocation(status: ModelInvocationContract['status'], taskId = 'task-a'): ModelInvocationContract { return { id: `${taskId}-response`, agentRunId: `${taskId}-run`, initiatedByUserId: 'employee', provider: 'FAKE', model: 'fake-model', status, inputText: 'Plan', ...(status === 'COMPLETED' ? { outputText: 'Suggestion', completedAt: '2026-01-01T00:01:00.000Z' } : status === 'FAILED' ? { errorCode: 'MODEL_PROVIDER_FAILED', completedAt: '2026-01-01T00:01:00.000Z' } : {}), createdAt: '2026-01-01T00:00:00.000Z' }; }
function success<T>(data: T): DesktopResult<T> { return { ok: true, data }; }
function failure(code: string): DesktopResult<never> { return { ok: false, error: { code, message: 'API unavailable', details: {} } }; }
function text() { return document.body.textContent ?? ''; }
