-- Phase 3 reconciliation hardening
-- Safe for databases that may already contain some or all of these columns.

ALTER TABLE "ReconciliationMatch" ADD COLUMN IF NOT EXISTS "isManualOverride" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ReconciliationMatch" ADD COLUMN IF NOT EXISTS "overrideReason" TEXT;
ALTER TABLE "ReconciliationMatch" ADD COLUMN IF NOT EXISTS "overriddenById" TEXT;
ALTER TABLE "ReconciliationMatch" ADD COLUMN IF NOT EXISTS "overriddenAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "ReconciliationMatch_matchStatus_idx" ON "ReconciliationMatch"("matchStatus");
CREATE INDEX IF NOT EXISTS "BankTransaction_status_transactionDate_idx" ON "BankTransaction"("status", "transactionDate");
CREATE INDEX IF NOT EXISTS "GlTransaction_status_transactionDate_idx" ON "GlTransaction"("status", "transactionDate");
CREATE INDEX IF NOT EXISTS "MatchingRule_effectiveFrom_effectiveTo_idx" ON "MatchingRule"("effectiveFrom", "effectiveTo");

INSERT INTO "Permission" ("id", "code", "name", "module", "description", "createdAt")
SELECT gen_random_uuid()::text, 'override_match_eligibility', 'Override Match Eligibility', 'RECONCILIATION', 'Explicitly override automatic matching eligibility with a documented reason', NOW()
WHERE NOT EXISTS (SELECT 1 FROM "Permission" WHERE "code" = 'override_match_eligibility');

INSERT INTO "RolePermission" ("id", "roleId", "permissionId")
SELECT gen_random_uuid()::text, r."id", p."id"
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."code" = 'ADMIN'
  AND p."code" = 'override_match_eligibility'
  AND NOT EXISTS (
    SELECT 1 FROM "RolePermission" rp
    WHERE rp."roleId" = r."id" AND rp."permissionId" = p."id"
  );
