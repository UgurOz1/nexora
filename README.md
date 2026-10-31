# NEXORA

Multi-tenant SaaS platform where companies manage teams, projects and tasks, with organization-level authorization and data isolation.

> Work in progress. See [docs/ROADMAP.md](docs/ROADMAP.md) for the plan.

## Local development

Requirements: Node 22+, pnpm, Docker Desktop.

```bash
cp .env.example .env
pnpm infra:up
```

| Service | URL / Port |
|---|---|
| PostgreSQL | `localhost:5433` |
| Redis | `localhost:6380` |
| Mailpit (web UI) | http://localhost:8025 |
| MinIO console | http://localhost:9001 |
