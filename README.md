# NEXORA

Multi-tenant SaaS platform where companies manage teams, projects and tasks, with organization-level authorization and data isolation.

> Work in progress. See [docs/ROADMAP.md](docs/ROADMAP.md) for the plan.

## Local development

Requirements: Node 22+, pnpm, Docker Desktop.

```bash
cp .env.example .env
pnpm install
pnpm infra:up
pnpm --filter @nexora/api prisma:generate
pnpm --filter @nexora/api prisma:migrate
pnpm --filter @nexora/api db:seed
pnpm --filter @nexora/api start:dev
```

| Service          | URL / Port                       |
| ---------------- | -------------------------------- |
| API              | http://localhost:3001/api/v1     |
| API docs         | http://localhost:3001/api/docs   |
| Health           | http://localhost:3001/api/health |
| PostgreSQL       | `localhost:5433`                 |
| Redis            | `localhost:6380`                 |
| Mailpit (web UI) | http://localhost:8025            |

Data model: [docs/ERD.md](docs/ERD.md) · Roles and permissions: [docs/PERMISSIONS.md](docs/PERMISSIONS.md)

## Tests

```bash
pnpm --filter @nexora/api test        # unit tests
pnpm --filter @nexora/api test:e2e    # integration tests over HTTP (needs `pnpm infra:up`)
```

The integration tests create their own `nexora_test` database and never touch your development data.
They cover tenant isolation (one company can never see another's data) and the role rules.
