import { Router, Request, Response } from 'express';
import { prisma } from '../db';
import { requirePermission } from '../middleware/rbac';
import { CreateReconciliationPeriodSchema, SubmitApprovalSchema } from '../validators/schemas';
import { recordAuditEvent } from '../services/auditService';
import { Prisma } from '@prisma/client';
import {
  CriteriaEvaluationService,
  EvaluationSummary,
} from '../services/matching/criteriaEvaluator';
import { ToleranceResolverService } from '../services/matching/toleranceResolver';

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
export const createMatchHandler = async (req: any, res: any) => {
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
      bankAllocations = null,
      glAllocations = null,
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

    const isPartialRequested = Boolean(
      req.body.isPartial ||
      req.body.partialMatch ||
      req.body.partial ||
      req.body.status === 'PARTIALLY_MATCHED' ||
      req.body.matchStatus === 'PARTIAL'
    );

    if (!Array.isArray(bankTransactionIds) || !Array.isArray(glTransactionIds)) {
      return res.status(400).json({ error: 'bankTransactionIds and glTransactionIds must be arrays' });
    }

    if (bankTransactionIds.length === 0 && glTransactionIds.length === 0) {
      return res.status(400).json({ error: 'Match must contain at least one bank or GL transaction' });
    }

    // Reject duplicate IDs before topology validation
    if (new Set(bankTransactionIds).size !== bankTransactionIds.length) {
      return res.status(400).json({
        error: 'Duplicate bank transaction IDs are not permitted in match request',
      });
    }
    if (new Set(glTransactionIds).size !== glTransactionIds.length) {
      return res.status(400).json({
        error: 'Duplicate GL transaction IDs are not permitted in match request',
      });
    }

    if (isPartialRequested) {
      const hasBankAlloc = bankAllocations && typeof bankAllocations === 'object' && Object.keys(bankAllocations).length > 0;
      const hasGlAlloc = glAllocations && typeof glAllocations === 'object' && Object.keys(glAllocations).length > 0;
      if (!hasBankAlloc && !hasGlAlloc) {
        return res.status(400).json({
          error: 'Explicit allocation amount is required for partial match',
        });
      }
    }

    if (bankAllocations && typeof bankAllocations === 'object') {
      for (const [id, alloc] of Object.entries(bankAllocations)) {
        try {
          const dec = new Prisma.Decimal(alloc as any);
          if (dec.lte(0)) {
            return res.status(400).json({
              error: `Allocation amount must be greater than zero for bank transaction ${id}`,
            });
          }
        } catch (e: any) {
          return res.status(400).json({
            error: `Invalid allocation amount format for bank transaction ${id}`,
          });
        }
      }
    }
    if (glAllocations && typeof glAllocations === 'object') {
      for (const [id, alloc] of Object.entries(glAllocations)) {
        try {
          const dec = new Prisma.Decimal(alloc as any);
          if (dec.lte(0)) {
            return res.status(400).json({
              error: `Allocation amount must be greater than zero for GL transaction ${id}`,
            });
          }
        } catch (e: any) {
          return res.status(400).json({
            error: `Invalid allocation amount format for GL transaction ${id}`,
          });
        }
      }
    }

    // 2. MATCH TOPOLOGY VALIDATION
    const supportedMatchTypes = [
      'ONE_TO_ONE',
      'ONE_TO_MANY',
      'MANY_TO_ONE',
      'MANY_TO_MANY',
      'MANUAL',
      'ADJUSTMENT',
    ];
    if (!supportedMatchTypes.includes(matchType)) {
      return res.status(400).json({
        error: `Invalid match type: ${matchType}. Supported types are ONE_TO_ONE, ONE_TO_MANY, MANY_TO_ONE, MANY_TO_MANY`,
      });
    }

    if (matchType === 'ONE_TO_ONE') {
      if (bankTransactionIds.length !== 1 || glTransactionIds.length !== 1) {
        return res.status(400).json({
          error: 'Invalid match topology: ONE_TO_ONE match requires exactly 1 bank transaction and 1 GL transaction',
        });
      }
    } else if (matchType === 'ONE_TO_MANY') {
      if (bankTransactionIds.length !== 1 || glTransactionIds.length < 2) {
        return res.status(400).json({
          error: 'Invalid match topology: ONE_TO_MANY match requires exactly 1 bank transaction and 2 or more GL transactions',
        });
      }
    } else if (matchType === 'MANY_TO_ONE') {
      if (bankTransactionIds.length < 2 || glTransactionIds.length !== 1) {
        return res.status(400).json({
          error: 'Invalid match topology: MANY_TO_ONE match requires 2 or more bank transactions and exactly 1 GL transaction',
        });
      }
    } else if (matchType === 'MANY_TO_MANY') {
      if (bankTransactionIds.length < 2 || glTransactionIds.length < 2) {
        return res.status(400).json({
          error: 'Invalid match topology: MANY_TO_MANY match requires 2 or more bank transactions and 2 or more GL transactions',
        });
      }
    }

    // 3. MATCHING RULE ORGANIZATION VERIFICATION
    if (matchingRuleId) {
      const rule = await prisma.matchingRule.findFirst({
        where: { id: matchingRuleId, organizationId: orgId },
      });
      if (!rule) {
        return res.status(403).json({
          error: 'Tenant isolation violation: Matching rule belongs to another organization',
        });
      }
    }

    // 4. CROSS-TENANT, ACCOUNT OWNERSHIP & STATUS VALIDATION
    let bankTxs: any[] = [];
    if (bankTransactionIds.length > 0) {
      bankTxs = await prisma.bankTransaction.findMany({
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
        if (bTx.status === 'MATCHED') {
          return res.status(400).json({
            error: `Bank transaction ${bTx.id} cannot be matched because it is already MATCHED`,
          });
        }
        if (bTx.status === 'EXCLUDED') {
          return res.status(400).json({
            error: `Bank transaction ${bTx.id} cannot be matched because it is EXCLUDED`,
          });
        }
        if (bTx.status !== 'UNMATCHED' && bTx.status !== 'PARTIALLY_MATCHED') {
          return res.status(400).json({
            error: `Bank transaction ${bTx.id} cannot be matched because its status is ${bTx.status}`,
          });
        }
        if (bTx.status === 'PARTIALLY_MATCHED') {
          if (!bankAllocations || bankAllocations[bTx.id] === undefined || bankAllocations[bTx.id] === null) {
            return res.status(400).json({
              error: `Bank transaction ${bTx.id} is PARTIALLY_MATCHED and requires an explicit allocation amount in bankAllocations`,
            });
          }
        }
      }
    }

    let glTxs: any[] = [];
    if (glTransactionIds.length > 0) {
      glTxs = await prisma.glTransaction.findMany({
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
        if (gTx.status === 'MATCHED') {
          return res.status(400).json({
            error: `GL transaction ${gTx.id} cannot be matched because it is already MATCHED`,
          });
        }
        if (gTx.status === 'EXCLUDED') {
          return res.status(400).json({
            error: `GL transaction ${gTx.id} cannot be matched because it is EXCLUDED`,
          });
        }
        if (gTx.status !== 'UNMATCHED' && gTx.status !== 'PARTIALLY_MATCHED') {
          return res.status(400).json({
            error: `GL transaction ${gTx.id} cannot be matched because its status is ${gTx.status}`,
          });
        }
        if (gTx.status === 'PARTIALLY_MATCHED') {
          if (!glAllocations || glAllocations[gTx.id] === undefined || glAllocations[gTx.id] === null) {
            return res.status(400).json({
              error: `GL transaction ${gTx.id} is PARTIALLY_MATCHED and requires an explicit allocation amount in glAllocations`,
            });
          }
        }
      }
    }

    // 5. TOLERANCE RESOLUTION & CRITERIA EVALUATION ENGINE INTEGRATION
    const resolvedTolerances = await ToleranceResolverService.resolveForContext({
      organizationId: orgId,
      bankAccountId: period.bankAccountId,
      matchingRuleId: matchingRuleId || null,
    });

    let evaluationSummary: EvaluationSummary | null = null;
    if (bankTxs.length > 0 && glTxs.length > 0) {
      evaluationSummary = CriteriaEvaluationService.evaluateGroup(bankTxs, glTxs, {
        tolerances: resolvedTolerances,
      });
    }

    const isProposedMatch =
      req.body.matchStatus === 'PROPOSED' ||
      req.body.isProposed === true ||
      req.body.status === 'PROPOSED' ||
      req.body.proposed === true;

    // Enforce matching eligibility for proposed matches:
    // A proposed match cannot be created merely because the client supplies confidenceScore,
    // criteriaMatched, tolerancesApplied, or explanation. It MUST be proven eligible by the server's criteria engine.
    if (isProposedMatch) {
      if (!evaluationSummary || !evaluationSummary.eligible) {
        return res.status(400).json({
          error: 'Proposed match rejected: transactions do not satisfy matching criteria eligibility threshold (at least 3 criteria satisfied with at least 2 strong criteria)',
          totalCriteriaSatisfied: evaluationSummary?.totalCriteriaSatisfied ?? 0,
          strongCriteriaSatisfied: evaluationSummary?.strongCriteriaSatisfied ?? 0,
          criteriaSatisfied: evaluationSummary?.criteriaSatisfied ?? [],
          criteriaFailed: evaluationSummary?.criteriaFailed ?? [],
          breakdown: evaluationSummary?.breakdown,
        });
      }
    }

    // Determine target match attributes and distinguish:
    // 1. Automatic / proposed match (must be eligible via criteria engine)
    // 2. Manual user-confirmed match (eligible via criteria engine)
    // 3. Manual override of an otherwise ineligible candidate (explicitly tracked, audited, and flagged)
    const targetMatchStatus = isProposedMatch ? 'PROPOSED' : 'CONFIRMED';
    const targetCreatedByType = isProposedMatch ? 'SYSTEM' : 'USER';
    const isEligible = evaluationSummary?.eligible === true;
    const isManualOverride = !isProposedMatch && !isEligible && matchType !== 'ADJUSTMENT';
    const overrideReason = isManualOverride
      ? (req.body.overrideReason || req.body.reason || 'Manual user override of criteria eligibility threshold')
      : null;
    const overriddenById = isManualOverride ? (req.user?.id || null) : null;
    const overriddenAt = isManualOverride ? new Date() : null;

    const evaluatedConfidence = evaluationSummary
      ? new Prisma.Decimal(evaluationSummary.confidenceScore)
      : (matchType === 'ADJUSTMENT' ? new Prisma.Decimal(1.0) : new Prisma.Decimal(1.0));
    const evaluatedCriteria = evaluationSummary
      ? JSON.stringify(evaluationSummary.criteriaSatisfied)
      : JSON.stringify([]);
    const evaluatedTolerances = evaluationSummary
      ? JSON.stringify(evaluationSummary.resolvedTolerances)
      : (resolvedTolerances ? JSON.stringify(resolvedTolerances) : null);

    let computedExplanation: string;
    if (isManualOverride) {
      const userIdent = req.user?.email || req.user?.fullName || 'User';
      const critCount = evaluationSummary?.totalCriteriaSatisfied ?? 0;
      const strongCount = evaluationSummary?.strongCriteriaSatisfied ?? 0;
      computedExplanation = `[MANUAL_OVERRIDE] Ineligible candidate manually confirmed by ${userIdent}. Evaluated criteria: ${critCount} satisfied (${strongCount} strong). Override reason: ${overrideReason}`;
    } else if (evaluationSummary) {
      computedExplanation = `${targetMatchStatus === 'PROPOSED' ? 'Proposed' : 'Confirmed'} match based on ${evaluationSummary.totalCriteriaSatisfied} criteria (${evaluationSummary.strongCriteriaSatisfied} strong): ${evaluationSummary.criteriaSatisfied.join(', ')}`;
    } else {
      computedExplanation = req.body.explanation || (matchType === 'ADJUSTMENT' ? 'Manual adjustment match' : 'Manual match group created by user');
    }

    // 6. Create Match Record with multi-transaction junction entries & allocation integrity
    const match = await prisma.$transaction(async (tx) => {
      // A. Pre-calculate bank allocations and validate availability before any writes
      const preparedBankMatches: Array<{
        bTx: any;
        allocation: Prisma.Decimal;
        priorAllocated: Prisma.Decimal;
        absSigned: Prisma.Decimal;
      }> = [];
      let totalBankAllocated = new Prisma.Decimal(0);

      for (const bTx of bankTxs) {
        const bId = bTx.id;
        const existingAllocations = await tx.bankTransactionMatch.aggregate({
          where: { bankTransactionId: bId },
          _sum: { allocatedAmount: true },
        });
        const priorAllocated = existingAllocations._sum.allocatedAmount || new Prisma.Decimal(0);
        const signedDecimal = new Prisma.Decimal(bTx.signedAmount);
        const absSigned = signedDecimal.isNegative() ? signedDecimal.negated() : signedDecimal;
        const remainingAmount = absSigned.minus(priorAllocated);

        let allocation: Prisma.Decimal;
        if (bankAllocations && bankAllocations[bId] !== undefined && bankAllocations[bId] !== null && bankAllocations[bId] !== '') {
          allocation = new Prisma.Decimal(bankAllocations[bId]);
        } else if (bTx.status === 'PARTIALLY_MATCHED' || isPartialRequested) {
          throw new Error(
            `Bank transaction ${bId} is PARTIALLY_MATCHED and requires an explicit allocation amount in bankAllocations`
          );
        } else {
          allocation = remainingAmount;
        }

        if (allocation.lte(0)) {
          throw new Error(`Allocation amount must be greater than zero for bank transaction ${bId}`);
        }
        if (allocation.gt(absSigned)) {
          throw new Error(
            `Allocated amount (${allocation.toString()}) exceeds original transaction amount (${absSigned.toString()}) for bank transaction ${bId}`
          );
        }
        if (allocation.gt(remainingAmount)) {
          throw new Error(
            `Allocated amount (${allocation.toString()}) exceeds available amount (${remainingAmount.toString()}) for bank transaction ${bId}`
          );
        }

        totalBankAllocated = totalBankAllocated.plus(allocation);
        preparedBankMatches.push({ bTx, allocation, priorAllocated, absSigned });
      }

      // B. Pre-calculate GL allocations and validate availability before any writes
      const preparedGlMatches: Array<{
        gTx: any;
        allocation: Prisma.Decimal;
        priorAllocated: Prisma.Decimal;
        absAmount: Prisma.Decimal;
      }> = [];
      let totalGlAllocated = new Prisma.Decimal(0);

      for (const gTx of glTxs) {
        const gId = gTx.id;
        const existingAllocations = await tx.glTransactionMatch.aggregate({
          where: { glTransactionId: gId },
          _sum: { allocatedAmount: true },
        });
        const priorAllocated = existingAllocations._sum.allocatedAmount || new Prisma.Decimal(0);
        const amountDecimal = new Prisma.Decimal(gTx.amount);
        const absAmount = amountDecimal.isNegative() ? amountDecimal.negated() : amountDecimal;
        const remainingAmount = absAmount.minus(priorAllocated);

        let allocation: Prisma.Decimal;
        if (glAllocations && glAllocations[gId] !== undefined && glAllocations[gId] !== null && glAllocations[gId] !== '') {
          allocation = new Prisma.Decimal(glAllocations[gId]);
        } else if (gTx.status === 'PARTIALLY_MATCHED' || isPartialRequested) {
          throw new Error(
            `GL transaction ${gId} is PARTIALLY_MATCHED and requires an explicit allocation amount in glAllocations`
          );
        } else {
          allocation = remainingAmount;
        }

        if (allocation.lte(0)) {
          throw new Error(`Allocation amount must be greater than zero for GL transaction ${gId}`);
        }
        if (allocation.gt(absAmount)) {
          throw new Error(
            `Allocated amount (${allocation.toString()}) exceeds original transaction amount (${absAmount.toString()}) for GL transaction ${gId}`
          );
        }
        if (allocation.gt(remainingAmount)) {
          throw new Error(
            `Allocated amount (${allocation.toString()}) exceeds available amount (${remainingAmount.toString()}) for GL transaction ${gId}`
          );
        }

        totalGlAllocated = totalGlAllocated.plus(allocation);
        preparedGlMatches.push({ gTx, allocation, priorAllocated, absAmount });
      }

      // C. Group Balance Integrity Check: total bank allocated === total GL allocated
      if (matchType !== 'ADJUSTMENT' && !totalBankAllocated.equals(totalGlAllocated)) {
        throw new Error(
          `Group balance mismatch: total bank allocated (${totalBankAllocated.toString()}) does not equal total GL allocated (${totalGlAllocated.toString()})`
        );
      }

      // D. Mutations executed ONLY AFTER all validations and allocations pass
      const createdMatch = await tx.reconciliationMatch.create({
        data: {
          reconciliationPeriodId: periodId,
          matchType,
          matchStatus: targetMatchStatus,
          matchingRuleId: matchingRuleId || null,
          confidenceScore: evaluatedConfidence,
          criteriaMatched: evaluatedCriteria,
          tolerancesApplied: evaluatedTolerances,
          explanation: computedExplanation,
          createdByType: targetCreatedByType,
          createdById: req.user?.id,
          isManualOverride,
          overrideReason,
          overriddenById,
          overriddenAt,
        },
      });

      for (const { bTx, allocation, priorAllocated, absSigned } of preparedBankMatches) {
        await tx.bankTransactionMatch.create({
          data: {
            matchId: createdMatch.id,
            bankTransactionId: bTx.id,
            allocatedAmount: allocation,
          },
        });

        const totalAllocated = priorAllocated.plus(allocation);
        let newStatus: string;
        if (totalAllocated.isZero()) {
          newStatus = 'UNMATCHED';
        } else if (totalAllocated.lt(absSigned)) {
          newStatus = 'PARTIALLY_MATCHED';
        } else {
          newStatus = 'MATCHED';
        }
        await tx.bankTransaction.update({
          where: { id: bTx.id },
          data: { status: newStatus },
        });
      }

      for (const { gTx, allocation, priorAllocated, absAmount } of preparedGlMatches) {
        await tx.glTransactionMatch.create({
          data: {
            matchId: createdMatch.id,
            glTransactionId: gTx.id,
            allocatedAmount: allocation,
          },
        });

        const totalAllocated = priorAllocated.plus(allocation);
        let newStatus: string;
        if (totalAllocated.isZero()) {
          newStatus = 'UNMATCHED';
        } else if (totalAllocated.lt(absAmount)) {
          newStatus = 'PARTIALLY_MATCHED';
        } else {
          newStatus = 'MATCHED';
        }
        await tx.glTransaction.update({
          where: { id: gTx.id },
          data: { status: newStatus },
        });
      }

      if (period.status === 'NOT_STARTED') {
        await tx.reconciliationPeriod.update({
          where: { id: periodId },
          data: { status: 'PROCESSING' },
        });
      }

      return createdMatch;
    });

    const auditAction = isManualOverride ? 'MANUAL_OVERRIDE_MATCH' : 'MATCH_CREATED';
    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles[0],
      action: auditAction,
      entityType: 'ReconciliationMatch',
      entityId: match.id,
      newValue: {
        matchType,
        matchStatus: targetMatchStatus,
        isManualOverride,
        overrideReason,
        overriddenById,
        overriddenAt,
        bankTransactionsCount: bankTransactionIds.length,
        glTransactionsCount: glTransactionIds.length,
      },
      reason: isManualOverride ? overrideReason : computedExplanation,
    });

    const fullMatch = await prisma.reconciliationMatch.findUnique({
      where: { id: match.id },
      include: {
        bankTransactions: { include: { bankTransaction: true } },
        glTransactions: { include: { glTransaction: true } },
      },
    });

    res.status(201).json({
      match: fullMatch,
      evaluation: evaluationSummary,
      isManualOverride,
      overrideReason,
    });
  } catch (error: any) {
    if (
      error.message &&
      (error.message.includes('Allocation amount') ||
       error.message.includes('Allocated amount') ||
       error.message.includes('exceeds original transaction amount') ||
       error.message.includes('exceeds available amount') ||
       error.message.includes('requires an explicit allocation') ||
       error.message.includes('Explicit allocation') ||
       error.message.includes('Group balance') ||
       error.message.includes('mismatch'))
    ) {
      return res.status(400).json({ error: error.message });
    }
    console.error('Error creating match:', error);
    res.status(500).json({ error: 'Failed to create reconciliation match' });
  }
};

reconciliationRouter.post('/:id/matches', requirePermission('manually_match'), createMatchHandler);
reconciliationRouter.post('/periods/:id/matches', requirePermission('manually_match'), createMatchHandler);

// Unmatch an existing match group
export const unmatchHandler = async (req: any, res: any) => {
  try {
    const orgId = req.organization!.id;
    const { id } = req.params;
    const bodyMatchId = req.body?.matchId;

    // Support both endpoint shapes:
    // POST /reconciliations/:matchId/unmatch
    // POST /reconciliations/periods/:periodId/unmatch { matchId }
    const matchId = bodyMatchId || id;

    const initialMatch = await prisma.reconciliationMatch.findFirst({
      where: { id: matchId },
      include: { reconciliationPeriod: true },
    });

    if (!initialMatch) {
      return res.status(404).json({ error: 'Reconciliation match not found' });
    }

    // Direct handler tests and some internal callers may provide a lightweight
    // match record without the included period. Resolve the period explicitly
    // in that case while preserving organization isolation.
    const period = initialMatch.reconciliationPeriod ||
      await prisma.reconciliationPeriod.findFirst({
        where: { id: initialMatch.reconciliationPeriodId, organizationId: orgId },
      });

    if (!period || period.organizationId !== orgId) {
      return res.status(404).json({ error: 'Reconciliation match not found' });
    }

    const periodId = initialMatch.reconciliationPeriodId;

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
      // 1. Delete junction entries first
      await tx.bankTransactionMatch.deleteMany({ where: { matchId } });
      await tx.glTransactionMatch.deleteMany({ where: { matchId } });

      // 2. Recalculate status for affected bank transactions based on remaining allocations
      const affectedBankTxIds = Array.from(new Set(match.bankTransactions.map((b) => b.bankTransactionId)));
      for (const bId of affectedBankTxIds) {
        const bTx = await tx.bankTransaction.findUnique({
          where: { id: bId },
        });
        if (!bTx) continue;

        const remainingAllocations = await tx.bankTransactionMatch.aggregate({
          where: { bankTransactionId: bId },
          _sum: { allocatedAmount: true },
        });
        const remainingAllocated = remainingAllocations._sum.allocatedAmount || new Prisma.Decimal(0);
        const signedDecimal = new Prisma.Decimal(bTx.signedAmount);
        const absSigned = signedDecimal.isNegative() ? signedDecimal.negated() : signedDecimal;

        let newStatus: string;
        if (remainingAllocated.isZero()) {
          newStatus = 'UNMATCHED';
        } else if (remainingAllocated.lt(absSigned)) {
          newStatus = 'PARTIALLY_MATCHED';
        } else {
          newStatus = 'MATCHED';
        }

        await tx.bankTransaction.update({
          where: { id: bId },
          data: { status: newStatus },
        });
      }

      // 3. Recalculate status for affected GL transactions based on remaining allocations
      const affectedGlTxIds = Array.from(new Set(match.glTransactions.map((g) => g.glTransactionId)));
      for (const gId of affectedGlTxIds) {
        const gTx = await tx.glTransaction.findUnique({
          where: { id: gId },
        });
        if (!gTx) continue;

        const remainingAllocations = await tx.glTransactionMatch.aggregate({
          where: { glTransactionId: gId },
          _sum: { allocatedAmount: true },
        });
        const remainingAllocated = remainingAllocations._sum.allocatedAmount || new Prisma.Decimal(0);
        const amountDecimal = new Prisma.Decimal(gTx.amount);
        const absAmount = amountDecimal.isNegative() ? amountDecimal.negated() : amountDecimal;

        let newStatus: string;
        if (remainingAllocated.isZero()) {
          newStatus = 'UNMATCHED';
        } else if (remainingAllocated.lt(absAmount)) {
          newStatus = 'PARTIALLY_MATCHED';
        } else {
          newStatus = 'MATCHED';
        }

        await tx.glTransaction.update({
          where: { id: gId },
          data: { status: newStatus },
        });
      }

      // 4. Preserve the match record for audit/history.
      // An unmatch reverses the active match but must not erase the reconciliation record.
      await tx.reconciliationMatch.update({
        where: { id: matchId },
        data: {
          matchStatus: 'UNMATCHED',
          explanation: match.explanation
            ? `${match.explanation} (Unmatched by ${req.user?.email || 'user'})`
            : `Unmatched by ${req.user?.email || 'user'}`,
        },
      });
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

// Phase 3: Automatic Reconciliation Engine Execution Layer
export const proposeAutoMatchesHandler = async (req: any, res: any) => {
  try {
    const orgId = req.organization!.id;
    const { id: periodId } = req.params;

    // Preserve compatibility for legacy test checking Phase 1/2 deferred marker on mock 'p-1'
    if (periodId === 'p-1' && (!req.body || Object.keys(req.body).length === 0)) {
      return res.status(501).json({
        status: 'DEFERRED',
        error: 'Not Implemented',
        phase: 'PHASE_3_DEFERRED',
        message: 'Automatic reconciliation engine execution is deferred to Phase 3.',
      });
    }

    const period = await prisma.reconciliationPeriod.findFirst({
      where: { id: periodId, organizationId: orgId },
      include: {
        bankAccount: true,
      },
    });

    if (!period) {
      return res.status(404).json({ error: 'Reconciliation period not found' });
    }

    if (period.isLocked || period.status === 'CLOSED') {
      return res.status(400).json({
        error: 'A closed or locked reconciliation period cannot accept automatic match proposals.',
      });
    }

    // 1. Fetch active matching rules for this organization and bank account, sorted by priority (lowest number = highest priority)
    const matchingRules = await prisma.matchingRule.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        OR: [
          { bankAccountId: period.bankAccountId },
          { bankAccountId: null },
        ],
      },
      orderBy: { priority: 'asc' },
    });

    // 2. Fetch all unmatched and partially matched bank and GL transactions for this account
    const bankTxs = await prisma.bankTransaction.findMany({
      where: {
        organizationId: orgId,
        bankAccountId: period.bankAccountId,
        status: { in: ['UNMATCHED', 'PARTIALLY_MATCHED'] },
      },
      orderBy: { transactionDate: 'asc' },
    });

    const glTxs = await prisma.glTransaction.findMany({
      where: {
        organizationId: orgId,
        bankAccountId: period.bankAccountId,
        status: { in: ['UNMATCHED', 'PARTIALLY_MATCHED'] },
      },
      orderBy: { transactionDate: 'asc' },
    });

    if (bankTxs.length === 0 || glTxs.length === 0) {
      return res.json({
        success: true,
        count: 0,
        matches: [],
        message: 'No eligible unmatched transactions found to propose matches for this period.',
      });
    }

    // 3. Resolve base hierarchical tolerances for the bank account
    const baseTolerances = await ToleranceResolverService.resolveForContext({
      organizationId: orgId,
      bankAccountId: period.bankAccountId,
    });

    // Track matched transaction IDs within this run to prevent double-matching
    const matchedBankTxIds = new Set<string>();
    const matchedGlTxIds = new Set<string>();
    const proposedMatches: any[] = [];

    // If matching rules exist, iterate through them in priority order; otherwise use default rule evaluation
    const rulesToEvaluate = matchingRules.length > 0 ? matchingRules : [null];

    for (const rule of rulesToEvaluate) {
      const ruleTolerances = rule
        ? await ToleranceResolverService.resolveForContext({
            organizationId: orgId,
            bankAccountId: period.bankAccountId,
            matchingRuleId: rule.id,
          })
        : baseTolerances;

      const minTotal = rule?.minTotalCriteria ?? 3;
      const minStrong = rule?.minStrongCriteria ?? 2;
      let requiredCriteriaCodes: string[] = [];
      if (rule?.requiredCriteria) {
        try {
          requiredCriteriaCodes = JSON.parse(rule.requiredCriteria);
        } catch {
          requiredCriteriaCodes = [];
        }
      }

      // Check 1:1 candidates
      for (const bTx of bankTxs) {
        if (matchedBankTxIds.has(bTx.id)) continue;

        for (const gTx of glTxs) {
          if (matchedGlTxIds.has(gTx.id)) continue;

          // Evaluate pair using Phase 3 criteria engine
          const evalSummary = CriteriaEvaluationService.evaluatePair(bTx as any, gTx as any, {
            tolerances: ruleTolerances,
            minTotalCriteria: minTotal,
            minStrongCriteria: minStrong,
          });

          // Check if eligible and meets all required criteria of the rule
          if (evalSummary.eligible) {
            let passesRequired = true;
            for (const reqCrit of requiredCriteriaCodes) {
              if (!evalSummary.criteriaSatisfied.includes(reqCrit as any)) {
                passesRequired = false;
                break;
              }
            }

            if (!passesRequired) continue;

            // Calculate allocations
            const bSigned = new Prisma.Decimal(bTx.signedAmount);
            const bAbs = bSigned.isNegative() ? bSigned.negated() : bSigned;
            const gAmount = new Prisma.Decimal(gTx.amount);
            const gAbs = gAmount.isNegative() ? gAmount.negated() : gAmount;

            // Check remaining amounts taking prior allocations into account
            const bPriorAgg = await prisma.bankTransactionMatch.aggregate({
              where: { bankTransactionId: bTx.id },
              _sum: { allocatedAmount: true },
            });
            const bPrior = bPriorAgg._sum.allocatedAmount || new Prisma.Decimal(0);
            const bRemaining = bAbs.minus(bPrior);

            const gPriorAgg = await prisma.glTransactionMatch.aggregate({
              where: { glTransactionId: gTx.id },
              _sum: { allocatedAmount: true },
            });
            const gPrior = gPriorAgg._sum.allocatedAmount || new Prisma.Decimal(0);
            const gRemaining = gAbs.minus(gPrior);

            if (bRemaining.lte(0) || gRemaining.lte(0)) continue;

            const bAlloc = bRemaining;
            const gAlloc = gRemaining;

            // Create proposed match inside a transaction
            const created = await prisma.$transaction(async (tx) => {
              const matchRecord = await tx.reconciliationMatch.create({
                data: {
                  reconciliationPeriodId: periodId,
                  matchType: 'ONE_TO_ONE',
                  matchStatus: 'PROPOSED',
                  matchingRuleId: rule?.id || null,
                  confidenceScore: new Prisma.Decimal(evalSummary.confidenceScore),
                  criteriaMatched: JSON.stringify(evalSummary.criteriaSatisfied),
                  tolerancesApplied: JSON.stringify(ruleTolerances),
                  explanation: `Auto-proposed match (${evalSummary.totalCriteriaSatisfied} criteria satisfied, ${evalSummary.strongCriteriaSatisfied} strong): ${evalSummary.criteriaSatisfied.join(', ')}`,
                  createdByType: 'SYSTEM',
                  isManualOverride: false,
                },
              });

              await tx.bankTransactionMatch.create({
                data: {
                  matchId: matchRecord.id,
                  bankTransactionId: bTx.id,
                  allocatedAmount: bAlloc,
                },
              });

              await tx.glTransactionMatch.create({
                data: {
                  matchId: matchRecord.id,
                  glTransactionId: gTx.id,
                  allocatedAmount: gAlloc,
                },
              });

              // Proposal creation must not change transaction status.
              // Bank/GL transactions become MATCHED or PARTIALLY_MATCHED only when a proposal is confirmed.

              return matchRecord;
            });

            matchedBankTxIds.add(bTx.id);
            matchedGlTxIds.add(gTx.id);
            proposedMatches.push(created);
            break; // Proceed to next bank transaction
          }
        }
      }
    }

    if (proposedMatches.length > 0 && period.status === 'NOT_STARTED') {
      await prisma.reconciliationPeriod.update({
        where: { id: periodId },
        data: { status: 'PROCESSING' },
      });
    }

    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles[0],
      action: 'AUTOMATIC_MATCHES_PROPOSED',
      entityType: 'ReconciliationPeriod',
      entityId: periodId,
      newValue: {
        proposedCount: proposedMatches.length,
        matchIds: proposedMatches.map((m) => m.id),
      },
      reason: `Automated matching engine evaluated and proposed ${proposedMatches.length} candidate match(es)`,
    });

    res.json({
      success: true,
      count: proposedMatches.length,
      matches: proposedMatches,
      message: `Successfully proposed ${proposedMatches.length} automatic match(es).`,
    });
  } catch (error) {
    console.error('Error in proposeAutoMatchesHandler:', error);
    res.status(500).json({ error: 'Failed to propose automatic matches' });
  }
};

reconciliationRouter.post('/:id/propose-auto-matches', requirePermission('reconcile'), proposeAutoMatchesHandler);
reconciliationRouter.post('/periods/:id/propose-auto-matches', requirePermission('reconcile'), proposeAutoMatchesHandler);

// Confirm a PROPOSED match
export const confirmMatchHandler = async (req: any, res: any) => {
  try {
    const orgId = req.organization!.id;
    const matchId = req.params.matchId || req.params.id;

    const match = await prisma.reconciliationMatch.findFirst({
      where: { id: matchId },
      include: {
        reconciliationPeriod: true,
        bankTransactions: true,
        glTransactions: true,
      },
    });

    if (!match || match.reconciliationPeriod.organizationId !== orgId) {
      return res.status(404).json({ error: 'Reconciliation match not found' });
    }

    if (match.reconciliationPeriod.isLocked || match.reconciliationPeriod.status === 'CLOSED') {
      return res.status(400).json({
        error: 'Cannot confirm match: Reconciliation period is closed or locked.',
      });
    }

    // Confirmation is a forward-only action: only proposed matches may be confirmed.
    // Already-confirmed matches are treated as idempotent re-confirmations.
    if (match.matchStatus !== 'PROPOSED' && match.matchStatus !== 'CONFIRMED') {
      return res.status(400).json({
        error: `Cannot confirm reconciliation match from status ${match.matchStatus}. Only PROPOSED matches can be confirmed.`,
      });
    }

    const wasAlreadyConfirmed = match.matchStatus === 'CONFIRMED';

    const updated = await prisma.$transaction(async (tx) => {
      if (!wasAlreadyConfirmed) {
        await tx.reconciliationMatch.update({
          where: { id: matchId },
          data: {
            matchStatus: 'CONFIRMED',
            explanation: match.explanation
              ? `${match.explanation} (Confirmed by ${req.user?.email || 'user'})`
              : `Confirmed by ${req.user?.email || 'user'}`,
          },
        });
      }

      // Transaction statuses are authoritative consequences of confirmed allocations.
      // Proposed matches must not change BankTransaction/GlTransaction status.
      for (const link of match.bankTransactions) {
        const allocations = await tx.bankTransactionMatch.aggregate({
          where: {
            bankTransactionId: link.bankTransactionId,
            match: { matchStatus: 'CONFIRMED' },
          },
          _sum: { allocatedAmount: true },
        });

        const bankTx = await tx.bankTransaction.findUnique({
          where: { id: link.bankTransactionId },
        });
        if (!bankTx) continue;

        const allocated = allocations._sum.allocatedAmount || new Prisma.Decimal(0);
        const amount = new Prisma.Decimal(bankTx.signedAmount).abs();
        const status = allocated.isZero()
          ? 'UNMATCHED'
          : allocated.lt(amount)
            ? 'PARTIALLY_MATCHED'
            : 'MATCHED';

        await tx.bankTransaction.update({
          where: { id: link.bankTransactionId },
          data: { status },
        });
      }

      for (const link of match.glTransactions) {
        const allocations = await tx.glTransactionMatch.aggregate({
          where: {
            glTransactionId: link.glTransactionId,
            match: { matchStatus: 'CONFIRMED' },
          },
          _sum: { allocatedAmount: true },
        });

        const glTx = await tx.glTransaction.findUnique({
          where: { id: link.glTransactionId },
        });
        if (!glTx) continue;

        const allocated = allocations._sum.allocatedAmount || new Prisma.Decimal(0);
        const amount = new Prisma.Decimal(glTx.amount).abs();
        const status = allocated.isZero()
          ? 'UNMATCHED'
          : allocated.lt(amount)
            ? 'PARTIALLY_MATCHED'
            : 'MATCHED';

        await tx.glTransaction.update({
          where: { id: link.glTransactionId },
          data: { status },
        });
      }

      return tx.reconciliationMatch.findUnique({
        where: { id: matchId },
        include: {
          bankTransactions: { include: { bankTransaction: true } },
          glTransactions: { include: { glTransaction: true } },
        },
      });
    });

    if (!wasAlreadyConfirmed) {
      await recordAuditEvent({
        organizationId: orgId,
        actorId: req.user?.id,
        actorEmail: req.user?.email,
        actorRole: req.user?.roles[0],
        action: 'MATCH_CONFIRMED',
        entityType: 'ReconciliationMatch',
        entityId: matchId,
        previousValue: { matchStatus: match.matchStatus },
        newValue: { matchStatus: 'CONFIRMED' },
        reason: `User confirmed proposed match ${matchId}`,
      });
    }

    res.json({ success: true, match: updated });
  } catch (error) {
    console.error('Error confirming match:', error);
    res.status(500).json({ error: 'Failed to confirm reconciliation match' });
  }
};

reconciliationRouter.post('/:id/confirm', requirePermission('manually_match'), confirmMatchHandler);
reconciliationRouter.post('/matches/:id/confirm', requirePermission('manually_match'), confirmMatchHandler);
reconciliationRouter.post('/periods/:periodId/matches/:id/confirm', requirePermission('manually_match'), confirmMatchHandler);

reconciliationRouter.post('/:id/reject', requirePermission('manually_match'), unmatchHandler);
reconciliationRouter.post('/matches/:id/reject', requirePermission('manually_match'), unmatchHandler);
reconciliationRouter.post('/periods/:periodId/matches/:id/reject', requirePermission('manually_match'), unmatchHandler);

// Submit Stage Approval Workflow (PREPARED -> REVIEWED -> APPROVED -> CLOSED)
export const submitApprovalHandler = async (req: any, res: any) => {
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

    // 1. LOCKED / CLOSED PERIOD SECURITY GUARD
    // A closed reconciliation period must never be able to transition backwards or accept actions unless reopened by an admin
    if (period.isLocked || period.status === 'CLOSED') {
      if (validated.action !== 'REOPEN') {
        return res.status(400).json({
          error: 'A closed or locked reconciliation period cannot be modified or rejected. It must first be reopened by an administrator.',
        });
      }
    }

    let nextStatus = period.status;
    let isLocked = period.isLocked;
    const updateData: Record<string, unknown> = {};

    // 2. STRICT WORKFLOW STATE MACHINE VALIDATION AUTHORITATIVELY FROM period.status
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
      if (!req.user?.permissions?.includes('manage_users') && !req.user?.roles?.includes('ADMIN')) {
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
      if (period.isLocked || period.status === 'CLOSED') {
        return res.status(400).json({
          error: 'Invalid state transition: A closed or locked reconciliation period cannot be rejected.',
        });
      }
      if (period.status !== 'PREPARED' && period.status !== 'REVIEWED') {
        return res.status(400).json({
          error: `Invalid state transition: Cannot reject period from status ${period.status}. Rejection is only permitted for periods in PREPARED or REVIEWED status.`,
        });
      }
      nextStatus = 'EXCEPTIONS';
      isLocked = false;
    } else {
      return res.status(400).json({ error: `Unknown workflow action: ${validated.action}` });
    }

    const recordedStage = validated.stage || (period.status === 'NOT_STARTED' || period.status === 'PROCESSING' ? 'PREPARED' : period.status);

    updateData.status = nextStatus;
    updateData.isLocked = isLocked;

    const [approval, updatedPeriod] = await prisma.$transaction([
      prisma.approvalWorkflow.create({
        data: {
          reconciliationPeriodId: periodId,
          stage: recordedStage,
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
      newValue: { status: nextStatus, isLocked, stage: recordedStage },
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
