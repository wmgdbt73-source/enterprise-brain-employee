# Domain Model（业务对象模型）

> This file defines the minimum object model for implementation. Field names are provisional Alpha contracts until validated by code and API review.

## 1. User（用户）

```ts
interface User {
  id: string
  name: string
  role: 'EMPLOYEE' | 'PROJECT_OWNER' | 'ADMIN'
  departmentId?: string
}
```

## 2. Project（项目）

```ts
interface Project {
  id: string
  name: string
  goal?: string
  ownerId: string
  memberIds: string[]
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED'
  createdAt: string
  updatedAt: string
}
```

## 3. Task（任务）

```ts
interface Task {
  id: string
  projectId: string
  title: string
  description?: string
  driUserId: string
  collaboratorIds: string[]
  priority: 'P0' | 'P1' | 'P2' | 'P3'
  status:
    | 'READY'
    | 'WORKING'
    | 'WAITING'
    | 'BLOCKED'
    | 'READY_FOR_REVIEW'
    | 'ACCEPTED'
    | 'CLOSED'
    | 'CANCELLED'
  deadline?: string
  acceptanceCriteria: string[]
  dependencyIds: string[]
  createdAt: string
  updatedAt: string
}
```

## 4. Conversation（对话）

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

## 5. WorkspaceBinding（本地工作区绑定）

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

## 6. AgentDefinition（Agent 定义）

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

## 7. AgentRun（Agent 执行实例）

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

## 8. Artifact（工作产物）

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

## 9. Result（正式候选结果 / 正式结果）

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

## 10. Review（人工评审）

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

## 11. ActivityEvent（工作事件）

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

## 12. Modeling Rules（建模规则）

- avoid duplicating the same business object in UI-specific models;
- formal status values are shared through `packages/contracts`;
- UI display labels may differ from stored enum values;
- changes to core enums require an Architecture Decision Record（架构决策记录） in `DECISIONS.md`;
- Alpha fields may evolve, but identity and ownership boundaries should remain stable.