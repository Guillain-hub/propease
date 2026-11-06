ALTER TABLE "properties"
  ADD COLUMN "description" TEXT;

ALTER TABLE "units"
  ADD COLUMN "bedrooms" INTEGER,
  ADD COLUMN "bathrooms" INTEGER,
  ADD COLUMN "size_sqm" DECIMAL(10,2),
  ADD COLUMN "utility_arrangement" VARCHAR(120);

ALTER TABLE "tenants"
  ADD COLUMN "emergency_contact_name" VARCHAR(180),
  ADD COLUMN "emergency_contact_phone" VARCHAR(32);

ALTER TABLE "leases"
  ADD COLUMN "terms" JSONB,
  ADD COLUMN "signed_at" TIMESTAMPTZ(6),
  ADD COLUMN "terminated_at" TIMESTAMPTZ(6),
  ADD COLUMN "termination_reason" VARCHAR(500);

ALTER TABLE "inspections"
  ADD COLUMN "tenant_acknowledged_at" TIMESTAMPTZ(6),
  ADD COLUMN "estimated_repair_cost" DECIMAL(12,2);

ALTER TABLE "payments"
  ADD COLUMN "reversed_at" TIMESTAMPTZ(6),
  ADD COLUMN "reversed_by" UUID,
  ADD COLUMN "reversal_reason" VARCHAR(500);

ALTER TABLE "expenses"
  ADD COLUMN "reversed_at" TIMESTAMPTZ(6),
  ADD COLUMN "reversed_by" UUID,
  ADD COLUMN "reversal_reason" VARCHAR(500);

ALTER TABLE "utility_bills"
  ADD COLUMN "reversed_at" TIMESTAMPTZ(6),
  ADD COLUMN "reversed_by" UUID,
  ADD COLUMN "reversal_reason" VARCHAR(500);

ALTER TABLE "maintenance_requests"
  ADD COLUMN "assigned_to_user_id" UUID,
  ADD COLUMN "estimated_cost" DECIMAL(12,2),
  ADD COLUMN "actual_cost" DECIMAL(12,2),
  ADD COLUMN "completed_at" TIMESTAMPTZ(6),
  ADD COLUMN "resolution_notes" TEXT;

ALTER TABLE "notices"
  ADD COLUMN "issuer_user_id" UUID,
  ADD COLUMN "recipient" VARCHAR(320),
  ADD COLUMN "reason" VARCHAR(1000),
  ADD COLUMN "delivery_method" VARCHAR(80),
  ADD COLUMN "acknowledged_at" TIMESTAMPTZ(6);

ALTER TABLE "subscription_invoices"
  ADD COLUMN "plan_id" UUID,
  ADD COLUMN "billing_cycle" "billing_cycle";

ALTER TABLE "subscription_invoices"
  ADD CONSTRAINT "subscription_invoices_plan_id_fkey"
  FOREIGN KEY ("plan_id") REFERENCES "plans"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subscription_payments"
  ADD COLUMN "proof_file_id" UUID,
  ADD CONSTRAINT "subscription_payments_proof_file_id_fkey"
  FOREIGN KEY ("proof_file_id") REFERENCES "files"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "plans" (
  "id", "slug", "name", "monthly_price", "annual_price", "unit_limit", "features", "is_active", "created_at", "updated_at"
) VALUES
  (gen_random_uuid(), 'free-trial', 'Free trial', 0, 0, 3, '{"trialDays":14}'::jsonb, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'starter', 'Starter', 5000, 60000, 3, '{}'::jsonb, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'professional', 'Professional', 15000, 180000, 15, '{}'::jsonb, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'business', 'Business', 35000, 420000, 50, '{}'::jsonb, TRUE, NOW(), NOW()),
  (gen_random_uuid(), 'enterprise', 'Enterprise', 0, 0, NULL, '{"contactSales":true}'::jsonb, TRUE, NOW(), NOW())
ON CONFLICT ("slug") DO NOTHING;
