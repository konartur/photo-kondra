# Photo Cloud

Photo Cloud is a modular-monolith MVP for photographers to deliver private photo galleries. This repository currently contains only **M0 — Project Foundation**: a NestJS API, a Next.js frontend, and local PostgreSQL and Redis services.

## Prerequisites

- Node.js 24+ and npm 11+
- Docker Desktop (for PostgreSQL and Redis)

## Local setup

1. Create your local environment file: `cp .env.example .env`. In PowerShell, use `Copy-Item .env.example .env`.
2. Start PostgreSQL and Redis: `docker compose up -d`.
3. Start the API: `npm run dev:backend`.
4. Start the frontend in a second terminal: `npm run dev:frontend`.

The frontend runs at http://localhost:3001. The API runs at http://localhost:3000. Its health check is `GET /api/v1/health`, and Swagger UI is at http://localhost:3000/api/docs.

## Database

After PostgreSQL is running, apply the committed migration with `npm run prisma:migrate --prefix backend`. To create or update the initial admin user, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env`, then run `npm run prisma:seed --prefix backend`. The seed uses an email upsert, so it can be run repeatedly.

## Verification

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

## Repository layout

```text
backend/             NestJS REST API
frontend/            Next.js application
infra/docker/        Docker-related infrastructure files
docker-compose.yml   Local PostgreSQL and Redis services
```

No authentication, gallery, storage, or photo business logic is implemented in M0.
