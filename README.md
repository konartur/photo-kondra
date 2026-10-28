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
   npm --prefix backend run prisma:deploy
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
| Apply existing migrations | `npm --prefix backend run prisma:deploy` |
| Check migration state | `npm --prefix backend run prisma:status` |
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

## Archive generation worker

`ArchivesModule` runs a BullMQ consumer for `archive-generation` inside the NestJS
process. Internal callers use `ArchivesService.create(galleryId)` after authorizing
gallery access. This persists a PENDING archive and enqueues `generate-archive`
with `{ archiveId }` and a stable BullMQ job ID. If enqueueing fails, the pending
record is marked FAILED. Public request/status/download endpoints belong to the
next roadmap issue (#24) and are not implemented by this worker change.

The worker claims a database lease, selects READY originals in gallery order,
checks their existence and streams each original into a ZIP. Only one original
response is opened at a time. ZIP entries preserve original bytes (no extra
compression), sanitize path separators/control characters and disambiguate names.
The S3 adapter uses multipart upload for streams, with two 5 MiB parts in flight;
it aborts incomplete multipart uploads on failure. The bucket must remain private.
The storage identity needs multipart permissions, including `s3:AbortMultipartUpload`.

Each attempt writes `archives/{archiveId}-{lockId}.zip`. This intentionally extends
the initial key convention so an expired worker cannot overwrite or delete another
attempt's object. Only the worker holding the database lease can publish its key
as READY. READY jobs are skipped. If another worker holds the database lease, the
BullMQ job is delayed until that lease expires instead of being incorrectly marked
completed. Failed attempts clean up their own object and release their lease;
transient errors use the queue's configured attempts/backoff,
while empty galleries, missing originals and size-limit failures are permanent.

| Variable | Default | Purpose |
| --- | --- | --- |
| `ARCHIVE_PROCESSING_LOCK_TTL` | `900` seconds | Database lease duration and streaming deadline; stalled transfers are aborted and can retry |
| `ARCHIVE_RETENTION_TTL` | `86400` seconds | Sets `expiresAt` when the ZIP becomes READY |
| `MAX_ARCHIVE_SIZE` | `2147483648` bytes | Bounds declared/actual original bytes and final ZIP bytes, including ZIP overhead |

Apply the existing archive lifecycle migration with the normal `prisma migrate deploy`
workflow before running the worker. This change needs no additional schema migration.
Expiration is metadata only here: public expiration enforcement and scheduled object
deletion are not part of this worker. A process crash between database creation and
enqueueing can leave a PENDING record; automatic reconciliation is not implemented.
Database leases and attempt keys prevent conflicting publication, but do not guarantee
exactly-once execution. No real AWS is needed for unit tests; actual S3 multipart
and large-gallery load testing remain deployment checks.

Worker verification: `npm test` includes archive creation, actual ZIP entry contents,
ordering/names, duplicate delivery, retries, missing originals, byte limits, stream
failures, timeout, lease replacement, configuration and multipart adapter tests.
The HTTP health E2E overrides both workers so it does not start Redis consumers.

On this Windows environment, the default frontend Turbopack build fails while
starting the CSS child process, including outside the sandbox. The production
build succeeds with `npm run build --prefix frontend -- --webpack`; backend builds
with `npm run build --prefix backend`. The frontend build script is unchanged.

## Verification

Archive progress is logged as `archive_progress` every five seconds and persisted
in BullMQ `job.progress`. Fields include `readPercent`, `photoPercent`,
`readBytesPerSecond`, `uploadBytesPerSecond`, `readIdleSeconds`, `uploadIdleSeconds`,
`readBytes`, `uploadedBytes` and `phase` (`streaming`, `publishing`, `ready`, `failed`).
Rates describe the last sampling interval, in bytes/second. Read percentage uses
database original sizes. `uploadPercent` is null until the exact ZIP size is known;
confirmed S3 multipart bytes may advance in 5 MiB steps. Reading 100% does not mean
the ZIP is READY: storage upload and database publication must also finish.
Retries reset progress for the new attempt. The worker writes the ZIP back to the
configured private `AWS_S3_BUCKET` under the `archives/` prefix.

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
