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

## 9. Artifact（工作产物）

```ts
interface Artifact {
  id: string
  projectId: string
  taskId?: string
  agentRunId?: string
  type: 'FILE' | 'DOCUMENT' | 'CODE' | 'PROTOTYPE' | 'OTHER'
  pathOrUri: string
  version: number
  createdBy: string
  createdAt: string
}
```

## 10. Result（正式候选结果 / 正式结果）

```ts
type ResultStatus =
  | 'DRAFT'
  | 'CANDIDATE'
  | 'HUMAN_REVIEW'
  | 'ACCEPTED'
  | 'REWORK'

interface Result {
  id: string
  taskId: string
  artifactIds: string[]
  status: ResultStatus
  submittedBy: string
  createdAt: string
  submittedAt?: string
  updatedAt: string
}
```

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
