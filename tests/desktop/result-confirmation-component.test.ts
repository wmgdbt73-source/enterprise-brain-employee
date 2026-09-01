import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../apps/desktop/src/renderer/src/App.js';
import { TaskDetail } from '../../apps/desktop/src/renderer/src/features/tasks/TaskDetail.js';
import type { EnterpriseBrainBridge } from '../../apps/desktop/src/shared/enterprise-brain.js';
import type { DesktopResult } from '../../apps/desktop/src/shared/enterprise-brain.js';
import type { ArtifactContract, AvailableAgentContract, ProjectContract, ResultContract, ReviewContract, TaskContract } from '../../packages/contracts/src/index.js';

const project: ProjectContract = { id: 'project-a', name: 'Project', status: 'ACTIVE', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const taskA = task('task-a', 'Task A');
const taskB = task('task-b', 'Task B');
const artifact: ArtifactContract = { id: 'artifact-a', projectId: project.id, taskId: taskA.id, agentRunId: 'run-a', sourceToolCallId: 'call-a', type: 'FILE', storageKind: 'LOCAL_WORKSPACE', relativePath: 'brief.md', size: 1, encoding: 'utf-8', sha256: 'a'.repeat(64), version: 1, createdByUserId: 'dev-user', createdAt: '2026-01-01T00:00:00.000Z' };
let dom: JSDOM | undefined;
let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  dom?.window.close();
  dom = undefined;
});

describe('Result confirmation component lifecycle', () => {
  it('retries the exact attempt after API_UNAVAILABLE without replacing the workspace', async () => {
    const calls: Array<{ taskId: string; artifactIds: string[]; key: string }> = [];
    let attempt = 0;
    mount();
    window.enterpriseBrain = bridge({
      results: {
        create: async (taskId, artifactIds, key) => {
          calls.push({ taskId, artifactIds, key });
          attempt += 1;
          return attempt === 1
            ? failure('API_UNAVAILABLE')
            : success(result('result-a', taskId, artifactIds));
        },
        get: async () => failure('UNUSED'),
        submitReview: async () => failure('UNUSED'),
        decide: async () => failure('UNUSED'),
        listReviews: async () => ({ ok: true as const, data: [] })
      }
    });
    await renderApp();
    await clickText('Project');
    await clickText('Task A');
    await clickCheckbox('brief.md');
    await clickText('Create Result Candidate');
    expect(text()).toContain('API unavailable');
    expect(text()).not.toContain('RECOVERABLE ERROR');
    await clickText('Retry Result Candidate');
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
  });

  it('does not let delayed Task A success or error affect Task B, and blocks duplicate submission', async () => {
    let resolveA: ((value: ReturnType<typeof success>) => void) | undefined;
    const calls: Array<{ taskId: string; key: string }> = [];
    mount();
    const onCreate = async (value: TaskContract, _ids: string[], key: string) => {
      calls.push({ taskId: value.id, key });
      return new Promise<ReturnType<typeof success>>((resolve) => { resolveA = resolve; });
    };
    await renderDetail(taskA, onCreate);
    await clickCheckbox('brief.md');
    await clickText('Create Result Candidate');
    await clickText('Create Result Candidate');
    expect(calls).toHaveLength(1);
    await renderDetail(taskB, onCreate);
    await act(async () => resolveA?.(success(result('result-a', taskA.id, [artifact.id]))));
    expect(text()).toContain('Task B');
    expect(text()).not.toContain('result-a');
  });

  it('does not let a delayed Task A error appear in Task B', async () => {
    let resolveA: ((value: ReturnType<typeof failure>) => void) | undefined;
    mount();
    const onCreate = async () => new Promise<ReturnType<typeof failure>>((resolve) => { resolveA = resolve; });
    await renderDetail(taskA, onCreate);
    await clickCheckbox('brief.md');
    await clickText('Create Result Candidate');
    await renderDetail(taskB, onCreate);
    await act(async () => resolveA?.(failure('API_UNAVAILABLE')));
    expect(text()).toContain('Task B');
    expect(text()).not.toContain('API unavailable');
  });

  it('keeps a dependency block local and clears it after a successful retry', async () => {
    let calls = 0;
    mount();
    await act(async () => root?.render(createElement(TaskDetail, {
      task: taskA, onStart: async () => {
        calls += 1;
        return calls === 1 ? failure('TASK_DEPENDENCY_BLOCKED') : { ok: true as const, data: { ...taskA, status: 'IN_PROGRESS' as const } };
      }, artifacts: [], onReadFile: async () => undefined, onRegisterArtifact: async () => {}, onPrepareWrite: async () => undefined, onApproveWrite: async () => {}, onRejectWrite: async () => {}, onCreateResult: async () => failure('UNUSED')
    })));
    await clickText('Start Task');
    expect(text()).toContain('API unavailable');
    await clickText('Start Task');
    expect(text()).not.toContain('API unavailable');
  });

  it('refreshes the selected Task through the typed App bridge after submit and review decisions', async () => {
    let currentTask: TaskContract = { ...taskA, status: 'IN_PROGRESS' };
    let currentResult: ResultContract = result('result-status', taskA.id, [artifact.id]);
    const refreshes: string[] = [];
    mount();
    window.enterpriseBrain = bridge({
      tasks: {
        list: async () => ({ ok: true as const, data: [currentTask] }),
        get: async (taskId) => {
          refreshes.push(taskId);
          return { ok: true as const, data: currentTask };
        },
        create: async () => ({ ok: true as const, data: currentTask }),
        start: async () => ({ ok: true as const, data: currentTask })
      },
      results: {
        create: async () => ({ ok: true as const, data: currentResult }),
        submitReview: async () => {
          currentResult = { ...currentResult, status: 'HUMAN_REVIEW', submittedByUserId: 'dev-user', submittedAt: '2026-01-02T00:00:00.000Z' };
          currentTask = { ...currentTask, status: 'READY_FOR_REVIEW' };
          return { ok: true as const, data: currentResult };
        },
        get: async () => ({ ok: true as const, data: currentResult }),
        listReviews: async () => ({ ok: true as const, data: [] }),
        decide: async (_resultId, decision) => {
          currentResult = { ...currentResult, status: decision === 'ACCEPT' ? 'ACCEPTED' : 'REWORK' };
          currentTask = { ...currentTask, status: decision === 'ACCEPT' ? 'ACCEPTED' : 'IN_PROGRESS' };
          return { ok: true as const, data: { id: `review-${decision}`, resultId: currentResult.id, reviewerId: 'reviewer', decision, reviewedAt: '2026-01-03T00:00:00.000Z' } as ReviewContract };
        }
      }
    });
    await renderApp();
    await clickText('Project');
    await clickText('Task A');
    await clickCheckbox('brief.md');
    await clickText('Create Result Candidate');
    await clickText('Submit for Human Review');
    expect(text()).toContain('READY_FOR_REVIEW');
    await setInput([...document.querySelectorAll('input')].find((element) => (element as HTMLInputElement).placeholder === 'Result ID') as HTMLInputElement, 'result-status');
    await clickText('Open Result');
    await clickText('Accept Result');
    expect(text()).toContain('ACCEPTED');
    expect(refreshes).toEqual([taskA.id, taskA.id]);
  });

  it('refreshes the selected Task as IN_PROGRESS after a REWORK decision', async () => {
    let currentTask: TaskContract = { ...taskA, status: 'READY_FOR_REVIEW' };
    let currentResult: ResultContract = { ...result('result-rework', taskA.id, [artifact.id]), status: 'HUMAN_REVIEW', submittedByUserId: 'dev-user', submittedAt: '2026-01-02T00:00:00.000Z' };
    mount();
    window.enterpriseBrain = bridge({
      tasks: { list: async () => ({ ok: true as const, data: [currentTask] }), get: async () => ({ ok: true as const, data: currentTask }), create: async () => ({ ok: true as const, data: currentTask }), start: async () => ({ ok: true as const, data: currentTask }) },
      results: {
        create: async () => failure('UNUSED'), submitReview: async () => failure('UNUSED'),
        get: async () => ({ ok: true as const, data: currentResult }), listReviews: async () => ({ ok: true as const, data: [] }),
        decide: async () => {
          currentResult = { ...currentResult, status: 'REWORK' };
          currentTask = { ...currentTask, status: 'IN_PROGRESS' };
          return { ok: true as const, data: { id: 'review-rework', resultId: currentResult.id, reviewerId: 'reviewer', decision: 'REWORK', reviewedAt: '2026-01-03T00:00:00.000Z' } as ReviewContract };
        }
      }
    });
    await renderApp();
    await clickText('Project'); await clickText('Task A');
    await setInput([...document.querySelectorAll('input')].find((element) => (element as HTMLInputElement).placeholder === 'Result ID') as HTMLInputElement, 'result-rework');
    await clickText('Open Result'); await clickText('Request Rework');
    expect(text()).toContain('IN_PROGRESS');
    expect(text()).toContain('REWORK');
  });

  it('opens a Human Review Result by ID and sends an explicit reviewer decision without altering the Task', async () => {
    const humanReview: ResultContract = { ...result('result-review', taskA.id, [artifact.id]), status: 'HUMAN_REVIEW', submittedByUserId: 'dev-user', submittedAt: '2026-01-02T00:00:00.000Z' };
    const decisions: Array<{ id: string; decision: string; comment?: string }> = [];
    mount();
    let getCount = 0; let listCount = 0;
    await act(async () => root?.render(createElement(TaskDetail, { task: taskA, onStart: async () => {}, artifacts: [artifact], onReadFile: async () => undefined, onRegisterArtifact: async () => {}, onPrepareWrite: async () => undefined, onApproveWrite: async () => {}, onRejectWrite: async () => {}, onCreateResult: async () => failure('UNUSED'), onGetResult: async () => { getCount += 1; return success(humanReview); }, onListReviews: async () => { listCount += 1; return { ok: true as const, data: [] }; }, onDecideReview: async (id, decision, comment) => { decisions.push({ id, decision, comment }); return { ok: true as const, data: { id: 'review-1', resultId: id, reviewerId: 'reviewer', decision, ...(comment ? { comment } : {}), reviewedAt: '2026-01-03T00:00:00.000Z' } as ReviewContract }; } })));
    const input = [...document.querySelectorAll('input')].find((element) => (element as HTMLInputElement).placeholder === 'Result ID') as HTMLInputElement;
    await setInput(input, 'result-review'); await clickText('Open Result'); await act(async () => { await Promise.resolve(); });
    await setTextArea(document.querySelector('textarea')!, 'Looks good');
    await clickText('Accept Result');
    expect(getCount).toBeGreaterThan(0); expect(listCount).toBe(1);
    expect(decisions).toEqual([{ id: 'result-review', decision: 'ACCEPT', comment: 'Looks good' }]);
    expect(text()).toContain('Task status is not changed by Human Review.');
  });

  it('blocks duplicate review decisions and ignores a delayed decision after switching tasks', async () => {
    const humanReview: ResultContract = { ...result('result-review', taskA.id, [artifact.id]), status: 'HUMAN_REVIEW', submittedByUserId: 'dev-user', submittedAt: '2026-01-02T00:00:00.000Z' };
    let resolveDecision: ((value: { ok: true; data: ReviewContract }) => void) | undefined;
    let calls = 0;
    mount();
    const props = (task: TaskContract) => ({ task, onStart: async () => {}, artifacts: [artifact], onReadFile: async () => undefined, onRegisterArtifact: async () => {}, onPrepareWrite: async () => undefined, onApproveWrite: async () => {}, onRejectWrite: async () => {}, onCreateResult: async () => failure('UNUSED'), onGetResult: async () => success(humanReview), onListReviews: async () => ({ ok: true as const, data: [] }), onDecideReview: async () => {
      calls += 1;
      return new Promise<{ ok: true; data: ReviewContract }>((resolve) => { resolveDecision = resolve; });
    } });
    await act(async () => root?.render(createElement(TaskDetail, props(taskA))));
    const input = [...document.querySelectorAll('input')].find((element) => (element as HTMLInputElement).placeholder === 'Result ID') as HTMLInputElement;
    await setInput(input, 'result-review'); await clickText('Open Result'); await act(async () => { await Promise.resolve(); });
    await clickText('Accept Result'); await clickText('Accept Result');
    expect(calls).toBe(1);
    await act(async () => root?.render(createElement(TaskDetail, props(taskB))));
    await act(async () => resolveDecision?.({ ok: true, data: { id: 'review-a', resultId: 'result-review', reviewerId: 'reviewer', decision: 'ACCEPT', reviewedAt: '2026-01-03T00:00:00.000Z' } }));
    expect(text()).toContain('Task B');
    expect(text()).not.toContain('review-a');
  });

  it('renders catalog Agents, forwards the selected agent id, and disables selection when none are available', async () => {
    const selected: string[] = [];
    const props = (agents: AvailableAgentContract[]) => ({
      task: taskA, onStart: async () => {}, artifacts: [artifact], onReadFile: async () => undefined,
      onRegisterArtifact: async () => {}, onPrepareWrite: async () => undefined,
      onApproveWrite: async () => {}, onRejectWrite: async () => {}, onCreateResult: async () => failure('UNUSED'),
      agents, selectedAgentId: agents[0]?.id, onSelectAgent: (id: string) => selected.push(id)
    });
    const catalog = [
      { id: 'agent-reader', key: 'reader', name: 'Research Reader', version: 1, runtimeProfile: 'READ_ONLY_WORK' as const, assignmentSources: ['ORGANIZATION' as const] },
      { id: 'agent-writer', key: 'writer', name: 'Confirmed Writer', version: 1, runtimeProfile: 'CONFIRMED_WRITE_WORK' as const, assignmentSources: ['USER' as const] }
    ];
    mount();
    await act(async () => root?.render(createElement(TaskDetail, props(catalog))));
    expect(text()).toContain('Research Reader · READ_ONLY_WORK');
    const select = document.querySelector('select') as HTMLSelectElement;
    await act(async () => { select.value = 'agent-writer'; select.dispatchEvent(new window.Event('change', { bubbles: true })); });
    expect(selected).toEqual(['agent-writer']);
    await act(async () => root?.render(createElement(TaskDetail, props([]))));
    expect((document.querySelector('select') as HTMLSelectElement).disabled).toBe(true);
    expect(text()).toContain('No available Agent');
  });
});

function mount() {
  dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://desktop.test' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: dom.window.navigator });
  Object.assign(globalThis, { React });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.getElementById('root')!);
}
async function setInput(input: HTMLInputElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    input.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
}
async function setTextArea(textarea: HTMLTextAreaElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), 'value')?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
async function renderApp() { await act(async () => root?.render(createElement(App))); }
async function renderDetail(value: TaskContract, onCreate: (task: TaskContract, ids: string[], key: string) => Promise<DesktopResult<ResultContract>>) {
  await act(async () => root?.render(createElement(TaskDetail, { task: value, onStart: async () => {}, artifacts: [artifact], onReadFile: async () => undefined, onRegisterArtifact: async () => {}, onPrepareWrite: async () => undefined, onApproveWrite: async () => {}, onRejectWrite: async () => {}, onCreateResult: onCreate })));
}
async function clickText(value: string) {
  const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(value));
  if (!button) throw new Error(`Missing button ${value}`);
  await act(async () => button.click());
}
async function clickCheckbox(labelText: string) {
  const label = [...document.querySelectorAll('label')].find((item) => item.textContent?.includes(labelText));
  const checkbox = label?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
  if (!checkbox) throw new Error('Missing Artifact checkbox');
  await act(async () => checkbox.click());
}
function text() { return document.body.textContent ?? ''; }
function task(id: string, title: string): TaskContract { return { id, projectId: project.id, title, priority: 'P2', status: 'TODO', acceptanceCriteria: [], dependencyIds: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }; }
function result(id: string, taskId: string, artifactIds: string[]): ResultContract { return { id, projectId: project.id, taskId, artifactIds, status: 'CANDIDATE', createdByUserId: 'dev-user', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }; }
function success(value: ResultContract) { return { ok: true as const, data: value }; }
function failure(code: string) { return { ok: false as const, error: { code, message: 'API unavailable', details: {} } }; }
function bridge(overrides: Partial<EnterpriseBrainBridge>): EnterpriseBrainBridge {
  const ok = async () => ({ ok: true as const, data: [] });
  return {
    runtime: { getInfo: async () => ({ ok: true, data: { runtime: 'desktop', platform: 'test', appVersion: '1' } }) },
    auth: { currentUser: async () => ({ ok: true as const, data: { id: 'dev-user', name: 'Development Employee', systemRole: 'EMPLOYEE' } }), login: async () => failure('UNUSED'), logout: async () => ({ ok: true as const, data: undefined }) },
    projects: { list: async () => ({ ok: true, data: [project] }), get: async () => ({ ok: true, data: project }), create: async () => ({ ok: true, data: project }) },
    tasks: { list: async () => ({ ok: true, data: [taskA] }), get: async () => ({ ok: true, data: taskA }), create: async () => ({ ok: true, data: taskA }), start: async () => ({ ok: true, data: taskA }) },
    workspace: { get: async () => ({ ok: true, data: null }), select: async () => ({ ok: true, data: { cancelled: true } }), unbind: async () => ({ ok: true, data: undefined }), listDirectory: ok, readFile: async () => failure('UNUSED') },
    agents: { run: async () => failure('UNUSED') }, artifacts: { register: async () => failure('UNUSED'), listForTask: async () => ({ ok: true, data: [artifact] }) }, results: { create: async () => failure('UNCONFIGURED'), get: async () => failure('UNUSED'), submitReview: async () => failure('UNUSED'), decide: async () => failure('UNUSED'), listReviews: async () => ({ ok: true, data: [] }) }, confirmedWrites: { prepare: async () => failure('UNUSED'), approve: async () => failure('UNUSED'), reject: async () => failure('UNUSED') },
    ...overrides
  } as EnterpriseBrainBridge;
}
