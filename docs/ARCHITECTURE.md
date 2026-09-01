# Architecture Baseline（架构基线）

> Status: Alpha reference architecture / Alpha 参考架构

## 1. Architecture Goal（架构目标）

The employee reference stack should validate a real vertical path from Ontology（本体） to Agent execution and formal result state without prematurely rebuilding the full enterprise platform.

Target shape:

```text
Employee Desktop（员工桌面端）
        │
        ▼
Application API（应用接口）
        │
        ▼
Ontology Core / Work Graph（本体核心 / 工作图谱）
        │
   ┌────┴────┐
   ▼         ▼
Agent Runtime（Agent 运行引擎）  Knowledge Service（知识服务）
   │
   ▼
Tool Runtime（工具运行环境）
Files / Browser / Terminal
```

## 2. Recommended Alpha Stack（Alpha 推荐技术栈）

- Electron（桌面应用框架）
- React（前端 UI）
- TypeScript（主开发语言）
- Vite（构建工具）
- Node.js + Fastify（应用 API）
- PostgreSQL（结构化业务数据）
- Prisma ORM 7（PostgreSQL Driver Adapter：`@prisma/adapter-pg` + `pg`）
- SSE — Server-Sent Events（服务器实时推送） for AgentRun progress

## 3. Repository Structure（仓库结构）

Target:

```text
enterprise-brain-employee/
├── apps/
│   ├── desktop/
│   └── api/
├── packages/
│   ├── domain/
│   ├── contracts/
│   ├── shared/
│   ├── ui/
│   └── database/              # Prisma schema, migrations and client factory
├── docs/
├── reference/
├── tests/
└── README.md
```

## 4. Authority Boundaries（权威边界）

### Desktop / Frontend（桌面端 / 前端）

Owns:
- user interaction;
- local Workspace authorization UX;
- rendering structured state;
- invoking APIs and AgentRuns.

Must not:
- directly mark a Result as Accepted;
- bypass permission checks;
- directly mutate formal business state only in UI memory.

### Application Backend（应用后端）

Owns:
- formal Project / Task / Result / Review state;
- transactions;
- permission checks;
- audit events;
- API contracts.

### Agent Runtime（Agent 运行引擎）

Owns:
- AgentRun lifecycle;
- context assembly;
- tool invocation orchestration;
- waiting for human confirmation;
- streaming execution events.

Must not directly bypass formal backend rules.

### Knowledge Service（知识服务）

Owns unstructured evidence retrieval, not formal business truth.

## 5. Structured Truth vs Unstructured Evidence（结构化事实与非结构化证据）

Use Ontology / database for:
- Task status;
- Project membership;
- Result state;
- Review decision;
- permission state.

Use Knowledge / RAG for:
- documents;
- meeting notes;
- research materials;
- policy text;
- supporting evidence.

## 6. Alpha Integration Order（Alpha 集成顺序）

1. UI → API → PostgreSQL
2. Project → Task
3. Work Runtime → Local Workspace
4. AgentRun → LLM
5. AgentRun → read-only local tools
6. Artifact → Result Candidate
7. Human Review → Accepted
8. Activity / Notification / Audit

## 7. Security Baseline（安全基线）

- local file access must remain within the explicitly authorized Workspace;
- write / delete / execute actions require stronger permission and, during Alpha, Human Confirmation（人工确认）;
- secrets must never be committed to Git;
- `.env` must be ignored by Git;
- tool calls must be auditable;
- Agent output is never automatically trusted as formal state.

## 8. Evolution Strategy（演进策略）

This stack is a **Reference Implementation（参考实现）**. Future formal Java backend, enterprise IAM, production Ontology and enterprise Agent Runtime may replace internal services as long as public contracts remain stable.

## 9. Persistence Baseline（持久化基线）

`packages/database` owns the Prisma 7 schema, committed migrations and an explicit
PostgreSQL-backed Prisma Client factory. `packages/domain` remains independent of
Prisma. Record-to-Domain rehydration and repositories are deliberately deferred to
the future application/repository integration boundary.

## 10. Desktop Work Runtime Boundary（桌面工作运行环境边界）

EB-006 establishes:

```text
React Renderer → typed preload bridge → IPC allowlist → Electron Main → Employee HTTP API → PostgreSQL
```

The sandboxed Renderer has no Node.js, filesystem, shell, environment, raw IPC
or arbitrary HTTP capability. Electron Main owns the fixed API gateway. Future
local tools also pass through this Desktop Runtime permission boundary; the
Renderer never receives direct operating-system access.

## 11. Device-local Workspace Boundary（设备本地工作区边界）

```text
Renderer → typed preload workspace allowlist → IPC → Electron Main
  → /me + project membership check → device-local WorkspaceBinding store
  → canonical path policy → local filesystem
```

WorkspaceBinding is keyed by `user_id + project_id + device_id`; its local path
is stored only below Electron `userData`. Each read re-checks current identity
and Project membership. Renderer input is relative-only and canonical target
paths must remain under the canonical Workspace root.

## 12. Minimal Agent Runtime Boundary（最小 Agent 运行边界）

Backend owns AgentRun/ToolCall persistence and returns a deterministic allowlisted
ToolRequest. Electron Main is the local executor and reuses WorkspaceService;
Backend never imports or accesses local filesystem APIs. Full local results stay
on Desktop, while PostgreSQL records only safe completion metadata.

EB-009 adds explicit employee Artifact registration: successful `read_file`
AgentRun → persisted safe receipt → `POST /artifacts` → immutable backend
Artifact metadata. No local file content or absolute path crosses this boundary.

EB-013 coordinates Result submission/review with its Task in backend PostgreSQL
transactions. Renderer requests named operations only; it cannot set Task or
Result formal statuses, reviewers, timestamps, or dependency completion.

## 13. Confirmed Local Write Boundary（已确认本地写入边界）

```text
Renderer employee-supplied text → typed confirmed-write bridge → Electron Main
→ pending in-memory payload + server HumanConfirmation → one-shot Main-only grant
→ WorkspaceBinding/device/path checks → atomic local CREATE or guarded REPLACE
→ safe completion receipt → backend AgentRun/ToolCall state
```

The Renderer never receives a grant, device ID, absolute local path or file
content returned from this flow. The backend owns confirmation state; Electron
Main owns bytes and execution. This is not autonomous or model-generated file
authoring, and it creates neither Artifact nor Result automatically.

## 14. Demo Session Identity Boundary

Electron Main holds an opaque bearer token only in memory and attaches it to the
fixed Employee API gateway. The renderer receives `CurrentUserContract`, never
the bearer token. API resolves every protected request through Session → Account
→ User; account disablement, expiry, and revocation are checked on every request.

## 15. Admin Console Boundary

The Admin Console is a React/Vite Web control plane using the same typed contracts
and Employee API as Desktop. Its bearer token is held in browser `sessionStorage`
for the demo only; production authentication will move to secure HttpOnly cookies.
The frontend renders server decisions and never evaluates authorization itself.
