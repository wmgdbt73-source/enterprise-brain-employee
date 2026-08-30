import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../apps/desktop/src/renderer/src/App.js';
import { TaskDetail } from '../../apps/desktop/src/renderer/src/features/tasks/TaskDetail.js';
import type { EnterpriseBrainBridge } from '../../apps/desktop/src/shared/enterprise-brain.js';
import type { DesktopResult } from '../../apps/desktop/src/shared/enterprise-brain.js';
import type { ArtifactContract, ProjectContract, ResultContract, ReviewContract, TaskContract } from '../../packages/contracts/src/index.js';

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

  it('renders a Human Review Result and sends an explicit reviewer decision without altering the Task', async () => {
    const humanReview: ResultContract = { ...result('result-review', taskA.id, [artifact.id]), status: 'HUMAN_REVIEW', submittedByUserId: 'dev-user', submittedAt: '2026-01-02T00:00:00.000Z' };
    const decisions: Array<{ id: string; decision: string; comment?: string }> = [];
    mount();
    await act(async () => root?.render(createElement(TaskDetail, { task: taskA, onStart: async () => {}, artifacts: [artifact], onReadFile: async () => undefined, onRegisterArtifact: async () => {}, onPrepareWrite: async () => undefined, onApproveWrite: async () => {}, onRejectWrite: async () => {}, onCreateResult: async () => success(humanReview), onGetResult: async () => success(humanReview), onListReviews: async () => ({ ok: true as const, data: [] }), onDecideReview: async (id, decision, comment) => { decisions.push({ id, decision, comment }); return { ok: true as const, data: { id: 'review-1', resultId: id, reviewerId: 'reviewer', decision, ...(comment ? { comment } : {}), reviewedAt: '2026-01-03T00:00:00.000Z' } as ReviewContract }; } })));
    await clickCheckbox('brief.md'); await clickText('Create Result Candidate'); await clickText('Accept Result');
    expect(decisions).toEqual([{ id: 'result-review', decision: 'ACCEPT', comment: '' }]);
    expect(text()).toContain('Task status is not changed by Human Review.');
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
    projects: { list: async () => ({ ok: true, data: [project] }), get: async () => ({ ok: true, data: project }), create: async () => ({ ok: true, data: project }) },
    tasks: { list: async () => ({ ok: true, data: [taskA] }), get: async () => ({ ok: true, data: taskA }), create: async () => ({ ok: true, data: taskA }), start: async () => ({ ok: true, data: taskA }) },
    workspace: { get: async () => ({ ok: true, data: null }), select: async () => ({ ok: true, data: { cancelled: true } }), unbind: async () => ({ ok: true, data: undefined }), listDirectory: ok, readFile: async () => failure('UNUSED') },
    agents: { run: async () => failure('UNUSED') }, artifacts: { register: async () => failure('UNUSED'), listForTask: async () => ({ ok: true, data: [artifact] }) }, results: { create: async () => failure('UNCONFIGURED'), get: async () => failure('UNUSED'), submitReview: async () => failure('UNUSED'), decide: async () => failure('UNUSED'), listReviews: async () => ({ ok: true, data: [] }) }, confirmedWrites: { prepare: async () => failure('UNUSED'), approve: async () => failure('UNUSED'), reject: async () => failure('UNUSED') },
    ...overrides
  } as EnterpriseBrainBridge;
}
