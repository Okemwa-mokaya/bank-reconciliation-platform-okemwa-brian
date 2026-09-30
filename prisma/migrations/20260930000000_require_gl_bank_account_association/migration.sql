-- Harden GL reconciliation integrity:
-- Every GL import and GL transaction must belong to one specific bank account.
-- Existing NULL rows cannot be safely guessed; fail deployment rather than silently
-- assigning historical GL data to the wrong account.

BEGIN;

DO $$
DECLARE
  gl_import_nulls integer;
  gl_transaction_nulls integer;
BEGIN
  SELECT COUNT(*) INTO gl_import_nulls
  FROM "GlImport"
  WHERE "bankAccountId" IS NULL;

  SELECT COUNT(*) INTO gl_transaction_nulls
  FROM "GlTransaction"
  WHERE "bankAccountId" IS NULL;

  IF gl_import_nulls > 0 OR gl_transaction_nulls > 0 THEN
    RAISE EXCEPTION
      'GL bank-account hardening blocked: % GlImport row(s) and % GlTransaction row(s) have NULL bankAccountId. Assign each GL import/transaction to the correct bank account before applying this migration.',
      gl_import_nulls,
      gl_transaction_nulls;
  END IF;
END $$;

-- A bank account cannot be deleted while GL records depend on it.
-- This is required because bankAccountId is now mandatory.
ALTER TABLE "GlTransaction"
  DROP CONSTRAINT IF EXISTS "GlTransaction_bankAccountId_fkey";

ALTER TABLE "GlImport"
  DROP CONSTRAINT IF EXISTS "GlImport_bankAccountId_fkey";

ALTER TABLE "GlTransaction"
  ALTER COLUMN "bankAccountId" SET NOT NULL;

ALTER TABLE "GlImport"
  ALTER COLUMN "bankAccountId" SET NOT NULL;

ALTER TABLE "GlTransaction"
  ADD CONSTRAINT "GlTransaction_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId")
  REFERENCES "BankAccount"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "GlImport"
  ADD CONSTRAINT "GlImport_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId")
  REFERENCES "BankAccount"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

COMMIT;
