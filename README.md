# Print Karo — Monorepo

> **Upload. Pay. Print Anywhere.** — Smart Cloud Printing Network.

Sprint 1 foundation: a production-grade Turborepo monorepo. No business features yet — this is the clean base that Sprint 2 builds on. See [`docs/`](docs/) for the full architecture.

## Stack

| Layer | Tech |
|-------|------|
| Monorepo | Turborepo + pnpm workspaces |
| Web (×3) | Next.js 15, React 19, Tailwind v4, shadcn/ui |
| Backend | NestJS 11 |
| Data | PostgreSQL (Neon) + Prisma |
| Auth | Better Auth |
| Tooling | ESLint 9 (flat), Prettier, Husky, Commitlint, lint-staged |
| Infra | Docker, GitHub Actions |

## Layout

```
apps/
  api            NestJS backend API (port 4000)
  web-customer   Customer portal     (port 3000)
  web-admin      Admin dashboard     (port 3001)
  web-machine    Machine kiosk UI    (port 3002)
packages/
  ui             shadcn/ui + Tailwind theme (shared)
  auth           Better Auth config (shared)
  database       Prisma schema + client (shared)
  types          shared types / enums / constants
  config-eslint  shared ESLint flat configs
  config-tsconfig shared tsconfig presets
infra/
  compose        local Postgres + Redis
  docker         Dockerfiles (api, web)
```

## Prerequisites

- Node.js >= 20 (`.nvmrc` pins 20)
- pnpm >= 9 (`corepack enable` or `npm i -g pnpm`)
- Docker (for local Postgres/Redis)

## Getting started

```bash
# 1. Install
pnpm install

# 2. Start local infra (Postgres + Redis)
docker compose -f infra/compose/docker-compose.yml up -d

# 3. Configure env
cp .env.example .env
#   then set BETTER_AUTH_SECRET:  openssl rand -base64 32

# 4. Set up the database
pnpm db:generate
pnpm db:push        # or: pnpm db:migrate
pnpm db:seed        # optional: creates a super-admin placeholder

# 5. Run everything
pnpm dev
```

`pnpm dev` runs all apps in parallel via Turborepo:

| App | URL |
|-----|-----|
| Customer | http://localhost:3000 |
| Admin | http://localhost:3001 |
| Machine | http://localhost:3002 |
| API | https://printkaro-b9r0.onrender.com |
| API health | https://printkaro-b9r0.onrender.com/health |
| API readiness | https://printkaro-b9r0.onrender.com/ready |
| Better Auth | https://printkaro-b9r0.onrender.com/api/auth/* |

## Common scripts

```bash
pnpm dev            # run all apps
pnpm build          # build everything (topological, cached)
pnpm lint           # eslint across the repo
pnpm typecheck      # tsc --noEmit across the repo
pnpm test           # tests across the repo
pnpm format         # prettier --write
pnpm db:studio      # Prisma Studio
```

## Conventions

- **Commits:** Conventional Commits, enforced by commitlint on commit + in CI.
- **Pre-commit:** Husky runs lint-staged (Prettier) on staged files.
- **Path aliases:** `@/*` → `src/*` in each app.
- **Shared types:** import from `@print-karo/types`, never duplicate.
