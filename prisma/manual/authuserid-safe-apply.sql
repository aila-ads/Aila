-- Safe, manual replacement for migration
--   20261003034354_add_supabase_auth_identity
--
-- ONLY for a database where that migration is pending or FAILED and the
-- "User" table already has rows. Fresh/empty databases and databases where
-- the migration already succeeded do NOT need this. Follow
-- docs/runbooks/AUTHUSERID-MIGRATION.md.
--
-- End state is identical to the original migration:
--   "User"."authUserId" TEXT NOT NULL + unique index "User_authUserId_key".
--
-- Runs in one transaction: if any existing user cannot be linked, it stops
-- with an error listing the count and changes nothing.
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f prisma/manual/authuserid-safe-apply.sql
--   pnpm exec prisma migrate resolve --applied 20261003034354_add_supabase_auth_identity

BEGIN;

-- 1. Add the column as nullable so existing rows are allowed.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "authUserId" TEXT;

-- 2. Backfill from Supabase Auth when this database has it: link each user to
--    the Supabase auth user with the same CONFIRMED email address.
--    Unconfirmed auth users are never linked (prevents account takeover by
--    someone who registered a victim's email without confirming it).
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    UPDATE "User" u
       SET "authUserId" = a.id::text
      FROM auth.users a
     WHERE u."authUserId" IS NULL
       AND a.email_confirmed_at IS NOT NULL
       AND lower(a.email) = lower(u.email);
  END IF;
END $$;

-- 3. Stop (and roll back everything) if any user still has no auth link.
--    Deciding what to do with those users is a business decision; see the
--    runbook. Inspect them with:
--      SELECT id, email, "createdAt" FROM "User" WHERE "authUserId" IS NULL;
DO $$
DECLARE
  unlinked bigint;
BEGIN
  SELECT count(*) INTO unlinked FROM "User" WHERE "authUserId" IS NULL;
  IF unlinked > 0 THEN
    RAISE EXCEPTION
      '% existing "User" row(s) could not be linked to a confirmed Supabase auth user. Nothing was changed. See docs/runbooks/AUTHUSERID-MIGRATION.md.',
      unlinked;
  END IF;
END $$;

-- 4. Enforce the same constraints as the original migration.
ALTER TABLE "User" ALTER COLUMN "authUserId" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "User_authUserId_key" ON "User"("authUserId");

COMMIT;
