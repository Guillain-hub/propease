ALTER TABLE "notifications"
ADD COLUMN "deduplication_key" VARCHAR(240);

CREATE UNIQUE INDEX "notifications_deduplication_key_key"
ON "notifications"("deduplication_key");
