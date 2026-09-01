# Ontology Baseline（本体基线）

> Goal: define the minimum operational ontology required for the Employee Alpha.

## 1. Ontology Principle（本体原则）

The first implementation is an **Operational Ontology（可运行本体）**, not a complete semantic ontology platform.

It must define:
- Entity（实体）
- Relation（关系）
- State（状态）
- Action（动作）
- Policy（策略 / 权限）
- Event（事件）

## 2. Core Entities（核心实体）

### User（用户）
- id
- name
- system_role
- department_id?

### Project（项目）
- id
- name
- goal
- status

### ProjectMember（项目成员）
- id
- project_id
- user_id
- role: OWNER / MEMBER / REVIEWER

### Task（任务）
- id
- project_id
- title
- description?
- assignee_user_id?
- priority
- status
- deadline?
- acceptance_criteria[]
- dependency_ids[]

### Conversation（对话）
- id
- type
- project_id?
- task_id?
- participant_ids[]

### AgentDefinition（Agent 定义）
- id
- name
- role
- tool_ids[]
- permission_scope
- output_schema?
- approval_policy?

### AgentRun（Agent 执行实例）
- id
- agent_definition_id
- project_id?
- task_id?
- conversation_id?
- status
- input
- output?
- started_at?
- finished_at?

### Artifact（工作产物）
- id
- project_id
- task_id?
- agent_run_id?
- type
- relative_path
- version
- created_by
- created_at

### Result（正式候选结果 / 正式结果）
- id
- project_id
- task_id
- artifact_ids[] (normalized ResultArtifact relation)
- status
- created_by_user_id
- created_at

### Review（人工评审）
- id
- result_id
- reviewer_id
- decision
- comment?
- reviewed_at?

### ActivityEvent（工作事件）
- id
- type
- actor_type
- actor_id
- object_type
- object_id
- payload
- created_at

## 3. Core Relations（核心关系）

```text
User --has_membership--> ProjectMember
ProjectMember --belongs_to--> Project
Project --contains--> Task
Task --assigned_to--> User
Task --depends_on--> Task
Task --executed_by--> AgentRun
AgentRun --uses--> AgentDefinition
AgentRun --produces--> Artifact
Artifact --confirmed_as--> Result
Result --reviewed_by--> Review
Conversation --scoped_to--> Project / Task
ActivityEvent --references--> any structured object
```

## 4. State Baselines（状态基线）

### Task

`TODO → IN_PROGRESS → READY_FOR_REVIEW → ACCEPTED → CLOSED`

Allowed rework transition:

`READY_FOR_REVIEW → IN_PROGRESS`

Deferred states:
- WAITING
- BLOCKED
- CANCELLED

### AgentRun

`QUEUED → RUNNING → SUCCEEDED`

Side states:
- WAITING_HUMAN
- FAILED
- CANCELLED

### Result

`DRAFT → CANDIDATE → HUMAN_REVIEW → ACCEPTED`

Side state:
- REWORK

## 5. Core Actions（核心动作）

- create_project
- add_project_member
- create_task
- assign_task
- start_task
- submit_task_for_review
- request_task_rework
- accept_task_after_human_review
- close_task
- create_agent_run
- request_tool_call
- confirm_tool_call
- create_artifact
- confirm_result_candidate
- submit_review
- accept_result
- request_rework

## 6. Policy Baseline（策略 / 权限基线）

- Agent may create Artifact（工作产物）.
- Employee may confirm an Artifact as a Result Candidate（候选结果） when authorized.
- Agent may precheck, but may not perform formal Acceptance（正式验收）.
- Human reviewer with authority performs Accept / Rework.
- Local tool permissions are independent from normal business object permissions.
- Business `PermissionOverride` is evaluated live per request within Organization
  or Department scope; it never expands Desktop local-tool permissions.

## 7. Event Baseline（事件基线）

Examples:
- PROJECT_CREATED
- TASK_CREATED
- TASK_STATUS_CHANGED
- AGENT_RUN_STARTED
- AGENT_TOOL_REQUESTED
- AGENT_RUN_COMPLETED
- ARTIFACT_CREATED
- RESULT_SUBMITTED
- REVIEW_COMPLETED
- RESULT_ACCEPTED
- WORKSPACE_BOUND

## 8. Not Yet in Alpha Ontology（Alpha 暂不纳入）

- full enterprise strategy ontology
- finance ontology
- complete HR ontology
- complex policy inference
- general-purpose graph query language
- ontology schema version migration platform

Add them only when a real Employee Alpha flow requires them.
