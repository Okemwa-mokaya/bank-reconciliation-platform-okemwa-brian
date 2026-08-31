import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission } from '../middleware/rbac';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', requirePermission('view_dashboard'), async (req, res) => {
  try {
    const orgId = req.organization!.id;

    // Execute real aggregate queries
    const [
      bankAccountsCount,
      statementsCount,
      bankTxTotal,
      glTxTotal,
      bankTxMatched,
      glTxMatched,
      bankTxUnmatched,
      glTxUnmatched,
      exceptionsOpen,
      exceptionsTotal,
      periodsTotal,
      periodsApproved,
      activeRulesCount,
      oldestUnmatchedBankTx,
      oldestUnmatchedGLTx,
      recentAuditEvents,
      reconciliationPeriods,
    ] = await Promise.all([
      prisma.bankAccount.count({ where: { organizationId: orgId } }),
      prisma.bankStatement.count({ where: { organizationId: orgId } }),
      prisma.bankTransaction.count({ where: { organizationId: orgId } }),
      prisma.glTransaction.count({ where: { organizationId: orgId } }),
      prisma.bankTransaction.count({ where: { organizationId: orgId, status: 'MATCHED' } }),
      prisma.glTransaction.count({ where: { organizationId: orgId, status: 'MATCHED' } }),
      prisma.bankTransaction.count({ where: { organizationId: orgId, status: 'UNMATCHED' } }),
      prisma.glTransaction.count({ where: { organizationId: orgId, status: 'UNMATCHED' } }),
      prisma.exceptionRecord.count({ where: { organizationId: orgId, status: 'OPEN' } }),
      prisma.exceptionRecord.count({ where: { organizationId: orgId } }),
      prisma.reconciliationPeriod.count({ where: { organizationId: orgId } }),
      prisma.reconciliationPeriod.count({ where: { organizationId: orgId, status: 'APPROVED' } }),
      prisma.matchingRule.count({ where: { organizationId: orgId, isActive: true } }),
      prisma.bankTransaction.findFirst({
        where: { organizationId: orgId, status: 'UNMATCHED' },
        orderBy: { transactionDate: 'asc' },
        select: { transactionDate: true, description: true, signedAmount: true },
      }),
      prisma.glTransaction.findFirst({
        where: { organizationId: orgId, status: 'UNMATCHED' },
        orderBy: { transactionDate: 'asc' },
        select: { transactionDate: true, narration: true, amount: true },
      }),
      prisma.auditEvent.findMany({
        where: { organizationId: orgId },
        orderBy: { timestamp: 'desc' },
        take: 5,
        include: { actor: { select: { fullName: true, email: true } } },
      }),
      prisma.reconciliationPeriod.findMany({
        where: { organizationId: orgId },
        include: {
          bankAccount: { include: { bank: true } },
          _count: { select: { matches: true, exceptions: true } },
        },
        orderBy: { periodStart: 'desc' },
        take: 5,
      }),
    ]);

    // Calculate real outstanding values from DB
    const [bankOutstandingSum, glOutstandingSum] = await Promise.all([
      prisma.bankTransaction.aggregate({
        where: { organizationId: orgId, status: 'UNMATCHED' },
        _sum: { signedAmount: true },
      }),
      prisma.glTransaction.aggregate({
        where: { organizationId: orgId, status: 'UNMATCHED' },
        _sum: { amount: true },
      }),
    ]);

    const totalProcessedTransactions = bankTxTotal + glTxTotal;
    const totalMatchedTransactions = bankTxMatched + glTxMatched;
    const totalUnmatchedTransactions = bankTxUnmatched + glTxUnmatched;

    const reconciliationCompletionRate =
      totalProcessedTransactions > 0
        ? Math.round((totalMatchedTransactions / totalProcessedTransactions) * 1000) / 10
        : 0;

    let oldestOutstandingDate: string | null = null;
    let oldestOutstandingItem: Record<string, unknown> | null = null;

    if (oldestUnmatchedBankTx && oldestUnmatchedGLTx) {
      if (
        new Date(oldestUnmatchedBankTx.transactionDate).getTime() <=
        new Date(oldestUnmatchedGLTx.transactionDate).getTime()
      ) {
        oldestOutstandingDate = oldestUnmatchedBankTx.transactionDate.toISOString();
        oldestOutstandingItem = oldestUnmatchedBankTx;
      } else {
        oldestOutstandingDate = oldestUnmatchedGLTx.transactionDate.toISOString();
        oldestOutstandingItem = oldestUnmatchedGLTx;
      }
    } else if (oldestUnmatchedBankTx) {
      oldestOutstandingDate = oldestUnmatchedBankTx.transactionDate.toISOString();
      oldestOutstandingItem = oldestUnmatchedBankTx;
    } else if (oldestUnmatchedGLTx) {
      oldestOutstandingDate = oldestUnmatchedGLTx.transactionDate.toISOString();
      oldestOutstandingItem = oldestUnmatchedGLTx;
    }

    res.json({
      organization: req.organization,
      metrics: {
        bankAccountsCount,
        statementsCount,
        totalProcessedTransactions,
        bankTransactionsTotal: bankTxTotal,
        glTransactionsTotal: glTxTotal,
        automaticallyMatchedCount: totalMatchedTransactions,
        unmatchedCount: totalUnmatchedTransactions,
        exceptionsCount: exceptionsOpen,
        exceptionsTotal,
        reconciliationPeriodsCount: periodsTotal,
        reconciliationPeriodsApproved: periodsApproved,
        activeMatchingRulesCount: activeRulesCount,
        outstandingValue: {
          bankTotal: Math.abs(Number(bankOutstandingSum._sum.signedAmount || 0)),
          glTotal: Math.abs(Number(glOutstandingSum._sum.amount || 0)),
          combined:
            Math.abs(Number(bankOutstandingSum._sum.signedAmount || 0)) +
            Math.abs(Number(glOutstandingSum._sum.amount || 0)),
        },
        oldestOutstandingTransaction: {
          date: oldestOutstandingDate,
          details: oldestOutstandingItem,
        },
        reconciliationCompletionRate,
      },
      recentAuditEvents: recentAuditEvents.map((e) => ({
        ...e,
        metadata: e.metadata ? JSON.parse(e.metadata) : null,
      })),
      recentReconciliationPeriods: reconciliationPeriods,
    });
  } catch (error) {
    console.error('Error computing dashboard summary:', error);
    res.status(500).json({ error: 'Failed to generate dashboard summary' });
  }
});
