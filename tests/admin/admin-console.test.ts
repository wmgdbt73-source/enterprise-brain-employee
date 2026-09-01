import * as React from 'react';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../apps/admin/src/App.js';

type Route = (path: string, init: RequestInit) => Promise<unknown> | unknown;
let dom: JSDOM | undefined; let root: Root | undefined; let calls: Array<{ path: string; init: RequestInit }> = [];
afterEach(async () => { await act(async () => root?.unmount()); dom?.window.close(); root = undefined; dom = undefined; calls = []; });

describe('Admin Console', () => {
  it('protects the Admin Console across login, authorization loss, and authentication generations', async () => {
    let resolveOld!: (value: unknown) => void; const old = new Promise((resolve) => { resolveOld = resolve; }); let login = 0;
    mount(async (path) => {
      if (path === '/auth/login') return { token: login++ === 0 ? 'token-a' : 'token-b', user: {} };
      if (path === '/me') return login === 1 ? owner('A') : owner('B');
      if (path === '/employees' && login === 1) return old;
      return data(path);
    }); await render(); await loginAs('a@test', 'password'); await click('Sign out');
    await loginAs('b@test', 'password'); await act(async () => resolveOld({employees:[{userId:'old',displayName:'Old Employee',email:'old@test',accountStatus:'ACTIVE',organizationRole:'MEMBER'}]}));
    expect(text()).toContain('Organization B'); expect(text()).not.toContain('Organization A'); expect(sessionStorage.getItem('admin-token')).toBe('token-b');
    // A MEMBER never reaches management loaders.
    calls=[]; mount(async (path) => path === '/auth/login' ? { token: 'member-token', user: {} } : path === '/me' ? member() : { employees: [] }); await render(); await loginAs('member@test', 'password');
    expect(text()).toContain('Access denied'); expect(calls.some((call) => ['/employees','/departments','/agents'].includes(call.path))).toBe(false);
  });

  it('manages Departments and Employee assignments without losing the Admin Shell', async () => {
    const state = seed(); let createCalls = 0; let failAssignment = true;
    mount(async (path, init) => {
      if (path === '/auth/login') return { token: 'owner-token', user: {} }; if (path === '/me') return owner('Owner');
      if (path === '/departments' && init.method === 'POST') { createCalls++; const body = JSON.parse(String(init.body)); state.departments.push({ id: 'design', organizationId: 'org', name: body.name, status: 'ACTIVE', createdAt: 'x', updatedAt: 'x' }); return state.departments.at(-1); }
      if (path === '/employees/employee/department' && init.method === 'PUT') { if (failAssignment) { failAssignment = false; throw new Error('Temporary assignment failure'); } state.employees[0] = { ...state.employees[0], departmentId: 'design', departmentName: 'Design', departmentRole: 'MEMBER' }; return { userId: 'employee', name: 'Employee', role: 'MEMBER', status: 'ACTIVE' }; }
      return data(path, state);
    }); await render(); await loginAs('owner@test', 'password'); await click('Departments'); await flush(); await inputByLabel('Name', 'Design'); await submit('Create Department'); await submit('Create Department'); await flush(); expect(calls.map(call=>`${call.init.method??'GET'} ${call.path}`)).toContain('POST /departments'); expect(createCalls).toBe(1); expect(text()).toContain('Design'); await clickRow('Design'); expect(text()).toContain('Employee');
    await click('Employees'); await inputByLabel('Search employees', 'Employee'); await clickRow('Employee'); await selectByLabel('Department', 'design'); await submit('Save assignment'); await flush(); expect(text()).toContain('Temporary assignment failure'); expect(text()).toContain('Employee'); await submit('Save assignment'); await flush(); expect(text()).toContain('Design');
  });

  it('creates and removes supported Employee permission overrides', async () => {
    const state = seed(); let deleteCalls = 0;
    mount(async (path, init) => {
      if (path === '/auth/login') return { token: 'owner-token', user: {} }; if (path === '/me') return owner('Owner');
      if (path === '/employees/employee/permission-overrides' && init.method === 'PUT') { const body = JSON.parse(String(init.body)); const override = { id: 'override-1', organizationId: 'org', userId: 'employee', ...body, createdAt: 'x', updatedAt: 'x' }; state.overrides = [override]; return override; }
      if (path === '/employees/employee/permission-overrides/override-1' && init.method === 'DELETE') { deleteCalls++; state.overrides=[]; return undefined; }
      return data(path, state);
    }); await render(); await loginAs('owner@test', 'password'); await click('Employees'); await clickRow('Employee'); await selectByLabel('Effect', 'DENY'); await submit('Add override'); await flush(); expect(document.querySelector('.danger-badge')?.textContent).toBe('DENY'); await click('Delete'); expect(deleteCalls).toBe(0); await click('Cancel'); expect(deleteCalls).toBe(0); await click('Delete'); await click('Confirm delete'); await flush(); expect(deleteCalls).toBe(1); expect(document.querySelector('.danger-badge')).toBeNull();
  });

  it('creates catalog Agents and manages Organization Department and User assignments', async () => {
    const state = seed(); const payloads: unknown[] = []; let selected = '';
    mount(async (path, init) => {
      if (path === '/auth/login') return { token: 'owner-token', user: {} }; if (path === '/me') return owner('Owner');
      if (path === '/agents' && init.method === 'POST') { state.agents.push({ id: 'agent-1', organizationId: 'org', key: 'read', name: 'Read Agent', status: 'ACTIVE', version: 1, runtimeProfile: 'READ_ONLY_WORK', createdAt: 'x', updatedAt: 'x' }); return state.agents[0]; }
      if (path === '/agents/agent-1/assignments' && init.method === 'PUT') { const body = JSON.parse(String(init.body)); payloads.push(body); const value={ id:`assignment-${payloads.length}`,organizationId:'org',agentDefinitionId:'agent-1',...body,status:'ACTIVE',createdAt:'x',updatedAt:'x' }; state.assignments.push(value); return value; }
      if (path.startsWith('/agents/agent-1/assignments/') && init.method === 'DELETE') { state.assignments=[]; return undefined; }
      if (path === '/agents/agent-1/assignments') { selected = 'agent-1'; return state.assignments; }
      return data(path, state);
    }); await render(); await loginAs('owner@test', 'password'); await click('Agents'); await flush(); await inputByLabel('Key','read'); await inputByLabel('Name','Read Agent'); await click('Create Agent'); await flush(); await flush(); await clickRow('Read Agent'); await flush();
    for (const [scope,value] of [['ORGANIZATION','org'],['DEPARTMENT','product'],['USER','employee']] as const) { await selectByLabel('Scope type',scope); await selectByLabel('Scope',value); await click('Assign'); await flush(); }
    expect(selected).toBe('agent-1'); expect(payloads).toEqual([{scopeType:'ORGANIZATION',scopeId:'org'},{scopeType:'DEPARTMENT',scopeId:'product'},{scopeType:'USER',scopeId:'employee'}]); await click('Delete'); await click('Confirm delete'); await flush(); expect(text()).toContain('Read Agent');
  });
  it('changes an Employee account status and lists immutable Audit Events', async () => {
    const state=seed(); let status='ACTIVE'; let auditCalls=0;
    mount(async(path,init)=>{if(path==='/auth/login')return {token:'owner-token',user:{}};if(path==='/me')return owner('Owner');if(path==='/employees/employee/account-status'){status=JSON.parse(String(init.body)).status;(state.employees as Array<Record<string,unknown>>)[0]={...state.employees[0],accountStatus:status as 'ACTIVE'|'DISABLED'};return {userId:'employee',status};}if(path==='/audit-events'){auditCalls++;return {items:[{id:'audit-1',organizationId:'org',actorUserId:'owner',actorDisplayName:'Owner',action:'ACCOUNT_STATUS_CHANGED',subjectType:'USER',subjectId:'employee',resourceType:'ACCOUNT',resourceId:'account',before:{status:'ACTIVE'},after:{status:'DISABLED'},reason:'Offboarding approved',source:'ADMIN_API',createdAt:'2026-09-01T00:00:00.000Z'}]};}return data(path,state);});
    await render();await loginAs('owner@test','password');await click('Employees');await clickRow('Employee');await inputByLabel('Reason','Offboarding approved');await flush();expect((button('Disable account') as HTMLButtonElement).disabled).toBe(false);await click('Disable account');await flush();expect(text()).toContain('Confirm disable');await click('Confirm disable');await flush();await flush();expect(text()).toContain('DISABLED');await click('Audit Logs');await flush();await flush();expect(text()).toContain('ACCOUNT_STATUS_CHANGED');await clickRow('ACCOUNT_STATUS_CHANGED');expect(text()).toContain('Offboarding approved');expect(auditCalls).toBeGreaterThan(0);expect(text()).not.toContain('Delete audit');
  });
});

function owner(name: string) { return { id: 'owner', name, systemRole: 'ADMIN' as const, organization: { id: 'org', name: `Organization ${name}`, role: 'OWNER' as const } }; }
function member() { return { id: 'member', name: 'Member', systemRole: 'EMPLOYEE' as const, organization: { id: 'org', name: 'Organization', role: 'MEMBER' as const } }; }
function seed() { return { departments: [{id:'product',organizationId:'org',name:'Product',status:'ACTIVE' as const,createdAt:'x',updatedAt:'x'}], employees: [{userId:'employee',displayName:'Employee',email:'employee@test',accountStatus:'ACTIVE' as const,organizationRole:'MEMBER' as const,departmentId:'product',departmentName:'Product',departmentRole:'MEMBER' as const}], agents: [] as Array<Record<string, unknown>>, assignments: [] as Array<Record<string, unknown>>, overrides: [] as Array<Record<string, unknown>> }; }
function data(path: string, state = seed()): unknown { if(path==='/organization')return {id:'org',name:'Organization',status:'ACTIVE',role:'OWNER'}; if(path==='/employees')return {employees:state.employees}; if(path==='/departments')return {departments:state.departments}; if(path==='/departments/product/members'||path==='/departments/design/members')return {members:[{userId:'employee',name:'Employee',role:'MEMBER',status:'ACTIVE'}]}; if(path==='/agents')return state.agents; if(path==='/agents/agent-1/assignments')return state.assignments; if(path==='/employees/employee/permission-overrides')return {overrides:state.overrides}; throw new Error(`Unhandled ${path}`); }
function mount(route: Route) { dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://admin.test' }); Object.assign(globalThis,{window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Event:dom.window.Event,MouseEvent:dom.window.MouseEvent,React,sessionStorage:dom.window.sessionStorage}); (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true; globalThis.fetch=(async (url: string | URL | Request, init: RequestInit = {}) => { const path=new URL(String(url)).pathname; calls.push({path,init}); try { const body=await route(path,init); return new Response(body===undefined?undefined:JSON.stringify(body),{status:body===undefined?204:200,headers:{'Content-Type':'application/json'}}); } catch(error) { return new Response(JSON.stringify({error:{code:'VALIDATION_ERROR',message:error instanceof Error?error.message:'Request failed.',details:{}}}),{status:400,headers:{'Content-Type':'application/json'}}); } }) as typeof fetch; root=createRoot(document.getElementById('root')!); }
async function render(){await act(async()=>root?.render(createElement(App))); await flush();} async function flush(){await act(async()=>{await new Promise(resolve=>setTimeout(resolve,0));});} async function loginAs(email:string,password:string){await inputByLabel('Email',email);await inputByLabel('Password',password);await submit('Sign in');await flush();await flush();} function byLabel(label:string){const found=[...document.querySelectorAll('label')].find(node=>[...node.childNodes].some(child=>child.nodeType===window.Node.TEXT_NODE&&child.textContent?.trim()===label));if(!found)throw new Error(`Missing label ${label}: ${text()}`);return found;} async function inputByLabel(label:string,value:string){const input=byLabel(label).querySelector('input') as HTMLInputElement;await act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input),'value')?.set?.call(input,value);input.dispatchEvent(new window.Event('input',{bubbles:true}));input.dispatchEvent(new window.Event('change',{bubbles:true}));});}async function selectByLabel(label:string,value:string){const select=byLabel(label).querySelector('select') as HTMLSelectElement;await act(async()=>{Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select),'value')?.set?.call(select,value);select.dispatchEvent(new window.Event('change',{bubbles:true}));});}function button(name:string){const buttons=[...document.querySelectorAll('button')];const target=buttons.find(node=>node.textContent?.trim()===name)??buttons.find(node=>node.textContent?.includes(name));if(!target)throw new Error(`Missing button ${name}`);return target;}async function click(name:string){await act(async()=>button(name).click());}async function submit(name:string){const form=button(name).closest('form') as HTMLFormElement | null;if(!form)throw new Error(`Missing form ${name}`);await act(async()=>form.requestSubmit());}async function clickRow(name:string){const target=[...document.querySelectorAll('tr,.row')].find(node=>node.matches('.row')&&node.textContent?.includes(name))??[...document.querySelectorAll('tr')].find(node=>node.querySelector('td')&&node.textContent?.includes(name));if(!target)throw new Error(`Missing row ${name}`);await act(async()=>target.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));}function text(){return document.body.textContent??'';}
