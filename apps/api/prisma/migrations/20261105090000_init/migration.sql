-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "organisation_type" AS ENUM ('LANDLORD', 'PROPERTY_MANAGEMENT_COMPANY');

-- CreateEnum
CREATE TYPE "membership_role" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'STAFF');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "subscription_status" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "billing_cycle" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "verification_status" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "invoice_status" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "property_type" AS ENUM ('APARTMENT_BUILDING', 'HOUSE', 'COMMERCIAL', 'MIXED_USE', 'OTHER');

-- CreateEnum
CREATE TYPE "property_status" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "unit_status" AS ENUM ('AVAILABLE', 'OCCUPIED', 'UNAVAILABLE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "tenancy_status" AS ENUM ('UPCOMING', 'ACTIVE', 'ENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "lease_status" AS ENUM ('DRAFT', 'ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "document_status" AS ENUM ('PENDING', 'SIGNED', 'EXPIRED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "inspection_type" AS ENUM ('MOVE_IN', 'ROUTINE', 'MOVE_OUT', 'OTHER');

-- CreateEnum
CREATE TYPE "inspection_status" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "rent_charge_status" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "deposit_status" AS ENUM ('NOT_RECEIVED', 'PARTIALLY_RECEIVED', 'HELD', 'PARTIALLY_REFUNDED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "deposit_transaction_type" AS ENUM ('RECEIPT', 'REFUND', 'DEDUCTION', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "maintenance_priority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "maintenance_status" AS ENUM ('SUBMITTED', 'APPROVED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "notice_type" AS ENUM ('RENT_REMINDER', 'LATE_RENT', 'LEASE_RENEWAL', 'TERMINATION', 'GENERAL', 'OTHER');

-- CreateEnum
CREATE TYPE "delivery_status" AS ENUM ('DRAFT', 'QUEUED', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "notification_channel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'IN_APP');

-- CreateEnum
CREATE TYPE "notification_status" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'READ');

-- CreateEnum
CREATE TYPE "file_classification" AS ENUM ('PRIVATE', 'ORGANISATION', 'SHARED_WITH_TENANT');

-- CreateEnum
CREATE TYPE "file_upload_status" AS ENUM ('PENDING', 'UPLOADED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(32),
    "password_hash" VARCHAR(255) NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "type" "organisation_type" NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "country" CHAR(2) NOT NULL DEFAULT 'RW',
    "currency" CHAR(3) NOT NULL DEFAULT 'RWF',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organisation_members" (
    "organisation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "membership_role" NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'INVITED',
    "invited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "joined_at" TIMESTAMPTZ(6),

    CONSTRAINT "organisation_members_pkey" PRIMARY KEY ("organisation_id","user_id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "monthly_price" DECIMAL(12,2) NOT NULL,
    "annual_price" DECIMAL(12,2) NOT NULL,
    "unit_limit" INTEGER,
    "features" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "subscription_status" NOT NULL DEFAULT 'TRIALING',
    "billing_cycle" "billing_cycle" NOT NULL,
    "start_date" DATE NOT NULL,
    "next_billing_date" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_invoices" (
    "id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "invoice_number" VARCHAR(80) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "due_date" DATE NOT NULL,
    "paid_date" DATE,
    "status" "invoice_status" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payments" (
    "id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "method" "payment_method" NOT NULL,
    "reference" VARCHAR(160),
    "amount" DECIMAL(12,2) NOT NULL,
    "verification_status" "verification_status" NOT NULL DEFAULT 'PENDING',
    "received_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "owner_id" UUID,
    "name" VARCHAR(180) NOT NULL,
    "type" "property_type" NOT NULL,
    "address" VARCHAR(500) NOT NULL,
    "status" "property_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "unit_number" VARCHAR(80) NOT NULL,
    "floor" VARCHAR(40),
    "rent_amount" DECIMAL(12,2) NOT NULL,
    "deposit_amount" DECIMAL(12,2) NOT NULL,
    "status" "unit_status" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "user_id" UUID,
    "legal_name" VARCHAR(180) NOT NULL,
    "phone" VARCHAR(32),
    "email" VARCHAR(320),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenancies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "move_in_date" DATE NOT NULL,
    "move_out_date" DATE,
    "status" "tenancy_status" NOT NULL DEFAULT 'UPCOMING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tenancies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leases" (
    "id" UUID NOT NULL,
    "tenancy_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "rent_amount" DECIMAL(12,2) NOT NULL,
    "due_day" SMALLINT NOT NULL,
    "status" "lease_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lease_documents" (
    "id" UUID NOT NULL,
    "lease_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "document_status" "document_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lease_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "tenancy_id" UUID,
    "type" "inspection_type" NOT NULL,
    "inspector_id" UUID,
    "inspected_at" TIMESTAMPTZ(6),
    "status" "inspection_status" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_items" (
    "id" UUID NOT NULL,
    "inspection_id" UUID NOT NULL,
    "area" VARCHAR(120) NOT NULL,
    "condition" VARCHAR(80) NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_media" (
    "id" UUID NOT NULL,
    "inspection_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "caption" VARCHAR(300),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rent_charges" (
    "id" UUID NOT NULL,
    "tenancy_id" UUID NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "due_date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL,
    "status" "rent_charge_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rent_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "tenant_id" UUID,
    "amount" DECIMAL(12,2) NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" "payment_method" NOT NULL,
    "reference" VARCHAR(160),
    "recorded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "rent_charge_id" UUID NOT NULL,
    "allocated_amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposits" (
    "id" UUID NOT NULL,
    "tenancy_id" UUID NOT NULL,
    "required_amount" DECIMAL(12,2) NOT NULL,
    "received_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "held_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "deposit_status" NOT NULL DEFAULT 'NOT_RECEIVED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_transactions" (
    "id" UUID NOT NULL,
    "deposit_id" UUID NOT NULL,
    "type" "deposit_transaction_type" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "reason" VARCHAR(500),
    "recorded_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "date" DATE NOT NULL,
    "supplier" VARCHAR(180),
    "evidence_file_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utility_bills" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "utility_type" VARCHAR(80) NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "evidence_file_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "utility_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utility_allocations" (
    "id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "allocated_amount" DECIMAL(12,2) NOT NULL,
    "calculation_method" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "utility_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_requests" (
    "id" UUID NOT NULL,
    "unit_id" UUID NOT NULL,
    "tenant_id" UUID,
    "category" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "maintenance_priority" NOT NULL DEFAULT 'NORMAL',
    "status" "maintenance_status" NOT NULL DEFAULT 'SUBMITTED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "maintenance_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_expenses" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "supplier" VARCHAR(180),
    "invoice_file_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" UUID NOT NULL,
    "tenancy_id" UUID NOT NULL,
    "type" "notice_type" NOT NULL,
    "issue_date" DATE NOT NULL,
    "effective_date" DATE,
    "delivery_status" "delivery_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "organisation_id" UUID,
    "user_id" UUID NOT NULL,
    "channel" "notification_channel" NOT NULL,
    "template" VARCHAR(120) NOT NULL,
    "payload" JSONB,
    "status" "notification_status" NOT NULL DEFAULT 'QUEUED',
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "storage_key" VARCHAR(1024) NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(160) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "access_classification" "file_classification" NOT NULL DEFAULT 'PRIVATE',
    "upload_status" "file_upload_status" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "entity_type" VARCHAR(120) NOT NULL,
    "entity_id" VARCHAR(120) NOT NULL,
    "metadata" JSONB,
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_family_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "organisations_owner_user_id_idx" ON "organisations"("owner_user_id");

-- CreateIndex
CREATE INDEX "organisation_members_user_id_status_idx" ON "organisation_members"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "plans_slug_key" ON "plans"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organisation_id_key" ON "subscriptions"("organisation_id");

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_status_idx" ON "subscriptions"("plan_id", "status");

-- CreateIndex
CREATE INDEX "subscription_invoices_status_due_date_idx" ON "subscription_invoices"("status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_invoices_subscription_id_invoice_number_key" ON "subscription_invoices"("subscription_id", "invoice_number");

-- CreateIndex
CREATE INDEX "subscription_payments_invoice_id_verification_status_idx" ON "subscription_payments"("invoice_id", "verification_status");

-- CreateIndex
CREATE INDEX "properties_organisation_id_status_idx" ON "properties"("organisation_id", "status");

-- CreateIndex
CREATE INDEX "properties_owner_id_idx" ON "properties"("owner_id");

-- CreateIndex
CREATE INDEX "units_status_idx" ON "units"("status");

-- CreateIndex
CREATE UNIQUE INDEX "units_property_id_unit_number_key" ON "units"("property_id", "unit_number");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_user_id_key" ON "tenants"("user_id");

-- CreateIndex
CREATE INDEX "tenants_organisation_id_legal_name_idx" ON "tenants"("organisation_id", "legal_name");

-- CreateIndex
CREATE INDEX "tenants_organisation_id_email_idx" ON "tenants"("organisation_id", "email");

-- CreateIndex
CREATE INDEX "tenancies_tenant_id_status_idx" ON "tenancies"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "tenancies_unit_id_status_move_in_date_move_out_date_idx" ON "tenancies"("unit_id", "status", "move_in_date", "move_out_date");

-- CreateIndex
CREATE INDEX "leases_tenancy_id_status_idx" ON "leases"("tenancy_id", "status");

-- CreateIndex
CREATE INDEX "leases_end_date_status_idx" ON "leases"("end_date", "status");

-- CreateIndex
CREATE INDEX "lease_documents_file_id_idx" ON "lease_documents"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "lease_documents_lease_id_version_key" ON "lease_documents"("lease_id", "version");

-- CreateIndex
CREATE INDEX "inspections_unit_id_inspected_at_idx" ON "inspections"("unit_id", "inspected_at");

-- CreateIndex
CREATE INDEX "inspections_tenancy_id_idx" ON "inspections"("tenancy_id");

-- CreateIndex
CREATE INDEX "inspection_items_inspection_id_idx" ON "inspection_items"("inspection_id");

-- CreateIndex
CREATE INDEX "inspection_media_inspection_id_idx" ON "inspection_media"("inspection_id");

-- CreateIndex
CREATE INDEX "inspection_media_file_id_idx" ON "inspection_media"("file_id");

-- CreateIndex
CREATE INDEX "rent_charges_due_date_status_idx" ON "rent_charges"("due_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "rent_charges_tenancy_id_period_key" ON "rent_charges"("tenancy_id", "period");

-- CreateIndex
CREATE INDEX "payments_organisation_id_received_at_idx" ON "payments"("organisation_id", "received_at");

-- CreateIndex
CREATE INDEX "payments_tenant_id_received_at_idx" ON "payments"("tenant_id", "received_at");

-- CreateIndex
CREATE INDEX "payment_allocations_rent_charge_id_idx" ON "payment_allocations"("rent_charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_rent_charge_id_key" ON "payment_allocations"("payment_id", "rent_charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "deposits_tenancy_id_key" ON "deposits"("tenancy_id");

-- CreateIndex
CREATE INDEX "deposit_transactions_deposit_id_date_idx" ON "deposit_transactions"("deposit_id", "date");

-- CreateIndex
CREATE INDEX "expenses_property_id_date_idx" ON "expenses"("property_id", "date");

-- CreateIndex
CREATE INDEX "utility_bills_property_id_period_idx" ON "utility_bills"("property_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "utility_bills_property_id_utility_type_period_key" ON "utility_bills"("property_id", "utility_type", "period");

-- CreateIndex
CREATE INDEX "utility_allocations_unit_id_idx" ON "utility_allocations"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "utility_allocations_bill_id_unit_id_key" ON "utility_allocations"("bill_id", "unit_id");

-- CreateIndex
CREATE INDEX "maintenance_requests_unit_id_status_idx" ON "maintenance_requests"("unit_id", "status");

-- CreateIndex
CREATE INDEX "maintenance_requests_tenant_id_status_idx" ON "maintenance_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "maintenance_expenses_request_id_idx" ON "maintenance_expenses"("request_id");

-- CreateIndex
CREATE INDEX "notices_tenancy_id_issue_date_idx" ON "notices"("tenancy_id", "issue_date");

-- CreateIndex
CREATE INDEX "notices_delivery_status_idx" ON "notices"("delivery_status");

-- CreateIndex
CREATE INDEX "notifications_user_id_status_created_at_idx" ON "notifications"("user_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "notifications_organisation_id_status_idx" ON "notifications"("organisation_id", "status");

-- CreateIndex
CREATE INDEX "files_organisation_id_access_classification_idx" ON "files"("organisation_id", "access_classification");

-- CreateIndex
CREATE UNIQUE INDEX "files_organisation_id_storage_key_key" ON "files"("organisation_id", "storage_key");

-- CreateIndex
CREATE INDEX "audit_logs_organisation_id_timestamp_idx" ON "audit_logs"("organisation_id", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_revoked_at_idx" ON "auth_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "auth_sessions_token_family_id_idx" ON "auth_sessions"("token_family_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "organisations" ADD CONSTRAINT "organisations_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organisation_members" ADD CONSTRAINT "organisation_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "subscription_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenancies" ADD CONSTRAINT "tenancies_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leases" ADD CONSTRAINT "leases_tenancy_id_fkey" FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_documents" ADD CONSTRAINT "lease_documents_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lease_documents" ADD CONSTRAINT "lease_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_tenancy_id_fkey" FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_media" ADD CONSTRAINT "inspection_media_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_media" ADD CONSTRAINT "inspection_media_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rent_charges" ADD CONSTRAINT "rent_charges_tenancy_id_fkey" FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_rent_charge_id_fkey" FOREIGN KEY ("rent_charge_id") REFERENCES "rent_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposits" ADD CONSTRAINT "deposits_tenancy_id_fkey" FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_deposit_id_fkey" FOREIGN KEY ("deposit_id") REFERENCES "deposits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_evidence_file_id_fkey" FOREIGN KEY ("evidence_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_bills" ADD CONSTRAINT "utility_bills_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_bills" ADD CONSTRAINT "utility_bills_evidence_file_id_fkey" FOREIGN KEY ("evidence_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_allocations" ADD CONSTRAINT "utility_allocations_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "utility_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utility_allocations" ADD CONSTRAINT "utility_allocations_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_expenses" ADD CONSTRAINT "maintenance_expenses_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "maintenance_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_expenses" ADD CONSTRAINT "maintenance_expenses_invoice_file_id_fkey" FOREIGN KEY ("invoice_file_id") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_tenancy_id_fkey" FOREIGN KEY ("tenancy_id") REFERENCES "tenancies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
