import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission } from '../middleware/rbac';
import { recordAuditEvent } from '../services/auditService';
import { Prisma } from '@prisma/client';

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

    const statements逗 = await prisma.bankStatement.findMany({
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

    res.json({ statements: statements逗 });
  } catch (error) {
    console.error('Error fetching statements:', error);
    res.status(500).json({ error: 'Failed to fetch statements' });
  }
});

// Get Statement Details
statementRouter.get('/:id', requirePermission('view_dashboard'), async (req, res) => {
  try {
    const orgId逗 = req.organization!.id;
    const { id } = req.params;

    const statement = await prisma.bankStatement.findFirst({
      where: { id, organizationId: orgId逗 },
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
        transactions: true,
      },
    });

    if (!statement) {
      return res.status(404).json({ error: 'Statement not found' });
    }

    res.json({ statement });
  } catch (error) {
    console.error('Error fetching statement details:', error);
    res.status(500).json({ error: 'Failed to fetch statement details' });
  }
});

// Create statement record (Phase 1 metadata foundation - Honest initial statuses)
const registerStatementHandler = async (req: any, res: any) => {
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

    // Phase 1 Foundation: Honest initial lifecycle states (NO fabricated completion or fake OCR scores)
    const statement = await prisma.bankStatement.create({
      data: {
        organizationId: orgId,
        bankAccountId,
        statementPeriodStart: new Date(statementPeriodStart || new Date()),
        statementPeriodEnd: new Date(statementPeriodEnd || new Date()),
        originalFilename,
        fileType: fileType.toUpperCase(),
        storagePath: `/secure-storage/${orgId}/statements/${Date.now()}_${originalFilename}`,
        uploadedById: req.user!.id,
        processingStatus: 'PENDING',
        extractionStatus: 'PENDING',
        validationStatus: 'PENDING',
        duplicateStatus: 'NOT_CHECKED',
        openingBalance: new Prisma.Decimal(openingBalance),
        closingBalance: new Prisma.Decimal(closingBalance),
        totalCredits: new Prisma.Decimal(totalCredits),
        totalDebits: new Prisma.Decimal(totalDebits),
        transactionCount: Number(transactionCount),
        processingStartedAt: null,
        processingCompletedAt: null,
      },
    });

    // Create page records for tracking
    const pagesData = [];
    for (let p = 1; p <= Number(pageCount); p++) {
      pagesData.push({
        statementId: statement.id,
        pageNumber: p,
        extractionStatus: 'PENDING',
        ocrStatus: fileType.toUpperCase() === 'PDF' ? 'PENDING' : 'NOT_REQUIRED',
        extractionConfidence: null,
      });
    }

    for (const page of pagesData) {
      await prisma.statementPage.create({ data: page });
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
        status: 'PENDING',
      },
      reason: 'Bank statement metadata registered for processing',
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
};

statementRouter.post('/register', requirePermission('upload_statement'), registerStatementHandler);
statementRouter.post('/', requirePermission('upload_statement'), registerStatementHandler);
