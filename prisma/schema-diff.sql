-- CreateTable
CREATE TABLE "ReconciliationReviewCandidate" (
    "id" TEXT NOT NULL,
    "reconciliationPeriodId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "glTransactionId" TEXT NOT NULL,
    "matchingRuleId" TEXT,
    "totalCriteriaSatisfied" INTEGER NOT NULL,
    "strongCriteriaSatisfied" INTEGER NOT NULL,
    "criteriaSatisfied" TEXT NOT NULL,
    "criteriaFailed" TEXT NOT NULL,
    "confidenceScore" DECIMAL(65,30) NOT NULL,
    "breakdown" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReconciliationReviewCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReconciliationReviewCandidate_organizationId_idx" ON "ReconciliationReviewCandidate"("organizationId");

-- CreateIndex
CREATE INDEX "ReconciliationReviewCandidate_reconciliationPeriodId_idx" ON "ReconciliationReviewCandidate"("reconciliationPeriodId");

-- CreateIndex
CREATE INDEX "ReconciliationReviewCandidate_bankTransactionId_idx" ON "ReconciliationReviewCandidate"("bankTransactionId");

-- CreateIndex
CREATE INDEX "ReconciliationReviewCandidate_glTransactionId_idx" ON "ReconciliationReviewCandidate"("glTransactionId");

-- CreateIndex
CREATE INDEX "ReconciliationReviewCandidate_status_idx" ON "ReconciliationReviewCandidate"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ReconciliationReviewCandidate_reconciliationPeriodId_bankTr_key" ON "ReconciliationReviewCandidate"("reconciliationPeriodId", "bankTransactionId", "glTransactionId");

-- AddForeignKey
ALTER TABLE "ReconciliationReviewCandidate" ADD CONSTRAINT "ReconciliationReviewCandidate_reconciliationPeriodId_fkey" FOREIGN KEY ("reconciliationPeriodId") REFERENCES "ReconciliationPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationReviewCandidate" ADD CONSTRAINT "ReconciliationReviewCandidate_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationReviewCandidate" ADD CONSTRAINT "ReconciliationReviewCandidate_glTransactionId_fkey" FOREIGN KEY ("glTransactionId") REFERENCES "GlTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReconciliationReviewCandidate" ADD CONSTRAINT "ReconciliationReviewCandidate_matchingRuleId_fkey" FOREIGN KEY ("matchingRuleId") REFERENCES "MatchingRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

