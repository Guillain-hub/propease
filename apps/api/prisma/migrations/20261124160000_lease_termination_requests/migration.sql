CREATE TABLE "lease_termination_requests" (
    "id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "termination_date" DATE NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "responded_at" TIMESTAMPTZ(6),
    "accepted" BOOLEAN,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lease_termination_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lease_termination_requests_token_hash_key"
    ON "lease_termination_requests"("token_hash");
CREATE INDEX "lease_termination_requests_lease_id_created_at_idx"
    ON "lease_termination_requests"("lease_id", "created_at");
CREATE INDEX "lease_termination_requests_expires_at_idx"
    ON "lease_termination_requests"("expires_at");

ALTER TABLE "lease_termination_requests"
    ADD CONSTRAINT "lease_termination_requests_lease_id_fkey"
    FOREIGN KEY ("lease_id") REFERENCES "leases"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lease_termination_requests"
    ADD CONSTRAINT "lease_termination_requests_requested_by_user_id_fkey"
    FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
