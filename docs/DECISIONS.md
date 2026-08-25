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

## ADR-013 — Employee Core Domain Baseline

**Decision（决策）**
Employee Core Domain starts with User, Project, ProjectMember and Task.

**Task state names（任务状态命名）**
`TODO → IN_PROGRESS → READY_FOR_REVIEW → ACCEPTED → CLOSED`, with `READY_FOR_REVIEW → IN_PROGRESS` for request rework.

**Project membership（项目成员）**
ProjectMember is the source of truth for Project membership and Project-level roles. Project does not store `ownerId` or `memberIds`. Alpha starts with one OWNER, and OWNER transfer or multiple OWNERs are deferred.

**User and Project roles（用户与项目角色）**
User system roles are `EMPLOYEE` and `ADMIN`. Project roles are `OWNER`, `MEMBER` and `REVIEWER`; OWNER is not a User system role.

**Acceptance and closure（验收与关闭）**
`ACCEPTED != CLOSED`. A Task enters ACCEPTED only through `ACCEPT_AFTER_HUMAN_REVIEW`; CLOSED requires a separate formal action.

**Deferred（延期）**
`WAITING`, `BLOCKED` and `CANCELLED` are deferred from EB-002.

---

## ADR-014 — PostgreSQL and Prisma Persistence Baseline

**Decision（决策）**
EB-003 uses PostgreSQL with Prisma ORM 7. Prisma uses the `prisma-client`
generator with an explicit generated-client output, `prisma.config.ts`, and the
PostgreSQL driver adapter (`@prisma/adapter-pg` + `pg`).

**Boundary（边界）**
`packages/database` owns the schema, migrations and explicit client factory.
`packages/domain` does not depend on Prisma. Repositories and Domain rehydration
are deferred to the application/repository integration task.

**Integrity（完整性）**
The first persistence scope is User, Project, ProjectMember and Task, plus
persistence-only TaskAssignment and TaskDependency relations. IDs are externally
supplied strings. ProjectMember remains the membership/role source of truth.
Database constraints enforce unique project membership and, through a PostgreSQL
partial unique index in the committed migration, at most one OWNER per Project.

**Time（时间）**
Domain owns `createdAt` and `updatedAt`; PostgreSQL stores timezone-aware values
without database defaults or Prisma `@updatedAt` mutation.

---

## ADR-015 — Development Identity through RequestContext

**Decision（决策）**
EB-004 uses a temporary DevIdentityProvider that supplies one configured
development user. API route and business code consume identity only through
RequestContext (`currentUser`), never through a hardcoded user ID.

**Bootstrap（初始化）**
Application startup idempotently ensures that the development identity has a
corresponding User record using the User Domain Rule. This makes the owner
ProjectMember foreign key valid without route-level hidden user creation.

**Future replacement（未来替换）**
DevIdentityProvider is not authentication. Enterprise Identity / SSO can replace
the provider without changing business services that consume RequestContext.

---

## Decision Update Rule（决策更新规则）

Before changing any ADR above:
1. explain the reason;
2. list affected UI / API / Domain / Agent behavior;
3. update relevant docs;
4. record a new ADR or amendment instead of silently changing code.
