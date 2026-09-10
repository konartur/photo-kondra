# Photo Cloud

Photo Cloud is a modular-monolith MVP for private photo delivery. The current implementation includes the NestJS API, Next.js frontend, PostgreSQL, Redis, Prisma, administrator authentication with refresh-token sessions, gallery management, direct-to-S3 photo upload, an S3-compatible storage abstraction, BullMQ queues, and baseline image-processing workers.

## Prerequisites

- Node.js 24+ and npm 11+
- Docker Desktop, running before starting the database services

## First local start

Run every command below from the repository root unless a command specifies `backend`.

1. Install application dependencies:

   ```powershell
   npm install --prefix backend
   npm install --prefix frontend
   ```

2. Create the local configuration file and set secure values before using authentication:

   ```powershell
   Copy-Item .env.example .env
   ```

   Set `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in `.env`. Do not commit this file.

3. Start PostgreSQL and Redis, then wait until their health checks pass:

   ```powershell
   docker compose up -d
   docker compose ps
   ```

4. Apply the committed database migrations, generate the Prisma client, and create/update the initial admin:

   ```powershell
   npm --prefix backend exec prisma migrate deploy
   npm --prefix backend run prisma:generate
   npm --prefix backend run prisma:seed
   ```

5. Start the API and frontend in separate terminals:

   ```powershell
   npm run dev:backend
   npm run dev:frontend
   ```

The frontend is at http://localhost:3001. The API is at http://localhost:3000, Swagger is at http://localhost:3000/api/docs, and the health endpoint is `GET /api/v1/health`.

## Local database workflow

The Docker Compose PostgreSQL service uses the connection settings in `.env`; `DATABASE_URL` must point to `localhost:5432` for the default setup.

| Task | Command |
| --- | --- |
| Check service health | `docker compose ps` |
| View PostgreSQL logs | `docker compose logs -f postgres` |
| Apply existing migrations | `npm --prefix backend exec prisma migrate deploy` |
| Check migration state | `npm --prefix backend exec prisma migrate status` |
| Validate schema | `npm --prefix backend run prisma:validate` |
| Generate Prisma Client after schema changes | `npm --prefix backend run prisma:generate` |
| Create a development migration | `npm --prefix backend run prisma:migrate -- --name descriptive_name` |
| Seed/update initial admin | `npm --prefix backend run prisma:seed` |
| Open Prisma Studio | `npm run prisma:studio` |

Use `prisma migrate dev` only for creating migrations on a local development database. Use `prisma migrate deploy` to apply already committed migrations. When Studio reports that a table is missing, run `prisma migrate deploy` and restart Studio.

To stop local services without deleting data:

```powershell
docker compose down
```

`docker compose down -v` also deletes the PostgreSQL and Redis volumes. This permanently removes local database data; use it only when you intentionally want a clean database. Afterward, start services and run the migration and seed steps again.

## Object storage configuration

The API starts without cloud credentials so that health checks and local database work remain available. Storage operations require `AWS_REGION` and `AWS_S3_BUCKET`; set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` together when using static AWS credentials. The application otherwise uses the AWS SDK default credential provider chain.

For an S3-compatible provider such as MinIO or Cloudflare R2, configure `AWS_S3_ENDPOINT`. Set `AWS_S3_FORCE_PATH_STYLE=true` when the provider requires path-style bucket URLs. The bucket must remain private; the API will use short-lived signed URLs when upload and download endpoints are introduced.

## Verification

```powershell
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
```

## Repository layout

```text
backend/             NestJS REST API and Prisma schema/migrations
frontend/            Next.js application
infra/docker/        Docker-related infrastructure files
docker-compose.yml   Local PostgreSQL and Redis services
```
