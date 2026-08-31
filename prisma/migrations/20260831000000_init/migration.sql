-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "taxId" TEXT,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isSystemRole" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bank" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "swiftCode" TEXT,
    "routingNumber" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "accountType" TEXT NOT NULL DEFAULT 'CHECKING',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "openingBalance" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "currentBalance" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "statementPeriodStart" TIMESTAMP(3) NOT NULL,
    "statementPeriodEnd" TIMESTAMP(3) NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedById" TEXT NOT NULL,
    "processingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "extractionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "validationStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "duplicateStatus" TEXT NOT NULL DEFAULT 'NOT_CHECKED',
    "openingBalance" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "closingBalance" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "totalCredits" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "totalDebits" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "transactionCount" INTEGER NOT NULL DEFAULT 0,
    "processingStartedAt" TIMESTAMP(3),
    "processingCompletedAt" TIMESTAMP(3),
    "errors" TEXT,
    "warnings" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementPage" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "pageNumber" INTEGER NOT NULL,
    "extractionStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "ocrStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED',
    "extractionConfidence" DECIMAL(65,30),
    "processingErrors" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StatementPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "statementId" TEXT,
    "statementPageId" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "narration" TEXT,
    "referenceNumber" TEXT,
    "chequeNumber" TEXT,
    "accountNumber" TEXT,
    "transactionType" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "debit" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "credit" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "signedAmount" DECIMAL(65,30) NOT NULL,
    "balance" DECIMAL(65,30),
    "sourceRow" INTEGER,
    "sourcePage" INTEGER,
    "originalImportedData" TEXT NOT NULL,
    "normalizedData" TEXT,
    "transactionFingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "importTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlTransaction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "valueDate" TIMESTAMP(3),
    "referenceNumber" TEXT,
    "chequeNumber" TEXT,
    "accountNumber" TEXT,
    "transactionType" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "debit" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "credit" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "amount" DECIMAL(65,30) NOT NULL,
    "narration" TEXT NOT NULL,
    "customerSupplier" TEXT,
    "journalNumber" TEXT,
    "sourceSystem" TEXT NOT NULL DEFAULT 'GENERAL_LEDGER',
    "sourceFile" TEXT,
    "originalData" TEXT NOT NULL,
    "normalizedData" TEXT,
    "transactionFingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "importTimestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationPeriod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "preparedById" TEXT,
    "reviewedById" TEXT,
    "approvedById" TEXT,
    "preparedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationMatch" (
    "id" TEXT NOT NULL,
    "reconciliationPeriodId" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "matchStatus" TEXT NOT NULL DEFAULT 'PROPOSED',
    "matchingRuleId" TEXT,
    "confidenceScore" DECIMAL(65,30) NOT NULL DEFAULT 1.0,
    "criteriaMatched" TEXT NOT NULL,
    "tolerancesApplied" TEXT,
    "explanation" TEXT,
    "createdByType" TEXT NOT NULL DEFAULT 'SYSTEM',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransactionMatch" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransactionMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GlTransactionMatch" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "glTransactionId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GlTransactionMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchingCriterion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isStrong" BOOLEAN NOT NULL DEFAULT false,
    "dataType" TEXT NOT NULL,
    "comparisonOperator" TEXT NOT NULL DEFAULT 'EQUALS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchingCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchingControlConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "minTotalCriteria" INTEGER NOT NULL DEFAULT 3,
    "minStrongCriteria" INTEGER NOT NULL DEFAULT 2,
    "allowFuzzyNarration" BOOLEAN NOT NULL DEFAULT false,
    "requireExactCurrency" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchingControlConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchingRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "minTotalCriteria" INTEGER NOT NULL DEFAULT 3,
    "minStrongCriteria" INTEGER NOT NULL DEFAULT 2,
    "requiredCriteria" TEXT NOT NULL,
    "optionalCriteria" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchingRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToleranceConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "matchingRuleId" TEXT,
    "level" TEXT NOT NULL DEFAULT 'ORGANIZATION',
    "amountToleranceType" TEXT NOT NULL DEFAULT 'FIXED',
    "amountToleranceValue" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "amountToleranceMax" DECIMAL(65,30),
    "dateToleranceDays" INTEGER NOT NULL DEFAULT 0,
    "isDateToleranceAllowed" BOOLEAN NOT NULL DEFAULT false,
    "currencyRateTolerancePercent" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToleranceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExceptionRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reconciliationPeriodId" TEXT,
    "bankTransactionId" TEXT,
    "glTransactionId" TEXT,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "riskLevel" TEXT NOT NULL DEFAULT 'MEDIUM',
    "assignedUserId" TEXT,
    "description" TEXT NOT NULL,
    "resolution" TEXT,
    "relevantDate" TIMESTAMP(3) NOT NULL,
    "resolvedDate" TIMESTAMP(3),
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExceptionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgingBucketConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "minDays" INTEGER NOT NULL,
    "maxDays" INTEGER,
    "displayOrder" INTEGER NOT NULL,
    "isSystemDefault" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgingBucketConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalWorkflow" (
    "id" TEXT NOT NULL,
    "reconciliationPeriodId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "userId" TEXT NOT NULL,
    "comments" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "metadata" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Organization_status_idx" ON "Organization"("status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "UserRole_userId_idx" ON "UserRole"("userId");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");

-- CreateIndex
CREATE INDEX "Bank_organizationId_idx" ON "Bank"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Bank_organizationId_name_key" ON "Bank"("organizationId", "name");

-- CreateIndex
CREATE INDEX "BankAccount_organizationId_idx" ON "BankAccount"("organizationId");

-- CreateIndex
CREATE INDEX "BankAccount_bankId_idx" ON "BankAccount"("bankId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_organizationId_bankId_accountNumber_key" ON "BankAccount"("organizationId", "bankId", "accountNumber");

-- CreateIndex
CREATE INDEX "BankStatement_organizationId_idx" ON "BankStatement"("organizationId");

-- CreateIndex
CREATE INDEX "BankStatement_bankAccountId_idx" ON "BankStatement"("bankAccountId");

-- CreateIndex
CREATE INDEX "BankStatement_statementPeriodStart_statementPeriodEnd_idx" ON "BankStatement"("statementPeriodStart", "statementPeriodEnd");

-- CreateIndex
CREATE INDEX "BankStatement_processingStatus_idx" ON "BankStatement"("processingStatus");

-- CreateIndex
CREATE INDEX "StatementPage_statementId_idx" ON "StatementPage"("statementId");

-- CreateIndex
CREATE UNIQUE INDEX "StatementPage_statementId_pageNumber_key" ON "StatementPage"("statementId", "pageNumber");

-- CreateIndex
CREATE INDEX "BankTransaction_organizationId_idx" ON "BankTransaction"("organizationId");

-- CreateIndex
CREATE INDEX "BankTransaction_bankAccountId_idx" ON "BankTransaction"("bankAccountId");

-- CreateIndex
CREATE INDEX "BankTransaction_transactionDate_idx" ON "BankTransaction"("transactionDate");

-- CreateIndex
CREATE INDEX "BankTransaction_transactionFingerprint_idx" ON "BankTransaction"("transactionFingerprint");

-- CreateIndex
CREATE INDEX "BankTransaction_status_idx" ON "BankTransaction"("status");

-- CreateIndex
CREATE INDEX "GlTransaction_organizationId_idx" ON "GlTransaction"("organizationId");

-- CreateIndex
CREATE INDEX "GlTransaction_bankAccountId_idx" ON "GlTransaction"("bankAccountId");

-- CreateIndex
CREATE INDEX "GlTransaction_transactionDate_idx" ON "GlTransaction"("transactionDate");

-- CreateIndex
CREATE INDEX "GlTransaction_transactionFingerprint_idx" ON "GlTransaction"("transactionFingerprint");

-- CreateIndex
CREATE INDEX "GlTransaction_status_idx" ON "GlTransaction"("status");

-- CreateIndex
CREATE INDEX "ReconciliationPeriod_organizationId_idx" ON "ReconciliationPeriod"("organizationId");

-- CreateIndex
CREATE INDEX "ReconciliationPeriod_bankAccountId_idx" ON "ReconciliationPeriod"("bankAccountId");

-- CreateIndex
CREATE INDEX "ReconciliationPeriod_status_idx" ON "ReconciliationPeriod"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationPeriod_organizationId_bankAccountId_periodSta_key" ON "ReconciliationPeriod"("organizationId", "bankAccountId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "ReconciliationMatch_reconciliationPeriodId_idx" ON "ReconciliationMatch"("reconciliationPeriodId");

-- CreateIndex
CREATE INDEX "ReconciliationMatch_matchingRuleId_idx" ON "ReconciliationMatch"("matchingRuleId");

-- CreateIndex
CREATE INDEX "ReconciliationMatch_matchStatus_idx" ON "ReconciliationMatch"("matchStatus");

-- CreateIndex
CREATE INDEX "BankTransactionMatch_matchId_idx" ON "BankTransactionMatch"("matchId");

-- CreateIndex
CREATE INDEX "BankTransactionMatch_bankTransactionId_idx" ON "BankTransactionMatch"("bankTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransactionMatch_matchId_bankTransactionId_key" ON "BankTransactionMatch"("matchId", "bankTransactionId");

-- CreateIndex
CREATE INDEX "GlTransactionMatch_matchId_idx" ON "GlTransactionMatch"("matchId");

-- CreateIndex
CREATE INDEX "GlTransactionMatch_glTransactionId_idx" ON "GlTransactionMatch"("glTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "GlTransactionMatch_matchId_glTransactionId_key" ON "GlTransactionMatch"("matchId", "glTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchingCriterion_code_key" ON "MatchingCriterion"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MatchingControlConfig_organizationId_key" ON "MatchingControlConfig"("organizationId");

-- CreateIndex
CREATE INDEX "MatchingRule_organizationId_idx" ON "MatchingRule"("organizationId");

-- CreateIndex
CREATE INDEX "MatchingRule_bankAccountId_idx" ON "MatchingRule"("bankAccountId");

-- CreateIndex
CREATE INDEX "MatchingRule_priority_idx" ON "MatchingRule"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "MatchingRule_organizationId_name_key" ON "MatchingRule"("organizationId", "name");

-- CreateIndex
CREATE INDEX "ToleranceConfig_organizationId_idx" ON "ToleranceConfig"("organizationId");

-- CreateIndex
CREATE INDEX "ToleranceConfig_bankAccountId_idx" ON "ToleranceConfig"("bankAccountId");

-- CreateIndex
CREATE INDEX "ToleranceConfig_matchingRuleId_idx" ON "ToleranceConfig"("matchingRuleId");

-- CreateIndex
CREATE INDEX "ExceptionRecord_organizationId_idx" ON "ExceptionRecord"("organizationId");

-- CreateIndex
CREATE INDEX "ExceptionRecord_reconciliationPeriodId_idx" ON "ExceptionRecord"("reconciliationPeriodId");

-- CreateIndex
CREATE INDEX "ExceptionRecord_status_idx" ON "ExceptionRecord"("status");

-- CreateIndex
CREATE INDEX "ExceptionRecord_category_idx" ON "ExceptionRecord"("category");

-- CreateIndex
CREATE INDEX "AgingBucketConfig_organizationId_idx" ON "AgingBucketConfig"("organizationId");

-- CreateIndex
CREATE INDEX "AgingBucketConfig_displayOrder_idx" ON "AgingBucketConfig"("displayOrder");

-- CreateIndex
CREATE INDEX "ApprovalWorkflow_reconciliationPeriodId_idx" ON "ApprovalWorkflow"("reconciliationPeriodId");

-- CreateIndex
CREATE INDEX "ApprovalWorkflow_userId_idx" ON "ApprovalWorkflow"("userId");

-- CreateIndex
CREATE INDEX "AuditEvent_organizationId_idx" ON "AuditEvent"("organizationId");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditEvent_action_idx" ON "AuditEvent"("action");

-- CreateIndex
CREATE INDEX "AuditEvent_timestamp_idx" ON "AuditEvent"("timestamp");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bank" ADD CONSTRAINT "Bank_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementPage" ADD CONSTRAINT "StatementPage_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_statementPageId_fkey" FOREIGN KEY ("statementPageId") REFERENCES "StatementPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlTransaction" ADD CONSTRAINT "GlTransaction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlTransaction" ADD CONSTRAINT "GlTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationPeriod" ADD CONSTRAINT "ReconciliationPeriod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationPeriod" ADD CONSTRAINT "ReconciliationPeriod_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationPeriod" ADD CONSTRAINT "ReconciliationPeriod_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationPeriod" ADD CONSTRAINT "ReconciliationPeriod_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationPeriod" ADD CONSTRAINT "ReconciliationPeriod_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationMatch" ADD CONSTRAINT "ReconciliationMatch_reconciliationPeriodId_fkey" FOREIGN KEY ("reconciliationPeriodId") REFERENCES "ReconciliationPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationMatch" ADD CONSTRAINT "ReconciliationMatch_matchingRuleId_fkey" FOREIGN KEY ("matchingRuleId") REFERENCES "MatchingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransactionMatch" ADD CONSTRAINT "BankTransactionMatch_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "ReconciliationMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransactionMatch" ADD CONSTRAINT "BankTransactionMatch_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlTransactionMatch" ADD CONSTRAINT "GlTransactionMatch_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "ReconciliationMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GlTransactionMatch" ADD CONSTRAINT "GlTransactionMatch_glTransactionId_fkey" FOREIGN KEY ("glTransactionId") REFERENCES "GlTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchingControlConfig" ADD CONSTRAINT "MatchingControlConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchingRule" ADD CONSTRAINT "MatchingRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchingRule" ADD CONSTRAINT "MatchingRule_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToleranceConfig" ADD CONSTRAINT "ToleranceConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToleranceConfig" ADD CONSTRAINT "ToleranceConfig_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToleranceConfig" ADD CONSTRAINT "ToleranceConfig_matchingRuleId_fkey" FOREIGN KEY ("matchingRuleId") REFERENCES "MatchingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionRecord" ADD CONSTRAINT "ExceptionRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionRecord" ADD CONSTRAINT "ExceptionRecord_reconciliationPeriodId_fkey" FOREIGN KEY ("reconciliationPeriodId") REFERENCES "ReconciliationPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionRecord" ADD CONSTRAINT "ExceptionRecord_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionRecord" ADD CONSTRAINT "ExceptionRecord_glTransactionId_fkey" FOREIGN KEY ("glTransactionId") REFERENCES "GlTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExceptionRecord" ADD CONSTRAINT "ExceptionRecord_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgingBucketConfig" ADD CONSTRAINT "AgingBucketConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalWorkflow" ADD CONSTRAINT "ApprovalWorkflow_reconciliationPeriodId_fkey" FOREIGN KEY ("reconciliationPeriodId") REFERENCES "ReconciliationPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalWorkflow" ADD CONSTRAINT "ApprovalWorkflow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

