-- Step 7: files and storage on Neon (DATABASE-SCHEMA §25-28).
-- The File table is empty in production (checked before this migration),
-- so these changes need no data backfill.

-- AlterEnum: upload lifecycle UPLOADING -> READY | FAILED -> DELETED.
-- The new values are not used in this migration, so it is safe inside a
-- transaction.
ALTER TYPE "FileStatus" ADD VALUE 'UPLOADING';
ALTER TYPE "FileStatus" ADD VALUE 'READY';

-- One metadata row per storage object.
DROP INDEX "File_storageKey_idx";
CREATE UNIQUE INDEX "File_storageKey_key" ON "File"("storageKey");

-- Empty files are never stored.
ALTER TABLE "File" ADD CONSTRAINT "File_sizeBytes_positive" CHECK ("sizeBytes" > 0);
