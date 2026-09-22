import { Prisma } from '@prisma/client';

/**
 * Normalizes varied date string formats or Excel date numbers into a clean Date object.
 */
export function normalizeDate(rawVal: unknown): Date | null {
  if (rawVal === null || rawVal === undefined) return null;

  if (rawVal instanceof Date) {
    return isNaN(rawVal.getTime()) ? null : rawVal;
  }

  // Handle Excel numeric date serials (e.g., 45182.5)
  if (typeof rawVal === 'number' && !isNaN(rawVal)) {
    if (rawVal > 1000 && rawVal < 100000) {
      // Excel epoch begins Dec 30, 1899 due to 1900 leap year bug
      const msPerDay = 86400000;
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const parsedDate = new Date(excelEpoch.getTime() + Math.round(rawVal * msPerDay));
      return isNaN(parsedDate.getTime()) ? null : parsedDate;
    }
  }

  const str = String(rawVal).trim();
  if (!str) return null;

  // 1. ISO 8601 (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;
  }

  // 2. Format: DD/MM/YYYY or MM/DD/YYYY or YYYY/MM/DD
  const slashParts = str.split(/[/\-.]/);
  if (slashParts.length === 3) {
    const p0 = parseInt(slashParts[0], 10);
    const p1 = parseInt(slashParts[1], 10);
    const p2 = parseInt(slashParts[2], 10);

    if (isNaN(p0) || isNaN(p1) || isNaN(p2)) return null;

    // If year is the first part: YYYY/MM/DD
    if (p0 > 1000) {
      if (p1 < 1 || p1 > 12 || p2 < 1 || p2 > 31) return null;
      const d = new Date(Date.UTC(p0, p1 - 1, p2));
      if (!isNaN(d.getTime()) && d.getUTCMonth() === p1 - 1 && d.getUTCDate() === p2) return d;
      return null;
    }

    // If year is the third part: DD/MM/YYYY or MM/DD/YYYY
    let year = p2;
    if (year < 100) {
      year += year >= 70 ? 1900 : 2000;
    }
    if (year < 1970 || year > 2100) return null;

    // If both parts are > 12, neither can be month -> invalid
    if (p0 > 12 && p1 > 12) return null;
    if (p0 < 1 || p1 < 1) return null;

    // Disambiguate day and month:
    // If p0 > 12, p0 is definitely the Day (DD/MM/YYYY)
    if (p0 > 12 && p1 <= 12) {
      if (p0 > 31) return null;
      const d = new Date(Date.UTC(year, p1 - 1, p0));
      if (!isNaN(d.getTime()) && d.getUTCMonth() === p1 - 1 && d.getUTCDate() === p0) return d;
      return null;
    }

    // If p1 > 12, p1 is definitely the Day (MM/DD/YYYY)
    if (p1 > 12 && p0 <= 12) {
      if (p1 > 31) return null;
      const d = new Date(Date.UTC(year, p0 - 1, p1));
      if (!isNaN(d.getTime()) && d.getUTCMonth() === p0 - 1 && d.getUTCDate() === p1) return d;
      return null;
    }

    // Default to international DD/MM/YYYY if both <= 12
    const d = new Date(Date.UTC(year, p1 - 1, p0));
    if (!isNaN(d.getTime()) && d.getUTCMonth() === p1 - 1 && d.getUTCDate() === p0) return d;
    return null;
  }

  // 3. Formats with textual months (e.g. 15-Jan-2026, Jan 15 2026)
  if (/[a-zA-Z]/.test(str)) {
    const textDate = new Date(str);
    if (!isNaN(textDate.getTime()) && textDate.getFullYear() >= 1970 && textDate.getFullYear() <= 2100) {
      return textDate;
    }
  }

  return null;
}

/**
 * Normalizes raw string/number into a strict Prisma.Decimal with sign.
 * Handles commas, currency symbols, parentheses for negative amounts, trailing minus, CR/DR notations.
 */
export function normalizeDecimal(rawVal: unknown): Prisma.Decimal | null {
  if (rawVal === null || rawVal === undefined) return null;

  if (rawVal instanceof Prisma.Decimal) return rawVal;

  if (typeof rawVal === 'number') {
    if (isNaN(rawVal)) return null;
    return new Prisma.Decimal(rawVal.toFixed(4));
  }

  let str = String(rawVal).trim();
  if (!str) return null;

  let isNegative = false;

  // Check for accounting parentheses: (1,250.00) => -1250.00
  if (str.startsWith('(') && str.endsWith(')')) {
    isNegative = true;
    str = str.substring(1, str.length - 1).trim();
  }

  // Check for leading or trailing minus
  if (str.startsWith('-')) {
    isNegative = true;
    str = str.substring(1).trim();
  } else if (str.endsWith('-')) {
    isNegative = true;
    str = str.substring(0, str.length - 1).trim();
  }

  // Check for CR / DR suffixes:
  // In bank statements, DR = Debit (money out/withdrawal), CR = Credit (deposit)
  if (/\bDR\b/i.test(str)) {
    isNegative = true;
    str = str.replace(/\bDR\b/gi, '').trim();
  } else if (/\bCR\b/i.test(str)) {
    str = str.replace(/\bCR\b/gi, '').trim();
  }

  // Strip currency symbols and letters: $, €, £, ¥, ₹, commas, etc.
  str = str.replace(/[^0-9.]/g, '');

  if (!str || isNaN(Number(str))) return null;

  try {
    const decimal = new Prisma.Decimal(str);
    return isNegative ? decimal.negated() : decimal;
  } catch {
    return null;
  }
}

/**
 * Normalizes string fields by trimming whitespace and collapsing excess inner spacing.
 */
export function normalizeText(rawVal: unknown): string | null {
  if (rawVal === null || rawVal === undefined) return null;
  const str = String(rawVal).trim().replace(/\s+/g, ' ');
  return str.length > 0 ? str : null;
}

/**
 * Resolves debit, credit, and signedAmount based on inputs.
 * In bank statements:
 * - credit = money in / deposit (positive signedAmount)
 * - debit = money out / withdrawal (negative signedAmount)
 */
export function resolveDebitCreditAmounts(params: {
  debitRaw?: unknown;
  creditRaw?: unknown;
  amountRaw?: unknown;
  typeRaw?: unknown;
}): {
  debit: Prisma.Decimal;
  credit: Prisma.Decimal;
  signedAmount: Prisma.Decimal;
  isValid: boolean;
  error?: string;
} {
  const debitDec = normalizeDecimal(params.debitRaw);
  const creditDec = normalizeDecimal(params.creditRaw);
  const amountDec = normalizeDecimal(params.amountRaw);
  const typeStr = normalizeText(params.typeRaw)?.toUpperCase();

  const zero = new Prisma.Decimal(0);

  // Scenario 1: Separate Debit & Credit columns provided
  if (debitDec !== null || creditDec !== null) {
    const finalDebit = debitDec ? debitDec.abs() : zero;
    const finalCredit = creditDec ? creditDec.abs() : zero;

    if (finalDebit.gt(zero) && finalCredit.gt(zero)) {
      return {
        debit: finalDebit,
        credit: finalCredit,
        signedAmount: zero,
        isValid: false,
        error: 'Ambiguous transaction: Both Debit and Credit columns contain positive values simultaneously',
      };
    }

    if (finalDebit.isZero() && finalCredit.isZero()) {
      return {
        debit: zero,
        credit: zero,
        signedAmount: zero,
        isValid: false,
        error: 'Zero monetary amount in both Debit and Credit columns',
      };
    }

    // signedAmount: positive for credit, negative for debit
    const signedAmount = finalCredit.minus(finalDebit);

    return {
      debit: finalDebit,
      credit: finalCredit,
      signedAmount,
      isValid: true,
    };
  }

  // Scenario 2: Single Amount column with Type or Sign
  if (amountDec !== null) {
    if (amountDec.isZero()) {
      return {
        debit: zero,
        credit: zero,
        signedAmount: zero,
        isValid: false,
        error: 'Transaction amount cannot be zero',
      };
    }

    // Check if Type specifies Debit / Credit
    const isDebitType = typeStr === 'DEBIT' || typeStr === 'DR' || typeStr === 'WITHDRAWAL' || typeStr === 'OUT';
    const isCreditType = typeStr === 'CREDIT' || typeStr === 'CR' || typeStr === 'DEPOSIT' || typeStr === 'IN';

    if (isDebitType) {
      const absAmount = amountDec.abs();
      return {
        debit: absAmount,
        credit: zero,
        signedAmount: absAmount.negated(),
        isValid: true,
      };
    }

    if (isCreditType) {
      const absAmount = amountDec.abs();
      return {
        debit: zero,
        credit: absAmount,
        signedAmount: absAmount,
        isValid: true,
      };
    }

    // If amount is signed (< 0 is debit, > 0 is credit)
    if (amountDec.isNegative()) {
      const absAmount = amountDec.abs();
      return {
        debit: absAmount,
        credit: zero,
        signedAmount: amountDec,
        isValid: true,
      };
    } else {
      return {
        debit: zero,
        credit: amountDec,
        signedAmount: amountDec,
        isValid: true,
      };
    }
  }

  return {
    debit: zero,
    credit: zero,
    signedAmount: zero,
    isValid: false,
    error: 'Missing required monetary amount or debit/credit columns',
  };
}
