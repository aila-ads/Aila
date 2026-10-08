-- Step 3: accounts and authorization.
--
-- Generated with `prisma migrate diff` from the previous schema, then edited
-- in two ways only:
--   1. The whole migration runs in one transaction, so it applies completely
--      or not at all. (Prisma's generated BEGIN/COMMIT around the enum change
--      was folded into this single transaction.)
--   2. A guard runs first and stops the migration with a clear message if any
--      Membership row still uses the role being removed, before anything is
--      changed.
--
-- Effect on existing rows:
--   * "User": every existing row gets role = 'USER' (constant default;
--     no table rewrite on PostgreSQL 11+).
--   * "AuditLog": existing rows get NULL in the new "result" and "requestId"
--     columns. Nothing else changes.
--   * "Membership": the "role" column is converted to the new enum type
--     (OWNER, MEMBER). Values are kept as they are; the table is rewritten
--     under a short lock. No row can use ADMIN at this point (guard below).

BEGIN;

-- Guard: the unused MembershipRole value ADMIN is removed below.
DO $$
DECLARE
  admin_rows bigint;
BEGIN
  SELECT count(*) INTO admin_rows FROM "Membership" WHERE "role"::text = 'ADMIN';
  IF admin_rows > 0 THEN
    RAISE EXCEPTION 'accounts_authorization stopped: % "Membership" row(s) use role ADMIN. Nothing was changed. Review these rows before applying this migration.', admin_rows;
  END IF;
END
$$;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- AlterEnum
CREATE TYPE "MembershipRole_new" AS ENUM ('OWNER', 'MEMBER');
ALTER TABLE "Membership" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "Membership" ALTER COLUMN "role" TYPE "MembershipRole_new" USING ("role"::text::"MembershipRole_new");
ALTER TYPE "MembershipRole" RENAME TO "MembershipRole_old";
ALTER TYPE "MembershipRole_new" RENAME TO "MembershipRole";
DROP TYPE "MembershipRole_old";
ALTER TABLE "Membership" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "requestId" TEXT,
ADD COLUMN     "result" "AuditResult";

-- CreateIndex
CREATE INDEX "AuditLog_requestId_idx" ON "AuditLog"("requestId");

COMMIT;
