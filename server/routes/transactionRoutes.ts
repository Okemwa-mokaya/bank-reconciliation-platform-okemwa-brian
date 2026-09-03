import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission } from '../middleware/rbac';
import { recordAuditEvent } from '../services/auditService';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import { CreateBankTransactionSchema, CreateGlTransactionSchema } from '../validators/schemas';

export const transactionRouter = Router();

// List Bank Transactions
transactionRouter.get('/bank', requirePermission('view_transactions'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const { bankAccountId, status, limit = 100, offset = 0 } = req.query;

    const where: Record<string, unknown> = { organizationId: orgId };
    if (bankAccountId && typeof bankAccountId === 'string') {
      where.bankAccountId = bankAccountId;
    }
    if (status && typeof status === 'string') {
      where.status = status;
    }

    const [total, transactions] = await Promise.all([
      prisma.bankTransaction.count({ where }),
      prisma.bankTransaction.findMany({
        where,
        include: {
          bankAccount: { select: { id: true, accountName: true, accountNumber: true, currency: true } },
          statement: { select: { id: true, originalFilename: true } },
          matchItems: {
            include: {
              match: true,
            },
          },
        },
        orderBy: { transactionDate: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
    ]);

    res.json({ total, transactions });
  } catch (error) {
    console.error('Error fetching bank transactions:', error);
    res.status(500).json({ error: 'Failed to fetch bank transactions' });
  }
});

// List GL Transactions
transactionRouter.get('/gl', requirePermission('view_transactions'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const { bankAccountId, status, limit = 100, offset = 0 } = req.query;

    const where: Record<string, unknown> = { organizationId: orgId };
    if (bankAccountId && typeof bankAccountId === 'string') {
      where.bankAccountId = bankAccountId;
    }
    if (status && typeof status === 'string') {
      where.status = status;
    }

    const [total, transactions] = await Promise.all([
      prisma.glTransaction.count({ where }),
      prisma.glTransaction.findMany({
        where,
        include: {
          bankAccount: { select: { id: true, accountName: true, accountNumber: true } },
          matchItems: {
            include: {
              match: true,
            },
          },
        },
        orderBy: { transactionDate: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      }),
    ]);

    res.json({ total, transactions });
  } catch (error) {
    console.error('Error fetching GL transactions:', error);
    res.status(500).json({ error: 'Failed to fetch GL transactions' });
  }
});

// Create Bank Transaction entry (Preserves raw source record intact with Decimal precision)
export const createBankTransactionHandler = async (req: any, res: any) => {
  try {
    const orgId = req.organization!.id;
    const validated = CreateBankTransactionSchema.parse(req.body);

    // Verify bank account ownership
    const account = await prisma.bankAccount.findFirst({
      where: { id: validated.bankAccountId, organizationId: orgId },
    });
    if (!account) {
      return res.status(404).json({ error: 'Bank account not found in organization' });
    }

    if (validated.statementId) {
      const stmt = await prisma.bankStatement.findFirst({
        where: { id: validated.statementId, organizationId: orgId },
      });
      if (!stmt) {
        return res.status(404).json({ error: 'Linked bank statement not found in organization' });
      }
    }

    const debitDecimal = new Prisma.Decimal(validated.debit);
    const creditDecimal = new Prisma.Decimal(validated.credit);
    const calcSignedDecimal = validated.signedAmount !== undefined
      ? new Prisma.Decimal(validated.signedAmount)
      : creditDecimal.minus(debitDecimal);

    // Compute cryptographic fingerprint for deduplication
    const fingerprintStr = `${orgId}-${validated.bankAccountId}-${validated.transactionDate}-${validated.referenceNumber || ''}-${validated.chequeNumber || ''}-${calcSignedDecimal.toString()}-${validated.description}`;
    const transactionFingerprint = crypto.createHash('sha256').update(fingerprintStr).digest('hex');

    // Tenant-scoped duplicate detection & prevention
    const existingDuplicate = await prisma.bankTransaction.findFirst({
      where: { organizationId: orgId, transactionFingerprint },
    });

    if (validated.preventDuplicates || req.query.preventDuplicates === 'true') {
      if (existingDuplicate) {
        return res.status(409).json({
          error: 'Duplicate bank transaction detected within organization',
          isDuplicate: true,
          duplicateOfId: existingDuplicate.id,
          transactionFingerprint,
        });
      }
    }

    const transaction = await prisma.bankTransaction.create({
      data: {
        organizationId: orgId,
        bankAccountId: validated.bankAccountId,
        statementId: validated.statementId || null,
        transactionDate: new Date(validated.transactionDate),
        valueDate: validated.valueDate ? new Date(validated.valueDate) : null,
        description: validated.description,
        narration: validated.narration || null,
        referenceNumber: validated.referenceNumber || null,
        chequeNumber: validated.chequeNumber || null,
        accountNumber: validated.accountNumber || null,
        transactionType: validated.transactionType,
        currency: validated.currency,
        debit: debitDecimal,
        credit: creditDecimal,
        signedAmount: calcSignedDecimal,
        balance: validated.balance !== undefined && validated.balance !== null ? new Prisma.Decimal(validated.balance) : null,
        originalImportedData: JSON.stringify(validated.rawSourceData || {
          description: validated.description,
          debit: validated.debit,
          credit: validated.credit,
          transactionDate: validated.transactionDate,
        }),
        normalizedData: JSON.stringify({
          description: validated.description.trim().toUpperCase(),
          referenceNumber: validated.referenceNumber,
        }),
        transactionFingerprint,
        status: 'UNMATCHED',
      },
    });

    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles[0],
      action: 'BANK_TRANSACTION_CREATED',
      entityType: 'BankTransaction',
      entityId: transaction.id,
      newValue: { id: transaction.id, description: validated.description, amount: calcSignedDecimal.toString() },
      reason: 'Bank transaction record created',
    });

    res.status(201).json({
      transaction,
      isDuplicate: !!existingDuplicate,
      duplicateOfId: existingDuplicate ? existingDuplicate.id : null,
      transactionFingerprint,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating bank transaction:', error);
    res.status(500).json({ error: 'Failed to create bank transaction' });
  }
};

transactionRouter.post('/bank', requirePermission('upload_statement'), createBankTransactionHandler);

// Create GL Transaction entry
export const createGlTransactionHandler = async (req: any, res: any) => {
  try {
    const orgId = req.organization!.id;
    const validated = CreateGlTransactionSchema.parse(req.body);

    if (validated.bankAccountId) {
      const account = await prisma.bankAccount.findFirst({
        where: { id: validated.bankAccountId, organizationId: orgId },
      });
      if (!account) {
        return res.status(404).json({ error: 'Linked bank account not found in organization' });
      }
    }

    const debitDecimal = new Prisma.Decimal(validated.debit);
    const creditDecimal = new Prisma.Decimal(validated.credit);
    const calcAmountDecimal = validated.amount !== undefined
      ? new Prisma.Decimal(validated.amount)
      : debitDecimal.minus(creditDecimal);

    const fingerprintStr = `${orgId}-${validated.bankAccountId || 'global'}-${validated.transactionDate}-${validated.journalNumber || ''}-${validated.referenceNumber || ''}-${calcAmountDecimal.toString()}-${validated.narration}`;
    const transactionFingerprint = crypto.createHash('sha256').update(fingerprintStr).digest('hex');

    // Tenant-scoped duplicate detection & prevention
    const existingDuplicate = await prisma.glTransaction.findFirst({
      where: { organizationId: orgId, transactionFingerprint },
    });

    if (validated.preventDuplicates || req.query.preventDuplicates === 'true') {
      if (existingDuplicate) {
        return res.status(409).json({
          error: 'Duplicate GL transaction detected within organization',
          isDuplicate: true,
          duplicateOfId: existingDuplicate.id,
          transactionFingerprint,
        });
      }
    }

    const transaction = await prisma.glTransaction.create({
      data: {
        organizationId: orgId,
        bankAccountId: validated.bankAccountId || null,
        transactionDate: new Date(validated.transactionDate),
        valueDate: validated.valueDate ? new Date(validated.valueDate) : null,
        referenceNumber: validated.referenceNumber || null,
        chequeNumber: validated.chequeNumber || null,
        accountNumber: validated.accountNumber || null,
        transactionType: validated.transactionType,
        currency: validated.currency,
        debit: debitDecimal,
        credit: creditDecimal,
        amount: calcAmountDecimal,
        narration: validated.narration,
        customerSupplier: validated.customerSupplier || null,
        journalNumber: validated.journalNumber || null,
        sourceSystem: validated.sourceSystem,
        originalData: JSON.stringify(validated.rawSourceData || {
          narration: validated.narration,
          debit: validated.debit,
          credit: validated.credit,
          transactionDate: validated.transactionDate,
        }),
        normalizedData: JSON.stringify({
          narration: validated.narration.trim().toUpperCase(),
          referenceNumber: validated.referenceNumber,
        }),
        transactionFingerprint,
        status: 'UNMATCHED',
      },
    });

    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles[0],
      action: 'GL_TRANSACTION_CREATED',
      entityType: 'GLTransaction',
      entityId: transaction.id,
      newValue: { id: transaction.id, narration: validated.narration, amount: calcAmountDecimal.toString() },
      reason: 'General Ledger transaction record registered',
    });

    res.status(201).json({
      transaction,
      isDuplicate: !!existingDuplicate,
      duplicateOfId: existingDuplicate ? existingDuplicate.id : null,
      transactionFingerprint,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating GL transaction:', error);
    res.status(500).json({ error: 'Failed to create GL transaction' });
  }
};

transactionRouter.post('/gl', requirePermission('upload_gl'), createGlTransactionHandler);
