# Domain Model（业务对象模型）

> This file defines the minimum object model for implementation. Field names are provisional Alpha contracts until validated by code and API review.

## 1. User（用户）

```ts
interface User {
  id: string
  name: string
  systemRole: 'EMPLOYEE' | 'ADMIN'
  departmentId?: string
  createdAt: string
  updatedAt: string
}
```

## 2. Project（项目）

```ts
interface Project {
  id: string
  name: string
  goal?: string
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
  createdAt: string
  updatedAt: string
}
```

Project does not hold `ownerId` or `memberIds`. Project membership and Project-level roles are owned by `ProjectMember`.

## 3. ProjectMember（项目成员）

```ts
interface ProjectMember {
  id: string
  projectId: string
  userId: string
  role: 'OWNER' | 'MEMBER' | 'REVIEWER'
  createdAt: string
  updatedAt: string
}
```

Alpha baseline: a Project is created with one initial `OWNER` ProjectMember. OWNER transfer and multiple OWNERs are not implemented.

## 4. Task（任务）

```ts
interface Task {
  id: string
  projectId: string
  title: string
  description?: string
  assigneeId?: string
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  status:
    | 'TODO'
    | 'IN_PROGRESS'
    | 'READY_FOR_REVIEW'
    | 'ACCEPTED'
    | 'CLOSED'
  deadline?: string
  acceptanceCriteria: string[]
  dependencyIds: string[]
  createdAt: string
  updatedAt: string
}
```

Task creation always starts in `TODO`. Formal state changes are only made through:

- `START`
- `SUBMIT_FOR_REVIEW`
- `REQUEST_REWORK`
- `ACCEPT_AFTER_HUMAN_REVIEW`
- `CLOSE`

`WAITING`, `BLOCKED`, and `CANCELLED` are deferred. `ACCEPTED` and `CLOSED` remain separate formal states.

## 5. Conversation（对话）

```ts
type ConversationType =
  | 'CHAT'
  | 'PROJECT_WORK'
  | 'TASK_CONTEXT'
  | 'PROJECT_GROUP'
  | 'HUMAN_DM'

interface Conversation {
  id: string
  type: ConversationType
  projectId?: string
  taskId?: string
  participantIds: string[]
  createdAt: string
  updatedAt: string
}
```

## 6. WorkspaceBinding（本地工作区绑定）

```ts
interface WorkspaceBinding {
  id: string
  userId: string
  projectId: string
  deviceId: string
  localPath: string
  permissions: LocalPermission[]
  createdAt: string
  updatedAt: string
}

type LocalPermission =
  | 'LOCAL_READ'
  | 'LOCAL_MODIFY'
  | 'LOCAL_CREATE'
  | 'LOCAL_DELETE'
  | 'LOCAL_EXECUTE'
```

WorkspaceBinding is persisted only in the current Desktop device-local store.
`localPath` is never sent to Employee API, PostgreSQL, or formal Project/Task
records. EB-007 may grant only `LOCAL_READ`.

## 7. AgentDefinition（Agent 定义）

```ts
interface AgentDefinition {
  id: string
  name: string
  role: string
  toolIds: string[]
  permissionScope: string[]
  outputSchema?: Record<string, unknown>
  approvalPolicy?: Record<string, unknown>
}
```

## 8. AgentRun（Agent 执行实例）

```ts
type AgentRunStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'WAITING_HUMAN'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'

interface AgentRun {
  id: string
  agentDefinitionId: string
  projectId?: string
  taskId?: string
  conversationId?: string
  status: AgentRunStatus
  input: Record<string, unknown>
  output?: Record<string, unknown>
  createdAt: string
  startedAt?: string
  finishedAt?: string
}
```

EB-008 binds every AgentRun to one User, Project and Task. Backend persists the
AgentRun and safe ToolCall receipts; Electron Main holds full local tool output.
For confirmed local writes, EB-010 enables `WAITING_HUMAN → RUNNING | CANCELLED`.
The write ToolCall remains `PENDING` while the confirmation is pending or approved;
approval does not mutate a Task. A completed write transitions its ToolCall and
AgentRun together to `SUCCEEDED` or `FAILED`.

## 9. HumanConfirmation（人工确认）

`HumanConfirmation` is backend-owned formal state for one sensitive operation.
It binds one AgentRun, one ToolCall, one User, Project, Task, and opaque app-local
device ID. Its status is `PENDING | APPROVED | REJECTED`. It contains no local
path or file bytes. For EB-010 it authorizes exactly one employee-supplied UTF-8
`write_file` payload, path, hash, size, and `CREATE`/`REPLACE` effect; it does not
grant a persistent local-write permission.

## 10. Artifact（工作产物）

```ts
interface Artifact {
  id: string
  projectId: string
  taskId: string
  agentRunId: string
  sourceToolCallId: string
  type: 'FILE'
  storageKind: 'LOCAL_WORKSPACE'
  relativePath: string
  size: number
  encoding: 'utf-8'
  sha256: string
  version: 1
  createdByUserId: string
  submittedByUserId?: string
  submittedAt?: string
  createdAt: string
}
```

Artifact is an immutable metadata reference derived from a successful local
`read_file` observation. It stores neither an absolute local path nor file
content and is not a Result.

## 11. Result（正式候选结果 / 正式结果）

```ts
type ResultStatus =
  | 'DRAFT'
  | 'CANDIDATE'
  | 'HUMAN_REVIEW'
  | 'ACCEPTED'
  | 'REWORK'

interface Result {
  id: string
  projectId: string
  taskId: string
  artifactIds: string[]
  status: ResultStatus
  createdByUserId: string
  createdAt: string
  updatedAt: string
}
```

EB-011 creates only `CANDIDATE` through explicit employee confirmation. Result
Artifact composition, identity, creator and Task/Project provenance are immutable.
EB-012 permits only `CANDIDATE → HUMAN_REVIEW → ACCEPTED | REWORK`; submission
records server-derived actor/time once and final Review is unique per Result.
`rehydrateResult` is a trusted persistence boundary and never accepts HTTP
or LLM-controlled status input.

## 11. Review（人工评审）

```ts
interface Review {
  id: string
  resultId: string
  reviewerId: string
  decision: 'ACCEPT' | 'REWORK'
  comment?: string
  reviewedAt: string
}
```

## 12. ActivityEvent（工作事件）

```ts
interface ActivityEvent {
  id: string
  type: string
  actorType: 'USER' | 'AGENT' | 'SYSTEM'
  actorId: string
  objectType: string
  objectId: string
  payload: Record<string, unknown>
  createdAt: string
}
```

## 13. Modeling Rules（建模规则）

- avoid duplicating the same business object in UI-specific models;
- formal status values are shared through `packages/contracts`;
- UI display labels may differ from stored enum values;
- changes to core enums require an Architecture Decision Record（架构决策记录） in `DECISIONS.md`;
- Alpha fields may evolve, but identity and ownership boundaries should remain stable.

## 14. Account and Session（演示账号与会话）

`Account` is the login credential record for one `User`; it stores a normalized
unique login, versioned scrypt password hash, and `ACTIVE | DISABLED` status.
`Session` stores only a SHA-256 hash of an opaque bearer token, plus expiry and
optional revocation time. Raw passwords and tokens are never domain records.

EB-013 persists `Task.dependencyIds` as same-Project TaskDependency rows. A
dependency is satisfied only when its Task is `ACCEPTED` or `CLOSED`; it gates
the formal `START` action without creating a new Task status.
