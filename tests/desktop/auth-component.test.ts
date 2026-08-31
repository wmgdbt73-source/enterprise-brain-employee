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
});
function mount() { dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://desktop.test' }); Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, React }); (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; root = createRoot(document.getElementById('root')!); }
async function render() { await act(async () => root?.render(createElement(App))); }
async function input(element: HTMLInputElement, value: string) { await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set?.call(element, value); element.dispatchEvent(new window.Event('input', { bubbles: true })); element.dispatchEvent(new window.Event('change', { bubbles: true })); }); }
async function click(name: string) { const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(name)); if (!button) throw new Error(`Missing ${name}`); await act(async () => button.click()); }
function text() { return document.body.textContent ?? ''; }
function failure(code: string) { return { ok: false as const, error: { code, message: 'Authentication is required', details: {} } }; }
function bridge(overrides: Partial<EnterpriseBrainBridge>): EnterpriseBrainBridge { const current = { id: 'employee', name: 'Employee', systemRole: 'EMPLOYEE' as const }; return { runtime: { getInfo: async () => ({ ok: true as const, data: { runtime: 'desktop', platform: 'test', appVersion: '1' } }) }, auth: { currentUser: async () => ({ ok: true as const, data: current }), login: async () => ({ ok: true as const, data: current }), logout: async () => ({ ok: true as const, data: undefined }) }, projects: { list: async () => ({ ok: true as const, data: [] }), get: async () => failure('UNUSED'), create: async () => failure('UNUSED') }, tasks: { list: async () => ({ ok: true as const, data: [] }), get: async () => failure('UNUSED'), create: async () => failure('UNUSED'), start: async () => failure('UNUSED') }, workspace: { get: async () => ({ ok: true as const, data: null }), select: async () => failure('UNUSED'), unbind: async () => failure('UNUSED'), listDirectory: async () => failure('UNUSED'), readFile: async () => failure('UNUSED') }, agents: { run: async () => failure('UNUSED') }, artifacts: { register: async () => failure('UNUSED'), listForTask: async () => ({ ok: true as const, data: [] }) }, results: { create: async () => failure('UNUSED'), get: async () => failure('UNUSED'), submitReview: async () => failure('UNUSED'), decide: async () => failure('UNUSED'), listReviews: async () => ({ ok: true as const, data: [] }) }, confirmedWrites: { prepare: async () => failure('UNUSED'), approve: async () => failure('UNUSED'), reject: async () => failure('UNUSED') }, ...overrides } as EnterpriseBrainBridge; }
