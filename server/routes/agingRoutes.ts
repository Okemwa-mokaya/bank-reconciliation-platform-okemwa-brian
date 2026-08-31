import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission } from '../middleware/rbac';
import { CreateAgingBucketSchema } from '../validators/schemas';
import { recordAuditEvent } from '../services/auditService';

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
      let bankTotalValue = 0;
      let glCount = 0;
      let glTotalValue = 0;

      for (const tx of unmatchedBankTx) {
        const diffDays = Math.floor((now - new Date(tx.transactionDate).getTime()) / (1000 * 60 * 60 * 24));
        const inBucket =
          diffDays >= bucket.minDays && (bucket.maxDays === null || diffDays <= bucket.maxDays);

        if (inBucket) {
          bankCount++;
          bankTotalValue += Math.abs(Number(tx.signedAmount));
        }
      }

      for (const tx of unmatchedGLTx) {
        const diffDays = Math.floor((now - new Date(tx.transactionDate).getTime()) / (1000 * 60 * 60 * 24));
        const inBucket =
          diffDays >= bucket.minDays && (bucket.maxDays === null || diffDays <= bucket.maxDays);

        if (inBucket) {
          glCount++;
          glTotalValue += Math.abs(Number(tx.amount));
        }
      }

      return {
        bucketId: bucket.id,
        name: bucket.name,
        minDays: bucket.minDays,
        maxDays: bucket.maxDays,
        displayOrder: bucket.displayOrder,
        bankTransactions: {
          count: bankCount,
          totalValue: bankTotalValue,
        },
        glTransactions: {
          count: glCount,
          totalValue: glTotalValue,
        },
        combinedOutstandingValue: bankTotalValue + glTotalValue,
      };
    });

    res.json({
      buckets: bucketResults,
      summary: {
        totalUnmatchedBankTx: unmatchedBankTx.length,
        totalUnmatchedGLTx: unmatchedGLTx.length,
        totalOutstandingBankValue: unmatchedBankTx.reduce((sum, tx) => sum + Math.abs(Number(tx.signedAmount)), 0),
        totalOutstandingGLValue: unmatchedGLTx.reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0),
      },
    });
  } catch (error) {
    console.error('Error running aging analysis:', error);
    res.status(500).json({ error: 'Failed to run aging analysis' });
  }
});
