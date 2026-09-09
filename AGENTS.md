# Photo Cloud — Codex Development Instructions

## 1. Project overview

Build a cloud-based photo delivery platform for photographers.

The platform allows an administrator to:

- create photo galleries;
- upload large sets of photographs;
- process uploaded images;
- generate thumbnails and previews;
- create private links to galleries;
- revoke private links;
- manage gallery photos.

Clients do not need accounts.

A client receives a private gallery URL and can:

- view the gallery;
- browse thumbnails;
- open a photo in fullscreen;
- navigate between photos;
- download a single original photo;
- request a ZIP archive containing the gallery photos.

The application must be designed as a modular monolith.

Do NOT introduce microservices, Kubernetes, Kafka, GraphQL, Elasticsearch, or other unnecessary infrastructure during MVP development.

The primary goal is to create a production-quality MVP while using the project as a learning project for NestJS.

---

# 2. Technology stack

## Backend

Use:

- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL
- Redis
- BullMQ
- Sharp
- REST API
- Swagger / OpenAPI
- JWT authentication
- Passport
- class-validator
- class-transformer

## Frontend

Use:

- Next.js
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query

Use Zustand only when local/global client state cannot be handled cleanly with React state or TanStack Query.

## Storage

Use an S3-compatible object storage abstraction.

Primary implementation:

- AWS S3

The code must not couple business logic directly to AWS SDK.

Create a `StorageService` abstraction so that Cloudflare R2 or MinIO can be added later.

## Infrastructure

Use:

- Docker
- Docker Compose
- PostgreSQL
- Redis

## Testing

Use:

- Jest
- Supertest
- Playwright

## CI

Use GitHub Actions.

---

# 3. Repository structure

Prefer this initial structure:

```text
photo-cloud/
├── backend/
│   ├── src/
│   ├── prisma/
│   ├── test/
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── package.json
│
├── infra/
│   └── docker/
│
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
├── AGENTS.md
└── package.json
```

Do not introduce a complex monorepo package architecture unless it is actually necessary.

---

# 4. Backend architecture

NestJS must use a modular architecture.

Expected modules:

```text
src/
├── auth/
├── users/
├── galleries/
├── photos/
├── storage/
├── uploads/
├── image-processing/
├── gallery-access/
├── public-gallery/
├── downloads/
├── archives/
├── prisma/
└── common/
```

Each module should have a clear responsibility.

Avoid putting business logic in controllers.

Controllers should:

- validate input;
- authorize requests;
- call services;
- return response DTOs.

Services should contain business logic.

---

# 5. Module responsibilities

## AuthModule

Responsible for:

- login;
- access token;
- refresh token;
- logout;
- current user;
- JWT strategy;
- authentication guards.

Endpoints:

```http
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

---

## UsersModule

Responsible for:

- user lookup;
- user creation;
- password hash storage.

MVP supports only:

```text
ADMIN
```

Do not implement a complex permission system.

---

## GalleriesModule

Responsible for:

- creating galleries;
- listing galleries;
- getting gallery details;
- updating galleries;
- deleting galleries;
- gallery status.

Endpoints:

```http
GET    /api/v1/galleries
POST   /api/v1/galleries
GET    /api/v1/galleries/:galleryId
PATCH  /api/v1/galleries/:galleryId
DELETE /api/v1/galleries/:galleryId
```

---

## PhotosModule

Responsible for:

- photo metadata;
- photo lifecycle;
- photo listing;
- photo deletion;
- photo ordering.

Endpoints:

```http
GET    /api/v1/galleries/:galleryId/photos
PATCH  /api/v1/photos/:photoId
DELETE /api/v1/photos/:photoId
```

Do not upload large image files through NestJS.

---

# 6. Storage architecture

Create:

```text
StorageService
```

as an abstraction.

Example interface:

```typescript
export interface StorageService {
  createUploadUrl(params: {
    key: string;
    contentType: string;
    expiresIn: number;
  }): Promise<string>;

  createDownloadUrl(params: {
    key: string;
    expiresIn: number;
    filename?: string;
  }): Promise<string>;

  upload(params: {
    key: string;
    body: Buffer | NodeJS.ReadableStream;
    contentType: string;
  }): Promise<void>;

  delete(key: string): Promise<void>;

  exists(key: string): Promise<boolean>;
}
```

Implement:

```text
S3StorageService
```

Business logic must depend on `StorageService`, not directly on AWS SDK.

---

# 7. Object storage rules

The S3 bucket must be private.

Never make original photos publicly accessible.

Storage structure:

```text
galleries/
  {galleryId}/
    originals/
      {photoId}.{extension}

    previews/
      {photoId}.webp

    thumbnails/
      {photoId}.webp

archives/
  {archiveId}.zip
```

Do not store complete URLs in PostgreSQL.

Store object keys:

```text
originalKey
previewKey
thumbnailKey
```

Generate signed URLs dynamically.

---

# 8. Upload architecture

Large files must use direct-to-storage uploads.

Correct flow:

```text
Browser
   |
   | POST /photos/upload-url
   v
NestJS
   |
   | presigned URL
   v
Browser
   |
   | PUT file
   v
S3
```

Implement:

```http
POST /api/v1/galleries/:galleryId/photos/upload-url
POST /api/v1/photos/:photoId/upload-complete
```

Example request:

```json
{
  "filename": "IMG_1234.JPG",
  "mimeType": "image/jpeg",
  "size": 12457890
}
```

Example response:

```json
{
  "photoId": "uuid",
  "uploadUrl": "https://...",
  "expiresIn": 900
}
```

Validate:

- MIME type;
- file size;
- filename;
- gallery ownership.

Do not trust the file extension alone.

---

# 9. Photo lifecycle

Photo status:

```text
UPLOADING
PROCESSING
READY
FAILED
DELETED
```

Flow:

```text
upload URL created
        |
        v
    UPLOADING
        |
        | upload-complete
        v
    PROCESSING
        |
        v
   BullMQ worker
        |
        ├── thumbnail
        ├── preview
        └── metadata
        |
        v
      READY
```

If processing fails:

```text
PROCESSING → FAILED
```

The system must support retrying failed jobs.

---

# 10. Image processing

Use:

```text
Sharp
```

Generate:

### Thumbnail

Approximately:

```text
300px wide
WebP
```

### Preview

Approximately:

```text
1600px wide
WebP
```

Keep the original file unchanged.

Extract at minimum:

```text
width
height
```

Do not over-engineer image processing during MVP.

---

# 11. Queue architecture

Use:

```text
Redis + BullMQ
```

Initial queues:

```text
image-processing
archive-generation
```

Image processing jobs must run outside the HTTP request lifecycle.

Example:

```typescript
imageQueue.add('process-photo', {
  photoId,
});
```

Worker responsibilities:

1. retrieve photo metadata;
2. download original from storage;
3. process image using Sharp;
4. upload thumbnail;
5. upload preview;
6. update metadata;
7. mark photo as READY.

Use retry configuration.

Failed jobs must be observable.

---

# 12. Prisma data model

Use these entities:

```text
User
Gallery
Photo
GalleryAccess
Archive
```

Enums:

```text
UserRole
GalleryStatus
PhotoStatus
```

Expected initial schema:

```prisma
enum UserRole {
  ADMIN
}

enum GalleryStatus {
  DRAFT
  PROCESSING
  READY
  ARCHIVED
}

enum PhotoStatus {
  UPLOADING
  PROCESSING
  READY
  FAILED
  DELETED
}

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  role         UserRole @default(ADMIN)

  galleries Gallery[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Gallery {
  id          String        @id @default(uuid())
  title       String
  description String?
  status      GalleryStatus @default(DRAFT)

  ownerId String
  owner   User   @relation(fields: [ownerId], references: [id])

  photos      Photo[]
  accessLinks GalleryAccess[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([ownerId])
  @@index([status])
}

model Photo {
  id String @id @default(uuid())

  galleryId String
  gallery   Gallery @relation(
    fields: [galleryId],
    references: [id],
    onDelete: Cascade
  )

  originalKey  String?
  previewKey   String?
  thumbnailKey String?

  filename String
  mimeType String
  size     BigInt

  width  Int?
  height Int?

  status    PhotoStatus @default(UPLOADING)
  sortOrder Int         @default(0)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([galleryId])
  @@index([status])
}

model GalleryAccess {
  id String @id @default(uuid())

  galleryId String
  gallery   Gallery @relation(
    fields: [galleryId],
    references: [id],
    onDelete: Cascade
  )

  tokenHash String @unique

  expiresAt DateTime?
  isActive  Boolean  @default(true)

  createdAt DateTime @default(now())

  @@index([galleryId])
  @@index([expiresAt])
}

model Archive {
  id String @id @default(uuid())

  galleryId String

  storageKey String?
  status     String

  createdAt DateTime @default(now())
  expiresAt DateTime?
}
```

You may improve the schema when implementation requires it, but do not add unnecessary entities.

---

# 13. Private gallery links

Clients do not have accounts.

The administrator can generate a private URL.

Example:

```text
https://photos.example.com/g/AbC123Xyz
```

Generate cryptographically secure random tokens.

Do not store raw tokens in PostgreSQL.

Store:

```text
hash(token)
```

When a client accesses the gallery:

```text
token
  |
  v
hash(token)
  |
  v
find GalleryAccess
  |
  ├── active?
  ├── expired?
  └── gallery exists?
  |
  v
allow access
```

Admin endpoints:

```http
POST   /api/v1/galleries/:galleryId/access-links
GET    /api/v1/galleries/:galleryId/access-links
DELETE /api/v1/access-links/:accessLinkId
```

---

# 14. Public gallery API

Public endpoints must not require admin JWT.

Implement:

```http
GET /api/v1/public/galleries/:token
GET /api/v1/public/galleries/:token/photos
GET /api/v1/public/photos/:token/:photoId/download
POST /api/v1/public/galleries/:token/archive
GET /api/v1/public/archives/:archiveId
```

Only expose:

- gallery metadata;
- photo metadata;
- thumbnail URL;
- preview URL.

Do not expose original storage keys.

---

# 15. Signed URL rules

For thumbnails and previews:

- signed URLs may have a reasonable lifetime;
- originals must use short-lived signed URLs;
- ZIP archives must also use signed URLs.

Recommended initial values:

```text
Preview: 15–60 minutes
Original: 5–15 minutes
Archive: 15–60 minutes
```

Make expiration configurable through environment variables.

---

# 16. Download single photo

Do not proxy large files through NestJS.

Correct flow:

```text
Client
  |
  | request download
  v
NestJS
  |
  | validate private token
  |
  | generate signed URL
  v
Client
  |
  | download
  v
S3
```

Set appropriate content disposition:

```text
attachment
```

and original filename.

---

# 17. ZIP archives

Do not create large ZIP archives synchronously in an HTTP request.

Flow:

```text
Client
   |
   | POST archive
   v
NestJS
   |
   v
BullMQ
   |
   v
Archive Worker
   |
   ├── read originals
   ├── create ZIP
   └── upload ZIP
           |
           v
          S3
```

Archive status:

```text
PENDING
PROCESSING
READY
FAILED
```

For MVP, archives can expire after a configurable period.

---

# 18. REST API conventions

Base path:

```text
/api/v1
```

Use RESTful naming.

Use DTOs for all incoming payloads.

Never accept arbitrary objects directly in controllers.

Use:

```typescript
ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
})
```

Return consistent HTTP status codes.

Examples:

```text
201 Created
200 OK
204 No Content
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
```

---

# 19. Error handling

Create a consistent API error format.

Example:

```json
{
  "statusCode": 404,
  "code": "GALLERY_NOT_FOUND",
  "message": "Gallery not found"
}
```

Do not expose:

- database errors;
- AWS credentials;
- internal stack traces;
- filesystem paths;
- sensitive implementation details.

Use global exception handling where appropriate.

---

# 20. Security

Implement:

- Helmet;
- CORS;
- rate limiting;
- DTO validation;
- JWT authentication;
- role guards;
- password hashing;
- private S3 bucket;
- signed URLs;
- secure random gallery tokens;
- token hashing;
- access-link expiration;
- access-link revocation;
- file MIME validation;
- file size validation.

Passwords must never be stored directly.

Use Argon2 or bcrypt.

Prefer Argon2 when practical.

---

# 21. Database rules

Use Prisma migrations.

Never modify production schema manually.

Use:

```text
prisma migrate dev
```

during development.

Use:

```text
prisma migrate deploy
```

for production.

Provide:

```text
prisma/seed.ts
```

to create an initial admin user.

Credentials must come from environment variables.

Never hardcode passwords.

---

# 22. Pagination

Photo lists must support pagination.

Use cursor pagination where practical.

Example:

```http
GET /api/v1/galleries/:galleryId/photos?limit=50&cursor=abc
```

Response:

```json
{
  "items": [],
  "nextCursor": "xyz"
}
```

Do not return thousands of photos in a single response.

---

# 23. Frontend architecture

Admin routes:

```text
/login
/dashboard
/dashboard/galleries
/dashboard/galleries/[id]
```

Public routes:

```text
/g/[token]
```

Admin UI:

- login;
- gallery list;
- create gallery;
- edit gallery;
- gallery details;
- photo uploader;
- upload progress;
- photo management;
- private link management.

Public gallery:

- responsive grid;
- thumbnails;
- horizontal thumbnail scrolling;
- fullscreen viewer;
- previous/next;
- keyboard navigation;
- mobile-friendly gestures;
- single-photo download;
- download-all button.

---

# 24. Frontend data fetching

Use TanStack Query for server state.

Avoid unnecessary global state.

Use React state for simple UI state.

Use Zustand only when justified.

Implement:

- loading states;
- error states;
- empty states;
- retry states;
- optimistic updates only when safe.

---

# 25. Photo gallery performance

Never load original photos into the gallery grid.

Use:

```text
thumbnail → gallery grid
preview   → fullscreen viewer
original  → download
```

Use lazy loading.

Use responsive image rendering.

Avoid loading hundreds of full-resolution images simultaneously.

---

# 26. Upload UX

Uploader must support:

- multiple files;
- drag & drop;
- upload progress;
- per-file status;
- failed upload retry;
- cancellation if practical;
- duplicate handling.

Example:

```text
IMG_001.JPG   ██████████ 100% READY
IMG_002.JPG   ███████░░░  70% UPLOADING
IMG_003.JPG   ███░░░░░░░  30% UPLOADING
IMG_004.JPG   FAILED
```

The UI should distinguish:

```text
Uploading
Processing
Ready
Failed
```

---

# 27. API documentation

Use Swagger.

Expose:

```text
/api/docs
```

Document:

- endpoints;
- request DTOs;
- response DTOs;
- authentication;
- errors;
- examples.

Every new API endpoint must have Swagger documentation.

---

# 28. Testing requirements

Every important service must have unit tests.

At minimum:

```text
AuthService
GalleryService
PhotoService
GalleryAccessService
StorageService
```

Integration tests should verify:

```text
database operations
authentication
gallery access
photo lifecycle
```

E2E test should cover:

```text
Admin login
    ↓
Create gallery
    ↓
Generate upload URL
    ↓
Upload photo
    ↓
Complete upload
    ↓
Process image
    ↓
Create private link
    ↓
Open public gallery
    ↓
Download photo
    ↓
Generate ZIP
```

---

# 29. GitHub milestones

Create these milestones:

```text
M0 Foundation
M1 Authentication
M2 Galleries
M3 Storage
M4 Image Processing
M5 Private Gallery
M6 Frontend
M7 Downloads
M8 Security
M9 Testing
M10 Deployment
```

Labels:

```text
type:feature
type:bug
type:refactor
type:security
type:documentation

area:backend
area:frontend
area:database
area:storage
area:infra

priority:p0
priority:p1
priority:p2
```

---

# 30. Implementation order

Implement strictly in this order unless there is a strong technical reason to deviate.

```text
1. Project foundation
2. Docker
3. Prisma
4. Authentication
5. Gallery CRUD
6. S3 abstraction
7. Photo upload
8. BullMQ
9. Sharp processing
10. Private gallery links
11. Admin frontend
12. Public gallery frontend
13. Single photo download
14. ZIP generation
15. Security hardening
16. Tests
17. CI/CD
18. Production deployment
```

Do not implement later-stage features before the foundation works.

---

# 31. Vertical slice principle

The most important development principle is to build a working vertical slice early.

The first complete flow should be:

```text
Admin login
    ↓
Create gallery
    ↓
Request upload URL
    ↓
Upload one photo to S3
    ↓
Complete upload
    ↓
Process image
    ↓
Generate thumbnail + preview
    ↓
Create private link
    ↓
Open public gallery
    ↓
View photo
```

Only after this works should the project be expanded to bulk upload, ZIP downloads, advanced UI, etc.

---

# 32. Git workflow

Use small commits.

Prefer:

```text
feat(auth): implement admin login
feat(galleries): add gallery CRUD
feat(storage): add S3 storage abstraction
feat(photos): implement presigned upload
feat(images): add thumbnail processing
feat(access): implement private gallery links
```

Avoid commits such as:

```text
"implement everything"
```

Keep changes focused.

---

# 33. Definition of Done

A task is complete only when:

```text
[ ] implementation complete
[ ] DTO validation added
[ ] authorization checked
[ ] error cases handled
[ ] tests added where appropriate
[ ] Swagger documentation updated
[ ] logging added where appropriate
[ ] frontend integrated if applicable
[ ] no TypeScript errors
[ ] lint passes
[ ] tests pass
[ ] documentation updated if needed
```

Before marking an issue complete, run:

```text
lint
typecheck
unit tests
build
```

and relevant E2E tests.

---

# 34. Code quality rules

Prefer readable code over clever code.

Use:

- strict TypeScript;
- explicit DTOs;
- dependency injection;
- small services;
- single responsibility;
- repository/service separation where useful;
- interfaces around external infrastructure;
- meaningful naming.

Avoid:

- `any`;
- huge services;
- huge controllers;
- duplicated business logic;
- direct Prisma calls from controllers;
- direct AWS SDK usage throughout the application;
- hardcoded configuration;
- hidden global state.

Do not introduce abstractions without a reason.

---

# 35. Environment variables

Create `.env.example`.

Expected configuration:

```text
DATABASE_URL=

REDIS_HOST=
REDIS_PORT=
REDIS_PASSWORD=

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=

AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET=

APP_URL=
API_URL=

SIGNED_URL_PREVIEW_TTL=
SIGNED_URL_ORIGINAL_TTL=
SIGNED_URL_ARCHIVE_TTL=

MAX_PHOTO_SIZE=
MAX_ARCHIVE_SIZE=
```

Never commit real credentials.

---

# 36. Logging

Use structured logging.

At minimum log:

- authentication failures;
- upload creation;
- upload completion;
- image processing failures;
- archive failures;
- access-link creation/revocation;
- unexpected server errors.

Do not log:

- passwords;
- JWTs;
- raw private gallery tokens;
- AWS secrets;
- signed URLs.

---

# 37. Performance principles

The system must be designed around large files.

Never:

```text
Browser → NestJS → S3
```

for normal photo upload/download.

Prefer:

```text
Browser → S3
```

using signed URLs.

Never load the entire ZIP or original photo into memory unnecessarily.

Use streams for large files.

Image processing must happen asynchronously.

---

# 38. What NOT to implement in MVP

Do not implement:

- payments;
- subscriptions;
- multiple photographer organizations;
- client accounts;
- social login;
- facial recognition;
- AI tagging;
- image search;
- Elasticsearch;
- GraphQL;
- Kafka;
- microservices;
- Kubernetes;
- mobile applications;
- real-time collaboration.

These can be future features.

---

# 39. Future features

Potential post-MVP features:

```text
Favorites
Client photo selection
Download selected photos
Gallery password
Custom domains
Watermarks
EXIF stripping
CDN
Email notifications
Multiple admin users
Client comments
Gallery expiration
Download analytics
Storage quotas
Billing
```

Do not implement them unless explicitly requested.

---

# 40. First development task

Start with:

```text
Project foundation
```

Before writing business logic:

1. initialize repository;
2. create backend;
3. create frontend;
4. create Docker Compose;
5. add PostgreSQL;
6. add Redis;
7. configure environment variables;
8. configure ESLint;
9. configure Prettier;
10. create basic health endpoint;
11. create README;
12. verify backend and frontend start successfully.

Then stop and report:

- files created;
- commands used;
- current architecture;
- how to run locally;
- known issues;
- next recommended task.

Do not silently implement the entire roadmap in one step.

---

# 41. Codex operating mode

When working on an issue:

1. Read `AGENTS.md`.
2. Inspect the existing project before changing anything.
3. Identify affected modules.
4. Implement the smallest complete solution.
5. Reuse existing abstractions.
6. Add/update tests.
7. Run lint.
8. Run typecheck.
9. Run relevant tests.
10. Run build when appropriate.
11. Review the diff.
12. Report what changed.

Do not rewrite unrelated code.

Do not change architecture without explaining why.

If a requirement is ambiguous, choose the simplest implementation consistent with the architecture and document the assumption.

If a task requires a major architectural change, stop and explain the proposed change before implementing it.

---

# 42. Definition of MVP success

The MVP is considered complete when the following scenario works end-to-end:

```text
ADMIN

Login
  ↓
Create "Wedding 2026" gallery
  ↓
Select 100 JPG files
  ↓
Upload directly to S3
  ↓
See upload progress
  ↓
Images are processed asynchronously
  ↓
Thumbnails and previews become available
  ↓
Create private gallery link
  ↓
Copy link


CLIENT

Open private link
  ↓
See gallery
  ↓
Scroll thumbnails
  ↓
Open fullscreen image
  ↓
Navigate next/previous
  ↓
Download one original
  ↓
Click "Download all"
  ↓
ZIP is generated asynchronously
  ↓
Download ZIP
```

This end-to-end flow is the primary product goal.

---

# 43. Priority

Prioritize:

```text
P0 — core functionality
P1 — security/reliability
P2 — UX improvements
P3 — nice-to-have features
```

Core product functionality has priority over visual polish.

Security has priority over convenience.

Correct architecture has priority over premature optimization.