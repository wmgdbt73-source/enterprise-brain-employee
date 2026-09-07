import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CollaborationPanel } from '../../apps/desktop/src/renderer/src/features/collaboration/CollaborationPanel.js';
import type { EnterpriseBrainBridge } from '../../apps/desktop/src/shared/enterprise-brain.js';

let dom: JSDOM | undefined;
let root: Root | undefined;
type PageResult = { ok: true; data: { items: unknown[]; nextCursor: null } };
afterEach(async () => {
  await act(async () => root?.unmount());
  dom?.window.close();
  root = undefined;
  dom = undefined;
});

describe('CollaborationPanel', () => {
  it('renders Dynamic conversations, project activity, action queue, and reminders', async () => {
    mount();
    install();
    await render('dynamic', 'project-a');
    expect(text()).toContain('群聊');
    expect(text()).toContain('Design sync');
    expect(text()).toContain('Agent finished');
    expect(text()).toContain('Confirm artifact');
    expect(text()).toContain('Review release');
  });
  it('shows loading, empty, recoverable failure with retry, and permission denied', async () => {
    let resolve!: (value: PageResult) => void;
    const pending = new Promise<PageResult>((done) => {
      resolve = done;
    });
    mount();
    install({ conversations: vi.fn(() => pending) });
    await render('dynamic', 'project-a');
    expect(text()).toContain('正在加载协作信息');
    await act(async () => resolve(page([])));
    expect(text()).toContain('还没有群聊');
    install({
      conversations: vi
        .fn()
        .mockResolvedValueOnce(failure('API_UNAVAILABLE'))
        .mockResolvedValueOnce(page([]))
    });
    await render('dynamic', 'project-b');
    expect(text()).toContain('无法连接 Employee API');
    await click('重试');
    expect(text()).toContain('还没有群聊');
    install({ conversations: vi.fn(() => failure('FORBIDDEN')) });
    await render('dynamic', 'project-a');
    expect(text()).toContain('没有访问权限');
  });
  it('ignores a stale context response after switching projects', async () => {
    let resolveA!: (value: PageResult) => void;
    const old = new Promise<PageResult>((done) => {
      resolveA = done;
    });
    const conversations = vi.fn((query: { scopeId?: string }) =>
      query.scopeId === 'project-a'
        ? old
        : page([
            { conversationId: 'b', title: 'Project B', type: 'HUMAN_GROUP' }
          ])
    );
    mount();
    install({ conversations });
    await render('dynamic', 'project-a');
    await render('dynamic', 'project-b');
    await act(async () =>
      resolveA(
        page([{ conversationId: 'a', title: 'Project A', type: 'HUMAN_GROUP' }])
      )
    );
    expect(text()).toContain('Project B');
    expect(text()).not.toContain('Project A');
  });
  it('represents Activity and WorkQueue failures instead of showing empty data', async () => {
    mount();
    install({
      swarmEvents: vi.fn(() => failure('FORBIDDEN')),
      actionItems: vi.fn(() => failure('API_UNAVAILABLE')),
      reminders: vi.fn(() => failure('FORBIDDEN'))
    });
    await render('dynamic', 'project-a');
    expect(text()).toContain('没有活动访问权限');
    expect(text()).toContain('无法连接 Employee API');
    expect(text()).toContain('没有访问权限');
  });
  it('surfaces a failed notification mark-read instead of discarding it', async () => {
    mount();
    install({
      notifications: vi.fn(() =>
        page([
          {
            notificationId: 'notice',
            title: 'Mention',
            body: 'Please review',
            createdAt: '2026-01-01T00:00:00.000Z'
          }
        ])
      ),
      markNotificationRead: vi.fn(() => failure('API_UNAVAILABLE'))
    });
    await render('notifications');
    await click('Mention');
    expect(text()).toContain('无法连接 Employee API');
  });
});

function mount() {
  dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: 'http://desktop.test'
  });
  Object.assign(globalThis, {
    window: dom.window,
    document: dom.window.document,
    HTMLElement: dom.window.HTMLElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    React
  });
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  root = createRoot(document.getElementById('root')!);
}
async function render(
  mode: 'dynamic' | 'notifications' | 'library',
  projectId?: string
) {
  await act(async () =>
    root?.render(createElement(CollaborationPanel, { mode, projectId }))
  );
  await act(async () => {
    await Promise.resolve();
  });
}
async function click(name: string) {
  const button = [...document.querySelectorAll('button')].find((item) =>
    item.textContent?.includes(name)
  );
  if (!button) throw new Error(`Missing ${name}`);
  await act(async () => button.click());
}
function text() {
  return document.body.textContent ?? '';
}
function page(items: unknown[]): PageResult {
  return { ok: true as const, data: { items, nextCursor: null } };
}
function failure(code: string) {
  return {
    ok: false as const,
    error: { code, message: 'API unavailable', details: {} }
  };
}
function install(overrides: Record<string, unknown> = {}) {
  const collaboration = {
    conversations: vi.fn(() =>
      page([
        {
          conversationId: 'conversation',
          title: 'Design sync',
          type: 'HUMAN_GROUP'
        }
      ])
    ),
    messages: vi.fn(() => page([])),
    sendMessage: vi.fn(() => ({ ok: true as const, data: {} })),
    notifications: vi.fn(() => page([])),
    markNotificationRead: vi.fn(() => ({ ok: true as const, data: {} })),
    reminders: vi.fn(() =>
      page([
        {
          reminderId: 'reminder',
          title: 'Review release',
          dueAt: '2026-01-01T00:00:00.000Z'
        }
      ])
    ),
    actionItems: vi.fn(() => ({
      ok: true as const,
      data: [
        {
          actionItemId: 'action',
          title: 'Confirm artifact',
          type: 'CONFIRM_ARTIFACT'
        }
      ]
    })),
    library: vi.fn(() => page([])),
    swarmEvents: vi.fn(() =>
      page([
        { swarmEventId: 'event', title: 'Agent finished', summary: 'Done' }
      ])
    ),
    ...overrides
  };
  window.enterpriseBrain = { collaboration } as unknown as EnterpriseBrainBridge;
}
