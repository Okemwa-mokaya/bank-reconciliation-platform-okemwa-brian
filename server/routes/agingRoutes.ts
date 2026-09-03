import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission } from '../middleware/rbac';
import { CreateAgingBucketSchema } from '../validators/schemas';
import { recordAuditEvent } from '../services/auditService';
import { Prisma } from '@prisma/client';

export const agingRouter = Router();

// Get Aging Buckets Configuration
agingRouter.get('/buckets', requirePermission('view_dashboard'), async (req, res) => {
  try {
    const orgId = req.organization!.id;

    // Fetch org-specific buckets or system defaults
    const buckets = await prisma.agingBucketConfig.findMany({
      where: {
        OR: [{ organizationId: orgId }, { organizationId: null }],
      },
      orderBy: { displayOrder: 'asc' },
    });

    res.json({ buckets });
  } catch (error) {
    console.error('Error fetching aging buckets:', error);
    res.status(500).json({ error: 'Failed to fetch aging bucket configurations' });
  }
});

// Configure Custom Aging Bucket
agingRouter.post('/buckets', requirePermission('configure_rules'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const validated = CreateAgingBucketSchema.parse(req.body);

    const bucket = await prisma.agingBucketConfig.create({
      data: {
        organizationId: orgId,
        name: validated.name,
        minDays: validated.minDays,
        maxDays: validated.maxDays || null,
        displayOrder: validated.displayOrder,
        isSystemDefault: false,
      },
    });

    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles[0],
      action: 'AGING_BUCKET_CONFIGURED',
      entityType: 'AgingBucketConfig',
      entityId: bucket.id,
      newValue: bucket,
      reason: 'Custom aging bucket created for organization',
    });

    res.status(201).json({ bucket });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating aging bucket:', error);
    res.status(500).json({ error: 'Failed to create aging bucket' });
  }
});

// Real Outstanding Aging Analysis (Queries real database unmatched transactions)
agingRouter.get('/analysis', requirePermission('view_dashboard'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const { bankAccountId } = req.query;

    const buckets = await prisma.agingBucketConfig.findMany({
      where: {
        OR: [{ organizationId: orgId }, { organizationId: null }],
      },
      orderBy: { displayOrder: 'asc' },
    });

    const whereBank: Record<string, unknown> = {
      organizationId: orgId,
      status: 'UNMATCHED',
    };
    const whereGL: Record<string, unknown> = {
      organizationId: orgId,
      status: 'UNMATCHED',
    };

    if (bankAccountId && typeof bankAccountId === 'string') {
      whereBank.bankAccountId = bankAccountId;
      whereGL.bankAccountId = bankAccountId;
    }

    const [unmatchedBankTx, unmatchedGLTx] = await Promise.all([
      prisma.bankTransaction.findMany({ where: whereBank }),
      prisma.glTransaction.findMany({ where: whereGL }),
    ]);

    const now = Date.now();

    const bucketResults = buckets.map((bucket) => {
      let bankCount = 0;
      let bankTotalValue = new Prisma.Decimal(0);
      let glCount = 0;
      let glTotalValue = new Prisma.Decimal(0);

      for (const tx of unmatchedBankTx) {
        const diffDays = Math.floor((now - new Date(tx.transactionDate).getTime()) / (1000 * 60 * 60 * 24));
        const inBucket =
          diffDays >= bucket.minDays && (bucket.maxDays === null || diffDays <= bucket.maxDays);

        if (inBucket) {
          bankCount++;
          const absVal = tx.signedAmount.isNegative() ? tx.signedAmount.negated() : tx.signedAmount;
          bankTotalValue = bankTotalValue.plus(absVal);
        }
      }

      for (const tx of unmatchedGLTx) {
        const diffDays = Math.floor((now - new Date(tx.transactionDate).getTime()) / (1000 * 60 * 60 * 24));
        const inBucket =
          diffDays >= bucket.minDays && (bucket.maxDays === null || diffDays <= bucket.maxDays);

        if (inBucket) {
          glCount++;
          const absVal = tx.amount.isNegative() ? tx.amount.negated() : tx.amount;
          glTotalValue = glTotalValue.plus(absVal);
        }
      }

      const combinedVal = bankTotalValue.plus(glTotalValue);

      return {
        bucketId: bucket.id,
        name: bucket.name,
        minDays: bucket.minDays,
        maxDays: bucket.maxDays,
        displayOrder: bucket.displayOrder,
        bankTransactions: {
          count: bankCount,
          totalValue: bankTotalValue.toString(),
        },
        glTransactions: {
          count: glCount,
          totalValue: glTotalValue.toString(),
        },
        combinedOutstandingValue: combinedVal.toString(),
      };
    });

    const totalOutstandingBankValue = unmatchedBankTx.reduce(
      (sum, tx) => sum.plus(tx.signedAmount.isNegative() ? tx.signedAmount.negated() : tx.signedAmount),
      new Prisma.Decimal(0)
    );
    const totalOutstandingGLValue = unmatchedGLTx.reduce(
      (sum, tx) => sum.plus(tx.amount.isNegative() ? tx.amount.negated() : tx.amount),
      new Prisma.Decimal(0)
    );

    res.json({
      buckets: bucketResults,
      summary: {
        totalUnmatchedBankTx: unmatchedBankTx.length,
        totalUnmatchedGLTx: unmatchedGLTx.length,
        totalOutstandingBankValue: totalOutstandingBankValue.toString(),
        totalOutstandingGLValue: totalOutstandingGLValue.toString(),
      },
    });
  } catch (error) {
    console.error('Error running aging analysis:', error);
    res.status(500).json({ error: 'Failed to run aging analysis' });
  }
});
