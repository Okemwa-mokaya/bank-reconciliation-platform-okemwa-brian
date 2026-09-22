import { Prisma } from '@prisma/client';
import {
  ColumnMappingConfig,
  IngestionSourceType,
  NormalizedTransaction,
  RejectedRowInfo,
} from './types';
import {
  normalizeDate,
  normalizeDecimal,
  normalizeText,
  resolveDebitCreditAmounts,
} from './normalizationService';
import { generateTransactionFingerprint } from './duplicateDetectionService';

export interface ValidationBatchResult {
  validTransactions: NormalizedTransaction[];
  rejectedRows: RejectedRowInfo[];
  totalCredits: Prisma.Decimal;
  totalDebits: Prisma.Decimal;
  earliestDate: Date | null;
  latestDate: Date | null;
}

/**
 * Validates, normalizes, and classifies rows from extraction output.
 * Invalid rows are preserved as RejectedRow records instead of silently disappearing.
 */
export function validateAndNormalizeRows(params: {
  rawRows: Record<string, unknown>[];
  mapping: ColumnMappingConfig;
  sourceType: IngestionSourceType;
  organizationId: string;
  bankAccountId?: string | null;
  baseCurrency?: string;
}): ValidationBatchResult {
  const { rawRows, mapping, sourceType, organizationId, bankAccountId, baseCurrency = 'USD' } = params;

  const validTransactions: NormalizedTransaction[] = [];
  const rejectedRows: RejectedRowInfo[] = [];

  let totalCredits = new Prisma.Decimal(0);
  let totalDebits = new Prisma.Decimal(0);
  let earliestDate: Date | null = null;
  let latestDate: Date | null = null;

  for (let index = 0; index < rawRows.length; index++) {
    const row = rawRows[index];
    const rowNumber = index + 1;
    const pageNumber = typeof row.__pageNumber === 'number' ? row.__pageNumber : 1;

    // 1. Date Validation
    const dateField = mapping.transactionDate ? row[mapping.transactionDate] : undefined;
    const parsedDate = normalizeDate(dateField);

    if (!parsedDate) {
      rejectedRows.push({
        rowNumber,
        pageNumber,
        sourceType,
        rawRecord: JSON.stringify(row),
        reason: `Invalid or unparseable transaction date: "${dateField !== undefined ? dateField : ''}"`,
        errorCode: 'INVALID_DATE',
      });
      continue;
    }

    // Optional Value Date
    const valueDateField = mapping.valueDate ? row[mapping.valueDate] : undefined;
    const parsedValueDate = normalizeDate(valueDateField);

    // 2. Description / Narration Validation
    const descField = mapping.description ? row[mapping.description] : undefined;
    const narrationField = mapping.narration ? row[mapping.narration] : undefined;
    const cleanDesc = normalizeText(descField || narrationField);

    if (!cleanDesc) {
      rejectedRows.push({
        rowNumber,
        pageNumber,
        sourceType,
        rawRecord: JSON.stringify(row),
        reason: 'Missing required description, narration, or memo text',
        errorCode: 'MISSING_DESCRIPTION',
      });
      continue;
    }

    // 3. Monetary Amounts Validation
    const debitField = mapping.debit ? row[mapping.debit] : undefined;
    const creditField = mapping.credit ? row[mapping.credit] : undefined;
    const amountField = mapping.amount ? row[mapping.amount] : undefined;
    const typeField = mapping.transactionType ? row[mapping.transactionType] : undefined;

    const amountResult = resolveDebitCreditAmounts({
      debitRaw: debitField,
      creditRaw: creditField,
      amountRaw: amountField,
      typeRaw: typeField,
    });

    if (!amountResult.isValid) {
      rejectedRows.push({
        rowNumber,
        pageNumber,
        sourceType,
        rawRecord: JSON.stringify(row),
        reason: amountResult.error || 'Monetary amount validation failed',
        errorCode: 'INVALID_AMOUNT',
      });
      continue;
    }

    // 4. Optional Fields
    const refNumber = normalizeText(mapping.referenceNumber ? row[mapping.referenceNumber] : undefined);
    const chequeNumber = normalizeText(mapping.chequeNumber ? row[mapping.chequeNumber] : undefined);
    const accountNumber = normalizeText(mapping.accountNumber ? row[mapping.accountNumber] : undefined);
    const customerSupplier = normalizeText(
      mapping.customerSupplier ? row[mapping.customerSupplier] : undefined
    );
    const journalNumber = normalizeText(
      mapping.journalNumber ? row[mapping.journalNumber] : undefined
    );
    const balanceDec = normalizeDecimal(mapping.balance ? row[mapping.balance] : undefined);

    // Determine transaction type
    let finalTxnType = 'DEBIT';
    if (amountResult.credit.gt(0)) {
      finalTxnType = 'CREDIT';
    }

    // Generate cryptographic fingerprint for duplicate detection
    const fingerprint = generateTransactionFingerprint({
      organizationId,
      bankAccountId,
      dateStr: parsedDate.toISOString().substring(0, 10),
      refNumber,
      chequeNumber,
      amountStr: amountResult.signedAmount.toFixed(4),
      descriptionOrNarration: cleanDesc,
    });

    // Accumulate totals
    totalCredits = totalCredits.plus(amountResult.credit);
    totalDebits = totalDebits.plus(amountResult.debit);

    if (!earliestDate || parsedDate < earliestDate) {
      earliestDate = parsedDate;
    }
    if (!latestDate || parsedDate > latestDate) {
      latestDate = parsedDate;
    }

    validTransactions.push({
      rowNumber,
      pageNumber,
      transactionDate: parsedDate,
      valueDate: parsedValueDate,
      description: cleanDesc,
      narration: cleanDesc,
      referenceNumber: refNumber,
      chequeNumber,
      accountNumber,
      transactionType: finalTxnType,
      currency: baseCurrency,
      debit: amountResult.debit,
      credit: amountResult.credit,
      signedAmount: amountResult.signedAmount,
      balance: balanceDec,
      customerSupplier,
      journalNumber,
      rawRecord: row,
      normalizedData: {
        date: parsedDate.toISOString().substring(0, 10),
        valueDate: parsedValueDate ? parsedValueDate.toISOString().substring(0, 10) : null,
        description: cleanDesc,
        debit: amountResult.debit.toString(),
        credit: amountResult.credit.toString(),
        signedAmount: amountResult.signedAmount.toString(),
        balance: balanceDec ? balanceDec.toString() : null,
        ref: refNumber,
        cheque: chequeNumber,
      },
      transactionFingerprint: fingerprint,
      isSuspectedDuplicate: false,
    });
  }

  return {
    validTransactions,
    rejectedRows,
    totalCredits,
    totalDebits,
    earliestDate,
    latestDate,
  };
}
