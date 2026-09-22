import { prisma } from '../../db';
import { Prisma } from '@prisma/client';
import {
  ColumnMappingConfig,
  ExtractionResult,
  IngestionFileFormat,
  IngestionProcessingStatus,
  IngestionSummary,
  RejectedRowInfo,
} from './types';
import { validateAndPreserveSourceFile } from './fileValidationService';
import { checkDuplicateFile, findExistingTransactionDuplicates } from './duplicateDetectionService';
import { parseCsvBuffer } from './parsers/csvParser';
import { parseXlsxBuffer } from './parsers/xlsxParser';
import { parsePdfBuffer } from './parsers/pdfParser';
import { validateAndNormalizeRows } from './validationService';
import { detectColumnMapping } from './columnMappingService';

/**
 * Parses file and returns column preview without saving to database.
 */
export async function previewIngestionFile(params: {
  fileBuffer: Buffer;
  originalFilename: string;
  sourceType: 'BANK_STATEMENT' | 'GL_IMPORT';
  userMapping?: ColumnMappingConfig;
}): Promise<{
  extraction: ExtractionResult;
  sampleRows: Record<string, unknown>[];
  totalRows: number;
}> {
  const { fileBuffer, originalFilename, sourceType, userMapping } = params;
  const ext = originalFilename.split('.').pop()?.toLowerCase();

  let extraction: ExtractionResult;
  if (ext === 'csv') {
    extraction = await parseCsvBuffer(fileBuffer, sourceType, userMapping);
  } else if (ext === 'xlsx' || ext === 'xls') {
    extraction = await parseXlsxBuffer(fileBuffer, sourceType, userMapping);
  } else if (ext === 'pdf') {
    extraction = await parsePdfBuffer(fileBuffer, sourceType, userMapping);
  } else {
    throw new Error(`Unsupported file extension '.${ext}'. Supported formats: .csv, .xlsx, .xls, .pdf`);
  }

  return {
    extraction,
    sampleRows: extraction.rows.slice(0, 10),
    totalRows: extraction.rows.length,
  };
}

/**
 * Complete, atomic ingestion pipeline for Bank Statements.
 */
export async function ingestBankStatement(params: {
  fileBuffer: Buffer;
  originalFilename: string;
  clientMimeType?: string;
  organizationId: string;
  bankAccountId: string;
  uploadedById: string;
  periodStart?: Date;
  periodEnd?: Date;
  userMapping?: ColumnMappingConfig;
}): Promise<IngestionSummary> {
  const {
    fileBuffer,
    originalFilename,
    clientMimeType,
    organizationId,
    bankAccountId,
    uploadedById,
    periodStart,
    periodEnd,
    userMapping,
  } = params;

  // 1. Verify organization and bank account association
  const account = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, organizationId },
  });
  if (!account) {
    throw new Error('Bank account not found or does not belong to the authenticated organization');
  }

  // 2. Validate, calculate SHA-256 fingerprint, and preserve original source file
  const fileMeta = await validateAndPreserveSourceFile(
    fileBuffer,
    originalFilename,
    clientMimeType,
    organizationId,
    'statements'
  );

  // 3. Level 1 Duplicate Detection: Exact File Fingerprint Check
  const duplicateCheck = await checkDuplicateFile(organizationId, fileMeta.fileHash, 'BANK_STATEMENT');
  if (duplicateCheck.isDuplicate) {
    // Record audit event for detected duplicate upload attempt
    await prisma.auditEvent.create({
      data: {
        organizationId,
        actorId: uploadedById,
        action: 'STATEMENT_DUPLICATE_UPLOAD_REJECTED',
        entityType: 'BankStatement',
        entityId: duplicateCheck.existingId || 'unknown',
        newValue: JSON.stringify({
          originalFilename,
          fileHash: fileMeta.fileHash,
          existingId: duplicateCheck.existingId,
          existingFilename: duplicateCheck.existingFilename,
        }),
      },
    });

    return {
      sourceId: duplicateCheck.existingId || '',
      sourceType: 'BANK_STATEMENT',
      filename: originalFilename,
      fileHash: fileMeta.fileHash,
      fileSize: fileMeta.fileSize,
      status: 'DUPLICATE',
      recordsDetected: 0,
      successfullyImported: 0,
      rejectedCount: 0,
      duplicateCount: 1,
      warningCount: 1,
      pagesProcessed: 0,
      extractionMethod: 'FINGERPRINT_CHECK',
      extractionConfidence: 1.0,
      rejectedRows: [],
      warnings: [
        `Duplicate file detected: This exact statement file was already uploaded on ${
          duplicateCheck.uploadedAt ? new Date(duplicateCheck.uploadedAt).toISOString() : 'earlier'
        } as "${duplicateCheck.existingFilename}" (ID: ${duplicateCheck.existingId}). Re-upload cancelled to prevent duplicate ledger transactions.`,
      ],
      totalCredits: '0.00',
      totalDebits: '0.00',
    };
  }

  // 4. Parse content using appropriate format extractor
  let extraction: ExtractionResult;
  if (fileMeta.fileFormat === 'CSV') {
    extraction = await parseCsvBuffer(fileBuffer, 'BANK_STATEMENT', userMapping);
  } else if (fileMeta.fileFormat === 'XLSX' || fileMeta.fileFormat === 'XLS') {
    extraction = await parseXlsxBuffer(fileBuffer, 'BANK_STATEMENT', userMapping);
  } else if (fileMeta.fileFormat === 'PDF') {
    extraction = await parsePdfBuffer(fileBuffer, 'BANK_STATEMENT', userMapping);
  } else {
    throw new Error(`Unsupported format ${fileMeta.fileFormat}`);
  }

  // 5. Normalization & Validation
  const validationResult = validateAndNormalizeRows({
    rawRows: extraction.rows,
    mapping: extraction.detectedMapping,
    sourceType: 'BANK_STATEMENT',
    organizationId,
    bankAccountId,
    baseCurrency: account.currency,
  });

  // 6. Level 2 Duplicate Check: Transaction-level fingerprint matching
  const fingerprints = validationResult.validTransactions.map((t) => t.transactionFingerprint);
  const existingDupMap = await findExistingTransactionDuplicates(
    organizationId,
    fingerprints,
    'BANK_STATEMENT'
  );

  let suspectedDuplicateCount = 0;
  for (const txn of validationResult.validTransactions) {
    if (existingDupMap.has(txn.transactionFingerprint)) {
      const match = existingDupMap.get(txn.transactionFingerprint)!;
      txn.isSuspectedDuplicate = true;
      txn.duplicateReason = `Potential duplicate of existing transaction on ${match.transactionDate.toISOString().substring(0, 10)}: "${match.description}" (ID: ${match.id})`;
      suspectedDuplicateCount++;
    }
  }

  // Determine period start and end
  const finalPeriodStart =
    periodStart || validationResult.earliestDate || new Date();
  const finalPeriodEnd =
    periodEnd || validationResult.latestDate || new Date();

  // Status computation
  let finalStatus: IngestionProcessingStatus = 'IMPORTED';
  if (validationResult.rejectedRows.length > 0 || suspectedDuplicateCount > 0) {
    finalStatus = 'COMPLETED_WITH_WARNINGS';
  }
  if (validationResult.validTransactions.length === 0 && validationResult.rejectedRows.length > 0) {
    finalStatus = 'FAILED';
  }

  // 7. Atomic Persistence with Prisma Transaction
  const result = await prisma.$transaction(async (tx) => {
    // A. Create BankStatement record
    const statement = await tx.bankStatement.create({
      data: {
        organizationId,
        bankAccountId,
        statementPeriodStart: finalPeriodStart,
        statementPeriodEnd: finalPeriodEnd,
        originalFilename: fileMeta.originalFilename,
        fileType: fileMeta.fileFormat,
        storagePath: fileMeta.storagePath,
        fileSize: fileMeta.fileSize,
        fileHash: fileMeta.fileHash,
        mimeType: fileMeta.mimeType,
        uploadedById,
        processingStatus: finalStatus,
        extractionStatus: 'COMPLETED',
        validationStatus: validationResult.rejectedRows.length > 0 ? 'WARNING' : 'VALID',
        duplicateStatus: suspectedDuplicateCount > 0 ? 'POTENTIAL_DUPLICATE' : 'UNIQUE',
        extractionMethod: extraction.extractionMethod,
        extractionConfidence: new Prisma.Decimal(extraction.extractionConfidence.toFixed(2)),
        totalCredits: validationResult.totalCredits,
        totalDebits: validationResult.totalDebits,
        transactionCount: extraction.rows.length,
        validCount: validationResult.validTransactions.length,
        rejectedCount: validationResult.rejectedRows.length,
        duplicateCount: suspectedDuplicateCount,
        warningCount: extraction.warnings.length + (suspectedDuplicateCount > 0 ? 1 : 0),
        processingStartedAt: new Date(),
        processingCompletedAt: new Date(),
        columnMapping: JSON.stringify(extraction.detectedMapping),
        warnings: JSON.stringify(extraction.warnings),
      },
    });

    // B. Create StatementPage records if present
    const pageIdMap = new Map<number, string>();
    if (extraction.pagesInfo && extraction.pagesInfo.length > 0) {
      for (const page of extraction.pagesInfo) {
        const pRecord = await tx.statementPage.create({
          data: {
            statementId: statement.id,
            pageNumber: page.pageNumber,
            extractionStatus: 'COMPLETED',
            ocrStatus: page.ocrUsed ? 'COMPLETED' : 'NOT_REQUIRED',
            extractionConfidence: new Prisma.Decimal(page.confidence.toFixed(2)),
          },
        });
        pageIdMap.set(page.pageNumber, pRecord.id);
      }
    }

    // C. Insert BankTransactions (Status MUST BE 'UNMATCHED' - No Auto Matching!)
    for (const txn of validationResult.validTransactions) {
      const pageId = txn.pageNumber ? pageIdMap.get(txn.pageNumber) : undefined;
      await tx.bankTransaction.create({
        data: {
          organizationId,
          bankAccountId,
          statementId: statement.id,
          statementPageId: pageId,
          transactionDate: txn.transactionDate,
          valueDate: txn.valueDate,
          description: txn.description,
          narration: txn.narration,
          referenceNumber: txn.referenceNumber,
          chequeNumber: txn.chequeNumber,
          accountNumber: txn.accountNumber,
          transactionType: txn.transactionType,
          currency: txn.currency,
          debit: txn.debit,
          credit: txn.credit,
          signedAmount: txn.signedAmount,
          balance: txn.balance,
          sourceRow: txn.rowNumber,
          sourcePage: txn.pageNumber,
          originalImportedData: JSON.stringify(txn.rawRecord),
          normalizedData: JSON.stringify(txn.normalizedData),
          transactionFingerprint: txn.transactionFingerprint,
          isSuspectedDuplicate: txn.isSuspectedDuplicate,
          duplicateReason: txn.duplicateReason,
          status: 'UNMATCHED', // Strictly UNMATCHED per Phase 2 constraints
        },
      });
    }

    // D. Insert RejectedRows
    for (const rej of validationResult.rejectedRows) {
      await tx.rejectedRow.create({
        data: {
          organizationId,
          statementId: statement.id,
          rowNumber: rej.rowNumber,
          pageNumber: rej.pageNumber,
          sourceType: 'BANK_STATEMENT',
          rawRecord: typeof rej.rawRecord === 'string' ? rej.rawRecord : JSON.stringify(rej.rawRecord),
          reason: rej.reason,
          errorCode: rej.errorCode,
        },
      });
    }

    // E. Create Audit Event
    await tx.auditEvent.create({
      data: {
        organizationId,
        actorId: uploadedById,
        action: 'STATEMENT_INGESTION_COMPLETED',
        entityType: 'BankStatement',
        entityId: statement.id,
        newValue: JSON.stringify({
          originalFilename: fileMeta.originalFilename,
          fileHash: fileMeta.fileHash,
          recordsDetected: extraction.rows.length,
          validImported: validationResult.validTransactions.length,
          rejected: validationResult.rejectedRows.length,
          suspectedDuplicates: suspectedDuplicateCount,
          status: finalStatus,
        }),
      },
    });

    return statement;
  });

  return {
    sourceId: result.id,
    sourceType: 'BANK_STATEMENT',
    filename: fileMeta.originalFilename,
    fileHash: fileMeta.fileHash,
    fileSize: fileMeta.fileSize,
    status: finalStatus,
    recordsDetected: extraction.rows.length,
    successfullyImported: validationResult.validTransactions.length,
    rejectedCount: validationResult.rejectedRows.length,
    duplicateCount: suspectedDuplicateCount,
    warningCount: extraction.warnings.length,
    pagesProcessed: extraction.pageCount,
    extractionMethod: extraction.extractionMethod,
    extractionConfidence: extraction.extractionConfidence,
    rejectedRows: validationResult.rejectedRows,
    warnings: extraction.warnings,
    totalCredits: validationResult.totalCredits.toFixed(2),
    totalDebits: validationResult.totalDebits.toFixed(2),
  };
}

/**
 * Complete, atomic ingestion pipeline for General Ledger (GL) data.
 */
export async function ingestGlData(params: {
  fileBuffer: Buffer;
  originalFilename: string;
  clientMimeType?: string;
  organizationId: string;
  bankAccountId?: string | null;
  uploadedById: string;
  sourceSystem?: string;
  userMapping?: ColumnMappingConfig;
}): Promise<IngestionSummary> {
  const {
    fileBuffer,
    originalFilename,
    clientMimeType,
    organizationId,
    bankAccountId,
    uploadedById,
    sourceSystem = 'GENERAL_LEDGER',
    userMapping,
  } = params;

  // 1. Validate and preserve original source file
  const fileMeta = await validateAndPreserveSourceFile(
    fileBuffer,
    originalFilename,
    clientMimeType,
    organizationId,
    'gl'
  );

  // 2. Level 1 Duplicate Detection
  const duplicateCheck = await checkDuplicateFile(organizationId, fileMeta.fileHash, 'GL_IMPORT');
  if (duplicateCheck.isDuplicate) {
    await prisma.auditEvent.create({
      data: {
        organizationId,
        actorId: uploadedById,
        action: 'GL_IMPORT_DUPLICATE_REJECTED',
        entityType: 'GlImport',
        entityId: duplicateCheck.existingId || 'unknown',
        newValue: JSON.stringify({
          originalFilename,
          fileHash: fileMeta.fileHash,
          existingId: duplicateCheck.existingId,
          existingFilename: duplicateCheck.existingFilename,
        }),
      },
    });

    return {
      sourceId: duplicateCheck.existingId || '',
      sourceType: 'GL_IMPORT',
      filename: originalFilename,
      fileHash: fileMeta.fileHash,
      fileSize: fileMeta.fileSize,
      status: 'DUPLICATE',
      recordsDetected: 0,
      successfullyImported: 0,
      rejectedCount: 0,
      duplicateCount: 1,
      warningCount: 1,
      pagesProcessed: 0,
      extractionMethod: 'FINGERPRINT_CHECK',
      extractionConfidence: 1.0,
      rejectedRows: [],
      warnings: [
        `Duplicate file detected: This exact GL file was already uploaded on ${
          duplicateCheck.uploadedAt ? new Date(duplicateCheck.uploadedAt).toISOString() : 'earlier'
        } as "${duplicateCheck.existingFilename}" (ID: ${duplicateCheck.existingId}). Re-upload cancelled to prevent duplicate ledger transactions.`,
      ],
      totalCredits: '0.00',
      totalDebits: '0.00',
    };
  }

  // 3. Extract rows
  let extraction: ExtractionResult;
  if (fileMeta.fileFormat === 'CSV') {
    extraction = await parseCsvBuffer(fileBuffer, 'GL_IMPORT', userMapping);
  } else if (fileMeta.fileFormat === 'XLSX' || fileMeta.fileFormat === 'XLS') {
    extraction = await parseXlsxBuffer(fileBuffer, 'GL_IMPORT', userMapping);
  } else if (fileMeta.fileFormat === 'PDF') {
    extraction = await parsePdfBuffer(fileBuffer, 'GL_IMPORT', userMapping);
  } else {
    throw new Error(`Unsupported format ${fileMeta.fileFormat}`);
  }

  // 4. Normalization & Validation
  const validationResult = validateAndNormalizeRows({
    rawRows: extraction.rows,
    mapping: extraction.detectedMapping,
    sourceType: 'GL_IMPORT',
    organizationId,
    bankAccountId,
  });

  // 5. Level 2 Duplicate Check: Transaction-level fingerprint matching
  const fingerprints = validationResult.validTransactions.map((t) => t.transactionFingerprint);
  const existingDupMap = await findExistingTransactionDuplicates(
    organizationId,
    fingerprints,
    'GL_IMPORT'
  );

  let suspectedDuplicateCount = 0;
  for (const txn of validationResult.validTransactions) {
    if (existingDupMap.has(txn.transactionFingerprint)) {
      const match = existingDupMap.get(txn.transactionFingerprint)!;
      txn.isSuspectedDuplicate = true;
      txn.duplicateReason = `Potential duplicate of existing GL transaction on ${match.transactionDate.toISOString().substring(0, 10)}: "${match.description}" (ID: ${match.id})`;
      suspectedDuplicateCount++;
    }
  }

  // Status computation
  let finalStatus: IngestionProcessingStatus = 'IMPORTED';
  if (validationResult.rejectedRows.length > 0 || suspectedDuplicateCount > 0) {
    finalStatus = 'COMPLETED_WITH_WARNINGS';
  }
  if (validationResult.validTransactions.length === 0 && validationResult.rejectedRows.length > 0) {
    finalStatus = 'FAILED';
  }

  // 6. Atomic Persistence in Prisma Transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create GlImport batch record
    const glImport = await tx.glImport.create({
      data: {
        organizationId,
        bankAccountId: bankAccountId || null,
        originalFilename: fileMeta.originalFilename,
        fileType: fileMeta.fileFormat,
        storagePath: fileMeta.storagePath,
        fileSize: fileMeta.fileSize,
        fileHash: fileMeta.fileHash,
        mimeType: fileMeta.mimeType,
        uploadedById,
        processingStatus: finalStatus,
        sourceSystem,
        totalCredits: validationResult.totalCredits,
        totalDebits: validationResult.totalDebits,
        transactionCount: extraction.rows.length,
        validCount: validationResult.validTransactions.length,
        rejectedCount: validationResult.rejectedRows.length,
        duplicateCount: suspectedDuplicateCount,
        warningCount: extraction.warnings.length,
        processingStartedAt: new Date(),
        processingCompletedAt: new Date(),
        columnMapping: JSON.stringify(extraction.detectedMapping),
        warnings: JSON.stringify(extraction.warnings),
      },
    });

    // Create GlTransactions (Status MUST BE 'UNMATCHED' - No Auto Matching!)
    for (const txn of validationResult.validTransactions) {
      await tx.glTransaction.create({
        data: {
          organizationId,
          bankAccountId: bankAccountId || null,
          glImportId: glImport.id,
          transactionDate: txn.transactionDate,
          valueDate: txn.valueDate,
          referenceNumber: txn.referenceNumber,
          chequeNumber: txn.chequeNumber,
          accountNumber: txn.accountNumber,
          transactionType: txn.transactionType,
          currency: txn.currency,
          debit: txn.debit,
          credit: txn.credit,
          amount: txn.signedAmount.abs(), // Net monetary amount
          narration: txn.description,
          customerSupplier: txn.customerSupplier,
          journalNumber: txn.journalNumber,
          sourceSystem,
          sourceFile: fileMeta.originalFilename,
          originalData: JSON.stringify(txn.rawRecord),
          normalizedData: JSON.stringify(txn.normalizedData),
          transactionFingerprint: txn.transactionFingerprint,
          isSuspectedDuplicate: txn.isSuspectedDuplicate,
          duplicateReason: txn.duplicateReason,
          status: 'UNMATCHED', // Strictly UNMATCHED
        },
      });
    }

    // Insert RejectedRows
    for (const rej of validationResult.rejectedRows) {
      await tx.rejectedRow.create({
        data: {
          organizationId,
          glImportId: glImport.id,
          rowNumber: rej.rowNumber,
          pageNumber: rej.pageNumber,
          sourceType: 'GL_IMPORT',
          rawRecord: typeof rej.rawRecord === 'string' ? rej.rawRecord : JSON.stringify(rej.rawRecord),
          reason: rej.reason,
          errorCode: rej.errorCode,
        },
      });
    }

    // Record Audit Event
    await tx.auditEvent.create({
      data: {
        organizationId,
        actorId: uploadedById,
        action: 'GL_IMPORT_COMPLETED',
        entityType: 'GlImport',
        entityId: glImport.id,
        newValue: JSON.stringify({
          originalFilename: fileMeta.originalFilename,
          fileHash: fileMeta.fileHash,
          recordsDetected: extraction.rows.length,
          validImported: validationResult.validTransactions.length,
          rejected: validationResult.rejectedRows.length,
          suspectedDuplicates: suspectedDuplicateCount,
          status: finalStatus,
        }),
      },
    });

    return glImport;
  });

  return {
    sourceId: result.id,
    sourceType: 'GL_IMPORT',
    filename: fileMeta.originalFilename,
    fileHash: fileMeta.fileHash,
    fileSize: fileMeta.fileSize,
    status: finalStatus,
    recordsDetected: extraction.rows.length,
    successfullyImported: validationResult.validTransactions.length,
    rejectedCount: validationResult.rejectedRows.length,
    duplicateCount: suspectedDuplicateCount,
    warningCount: extraction.warnings.length,
    pagesProcessed: extraction.pageCount,
    extractionMethod: extraction.extractionMethod,
    extractionConfidence: extraction.extractionConfidence,
    rejectedRows: validationResult.rejectedRows,
    warnings: extraction.warnings,
    totalCredits: validationResult.totalCredits.toFixed(2),
    totalDebits: validationResult.totalDebits.toFixed(2),
  };
}
