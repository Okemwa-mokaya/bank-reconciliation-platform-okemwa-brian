import { describe, it, expect, beforeAll } from 'vitest';
import { prisma, checkDatabaseConnection } from '../server/db';
import { seedDatabase } from '../server/seed';
import {
  createMatchHandler,
  proposeAutoMatchesHandler,
  confirmMatchHandler,
  unmatchHandler,
} from '../server/routes/reconciliationRoutes';
import { Prisma } from '@prisma/client';

describe('Auto-Matching Engine & Manual Override Hardening', () => {
  let isDbOnline = false;
  let testOrgId = '';
  let testBankAccountId = '';
  let testUserId = '';
  let testPeriodId = '';

  const createMockRes = () => {
    const res: any = {};
    res.statusCode = 200;
    res.jsonData = null;
    res.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data: any) => {
      res.jsonData = data;
      return res;
    };
    return res;
  };

  beforeAll(async () => {
    const conn = await checkDatabaseConnection();
    if (!conn.ok) {
      throw new Error(`Integration test requires live PostgreSQL connection: ${conn.message}`);
    }
    isDbOnline = true;
    await seedDatabase();

    const org = await prisma.organization.findUnique({
      where: { slug: 'acme-treasury' },
      include: { bankAccounts: true, users: true },
    });

    testOrgId = org!.id;
    testBankAccountId = org!.bankAccounts[0].id;
    testUserId = org!.users[0].id;

    // Create a dedicated reconciliation period for this test suite
    const period = await prisma.reconciliationPeriod.create({
      data: {
        organizationId: testOrgId,
        bankAccountId: testBankAccountId,
        periodStart: new Date('2026-11-01'),
        periodEnd: new Date('2026-11-30'),
        status: 'NOT_STARTED',
        isLocked: false,
        preparedById: testUserId,
      },
    });

    testPeriodId = period.id;
  });

  it('1. Rejects proposed match when candidate does not satisfy criteria eligibility threshold', async () => {
    const nonce = Date.now();

    // Create bank transaction and GL transaction that do NOT match on date, reference, or amount
    const bTx = await prisma.bankTransaction.create({
      data: {
        organizationId: testOrgId,
        bankAccountId: testBankAccountId,
        transactionDate: new Date('2026-09-10'),
        description: `Payment to Vendor A ${nonce}`,
        referenceNumber: `REF-A-${nonce}`,
        transactionType: 'DEBIT',
        debit: 5000.0,
        credit: 0.0,
        signedAmount: -5000.0,
        currency: 'USD',
        status: 'UNMATCHED',
        transactionFingerprint: `fp-b-${nonce}`,
        originalImportedData: '{}',
      },
    });

    const gTx = await prisma.glTransaction.create({
      data: {
        organizationId: testOrgId,
        bankAccountId: testBankAccountId,
        transactionDate: new Date('2026-09-25'), // 15 days difference
        narration: `Payment to Vendor Z ${nonce}`,
        referenceNumber: `REF-Z-${nonce}`,
        accountNumber: '9999-OTHER',
        journalNumber: 'JRN-AP',
        transactionType: 'DEBIT',
        debit: 5000.0,
        credit: 0.0,
        amount: -5000.0, // Matches amount only (1 strong criterion, requires 2 strong + 3 total)
        currency: 'EUR', // Different currency
        status: 'UNMATCHED',
        transactionFingerprint: `fp-g-${nonce}`,
        originalData: '{}',
      },
    });

    const req = {
      organization: { id: testOrgId },
      params: { id: testPeriodId },
      user: { id: testUserId, email: 'treasury@acme.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        matchStatus: 'PROPOSED', // Client attempting to propose an ineligible candidate
        isProposed: true,
        bankTransactionIds: [bTx.id],
        glTransactionIds: [gTx.id],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('Proposed match rejected: transactions do not satisfy matching criteria eligibility threshold');
    expect(res.jsonData.strongCriteriaSatisfied).toBeLessThan(2);
  });

  it('2. Authorizes and explicitly records a Manual Override of an otherwise ineligible candidate', async () => {
    const nonce = Date.now() + 100;

    const bTx = await prisma.bankTransaction.create({
      data: {
        organizationId: testOrgId,
        bankAccountId: testBankAccountId,
        transactionDate: new Date('2026-09-05'),
        description: `Manual Wire Transfer ${nonce}`,
        referenceNumber: `WIRE-B-${nonce}`,
        transactionType: 'DEBIT',
        debit: 12000.0,
        credit: 0.0,
        signedAmount: -12000.0,
        currency: 'USD',
        status: 'UNMATCHED',
        transactionFingerprint: `fp-b-${nonce}`,
        originalImportedData: '{}',
      },
    });

    const gTx = await prisma.glTransaction.create({
      data: {
        organizationId: testOrgId,
        bankAccountId: testBankAccountId,
        transactionDate: new Date('2026-09-22'), // Date difference outside tolerance
        narration: `Manual Wire GL Entry ${nonce}`,
        referenceNumber: `GL-WIRE-${nonce}`, // Different ref
        accountNumber: '8888-CHECKING',
        journalNumber: 'JRN-WIRE',
        transactionType: 'DEBIT',
        debit: 12000.0,
        credit: 0.0,
        amount: -12000.0, // Matches amount only (1 strong criterion, ineligible for auto)
        currency: 'USD',
        status: 'UNMATCHED',
        transactionFingerprint: `fp-g-${nonce}`,
        originalData: '{}',
      },
    });

    const req = {
      organization: { id: testOrgId },
      params: { id: testPeriodId },
      user: { id: testUserId, email: 'accountant@acme.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        matchStatus: 'CONFIRMED',
        bankTransactionIds: [bTx.id],
        glTransactionIds: [gTx.id],
        overrideReason: 'Authorized by controller due to cross-border settlement delay',
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.jsonData.match).toBeDefined();
    expect(res.jsonData.isManualOverride).toBe(true);
    expect(res.jsonData.match.isManualOverride).toBe(true);
    expect(res.jsonData.match.overrideReason).toBe('Authorized by controller due to cross-border settlement delay');
    expect(res.jsonData.match.overriddenById).toBe(testUserId);
    expect(res.jsonData.match.explanation).toContain('[MANUAL_OVERRIDE]');

    // Verify audit event
    const auditEvent = await prisma.auditEvent.findFirst({
      where: {
        entityId: res.jsonData.match.id,
        action: 'MANUAL_OVERRIDE_MATCH',
      },
    });
    expect(auditEvent).not.toBeNull();
    expect(auditEvent?.reason).toContain('Authorized by controller');
  });

  it('3. Creates a standard manual confirmed match without override when candidate is eligible', async () => {
    const nonce = Date.now() + 200;

    // Both match Amount (Strong), Reference Number (Strong), Account Number (Strong), Date, and Currency
    const bTx = await prisma.bankTransaction.create({
      data: {
        organizationId: testOrgId,
        bankAccountId: testBankAccountId,
        transactionDate: new Date('2026-09-15'),
        description: `Acme Inflow Payment ${nonce}`,
        referenceNumber: `INV-2026-${nonce}`,
        accountNumber: '1111-OP',
        transactionType: 'CREDIT',
        debit: 0.0,
        credit: 45000.0,
        signedAmount: 45000.0,
        currency: 'USD',
        status: 'UNMATCHED',
        transactionFingerprint: `fp-b-${nonce}`,
        originalImportedData: '{}',
      },
    });

    const gTx = await prisma.glTransaction.create({
      data: {
        organizationId: testOrgId,
        bankAccountId: testBankAccountId,
        transactionDate: new Date('2026-09-15'),
        narration: `Acme Inflow Payment ${nonce}`,
        referenceNumber: `INV-2026-${nonce}`,
        accountNumber: '1111-OP',
        journalNumber: 'JRN-AR',
        transactionType: 'CREDIT',
        debit: 0.0,
        credit: 45000.0,
        amount: 45000.0,
        currency: 'USD',
        status: 'UNMATCHED',
        transactionFingerprint: `fp-g-${nonce}`,
        originalData: '{}',
      },
    });

    const req = {
      organization: { id: testOrgId },
      params: { id: testPeriodId },
      user: { id: testUserId, email: 'accountant@acme.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        matchStatus: 'CONFIRMED',
        bankTransactionIds: [bTx.id],
        glTransactionIds: [gTx.id],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);

    expect(res.statusCode).toBe(201);
    expect(res.jsonData.isManualOverride).toBe(false);
    expect(res.jsonData.match.isManualOverride).toBe(false);
    expect(res.jsonData.match.explanation).not.toContain('[MANUAL_OVERRIDE]');
    expect(Number(res.jsonData.match.confidenceScore)).toBeGreaterThanOrEqual(0.7);
  });

  it('4. Automatic reconciliation execution layer proposes eligible candidate matches', async () => {
    const nonce = Date.now() + 300;

    // Create 2 matching pairs
    const bTx1 = await prisma.bankTransaction.create({
      data: {
        organizationId: testOrgId,
        bankAccountId: testBankAccountId,
        transactionDate: new Date('2026-11-12'),
        description: `Automated Payroll ${nonce}`,
        referenceNumber: `PAY-BATCH-${nonce}`,
        accountNumber: '1111-OP',
        transactionType: 'DEBIT',
        debit: 25000.0,
        credit: 0.0,
        signedAmount: -25000.0,
        currency: 'USD',
        status: 'UNMATCHED',
        transactionFingerprint: `fp-b1-${nonce}`,
        originalImportedData: '{}',
      },
    });

    const gTx1 = await prisma.glTransaction.create({
      data: {
        organizationId: testOrgId,
        bankAccountId: testBankAccountId,
        transactionDate: new Date('2026-11-12'),
        narration: `Automated Payroll ${nonce}`,
        referenceNumber: `PAY-BATCH-${nonce}`,
        accountNumber: '1111-OP',
        journalNumber: 'JRN-PAYROLL',
        transactionType: 'DEBIT',
        debit: 25000.0,
        credit: 0.0,
        amount: -25000.0,
        currency: 'USD',
        status: 'UNMATCHED',
        transactionFingerprint: `fp-g1-${nonce}`,
        originalData: '{}',
      },
    });

    const req = {
      organization: { id: testOrgId },
      params: { id: testPeriodId },
      user: { id: testUserId, email: 'admin@acme.com', roles: ['ADMIN'], permissions: ['reconcile'] },
      body: {},
    };
    const res = createMockRes();

    await proposeAutoMatchesHandler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.jsonData.success).toBe(true);
    expect(res.jsonData.count).toBeGreaterThanOrEqual(1);

    const proposedMatch = res.jsonData.matches.find((m: any) =>
      m.bankTransactions?.some?.((bt: any) => bt.bankTransactionId === bTx1.id) ||
      m.id
    );
    expect(proposedMatch).toBeDefined();

    // Qualifying automatic matches are reconciled immediately.
    const updatedBtx = await prisma.bankTransaction.findUnique({ where: { id: bTx1.id } });
    const updatedGtx = await prisma.glTransaction.findUnique({ where: { id: gTx1.id } });
    expect(updatedBtx?.status).toBe('MATCHED');
    expect(updatedGtx?.status).toBe('MATCHED');

    const confirmedMatch = await prisma.reconciliationMatch.findFirst({
      where: {
        reconciliationPeriodId: testPeriodId,
        matchStatus: 'CONFIRMED',
      },
    });
    expect(confirmedMatch).not.toBeNull();

    // Verify period status updated to PROCESSING
    const period = await prisma.reconciliationPeriod.findUnique({ where: { id: testPeriodId } });
    expect(period?.status).toBe('PROCESSING');
  });

  it('5. Qualifying automatic matches are already confirmed and do not require manual confirmation', async () => {
    const confirmed = await prisma.reconciliationMatch.findFirst({
      where: {
        reconciliationPeriodId: testPeriodId,
        matchStatus: 'CONFIRMED',
        createdByType: 'SYSTEM',
      },
    });

    expect(confirmed).not.toBeNull();
    expect(confirmed?.createdByType).toBe('SYSTEM');
    expect(confirmed?.isManualOverride).toBe(false);
  });

  it('6. Propose auto matches rejects closed or locked periods', async () => {
    // Find or create locked period
    let lockedPeriod = await prisma.reconciliationPeriod.findFirst({
      where: { organizationId: testOrgId, isLocked: true },
    });
    if (!lockedPeriod) {
      lockedPeriod = await prisma.reconciliationPeriod.create({
        data: {
          organizationId: testOrgId,
          bankAccountId: testBankAccountId,
          periodStart: new Date('2024-01-01'),
          periodEnd: new Date('2024-01-31'),
          status: 'CLOSED',
          isLocked: true,
        },
      });
    }

    const req = {
      organization: { id: testOrgId },
      params: { id: lockedPeriod.id },
      user: { id: testUserId, email: 'admin@acme.com', roles: ['ADMIN'], permissions: ['reconcile'] },
      body: {},
    };
    const res = createMockRes();

    await proposeAutoMatchesHandler(req as any, res as any);

    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('closed or locked reconciliation period cannot accept automatic match proposals');
  });
});
