import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission } from '../middleware/rbac';
import { recordAuditEvent } from '../services/auditService';

export const statementRouter = Router();

// List Statements
statementRouter.get('/', requirePermission('view_dashboard'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const { bankAccountId } = req.query;

    const where: Record<string, unknown> = { organizationId: orgId };
    if (bankAccountId && typeof bankAccountId === 'string') {
      where.bankAccountId = bankAccountId;
    }

    const statements = await prisma.bankStatement.findMany({
      where,
      include: {
        bankAccount: {
          include: { bank: true },
        },
        uploadedBy: {
          select: { id: true, fullName: true, email: true },
        },
        pages: {
          orderBy: { pageNumber: 'asc' },
        },
        _count: {
          select: { transactions: true },
        },
      },
      orderBy: { uploadedAt: 'desc' },
    });

    res.json({ statements });
  } catch (error) {
    console.error('Error fetching statements:', error);
    res.status(500).json({ error: 'Failed to fetch statements' });
  }
});

// Create statement record (Phase 1 metadata foundation)
statementRouter.post('/register', requirePermission('upload_statement'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const {
      bankAccountId,
      statementPeriodStart,
      statementPeriodEnd,
      originalFilename,
      fileType,
      openingBalance = 0,
      closingBalance = 0,
      totalCredits = 0,
      totalDebits = 0,
      transactionCount = 0,
      pageCount = 1,
    } = req.body;

    if (!bankAccountId || !originalFilename || !fileType) {
      return res.status(400).json({ error: 'Missing required statement metadata' });
    }

    // Verify bank account ownership
    const account = await prisma.bankAccount.findFirst({
      where: { id: bankAccountId, organizationId: orgId },
    });

    if (!account) {
      return res.status(404).json({ error: 'Bank account not found' });
    }

    const statement = await prisma.bankStatement.create({
      data: {
        organizationId: orgId,
        bankAccountId,
        statementPeriodStart: new Date(statementPeriodStart || new Date()),
        statementPeriodEnd: new Date(statementPeriodEnd || new Date()),
        originalFilename,
        fileType,
        storagePath: `/secure-storage/${orgId}/statements/${Date.now()}_${originalFilename}`,
        uploadedById: req.user!.id,
        processingStatus: 'COMPLETED',
        extractionStatus: 'COMPLETED',
        validationStatus: 'VALID',
        duplicateStatus: 'UNIQUE',
        openingBalance: Number(openingBalance),
        closingBalance: Number(closingBalance),
        totalCredits: Number(totalCredits),
        totalDebits: Number(totalDebits),
        transactionCount: Number(transactionCount),
        processingStartedAt: new Date(),
        processingCompletedAt: new Date(),
      },
    });

    // Create page records for OCR and extraction tracking
    for (let p = 1; p <= Number(pageCount); p++) {
      await prisma.statementPage.create({
        data: {
          statementId: statement.id,
          pageNumber: p,
          extractionStatus: 'COMPLETED',
          ocrStatus: fileType.toUpperCase() === 'PDF' ? 'COMPLETED' : 'NOT_REQUIRED',
          extractionConfidence: 0.98,
        },
      });
    }

    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles[0],
      action: 'STATEMENT_REGISTERED',
      entityType: 'BankStatement',
      entityId: statement.id,
      newValue: {
        id: statement.id,
        filename: statement.originalFilename,
        bankAccount: account.accountName,
        pages: pageCount,
      },
      reason: 'Bank statement record initialized in system',
    });

    const fullStatement = await prisma.bankStatement.findUnique({
      where: { id: statement.id },
      include: { pages: true, bankAccount: true },
    });

    res.status(201).json({ statement: fullStatement });
  } catch (error) {
    console.error('Error registering statement:', error);
    res.status(500).json({ error: 'Failed to register statement record' });
  }
});
