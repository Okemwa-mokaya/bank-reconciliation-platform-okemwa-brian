import { describe, it, expect } from 'vitest';
import {
  CriteriaEvaluationService,
  resolveTolerances,
  calculateStringSimilarity,
  normalizeReference,
  CRITERION_CODES,
  STRONG_CRITERIA,
  EvaluatableBankTransaction,
  EvaluatableGlTransaction,
  RawToleranceInput,
} from '../server/services/matching/criteriaEvaluator';

describe('Phase 3 — Stage 1: Criteria Evaluator & Tolerance Resolver', () => {
  // -------------------------------------------------------------
  // 1. Tolerance Hierarchy Precedence Tests
  // -------------------------------------------------------------
  describe('Tolerance Hierarchy Precedence (Rule -> Bank Account -> Organization -> Default)', () => {
    it('1. Falls back to default values when no tolerance config is provided', () => {
      const resolved = resolveTolerances();
      expect(resolved.sourceLevel).toBe('DEFAULT');
      expect(resolved.amountToleranceType).toBe('FIXED');
      expect(resolved.amountToleranceValue).toBe(0.0);
      expect(resolved.dateToleranceDays).toBe(0);
      expect(resolved.isDateToleranceAllowed).toBe(false);
      expect(resolved.currencyRateTolerancePercent).toBe(0.0);
    });

    it('2. Organization-level tolerance is used when higher levels are undefined', () => {
      const orgTol: RawToleranceInput = {
        level: 'ORGANIZATION',
        amountToleranceType: 'FIXED',
        amountToleranceValue: 5.0,
        dateToleranceDays: 3,
        isDateToleranceAllowed: true,
        currencyRateTolerancePercent: 0.5,
      };

      const resolved = resolveTolerances(null, null, orgTol);
      expect(resolved.sourceLevel).toBe('ORGANIZATION');
      expect(resolved.amountToleranceValue).toBe(5.0);
      expect(resolved.dateToleranceDays).toBe(3);
      expect(resolved.isDateToleranceAllowed).toBe(true);
      expect(resolved.currencyRateTolerancePercent).toBe(0.5);
    });

    it('3. Bank-account-level tolerance overrides Organization-level tolerance', () => {
      const orgTol: RawToleranceInput = {
        level: 'ORGANIZATION',
        amountToleranceType: 'FIXED',
        amountToleranceValue: 10.0,
        dateToleranceDays: 7,
      };
      const accTol: RawToleranceInput = {
        level: 'BANK_ACCOUNT',
        amountToleranceType: 'PERCENTAGE',
        amountToleranceValue: 1.5,
        dateToleranceDays: 2,
        isDateToleranceAllowed: true,
      };

      const resolved = resolveTolerances(null, accTol, orgTol);
      expect(resolved.sourceLevel).toBe('BANK_ACCOUNT');
      expect(resolved.amountToleranceType).toBe('PERCENTAGE');
      expect(resolved.amountToleranceValue).toBe(1.5);
      expect(resolved.dateToleranceDays).toBe(2);
    });

    it('4. Rule-level tolerance takes highest precedence over Account and Organization levels', () => {
      const orgTol: RawToleranceInput = {
        level: 'ORGANIZATION',
        amountToleranceValue: 10.0,
      };
      const accTol: RawToleranceInput = {
        level: 'BANK_ACCOUNT',
        amountToleranceValue: 2.0,
      };
      const ruleTol: RawToleranceInput = {
        level: 'MATCHING_RULE',
        amountToleranceType: 'FIXED',
        amountToleranceValue: 0.1,
        dateToleranceDays: 1,
        isDateToleranceAllowed: true,
      };

      const resolved = resolveTolerances(ruleTol, accTol, orgTol);
      expect(resolved.sourceLevel).toBe('RULE');
      expect(resolved.amountToleranceValue).toBe(0.1);
      expect(resolved.dateToleranceDays).toBe(1);
    });
  });

  // -------------------------------------------------------------
  // 2. Individual Criteria Evaluation Tests
  // -------------------------------------------------------------
  describe('Individual Criteria Evaluation', () => {
    it('1. Exact Amount matches and Amount within tolerance matches', () => {
      const bankTx: EvaluatableBankTransaction = {
        transactionDate: '2026-09-01T00:00:00Z',
        signedAmount: -500.0,
        currency: 'USD',
      };
      const glTxExact: EvaluatableGlTransaction = {
        transactionDate: '2026-09-01T00:00:00Z',
        amount: 500.0,
        currency: 'USD',
        narration: 'Vendor Payment',
      };

      const resExact = CriteriaEvaluationService.evaluatePair(bankTx, glTxExact);
      expect(resExact.breakdown[CRITERION_CODES.AMOUNT].satisfied).toBe(true);
      expect(resExact.breakdown[CRITERION_CODES.AMOUNT].score).toBe(1.0);

      // Amount with fixed tolerance
      const glTxTol: EvaluatableGlTransaction = {
        transactionDate: '2026-09-01T00:00:00Z',
        amount: 500.45,
        currency: 'USD',
        narration: 'Vendor Payment',
      };
      const tolerances = resolveTolerances({
        level: 'MATCHING_RULE',
        amountToleranceType: 'FIXED',
        amountToleranceValue: 0.5,
      });

      const resTol = CriteriaEvaluationService.evaluatePair(bankTx, glTxTol, { tolerances });
      expect(resTol.breakdown[CRITERION_CODES.AMOUNT].satisfied).toBe(true);
      expect(resTol.breakdown[CRITERION_CODES.AMOUNT].score).toBe(0.9);

      // Exceeding tolerance fails
      const glTxFail: EvaluatableGlTransaction = {
        transactionDate: '2026-09-01T00:00:00Z',
        amount: 501.5,
        currency: 'USD',
        narration: 'Vendor Payment',
      };
      const resFail = CriteriaEvaluationService.evaluatePair(bankTx, glTxFail, { tolerances });
      expect(resFail.breakdown[CRITERION_CODES.AMOUNT].satisfied).toBe(false);
    });

    it('2. Exact and Normalized Reference Number matching', () => {
      expect(normalizeReference('REF-00123-A')).toBe('REF00123A');
      expect(normalizeReference('00098421')).toBe('98421');

      const bankTx: EvaluatableBankTransaction = {
        transactionDate: '2026-09-01T00:00:00Z',
        signedAmount: -100.0,
        currency: 'USD',
        referenceNumber: 'TXN-9988-ABC',
      };
      const glTxNorm: EvaluatableGlTransaction = {
        transactionDate: '2026-09-01T00:00:00Z',
        amount: 100.0,
        currency: 'USD',
        referenceNumber: 'txn 9988 abc',
        narration: 'Transfer',
      };

      const res = CriteriaEvaluationService.evaluatePair(bankTx, glTxNorm);
      expect(res.breakdown[CRITERION_CODES.REFERENCE_NUMBER].satisfied).toBe(true);
      expect(res.breakdown[CRITERION_CODES.REFERENCE_NUMBER].details?.refNormalized).toBe(true);
    });

    it('3. Cheque Number and Account Number matching', () => {
      const bankTx: EvaluatableBankTransaction = {
        transactionDate: '2026-09-01T00:00:00Z',
        signedAmount: -250.0,
        currency: 'USD',
        chequeNumber: 'CHQ-00445',
        accountNumber: 'ACC-8812',
      };
      const glTx: EvaluatableGlTransaction = {
        transactionDate: '2026-09-01T00:00:00Z',
        amount: 250.0,
        currency: 'USD',
        chequeNumber: '00445',
        accountNumber: '8812',
        narration: 'Supplier cheque',
      };

      const res = CriteriaEvaluationService.evaluatePair(bankTx, glTx);
      expect(res.breakdown[CRITERION_CODES.CHEQUE_NUMBER].satisfied).toBe(true);
      expect(res.breakdown[CRITERION_CODES.ACCOUNT_NUMBER].satisfied).toBe(true);
    });

    it('4. Exact Date and Date within tolerance', () => {
      const bankTx: EvaluatableBankTransaction = {
        transactionDate: '2026-09-10T12:00:00Z',
        signedAmount: -150.0,
        currency: 'USD',
      };
      const glTxDiffDate: EvaluatableGlTransaction = {
        transactionDate: '2026-09-13T08:00:00Z', // 3 days difference
        amount: 150.0,
        currency: 'USD',
        narration: 'Office Supplies',
      };

      // Without date tolerance allowed -> fails
      const resNoTol = CriteriaEvaluationService.evaluatePair(bankTx, glTxDiffDate);
      expect(resNoTol.breakdown[CRITERION_CODES.TRANSACTION_DATE].satisfied).toBe(false);

      // With 3-day date tolerance -> passes
      const tolerances = resolveTolerances({
        level: 'ORGANIZATION',
        dateToleranceDays: 3,
        isDateToleranceAllowed: true,
      });
      const resTol = CriteriaEvaluationService.evaluatePair(bankTx, glTxDiffDate, { tolerances });
      expect(resTol.breakdown[CRITERION_CODES.TRANSACTION_DATE].satisfied).toBe(true);
    });

    it('5. Currency matching and mismatch detection', () => {
      const bankTx: EvaluatableBankTransaction = {
        transactionDate: '2026-09-01T00:00:00Z',
        signedAmount: -100.0,
        currency: 'USD',
      };
      const glTxUSD: EvaluatableGlTransaction = {
        transactionDate: '2026-09-01T00:00:00Z',
        amount: 100.0,
        currency: 'USD',
        narration: 'Test',
      };
      const glTxEUR: EvaluatableGlTransaction = {
        transactionDate: '2026-09-01T00:00:00Z',
        amount: 100.0,
        currency: 'EUR',
        narration: 'Test',
      };

      expect(CriteriaEvaluationService.evaluatePair(bankTx, glTxUSD).breakdown[CRITERION_CODES.CURRENCY].satisfied).toBe(true);
      expect(CriteriaEvaluationService.evaluatePair(bankTx, glTxEUR).breakdown[CRITERION_CODES.CURRENCY].satisfied).toBe(false);
    });

    it('6. Narration / Description similarity', () => {
      const bankTx: EvaluatableBankTransaction = {
        transactionDate: '2026-09-01T00:00:00Z',
        signedAmount: -2000.0,
        currency: 'USD',
        description: 'ACME WIRE TRF TO TECH LOGISTICS CORP REF 990',
      };
      const glTx: EvaluatableGlTransaction = {
        transactionDate: '2026-09-01T00:00:00Z',
        amount: 2000.0,
        currency: 'USD',
        narration: 'Tech Logistics Corp wire payment ref 990',
      };

      const res = CriteriaEvaluationService.evaluatePair(bankTx, glTx);
      expect(res.breakdown[CRITERION_CODES.NARRATION].satisfied).toBe(true);
      expect(res.breakdown[CRITERION_CODES.NARRATION].score).toBeGreaterThanOrEqual(0.65);
    });

    it('7. Counterparty / Customer-Supplier similarity', () => {
      const bankTx: EvaluatableBankTransaction = {
        transactionDate: '2026-09-01T00:00:00Z',
        signedAmount: -1200.0,
        currency: 'USD',
        description: 'PURCHASE FROM DELTA DISTRIBUTORS LTD',
      };
      const glTx: EvaluatableGlTransaction = {
        transactionDate: '2026-09-01T00:00:00Z',
        amount: 1200.0,
        currency: 'USD',
        narration: 'Inventory stock replenishment',
        customerSupplier: 'Delta Distributors',
      };

      const res = CriteriaEvaluationService.evaluatePair(bankTx, glTx);
      expect(res.breakdown[CRITERION_CODES.CUSTOMER_SUPPLIER].satisfied).toBe(true);
    });
  });

  // -------------------------------------------------------------
  // 3. Matching Eligibility Threshold & Guardrail Tests
  // -------------------------------------------------------------
  describe('Matching Eligibility Thresholds (Min 3 Total, Min 2 Strong)', () => {
    it('1. Eligible candidate satisfies >= 3 total criteria and >= 2 strong criteria', () => {
      // Satisfies:
      // Strong 1: AMOUNT (exact)
      // Strong 2: REFERENCE_NUMBER (exact)
      // Additional 1: TRANSACTION_DATE (exact)
      // Additional 2: CURRENCY (exact)
      const bankTx: EvaluatableBankTransaction = {
        organizationId: 'org-1',
        transactionDate: '2026-09-05T00:00:00Z',
        signedAmount: -15000.0,
        currency: 'USD',
        referenceNumber: 'WIRE-2026-8891',
        transactionType: 'DEBIT',
        description: 'Vendor payment',
      };
      const glTx: EvaluatableGlTransaction = {
        organizationId: 'org-1',
        transactionDate: '2026-09-05T00:00:00Z',
        amount: 15000.0,
        currency: 'USD',
        referenceNumber: 'WIRE-2026-8891',
        transactionType: 'DEBIT',
        narration: 'Vendor payment invoice 44',
      };

      const evaluation = CriteriaEvaluationService.evaluatePair(bankTx, glTx);

      expect(evaluation.totalCriteriaSatisfied).toBeGreaterThanOrEqual(3);
      expect(evaluation.strongCriteriaSatisfied).toBeGreaterThanOrEqual(2);
      expect(evaluation.eligible).toBe(true);
      expect(evaluation.confidenceScore).toBeGreaterThanOrEqual(0.7);
      expect(evaluation.strongCriteriaList).toContain(CRITERION_CODES.AMOUNT);
      expect(evaluation.strongCriteriaList).toContain(CRITERION_CODES.REFERENCE_NUMBER);
    });

    it('2. Ineligible candidate when total criteria >= 3 but only 1 strong criterion is met', () => {
      // Meets:
      // Strong 1: AMOUNT (exact)
      // Strong 2: REFERENCE_NUMBER (MISMATCH)
      // Additional 1: TRANSACTION_DATE (exact)
      // Additional 2: CURRENCY (exact)
      // Additional 3: TRANSACTION_TYPE (exact)
      // Total met: 4, but strong met: 1
      const bankTx: EvaluatableBankTransaction = {
        organizationId: 'org-1',
        transactionDate: '2026-09-05T00:00:00Z',
        signedAmount: -50.0,
        currency: 'USD',
        referenceNumber: 'REF-BANK-111',
        transactionType: 'DEBIT',
        description: 'General expense',
      };
      const glTx: EvaluatableGlTransaction = {
        organizationId: 'org-1',
        transactionDate: '2026-09-05T00:00:00Z',
        amount: 50.0,
        currency: 'USD',
        referenceNumber: 'REF-GL-999', // Mismatched reference!
        transactionType: 'DEBIT',
        narration: 'General expense',
      };

      const evaluation = CriteriaEvaluationService.evaluatePair(bankTx, glTx);

      expect(evaluation.strongCriteriaSatisfied).toBe(1); // Only AMOUNT is met among strong
      expect(evaluation.eligible).toBe(false); // Ineligible because minStrongCriteria is 2!
      expect(evaluation.confidenceScore).toBeLessThan(0.5);
    });

    it('3. Ineligible candidate when < 3 total criteria are met', () => {
      // Strong 1: AMOUNT (exact)
      // Strong 2: REFERENCE_NUMBER (exact)
      // But: date mismatches, currency mismatches, type mismatches, narration mismatches
      // Total met: 2 (both strong, but total < 3)
      const bankTx: EvaluatableBankTransaction = {
        organizationId: 'org-1',
        transactionDate: '2026-01-01T00:00:00Z',
        signedAmount: -100.0,
        currency: 'USD',
        referenceNumber: 'REF-EXACT-55',
        description: 'Alpha',
      };
      const glTx: EvaluatableGlTransaction = {
        organizationId: 'org-1',
        transactionDate: '2026-10-15T00:00:00Z', // 9 months apart
        amount: 100.0,
        currency: 'EUR', // Mismatched currency
        referenceNumber: 'REF-EXACT-55',
        narration: 'Omega',
      };

      const evaluation = CriteriaEvaluationService.evaluatePair(bankTx, glTx);

      expect(evaluation.strongCriteriaSatisfied).toBe(2);
      expect(evaluation.totalCriteriaSatisfied).toBe(2); // Only 2 total
      expect(evaluation.eligible).toBe(false); // Ineligible because minTotal is 3!
    });

    it('4. Multi-tenant isolation: Cross-organization pairs are strictly ineligible', () => {
      const bankTx: EvaluatableBankTransaction = {
        organizationId: 'org-tenant-1',
        transactionDate: '2026-09-05T00:00:00Z',
        signedAmount: -1000.0,
        currency: 'USD',
        referenceNumber: 'MATCH-REF',
        description: 'Payment',
      };
      const glTx: EvaluatableGlTransaction = {
        organizationId: 'org-tenant-2', // Different tenant!
        transactionDate: '2026-09-05T00:00:00Z',
        amount: 1000.0,
        currency: 'USD',
        referenceNumber: 'MATCH-REF',
        narration: 'Payment',
      };

      const evaluation = CriteriaEvaluationService.evaluatePair(bankTx, glTx);

      expect(evaluation.organizationIsolated).toBe(false);
      expect(evaluation.eligible).toBe(false); // Must be strictly rejected
    });
  });

  // -------------------------------------------------------------
  // 4. Structured Output Format Confirmation
  // -------------------------------------------------------------
  describe('Structured Output Format', () => {
    it('Returns complete structured evaluation summary with breakdown and metadata', () => {
      const bankTx: EvaluatableBankTransaction = {
        transactionDate: '2026-09-01T00:00:00Z',
        signedAmount: -400.0,
        currency: 'USD',
        referenceNumber: 'REF-888',
      };
      const glTx: EvaluatableGlTransaction = {
        transactionDate: '2026-09-01T00:00:00Z',
        amount: 400.0,
        currency: 'USD',
        referenceNumber: 'REF-888',
        narration: 'Rent',
      };

      const res = CriteriaEvaluationService.evaluatePair(bankTx, glTx);

      expect(res).toHaveProperty('eligible');
      expect(res).toHaveProperty('totalCriteriaEvaluated');
      expect(res).toHaveProperty('totalCriteriaSatisfied');
      expect(res).toHaveProperty('strongCriteriaSatisfied');
      expect(res).toHaveProperty('criteriaEvaluated');
      expect(res).toHaveProperty('criteriaSatisfied');
      expect(res).toHaveProperty('criteriaFailed');
      expect(res).toHaveProperty('strongCriteriaList');
      expect(res).toHaveProperty('resolvedTolerances');
      expect(res).toHaveProperty('confidenceScore');
      expect(res).toHaveProperty('breakdown');
      expect(res).toHaveProperty('organizationIsolated');

      // Verify all 9 criteria are present in breakdown
      for (const code of Object.values(CRITERION_CODES)) {
        expect(res.breakdown[code]).toBeDefined();
        expect(res.breakdown[code].code).toBe(code);
      }
    });
  });
});
