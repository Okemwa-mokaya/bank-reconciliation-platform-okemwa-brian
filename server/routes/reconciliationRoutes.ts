import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission } from '../middleware/rbac';
import { CreateReconciliationPeriodSchema, SubmitApprovalSchema } from '../validators/schemas';
import { recordAuditEvent } from '../services/auditService';
import { Prisma } from '@prisma/client';

export const reconciliationRouter = Router();

// Helper: List periods
const listPeriodsHandler = async (req: any, res: any) => {
  try {
    const orgId = req.organization!.id;
    const { bankAccountId } = req.query;

    const where: Record<string, unknown> = { organizationId: orgId };
    if (bankAccountId && typeof bankAccountId === 'string') {
      where.bankAccountId = bankAccountId;
    }

    const periods = await prisma.reconciliationPeriod.findMany({
      where,
      include: {
        bankAccount: {
          include: { bank: true },
        },
        preparedBy: { select: { id: true, fullName: true, email: true } },
        reviewedBy: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        _count: {
          select: {
            matches: true,
            approvals: true,
            exceptions: true,
          },
        },
      },
      orderBy: { periodStart: 'desc' },
    });

    res.json({ periods });
  } catch (error) {
    console.error('Error fetching reconciliation periods:', error);
    res.status(500).json({ error: 'Failed to fetch reconciliation periods' });
  }
};

reconciliationRouter.get('/', requirePermission('view_dashboard'), listPeriodsHandler);
reconciliationRouter.get('/periods', requirePermission('view_dashboard'), listPeriodsHandler);

// Helper: Create period
const createPeriodHandler = async (req: any, res: any) => {
  try {
    const orgId = req.organization!.id;
    const validated = CreateReconciliationPeriodSchema.parse(req.body);

    const account = await prisma.bankAccount.findFirst({
      where: { id: validated.bankAccountId, organizationId: orgId },
    });

    if (!account) {
      return res.status(404).json({ error: 'Bank account not found' });
    }

    const period = await prisma.reconciliationPeriod.create({
      data: {
        organizationId: orgId,
        bankAccountId: validated.bankAccountId,
        periodStart: new Date(validated.periodStart),
        periodEnd: new Date(validated.periodEnd),
        status: 'NOT_STARTED',
        isLocked: false,
        preparedById: req.user?.id,
        preparedAt: new Date(),
      },
      include: {
        bankAccount: { include: { bank: true } },
      },
    });

    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles[0],
      action: 'RECONCILIATION_PERIOD_CREATED',
      entityType: 'ReconciliationPeriod',
      entityId: period.id,
      newValue: {
        id: period.id,
        account: account.accountName,
        periodStart: validated.periodStart,
        periodEnd: validated.periodEnd,
      },
      reason: 'Reconciliation period initiated',
    });

    res.status(201).json({ period });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating reconciliation period:', error);
    res.status(500).json({ error: 'Failed to create reconciliation period' });
  }
};

reconciliationRouter.post('/', requirePermission('reconcile'), createPeriodHandler);
reconciliationRouter.post('/periods', requirePermission('reconcile'), createPeriodHandler);

// Helper: Get Period Details
const getPeriodDetailsHandler = async (req: any, res: any) => {
  try {
    const orgId = req.organization!.id;
    const { id } = req.params;

    const period = await prisma.reconciliationPeriod.findFirst({
      where: { id, organizationId: orgId },
      include: {
        bankAccount: { include: { bank: true } },
        preparedBy: { select: { id: true, fullName: true, email: true } },
        reviewedBy: { select: { id: true, fullName: true, email: true } },
        approvedBy: { select: { id: true, fullName: true, email: true } },
        approvals: {
          include: { user: { select: { id: true, fullName: true, email: true } } },
          orderBy: { timestamp: 'asc' },
        },
        matches: {
          include: {
            matchingRule: true,
            bankTransactions: {
              include: { bankTransaction: true },
            },
            glTransactions: {
              include: { glTransaction: true },
            },
          },
        },
        exceptions: {
          include: {
            assignedUser: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    if (!period) {
      return res.status(404).json({ error: 'Reconciliation period not found' });
    }

    res.json({ period });
  } catch (error) {
    console.error('Error fetching period details:', error);
    res.status(500).json({ error: 'Failed to fetch reconciliation period' });
  }
};

reconciliationRouter.get('/:id', requirePermission('view_dashboard'), getPeriodDetailsHandler);
reconciliationRouter.get('/periods/:id', requirePermission('view_dashboard'), getPeriodDetailsHandler);

// Helper: Get Period Matches
const getPeriodMatchesHandler = async (req: any, res: any) => {
  try {
    const orgId = req.organization!.id;
    const { id } = req.params;

    const period = await prisma.reconciliationPeriod.findFirst({
      where: { id, organizationId: orgId },
    });

    if (!period) {
      return res.status(404).json({ error: 'Reconciliation period not found' });
    }

    const matches = await prisma.reconciliationMatch.findMany({
      where: { reconciliationPeriodId: id },
      include: {
        matchingRule: true,
        bankTransactions: {
          include: { bankTransaction: true },
        },
        glTransactions: {
          include: { glTransaction: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ matches });
  } catch (error) {
    console.error('Error fetching matches:', error);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
};

reconciliationRouter.get('/:id/matches', requirePermission('view_transactions'), getPeriodMatchesHandler);
reconciliationRouter.get('/periods/:id/matches', requirePermission('view_transactions'), getPeriodMatchesHandler);

// Create Match Structure (Strict Cross-Tenant & Locked-Period Security)
const createMatchHandler = async (req: any, res: any) => {
  try {
    const orgId = req.organization!.id;
    const { id: periodId } = req.params;
    const {
      matchType = 'ONE_TO_ONE',
      matchingRuleId,
      confidenceScore = 1.0,
      criteriaMatched = ['AMOUNT', 'REFERENCE_NUMBER', 'TRANSACTION_DATE'],
      tolerancesApplied = null,
      explanation = 'Manual match group created by user',
      bankTransactionIds = [],
      glTransactionIds = [],
    } = req.body;

    const period = await prisma.reconciliationPeriod.findFirst({
      where: { id: periodId, organizationId: orgId },
    });

    if (!period) {
      return res.status(404).json({ error: 'Reconciliation period not found' });
    }

    // 1. LOCKED / CLOSED PERIOD SECURITY GUARD
    if (period.isLocked || period.status === 'CLOSED') {
      return res.status(403).json({ error: 'Cannot create matches on a locked or closed reconciliation period' });
    }

    if (bankTransactionIds.length === 0 && glTransactionIds.length === 0) {
      return res.status(400).json({ error: 'Match must contain at least one bank or GL transaction' });
    }

    // 2. CROSS-TENANT & ACCOUNT OWNERSHIP VALIDATION
    if (bankTransactionIds.length > 0) {
      const bankTxs = await prisma.bankTransaction.findMany({
        where: { id: { in: bankTransactionIds } },
      });

      if (bankTxs.length !== bankTransactionIds.length) {
        return res.status(404).json({ error: 'One or more bank transactions could not be found' });
      }

      for (const bTx of bankTxs) {
        if (bTx.organizationId !== orgId) {
          return res.status(403).json({
            error: 'Tenant isolation violation: Cross-tenant bank transaction matching is strictly prohibited',
          });
        }
        if (bTx.bankAccountId !== period.bankAccountId) {
          return res.status(400).json({
            error: 'Bank transaction does not belong to the period bank account',
          });
        }
      }
    }

    if (glTransactionIds.length > 0) {
      const glTxs = await prisma.glTransaction.findMany({
        where: { id: { in: glTransactionIds } },
      });

      if (glTxs.length !== glTransactionIds.length) {
        return res.status(404).json({ error: 'One or more GL transactions could not be found' });
      }

      for (const gTx of glTxs) {
        if (gTx.organizationId !== orgId) {
          return res.status(403).json({
            error: 'Tenant isolation violation: Cross-tenant GL transaction matching is strictly prohibited',
          });
        }
        if (gTx.bankAccountId && gTx.bankAccountId !== period.bankAccountId) {
          return res.status(400).json({
            error: 'GL transaction is assigned to a different bank account',
          });
        }
      }
    }

    // 3. Create Match Record with multi-transaction junction entries
    const match = await prisma.$transaction(async (tx) => {
      const createdMatch = await tx.reconciliationMatch.create({
        data: {
          reconciliationPeriodId: periodId,
          matchType,
          matchStatus: 'CONFIRMED',
          matchingRuleId: matchingRuleId || null,
          confidenceScore: new Prisma.Decimal(confidenceScore),
          criteriaMatched: JSON.stringify(criteriaMatched),
          tolerancesApplied: tolerancesApplied ? JSON.stringify(tolerancesApplied) : null,
          explanation,
          createdByType: 'USER',
          createdById: req.user?.id,
        },
      });

      // Link Bank Transactions
      for (const bId of bankTransactionIds) {
        const bTx = await tx.bankTransaction.findUnique({ where: { id: bId } });
        if (bTx) {
          const absSigned = bTx.signedAmount.isNegative() ? bTx.signedAmount.negated() : bTx.signedAmount;
          await tx.bankTransactionMatch.create({
            data: {
              matchId: createdMatch.id,
              bankTransactionId: bId,
              allocatedAmount: absSigned,
            },
          });
          await tx.bankTransaction.update({
            where: { id: bId },
            data: { status: 'MATCHED' },
          });
        }
      }

      // Link GL Transactions
      for (const gId of glTransactionIds) {
        const gTx = await tx.glTransaction.findUnique({ where: { id: gId } });
        if (gTx) {
          const absAmount = gTx.amount.isNegative() ? gTx.amount.negated() : gTx.amount;
          await tx.glTransactionMatch.create({
            data: {
              matchId: createdMatch.id,
              glTransactionId: gId,
              allocatedAmount: absAmount,
            },
          });
          await tx.glTransaction.update({
            where: { id: gId },
            data: { status: 'MATCHED' },
          });
        }
      }

      // Update Period status to PROCESSING / RECONCILED if it was NOT_STARTED
      if (period.status === 'NOT_STARTED') {
        await tx.reconciliationPeriod.update({
          where: { id: periodId },
          data: { status: 'PROCESSING' },
        });
      }

      return createdMatch;
    });

    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles[0],
      action: 'MATCH_CREATED',
      entityType: 'ReconciliationMatch',
      entityId: match.id,
      newValue: {
        matchType,
        bankTransactionsCount: bankTransactionIds.length,
        glTransactionsCount: glTransactionIds.length,
      },
      reason: explanation,
    });

    const fullMatch = await prisma.reconciliationMatch.findUnique({
      where: { id: match.id },
      include: {
        bankTransactions: { include: { bankTransaction: true } },
        glTransactions: { include: { glTransaction: true } },
      },
    });

    res.status(201).json({ match: fullMatch });
  } catch (error) {
    console.error('Error creating match:', error);
    res.status(500).json({ error: 'Failed to create reconciliation match' });
  }
};

reconciliationRouter.post('/:id/matches', requirePermission('manually_match'), createMatchHandler);
reconciliationRouter.post('/periods/:id/matches', requirePermission('manually_match'), createMatchHandler);

// Unmatch an existing match group
const unmatchHandler = async (req: any, res: any) => {
  try {
    const orgId = req.organization!.id;
    const { id: periodId } = req.params;
    const { matchId } = req.body;

    if (!matchId) {
      return res.status(400).json({ error: 'Missing matchId in request body' });
    }

    const period = await prisma.reconciliationPeriod.findFirst({
      where: { id: periodId, organizationId: orgId },
    });

    if (!period) {
      return res.status(404).json({ error: 'Reconciliation period not found' });
    }

    if (period.isLocked || period.status === 'CLOSED') {
      return res.status(403).json({ error: 'Cannot unmatch on a locked or closed reconciliation period' });
    }

    const match = await prisma.reconciliationMatch.findFirst({
      where: { id: matchId, reconciliationPeriodId: periodId },
      include: {
        bankTransactions: true,
        glTransactions: true,
      },
    });

    if (!match) {
      return res.status(404).json({ error: 'Match record not found in period' });
    }

    await prisma.$transaction(async (tx) => {
      // Revert bank transactions to UNMATCHED
      for (const btm of match.bankTransactions) {
        await tx.bankTransaction.update({
          where: { id: btm.bankTransactionId },
          data: { status: 'UNMATCHED' },
        });
      }

      // Revert GL transactions to UNMATCHED
      for (const gtm of match.glTransactions) {
        await tx.glTransaction.update({
          where: { id: gtm.glTransactionId },
          data: { status: 'UNMATCHED' },
        });
      }

      // Delete junction entries
      await tx.bankTransactionMatch.deleteMany({ where: { matchId } });
      await tx.glTransactionMatch.deleteMany({ where: { matchId } });

      // Delete match record
      await tx.reconciliationMatch.delete({ where: { id: matchId } });
    });

    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles[0],
      action: 'MATCH_UNMATCHED',
      entityType: 'ReconciliationMatch',
      entityId: matchId,
      previousValue: { matchId, status: 'CONFIRMED' },
      newValue: { matchId, status: 'UNMATCHED' },
      reason: 'User removed reconciliation match',
    });

    res.json({ success: true, message: 'Match successfully undone' });
  } catch (error) {
    console.error('Error unmatching:', error);
    res.status(500).json({ error: 'Failed to unmatch transaction group' });
  }
};

reconciliationRouter.post('/:id/unmatch', requirePermission('manually_match'), unmatchHandler);
reconciliationRouter.post('/periods/:id/unmatch', requirePermission('manually_match'), unmatchHandler);

// Phase 1 Scope: Automatic matching engine execution is deferred to Phase 3 (Reconciliation Engine)
const proposeAutoMatchesHandler = async (req: any, res: any) => {
  return res.status(501).json({
    status: 'DEFERRED',
    error: 'Not Implemented',
    phase: 'PHASE_3_DEFERRED',
    message:
      'Automatic reconciliation engine execution is deferred to Phase 3 (Reconciliation Engine). Phase 1 provides the complete reconciliation foundation, 9 matching criteria, organization control thresholds (min 3 total, min 2 strong), configurable rules and multi-tier tolerances, and manual matching workflows.',
  });
};

reconciliationRouter.post('/:id/propose-auto-matches', requirePermission('reconcile'), proposeAutoMatchesHandler);
reconciliationRouter.post('/periods/:id/propose-auto-matches', requirePermission('reconcile'), proposeAutoMatchesHandler);

// Submit Stage Approval Workflow (PREPARED -> REVIEWED -> APPROVED -> CLOSED)
const submitApprovalHandler = async (req: any, res: any) => {
  try {
    const orgId = req.organization!.id;
    const { id: periodId } = req.params;
    const validated = SubmitApprovalSchema.parse(req.body);

    const period = await prisma.reconciliationPeriod.findFirst({
      where: { id: periodId, organizationId: orgId },
    });

    if (!period) {
      return res.status(404).json({ error: 'Reconciliation period not found' });
    }

    let nextStatus = period.status;
    let isLocked = period.isLocked;
    const updateData: Record<string, unknown> = {};

    // STRICT WORKFLOW STATE MACHINE VALIDATION
    if (validated.action === 'SUBMIT_PREPARATION') {
      const allowedPrior = ['NOT_STARTED', 'PROCESSING', 'RECONCILED', 'EXCEPTIONS'];
      if (!allowedPrior.includes(period.status)) {
        return res.status(400).json({
          error: `Invalid state transition: Cannot prepare period from status ${period.status}. Expected one of: ${allowedPrior.join(', ')}`,
        });
      }
      nextStatus = 'PREPARED';
      updateData.preparedById = req.user?.id;
      updateData.preparedAt = new Date();
    } else if (validated.action === 'SUBMIT_REVIEW') {
      if (period.status !== 'PREPARED') {
        return res.status(400).json({
          error: `Invalid state transition: Cannot submit review from status ${period.status}. Period must be in PREPARED status first.`,
        });
      }
      nextStatus = 'REVIEWED';
      updateData.reviewedById = req.user?.id;
      updateData.reviewedAt = new Date();
    } else if (validated.action === 'APPROVE') {
      if (period.status !== 'REVIEWED') {
        return res.status(400).json({
          error: `Invalid state transition: Cannot approve period from status ${period.status}. Period must be in REVIEWED status first.`,
        });
      }
      nextStatus = 'APPROVED';
      updateData.approvedById = req.user?.id;
      updateData.approvedAt = new Date();
    } else if (validated.action === 'CLOSE') {
      if (period.status !== 'APPROVED') {
        return res.status(400).json({
          error: `Invalid state transition: Cannot close period from status ${period.status}. Period must be APPROVED before closure.`,
        });
      }
      nextStatus = 'CLOSED';
      isLocked = true;
      updateData.closedAt = new Date();
    } else if (validated.action === 'REOPEN') {
      if (!req.user?.permissions.includes('manage_users') && !req.user?.roles.includes('ADMIN')) {
        return res.status(403).json({
          error: 'Forbidden: Only administrators with manage_users permission can reopen locked or approved periods.',
        });
      }
      if (!['CLOSED', 'APPROVED'].includes(period.status)) {
        return res.status(400).json({
          error: `Invalid state transition: Cannot reopen period with status ${period.status}. Expected CLOSED or APPROVED.`,
        });
      }
      nextStatus = 'PROCESSING';
      isLocked = false;
    } else if (validated.action === 'REJECT') {
      nextStatus = 'EXCEPTIONS';
      isLocked = false;
    } else {
      return res.status(400).json({ error: `Unknown workflow action: ${validated.action}` });
    }

    updateData.status = nextStatus;
    updateData.isLocked = isLocked;

    const [approval, updatedPeriod] = await prisma.$transaction([
      prisma.approvalWorkflow.create({
        data: {
          reconciliationPeriodId: periodId,
          stage: validated.stage,
          action: validated.action,
          status: validated.action === 'REJECT' ? 'REJECTED' : 'APPROVED',
          userId: req.user!.id,
          comments: validated.comments || null,
        },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
        },
      }),
      prisma.reconciliationPeriod.update({
        where: { id: periodId },
        data: updateData,
      }),
    ]);

    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles[0],
      action: `STAGE_${validated.action}`,
      entityType: 'ReconciliationPeriod',
      entityId: periodId,
      previousValue: { status: period.status, isLocked: period.isLocked },
      newValue: { status: nextStatus, isLocked, stage: validated.stage },
      reason: validated.comments || `Approval stage action executed: ${validated.action}`,
    });

    res.status(201).json({ approval, period: updatedPeriod });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error submitting approval:', error);
    res.status(500).json({ error: 'Failed to process approval action' });
  }
};

reconciliationRouter.post('/:id/approvals', requirePermission('approve_reconciliation'), submitApprovalHandler);
reconciliationRouter.post('/:id/approval', requirePermission('approve_reconciliation'), submitApprovalHandler);
reconciliationRouter.post('/periods/:id/approvals', requirePermission('approve_reconciliation'), submitApprovalHandler);
reconciliationRouter.post('/periods/:id/approval', requirePermission('approve_reconciliation'), submitApprovalHandler);
