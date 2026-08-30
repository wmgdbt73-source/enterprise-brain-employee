# API Contract（接口契约）

> Status: Alpha baseline / Alpha 基线。修改需同步到本文件。

## 1. Principles（原则）

- UI does not own formal business state.
- APIs return structured objects, not only LLM text.
- Agent execution status is streamed separately from formal business mutation.
- errors must be machine-readable.

## 2. Project APIs（项目接口）

### POST /projects
Create Project（创建项目）.

Request:
```json
{
  "name": "Employee Alpha",
  "goal": "Run core delivery flow"
}
```

`name` is required and non-blank. `goal` is optional. Unknown fields are
rejected; clients cannot supply `ownerId`, `memberIds`, `status`, `createdAt`
or `updatedAt`.

Response: `201 Created`

```json
{
  "id": "project-id",
  "name": "Employee Alpha",
  "goal": "Run core delivery flow",
  "status": "ACTIVE",
  "createdAt": "2026-08-25T00:00:00.000Z",
  "updatedAt": "2026-08-25T00:00:00.000Z"
}
```

The owner is the current user from RequestContext. The server creates a
Project and its initial OWNER ProjectMember in one transaction.

### GET /projects
List Projects（项目列表）.

Response: `200 OK`

```json
{
  "projects": []
}
```

Only Projects for which the current user has a ProjectMember membership are
returned, ordered by `createdAt DESC`.

### GET /projects/:id
Get Project detail（项目详情）.

Response: `200 OK` with `ProjectContract`.

The endpoint returns `404 NOT_FOUND` when the Project does not exist or the
current user is not a ProjectMember. This shared response avoids leaking the
existence of other Projects.

## 3. Task APIs（任务接口）

### POST /projects/:projectId/tasks
Create Task（创建任务）.

### GET /projects/:projectId/tasks
List Project Tasks（项目任务列表）.

### GET /tasks/:id
Get Task detail（任务详情）.

### POST /tasks/:id/start
Start Task（开始任务）.

Formal status transition must be validated server-side.

### EB-005 implemented Task endpoints

`POST /projects/:projectId/tasks` accepts only `title`, optional `description`,
`assigneeId`, `priority`, `acceptanceCriteria`, and ISO-8601 `deadline`; it
returns `201` with TaskContract. Unknown fields including `id`, `projectId`,
`status`, timestamps and `dependencyIds` are rejected.

`GET /projects/:projectId/tasks` returns `{ "tasks": [] }` ordered by
`createdAt DESC`. `GET /tasks/:id` returns TaskContract. `POST /tasks/:id/start`
performs TODO → IN_PROGRESS and returns `200`; repeat START returns `409
INVALID_STATE_TRANSITION`.

All Task endpoints are scoped to current-user ProjectMember membership. Missing
and non-member Project/Task resources return the same `404 NOT_FOUND` envelope.

## 4. Current Identity（当前身份）

### GET /me

Returns the current RequestContext identity, without User persistence timestamps.

```json
{ "id": "dev-user", "name": "Development Employee", "systemRole": "EMPLOYEE" }
```

This is a development identity endpoint, not an authentication protocol.

## 5. Workspace APIs（本地工作区接口）

Local filesystem operations may be handled through Electron IPC（Electron 进程间通信）, but formal WorkspaceBinding metadata should use structured contracts.

EB-007 WorkspaceBinding metadata and local paths are device-local Electron Main
Process state, not Employee HTTP API resources. The typed desktop bridge exposes
only project-scoped `get`, `select`, `unbind`, `listDirectory` and `readFile`.

## 6. AgentRun APIs（EB-008）

`POST /tasks/:taskId/agent-runs` accepts only `{ name, relativePath }`, where
`name` is `list_directory` or `read_file`. Identity, Project, status, agent key,
commands and URLs are server-owned or rejected. The response includes a RUNNING
AgentRun and one ToolRequest for Electron Main.

`POST /agent-runs/:runId/tool-results` accepts a structured completion receipt.
It persists only safe metadata (relative path, count/size/encoding/hash), never
file content, directory entries, local path, stack or errno. Same receipt retry is
idempotent; a conflicting second completion is `409`.

## 7. AgentRun future APIs（Agent 执行接口）

## 7.1 Human Confirmation APIs（EB-010）

`POST /tasks/:taskId/agent-runs` additionally accepts a server-validated
`write_file` intent only through the confirmed-write Desktop Main flow. The
employee supplies UTF-8 content locally; the request contains only safe operation
metadata (`relativePath`, byte size, SHA-256, effect, optional replace precondition,
and opaque device ID), never content or absolute paths.

`GET /human-confirmations/:id` returns server-derived display data: confirmation,
action, relative path, effect, byte size/hash, risk, reason and required permission.
It never returns the device ID, payload, local path, raw request or execution grant.

`POST /human-confirmations/:id/approve` and `/reject` are owner-and-current-member
scoped. An approve response is consumed only by Electron Main and may carry a
one-shot operation-scoped execution grant; the typed renderer bridge never exposes
that grant. Repeated same decisions are idempotent; the opposite decision is `409
HUMAN_CONFIRMATION_CONFLICT`.

Write completion requires an approved matching confirmation. A local success or
safe failure produces only metadata/a structured error; it creates neither Artifact
nor Result and does not change Task state.

### POST /agent-runs
Create AgentRun（创建 Agent 执行）.

Request concept:
```json
{
  "agentDefinitionId": "work-agent",
  "projectId": "project-1",
  "taskId": "task-1",
  "conversationId": "conversation-1",
  "input": {
    "message": "Analyze current requirement files"
  }
}
```

### GET /agent-runs/:id
Get AgentRun status（获取 Agent 执行状态）.

### GET /agent-runs/:id/events
SSE — Server-Sent Events（服务器实时推送） stream.

Suggested event types:
- run.started
- model.delta
- tool.requested
- tool.started
- tool.completed
- human_confirmation.required
- run.completed
- run.failed

### POST /agent-runs/:id/cancel
Cancel AgentRun（取消执行）.

## 7. Artifact APIs（工作产物接口）

### POST /artifacts
Register Artifact（登记工作产物）.

Accepts exactly `{ "agentRunId": "..." }`. The server derives all Artifact
metadata from the current user's successful, single sequence-one `read_file`
ToolCall. First registration returns `201`; repeated registration returns `200`
with the same Artifact. Missing/non-member/other-user sources return `404`;
visible but ineligible sources return `409 ARTIFACT_SOURCE_INVALID`.

### GET /tasks/:taskId/artifacts
List Task Artifacts（任务工作产物列表）.

## 8. Result APIs（结果接口）

### POST /tasks/:taskId/results
Create Result Candidate（创建正式候选结果）.

This action requires explicit Employee Confirmation（员工确认） in the UI and an
`Idempotency-Key` UUID header. It accepts exactly `{ "artifactIds": ["..."] }`;
the set must be non-empty and duplicate-free. The server derives candidate status,
creator, Project/Task scope and timestamps. First creation returns `201`; the same
key and Artifact set returns `200`; a different set for the same key returns `409
IDEMPOTENCY_KEY_CONFLICT`. Missing/non-member Task and unavailable selected
Artifacts return hidden `404 NOT_FOUND`.

### GET /results/:id
Get Result（结果详情）.

### POST /results/:id/submit-review
Only the Result creator, while still a ProjectMember, may submit `CANDIDATE` to
`HUMAN_REVIEW`. It returns `200`; repeat returns the same Result. Terminal states
return `409`; this action does not change Task state.

## 9. Review APIs（评审接口）

### POST /results/:id/reviews
Create Human Review（创建人工评审）.

Request:
```json
{
  "decision": "ACCEPT",
  "comment": "Meets acceptance criteria"
}
```

Server validates reviewer authority before Result becomes ACCEPTED.
Only current Project `OWNER` or `REVIEWER`, excluding the Result creator, may
decide a `HUMAN_REVIEW` Result. `GET /results/:id/reviews` is membership-scoped.
First decision returns `201`; identical retry returns `200`; a different final
decision returns `409`. EB-012 does not change Task state.

## 10. Activity / Notification APIs（动态 / 通知接口）

### GET /projects/:projectId/activity
Get Project Dynamic（项目动态）.

### GET /notifications
Get current user notifications（获取当前用户通知）.

## 11. Error Shape（错误结构）

```json
{
  "error": {
    "code": "PERMISSION_DENIED",
    "message": "Human-readable message",
    "details": {}
  }
}
```

Initial error codes:
- VALIDATION_ERROR
- NOT_FOUND
- INTERNAL_ERROR
- NOT_FOUND
- PERMISSION_DENIED
- INVALID_STATE_TRANSITION
- WORKSPACE_SCOPE_VIOLATION
- HUMAN_CONFIRMATION_REQUIRED
- AGENT_RUN_FAILED
- ARTIFACT_SOURCE_INVALID

## 12. Contract Rule（契约规则）

Before Codex adds or changes an endpoint, it must:
1. check this file;
2. reuse an existing contract where possible;
3. update this file when a new public endpoint is introduced.
