import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission } from '../middleware/rbac';
import { recordAuditEvent } from '../services/auditService';
import { Prisma } from '@prisma/client';
import { uploadMiddleware } from '../middleware/upload';
import { previewIngestionFile, ingestBankStatement } from '../services/ingestion/ingestionPipeline';

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
export const registerStatementHandler = async (req: any, res: any) => {
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

    // Phase 1 Foundation: Honest initial unprocessed/pending lifecycle states
    // (NO fabricated completion, NO fake OCR, NO fabricated transaction counts, NO fake confidence scores)
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
        transactionCount: 0,
        processingStartedAt: null,
        processingCompletedAt: null,
      },
    });

    // Create page records for tracking - strictly unprocessed
    const pagesData = [];
    for (let p = 1; p <= Number(pageCount); p++) {
      pagesData.push({
        statementId: statement.id,
        pageNumber: p,
        extractionStatus: 'PENDING',
        ocrStatus: 'NOT_REQUIRED',
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

// File Preview Endpoint (inspect columns and samples without saving)
statementRouter.post(
  '/preview',
  requirePermission('upload_statement'),
  uploadMiddleware.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Please provide a CSV, XLSX, or PDF file.' });
      }

      let userMapping;
      if (req.body.columnMapping) {
        try {
          userMapping = typeof req.body.columnMapping === 'string'
            ? JSON.parse(req.body.columnMapping)
            : req.body.columnMapping;
        } catch {
          // ignore mapping parse error
        }
      }

      const preview = await previewIngestionFile({
        fileBuffer: req.file.buffer,
        originalFilename: req.file.originalname,
        sourceType: 'BANK_STATEMENT',
        userMapping,
      });

      res.json(preview);
    } catch (error: any) {
      console.error('Error previewing statement file:', error);
      res.status(400).json({ error: error.message || 'Failed to preview file' });
    }
  }
);

// File Ingestion Upload Endpoint
statementRouter.post(
  '/upload',
  requirePermission('upload_statement'),
  uploadMiddleware.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded. Please upload a valid CSV, XLSX, or PDF document.' });
      }

      const orgId = req.organization!.id;
      const { bankAccountId, statementPeriodStart, statementPeriodEnd, columnMapping } = req.body;

      if (!bankAccountId) {
        return res.status(400).json({ error: 'bankAccountId is required' });
      }

      let parsedMapping;
      if (columnMapping) {
        try {
          parsedMapping = typeof columnMapping === 'string' ? JSON.parse(columnMapping) : columnMapping;
        } catch {
          // ignore
        }
      }

      const summary = await ingestBankStatement({
        fileBuffer: req.file.buffer,
        originalFilename: req.file.originalname,
        clientMimeType: req.file.mimetype,
        organizationId: orgId,
        bankAccountId,
        uploadedById: req.user!.id,
        periodStart: statementPeriodStart ? new Date(statementPeriodStart) : undefined,
        periodEnd: statementPeriodEnd ? new Date(statementPeriodEnd) : undefined,
        userMapping: parsedMapping,
      });

      res.status(summary.status === 'DUPLICATE' ? 409 : 201).json({
        summary,
        message:
          summary.status === 'DUPLICATE'
            ? 'Duplicate file rejected: Exact source already exists'
            : `Successfully ingested ${summary.successfullyImported} transactions (${summary.rejectedCount} rejected, ${summary.duplicateCount} duplicates)`,
      });
    } catch (error: any) {
      console.error('Error during statement ingestion:', error);
      res.status(400).json({ error: error.message || 'Statement ingestion failed' });
    }
  }
);

// Get Rejected Rows for Statement
statementRouter.get('/:id/rejected-rows', requirePermission('view_dashboard'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const { id } = req.params;

    const statement = await prisma.bankStatement.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!statement) {
      return res.status(404).json({ error: 'Statement not found' });
    }

    const rejectedRows = await prisma.rejectedRow.findMany({
      where: { statementId: id, organizationId: orgId },
      orderBy: { rowNumber: 'asc' },
    });

    res.json({ rejectedRows });
  } catch (error: any) {
    console.error('Error fetching rejected rows:', error);
    res.status(500).json({ error: 'Failed to fetch rejected rows' });
  }
});

// Get Ingestion Summary / Metrics
statementRouter.get('/:id/summary', requirePermission('view_dashboard'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const { id } = req.params;

    const statement = await prisma.bankStatement.findFirst({
      where: { id, organizationId: orgId },
      include: {
        bankAccount: true,
        uploadedBy: { select: { id: true, fullName: true, email: true } },
        _count: {
          select: {
            transactions: true,
            rejectedRows: true,
            pages: true,
          },
        },
      },
    });

    if (!statement) {
      return res.status(404).json({ error: 'Statement not found' });
    }

    res.json({
      summary: {
        id: statement.id,
        filename: statement.originalFilename,
        fileHash: statement.fileHash,
        fileSize: statement.fileSize,
        fileType: statement.fileType,
        processingStatus: statement.processingStatus,
        extractionMethod: statement.extractionMethod,
        extractionConfidence: statement.extractionConfidence,
        totalDebits: statement.totalDebits,
        totalCredits: statement.totalCredits,
        transactionCount: statement.transactionCount,
        validCount: statement.validCount,
        rejectedCount: statement.rejectedCount,
        duplicateCount: statement.duplicateCount,
        warningCount: statement.warningCount,
        uploadedAt: statement.uploadedAt,
        uploadedBy: statement.uploadedBy,
        bankAccount: statement.bankAccount,
      },
    });
  } catch (error: any) {
    console.error('Error fetching statement summary:', error);
    res.status(500).json({ error: 'Failed to fetch statement summary' });
  }
});

