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

See the [storage and private-link security audit](docs/security/storage-private-links-audit.md)
for signed URL limits, deployment checks, residual risks and the required conditional-PUT CORS update.

Production setup: [покрокова інструкція CORS для HTTPS-домену](docs/production-cors.md).

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
Public downloads enforce expiration. Full-album archive object cleanup is not scheduled;
temporary selected-photo archives have the cleanup provider described below.
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
The first click revalidates access and downloads directly from S3. This full-album flow
creates no jobs and does not poll generation. Selected-photo ZIP requests use the
separate on-demand flow described below. If the full-album ZIP is unavailable,
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

### API security headers (Helmet)

The NestJS HTTP bootstrap registers Helmet before Swagger and API routes, including
error responses. `backend/src/setup-app.ts` is shared with HTTP E2E tests so the
tested middleware and production bootstrap stay aligned. Helmet applies its default
headers, including `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`,
`Referrer-Policy: no-referrer`, Content Security Policy and removal of `X-Powered-By`.
Swagger uses local scripts and retains the default `script-src 'self'` policy.

Set `NODE_ENV=production` in the deployment environment to enable Helmet's default
HSTS header and CSP `upgrade-insecure-requests`. Production must serve HTTPS.
For local development/test HTTP these two HTTPS controls are disabled; the other
headers remain enabled. This middleware affects responses served by NestJS; the
Next.js frontend and direct S3 downloads have their own response headers. Helmet
does not configure CORS or rate limiting; those policies are configured separately below.

Verify with `npm --prefix backend run test:e2e`, or inspect the API response headers:

```powershell
curl.exe -I http://localhost:3000/api/v1/health
```

### API CORS

`setupApp` enables NestJS CORS after Helmet and before Swagger/API routes.
Configure exact browser origins (scheme, hostname and port) using a comma-separated
list; paths, wildcard origins, credentials, query strings and fragments are rejected
at startup. Origins are normalized, including an optional trailing slash.

```dotenv
CORS_ALLOWED_ORIGINS=http://localhost:3001,https://photos.example.com
API_URL=https://api.example.com
```

If `CORS_ALLOWED_ORIGINS` is absent, `APP_URL` is used. An explicitly empty list
allows no frontend origins. The origin from `API_URL` is also allowed so Swagger
can call its own API. Configure the browser-visible API origin in production.
Missing configuration never falls back to `*` or arbitrary origin reflection.

An unapproved `Origin`, including the literal `null` origin, receives a generic 403
`CORS_ORIGIN_DENIED` before route handlers run. Allowed origins receive their exact
`Access-Control-Allow-Origin` value and `Vary: Origin`; GET, HEAD, POST, PATCH,
DELETE and OPTIONS are advertised, with only Authorization and Content-Type as
allowed request headers. OPTIONS preflights return 204 without requiring JWT and
can be cached by the browser for 600 seconds. Actual protected requests still
require a valid JWT. Cross-origin cookies are not enabled: admin cookies belong to
Next.js, which forwards Bearer tokens to NestJS from the server.

Requests without Origin (Next.js server requests, curl, health probes) continue
working, but receive no `Access-Control-Allow-Origin`. CORS controls browser access;
it does not authenticate non-browser callers or replace authorization/CSRF controls.
The browser-to-S3 upload/download path needs its own bucket CORS policy; the API
policy does not configure S3 or add API PUT endpoints.

`npm --prefix backend run test:e2e` verifies exact origin matching, rejected origins,
preflight handling, JWT enforcement, Helmet headers and requests without Origin.

### Rate limits, request validation and safe errors

`setupApp` configures explicit JSON and URL-encoded parsers with
`HTTP_BODY_LIMIT_BYTES` (default 65536 bytes). Nest's automatic body parser is
disabled at HTTP bootstrap. Compressed request bodies are rejected (415) to avoid
unbounded decompression; malformed JSON returns 400 without echoing submitted
values. Oversized bodies and URL-encoded requests with more than 1000 parameters
return 413. Bodies with other content types are rejected with 415 before parsing.
This limit applies to metadata, not photo/ZIP bytes transferred directly
to S3. The default accepts the maximum 500-photo selection payload.

The global ValidationPipe transforms DTOs, rejects unknown fields and validates
payloads/query parameters. Validation errors return a generic `VALIDATION_FAILED`
message without submitted objects, passwords or tokens.

API counters are grouped by IP and category, independently of gallery tokens,
resource IDs and query strings. The default fixed window is 60000 milliseconds:

| Setting | Default | Scope |
| --- | --- | --- |
| `RATE_LIMIT_AUTH` | 60 | Shared POST login/refresh request quota |
| `RATE_LIMIT_PUBLIC` | 600 | Public gallery, photo downloads and archive status reads |
| `RATE_LIMIT_ARCHIVE` | 10 | Public selected-photo archive creation requests |
| `RATE_LIMIT_API` | 1200 | Remaining API requests, including upload metadata |
| `RATE_LIMIT_WINDOW_MS` | 60000 | Counter window duration |

Each request uses one category. Counts include invalid/failed requests. OPTIONS and
the exact health endpoint are exempt; Swagger is outside the API limiter. Exceeded
limits return 429, `Retry-After` and standard `RateLimit`/`RateLimit-Policy` headers.
Limits and body size must be positive integers. Existing per-gallery archive
creation/concurrency limits remain an additional safeguard.

Counters currently use in-process memory for the single-API MVP: restarts reset
them, and replicas do not share them. Before running multiple API replicas, use a
shared counter store or enforce quotas at the trusted gateway. In production,
Next.js forwards a verified browser IP with an authenticated proof, so users no
longer share the BFF server's quota. Direct API calls use the socket/trusted-proxy
IP. The supplied ingress template limits public request bodies to 64 KiB too.

`TRUSTED_PROXY_CIDRS` defaults to empty, so arbitrary X-Forwarded-For headers cannot
change the client's rate-limit key. Set it only to actual reverse-proxy IPs/CIDRs
and ensure that proxy overwrites client-supplied forwarding headers. Do not set
unrestricted trust. BFF client proofs are verified independently of this setting;
merely trusting a caller's X-Forwarded-For header is never sufficient.

The global exception filter returns `{ statusCode, code, message }`. Expected 4xx
messages and explicit application codes remain usable. All 5xx responses use generic
messages; database/AWS exception details, stack traces, request bodies and tokenized
URLs are never serialized. Unexpected/server failures log a safe event with a
generated `X-Request-Id`, status and code; error responses use `Cache-Control: no-store`.
Swagger documents the common error schema, 413/415/429/5xx responses and retry header.

Next.js forwards retry/rate-limit/request-ID headers through an explicit allowlist.
Login preserves 429/503 instead of converting every failure to 401. Refresh preserves
cookies on throttling/outages, and the UI can retry without discarding the session.
Allowed direct browser callers can read these headers through CORS exposedHeaders.
SSR dashboard/login checks distinguish a 401 from throttling/outages: only a 401
enters the refresh/sign-in flow. A 429/503/network failure displays a retry screen
at the current URL and never rotates a valid refresh session automatically.

Security regression tests are in `backend/test/http-security.e2e-spec.ts`; they use
real HTTP middleware/DTOs and fixture handlers without AWS, PostgreSQL or Redis.
`backend/test/security-product-flow.integration-spec.ts` also verifies the actual
AppModule controllers, JWT/Argon2 sessions, Prisma, direct upload metadata, Sharp,
private gallery/original downloads and both ZIP flows with `setupApp` enabled.
Only external object storage and queue transport are faked; the workers and business
services are real. The archive integration suite now uses `setupApp` too (with a
higher test archive quota for its many intentional invalid/repeated requests).

### Trusted ingress and client-IP proofs

Production requires a shared `BFF_TRUST_SECRET` of at least 32 bytes on the trusted
ingress, Next.js runtime and NestJS runtime. Generate a random secret privately,
store it in the deployment secret manager and never prefix it with `NEXT_PUBLIC_`.
Keep all three copies identical and clocks synchronized. Never commit its value.
An empty key is permitted only for local development: API socket addresses are used
there, and browser-supplied forwarding headers remain ignored.

The deployable nginx template is `infra/docker/nginx/frontend.conf.template`.
Mount it under `/etc/nginx/templates/default.conf.template` when using the nginx
image's standard env-substitution entrypoint. Provide `BFF_TRUST_SECRET` and
`FRONTEND_UPSTREAM` (for example `frontend:3001`). Enable HTTPS at the public edge
using your deployment's certificate configuration. The template assumes that it
receives browser connections directly. If a trusted load balancer is in front,
configure nginx real-IP handling with only that load balancer's specific trusted
addresses, so `$remote_addr` is the verified original client IP.

Ingress overwrites `X-Photo-Ingress-Key` and `X-Photo-Client-IP`, and strips incoming
proof signatures/timestamps. Restrict direct network access to Next.js and the API
where appropriate. Next.js verifies the ingress key with a constant-time comparison,
validates the IP and signs `(protocol version, IP, timestamp, method, API URL path
and query)` with HMAC-SHA256. The raw ingress key is never forwarded to the API or
browser. Invalid/missing ingress information fails closed with a temporary service
error; it does not silently pool users into a fallback production IP quota.

The API accepts the signed IP only when the signature is valid and the timestamp
is within 30 seconds. Tampered/expired proofs or proofs replayed on another method
or URL return 403. Quotas still group IPv6 subnets to prevent simple address rotation.
The proof affects rate limiting only; all JWT/private-gallery authorization remains
mandatory. Do not log ingress headers, private URLs or proof material. The sample
nginx template disables URL-bearing logs; use the application's redacted request-ID
events or configure a redacted gateway log pipeline before enabling proxy logs.

Playwright checks dashboard 429/503 handling, session preservation and different
client quotas through real Next.js forwarding. Run `npm --prefix frontend run test:e2e`.
For an isolated Windows build cache, optionally set `PHOTO_CLOUD_E2E_DIST_DIR` to a
fresh `.next-e2e-*` directory; generated Next output is ignored by Git and ESLint.

### Selected-photo ZIPs

The public gallery now supports two independent downloads. **Download ZIP** still
serves the full album prepared at publication. Check individual photos (or select
the loaded photos), then use **Download selected** to prepare a separate ZIP.
Selection persists across loaded pages in the current view, with a maximum of 500
photos. It is temporary browser state. Fullscreen browsing remains available.
After preparation, **Save selected ZIP** revalidates access and downloads directly
from private object storage. Failures allow retry without reuploading photographs.

`POST /api/v1/public/galleries/{token}/archives` accepts only a DTO with
`photoIds: string[]` (1–500 unique UUIDs). It returns 202 and an archive ID/status.
The existing authenticated-by-gallery-token status endpoint is polled until
READY/FAILED. Every selected photo must be READY and belong to that published
gallery; invalid selections are rejected as a whole. No original bytes pass through
HTTP controllers. Requests are bounded by `MAX_ARCHIVE_SIZE` and per-gallery
creation/concurrency limits; exhausted limits return 429.

`Archive.selectedPhotoIds` stores the requested IDs in gallery order. An empty list
identifies a full-album archive, preserving existing records. The content hash
captures the exact original identities, filenames, sizes and order. Serializable
transactions deduplicate identical selection/content requests independently from
full-album archives, including selections containing every photo. The existing
streaming BullMQ worker filters by the persisted IDs and checks content identity
before/after transfer. Selection jobs never publish galleries or replace their
full-album ZIP. Status/download checks reject changed selected content, unavailable
galleries and expired/revoked access.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SELECTED_ARCHIVE_RETENTION_TTL` | `86400` seconds | Selection expiry measured from request creation, including queue time |
| `SELECTED_ARCHIVE_MAX_ACTIVE` | `3` | Maximum unexpired PENDING/PROCESSING selections per gallery |
| `SELECTED_ARCHIVE_REQUESTS_PER_MINUTE` | `3` | Maximum new selection records per gallery in a rolling minute; existing reusable jobs are exempt |

These values must be positive integers. A cleanup provider checks every minute,
deleting up to 50 expired selection objects/records per pass, skipping active worker
leases. Storage failures leave records for retry. Cleanup never targets full-album
archives. Expired records may return 410 before cleanup and 404 afterward; a fresh
selection request creates a new job. Signed URLs never outlive archive retention;
already-issued URLs can remain usable until their short TTL after link revocation.

Apply the migration and regenerate Prisma Client before starting the updated API:

```powershell
npm --prefix backend run prisma:deploy
npm --prefix backend run prisma:generate
```

The integration suite covers selection DTO validation, concurrent deduplication,
expiry and preservation of the full-album archive. Unit tests check ZIP contents,
content changes, job limits and cleanup retries. Playwright covers selection,
preparation, retry, download and access revocation with mocked public API responses.

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
