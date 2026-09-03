# Demo Sprint Contract and Ownership

## Shared contract boundary

EB-D00 freezes `packages/contracts` as the single contract source for Demo Sprint
conversation, message, notification, reminder, action queue, library and swarm read
models. A contract change requires explicit cross-lane coordination; this foundation
does not add persistence, API routes, repositories, UI behavior or runtime state.

## Parallel ownership

| Lane | May change | Must not change |
| --- | --- | --- |
| Backend Collaboration | Prisma schema/migrations, database repositories, collaboration/notification/reminder/library APIs, integration tests | — |
| Desktop Feature UI | Desktop renderer feature folders, Desktop gateway/bridge, React/jsdom tests | Prisma schema/migrations; production database repositories |
| AI & Tools | Model runtime, tool registry, local Workspace tool bridge, Agent trace UI | Conversation/Notification/Library Prisma models |
| Demo Integration | Demo seed, fixtures, E2E, startup scripts, demo docs, Admin presentation improvements | Core domain state machines; Prisma schema unless Backend lane has completed and explicitly coordinated it |

Shared file ownership:

- Prisma schema and migration directory: Backend Collaboration only.
- Shared contracts: frozen after Contract Foundation; changes require explicit coordination.
- `apps/desktop/src/renderer/src/App.tsx`: Desktop Feature UI only.
- Root package scripts: Demo Integration only.
- `docs/DECISIONS.md`: each lane appends only its own ADR; do not rewrite other ADRs.

## Demo acceptance baseline

Ordinary Demo modules require one happy path, one permission/organization-isolation
test, one component or API regression test, lint, typecheck, build and CI success.

The following remain strict-test modules: Authentication, Organization isolation,
Permission, Agent Assignment, Result/Review, local file writes, Terminal and formal
Knowledge publication.
