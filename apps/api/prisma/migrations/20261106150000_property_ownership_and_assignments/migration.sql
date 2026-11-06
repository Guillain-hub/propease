ALTER TYPE "membership_role" ADD VALUE IF NOT EXISTS 'ACCOUNTANT';
ALTER TYPE "membership_role" ADD VALUE IF NOT EXISTS 'MAINTENANCE_STAFF';

CREATE TABLE "property_owners" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "email" VARCHAR(320),
    "phone" VARCHAR(32),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "property_owners_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "property_assignments" (
    "property_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_assignments_pkey" PRIMARY KEY ("property_id", "user_id")
);

CREATE UNIQUE INDEX "property_owners_organisation_id_email_key"
ON "property_owners"("organisation_id", "email");

ALTER TABLE "properties" ADD COLUMN "property_owner_id" UUID;

INSERT INTO "property_owners" ("organisation_id", "name", "email", "phone", "updated_at")
SELECT DISTINCT p."organisation_id", u."name", u."email", u."phone", CURRENT_TIMESTAMP
FROM "properties" p
JOIN "users" u ON u."id" = p."owner_id"
ON CONFLICT ("organisation_id", "email") DO NOTHING;

UPDATE "properties" p
SET "property_owner_id" = po."id"
FROM "users" u
JOIN "property_owners" po
  ON po."email" = u."email"
WHERE p."owner_id" = u."id"
  AND p."organisation_id" = po."organisation_id";

CREATE INDEX "property_owners_organisation_id_name_idx"
ON "property_owners"("organisation_id", "name");
CREATE INDEX "properties_organisation_id_property_owner_id_idx"
ON "properties"("organisation_id", "property_owner_id");
CREATE INDEX "property_assignments_user_id_idx"
ON "property_assignments"("user_id");

ALTER TABLE "property_owners"
ADD CONSTRAINT "property_owners_organisation_id_fkey"
FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "properties"
ADD CONSTRAINT "properties_property_owner_id_fkey"
FOREIGN KEY ("property_owner_id") REFERENCES "property_owners"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "property_assignments"
ADD CONSTRAINT "property_assignments_property_id_fkey"
FOREIGN KEY ("property_id") REFERENCES "properties"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "property_assignments"
ADD CONSTRAINT "property_assignments_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
