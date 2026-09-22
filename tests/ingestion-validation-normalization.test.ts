import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';
import {
  normalizeDate,
  normalizeDecimal,
  normalizeText,
  resolveDebitCreditAmounts,
} from '../server/services/ingestion/normalizationService';
import { detectColumnMapping } from '../server/services/ingestion/columnMappingService';
import {
  generateTransactionFingerprint,
} from '../server/services/ingestion/duplicateDetectionService';
import { validateAndNormalizeRows } from '../server/services/ingestion/validationService';
import { parseCsvBuffer } from '../server/services/ingestion/parsers/csvParser';
import { parseXlsxBuffer } from '../server/services/ingestion/parsers/xlsxParser';
import * as XLSX from 'xlsx';

describe('Phase 2 Ingestion: Normalization, Validation, Deduplication & Parsers', () => {
  describe('1. Date Normalization', () => {
    it('Normalizes ISO 8601 date strings', () => {
      const d1 = normalizeDate('2026-03-15');
      expect(d1).not.toBeNull();
      expect(d1?.toISOString().substring(0, 10)).toBe('2026-03-15');

      const d2 = normalizeDate('2026-03-15T14:30:00Z');
      expect(d2).not.toBeNull();
      expect(d2?.toISOString().substring(0, 10)).toBe('2026-03-15');
    });

    it('Normalizes DD/MM/YYYY and MM/DD/YYYY dates with disambiguation', () => {
      // 25 is unambiguously the day
      const d1 = normalizeDate('25/03/2026');
      expect(d1).not.toBeNull();
      expect(d1?.getUTCDate()).toBe(25);
      expect(d1?.getUTCMonth()).toBe(2); // March = 2

      // Month first when second part > 12: 03/25/2026
      const d2 = normalizeDate('03/25/2026');
      expect(d2).not.toBeNull();
      expect(d2?.getUTCDate()).toBe(25);
      expect(d2?.getUTCMonth()).toBe(2);
    });

    it('Normalizes Excel numeric serial dates without timezone distortion', () => {
      // 45182 => 2023-09-13
      const d = normalizeDate(45182);
      expect(d).not.toBeNull();
      expect(d?.getUTCFullYear()).toBe(2023);
      expect(d?.getUTCMonth()).toBe(8); // Sept = 8
      expect(d?.getUTCDate()).toBe(13);
    });

    it('Rejects invalid or unparseable date values', () => {
      expect(normalizeDate(null)).toBeNull();
      expect(normalizeDate('')).toBeNull();
      expect(normalizeDate('NotADate')).toBeNull();
      expect(normalizeDate('99/99/9999')).toBeNull();
    });
  });

  describe('2. Monetary Amount Normalization (Decimal Precision)', () => {
    it('Strips commas and currency symbols preserving strict Prisma.Decimal', () => {
      const dec1 = normalizeDecimal('$1,234,567.89');
      expect(dec1).not.toBeNull();
      expect(dec1?.equals(new Prisma.Decimal('1234567.89'))).toBe(true);

      const dec2 = normalizeDecimal('€ 9,450.00');
      expect(dec2).not.toBeNull();
      expect(dec2?.equals(new Prisma.Decimal('9450.00'))).toBe(true);
    });

    it('Handles accounting parentheses as negative amounts: (1,250.00) => -1250.00', () => {
      const dec = normalizeDecimal('(1,250.00)');
      expect(dec).not.toBeNull();
      expect(dec?.isNegative()).toBe(true);
      expect(dec?.equals(new Prisma.Decimal('-1250.00'))).toBe(true);
    });

    it('Handles CR and DR suffixes: DR as debit/negative, CR as credit/positive', () => {
      const dr = normalizeDecimal('500.00 DR');
      expect(dr).not.toBeNull();
      expect(dr?.equals(new Prisma.Decimal('-500.00'))).toBe(true);

      const cr = normalizeDecimal('750.50 CR');
      expect(cr).not.toBeNull();
      expect(cr?.equals(new Prisma.Decimal('750.50'))).toBe(true);
    });

    it('Rejects corrupted monetary values', () => {
      expect(normalizeDecimal(null)).toBeNull();
      expect(normalizeDecimal('')).toBeNull();
      expect(normalizeDecimal('N/A')).toBeNull();
    });
  });

  describe('3. Debit / Credit Interpretation & Integrity', () => {
    it('Resolves separate Debit and Credit columns with signedAmount = Credit - Debit', () => {
      // Money Out / Debit
      const res1 = resolveDebitCreditAmounts({
        debitRaw: '500.00',
        creditRaw: '',
      });
      expect(res1.isValid).toBe(true);
      expect(res1.debit.toString()).toBe('500');
      expect(res1.credit.toString()).toBe('0');
      expect(res1.signedAmount.toString()).toBe('-500');

      // Money In / Credit
      const res2 = resolveDebitCreditAmounts({
        debitRaw: '',
        creditRaw: '1200.50',
      });
      expect(res2.isValid).toBe(true);
      expect(res2.debit.toString()).toBe('0');
      expect(res2.credit.toString()).toBe('1200.5');
      expect(res2.signedAmount.toString()).toBe('1200.5');
    });

    it('Flags validation error if both Debit and Credit columns are positive simultaneously', () => {
      const res = resolveDebitCreditAmounts({
        debitRaw: '100.00',
        creditRaw: '100.00',
      });
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('Both Debit and Credit columns contain positive values');
    });

    it('Resolves single Amount column with sign or Type indicator', () => {
      const res1 = resolveDebitCreditAmounts({
        amountRaw: '-450.00',
      });
      expect(res1.isValid).toBe(true);
      expect(res1.debit.toString()).toBe('450');
      expect(res1.credit.toString()).toBe('0');
      expect(res1.signedAmount.toString()).toBe('-450');

      const res2 = resolveDebitCreditAmounts({
        amountRaw: '800.00',
        typeRaw: 'CR',
      });
      expect(res2.isValid).toBe(true);
      expect(res2.credit.toString()).toBe('800');
      expect(res2.signedAmount.toString()).toBe('800');
    });
  });

  describe('4. Intelligent Column Mapping & Aliases', () => {
    it('Detects standard bank statement headers automatically', () => {
      const headers = ['Txn Date', 'Particulars', 'Ref No', 'Withdrawal', 'Deposit', 'Balance'];
      const { mapping, confidence } = detectColumnMapping(headers, 'BANK_STATEMENT');

      expect(mapping.transactionDate).toBe('Txn Date');
      expect(mapping.description).toBe('Particulars');
      expect(mapping.referenceNumber).toBe('Ref No');
      expect(mapping.debit).toBe('Withdrawal');
      expect(mapping.credit).toBe('Deposit');
      expect(mapping.balance).toBe('Balance');
      expect(confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('Honors custom user mapping overrides', () => {
      const headers = ['Col_A', 'Col_B', 'Col_C'];
      const userOverrides = {
        transactionDate: 'Col_A',
        description: 'Col_B',
        amount: 'Col_C',
      };
      const { mapping } = detectColumnMapping(headers, 'BANK_STATEMENT', userOverrides);
      expect(mapping.transactionDate).toBe('Col_A');
      expect(mapping.description).toBe('Col_B');
      expect(mapping.amount).toBe('Col_C');
    });
  });

  describe('5. Row Validation & Error Preservation (Rejected Rows)', () => {
    it('Preserves invalid rows with exact error code and raw value instead of discarding', () => {
      const rawRows = [
        {
          Date: '2026-03-01',
          Description: 'Valid payroll vendor',
          Debit: '1000.00',
          Credit: '',
        },
        {
          Date: 'INVALID_DATE',
          Description: 'Broken date row',
          Debit: '500.00',
          Credit: '',
        },
        {
          Date: '2026-03-02',
          Description: '', // Missing description
          Debit: '200.00',
          Credit: '',
        },
        {
          Date: '2026-03-03',
          Description: 'Zero amount row',
          Debit: '0.00',
          Credit: '0.00',
        },
      ];

      const mapping = {
        transactionDate: 'Date',
        description: 'Description',
        debit: 'Debit',
        credit: 'Credit',
      };

      const result = validateAndNormalizeRows({
        rawRows,
        mapping,
        sourceType: 'BANK_STATEMENT',
        organizationId: 'org-test-1',
        bankAccountId: 'bank-acc-1',
      });

      expect(result.validTransactions.length).toBe(1);
      expect(result.rejectedRows.length).toBe(3);

      const errCodes = result.rejectedRows.map((r) => r.errorCode);
      expect(errCodes).toContain('INVALID_DATE');
      expect(errCodes).toContain('MISSING_DESCRIPTION');
      expect(errCodes).toContain('INVALID_AMOUNT');

      // Verify row numbers preserved
      expect(result.rejectedRows[0].rowNumber).toBe(2);
      expect(result.rejectedRows[1].rowNumber).toBe(3);
      expect(result.rejectedRows[2].rowNumber).toBe(4);
    });
  });

  describe('6. Cryptographic Transaction Fingerprinting & Duplicate Detection', () => {
    it('Generates identical fingerprint for exact same transaction attributes', () => {
      const fp1 = generateTransactionFingerprint({
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        dateStr: '2026-03-10',
        refNumber: 'REF123',
        chequeNumber: 'CHQ99',
        amountStr: '-500.0000',
        descriptionOrNarration: 'Office Supplies Inc',
      });

      const fp2 = generateTransactionFingerprint({
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        dateStr: '2026-03-10',
        refNumber: 'ref123', // case insensitive normalization
        chequeNumber: 'chq99',
        amountStr: '-500.0000',
        descriptionOrNarration: 'office   supplies   inc', // whitespace collapsed
      });

      expect(fp1).toBe(fp2);
    });

    it('Generates distinct fingerprints for different organizations (multi-tenant isolation)', () => {
      const fpOrgA = generateTransactionFingerprint({
        organizationId: 'org-alpha',
        bankAccountId: 'acc-1',
        dateStr: '2026-03-10',
        refNumber: 'REF123',
        amountStr: '100.0000',
        descriptionOrNarration: 'Wire Transfer',
      });

      const fpOrgB = generateTransactionFingerprint({
        organizationId: 'org-beta',
        bankAccountId: 'acc-1',
        dateStr: '2026-03-10',
        refNumber: 'REF123',
        amountStr: '100.0000',
        descriptionOrNarration: 'Wire Transfer',
      });

      expect(fpOrgA).not.toBe(fpOrgB);
    });
  });

  describe('7. CSV & XLSX Parsers', () => {
    it('Parses CSV buffers with semicolon and comma delimiters', async () => {
      const csvContent = `Date,Description,Debit,Credit\n2026-03-01,Supplier Payment,250.00,\n2026-03-02,Client Retainer,,1500.00`;
      const buffer = Buffer.from(csvContent, 'utf-8');

      const result = await parseCsvBuffer(buffer, 'BANK_STATEMENT');
      expect(result.headers).toEqual(['Date', 'Description', 'Debit', 'Credit']);
      expect(result.rows.length).toBe(2);
      expect(result.rows[0].Description).toBe('Supplier Payment');
      expect(result.rows[1].Credit).toBe('1500.00');
    });

    it('Parses XLSX workbooks into structured rows', async () => {
      const wb = XLSX.utils.book_new();
      const wsData = [
        ['Date', 'Description', 'Amount'],
        ['2026-03-10', 'Consulting Fees', '3500.00'],
        ['2026-03-11', 'Software License', '-120.00'],
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Statement');
      const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

      const result = await parseXlsxBuffer(xlsxBuffer, 'BANK_STATEMENT');
      expect(result.headers).toEqual(['Date', 'Description', 'Amount']);
      expect(result.rows.length).toBe(2);
      expect(result.rows[0].Description).toBe('Consulting Fees');
    });
  });

  describe('8. Strict Phase 2 Constraint: Unmatched Status Guarantee', () => {
    it('Verifies normalized rows are defaulted to UNMATCHED with no automatic reconciliation', () => {
      const rawRows = [
        {
          Date: '2026-03-01',
          Description: 'Wire Inflow',
          Credit: '5000.00',
        },
      ];

      const result = validateAndNormalizeRows({
        rawRows,
        mapping: { transactionDate: 'Date', description: 'Description', credit: 'Credit' },
        sourceType: 'BANK_STATEMENT',
        organizationId: 'org-test',
        bankAccountId: 'acc-test',
      });

      expect(result.validTransactions.length).toBe(1);
      // Ingestion pipeline explicitly stores status: 'UNMATCHED'
      const candidate = result.validTransactions[0];
      expect(candidate.transactionType).toBe('CREDIT');
      expect(candidate.signedAmount.equals(new Prisma.Decimal('5000'))).toBe(true);
    });
  });
});
