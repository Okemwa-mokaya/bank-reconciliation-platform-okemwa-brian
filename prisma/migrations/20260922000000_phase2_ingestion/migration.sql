-- Phase 2 Ingestion Migration: Bank Statements, GL Data, Source Preservation, Rejected Rows & Duplicate Tracking

-- AlterTable BankStatement
ALTER TABLE "BankStatement" ADD COLUMN IF NOT EXISTS "fileSize" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BankStatement" ADD COLUMN IF NOT EXISTS "fileHash" TEXT;
ALTER TABLE "BankStatement" ADD COLUMN IF NOT EXISTS "mimeType" TEXT;
ALTER TABLE "BankStatement" ADD COLUMN IF NOT EXISTS "extractionMethod" TEXT;
ALTER TABLE "BankStatement" ADD COLUMN IF NOT EXISTS "extractionConfidence" DECIMAL(65,30);
ALTER TABLE "BankStatement" ADD COLUMN IF NOT EXISTS "validCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BankStatement" ADD COLUMN IF NOT EXISTS "rejectedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BankStatement" ADD COLUMN IF NOT EXISTS "duplicateCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BankStatement" ADD COLUMN IF NOT EXISTS "warningCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BankStatement" ADD COLUMN IF NOT EXISTS "columnMapping" TEXT;

-- AlterTable BankTransaction
ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "isSuspectedDuplicate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "duplicateReason" TEXT;

-- CreateTable GlImport
CREATE TABLE IF NOT EXISTS "GlImport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "originalFilename" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "fileHash" TEXT,
    "mimeType" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,
    "processingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "sourceSystem" TEXT NOT NULL DEFAULT 'GENERAL_LEDGER',
    "totalDebits" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "totalCredits" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "validCount" INTEGER NOT NULL DEFAULT 0,
    "rejectedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "processingStartedAt" TIMESTAMP(3),
    "processingCompletedAt" TIMESTAMP(3),
    "columnMapping" TEXT,
    "errors" TEXT,
    "warnings" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlImport_pkey" PRIMARY KEY ("id")
);

-- AlterTable GlTransaction
ALTER TABLE "GlTransaction" ADD COLUMN IF NOT EXISTS "glImportId" TEXT;
ALTER TABLE "GlTransaction" ADD COLUMN IF NOT EXISTS "isSuspectedDuplicate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GlTransaction" ADD COLUMN IF NOT EXISTS "duplicateReason" TEXT;

-- CreateTable RejectedRow
CREATE TABLE IF NOT EXISTS "RejectedRow" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "statementId" TEXT,
    "glImportId" TEXT,
    "rowNumber" INTEGER,
    "pageNumber" INTEGER,
    "sourceType" TEXT NOT NULL,
    "rawRecord" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RejectedRow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BankStatement_fileHash_idx" ON "BankStatement"("fileHash");
CREATE INDEX IF NOT EXISTS "GlImport_organizationId_idx" ON "GlImport"("organizationId");
CREATE INDEX IF NOT EXISTS "GlImport_bankAccountId_idx" ON "GlImport"("bankAccountId");
CREATE INDEX IF NOT EXISTS "GlImport_fileHash_idx" ON "GlImport"("fileHash");
CREATE INDEX IF NOT EXISTS "GlImport_processingStatus_idx" ON "GlImport"("processingStatus");
CREATE INDEX IF NOT EXISTS "GlTransaction_glImportId_idx" ON "GlTransaction"("glImportId");
CREATE INDEX IF NOT EXISTS "RejectedRow_organizationId_idx" ON "RejectedRow"("organizationId");
CREATE INDEX IF NOT EXISTS "RejectedRow_statementId_idx" ON "RejectedRow"("statementId");
CREATE INDEX IF NOT EXISTS "RejectedRow_glImportId_idx" ON "RejectedRow"("glImportId");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'GlImport_organizationId_fkey'
    ) THEN
        ALTER TABLE "GlImport" ADD CONSTRAINT "GlImport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'GlImport_bankAccountId_fkey'
    ) THEN
        ALTER TABLE "GlImport" ADD CONSTRAINT "GlImport_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'GlImport_uploadedById_fkey'
    ) THEN
        ALTER TABLE "GlImport" ADD CONSTRAINT "GlImport_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'GlTransaction_glImportId_fkey'
    ) THEN
        ALTER TABLE "GlTransaction" ADD CONSTRAINT "GlTransaction_glImportId_fkey" FOREIGN KEY ("glImportId") REFERENCES "GlImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RejectedRow_statementId_fkey'
    ) THEN
        ALTER TABLE "RejectedRow" ADD CONSTRAINT "RejectedRow_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RejectedRow_glImportId_fkey'
    ) THEN
        ALTER TABLE "RejectedRow" ADD CONSTRAINT "RejectedRow_glImportId_fkey" FOREIGN KEY ("glImportId") REFERENCES "GlImport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
