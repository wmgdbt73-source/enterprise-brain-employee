# Agent Contract（Agent 运行与交互规则）

> Goal: define the minimum shared contract for Agent execution in Employee Alpha.

> EB-007 establishes the Desktop Local Capability Layer. Its `list_directory`
> and `read_file` authorization boundary is reusable by a future Agent Runtime,
> but Agent Runtime itself remains EB-008 and is not implemented here.

EB-008 activates a deterministic, no-LLM read-only AgentRun path. The user selects
only `list_directory` or `read_file`; Backend creates the Run/ToolCall before
Electron Main executes the existing Desktop Local Capability Layer.

## 1. One Runtime, Many Agent Definitions（一套运行引擎，多种 Agent 定义）

Do not build one runtime per Agent.

Use:
- Agent Runtime（Agent 运行引擎）
- AgentDefinition（Agent 定义）
- AgentRun（Agent 执行实例）
- Tool Registry（工具注册中心）

## 2. Initial Agent Scope（首个 Agent 范围）

Alpha starts with one general Work Agent（工作执行 Agent） capable of:
- reading Project / Task context;
- reading explicitly authorized Workspace files;
- calling approved tools;
- producing Artifact（工作产物）;
- requesting Human Confirmation（人工确认） for sensitive actions.

Specialized Agents can be introduced later through configuration.

## 3. AgentRun Lifecycle（Agent 执行生命周期）

```text
QUEUED
→ RUNNING
→ SUCCEEDED
```

Side states:
- WAITING_HUMAN
- FAILED
- CANCELLED

## 4. Context Assembly（上下文构建）

Agent context may include:
- User identity and allowed role context;
- Project context;
- Task context;
- Conversation context;
- authorized WorkspaceBinding;
- retrieved Knowledge evidence;
- Tool definitions;
- current business state.

Do not automatically include the whole device or unrelated Projects.

## 5. Tool Call Contract（工具调用契约）

Minimum tools:

### list_directory（读取目录）
Risk: LOW（低风险）
Requires: LOCAL_READ

### read_file（读取文件）
Risk: LOW（低风险）
Requires: LOCAL_READ

### write_file（写文件）
Risk: MEDIUM/HIGH（中高风险）
Requires: LOCAL_MODIFY or LOCAL_CREATE
Alpha rule: Human Confirmation required.

### run_command（执行命令）
Risk: HIGH（高风险）
Requires: LOCAL_EXECUTE
Alpha rule: Human Confirmation required.

Each Tool definition should contain:
- name
- description
- input_schema
- required_permissions
- risk_level
- requires_human_confirmation
- handler

## 6. Agent Output Types（Agent 输出类型）

Initial supported logical outputs:
- TEXT（普通文本）
- TOOL_CALL（工具调用）
- ACTION_CANDIDATE（业务动作候选）
- ARTIFACT_CANDIDATE（工作产物候选）

EB-009 does not automatically create an Artifact. A successful `read_file` only
records safe receipt metadata; an employee must explicitly register that observed
local file as an Artifact. The Agent does not claim to have created the file.

## 7. Formal Business Action Rule（正式业务动作规则）

Agent may propose an Action Candidate（动作候选）.

Agent may not silently perform formal high-impact transitions such as:
- accepting a Result;
- changing enterprise permissions;
- deleting a Project;
- expanding local device access beyond the authorized Workspace.

Formal mutations go through backend validation and, where required, Human Confirmation.

## 8. Human Confirmation（人工确认）

When confirmation is required:

```text
RUNNING
→ WAITING_HUMAN
→ user approves / rejects
→ RUNNING or CANCELLED/FAILED
```

UI must show:
- requested action;
- affected object / file;
- reason;
- required permission;
- risk level.

## 9. Streaming Events（实时事件）

Suggested events:
- run.started
- thinking/status.updated
- model.delta
- tool.requested
- tool.started
- tool.completed
- human_confirmation.required
- artifact.created
- run.completed
- run.failed

## 10. Audit Rule（审计规则）

Record at minimum:
- AgentRun id;
- AgentDefinition id;
- invoking user;
- Project / Task scope;
- tool calls;
- confirmations;
- resulting Artifact ids;
- final status.

## 11. Cost and Model Routing（成本与模型路由）

Not a P0 feature for Alpha, but runtime design should leave room for:
- model identifier;
- token usage;
- cost estimate;
- latency;
- retry count.

## 12. Agent Safety Baseline（Agent 安全基线）

- least privilege（最小权限）;
- explicit Workspace scope（明确工作区范围）;
- human confirmation for high-risk local actions（高风险本地动作人工确认）;
- structured audit（结构化审计）;
- backend owns formal state（后端持有正式状态）.
