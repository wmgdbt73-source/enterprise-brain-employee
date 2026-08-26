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

## 6. AgentRun APIs（Agent 执行接口）

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

### GET /tasks/:taskId/artifacts
List Task Artifacts（任务工作产物列表）.

## 8. Result APIs（结果接口）

### POST /tasks/:taskId/results
Create Result Candidate（创建正式候选结果）.

This action requires explicit Employee Confirmation（员工确认） in the UI.

### GET /results/:id
Get Result（结果详情）.

### POST /results/:id/submit-review
Submit for Human Review（提交人工评审）.

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

## 12. Contract Rule（契约规则）

Before Codex adds or changes an endpoint, it must:
1. check this file;
2. reuse an existing contract where possible;
3. update this file when a new public endpoint is introduced.
