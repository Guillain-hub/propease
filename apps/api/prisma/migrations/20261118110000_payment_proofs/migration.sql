ALTER TYPE "notification_status" ADD VALUE 'CANCELLED';

ALTER TABLE "payments"
ADD COLUMN "proof_file_id" UUID;

ALTER TABLE "payments"
ADD COLUMN "tenancy_id" UUID;

CREATE UNIQUE INDEX "payments_proof_file_id_key"
ON "payments"("proof_file_id");

CREATE INDEX "payments_tenancy_id_received_at_idx"
ON "payments"("tenancy_id", "received_at");

ALTER TABLE "payments"
ADD CONSTRAINT "payments_proof_file_id_fkey"
FOREIGN KEY ("proof_file_id") REFERENCES "files"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payments"
ADD CONSTRAINT "payments_tenancy_id_fkey"
FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
