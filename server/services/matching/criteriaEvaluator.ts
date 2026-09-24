import { Decimal } from '@prisma/client/runtime/library';

/**
 * Matching Criterion Code Identifiers from Project Specification
 */
export const CRITERION_CODES = {
  AMOUNT: 'AMOUNT',
  REFERENCE_NUMBER: 'REFERENCE_NUMBER',
  CHEQUE_NUMBER: 'CHEQUE_NUMBER',
  ACCOUNT_NUMBER: 'ACCOUNT_NUMBER',
  TRANSACTION_DATE: 'TRANSACTION_DATE',
  TRANSACTION_TYPE: 'TRANSACTION_TYPE',
  CURRENCY: 'CURRENCY',
  NARRATION: 'NARRATION',
  CUSTOMER_SUPPLIER: 'CUSTOMER_SUPPLIER',
} as const;

export type CriterionCode = typeof CRITERION_CODES[keyof typeof CRITERION_CODES];

export const STRONG_CRITERIA: readonly CriterionCode[] = [
  CRITERION_CODES.AMOUNT,
  CRITERION_CODES.REFERENCE_NUMBER,
  CRITERION_CODES.CHEQUE_NUMBER,
  CRITERION_CODES.ACCOUNT_NUMBER,
] as const;

/**
 * Resolved Tolerance Values Model
 */
export interface ResolvedTolerances {
  sourceLevel: 'RULE' | 'BANK_ACCOUNT' | 'ORGANIZATION' | 'DEFAULT';
  amountToleranceType: 'FIXED' | 'PERCENTAGE';
  amountToleranceValue: number;
  amountToleranceMax: number | null;
  dateToleranceDays: number;
  isDateToleranceAllowed: boolean;
  currencyRateTolerancePercent: number;
}

/**
 * Raw tolerance config input from DB or mock
 */
export interface RawToleranceInput {
  level: string; // MATCHING_RULE | BANK_ACCOUNT | ORGANIZATION
  amountToleranceType?: string | null;
  amountToleranceValue?: number | string | Decimal | null;
  amountToleranceMax?: number | string | Decimal | null;
  dateToleranceDays?: number | null;
  isDateToleranceAllowed?: boolean | null;
  currencyRateTolerancePercent?: number | string | Decimal | null;
}

/**
 * Minimal interface representing a Bank Transaction for matching
 */
export interface EvaluatableBankTransaction {
  id?: string;
  organizationId?: string;
  bankAccountId?: string;
  transactionDate: Date | string;
  valueDate?: Date | string | null;
  signedAmount: number | string | Decimal;
  debit?: number | string | Decimal;
  credit?: number | string | Decimal;
  currency: string;
  transactionType?: string;
  referenceNumber?: string | null;
  chequeNumber?: string | null;
  accountNumber?: string | null;
  narration?: string | null;
  description?: string | null;
}

/**
 * Minimal interface representing a GL Transaction for matching
 */
export interface EvaluatableGlTransaction {
  id?: string;
  organizationId?: string;
  bankAccountId?: string | null;
  transactionDate: Date | string;
  valueDate?: Date | string | null;
  amount: number | string | Decimal;
  debit?: number | string | Decimal;
  credit?: number | string | Decimal;
  currency: string;
  transactionType?: string;
  referenceNumber?: string | null;
  chequeNumber?: string | null;
  accountNumber?: string | null;
  narration: string;
  customerSupplier?: string | null;
}

/**
 * Individual Criterion Evaluation Detail
 */
export interface CriterionEvaluationResult {
  code: CriterionCode;
  name: string;
  isStrong: boolean;
  evaluated: boolean;
  satisfied: boolean;
  score: number; // 1 for match, 0 for mismatch, or fractional (0-1) for fuzzy
  reason?: string;
  details?: Record<string, unknown>;
}

/**
 * Full Evaluation Output
 */
export interface EvaluationSummary {
  eligible: boolean;
  totalCriteriaEvaluated: number;
  totalCriteriaSatisfied: number;
  strongCriteriaSatisfied: number;
  criteriaEvaluated: CriterionCode[];
  criteriaSatisfied: CriterionCode[];
  criteriaFailed: CriterionCode[];
  strongCriteriaList: CriterionCode[];
  resolvedTolerances: ResolvedTolerances;
  confidenceScore: number; // Normalized 0.0 to 1.0
  breakdown: Record<CriterionCode, CriterionEvaluationResult>;
  organizationIsolated: boolean;
}

/**
 * Helper to safely convert Decimal/string/number to standard JS number
 */
export function toNumber(val: number | string | Decimal | null | undefined, defaultVal = 0): number {
  if (val === null || val === undefined) return defaultVal;
  if (typeof val === 'number') return isNaN(val) ? defaultVal : val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? defaultVal : parsed;
  }
  if (typeof (val as any).toNumber === 'function') {
    return (val as any).toNumber();
  }
  const parsed = parseFloat(String(val));
  return isNaN(parsed) ? defaultVal : parsed;
}

/**
 * Helper to clean/normalize text strings (removes punctuation, lowercases, trims redundant spaces)
 */
export function normalizeString(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Helper to normalize alphanumeric reference/account/cheque numbers
 * (strips dashes, spaces, slashes, leading zeros, and common prefixes like CHQ, ACC, REF, TXN)
 */
export function normalizeReference(ref: string | null | undefined): string {
  if (!ref) return '';
  let cleaned = ref.toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Strip common bank/cheque/account prefixes if followed by digits
  cleaned = cleaned.replace(/^(?:CHQ|CHECK|CHEQUE|ACC|ACCT|REF|TXN|TRF|INV|DOC)([0-9]+)$/, '$1');
  return cleaned.replace(/^0+/, '') || cleaned;
}

/**
 * Bigram Dice-coefficient string similarity metric (0.0 to 1.0)
 */
export function calculateStringSimilarity(str1: string | null | undefined, str2: string | null | undefined): number {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);

  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) {
    const longer = Math.max(s1.length, s2.length);
    const shorter = Math.min(s1.length, s2.length);
    return Math.max(0.75, shorter / longer);
  }

  const getBigrams = (s: string) => {
    const bigrams = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) {
      bigrams.add(s.substring(i, i + 2));
    }
    return bigrams;
  };

  const b1 = getBigrams(s1);
  const b2 = getBigrams(s2);

  if (b1.size === 0 || b2.size === 0) return 0;

  let intersection = 0;
  for (const bg of b1) {
    if (b2.has(bg)) intersection++;
  }

  return (2.0 * intersection) / (b1.size + b2.size);
}

/**
 * Resolve hierarchical tolerances:
 * 1. Rule-level
 * 2. Bank-Account-level
 * 3. Organization-level
 * 4. System default fallback
 */
export function resolveTolerances(
  ruleTolerance?: RawToleranceInput | null,
  accountTolerance?: RawToleranceInput | null,
  orgTolerance?: RawToleranceInput | null
): ResolvedTolerances {
  const chosen = ruleTolerance || accountTolerance || orgTolerance;

  const defaultTolerance: ResolvedTolerances = {
    sourceLevel: 'DEFAULT',
    amountToleranceType: 'FIXED',
    amountToleranceValue: 0.0,
    amountToleranceMax: null,
    dateToleranceDays: 0,
    isDateToleranceAllowed: false,
    currencyRateTolerancePercent: 0.0,
  };

  if (!chosen) {
    return defaultTolerance;
  }

  let sourceLevel: ResolvedTolerances['sourceLevel'] = 'ORGANIZATION';
  if (chosen.level === 'MATCHING_RULE' || chosen === ruleTolerance) {
    sourceLevel = 'RULE';
  } else if (chosen.level === 'BANK_ACCOUNT' || chosen === accountTolerance) {
    sourceLevel = 'BANK_ACCOUNT';
  } else if (chosen.level === 'ORGANIZATION' || chosen === orgTolerance) {
    sourceLevel = 'ORGANIZATION';
  }

  const amountType = (chosen.amountToleranceType?.toUpperCase() === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED') as 'FIXED' | 'PERCENTAGE';
  const amountVal = Math.max(0, toNumber(chosen.amountToleranceValue, 0));
  const amountMax = chosen.amountToleranceMax != null ? toNumber(chosen.amountToleranceMax) : null;
  const dateDays = Math.max(0, Math.floor(toNumber(chosen.dateToleranceDays, 0)));
  const isDateAllowed = chosen.isDateToleranceAllowed === true || dateDays > 0;
  const currencyRateTol = Math.max(0, toNumber(chosen.currencyRateTolerancePercent, 0));

  return {
    sourceLevel,
    amountToleranceType: amountType,
    amountToleranceValue: amountVal,
    amountToleranceMax: amountMax,
    dateToleranceDays: dateDays,
    isDateToleranceAllowed: isDateAllowed,
    currencyRateTolerancePercent: currencyRateTol,
  };
}

/**
 * Options for criteria evaluator
 */
export interface EvaluationOptions {
  tolerances?: ResolvedTolerances;
  allowFuzzyNarration?: boolean;
  narrationSimilarityThreshold?: number; // default 0.65
  counterpartySimilarityThreshold?: number; // default 0.65
  minTotalCriteria?: number; // default 3
  minStrongCriteria?: number; // default 2
}

/**
 * Phase 3 Criteria Evaluation Service
 */
export class CriteriaEvaluationService {
  /**
   * Evaluates a bank transaction against a GL transaction for matching eligibility.
   */
  public static evaluatePair(
    bankTx: EvaluatableBankTransaction,
    glTx: EvaluatableGlTransaction,
    options: EvaluationOptions = {}
  ): EvaluationSummary {
    const minTotal = options.minTotalCriteria ?? 3;
    const minStrong = options.minStrongCriteria ?? 2;
    const narrationThreshold = options.narrationSimilarityThreshold ?? 0.65;
    const counterpartyThreshold = options.counterpartySimilarityThreshold ?? 0.65;

    const tolerances = options.tolerances ?? {
      sourceLevel: 'DEFAULT',
      amountToleranceType: 'FIXED',
      amountToleranceValue: 0.0,
      amountToleranceMax: null,
      dateToleranceDays: 0,
      isDateToleranceAllowed: false,
      currencyRateTolerancePercent: 0.0,
    };

    // Check organization isolation if both specify organizationId
    const organizationIsolated =
      !bankTx.organizationId || !glTx.organizationId || bankTx.organizationId === glTx.organizationId;

    const breakdown: Record<CriterionCode, CriterionEvaluationResult> = {} as any;

    // 1. AMOUNT (Strong)
    // Absolute magnitude comparison (abs(bank.signedAmount) vs abs(gl.amount))
    const bankAmt = Math.abs(toNumber(bankTx.signedAmount));
    const glAmt = Math.abs(toNumber(glTx.amount));
    const amountDiff = Math.abs(bankAmt - glAmt);

    let amountMatched = false;
    let allowedAmountTolerance = 0;

    if (tolerances.amountToleranceType === 'PERCENTAGE') {
      const base = Math.max(bankAmt, glAmt);
      allowedAmountTolerance = (base * tolerances.amountToleranceValue) / 100;
      if (tolerances.amountToleranceMax != null && tolerances.amountToleranceMax > 0) {
        allowedAmountTolerance = Math.min(allowedAmountTolerance, tolerances.amountToleranceMax);
      }
    } else {
      allowedAmountTolerance = tolerances.amountToleranceValue;
    }

    // Exact or within tolerance (rounded to 4 decimal places)
    const isExactAmount = Math.abs(amountDiff) < 0.0001;
    const isWithinAmountTolerance = amountDiff <= allowedAmountTolerance + 0.0001;
    amountMatched = isExactAmount || isWithinAmountTolerance;

    breakdown[CRITERION_CODES.AMOUNT] = {
      code: CRITERION_CODES.AMOUNT,
      name: 'Transaction Amount',
      isStrong: true,
      evaluated: true,
      satisfied: amountMatched,
      score: isExactAmount ? 1.0 : amountMatched ? 0.9 : 0,
      reason: amountMatched
        ? isExactAmount
          ? 'Exact amount match'
          : `Amount within tolerance (diff: ${amountDiff.toFixed(2)} <= allowed: ${allowedAmountTolerance.toFixed(2)})`
        : `Amount discrepancy (diff: ${amountDiff.toFixed(2)} exceeds allowed: ${allowedAmountTolerance.toFixed(2)})`,
      details: { bankAmt, glAmt, amountDiff, allowedAmountTolerance, isExactAmount },
    };

    // 2. REFERENCE_NUMBER (Strong)
    const bankRef = bankTx.referenceNumber?.trim() || '';
    const glRef = glTx.referenceNumber?.trim() || '';
    let refMatched = false;
    let refExact = false;
    let refNormalized = false;

    if (bankRef && glRef) {
      if (bankRef === glRef) {
        refMatched = true;
        refExact = true;
      } else {
        const normBankRef = normalizeReference(bankRef);
        const normGlRef = normalizeReference(glRef);
        if (normBankRef && normGlRef && normBankRef === normGlRef) {
          refMatched = true;
          refNormalized = true;
        }
      }
    }

    breakdown[CRITERION_CODES.REFERENCE_NUMBER] = {
      code: CRITERION_CODES.REFERENCE_NUMBER,
      name: 'Reference Number',
      isStrong: true,
      evaluated: Boolean(bankRef || glRef),
      satisfied: refMatched,
      score: refExact ? 1.0 : refNormalized ? 0.95 : 0,
      reason: refMatched
        ? refExact
          ? 'Exact reference number match'
          : 'Normalized reference number match'
        : bankRef && glRef
        ? `Reference mismatch ('${bankRef}' vs '${glRef}')`
        : 'Reference number absent on one or both transactions',
      details: { bankRef, glRef, refExact, refNormalized },
    };

    // 3. CHEQUE_NUMBER (Strong)
    const bankCheque = bankTx.chequeNumber?.trim() || '';
    const glCheque = glTx.chequeNumber?.trim() || '';
    let chequeMatched = false;

    if (bankCheque && glCheque) {
      const normB = normalizeReference(bankCheque);
      const normG = normalizeReference(glCheque);
      chequeMatched = normB === normG;
    }

    breakdown[CRITERION_CODES.CHEQUE_NUMBER] = {
      code: CRITERION_CODES.CHEQUE_NUMBER,
      name: 'Cheque / Check Number',
      isStrong: true,
      evaluated: Boolean(bankCheque || glCheque),
      satisfied: chequeMatched,
      score: chequeMatched ? 1.0 : 0,
      reason: chequeMatched
        ? 'Cheque number match'
        : bankCheque && glCheque
        ? `Cheque number mismatch ('${bankCheque}' vs '${glCheque}')`
        : 'Cheque number absent on one or both transactions',
      details: { bankCheque, glCheque },
    };

    // 4. ACCOUNT_NUMBER (Strong)
    const bankAcc = bankTx.accountNumber?.trim() || '';
    const glAcc = glTx.accountNumber?.trim() || '';
    let accMatched = false;

    if (bankAcc && glAcc) {
      const normB = normalizeReference(bankAcc);
      const normG = normalizeReference(glAcc);
      accMatched = normB === normG;
    }

    breakdown[CRITERION_CODES.ACCOUNT_NUMBER] = {
      code: CRITERION_CODES.ACCOUNT_NUMBER,
      name: 'Account Number',
      isStrong: true,
      evaluated: Boolean(bankAcc || glAcc),
      satisfied: accMatched,
      score: accMatched ? 1.0 : 0,
      reason: accMatched
        ? 'Account number match'
        : bankAcc && glAcc
        ? `Account number mismatch ('${bankAcc}' vs '${glAcc}')`
        : 'Account number absent on one or both transactions',
      details: { bankAcc, glAcc },
    };

    // 5. TRANSACTION_DATE (Additional)
    const bankDate = bankTx.transactionDate ? new Date(bankTx.transactionDate) : null;
    const isBankDateValid = bankDate !== null && !isNaN(bankDate.getTime());
    const glDate = glTx.transactionDate ? new Date(glTx.transactionDate) : null;
    const isGlDateValid = glDate !== null && !isNaN(glDate.getTime());

    let dateMatched = false;
    let isExactDate = false;
    let diffDays = 0;

    if (isBankDateValid && isGlDateValid && bankDate && glDate) {
      const diffMs = Math.abs(bankDate.getTime() - glDate.getTime());
      diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      isExactDate =
        bankDate.getUTCFullYear() === glDate.getUTCFullYear() &&
        bankDate.getUTCMonth() === glDate.getUTCMonth() &&
        bankDate.getUTCDate() === glDate.getUTCDate();

      const isDateWithinTol = tolerances.isDateToleranceAllowed && diffDays <= tolerances.dateToleranceDays;
      dateMatched = isExactDate || isDateWithinTol;
    }

    breakdown[CRITERION_CODES.TRANSACTION_DATE] = {
      code: CRITERION_CODES.TRANSACTION_DATE,
      name: 'Transaction Date',
      isStrong: false,
      evaluated: Boolean(isBankDateValid && isGlDateValid),
      satisfied: dateMatched,
      score: isExactDate ? 1.0 : dateMatched ? Math.max(0.7, 1.0 - (diffDays / (tolerances.dateToleranceDays + 1)) * 0.3) : 0,
      reason: dateMatched
        ? isExactDate
          ? 'Exact date match'
          : `Date within tolerance (${diffDays} days difference <= ${tolerances.dateToleranceDays} allowed)`
        : isBankDateValid && isGlDateValid
        ? `Date mismatch (${diffDays} days difference exceeds allowed ${tolerances.dateToleranceDays} days)`
        : 'Transaction date absent or invalid on one or both transactions',
      details: {
        bankDate: isBankDateValid && bankDate ? bankDate.toISOString().slice(0, 10) : null,
        glDate: isGlDateValid && glDate ? glDate.toISOString().slice(0, 10) : null,
        diffDays,
        allowedDays: tolerances.dateToleranceDays,
      },
    };

    // 6. TRANSACTION_TYPE (Additional)
    const bankType = (bankTx.transactionType || '').toUpperCase().trim();
    const glType = (glTx.transactionType || '').toUpperCase().trim();
    let typeMatched = false;

    if (bankType && glType) {
      if (bankType === glType) {
        typeMatched = true;
      } else if (
        (bankType === 'DEBIT' && glType === 'DEBIT') ||
        (bankType === 'CREDIT' && glType === 'CREDIT') ||
        (bankType === 'TRANSFER' && (glType === 'JOURNAL' || glType === 'TRANSFER'))
      ) {
        typeMatched = true;
      }
    }

    breakdown[CRITERION_CODES.TRANSACTION_TYPE] = {
      code: CRITERION_CODES.TRANSACTION_TYPE,
      name: 'Transaction Type',
      isStrong: false,
      evaluated: Boolean(bankType && glType),
      satisfied: typeMatched,
      score: typeMatched ? 1.0 : 0,
      reason: typeMatched
        ? 'Transaction type compatible'
        : `Transaction type mismatch ('${bankType}' vs '${glType}')`,
      details: { bankType, glType },
    };

    // 7. CURRENCY (Additional)
    const bankCurr = (bankTx.currency || '').toUpperCase().trim();
    const glCurr = (glTx.currency || '').toUpperCase().trim();
    const isExactCurrency = bankCurr && glCurr && bankCurr === glCurr;
    // If currency differs but currencyRateTolerancePercent > 0, currency can be evaluated
    const currencyMatched = isExactCurrency;

    breakdown[CRITERION_CODES.CURRENCY] = {
      code: CRITERION_CODES.CURRENCY,
      name: 'Currency',
      isStrong: false,
      evaluated: Boolean(bankCurr && glCurr),
      satisfied: currencyMatched,
      score: currencyMatched ? 1.0 : 0,
      reason: currencyMatched ? `Currency match (${bankCurr})` : `Currency mismatch ('${bankCurr}' vs '${glCurr}')`,
      details: { bankCurr, glCurr },
    };

    // 8. NARRATION (Additional)
    const bankText = bankTx.narration || bankTx.description || '';
    const glText = glTx.narration || '';
    const narrationSim = calculateStringSimilarity(bankText, glText);
    const narrationMatched = narrationSim >= narrationThreshold;

    breakdown[CRITERION_CODES.NARRATION] = {
      code: CRITERION_CODES.NARRATION,
      name: 'Narration / Description',
      isStrong: false,
      evaluated: Boolean(bankText && glText),
      satisfied: narrationMatched,
      score: narrationMatched ? narrationSim : 0,
      reason: narrationMatched
        ? `Description similarity (${(narrationSim * 100).toFixed(1)}% >= ${(narrationThreshold * 100).toFixed(0)}%)`
        : `Description dissimilarity (${(narrationSim * 100).toFixed(1)}% < ${(narrationThreshold * 100).toFixed(0)}%)`,
      details: { bankText, glText, similarity: narrationSim, threshold: narrationThreshold },
    };

    // 9. CUSTOMER_SUPPLIER (Additional)
    // Matches GL customerSupplier against bank narration/description or vice-versa
    const glParty = glTx.customerSupplier || '';
    let partySim = 0;
    let partyMatched = false;

    if (glParty && bankText) {
      partySim = calculateStringSimilarity(bankText, glParty);
      partyMatched = partySim >= counterpartyThreshold;
    }

    breakdown[CRITERION_CODES.CUSTOMER_SUPPLIER] = {
      code: CRITERION_CODES.CUSTOMER_SUPPLIER,
      name: 'Customer / Supplier Name',
      isStrong: false,
      evaluated: Boolean(glParty && bankText),
      satisfied: partyMatched,
      score: partyMatched ? partySim : 0,
      reason: partyMatched
        ? `Counterparty similarity (${(partySim * 100).toFixed(1)}% >= ${(counterpartyThreshold * 100).toFixed(0)}%)`
        : glParty
        ? `Counterparty dissimilarity (${(partySim * 100).toFixed(1)}% < ${(counterpartyThreshold * 100).toFixed(0)}%)`
        : 'Customer/supplier identifier not present',
      details: { glParty, bankText, similarity: partySim, threshold: counterpartyThreshold },
    };

    // Aggregations
    const allResults = Object.values(breakdown);
    const evaluatedList = allResults.filter((r) => r.evaluated).map((r) => r.code);
    const satisfiedList = allResults.filter((r) => r.satisfied).map((r) => r.code);
    const failedList = allResults.filter((r) => r.evaluated && !r.satisfied).map((r) => r.code);
    const strongSatisfiedList = satisfiedList.filter((code) => STRONG_CRITERIA.includes(code));

    const totalSatisfied = satisfiedList.length;
    const strongSatisfied = strongSatisfiedList.length;

    // Strict eligibility requirement:
    // 1. Organization isolation preserved (cannot match cross-organization)
    // 2. Minimum total criteria (>= 3)
    // 3. Minimum strong criteria (>= 2)
    const eligible = organizationIsolated && totalSatisfied >= minTotal && strongSatisfied >= minStrong;

    // Confidence Score Calculation
    // Base score from ratio of evaluated criteria that were satisfied, weighted towards strong criteria
    const strongMetCount = strongSatisfiedList.length;
    const additionalMetCount = totalSatisfied - strongMetCount;
    
    // When eligible (>= 2 strong, >= 3 total), baseline is at least 0.70 for full matches
    const strongWeight = Math.min(1.0, strongMetCount / 2); // 1.0 when >= 2 strong met
    const totalWeight = Math.min(1.0, totalSatisfied / 4); // Scales with total criteria met
    
    const confidenceScore = eligible
      ? Math.min(1.0, Math.max(0.65, 0.50 + strongWeight * 0.30 + totalWeight * 0.20))
      : Math.min(0.49, (strongMetCount * 0.15) + (additionalMetCount * 0.08));

    return {
      eligible,
      totalCriteriaEvaluated: evaluatedList.length,
      totalCriteriaSatisfied: totalSatisfied,
      strongCriteriaSatisfied: strongSatisfied,
      criteriaEvaluated: evaluatedList,
      criteriaSatisfied: satisfiedList,
      criteriaFailed: failedList,
      strongCriteriaList: strongSatisfiedList,
      resolvedTolerances: tolerances,
      confidenceScore: Math.round(confidenceScore * 100) / 100,
      breakdown,
      organizationIsolated,
    };
  }

  /**
   * Evaluates a group of bank transactions against a group of GL transactions (1:1, 1:many, many:1, many:many)
   */
  public static evaluateGroup(
    bankTxs: EvaluatableBankTransaction[],
    glTxs: EvaluatableGlTransaction[],
    options: EvaluationOptions = {}
  ): EvaluationSummary {
    if (bankTxs.length === 1 && glTxs.length === 1) {
      return this.evaluatePair(bankTxs[0], glTxs[0], options);
    }

    const minTotal = options.minTotalCriteria ?? 3;
    const minStrong = options.minStrongCriteria ?? 2;
    const narrationThreshold = options.narrationSimilarityThreshold ?? 0.65;
    const counterpartyThreshold = options.counterpartySimilarityThreshold ?? 0.65;

    const tolerances = options.tolerances ?? {
      sourceLevel: 'DEFAULT',
      amountToleranceType: 'FIXED',
      amountToleranceValue: 0.0,
      amountToleranceMax: null,
      dateToleranceDays: 0,
      isDateToleranceAllowed: false,
      currencyRateTolerancePercent: 0.0,
    };

    // Organization Isolation Check
    const orgIds = new Set<string>();
    for (const b of bankTxs) {
      if (b.organizationId) orgIds.add(b.organizationId);
    }
    for (const g of glTxs) {
      if (g.organizationId) orgIds.add(g.organizationId);
    }
    const organizationIsolated = orgIds.size <= 1;

    const breakdown: Record<CriterionCode, CriterionEvaluationResult> = {} as any;

    // 1. AMOUNT (Strong) - Aggregate sum
    const totalBankAmt = bankTxs.reduce((sum, b) => sum + Math.abs(toNumber(b.signedAmount)), 0);
    const totalGlAmt = glTxs.reduce((sum, g) => sum + Math.abs(toNumber(g.amount)), 0);
    const amountDiff = Math.abs(totalBankAmt - totalGlAmt);

    let allowedAmountTolerance = 0;
    if (tolerances.amountToleranceType === 'PERCENTAGE') {
      const base = Math.max(totalBankAmt, totalGlAmt);
      allowedAmountTolerance = (base * tolerances.amountToleranceValue) / 100;
      if (tolerances.amountToleranceMax != null && tolerances.amountToleranceMax > 0) {
        allowedAmountTolerance = Math.min(allowedAmountTolerance, tolerances.amountToleranceMax);
      }
    } else {
      allowedAmountTolerance = tolerances.amountToleranceValue;
    }

    const isExactAmount = Math.abs(amountDiff) < 0.0001;
    const isWithinAmountTolerance = amountDiff <= allowedAmountTolerance + 0.0001;
    const amountMatched = isExactAmount || isWithinAmountTolerance;

    breakdown[CRITERION_CODES.AMOUNT] = {
      code: CRITERION_CODES.AMOUNT,
      name: 'Transaction Amount',
      isStrong: true,
      evaluated: bankTxs.length > 0 && glTxs.length > 0,
      satisfied: amountMatched,
      score: isExactAmount ? 1.0 : amountMatched ? 0.9 : 0,
      reason: amountMatched
        ? isExactAmount
          ? 'Exact aggregate amount match'
          : `Aggregate amount within tolerance (diff: ${amountDiff.toFixed(2)} <= allowed: ${allowedAmountTolerance.toFixed(2)})`
        : `Aggregate amount discrepancy (diff: ${amountDiff.toFixed(2)} exceeds allowed: ${allowedAmountTolerance.toFixed(2)})`,
      details: { totalBankAmt, totalGlAmt, amountDiff, allowedAmountTolerance, isExactAmount },
    };

    // 2. REFERENCE_NUMBER (Strong)
    const bankRefs = bankTxs.map((b) => b.referenceNumber?.trim()).filter(Boolean) as string[];
    const glRefs = glTxs.map((g) => g.referenceNumber?.trim()).filter(Boolean) as string[];
    let refExact = false;
    let refNormalized = false;

    if (bankRefs.length > 0 && glRefs.length > 0) {
      for (const bRef of bankRefs) {
        for (const gRef of glRefs) {
          if (bRef === gRef) {
            refExact = true;
            break;
          } else {
            const normB = normalizeReference(bRef);
            const normG = normalizeReference(gRef);
            if (normB && normG && normB === normG) {
              refNormalized = true;
            }
          }
        }
        if (refExact) break;
      }
    }
    const refMatched = refExact || refNormalized;

    breakdown[CRITERION_CODES.REFERENCE_NUMBER] = {
      code: CRITERION_CODES.REFERENCE_NUMBER,
      name: 'Reference Number',
      isStrong: true,
      evaluated: Boolean(bankRefs.length > 0 || glRefs.length > 0),
      satisfied: refMatched,
      score: refExact ? 1.0 : refNormalized ? 0.95 : 0,
      reason: refMatched
        ? refExact
          ? 'Exact reference number match in group'
          : 'Normalized reference number match in group'
        : bankRefs.length > 0 && glRefs.length > 0
        ? 'No matching reference numbers found between bank and GL transactions'
        : 'Reference numbers absent on bank or GL transactions',
      details: { bankRefs, glRefs, refExact, refNormalized },
    };

    // 3. CHEQUE_NUMBER (Strong)
    const bankCheques = bankTxs.map((b) => b.chequeNumber?.trim()).filter(Boolean) as string[];
    const glCheques = glTxs.map((g) => g.chequeNumber?.trim()).filter(Boolean) as string[];
    let chequeMatched = false;

    if (bankCheques.length > 0 && glCheques.length > 0) {
      for (const bC of bankCheques) {
        for (const gC of glCheques) {
          const normB = normalizeReference(bC);
          const normG = normalizeReference(gC);
          if (normB && normG && normB === normG) {
            chequeMatched = true;
            break;
          }
        }
        if (chequeMatched) break;
      }
    }

    breakdown[CRITERION_CODES.CHEQUE_NUMBER] = {
      code: CRITERION_CODES.CHEQUE_NUMBER,
      name: 'Cheque / Check Number',
      isStrong: true,
      evaluated: Boolean(bankCheques.length > 0 || glCheques.length > 0),
      satisfied: chequeMatched,
      score: chequeMatched ? 1.0 : 0,
      reason: chequeMatched
        ? 'Cheque number match in group'
        : bankCheques.length > 0 && glCheques.length > 0
        ? 'No matching cheque numbers found'
        : 'Cheque numbers absent on bank or GL transactions',
      details: { bankCheques, glCheques },
    };

    // 4. ACCOUNT_NUMBER (Strong)
    const bankAccs = bankTxs.map((b) => b.accountNumber?.trim()).filter(Boolean) as string[];
    const glAccs = glTxs.map((g) => g.accountNumber?.trim()).filter(Boolean) as string[];
    let accMatched = false;

    if (bankAccs.length > 0 && glAccs.length > 0) {
      for (const bA of bankAccs) {
        for (const gA of glAccs) {
          const normB = normalizeReference(bA);
          const normG = normalizeReference(gA);
          if (normB && normG && normB === normG) {
            accMatched = true;
            break;
          }
        }
        if (accMatched) break;
      }
    }

    breakdown[CRITERION_CODES.ACCOUNT_NUMBER] = {
      code: CRITERION_CODES.ACCOUNT_NUMBER,
      name: 'Account Number',
      isStrong: true,
      evaluated: Boolean(bankAccs.length > 0 || glAccs.length > 0),
      satisfied: accMatched,
      score: accMatched ? 1.0 : 0,
      reason: accMatched
        ? 'Account number match in group'
        : bankAccs.length > 0 && glAccs.length > 0
        ? 'No matching account numbers found'
        : 'Account numbers absent on bank or GL transactions',
      details: { bankAccs, glAccs },
    };

    // 5. TRANSACTION_DATE (Additional)
    const bankDates = bankTxs
      .map((b) => (b.transactionDate ? new Date(b.transactionDate) : null))
      .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
    const glDates = glTxs
      .map((g) => (g.transactionDate ? new Date(g.transactionDate) : null))
      .filter((d): d is Date => d !== null && !isNaN(d.getTime()));

    let dateMatched = false;
    let isExactDate = false;
    let maxDateDiffDays = 0;

    if (bankDates.length > 0 && glDates.length > 0) {
      const bankTimes = bankDates.map((d) => d.getTime());
      const glTimes = glDates.map((d) => d.getTime());
      const minBank = Math.min(...bankTimes);
      const maxBank = Math.max(...bankTimes);
      const minGl = Math.min(...glTimes);
      const maxGl = Math.max(...glTimes);

      const spanDiffMs = Math.max(Math.abs(minBank - minGl), Math.abs(maxBank - maxGl));
      maxDateDiffDays = Math.round(spanDiffMs / (1000 * 60 * 60 * 24));

      isExactDate = maxDateDiffDays === 0;
      const isDateWithinTol = tolerances.isDateToleranceAllowed && maxDateDiffDays <= tolerances.dateToleranceDays;
      dateMatched = isExactDate || isDateWithinTol;
    }

    breakdown[CRITERION_CODES.TRANSACTION_DATE] = {
      code: CRITERION_CODES.TRANSACTION_DATE,
      name: 'Transaction Date',
      isStrong: false,
      evaluated: bankDates.length > 0 && glDates.length > 0,
      satisfied: dateMatched,
      score: isExactDate ? 1.0 : dateMatched ? Math.max(0.7, 1.0 - (maxDateDiffDays / (tolerances.dateToleranceDays + 1)) * 0.3) : 0,
      reason: dateMatched
        ? isExactDate
          ? 'Exact date span match in group'
          : `Date span within tolerance (${maxDateDiffDays} days difference <= ${tolerances.dateToleranceDays} allowed)`
        : `Date span mismatch (${maxDateDiffDays} days difference exceeds allowed ${tolerances.dateToleranceDays} days)`,
      details: { maxDateDiffDays, allowedDays: tolerances.dateToleranceDays },
    };

    // 6. TRANSACTION_TYPE (Additional)
    const bankTypes = Array.from(new Set(bankTxs.map((b) => (b.transactionType || '').toUpperCase().trim()).filter(Boolean)));
    const glTypes = Array.from(new Set(glTxs.map((g) => (g.transactionType || '').toUpperCase().trim()).filter(Boolean)));
    let typeMatched = false;

    if (bankTypes.length > 0 && glTypes.length > 0) {
      typeMatched = bankTypes.every((bt) =>
        glTypes.some(
          (gt) =>
            bt === gt ||
            (bt === 'DEBIT' && gt === 'DEBIT') ||
            (bt === 'CREDIT' && gt === 'CREDIT') ||
            (bt === 'TRANSFER' && (gt === 'JOURNAL' || gt === 'TRANSFER'))
        )
      );
    }

    breakdown[CRITERION_CODES.TRANSACTION_TYPE] = {
      code: CRITERION_CODES.TRANSACTION_TYPE,
      name: 'Transaction Type',
      isStrong: false,
      evaluated: bankTypes.length > 0 && glTypes.length > 0,
      satisfied: typeMatched,
      score: typeMatched ? 1.0 : 0,
      reason: typeMatched ? 'Transaction types compatible across group' : 'Transaction type incompatibility in group',
      details: { bankTypes, glTypes },
    };

    // 7. CURRENCY (Additional)
    const bankCurrs = Array.from(new Set(bankTxs.map((b) => (b.currency || '').toUpperCase().trim()).filter(Boolean)));
    const glCurrs = Array.from(new Set(glTxs.map((g) => (g.currency || '').toUpperCase().trim()).filter(Boolean)));
    const currencyMatched =
      bankCurrs.length === 1 && glCurrs.length === 1 && bankCurrs[0] === glCurrs[0];

    breakdown[CRITERION_CODES.CURRENCY] = {
      code: CRITERION_CODES.CURRENCY,
      name: 'Currency',
      isStrong: false,
      evaluated: bankCurrs.length > 0 && glCurrs.length > 0,
      satisfied: currencyMatched,
      score: currencyMatched ? 1.0 : 0,
      reason: currencyMatched ? `Currency match (${bankCurrs[0]})` : 'Currency discrepancy across transactions in group',
      details: { bankCurrs, glCurrs },
    };

    // 8. NARRATION (Additional)
    let maxNarrationSim = 0;
    for (const b of bankTxs) {
      const bText = b.narration || b.description || '';
      for (const g of glTxs) {
        const gText = g.narration || '';
        const sim = calculateStringSimilarity(bText, gText);
        if (sim > maxNarrationSim) maxNarrationSim = sim;
      }
    }
    const narrationMatched = maxNarrationSim >= narrationThreshold;

    breakdown[CRITERION_CODES.NARRATION] = {
      code: CRITERION_CODES.NARRATION,
      name: 'Narration / Description',
      isStrong: false,
      evaluated: bankTxs.some((b) => b.narration || b.description) && glTxs.some((g) => g.narration),
      satisfied: narrationMatched,
      score: narrationMatched ? maxNarrationSim : 0,
      reason: narrationMatched
        ? `Description similarity in group (${(maxNarrationSim * 100).toFixed(1)}% >= ${(narrationThreshold * 100).toFixed(0)}%)`
        : `Description dissimilarity in group (${(maxNarrationSim * 100).toFixed(1)}% < ${(narrationThreshold * 100).toFixed(0)}%)`,
      details: { maxSimilarity: maxNarrationSim, threshold: narrationThreshold },
    };

    // 9. CUSTOMER_SUPPLIER (Additional)
    let maxPartySim = 0;
    for (const b of bankTxs) {
      const bText = b.narration || b.description || '';
      for (const g of glTxs) {
        const gParty = g.customerSupplier || '';
        if (gParty && bText) {
          const sim = calculateStringSimilarity(bText, gParty);
          if (sim > maxPartySim) maxPartySim = sim;
        }
      }
    }
    const partyMatched = maxPartySim >= counterpartyThreshold;

    breakdown[CRITERION_CODES.CUSTOMER_SUPPLIER] = {
      code: CRITERION_CODES.CUSTOMER_SUPPLIER,
      name: 'Customer / Supplier Name',
      isStrong: false,
      evaluated: bankTxs.some((b) => b.narration || b.description) && glTxs.some((g) => g.customerSupplier),
      satisfied: partyMatched,
      score: partyMatched ? maxPartySim : 0,
      reason: partyMatched
        ? `Counterparty similarity in group (${(maxPartySim * 100).toFixed(1)}% >= ${(counterpartyThreshold * 100).toFixed(0)}%)`
        : 'Counterparty dissimilarity in group',
      details: { maxSimilarity: maxPartySim, threshold: counterpartyThreshold },
    };

    // Aggregations
    const allResults = Object.values(breakdown);
    const evaluatedList = allResults.filter((r) => r.evaluated).map((r) => r.code);
    const satisfiedList = allResults.filter((r) => r.satisfied).map((r) => r.code);
    const failedList = allResults.filter((r) => r.evaluated && !r.satisfied).map((r) => r.code);
    const strongSatisfiedList = satisfiedList.filter((code) => STRONG_CRITERIA.includes(code));

    const totalSatisfied = satisfiedList.length;
    const strongSatisfied = strongSatisfiedList.length;

    const eligible = organizationIsolated && totalSatisfied >= minTotal && strongSatisfied >= minStrong;

    const strongMetCount = strongSatisfiedList.length;
    const additionalMetCount = totalSatisfied - strongMetCount;
    const strongWeight = Math.min(1.0, strongMetCount / 2);
    const totalWeight = Math.min(1.0, totalSatisfied / 4);

    const confidenceScore = eligible
      ? Math.min(1.0, Math.max(0.65, 0.50 + strongWeight * 0.30 + totalWeight * 0.20))
      : Math.min(0.49, strongMetCount * 0.15 + additionalMetCount * 0.08);

    return {
      eligible,
      totalCriteriaEvaluated: evaluatedList.length,
      totalCriteriaSatisfied: totalSatisfied,
      strongCriteriaSatisfied: strongSatisfied,
      criteriaEvaluated: evaluatedList,
      criteriaSatisfied: satisfiedList,
      criteriaFailed: failedList,
      strongCriteriaList: strongSatisfiedList,
      resolvedTolerances: tolerances,
      confidenceScore: Math.round(confidenceScore * 100) / 100,
      breakdown,
      organizationIsolated,
    };
  }
}
