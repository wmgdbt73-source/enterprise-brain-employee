# enterprise-brain-employee
Enterprise Brain Employee Reference Stack

## Demo startup

1. Configure `DATABASE_URL`, then run `pnpm db:migrate:deploy` and
   `pnpm db:seed:demo`.
2. Start the API with `pnpm dev:api`.
3. Start the Admin Console with `pnpm dev:admin` (default
   `http://127.0.0.1:5174`), then start the Employee Desktop with
   `pnpm dev:desktop`.

The Admin Console reads `VITE_API_BASE_URL` (default
`http://127.0.0.1:3000`). The API only permits the configured `ADMIN_ORIGIN`
(default `http://127.0.0.1:5174`) for browser Admin requests. Build the console
with `pnpm build:admin`.

Demo accounts: `admin@example.test` / `DemoAdmin!2026`,
`employee@example.test` / `DemoEmployee!2026`, and
`reviewer@example.test` / `DemoReviewer!2026`.

## Optional Task model responses

The Desktop Task Detail can request a text-only model suggestion from an
assigned Agent. Configure `OPENAI_API_KEY` and `OPENAI_MODEL` only in the API
process; the Desktop never receives either value. The provider uses the
Responses API with `store: false`, without tools or streaming. If either
setting is absent, asking an Agent shows a local “provider unavailable” error
and the rest of the workspace remains usable. A network-uncertain retry keeps
the same idempotency key; retrying a persisted failed invocation creates a new
attempt.

## Read-only model tools

EB-021 permits a model response to request only the server-owned
`get_task_snapshot` and `list_task_artifacts` functions. They are bound to the
route Task and re-authorized before every read. Tool outputs and opaque
Responses replay items are bounded and retained only for the active request;
they are never written to ordinary logs or returned to Desktop.

## Admin demo

1. Sign in as `admin@example.test` and inspect Dashboard totals.
2. Create a Department, open an Employee, and assign the employee to it.
3. Add a scoped `DENY` or `ALLOW` permission override, then remove it using the
   two-step confirmation.
4. Create an Agent and assign it to the Organization, a Department, or a User.
5. Sign into Employee Desktop and refresh Agent Catalog to see the assignment.
6. Remove the Admin assignment; the Employee's next refresh removes the Agent,
   and the next AgentRun is blocked by live assignment/permission evaluation.
## Audit and authorization revocation

EB-019 provides append-only, organization-scoped Audit Events for successful control-plane mutations. Organization Owners and Admins can read them through `GET /audit-events`; the Admin Console Audit Logs page is read-only. Disabling an account via `PATCH /employees/:userId/account-status` revokes its existing sessions, so the next protected request fails and the employee must sign in again.
