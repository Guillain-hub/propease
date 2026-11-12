CREATE TABLE "organisation_invitations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisation_id" UUID NOT NULL,
    "invited_by_user_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "role" "membership_role" NOT NULL,
    "property_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organisation_invitations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organisation_invitations_token_hash_key"
ON "organisation_invitations"("token_hash");

CREATE UNIQUE INDEX "organisation_invitations_organisation_id_email_key"
ON "organisation_invitations"("organisation_id", "email");

CREATE INDEX "organisation_invitations_email_expires_at_idx"
ON "organisation_invitations"("email", "expires_at");

ALTER TABLE "organisation_invitations"
ADD CONSTRAINT "organisation_invitations_organisation_id_fkey"
FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organisation_invitations"
ADD CONSTRAINT "organisation_invitations_invited_by_user_id_fkey"
FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
