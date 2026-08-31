import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../apps/desktop/src/renderer/src/App.js';
import type { EnterpriseBrainBridge } from '../../apps/desktop/src/shared/enterprise-brain.js';

let dom: JSDOM | undefined; let root: Root | undefined;
afterEach(async () => { await act(async () => root?.unmount()); dom?.window.close(); root = undefined; dom = undefined; });

describe('desktop session identity boundary', () => {
  it('starts signed out, logs in through the typed bridge, and exposes no token', async () => {
    mount(); let logoutCalls = 0;
    window.enterpriseBrain = bridge({
      auth: {
        currentUser: async () => failure('AUTHENTICATION_REQUIRED'),
        login: async () => ({ ok: true as const, data: { id: 'employee', name: 'Employee', systemRole: 'EMPLOYEE' } }),
        logout: async () => { logoutCalls += 1; return { ok: true as const, data: undefined }; }
      }
    });
    await render(); expect(text()).toContain('Sign in');
    const inputs = [...document.querySelectorAll('input')] as HTMLInputElement[];
    await input(inputs[0], 'employee@example.test'); await input(inputs[1], 'password'); await click('Sign in');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(text()).toContain('Employee'); expect(text()).not.toContain('Bearer');
    await click('Sign out'); expect(logoutCalls).toBe(1); expect(text()).toContain('Sign in');
  });
  it('globally clears the shell when any protected capability reports authentication loss', async () => {
    let notify!: () => void;
    mount(); window.enterpriseBrain = bridge({ auth: { currentUser: async () => ({ ok: true as const, data: { id: 'employee', name: 'Employee', systemRole: 'EMPLOYEE' } }), login: async () => failure('AUTHENTICATION_REQUIRED'), logout: async () => ({ ok: true as const, data: undefined }), onAuthenticationLost: (listener) => { notify = listener; return () => undefined; } } });
    await render(); await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(text()).toContain('Employee');
    await act(async () => notify());
    expect(text()).toContain('Sign in'); expect(text()).not.toContain('Sign out · Employee');
  });
  it('ignores delayed startup identity and project responses after authentication loss', async () => {
    let identityDone!: (value: ReturnType<typeof successUser>) => void; let lost!: () => void;
    const identity = new Promise<ReturnType<typeof successUser>>((resolve) => { identityDone = resolve; });
    mount(); window.enterpriseBrain = bridge({ auth: { currentUser: async () => identity, login: async () => failure('AUTHENTICATION_REQUIRED'), logout: async () => ({ ok: true as const, data: undefined }), onAuthenticationLost: (listener) => { lost = listener; return () => undefined; } } });
    await render(); await act(async () => lost());
    await act(async () => identityDone(successUser()));
    expect(text()).toContain('Sign in'); expect(text()).not.toContain('Sign out · Employee');
  });
  it('ignores a delayed projects list after auth loss and a newer login', async () => {
    type ProjectsResult = Awaited<ReturnType<EnterpriseBrainBridge['projects']['list']>>;
    let resolveProjects!: (value: ProjectsResult) => void; let lost!: () => void;
    const projects = new Promise<ProjectsResult>((resolve) => { resolveProjects = resolve; }); let listCalls = 0;
    mount(); window.enterpriseBrain = bridge({ auth: { currentUser: async () => successUser(), login: async () => successUser(), logout: async () => ({ ok: true as const, data: undefined }), onAuthenticationLost: (listener) => { lost = listener; return () => undefined; } }, projects: { list: async () => ++listCalls === 1 ? projects : ({ ok: true as const, data: [] }), get: async () => failure('UNUSED'), create: async () => failure('UNUSED') } });
    await render(); await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    await act(async () => lost());
    const inputs = [...document.querySelectorAll('input')] as HTMLInputElement[]; await input(inputs[0], 'employee@example.test'); await input(inputs[1], 'password'); await click('Sign in');
    await act(async () => resolveProjects({ ok: true as const, data: [{ id: 'old-project', name: 'Old Project', status: 'ACTIVE', createdAt: 'x', updatedAt: 'x' }] }));
    expect(text()).not.toContain('Old Project');
  });
  it('keeps invalid credentials recoverable and blocks duplicate login submit while pending', async () => {
    type LoginResult = Awaited<ReturnType<EnterpriseBrainBridge['auth']['login']>>;
    let resolveLogin!: (value: LoginResult) => void; let calls = 0;
    const login = new Promise<LoginResult>((resolve) => { resolveLogin = resolve; });
    mount(); window.enterpriseBrain = bridge({ auth: { currentUser: async () => failure('AUTHENTICATION_REQUIRED'), login: async () => { calls += 1; return login; }, logout: async () => ({ ok: true as const, data: undefined }) } });
    await render(); await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); const inputs = [...document.querySelectorAll('input')] as HTMLInputElement[]; await input(inputs[0], 'employee@example.test'); await input(inputs[1], 'bad'); await click('Sign in'); await act(async () => (document.querySelector('button') as HTMLButtonElement).click());
    expect(calls).toBe(1); await act(async () => { resolveLogin(failure('AUTHENTICATION_REQUIRED')); await new Promise((resolve) => setTimeout(resolve, 0)); });
    const loginButton = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('Sign in')) as HTMLButtonElement;
    expect(text()).toContain('Sign in'); expect(loginButton.disabled).toBe(false);
  });
});
function successUser() { return { ok: true as const, data: { id: 'employee', name: 'Employee', systemRole: 'EMPLOYEE' as const } }; }
function mount() { dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://desktop.test' }); Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, React }); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; root = createRoot(document.getElementById('root')!); }
async function render() { await act(async () => root?.render(createElement(App))); }
async function input(element: HTMLInputElement, value: string) { await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set?.call(element, value); element.dispatchEvent(new window.Event('input', { bubbles: true })); element.dispatchEvent(new window.Event('change', { bubbles: true })); }); }
async function click(name: string) { const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(name)); if (!button) throw new Error(`Missing ${name}`); await act(async () => button.click()); }
function text() { return document.body.textContent ?? ''; }
function failure(code: string) { return { ok: false as const, error: { code, message: 'Authentication is required', details: {} } }; }
function bridge(overrides: Partial<EnterpriseBrainBridge>): EnterpriseBrainBridge { const current = { id: 'employee', name: 'Employee', systemRole: 'EMPLOYEE' as const }; return { runtime: { getInfo: async () => ({ ok: true as const, data: { runtime: 'desktop', platform: 'test', appVersion: '1' } }) }, auth: { currentUser: async () => ({ ok: true as const, data: current }), login: async () => ({ ok: true as const, data: current }), logout: async () => ({ ok: true as const, data: undefined }) }, projects: { list: async () => ({ ok: true as const, data: [] }), get: async () => failure('UNUSED'), create: async () => failure('UNUSED') }, tasks: { list: async () => ({ ok: true as const, data: [] }), get: async () => failure('UNUSED'), create: async () => failure('UNUSED'), start: async () => failure('UNUSED') }, workspace: { get: async () => ({ ok: true as const, data: null }), select: async () => failure('UNUSED'), unbind: async () => failure('UNUSED'), listDirectory: async () => failure('UNUSED'), readFile: async () => failure('UNUSED') }, agents: { run: async () => failure('UNUSED') }, artifacts: { register: async () => failure('UNUSED'), listForTask: async () => ({ ok: true as const, data: [] }) }, results: { create: async () => failure('UNUSED'), get: async () => failure('UNUSED'), submitReview: async () => failure('UNUSED'), decide: async () => failure('UNUSED'), listReviews: async () => ({ ok: true as const, data: [] }) }, confirmedWrites: { prepare: async () => failure('UNUSED'), approve: async () => failure('UNUSED'), reject: async () => failure('UNUSED') }, ...overrides } as EnterpriseBrainBridge; }
