# Runbook: application roles and account status

Aila V1 has no admin screens. The application role (`User.role`: `USER` or
`ADMIN`) and the status of a user or account (`ACTIVE`, `SUSPENDED`,
`DELETED`) are changed only with the reviewed SQL below. Each change runs in
one transaction together with its audit row (SECURITY-ARCHITECTURE §25,
DATA-ARCHITECTURE §7).

The app enforces status on every request and every sign-in: a user whose
`User` or `Account` row is not `ACTIVE` (or has `deletedAt` set) is refused,
and the refusal is audited. Their existing sessions stop working at their
next request; no Neon Auth change is needed.

Use the Supabase **direct or session** connection (port 5432) and set
`ON_ERROR_STOP` so a failed statement rolls back the transaction.

## Before migration `20261008124520_accounts_authorization` (read-only)

The migration removes the unused `MembershipRole` value `ADMIN`. It stops
with a clear error, changing nothing, if any row still uses it. Check first:

```sql
SELECT count(*) AS admin_memberships
FROM "Membership"
WHERE "role"::text = 'ADMIN';
```

Expected: `0`. If it is not `0`, do not apply the migration; review those
rows first.

If the migration was attempted and its guard stopped it, Prisma records it as
failed. After fixing the rows, mark it rolled back and deploy again:

```bash
pnpm exec prisma migrate resolve --rolled-back 20261008124520_accounts_authorization
pnpm exec prisma migrate deploy
```

## Change a user's application role

Replace the email and the new role (`ADMIN` or `USER`). The statement
changes exactly one row or the transaction stops.

```sql
\set ON_ERROR_STOP on
\set email 'person@example.com'
\set new_role 'ADMIN'

BEGIN;

WITH target AS (
  SELECT id, "accountId", role FROM "User"
  WHERE lower(email) = lower(:'email') AND "deletedAt" IS NULL
  FOR UPDATE
), changed AS (
  UPDATE "User" u SET role = :'new_role'::"UserRole", "updatedAt" = now()
  FROM target t WHERE u.id = t.id AND t.role <> :'new_role'::"UserRole"
  RETURNING u.id, u."accountId", t.role AS old_role
)
INSERT INTO "AuditLog"
  (id, "accountId", "userId", action, severity, "resourceType", "resourceId", result, metadata)
SELECT gen_random_uuid()::text, "accountId", NULL, 'SECURITY_EVENT', 'CRITICAL', 'USER', id,
       'SUCCESS', jsonb_build_object('event', 'ROLE_CHANGED', 'from', old_role, 'to', :'new_role')
FROM changed;

-- Must report exactly one row with the new role before committing.
SELECT id, role FROM "User" WHERE lower(email) = lower(:'email');

COMMIT;
```

If the check shows anything other than one row with the new role, run
`ROLLBACK;` instead of `COMMIT;`.

## Suspend or reactivate a user

Set `new_status` to `SUSPENDED` or `ACTIVE`. Account deletion is a separate
workflow and is not done with this runbook.

```sql
\set ON_ERROR_STOP on
\set email 'person@example.com'
\set new_status 'SUSPENDED'

BEGIN;

WITH target AS (
  SELECT id, "accountId", status FROM "User"
  WHERE lower(email) = lower(:'email') AND "deletedAt" IS NULL
  FOR UPDATE
), changed AS (
  UPDATE "User" u SET status = :'new_status'::"AccountStatus", "updatedAt" = now()
  FROM target t WHERE u.id = t.id AND t.status <> :'new_status'::"AccountStatus"
  RETURNING u.id, u."accountId", t.status AS old_status
)
INSERT INTO "AuditLog"
  (id, "accountId", "userId", action, severity, "resourceType", "resourceId", result, metadata)
SELECT gen_random_uuid()::text, "accountId", NULL, 'SECURITY_EVENT', 'CRITICAL', 'USER', id,
       'SUCCESS', jsonb_build_object('event', 'STATUS_CHANGED', 'from', old_status, 'to', :'new_status')
FROM changed;

SELECT id, status FROM "User" WHERE lower(email) = lower(:'email');

COMMIT;
```

To suspend or reactivate the whole account instead, run the same transaction
against `"Account"` (`UPDATE "Account" ... WHERE id = <the user's accountId>`)
with `"resourceType"` `'ACCOUNT'`.

`userId` is `NULL` in these audit rows because the change is made by an
operator, not by a signed-in user.
