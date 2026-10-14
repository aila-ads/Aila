-- Read-only pre-flight check for migration
--   20261003034354_add_supabase_auth_identity
-- (adds the required column "User"."authUserId").
--
-- Safe to run against any environment: it only reads data and prints
-- NOTICE messages. It changes nothing.
--
--   psql "$DATABASE_URL" -f prisma/manual/authuserid-preflight.sql

DO $$
DECLARE
  migration_state text;
  has_column boolean;
  has_auth_users boolean;
  user_count bigint;
  missing_count bigint;
  unmatched_count bigint;
BEGIN
  IF to_regclass('public."_prisma_migrations"') IS NULL THEN
    migration_state := 'no Prisma migration table (database never migrated)';
  ELSE
    SELECT CASE
             WHEN m.migration_name IS NULL THEN 'NOT APPLIED (pending)'
             WHEN m.rolled_back_at IS NOT NULL THEN 'ROLLED BACK'
             WHEN m.finished_at IS NULL THEN 'FAILED (needs recovery)'
             ELSE 'APPLIED'
           END
      INTO migration_state
      FROM (SELECT 1) AS one
      LEFT JOIN "_prisma_migrations" m
        ON m.migration_name = '20261003034354_add_supabase_auth_identity'
     ORDER BY m.started_at DESC NULLS LAST
     LIMIT 1;
  END IF;

  RAISE NOTICE 'Migration 20261003034354_add_supabase_auth_identity: %', migration_state;

  IF to_regclass('public."User"') IS NULL THEN
    RAISE NOTICE 'Table "User" does not exist yet. Nothing at risk.';
    RETURN;
  END IF;

  SELECT count(*) INTO user_count FROM "User";

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'authUserId'
  ) INTO has_column;

  has_auth_users := to_regclass('auth.users') IS NOT NULL;

  RAISE NOTICE '"User" rows: %', user_count;
  RAISE NOTICE '"User"."authUserId" column exists: %', has_column;
  RAISE NOTICE 'Supabase auth.users table present: %', has_auth_users;

  IF has_column THEN
    EXECUTE 'SELECT count(*) FROM "User" WHERE "authUserId" IS NULL' INTO missing_count;
    RAISE NOTICE 'Rows with NULL authUserId: %', missing_count;
    RAISE NOTICE 'RESULT: column already present. No action needed for this migration.';
    RETURN;
  END IF;

  IF user_count = 0 THEN
    RAISE NOTICE 'RESULT: SAFE. The table is empty, so the original migration will apply cleanly.';
    RETURN;
  END IF;

  IF has_auth_users THEN
    EXECUTE $q$
      SELECT count(*) FROM "User" u
       WHERE NOT EXISTS (
         SELECT 1 FROM auth.users a
          WHERE a.email_confirmed_at IS NOT NULL
            AND lower(a.email) = lower(u.email)
       )
    $q$ INTO unmatched_count;
  ELSE
    unmatched_count := user_count;
  END IF;

  RAISE NOTICE 'Rows with no confirmed Supabase auth user matching by email: %', unmatched_count;
  RAISE NOTICE 'RESULT: AT RISK. The original migration would fail here. Follow docs/runbooks/AUTHUSERID-MIGRATION.md.';
END $$;
