import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission } from '../middleware/rbac';
import { CreateAgingBucketSchema } from '../validators/schemas';
import { recordAuditEvent } from '../services/auditService';
import { Prisma } from '@prisma/client';

export const agingRouter = Router();

agingRouter.get('/buckets', requirePermission('view_dashboard'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const buckets = await prisma.agingBucketConfig.findMany({ where: { OR: [{ organizationId: orgId }, { organizationId: null }] }, orderBy: { displayOrder: 'asc' } });
    res.json({ buckets });
  } catch (error) {
    console.error('Error fetching aging buckets:', error);
    res.status(500).json({ error: 'Failed to fetch aging bucket configurations' });
  }
});

agingRouter.post('/buckets', requirePermission('configure_rules'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const validated = CreateAgingBucketSchema.parse(req.body);
    const bucket = await prisma.agingBucketConfig.create({ data: { organizationId: orgId, name: validated.name, minDays: validated.minDays, maxDays: validated.maxDays || null, displayOrder: validated.displayOrder, isSystemDefault: false } });
    await recordAuditEvent({ organizationId: orgId, actorId: req.user?.id, actorEmail: req.user?.email, actorRole: req.user?.roles[0], action: 'AGING_BUCKET_CONFIGURED', entityType: 'AgingBucketConfig', entityId: bucket.id, newValue: bucket, reason: 'Custom aging bucket created for organization' });
    res.status(201).json({ bucket });
  } catch (error: any) {
    if (error.name === 'ZodError') return res.status(400).json({ error: 'Validation error', details: error.errors });
    console.error('Error creating aging bucket:', error);
    res.status(500).json({ error: 'Failed to create aging bucket' });
  }
});

// Outstanding aging includes both fully unmatched and partially matched items.
// A partially matched transaction still represents unresolved reconciliation exposure.
agingRouter.get('/analysis', requirePermission('view_dashboard'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const { bankAccountId } = req.query;
    const buckets = await prisma.agingBucketConfig.findMany({ where: { OR: [{ organizationId: orgId }, { organizationId: null }] }, orderBy: { displayOrder: 'asc' } });

    const whereBank: Record<string, unknown> = { organizationId: orgId, status: { in: ['UNMATCHED', 'PARTIALLY_MATCHED'] } };
    const whereGL: Record<string, unknown> = { organizationId: orgId, status: { in: ['UNMATCHED', 'PARTIALLY_MATCHED'] } };
    if (bankAccountId && typeof bankAccountId === 'string') {
      whereBank.bankAccountId = bankAccountId;
      whereGL.bankAccountId = bankAccountId;
    }

    const [outstandingBankTx, outstandingGLTx] = await Promise.all([
      prisma.bankTransaction.findMany({ where: whereBank }),
      prisma.glTransaction.findMany({ where: whereGL }),
    ]);
    const now = Date.now();

    const bucketResults = buckets.map((bucket) => {
      let bankCount = 0;
      let bankTotalValue = new Prisma.Decimal(0);
      let glCount = 0;
      let glTotalValue = new Prisma.Decimal(0);
      for (const tx of outstandingBankTx) {
        const diffDays = Math.max(0, Math.floor((now - new Date(tx.transactionDate).getTime()) / 86400000));
        if (diffDays >= bucket.minDays && (bucket.maxDays === null || diffDays <= bucket.maxDays)) {
          bankCount++;
          const absVal = tx.signedAmount.isNegative() ? tx.signedAmount.negated() : tx.signedAmount;
          bankTotalValue = bankTotalValue.plus(absVal);
        }
      }
      for (const tx of outstandingGLTx) {
        const diffDays = Math.max(0, Math.floor((now - new Date(tx.transactionDate).getTime()) / 86400000));
        if (diffDays >= bucket.minDays && (bucket.maxDays === null || diffDays <= bucket.maxDays)) {
          glCount++;
          const absVal = tx.amount.isNegative() ? tx.amount.negated() : tx.amount;
          glTotalValue = glTotalValue.plus(absVal);
        }
      }
      return {
        bucketId: bucket.id,
        name: bucket.name,
        minDays: bucket.minDays,
        maxDays: bucket.maxDays,
        displayOrder: bucket.displayOrder,
        bankTransactions: { count: bankCount, totalValue: bankTotalValue.toString() },
        glTransactions: { count: glCount, totalValue: glTotalValue.toString() },
        combinedOutstandingValue: bankTotalValue.plus(glTotalValue).toString(),
      };
    });

    const totalOutstandingBankValue = outstandingBankTx.reduce((sum, tx) => sum.plus(tx.signedAmount.isNegative() ? tx.signedAmount.negated() : tx.signedAmount), new Prisma.Decimal(0));
    const totalOutstandingGLValue = outstandingGLTx.reduce((sum, tx) => sum.plus(tx.amount.isNegative() ? tx.amount.negated() : tx.amount), new Prisma.Decimal(0));
    res.json({ buckets: bucketResults, summary: { totalOutstandingBankTx: outstandingBankTx.length, totalOutstandingGLTx: outstandingGLTx.length, totalUnmatchedBankTx: outstandingBankTx.filter((x) => x.status === 'UNMATCHED').length, totalUnmatchedGLTx: outstandingGLTx.filter((x) => x.status === 'UNMATCHED').length, totalPartiallyMatchedBankTx: outstandingBankTx.filter((x) => x.status === 'PARTIALLY_MATCHED').length, totalPartiallyMatchedGLTx: outstandingGLTx.filter((x) => x.status === 'PARTIALLY_MATCHED').length, totalOutstandingBankValue: totalOutstandingBankValue.toString(), totalOutstandingGLValue: totalOutstandingGLValue.toString() } });
  } catch (error) {
    console.error('Error running aging analysis:', error);
    res.status(500).json({ error: 'Failed to run aging analysis' });
  }
});