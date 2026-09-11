# Demo runbook

Prerequisites: Node 22+, pnpm 11+, Docker Desktop or PostgreSQL 16. Copy `.env.example` to an uncommitted `.env`; keep any `OPENAI_API_KEY` there only.

```text
pnpm install
docker compose up -d postgres
pnpm demo:setup
pnpm dev:api
```

Start `pnpm dev:admin` and `pnpm dev:desktop` in separate terminals. API is `http://127.0.0.1:3000`; Admin is `http://127.0.0.1:5174`; Compose service is `postgres`.

| Role | Login | Password |
| --- | --- | --- |
| Admin | `admin@example.test` | `DemoAdmin!2026` |
| Employee | `employee@example.test` | `DemoEmployee!2026` |
| Reviewer | `reviewer@example.test` | `DemoReviewer!2026` |

Walkthrough: sign in to Admin to view the organization, Product/Research departments, and agent assignments. In Desktop sign in as Employee, open **Demo Review Project**, and inspect its tasks. The Dynamic tab shows the Human Group conversation and project swarm activity; Notifications shows the seeded task notice; Library derives visible artifacts and results. **Review the launch brief** is ready for review, while **Archive approved launch brief** demonstrates an accepted review. Sign in as Reviewer to see the review reminder, group mention, and pending review. The employee action queue includes the candidate research result.

The deterministic model history is persisted as a completed `demo-history` invocation and never calls OpenAI. Configure the existing server-only `OPENAI_API_KEY` only for optional live model responses. It is not required by setup or verification.

`pnpm demo:seed` is a stable-ID upsert and does not delete unrelated data. `pnpm demo:verify` runs the isolated database/API demo checks. Do not run it against a shared database because integration tests clean their fixture tables. The seed refuses production-looking URLs and `NODE_ENV=production`.

If setup cannot connect, run `docker compose ps` and confirm port 5432 plus `DATABASE_URL`. If Admin requests fail, ensure `ADMIN_ORIGIN=http://127.0.0.1:5174` and restart API. If the provider is unavailable, the rest of the demo remains usable by design.
