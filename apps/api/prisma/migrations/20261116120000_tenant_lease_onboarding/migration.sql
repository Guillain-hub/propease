ALTER TYPE "lease_status" ADD VALUE 'PENDING_TENANT_REVIEW';
ALTER TYPE "lease_status" ADD VALUE 'CHANGES_REQUESTED';
ALTER TYPE "lease_status" ADD VALUE 'TENANT_DECLINED';

CREATE TYPE "tenant_lease_review_action" AS ENUM ('ACCEPTED', 'CHANGES_REQUESTED', 'DECLINED');

ALTER TABLE "leases"
ADD COLUMN "payment_frequency" VARCHAR(32) NOT NULL DEFAULT 'MONTHLY';

ALTER TABLE "tenancies"
ADD COLUMN "property_id" UUID,
ADD COLUMN "rental_space_label" VARCHAR(180);

UPDATE "tenancies" AS tenancy
SET "property_id" = unit."property_id"
FROM "units" AS unit
WHERE tenancy."unit_id" = unit."id";

ALTER TABLE "tenancies"
ALTER COLUMN "property_id" SET NOT NULL,
ALTER COLUMN "unit_id" DROP NOT NULL;

CREATE INDEX "tenancies_property_id_status_move_in_date_move_out_date_idx"
ON "tenancies"("property_id", "status", "move_in_date", "move_out_date");

ALTER TABLE "tenancies"
ADD CONSTRAINT "tenancies_property_id_fkey"
FOREIGN KEY ("property_id") REFERENCES "properties"("id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "tenancies_rental_space_check"
CHECK ("unit_id" IS NOT NULL OR "rental_space_label" IS NOT NULL);

CREATE TABLE "tenant_lease_onboardings" (
    "id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "manager_user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "response_at" TIMESTAMPTZ(6),
    "response_action" "tenant_lease_review_action",
    "response_note" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenant_lease_onboardings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lease_agreement_snapshots" (
    "id" UUID NOT NULL,
    "onboarding_id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "agreement" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lease_agreement_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tenant_lease_onboardings_lease_id_key"
ON "tenant_lease_onboardings"("lease_id");
CREATE UNIQUE INDEX "tenant_lease_onboardings_token_hash_key"
ON "tenant_lease_onboardings"("token_hash");
CREATE INDEX "tenant_lease_onboardings_expires_at_idx"
ON "tenant_lease_onboardings"("expires_at");
CREATE UNIQUE INDEX "lease_agreement_snapshots_onboarding_id_version_key"
ON "lease_agreement_snapshots"("onboarding_id", "version");
CREATE INDEX "lease_agreement_snapshots_lease_id_version_idx"
ON "lease_agreement_snapshots"("lease_id", "version");

ALTER TABLE "tenant_lease_onboardings"
ADD CONSTRAINT "tenant_lease_onboardings_lease_id_fkey"
FOREIGN KEY ("lease_id") REFERENCES "leases"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "tenant_lease_onboardings_manager_user_id_fkey"
FOREIGN KEY ("manager_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lease_agreement_snapshots"
ADD CONSTRAINT "lease_agreement_snapshots_onboarding_id_fkey"
FOREIGN KEY ("onboarding_id") REFERENCES "tenant_lease_onboardings"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "lease_agreement_snapshots_lease_id_fkey"
FOREIGN KEY ("lease_id") REFERENCES "leases"("id")
ON DELETE CASCADE ON UPDATE CASCADE,
ADD CONSTRAINT "lease_agreement_snapshots_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
