import { Prisma } from '@prisma/client';

export type IngestionSourceType = 'BANK_STATEMENT' | 'GL_IMPORT';
export type IngestionFileFormat = 'CSV' | 'XLSX' | 'XLS' | 'PDF';

export type IngestionProcessingStatus =
  | 'PENDING'
  | 'PROCESSING'
  | 'EXTRACTED'
  | 'VALIDATED'
  | 'IMPORTED'
  | 'COMPLETED'
  | 'COMPLETED_WITH_WARNINGS'
  | 'FAILED'
  | 'DUPLICATE';

export interface ColumnMappingConfig {
  transactionDate?: string;
  valueDate?: string;
  description?: string;
  narration?: string;
  referenceNumber?: string;
  chequeNumber?: string;
  accountNumber?: string;
  transactionType?: string;
  currency?: string;
  debit?: string;
  credit?: string;
  amount?: string;
  balance?: string;
  customerSupplier?: string;
  journalNumber?: string;
  [key: string]: string | undefined;
}

export interface NormalizedTransaction {
  rowNumber: number;
  pageNumber?: number;
  transactionDate: Date;
  valueDate?: Date | null;
  description: string;
  narration?: string | null;
  referenceNumber?: string | null;
  chequeNumber?: string | null;
  accountNumber?: string | null;
  transactionType: string;
  currency: string;
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  signedAmount: Prisma.Decimal;
  balance?: Prisma.Decimal | null;
  customerSupplier?: string | null;
  journalNumber?: string | null;
  rawRecord: Record<string, unknown>;
  normalizedData: Record<string, unknown>;
  transactionFingerprint: string;
  isSuspectedDuplicate: boolean;
  duplicateReason?: string | null;
}

export interface RejectedRowInfo {
  rowNumber?: number;
  pageNumber?: number;
  sourceType: IngestionSourceType;
  rawRecord: string;
  reason: string;
  errorCode: string;
}

export interface PageExtractionInfo {
  pageNumber: number;
  textLength: number;
  ocrUsed: boolean;
  confidence: number;
}

export interface ExtractionResult {
  headers: string[];
  rows: Record<string, unknown>[];
  detectedMapping: ColumnMappingConfig;
  mappingConfidence: number;
  extractionMethod: 'CSV_PARSER' | 'XLSX_PARSER' | 'PDF_TEXT' | 'PDF_OCR';
  extractionConfidence: number;
  pageCount: number;
  pagesInfo?: PageExtractionInfo[];
  warnings: string[];
}

export interface IngestionSummary {
  sourceId: string;
  sourceType: IngestionSourceType;
  filename: string;
  fileHash: string;
  fileSize: number;
  status: IngestionProcessingStatus;
  recordsDetected: number;
  successfullyImported: number;
  rejectedCount: number;
  duplicateCount: number;
  warningCount: number;
  pagesProcessed: number;
  extractionMethod: string;
  extractionConfidence: number;
  rejectedRows: RejectedRowInfo[];
  warnings: string[];
  totalCredits: string;
  totalDebits: string;
}
