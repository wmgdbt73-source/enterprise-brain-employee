# Enterprise Brain Employee — Product Definition

> Status: Alpha baseline / 员工端 Alpha 基线
>
> This file is a **Source of Truth（项目权威说明源）** for the employee-side reference implementation. If prototype behavior and implementation diverge, record the decision in `DECISIONS.md` before changing the product rule.

## 1. Product Identity（产品定位）

Enterprise Brain is an **AI-native enterprise work system（AI 原生企业工作系统）**. The employee side is not a standalone chat product. It is a work environment where structured enterprise objects, human collaboration, local desktop capability and Agent execution are connected.

Core development principle:

**Ontology-First（本体优先） → Agent-Driven Workflow（Agent 驱动业务流） → Human Confirmation（人工确认） → Structured State Update（结构化状态更新）**.

## 2. Employee Product Goal（员工端目标）

The Employee application should let a user:

1. understand current work;
2. enter a Project or Task context;
3. work with AI/Agents;
4. use explicitly authorized local desktop resources in Work mode;
5. produce Artifact（工作产物）;
6. confirm a Result Candidate（正式候选结果）;
7. submit for Human Review（人工评审）;
8. keep formal business state auditable and structured.

## 3. Chat vs Work Runtime（聊天模式与工作模式）

### Chat — Web AI Conversation Runtime（网页式 AI 对话运行环境）

- user explicitly uploads or adds context;
- no persistent local workspace by default;
- no default access to local files, terminal or computer capabilities;
- optimized for Ask / Talk（询问 / 对话）.

### Work — Desktop Work Runtime（桌面工作运行环境）

- user can explicitly select a Project / Task / local Workspace context;
- may use authorized Files / Browser / Terminal / local computer tools;
- permissions are scoped and auditable;
- optimized for Work / Do（工作 / 执行）.

**Frozen rule（冻结规则）:** `Work → New Conversation（工作模式 → 新对话）` stays in Work and must not switch to Chat.

## 4. Core Employee Areas（员工端核心区域）

- New Conversation（新对话）
- Plugins（插件）
- Automation（自动化）
- Library（资料库）
- Assistants（助理）
- Swarms（蜂群）
- Current Enterprise Projects（当前企业项目）
- Personal Projects（个人项目）
- History Conversations（历史对话）
- Notification Center（通知中心）
- Daily Dashboard（每日工作看板）

## 5. Project Workspace（项目工作空间）

Project has five fixed tabs:

1. Dynamic（动态）
2. Plan（计划）
3. Tasks（任务）
4. Assets（资产）
5. Configuration（配置）

Do not add a sixth Project tab for Group Chat or Work.

### Project Workspace vs Conversation

- **Project Workspace（项目工作空间）** answers: “这个项目现在是什么情况？”
- **Project Conversation（项目对话）** answers: “我围绕这个项目要讨论 / 做什么？”
- **Task Context Conversation（任务上下文对话）** answers: “这个具体 Task 怎么做出来？”

## 6. Collaboration Rules（协作规则）

### Dynamic（动态）

Dynamic is a meaningful project activity stream, approximately:

`WORK_EVENT + scope-visible GROUP_MESSAGE`

It must not become employee surveillance.

### Human Group Chat（项目群聊）

- lives under Dynamic, not as a sixth Project tab;
- humans are the default speakers;
- Agents speak only when explicitly invoked or deliberately shared;
- structured Task / Result / Artifact references may be shared into conversation.

### Human DM（成员私聊）

- private DM never enters public Project Dynamic;
- DM is a normal central detail page, not a permanent multi-DM dock.

## 7. Core Delivery Flow（核心交付闭环）

```text
Project（项目）
→ Task（任务）
→ Task Context（任务上下文）
→ AgentRun（Agent 执行）
→ Artifact（工作产物）
→ Employee Confirm（员工确认）
→ Result Candidate（正式候选结果）
→ Human Review（人工评审）
→ Accepted（正式验收）
```

## 8. Formal State Principle（正式状态原则）

- Conversation text is not a formal business fact.
- Artifact（工作产物） is not Result（正式结果）.
- AI Precheck（AI 预检） is not Human Acceptance（人工验收）.
- LLM text alone must never directly change formal business state.
- formal Project / Task / Result / Review / Permission state must be persisted by structured services.

## 9. Notification vs Reminder（通知与提醒）

- **Notification（通知）** = “发生了什么我需要知道？”
- **Reminder（提醒）** = “什么时候我需要注意？”
- **待我处理** = formal action queue（正式待办队列）.
- **今日日程** = today overview（今日概览）.

## 10. Local Workspace（本地工作区）

Workspace binding key:

`user_id + project_id + device_id`

Initial permission model:

- read（读取）
- modify（修改）
- create（创建）
- delete（删除）
- execute（执行，未来 / 高风险）

The system must never interpret Work mode as whole-device access.

## 11. Alpha Scope（Alpha 范围）

P0 priority for the reference implementation:

- Project / Task
- Chat / Work separation
- Local Workspace read capability
- AgentRun minimal lifecycle
- Artifact / Result / Review flow
- basic Activity / Notification
- basic audit trail

Deferred after Alpha:

- full Swarm implementation
- full multi-user realtime Group Chat
- complex Automation Builder
- full Plugin Runtime
- advanced Knowledge Graph
- all enterprise connectors
- all production Agents

## 12. Reference Prototype（参考原型）

Visual and interaction reference:

`reference/Enterprise_Brain_Employee_MVP_V0_14_Work_New_Conversation.html`

The prototype is a reference, not production code.