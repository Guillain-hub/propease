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

The Next.js login and registration forms call
`http://localhost:4000/api/v1/auth` by default and send authentication cookies
with credentialed requests. Set `NEXT_PUBLIC_API_URL` in the frontend
environment to override this base URL. Configure `APP_ORIGINS` to include the
exact local frontend origin, such as `http://localhost:3000` or
`http://localhost:3001`. The local example also allows the equivalent
`http://127.0.0.1:3000` and `http://127.0.0.1:3001` origins; restart the API
after changing `APP_ORIGINS`.

## Implemented workflows

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
- Landlord endpoints cover properties, units, tenants and tenancy history,
  leases and documents, inspections and media, rent charges/payments/receipts,
  separate deposit ledgers, expenses and utility allocations, maintenance,
  notices, financial reports, collaborators, subscriptions, and organisation
  settings.
- Landlord reads and writes are scoped to active organisation membership.
  Subscription enforcement provides a 14-day trial, a three-day grace period,
  read-only access for 30 further days, and plan unit limits.
- Rent payments and expense/utility reversals are recorded in the ledger and
  audit history; manually entered payments are clearly identified as
  unverified. Maintenance actual costs create linked expense records.
- Financial and date invariants are enforced by database check constraints in
  the initial migrations.

The landlord route prefix is
`/api/v1/organisations/:organisationId/landlord`. Its module routes include:

- `GET /`, `GET|POST /properties`, `PATCH /properties/:propertyId`
- `GET /units`, `POST /properties/:propertyId/units`, `PATCH /units/:unitId`
- `GET|POST /tenants`, `GET|POST /tenancies`,
  `PATCH /tenants/:tenantId`, `PATCH /tenancies/:tenancyId/move-out`
- `GET|POST /leases`, `PATCH /leases/:leaseId/status`,
  `POST /leases/:leaseId/documents`
- `GET|POST /inspections`, `POST /inspections/:inspectionId/media`
- `GET|POST /rent/charges`, `POST /rent/charges/:chargeId/void`,
  `GET|POST /rent/payments`, `POST /rent/payments/:paymentId/reverse`,
  `GET /rent/payments/:paymentId/receipt`, and deposit transactions
- `GET|POST /expenses`, `GET|POST /utilities`, `GET|POST /maintenance`,
  `GET|POST /notices`, and `GET /reports/financial`
- `GET|POST /team`, `PATCH /team/:memberId`,
  `GET|POST /subscription`, subscription invoice payment submission,
  and `GET|PATCH /settings`

Organisation file uploads are handled by
`/api/v1/organisations/:organisationId/files`. Apply the committed Prisma
migrations in the target environment before using the new landlord routes:

```powershell
npm run db:generate
npm --prefix apps/api run db:deploy
```

The migration adds landlord workflow fields and seeds the trial and paid plans.
Back up the target database and verify the migration target before applying it;
this repository change does not apply or deploy migrations automatically.

Subscription payment proof is collected, but plan activation still requires an
administrator verification workflow that is not part of this landlord API.
Tenant-facing workflows and live payment processing are also outside this
implementation.

## Environment

`DATABASE_URL`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` are required.
`APP_ORIGINS` is a comma-separated allowlist for the web application. AWS
credentials should be supplied through the standard AWS credential chain
(prefer an IAM role in deployed environments); do not put credentials in the
repository or `.env.example`. Configure `S3_BUCKET` as a private bucket with
block-public-access enabled and a CORS policy allowing the web app to `PUT`
objects with the signed `Content-Type` header. Set `EMAIL_FROM_ADDRESS` to an
SES-verified sender before enabling queued email delivery.
