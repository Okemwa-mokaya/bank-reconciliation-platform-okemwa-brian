import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '../server/db';
import { createMatchHandler } from '../server/routes/reconciliationRoutes';

const createMockRes = () => {
  const res: any = {
    statusCode: 200,
    jsonData: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.jsonData = data;
      return this;
    },
  };
  return res;
};

describe('Phase 3: Reconciliation Match-Creation & Criteria Engine Integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const setupMockPeriod = (overrides: Record<string, unknown> = {}) => {
    vi.spyOn(prisma.reconciliationPeriod, 'findFirst').mockResolvedValue({
      id: 'p-phase3-1',
      organizationId: 'org-1',
      bankAccountId: 'acc-1',
      status: 'PROCESSING',
      isLocked: false,
      periodStart: new Date('2026-09-01'),
      periodEnd: new Date('2026-09-30'),
      ...overrides,
    } as any);
  };

  const setupMockTransactionSpies = (createdMatchOverride?: Record<string, unknown>) => {
    let capturedMatchData: any = null;

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        reconciliationMatch: {
          create: vi.fn().mockImplementation(async ({ data }) => {
            capturedMatchData = data;
            return {
              id: 'm-integrated-1',
              ...data,
              ...createdMatchOverride,
            };
          }),
        },
        bankTransactionMatch: {
          aggregate: vi.fn().mockResolvedValue({ _sum: { allocatedAmount: new Prisma.Decimal(0) } }),
          create: vi.fn().mockResolvedValue({ id: 'btxm-1' }),
        },
        glTransactionMatch: {
          aggregate: vi.fn().mockResolvedValue({ _sum: { allocatedAmount: new Prisma.Decimal(0) } }),
          create: vi.fn().mockResolvedValue({ id: 'gtxm-1' }),
        },
        bankTransaction: { update: vi.fn().mockResolvedValue({}) },
        glTransaction: { update: vi.fn().mockResolvedValue({}) },
        reconciliationPeriod: { update: vi.fn().mockResolvedValue({}) },
      });
    });

    (vi.spyOn(prisma.reconciliationMatch, 'findUnique') as any).mockImplementation(async () => ({
      id: 'm-integrated-1',
      matchType: capturedMatchData?.matchType || 'ONE_TO_ONE',
      matchStatus: capturedMatchData?.matchStatus || 'CONFIRMED',
      confidenceScore: capturedMatchData?.confidenceScore,
      criteriaMatched: capturedMatchData?.criteriaMatched,
      tolerancesApplied: capturedMatchData?.tolerancesApplied,
      explanation: capturedMatchData?.explanation,
      createdByType: capturedMatchData?.createdByType,
      bankTransactions: [{ bankTransactionId: 'btx-1' }],
      glTransactions: [{ glTransactionId: 'gtx-1' }],
    } as any));

    vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as any);

    return {
      getCapturedMatchData: () => capturedMatchData,
    };
  };

  // -------------------------------------------------------------------------
  // 1. Proposed Match Eligibility & Server-Evaluated Attributes
  // -------------------------------------------------------------------------
  it('1. Creates proposed match when criteria eligibility threshold is satisfied (>= 3 criteria, >= 2 strong)', async () => {
    setupMockPeriod();
    const { getCapturedMatchData } = setupMockTransactionSpies();

    // Bank transaction with Amount, Reference, Date, Currency
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        signedAmount: new Prisma.Decimal('500.00'),
        transactionDate: new Date('2026-09-15T00:00:00Z'),
        referenceNumber: 'INV-2026-99',
        currency: 'USD',
        transactionType: 'DEBIT',
        narration: 'Office Supplies Inc',
      } as any,
    ]);

    // GL transaction matching Amount, Reference, Date, Currency
    vi.spyOn(prisma.glTransaction, 'findMany').mockResolvedValue([
      {
        id: 'gtx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        amount: new Prisma.Decimal('500.00'),
        transactionDate: new Date('2026-09-15T00:00:00Z'),
        referenceNumber: 'INV-2026-99',
        currency: 'USD',
        transactionType: 'DEBIT',
        narration: 'Office Supplies Inc',
      } as any,
    ]);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-phase3-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        matchStatus: 'PROPOSED',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(201);
    expect(res.jsonData.match).toBeDefined();

    const matchData = getCapturedMatchData();
    expect(matchData.matchStatus).toBe('PROPOSED');
    expect(matchData.createdByType).toBe('SYSTEM');

    // Verify server-computed confidence score and criteria
    const confidence = parseFloat(matchData.confidenceScore.toString());
    expect(confidence).toBeGreaterThanOrEqual(0.70);

    const criteria = JSON.parse(matchData.criteriaMatched);
    expect(criteria).toContain('AMOUNT');
    expect(criteria).toContain('REFERENCE_NUMBER');
    expect(criteria).toContain('TRANSACTION_DATE');
    expect(criteria).toContain('CURRENCY');

    // Server-computed explanation
    expect(matchData.explanation).toContain('Proposed match based on');
  });

  // -------------------------------------------------------------------------
  // 2. Anti-Tampering: Client-Supplied Criteria Are Ignored
  // -------------------------------------------------------------------------
  it('2. Rejects proposed match with fabricated client values when transactions do NOT meet criteria threshold', async () => {
    setupMockPeriod();
    setupMockTransactionSpies();

    // Transactions that only have matching amount, but totally different dates and no refs
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-mismatch-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        signedAmount: new Prisma.Decimal('500.00'),
        transactionDate: new Date('2026-09-01T00:00:00Z'),
        referenceNumber: 'REF-BANK-111',
        currency: 'USD',
        narration: 'Vendor Alpha',
      } as any,
    ]);

    vi.spyOn(prisma.glTransaction, 'findMany').mockResolvedValue([
      {
        id: 'gtx-mismatch-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        amount: new Prisma.Decimal('500.00'),
        transactionDate: new Date('2026-09-25T00:00:00Z'), // 24 days apart (exceeds default tolerance)
        referenceNumber: 'REF-GL-999', // Completely different reference
        currency: 'EUR', // Different currency
        narration: 'Zeta Consulting',
      } as any,
    ]);

    // Client tries to spoof confidenceScore: 0.99 and fake criteriaMatched list
    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-phase3-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        matchStatus: 'PROPOSED',
        bankTransactionIds: ['btx-mismatch-1'],
        glTransactionIds: ['gtx-mismatch-1'],
        confidenceScore: 0.99, // FAKE
        criteriaMatched: ['AMOUNT', 'REFERENCE_NUMBER', 'TRANSACTION_DATE'], // FAKE
        tolerancesApplied: { amountVariance: 0 }, // FAKE
        explanation: 'Client claims 99% match', // FAKE
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);

    // Server must strictly reject the fake proposed match
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('Proposed match rejected');
    expect(res.jsonData.error).toContain('matching criteria eligibility threshold');
    expect(res.jsonData.strongCriteriaSatisfied).toBe(1); // Only AMOUNT satisfied, need >= 2
  });

  // -------------------------------------------------------------------------
  // 3. Hierarchical Tolerance Integration during Match Creation
  // -------------------------------------------------------------------------
  it('3. Resolves date tolerance from ToleranceConfig database hierarchy allowing date variance', async () => {
    setupMockPeriod();
    const { getCapturedMatchData } = setupMockTransactionSpies();

    // Mock ToleranceConfig at bank account level: 5 days tolerance allowed
    (vi.spyOn(prisma.toleranceConfig, 'findFirst') as any).mockImplementation(async ({ where }: any) => {
      if (where.level === 'BANK_ACCOUNT') {
        return {
          id: 'tol-acc-1',
          organizationId: 'org-1',
          bankAccountId: 'acc-1',
          level: 'BANK_ACCOUNT',
          amountToleranceType: 'FIXED',
          amountToleranceValue: 0.0,
          dateToleranceDays: 5,
          isDateToleranceAllowed: true,
          currencyRateTolerancePercent: 0.0,
        } as any;
      }
      return null;
    });

    // Transactions with 3-day date difference (allowed by 5-day bank account tolerance)
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-tol-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        signedAmount: new Prisma.Decimal('350.00'),
        transactionDate: new Date('2026-09-10T00:00:00Z'),
        referenceNumber: 'PO-8822',
        accountNumber: 'ACC-00123',
        currency: 'USD',
      } as any,
    ]);

    vi.spyOn(prisma.glTransaction, 'findMany').mockResolvedValue([
      {
        id: 'gtx-tol-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        amount: new Prisma.Decimal('350.00'),
        transactionDate: new Date('2026-09-13T00:00:00Z'), // 3 days difference
        referenceNumber: 'PO-8822',
        accountNumber: 'ACC-00123',
        currency: 'USD',
        narration: 'Payment',
      } as any,
    ]);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-phase3-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        matchStatus: 'PROPOSED',
        bankTransactionIds: ['btx-tol-1'],
        glTransactionIds: ['gtx-tol-1'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(201);

    const matchData = getCapturedMatchData();
    const criteria = JSON.parse(matchData.criteriaMatched);
    expect(criteria).toContain('TRANSACTION_DATE');
    expect(criteria).toContain('AMOUNT');
    expect(criteria).toContain('REFERENCE_NUMBER');
    expect(criteria).toContain('ACCOUNT_NUMBER');

    // Verify tolerancesApplied was populated from resolved tolerances
    const appliedTolerances = JSON.parse(matchData.tolerancesApplied);
    expect(appliedTolerances.sourceLevel).toBe('BANK_ACCOUNT');
    expect(appliedTolerances.dateToleranceDays).toBe(5);
  });

  // -------------------------------------------------------------------------
  // 4. Group Matching Topology (1:Many, Many:1, Many:Many) Evaluation
  // -------------------------------------------------------------------------
  it('4. Evaluates ONE_TO_MANY group matches at aggregate amount and group criteria level', async () => {
    setupMockPeriod();
    const { getCapturedMatchData } = setupMockTransactionSpies();

    // 1 Bank Transaction ($1,000)
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-group-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        signedAmount: new Prisma.Decimal('1000.00'),
        transactionDate: new Date('2026-09-15T00:00:00Z'),
        referenceNumber: 'BATCH-SPLIT-9',
        currency: 'USD',
      } as any,
    ]);

    // 2 GL Transactions ($600 + $400 = $1,000)
    vi.spyOn(prisma.glTransaction, 'findMany').mockResolvedValue([
      {
        id: 'gtx-group-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        amount: new Prisma.Decimal('600.00'),
        transactionDate: new Date('2026-09-15T00:00:00Z'),
        referenceNumber: 'BATCH-SPLIT-9',
        currency: 'USD',
        narration: 'Part 1',
      } as any,
      {
        id: 'gtx-group-2',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        amount: new Prisma.Decimal('400.00'),
        transactionDate: new Date('2026-09-15T00:00:00Z'),
        referenceNumber: 'BATCH-SPLIT-9',
        currency: 'USD',
        narration: 'Part 2',
      } as any,
    ]);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-phase3-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_MANY',
        matchStatus: 'PROPOSED',
        bankTransactionIds: ['btx-group-1'],
        glTransactionIds: ['gtx-group-1', 'gtx-group-2'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(201);

    const matchData = getCapturedMatchData();
    expect(matchData.matchType).toBe('ONE_TO_MANY');
    expect(matchData.matchStatus).toBe('PROPOSED');

    const criteria = JSON.parse(matchData.criteriaMatched);
    expect(criteria).toContain('AMOUNT');
    expect(criteria).toContain('REFERENCE_NUMBER');
    expect(criteria).toContain('TRANSACTION_DATE');
    expect(criteria).toContain('CURRENCY');
  });

  // -------------------------------------------------------------------------
  // 5. Cross-Tenant Protection Strict Enforcement
  // -------------------------------------------------------------------------
  it('5. Strictly rejects match creation when transactions belong to a different organization', async () => {
    setupMockPeriod();

    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-foreign',
        organizationId: 'org-foreign-attacker', // Cross-tenant!
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        signedAmount: new Prisma.Decimal('100.00'),
      } as any,
    ]);

    vi.spyOn(prisma.glTransaction, 'findMany').mockResolvedValue([
      {
        id: 'gtx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        amount: new Prisma.Decimal('100.00'),
      } as any,
    ]);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-phase3-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        bankTransactionIds: ['btx-foreign'],
        glTransactionIds: ['gtx-1'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(403);
    expect(res.jsonData.error).toContain('Tenant isolation violation');
  });
});
