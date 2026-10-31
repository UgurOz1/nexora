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

Data model: [docs/ERD.md](docs/ERD.md)
