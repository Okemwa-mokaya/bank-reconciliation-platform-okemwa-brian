import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requirePermission } from '../middleware/rbac';
import { recordAuditEvent } from '../services/auditService';
import { CriteriaEvaluationService } from '../services/matching/criteriaEvaluator';
import { ToleranceResolverService } from '../services/matching/toleranceResolver';

export const automaticReconciliationRouter = Router();

const ACTIVE_MATCH_STATUSES = ['PROPOSED', 'UNDER_REVIEW', 'APPROVED', 'CONFIRMED'];
const MAX_GROUP_SIZE = 3;
const MAX_CANDIDATES_PER_SIDE = 25;

function absDecimal(value: Prisma.Decimal | string | number) {
  const d = new Prisma.Decimal(value);
  return d.isNegative() ? d.negated() : d;
}

function combinations<T>(items: T[], size: number, max = 200): T[][] {
  const result: T[][] = [];
  const walk = (start: number, current: T[]) => {
    if (result.length >= max) return;
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    for (let i = start; i <= items.length - (size - current.length); i++) {
      current.push(items[i]);
      walk(i + 1, current);
      current.pop();
      if (result.length >= max) return;
    }
  };
  walk(0, []);
  return result;
}

function inDateWindow(date: Date, start: Date, end: Date, toleranceDays: number) {
  const lower = new Date(start.getTime() - toleranceDays * 86400000);
  const upper = new Date(end.getTime() + toleranceDays * 86400000);
  return date >= lower && date <= upper;
}

async function getActiveTransactionIds(periodId: string) {
  const [bank, gl] = await Promise.all([
    prisma.bankTransactionMatch.findMany({
      where: { match: { reconciliationPeriodId: periodId, matchStatus: { in: ACTIVE_MATCH_STATUSES } } },
      select: { bankTransactionId: true },
    }),
    prisma.glTransactionMatch.findMany({
      where: { match: { reconciliationPeriodId: periodId, matchStatus: { in: ACTIVE_MATCH_STATUSES } } },
      select: { glTransactionId: true },
    }),
  ]);
  return {
    bank: new Set(bank.map((x) => x.bankTransactionId)),
    gl: new Set(gl.map((x) => x.glTransactionId)),
  };
}

async function createProposal(params: {
  periodId: string;
  ruleId: string | null;
  matchType: string;
  bankTxs: any[];
  glTxs: any[];
  evaluation: any;
  tolerances: any;
  orgId: string;
  userId?: string;
}) {
  const bankIds = params.bankTxs.map((x) => x.id);
  const glIds = params.glTxs.map((x) => x.id);

  return prisma.$transaction(async (tx) => {
    const [existingBank, existingGl] = await Promise.all([
      tx.bankTransactionMatch.findMany({
        where: {
          bankTransactionId: { in: bankIds },
          match: { reconciliationPeriodId: params.periodId, matchStatus: { in: ACTIVE_MATCH_STATUSES } },
        },
        select: { bankTransactionId: true },
      }),
      tx.glTransactionMatch.findMany({
        where: {
          glTransactionId: { in: glIds },
          match: { reconciliationPeriodId: params.periodId, matchStatus: { in: ACTIVE_MATCH_STATUSES } },
        },
        select: { glTransactionId: true },
      }),
    ]);

    if (existingBank.length || existingGl.length) return null;

    const match = await tx.reconciliationMatch.create({
      data: {
        reconciliationPeriodId: params.periodId,
        matchType: params.matchType,
        matchStatus: 'PROPOSED',
        matchingRuleId: params.ruleId,
        confidenceScore: new Prisma.Decimal(params.evaluation.confidenceScore),
        criteriaMatched: JSON.stringify(params.evaluation.criteriaSatisfied),
        tolerancesApplied: JSON.stringify(params.tolerances),
        explanation: `Automatic proposal: ${params.evaluation.totalCriteriaSatisfied} criteria satisfied (${params.evaluation.strongCriteriaSatisfied} strong): ${params.evaluation.criteriaSatisfied.join(', ')}`,
        createdByType: 'SYSTEM',
        createdById: params.userId || null,
        isManualOverride: false,
      },
    });

    for (const bankTx of params.bankTxs) {
      await tx.bankTransactionMatch.create({
        data: {
          matchId: match.id,
          bankTransactionId: bankTx.id,
          allocatedAmount: absDecimal(bankTx.signedAmount),
        },
      });
    }

    for (const glTx of params.glTxs) {
      await tx.glTransactionMatch.create({
        data: {
          matchId: match.id,
          glTransactionId: glTx.id,
          allocatedAmount: absDecimal(glTx.amount),
        },
      });
    }

    // IMPORTANT: proposals do not change transaction status.
    // Transactions become MATCHED only after explicit confirmation.
    return match;
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 5000,
    timeout: 10000,
  });
}

automaticReconciliationRouter.post('/periods/:id/propose-auto-matches', requirePermission('reconcile'), async (req: any, res) => {
  try {
    const orgId = req.organization!.id;
    const periodId = req.params.id;

    const period = await prisma.reconciliationPeriod.findFirst({
      where: { id: periodId, organizationId: orgId },
      include: { bankAccount: true },
    });
    if (!period) return res.status(404).json({ error: 'Reconciliation period not found' });
    if (period.isLocked || period.status === 'CLOSED') {
      return res.status(403).json({ error: 'Cannot propose matches for a locked or closed reconciliation period' });
    }

    const rules = await prisma.matchingRule.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        OR: [{ bankAccountId: period.bankAccountId }, { bankAccountId: null }],
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: period.periodEnd } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: period.periodStart } }] },
        ],
      },
      orderBy: { priority: 'asc' },
    });

    const tolerances = await ToleranceResolverService.resolveForContext({
      organizationId: orgId,
      bankAccountId: period.bankAccountId,
    });

    const [bankTxs, glTxs] = await Promise.all([
      prisma.bankTransaction.findMany({
        where: {
          organizationId: orgId,
          bankAccountId: period.bankAccountId,
          status: 'UNMATCHED',
          transactionDate: { gte: period.periodStart, lte: period.periodEnd },
        },
        orderBy: { transactionDate: 'asc' },
      }),
      prisma.glTransaction.findMany({
        where: {
          organizationId: orgId,
          bankAccountId: period.bankAccountId,
          status: 'UNMATCHED',
          transactionDate: { gte: period.periodStart, lte: period.periodEnd },
        },
        orderBy: { transactionDate: 'asc' },
      }),
    ]);

    if (!bankTxs.length || !glTxs.length) {
      return res.json({ success: true, count: 0, matches: [], message: 'No eligible unmatched transactions found.' });
    }

    const active = await getActiveTransactionIds(periodId);
    const proposals: any[] = [];
    const usedBank = new Set<string>(active.bank);
    const usedGl = new Set<string>(active.gl);
    const rulesToUse: any[] = rules.length ? rules : [null];

    for (const rule of rulesToUse) {
      const ruleTolerance = rule
        ? await ToleranceResolverService.resolveForContext({ organizationId: orgId, bankAccountId: period.bankAccountId, matchingRuleId: rule.id })
        : tolerances;
      const minTotal = rule?.minTotalCriteria ?? 3;
      const minStrong = rule?.minStrongCriteria ?? 2;
      let required: string[] = [];
      if (rule?.requiredCriteria) {
        try { required = JSON.parse(rule.requiredCriteria); } catch { required = []; }
      }

      // ONE_TO_ONE
      for (const bank of bankTxs) {
        if (usedBank.has(bank.id)) continue;
        const candidates = glTxs.filter((gl) => {
          if (usedGl.has(gl.id)) return false;
          if (bank.currency !== gl.currency) return false;
          if (bank.transactionType && gl.transactionType && bank.transactionType.toUpperCase() !== gl.transactionType.toUpperCase()) return false;
          return inDateWindow(new Date(gl.transactionDate), period.periodStart, period.periodEnd, ruleTolerance.dateToleranceDays);
        }).slice(0, MAX_CANDIDATES_PER_SIDE);

        let matched = false;
        for (const gl of candidates) {
          const evaluation = CriteriaEvaluationService.evaluatePair(bank, gl, {
            tolerances: ruleTolerance,
            minTotalCriteria: minTotal,
            minStrongCriteria: minStrong,
          });
          if (!evaluation.eligible || required.some((c) => !evaluation.criteriaSatisfied.includes(c as any))) continue;
          const created = await createProposal({ periodId, ruleId: rule?.id || null, matchType: 'ONE_TO_ONE', bankTxs: [bank], glTxs: [gl], evaluation, tolerances: ruleTolerance, orgId, userId: req.user?.id });
          if (created) {
            proposals.push(created);
            usedBank.add(bank.id);
            usedGl.add(gl.id);
            matched = true;
            break;
          }
        }
        if (matched) continue;
      }

      // ONE_TO_MANY and MANY_TO_ONE. Candidate groups are deliberately capped to avoid combinatorial explosion.
      for (const bank of bankTxs) {
        if (usedBank.has(bank.id)) continue;
        const candidates = glTxs.filter((gl) => {
          if (usedGl.has(gl.id)) return false;
          if (bank.currency !== gl.currency) return false;
          return inDateWindow(new Date(gl.transactionDate), period.periodStart, period.periodEnd, ruleTolerance.dateToleranceDays);
        }).slice(0, MAX_CANDIDATES_PER_SIDE);

        for (let size = 2; size <= MAX_GROUP_SIZE && !usedBank.has(bank.id); size++) {
          for (const group of combinations(candidates, size, 100)) {
            if (group.some((g) => usedGl.has(g.id))) continue;
            const evaluation = CriteriaEvaluationService.evaluateGroup([bank], group, { tolerances: ruleTolerance, minTotalCriteria: minTotal, minStrongCriteria: minStrong });
            if (!evaluation.eligible || required.some((c) => !evaluation.criteriaSatisfied.includes(c as any))) continue;
            const created = await createProposal({ periodId, ruleId: rule?.id || null, matchType: 'ONE_TO_MANY', bankTxs: [bank], glTxs: group, evaluation, tolerances: ruleTolerance, orgId, userId: req.user?.id });
            if (created) {
              proposals.push(created);
              usedBank.add(bank.id);
              group.forEach((g) => usedGl.add(g.id));
              break;
            }
          }
        }
      }

      for (const gl of glTxs) {
        if (usedGl.has(gl.id)) continue;
        const candidates = bankTxs.filter((bank) => {
          if (usedBank.has(bank.id)) return false;
          if (bank.currency !== gl.currency) return false;
          return inDateWindow(new Date(bank.transactionDate), period.periodStart, period.periodEnd, ruleTolerance.dateToleranceDays);
        }).slice(0, MAX_CANDIDATES_PER_SIDE);

        for (let size = 2; size <= MAX_GROUP_SIZE && !usedGl.has(gl.id); size++) {
          for (const group of combinations(candidates, size, 100)) {
            if (group.some((b) => usedBank.has(b.id))) continue;
            const evaluation = CriteriaEvaluationService.evaluateGroup(group, [gl], { tolerances: ruleTolerance, minTotalCriteria: minTotal, minStrongCriteria: minStrong });
            if (!evaluation.eligible || required.some((c) => !evaluation.criteriaSatisfied.includes(c as any))) continue;
            const created = await createProposal({ periodId, ruleId: rule?.id || null, matchType: 'MANY_TO_ONE', bankTxs: group, glTxs: [gl], evaluation, tolerances: ruleTolerance, orgId, userId: req.user?.id });
            if (created) {
              proposals.push(created);
              group.forEach((b) => usedBank.add(b.id));
              usedGl.add(gl.id);
              break;
            }
          }
        }
      }

      // MANY_TO_MANY: bounded 2x2 and 3x3 search over still-unmatched candidates.
      const remainingBank = bankTxs.filter((b) => !usedBank.has(b.id)).slice(0, MAX_CANDIDATES_PER_SIDE);
      const remainingGl = glTxs.filter((g) => !usedGl.has(g.id)).slice(0, MAX_CANDIDATES_PER_SIDE);
      for (let bs = 2; bs <= MAX_GROUP_SIZE; bs++) {
        for (let gs = 2; gs <= MAX_GROUP_SIZE; gs++) {
          for (const bg of combinations(remainingBank, bs, 80)) {
            if (bg.some((b) => usedBank.has(b.id))) continue;
            for (const gg of combinations(remainingGl, gs, 80)) {
              if (gg.some((g) => usedGl.has(g.id))) continue;
              const currencies = new Set([...bg.map((b) => b.currency), ...gg.map((g) => g.currency)]);
              if (currencies.size !== 1) continue;
              const evaluation = CriteriaEvaluationService.evaluateGroup(bg, gg, { tolerances: ruleTolerance, minTotalCriteria: minTotal, minStrongCriteria: minStrong });
              if (!evaluation.eligible || required.some((c) => !evaluation.criteriaSatisfied.includes(c as any))) continue;
              const created = await createProposal({ periodId, ruleId: rule?.id || null, matchType: 'MANY_TO_MANY', bankTxs: bg, glTxs: gg, evaluation, tolerances: ruleTolerance, orgId, userId: req.user?.id });
              if (created) {
                proposals.push(created);
                bg.forEach((b) => usedBank.add(b.id));
                gg.forEach((g) => usedGl.add(g.id));
              }
            }
          }
        }
      }
    }

    if (proposals.length && period.status === 'NOT_STARTED') {
      await prisma.reconciliationPeriod.update({ where: { id: periodId }, data: { status: 'PROCESSING' } });
    }

    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles?.[0],
      action: 'AUTOMATIC_MATCHES_PROPOSED',
      entityType: 'ReconciliationPeriod',
      entityId: periodId,
      newValue: { proposedCount: proposals.length, matchIds: proposals.map((x) => x.id) },
      reason: `Automatic matching engine proposed ${proposals.length} candidate match(es)`,
    });

    return res.json({ success: true, count: proposals.length, matches: proposals, message: `Successfully proposed ${proposals.length} automatic match(es).` });
  } catch (error: any) {
    console.error('Automatic reconciliation proposal error:', error);
    if (error?.code === 'P2034') return res.status(409).json({ error: 'Concurrent reconciliation update detected. Please retry.' });
    return res.status(500).json({ error: 'Failed to propose automatic matches' });
  }
});

async function getMatchForOrg(matchId: string, orgId: string) {
  return prisma.reconciliationMatch.findFirst({
    where: { id: matchId, reconciliationPeriod: { organizationId: orgId } },
    include: {
      reconciliationPeriod: true,
      bankTransactions: { include: { bankTransaction: true } },
      glTransactions: { include: { glTransaction: true } },
    },
  });
}

async function audit(req: any, orgId: string, action: string, matchId: string, previousValue: any, newValue: any, reason: string) {
  await recordAuditEvent({
    organizationId: orgId,
    actorId: req.user?.id,
    actorEmail: req.user?.email,
    actorRole: req.user?.roles?.[0],
    action,
    entityType: 'ReconciliationMatch',
    entityId: matchId,
    previousValue,
    newValue,
    reason,
  });
}

automaticReconciliationRouter.post('/matches/:id/review', requirePermission('manually_match'), async (req: any, res) => {
  const orgId = req.organization!.id;
  const match = await getMatchForOrg(req.params.id, orgId);
  if (!match) return res.status(404).json({ error: 'Reconciliation match not found' });
  if (match.reconciliationPeriod.isLocked || match.reconciliationPeriod.status === 'CLOSED') return res.status(403).json({ error: 'Reconciliation period is locked or closed' });
  if (match.matchStatus !== 'PROPOSED') return res.status(409).json({ error: `Cannot review match from status ${match.matchStatus}` });
  const updated = await prisma.reconciliationMatch.update({ where: { id: match.id }, data: { matchStatus: 'UNDER_REVIEW' } });
  await audit(req, orgId, 'MATCH_REVIEW_STARTED', match.id, { matchStatus: 'PROPOSED' }, { matchStatus: 'UNDER_REVIEW' }, 'Automatic match proposal moved to review');
  res.json({ success: true, match: updated });
});

automaticReconciliationRouter.post('/matches/:id/approve', requirePermission('manually_match'), async (req: any, res) => {
  const orgId = req.organization!.id;
  const match = await getMatchForOrg(req.params.id, orgId);
  if (!match) return res.status(404).json({ error: 'Reconciliation match not found' });
  if (match.reconciliationPeriod.isLocked || match.reconciliationPeriod.status === 'CLOSED') return res.status(403).json({ error: 'Reconciliation period is locked or closed' });
  if (match.matchStatus !== 'UNDER_REVIEW') return res.status(409).json({ error: `Cannot approve match from status ${match.matchStatus}` });
  const updated = await prisma.reconciliationMatch.update({ where: { id: match.id }, data: { matchStatus: 'APPROVED' } });
  await audit(req, orgId, 'MATCH_APPROVED', match.id, { matchStatus: 'UNDER_REVIEW' }, { matchStatus: 'APPROVED' }, 'Automatic match proposal approved');
  res.json({ success: true, match: updated });
});


automaticReconciliationRouter.post('/matches/:id/reject', requirePermission('manually_match'), async (req: any, res) => {
  const orgId = req.organization!.id;
  const reason = String(req.body?.reason || req.body?.rejectionReason || '').trim();
  if (!reason) return res.status(400).json({ error: 'A rejection reason is required' });
  const match = await getMatchForOrg(req.params.id, orgId);
  if (!match) return res.status(404).json({ error: 'Reconciliation match not found' });
  if (match.reconciliationPeriod.isLocked || match.reconciliationPeriod.status === 'CLOSED') return res.status(403).json({ error: 'Reconciliation period is locked or closed' });
  if (!['PROPOSED', 'UNDER_REVIEW'].includes(match.matchStatus)) return res.status(409).json({ error: `Cannot reject match from status ${match.matchStatus}` });
  const updated = await prisma.reconciliationMatch.update({ where: { id: match.id }, data: { matchStatus: 'REJECTED', explanation: `${match.explanation || ''} [REJECTED: ${reason}]` } });
  await audit(req, orgId, 'MATCH_REJECTED', match.id, { matchStatus: match.matchStatus }, { matchStatus: 'REJECTED', reason }, reason);
  res.json({ success: true, match: updated });
});

automaticReconciliationRouter.post('/matches/:id/reverse', requirePermission('manually_match'), async (req: any, res) => {
  const orgId = req.organization!.id;
  const reason = String(req.body?.reason || req.body?.reversalReason || '').trim();
  if (!reason) return res.status(400).json({ error: 'A reversal reason is required' });
  const match = await getMatchForOrg(req.params.id, orgId);
  if (!match) return res.status(404).json({ error: 'Reconciliation match not found' });
  if (match.reconciliationPeriod.isLocked || match.reconciliationPeriod.status === 'CLOSED') return res.status(403).json({ error: 'Reconciliation period is locked or closed' });
  if (match.matchStatus !== 'CONFIRMED') return res.status(409).json({ error: `Only CONFIRMED matches can be reversed; current status is ${match.matchStatus}` });

  await prisma.$transaction(async (tx) => {
    for (const item of match.bankTransactions) {
      await tx.bankTransaction.update({ where: { id: item.bankTransactionId }, data: { status: 'UNMATCHED' } });
    }
    for (const item of match.glTransactions) {
      await tx.glTransaction.update({ where: { id: item.glTransactionId }, data: { status: 'UNMATCHED' } });
    }
    await tx.reconciliationMatch.update({ where: { id: match.id }, data: { matchStatus: 'REVERSED', explanation: `${match.explanation || ''} [REVERSED: ${reason}]` } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });

  await audit(req, orgId, 'MATCH_REVERSED', match.id, { matchStatus: 'CONFIRMED' }, { matchStatus: 'REVERSED', reason }, reason);
  const updated = await getMatchForOrg(match.id, orgId);
  res.json({ success: true, match: updated });
});
