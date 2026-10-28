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
process. The administrator publishes a gallery using `POST /galleries/{id}/publish`.
This persists/reuses a PENDING archive and enqueues `generate-archive`
with `{ archiveId }` and a stable BullMQ job ID. If enqueueing fails, the pending
record is marked FAILED.

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
| `ARCHIVE_RETENTION_TTL` | `0` (no expiry) | Retention for internal archive jobs; publication ZIPs always have no automatic expiry |
| `MAX_ARCHIVE_SIZE` | `2147483648` bytes | Bounds declared/actual original bytes and final ZIP bytes, including ZIP overhead |

Apply the existing archive lifecycle migration with the normal `prisma migrate deploy`
workflow before running the worker. This change needs no additional schema migration.
Public downloads enforce expiration. Scheduled object deletion is not implemented.
A process crash between database creation and enqueueing can leave a PENDING record;
a subsequent administrator publication re-enqueues that pending ID. Automatic reconciliation
without a subsequent request is not implemented.
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

## Public ZIP downloads

The administrator uploads photographs in DRAFT, waits for all non-deleted photos
to become READY, then clicks **Publish gallery and prepare ZIP**. The gallery stays
PROCESSING while its ZIP is streamed into S3. The worker marks the archive and
gallery READY in one database transaction only after upload completes. Publication
ZIPs have `expiresAt = null`: they remain stored for the gallery's lifetime, while
download URLs still expire. Check any bucket lifecycle rules against that retention.

The dashboard shows ZIP preparation state and allows the administrator to retry a
publication. Once READY, **Share with client → Copy private link** creates a private
access link and copies it to the clipboard. Repeated copying in the same mounted
view reuses that URL. The URL is displayed for manual copying if clipboard access
is denied. It is not persisted in browser storage; reopening the view can create
a new link because the backend stores only token hashes, not recoverable tokens.
The publish button is disabled immediately on file selection and stays
disabled until uploads finish and the server confirms every photo is READY. Server
readiness counts cover the whole gallery, including unfinished uploads after reload.
Rejected local files with no server record can be removed from the upload list.
A failed publication stays private. Private gallery links can be created
only after publication. Existing links are unavailable during DRAFT/PROCESSING.
Photo mutations are allowed only in DRAFT, with a database row lock shared with
publication to protect concurrent operations. To edit a published gallery, return
it to DRAFT, change photos and publish again. A matching prebuilt archive can be
reused immediately. Canceling publication by returning to DRAFT does not forcibly
abort an upload already underway, but the worker will not publish a draft gallery.

The public gallery at `/g/{token}` offers **Download ZIP** for a prebuilt archive.
The first click revalidates access and downloads directly from S3. No public route
creates jobs, and the client never polls archive generation. If a ZIP is unavailable,
the client sees an availability message and can recheck; preparation remains an
administrator action. Legacy READY galleries without a matching content hash should
be returned to DRAFT and republished once.

| Endpoint | Access and response |
| --- | --- |
| `POST /api/v1/galleries/{galleryId}/publish` | Owner ADMIN JWT; returns 202 with gallery status; starts/retries preparation |
| `GET /api/v1/galleries/{galleryId}/archive` | Owner ADMIN JWT; current preparation ID and status |
| `GET /api/v1/public/galleries/{token}/archive` | Valid active token for a READY gallery; returns prebuilt ZIP metadata and signed URL |
| `GET /api/v1/public/archives/{archiveId}?token={token}` | Valid active token belonging to that archive's gallery; returns current state |

Public operations recheck expiration/revocation, return no storage keys and disable
HTTP caching. Missing/invalid proof returns 400/404. Expired ZIPs return 410. A READY
response includes a signed attachment URL whose TTL is the shorter of
`SIGNED_URL_ARCHIVE_TTL` and the archive's remaining retention, if one exists. Revoking a gallery
link prevents new URLs; already-issued S3 URLs remain valid until their short TTL
expires. Do not put private tokens or signed URLs in logs.

Archive `contentHash` identifies the ordered READY originals by ID, key, filename,
size and order. Serializable PostgreSQL transactions with conflict retries reuse
an existing active or unexpired READY archive for identical content, including
concurrent requests. Failed/expired ZIPs or changed content produce a new archive.
The worker checks content identity before and after streaming; a changed gallery
fails that attempt rather than publishing it under the wrong content identity.
Original storage keys must remain immutable. Older archives without a matching hash
cannot be downloaded through public endpoints; republish those galleries once.
Republication also removes the finite retention timestamp from a reusable legacy ZIP.

Apply `npm --prefix backend run prisma:deploy` and regenerate the client after the
content-hash migration; stop the backend first on Windows if its Prisma DLL is locked.
Swagger documents both endpoints at `/api/docs`.

Additional tests:

```powershell
npm --prefix backend run test:integration
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:e2e
```

Integration tests use configured local PostgreSQL, create isolated records and
clean up their own galleries/users. They verify parallel request deduplication,
content/expiry handling and HTTP access checks. Queue/storage are mocked so no AWS
objects are created. Playwright builds an isolated webpack frontend on port 3002
and mocks public API responses to test immediate prebuilt download, unavailable ZIPs
without generation, and revoked access at click time. PostgreSQL integration tests
exercise publication, worker ZIP creation through a fake storage adapter, immutable
published photos, republication, and failed publication/retry. No real AWS is used.

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
