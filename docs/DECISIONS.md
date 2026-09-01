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

## ADR-016 — Trusted Task Rehydration Boundary

`createTask` creates a new Task only in TODO. `rehydrateTask` restores a trusted
persistence record and may restore any valid formal Task status. HTTP and LLM
input cannot use rehydration to create or alter formal state; transitions remain
exclusive to `applyTaskAction`.

---

## ADR-017 — Desktop Renderer Capability Boundary

**Decision（决策）**

The Electron Renderer has no Node.js, raw operating-system or raw IPC capability.
The preload script exposes only a typed, allowlisted bridge. In EB-006, Employee
API requests are mediated by Electron Main; local filesystem tools remain deferred.

**Consequences（影响）**

- `contextIsolation` and renderer sandboxing remain enabled;
- raw `ipcRenderer` is never exposed to React;
- the API base URL stays in Main Process configuration;
- future local tools require the Desktop Runtime permission boundary.

---

## ADR-018 — Device-Local Workspace Capability Boundary

WorkspaceBinding is device-local metadata keyed by user, project and a random
app-local UUID device identifier. It is not a hardware fingerprint and its
`localPath` never reaches Employee API or PostgreSQL. Renderer has no direct
filesystem capability; Electron Main grants only allowlisted, project-scoped
operations after fresh `/me` and Project membership checks.

EB-007 grants `LOCAL_READ` only. Every path is relative input, canonicalized,
and checked beneath the canonical Workspace root; symlink escape is denied.
Write, delete, create and execute capabilities remain deferred.

---

## ADR-019 — Backend AgentRun Authority with Desktop Tool Executor

AgentRun and AgentToolCall are backend/PostgreSQL structured truth. The API first
creates a RUNNING AgentRun and PENDING ToolCall in one transaction; Electron Main
then executes only the returned allowlisted request through EB-007 WorkspaceService.
Backend never accesses local filesystems. Desktop returns a safe completion receipt,
not file contents or directory listings, and Run completion is transactional and
idempotent. EB-008 enables only QUEUED → RUNNING → SUCCEEDED/FAILED; Task state is
never changed by AgentRun outcome.

---

## ADR-020 — Local Artifact Metadata Authority

EB-009 registers an Artifact only through explicit employee action from one
successful persisted `read_file` ToolCall. Artifact is an immutable metadata
reference to an observed local Workspace file, not a claim that the Agent
created, modified, uploaded, or still retains that file; Artifact is not Result.

Metadata is derived only from the persisted AgentRun, sequence-one ToolCall, and
the shared normalized successful receipt. PostgreSQL stores relative path, size,
UTF-8 encoding, SHA-256, provenance, creator, version and timestamp—never local
absolute paths, content, directory entries, symlink targets, errno or stacks.

Composite foreign keys bind Artifact creator to AgentRun owner and bind Project,
Task, Run and ToolCall provenance. A source ToolCall has at most one Artifact;
concurrent duplicate registration recovers only from that specific uniqueness
conflict outside an aborted transaction.

EB-009 relies on the EB-008 Alpha invariant: an eligible AgentRun contains
exactly one ToolCall with `sequence = 1`. Artifact registration resolves that
exact source and requires successful `read_file`; future multi-tool AgentRuns
must redesign source selection explicitly. Registration performs no new local
read and never mutates Task or AgentRun state.

---

## ADR-021 — Server-Owned Human Confirmation with Operation-Scoped Local Write Grant

EB-010 activates confirmed `write_file` without expanding permanent local
permissions. Backend/PostgreSQL owns `HumanConfirmation` and the formal
AgentRun/ToolCall transitions. A confirmation is scoped to one User, Project,
Task, ToolCall and random app-local device ID, plus one relative path, exact
UTF-8 payload byte size/SHA-256 and `CREATE` or `REPLACE` effect.

The Alpha payload is employee-supplied in the Desktop Renderer and retained only
in Electron Main memory. EB-010 makes no claim that an Agent or model authored
the content; autonomous/model-generated authoring needs a future explicit policy.
The raw execution grant is Main-process-only, one-shot and never crosses preload
to Renderer. Desktop re-checks current identity, Project membership,
WorkspaceBinding and exact provenance before mutation. `CREATE` never overwrites;
`REPLACE` verifies the approved current-file hash immediately before atomic rename.

Reject atomically cancels the confirmation, ToolCall and Run. Completion requires
an approved matching confirmation and produces safe metadata only. EB-010 changes
neither Task state nor creates Artifact or Result automatically.

---

## ADR-022 — Result Candidate Authority and Provenance Boundary

Artifact is not Result. EB-011 creates a Result Candidate only through explicit
employee confirmation and references persisted Artifact provenance without a local
file reread. `createdByUserId` identifies Candidate creation; Human Review
submission fields and actions are deferred. Result identity, creator, Task/Project
provenance and Artifact composition are immutable; future status transitions require
structured Human Review services.

An explicit Idempotency-Key protects retries but does not semantically deduplicate
Results: a new key may create another Candidate for the same Artifact set. Candidate
creation does not mutate Task or AgentRun state and creates no Review.

---

## ADR-023 — Human Review Is Project-Role Scoped

EB-012 makes Human Review backend-owned and immutable: only the Result creator
may submit `CANDIDATE` while still a member; only a current `OWNER` or `REVIEWER`
who is not that creator may issue one `ACCEPT` or `REWORK` decision. Submission
and decision use RepeatableRead transactions and conditional state updates.
Neither transition changes Task, Artifact, or AgentRun; Task acceptance and
dependency effects remain deferred to EB-013. System `ADMIN` does not independently
confer Review authority.

---

## ADR-024 — Result Review Coordinates the Owning Task

EB-013 makes formal Result submission and Human Review coordinate the owning
Task in one PostgreSQL transaction. Submission requires `Task.IN_PROGRESS` and
moves Result/Task to `HUMAN_REVIEW`/`READY_FOR_REVIEW`. ACCEPT moves them to
`ACCEPTED`/`ACCEPTED`; REWORK moves them to `REWORK`/`IN_PROGRESS`. Tasks are
never auto-closed. Dependencies are persisted only for newly-created Tasks in
the same Project and block START until every upstream Task is ACCEPTED or CLOSED.

---

## ADR-025 — Demo Authentication and In-Memory Desktop Session

EB-014 replaces runtime development identity with Account-backed login and
opaque 24-hour Session tokens. Passwords use versioned salted scrypt hashes;
PostgreSQL stores only token SHA-256 hashes. Every protected request checks the
Session, Account status, and User on demand, so revocation and disablement take
effect on the next request. Electron Main owns a memory-only bearer token;
Renderer receives only the current-user contract. Demo seed credentials are
explicit development data, never implicit API startup behavior.

## ADR-026 — Organization and Department Demo Boundary

EB-015 adds Organization and Department memberships as scoped relationships,
separate from the coarse platform `User.systemRole`. Each demo User has one
Organization membership and at most one Department membership; composite
relations prevent cross-Organization assignment. The authenticated session is
the sole actor authority. This is not a general permission engine or desktop
administration console.

## ADR-027 — Live Demo Permission Evaluation

EB-016 evaluates supported business permissions from the authenticated session on
every protected request. Overrides belong to an active Organization member and
are limited to Organization/Department scope. Matching `DENY` wins over matching
`ALLOW`, then role-derived permission, then default deny. OWNER/ADMIN override
management remains Organization-local; this demo policy is not a general RBAC
engine and does not alter local Workspace permissions.

## ADR-028 — Catalog Assignment Is Required for New Agent Runs

EB-017 makes AgentDefinition and active AgentVersion organization-owned records.
An active AgentAssignment and live `AGENT/EXECUTE` permission are separate required
conditions for a new run; an allow override never creates an assignment. Assignments
are Organization, Department, or User scoped; Project scope is deferred until Projects
are organization-scoped. New runs snapshot the server-selected definition key and
version. Later revocation blocks new runs but does not invalidate existing run
provenance or completion.

## ADR-029 — Admin Console Is a Demo Web Control Plane

EB-018 adds a React/Vite Admin Console that reuses backend APIs and shared
contracts for Organization control-plane work. The demo stores its bearer token in
`sessionStorage`; a production deployment must replace this with secure HttpOnly
cookie authentication. Admin UI never evaluates permissions locally: it renders
live server authorization outcomes. Account revocation and audit surfaces remain
deferred to EB-019.

## Decision Update Rule（决策更新规则）

Before changing any ADR above:
1. explain the reason;
2. list affected UI / API / Domain / Agent behavior;
3. update relevant docs;
4. record a new ADR or amendment instead of silently changing code.
## ADR-029 — Control Plane mutation audit is transactional

EB-019 records successful Admin API Department, employee Department assignment, Permission Override, Agent Definition, and Agent Assignment mutations as append-only `AuditEvent` rows in the same RepeatableRead transaction as the formal mutation. Events use server-derived actor and organization identity and retain only minimal, redacted before/after metadata. No-op updates and rejected requests do not generate audit events. The Admin Console provides a read-only, cursor-paginated Audit Logs view; it cannot modify or delete audit records.
