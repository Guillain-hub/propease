# PropEase API

The API is a NestJS modular monolith. It runs separately from the Next.js web
application and owns authentication, organisation access, domain operations, and
background work.

## Local development

From the repository root, start the local PostgreSQL and Redis services:

```powershell
docker compose up -d postgres redis
Copy-Item apps/api/.env.example apps/api/.env
```

Replace both JWT secret placeholders in `apps/api/.env` with unique random
values. Then install the API dependencies, generate the Prisma client, create
the development database migration, and start the API:

```powershell
npm --prefix apps/api install
npm run db:generate
npm --prefix apps/api run db:migrate -- --name init
npm run api:dev
```

The API listens on `http://localhost:4000` with the `/api/v1` prefix. The
database-backed health endpoint is `GET /api/v1/health`. Root-level scripts
`npm run api:build`, `npm run api:dev`, and `npm run db:generate` are also
available.

## Implemented foundation

- PostgreSQL/Prisma schema and migrations for users, organisations and
  memberships, properties and units, tenancies and leases, inspections, rent
  charges and allocations, deposits, expenses and utilities, maintenance,
  notices, notifications, files, subscriptions, and audit logs.
- Account registration creates the first organisation and owner membership in
  one transaction.
- Passwords are bcrypt-hashed. Access and refresh JWTs use separate secrets,
  httpOnly cookies, short access-token lifetimes, refresh-token rotation, and
  reuse detection.
- Organisation-scoped property routes verify active membership and role before
  reading or writing records.
- Helmet, a global request validation pipe, CORS allowlisting, and API
  throttling are enabled.
- Private S3 uploads/downloads use short-lived signed URLs; uploads are checked
  against their declared size and content type before becoming available.
- BullMQ retries queued transactional email through Amazon SES, and a reusable
  server-side PDF service is available to domain modules.
- BullMQ generates monthly rent charges idempotently, marks unpaid charges
  overdue, and queues deduplicated email reminders three days before rent is due.
- Financial and date invariants are enforced by database check constraints in
  the initial migrations.

The starter endpoints are:

- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`,
  `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout`,
  `GET /api/v1/auth/me`
- `GET /api/v1/organisations`, `POST /api/v1/organisations`
- `GET /api/v1/organisations/:organisationId/properties`,
  `POST /api/v1/organisations/:organisationId/properties`,
  `GET /api/v1/organisations/:organisationId/properties/:propertyId`
- `POST /api/v1/organisations/:organisationId/files/upload-url`,
  `POST /api/v1/organisations/:organisationId/files/:fileId/complete`,
  `GET /api/v1/organisations/:organisationId/files/:fileId/download-url`

The API is the MVP foundation; domain workflows beyond registration,
organisation membership, property reads/creation, and scheduled rent handling
still need their controllers and services.

## Environment

`DATABASE_URL`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` are required.
`APP_ORIGINS` is a comma-separated allowlist for the web application. AWS
credentials should be supplied through the standard AWS credential chain
(prefer an IAM role in deployed environments); do not put credentials in the
repository or `.env.example`. Configure `S3_BUCKET` as a private bucket with
block-public-access enabled and a CORS policy allowing the web app to `PUT`
objects with the signed `Content-Type` header. Set `EMAIL_FROM_ADDRESS` to an
SES-verified sender before enabling queued email delivery.
