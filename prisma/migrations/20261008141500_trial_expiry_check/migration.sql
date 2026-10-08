-- Step 4: the 3-hour trial.
--
-- Adds the database rule that a trial always ends after it starts
-- (DATABASE-SCHEMA §11: expiresAt > startedAt). Prisma cannot express CHECK
-- constraints, so this migration is written by hand.
--
-- Effect on existing rows: none are changed. Every existing trial was
-- created with expiresAt = startedAt + 3 hours, so all rows already pass.
-- If any row did not, this statement fails and nothing is applied.
-- "Trial" is small, so the validation scan holds its lock only briefly.

ALTER TABLE "Trial"
  ADD CONSTRAINT "Trial_expiresAt_after_startedAt" CHECK ("expiresAt" > "startedAt");
