import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission } from '../middleware/rbac';
import { CreateReconciliationPeriodSchema, SubmitApprovalSchema } from '../validators/schemas';
import { recordAuditEvent } from '../services/auditService';

export const reconciliationRouter = Router();

// List Reconciliation Periods
reconciliationRouter.get('/', requirePermission('view_dashboard'), async (req, res) => {
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
});

// Create Reconciliation Period
reconciliationRouter.post('/', requirePermission('reconcile'), async (req, res) => {
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
});

// Get Period Details with Matches, Topology & Approvals
reconciliationRouter.get('/:id', requirePermission('view_dashboard'), async (req, res) => {
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
});

// Create Match Structure (Supports 1:1, 1:Many, Many:1, Many:Many)
reconciliationRouter.post('/:id/matches', requirePermission('manually_match'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const { id: periodId } = req.params;
    const {
      matchType = 'ONE_TO_ONE', // ONE_TO_ONE, ONE_TO_MANY, MANY_TO_ONE, MANY_TO_MANY, MANUAL
      matchingRuleId,
      confidenceScore = 1.0,
      criteriaMatched = ['AMOUNT', 'REFERENCE_NUMBER', 'TRANSACTION_DATE'],
      tolerancesApplied = null,
      explanation = 'Manual match group created by user',
      bankTransactionIds = [], // Array of string UUIDs
      glTransactionIds = [], // Array of string UUIDs
    } = req.body;

    const period = await prisma.reconciliationPeriod.findFirst({
      where: { id: periodId, organizationId: orgId },
    });

    if (!period) {
      return res.status(404).json({ error: 'Reconciliation period not found' });
    }

    if (period.isLocked) {
      return res.status(400).json({ error: 'Cannot create matches on a locked or closed period' });
    }

    if (bankTransactionIds.length === 0 && glTransactionIds.length === 0) {
      return res.status(400).json({ error: 'Match must contain at least one bank or GL transaction' });
    }

    // Create Match Record with multi-transaction junction entries
    const match = await prisma.$transaction(async (tx) => {
      const createdMatch = await tx.reconciliationMatch.create({
        data: {
          reconciliationPeriodId: periodId,
          matchType,
          matchStatus: 'CONFIRMED',
          matchingRuleId: matchingRuleId || null,
          confidenceScore: Number(confidenceScore),
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
          await tx.bankTransactionMatch.create({
            data: {
              matchId: createdMatch.id,
              bankTransactionId: bId,
              allocatedAmount: Math.abs(bTx.signedAmount),
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
          await tx.glTransactionMatch.create({
            data: {
              matchId: createdMatch.id,
              glTransactionId: gId,
              allocatedAmount: Math.abs(gTx.amount),
            },
          });
          await tx.glTransaction.update({
            where: { id: gId },
            data: { status: 'MATCHED' },
          });
        }
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
});

// Submit Stage Approval Workflow (Prepared -> Reviewed -> Approved -> Closed)
reconciliationRouter.post('/:id/approvals', requirePermission('approve_reconciliation'), async (req, res) => {
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

    // Determine status transition
    let nextStatus = period.status;
    let isLocked = period.isLocked;
    const updateData: Record<string, unknown> = {};

    if (validated.action === 'SUBMIT_PREPARATION') {
      nextStatus = 'UNDER_REVIEW';
      updateData.preparedById = req.user?.id;
      updateData.preparedAt = new Date();
    } else if (validated.action === 'SUBMIT_REVIEW') {
      nextStatus = 'UNDER_REVIEW';
      updateData.reviewedById = req.user?.id;
      updateData.reviewedAt = new Date();
    } else if (validated.action === 'APPROVE') {
      nextStatus = 'APPROVED';
      updateData.approvedById = req.user?.id;
      updateData.approvedAt = new Date();
    } else if (validated.action === 'CLOSE') {
      nextStatus = 'CLOSED';
      isLocked = true;
      updateData.closedAt = new Date();
    } else if (validated.action === 'REOPEN') {
      nextStatus = 'PROCESSING';
      isLocked = false;
    } else if (validated.action === 'REJECT') {
      nextStatus = 'EXCEPTIONS';
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
});
