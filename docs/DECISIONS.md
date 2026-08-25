# Architecture Decision Records（架构决策记录）

> Use this file to record product / technical decisions that must remain stable across GPT, Codex and future engineers.

## ADR-001 — Chat and Work are separate runtimes

**Decision（决策）**  
Chat（聊天） and Work（工作） are separate Runtime / Permission boundaries（运行环境 / 权限边界）.

**Consequences（影响）**
- Work new conversation stays in Work.
- Chat does not imply local desktop access.
- Work may use explicitly authorized desktop capabilities.

---

## ADR-002 — Work does not mean whole-device access

**Decision（决策）**  
Local computer access is limited by explicit WorkspaceBinding（工作区绑定） and Tool permissions（工具权限）.

**Workspace key（绑定键）**  
`user_id + project_id + device_id`

---

## ADR-003 — Project has five fixed tabs

**Decision（决策）**  
Project Workspace fixed tabs:
- Dynamic（动态）
- Plan（计划）
- Tasks（任务）
- Assets（资产）
- Configuration（配置）

**Rejected（不采用）**  
Adding a sixth Work or Group Chat tab.

---

## ADR-004 — Group Chat lives under Dynamic

**Decision（决策）**  
Project Human Group Chat（项目人类群聊） is a Dynamic subpage, not a Project root tab.

Humans are default speakers. Agent participation requires explicit invocation or deliberate sharing.

---

## ADR-005 — Artifact is not Result

**Decision（决策）**  
Artifact（工作产物） is an intermediate or deliverable work object. Result（正式结果） is created only after employee confirmation / formal submission logic.

---

## ADR-006 — AI Precheck is not Acceptance

**Decision（决策）**  
AI may perform Precheck（预检） and produce recommendations, but Human Review（人工评审） by an authorized role is required for formal Acceptance（正式验收）.

---

## ADR-007 — Structured services own formal state

**Decision（决策）**  
Conversation text, prompt output or frontend local state must not directly become formal business truth.

Formal Project / Task / Result / Review / Permission state is persisted through structured backend services.

---

## ADR-008 — Operational Ontology first

**Decision（决策）**  
Employee Alpha implements a minimal Operational Ontology（可运行本体） sufficient for real workflows before building a complete semantic ontology platform.

Initial entities include:
- User
- Project
- Task
- Conversation
- AgentDefinition
- AgentRun
- Artifact
- Result
- Review
- ActivityEvent

---

## ADR-009 — One Agent Runtime, many Agent Definitions

**Decision（决策）**  
Do not implement one runtime/service per Agent. Use one Agent Runtime（Agent 运行引擎） plus configurable AgentDefinition（Agent 定义）.

Alpha starts with one general Work Agent（工作执行 Agent）.

---

## ADR-010 — Reference prototype is not production code

**Decision（决策）**  
`reference/Enterprise_Brain_Employee_MVP_V0_14_Work_New_Conversation.html` is the visual and interaction reference.

Codex must not continue production development inside the monolithic HTML file. Production UI should be rebuilt as maintainable React / TypeScript components.

---

## ADR-011 — Start with TypeScript full stack for reference implementation

**Decision（决策）**  
For the one-person Employee Reference Stack（员工端参考实现）, prefer a TypeScript-centered stack to reduce engineering complexity:
- Electron
- React
- TypeScript
- Node.js / Fastify
- PostgreSQL

Future formal Java services may replace backend components if public contracts remain compatible.

---

## ADR-012 — Alpha follows vertical slices

**Decision（决策）**  
Development priority follows complete Vertical Slices（端到端业务切片） rather than page count.

Primary Alpha slice:

`Project → Task → AgentRun → Artifact → Employee Confirm → Result → Human Review → Accepted`

---

## Decision Update Rule（决策更新规则）

Before changing any ADR above:
1. explain the reason;
2. list affected UI / API / Domain / Agent behavior;
3. update relevant docs;
4. record a new ADR or amendment instead of silently changing code.