ALTER TABLE "properties"
ADD COLUMN "photo_file_id" UUID;

ALTER TABLE "properties"
ADD CONSTRAINT "properties_photo_file_id_fkey"
FOREIGN KEY ("photo_file_id") REFERENCES "files"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
