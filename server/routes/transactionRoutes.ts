import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission } from '../middleware/rbac';
import { recordAuditEvent } from '../services/auditService';
import crypto from 'crypto';

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

// Create Bank Transaction entry (Preserves raw source record intact)
transactionRouter.post('/bank', requirePermission('upload_statement'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const {
      bankAccountId,
      statementId,
      transactionDate,
      valueDate,
      description,
      narration,
      referenceNumber,
      chequeNumber,
      accountNumber,
      transactionType = 'DEBIT',
      currency = 'USD',
      debit = 0,
      credit = 0,
      signedAmount,
      balance,
      rawSourceData = {},
    } = req.body;

    if (!bankAccountId || !transactionDate || !description) {
      return res.status(400).json({ error: 'Missing required bank transaction fields' });
    }

    const calcSignedAmount = signedAmount !== undefined ? Number(signedAmount) : Number(credit) - Number(debit);

    // Compute cryptographic fingerprint for deduplication
    const fingerprintStr = `${orgId}-${bankAccountId}-${transactionDate}-${referenceNumber || ''}-${chequeNumber || ''}-${calcSignedAmount}-${description}`;
    const transactionFingerprint = crypto.createHash('sha256').update(fingerprintStr).digest('hex');

    const transaction = await prisma.bankTransaction.create({
      data: {
        organizationId: orgId,
        bankAccountId,
        statementId: statementId || null,
        transactionDate: new Date(transactionDate),
        valueDate: valueDate ? new Date(valueDate) : null,
        description,
        narration: narration || null,
        referenceNumber: referenceNumber || null,
        chequeNumber: chequeNumber || null,
        accountNumber: accountNumber || null,
        transactionType,
        currency,
        debit: Number(debit),
        credit: Number(credit),
        signedAmount: calcSignedAmount,
        balance: balance !== undefined ? Number(balance) : null,
        originalImportedData: JSON.stringify(rawSourceData || { description, debit, credit, transactionDate }),
        normalizedData: JSON.stringify({ description: description.trim().toUpperCase(), referenceNumber }),
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
      newValue: { id: transaction.id, description, amount: calcSignedAmount },
      reason: 'Bank transaction record created',
    });

    res.status(201).json({ transaction });
  } catch (error) {
    console.error('Error creating bank transaction:', error);
    res.status(500).json({ error: 'Failed to create bank transaction' });
  }
});

// Create GL Transaction entry
transactionRouter.post('/gl', requirePermission('upload_gl'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const {
      bankAccountId,
      transactionDate,
      valueDate,
      referenceNumber,
      chequeNumber,
      accountNumber,
      transactionType = 'JOURNAL',
      currency = 'USD',
      debit = 0,
      credit = 0,
      amount,
      narration,
      customerSupplier,
      journalNumber,
      sourceSystem = 'GENERAL_LEDGER',
      rawSourceData = {},
    } = req.body;

    if (!transactionDate || !narration) {
      return res.status(400).json({ error: 'Missing required GL transaction fields' });
    }

    const calcAmount = amount !== undefined ? Number(amount) : Number(debit) - Number(credit);

    const fingerprintStr = `${orgId}-${bankAccountId || 'global'}-${transactionDate}-${journalNumber || ''}-${referenceNumber || ''}-${calcAmount}-${narration}`;
    const transactionFingerprint = crypto.createHash('sha256').update(fingerprintStr).digest('hex');

    const transaction = await prisma.glTransaction.create({
      data: {
        organizationId: orgId,
        bankAccountId: bankAccountId || null,
        transactionDate: new Date(transactionDate),
        valueDate: valueDate ? new Date(valueDate) : null,
        referenceNumber: referenceNumber || null,
        chequeNumber: chequeNumber || null,
        accountNumber: accountNumber || null,
        transactionType,
        currency,
        debit: Number(debit),
        credit: Number(credit),
        amount: calcAmount,
        narration,
        customerSupplier: customerSupplier || null,
        journalNumber: journalNumber || null,
        sourceSystem,
        originalData: JSON.stringify(rawSourceData || { narration, debit, credit, transactionDate }),
        normalizedData: JSON.stringify({ narration: narration.trim().toUpperCase(), referenceNumber }),
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
      newValue: { id: transaction.id, narration, amount: calcAmount },
      reason: 'General Ledger transaction record registered',
    });

    res.status(201).json({ transaction });
  } catch (error) {
    console.error('Error creating GL transaction:', error);
    res.status(500).json({ error: 'Failed to create GL transaction' });
  }
});
