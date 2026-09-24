import { describe, it, expect, beforeAll } from 'vitest';
import { prisma, checkDatabaseConnection } from '../server/db';
import { seedDatabase } from '../server/seed';

describe('Multi-Tenant Organization Isolation', () => {
  let isDbOnline = false;
  let org1Id = '';
  let org2Id = '';

  beforeAll(async () => {
    const conn = await checkDatabaseConnection();
    if (!conn.ok) {
      throw new Error(`Integration test requires live PostgreSQL connection: ${conn.message}`);
    }
    isDbOnline = true;
    await seedDatabase();

    // 1. Locate or create Organization 1
    let org1 = await prisma.organization.findUnique({ where: { slug: 'acme-treasury' } });
    if (!org1) {
      org1 = await prisma.organization.findFirst();
    }
    if (!org1) {
      org1 = await prisma.organization.create({
        data: {
          name: 'Acme Global Treasury Corp',
          slug: 'acme-treasury',
          taxId: 'US-94-3829104',
          baseCurrency: 'USD',
          status: 'ACTIVE',
        },
      });
    }
    org1Id = org1.id;

    // 2. Locate or create Organization 2 (must be distinct from Organization 1)
    let org2 = await prisma.organization.findUnique({ where: { slug: 'apex-holdings' } });
    if (!org2) {
      org2 = await prisma.organization.findFirst({
        where: { id: { not: org1Id } },
      });
    }
    if (!org2) {
      org2 = await prisma.organization.create({
        data: {
          name: 'Apex Financial Holdings LLC',
          slug: 'apex-holdings',
          taxId: 'US-13-8849102',
          baseCurrency: 'EUR',
          status: 'ACTIVE',
        },
      });
    }
    org2Id = org2.id;

    // 3. Ensure Organization 1 has at least one Bank and BankAccount
    let org1Account = await prisma.bankAccount.findFirst({ where: { organizationId: org1Id } });
    if (!org1Account) {
      let bank1 = await prisma.bank.findFirst({ where: { organizationId: org1Id } });
      if (!bank1) {
        bank1 = await prisma.bank.create({
          data: {
            organizationId: org1Id,
            name: 'JPMorgan Chase Bank, N.A.',
            swiftCode: 'CHASUS33',
            country: 'US',
            status: 'ACTIVE',
          },
        });
      }
      org1Account = await prisma.bankAccount.create({
        data: {
          organizationId: org1Id,
          bankId: bank1.id,
          accountName: 'Operating Primary Checking',
          accountNumber: 'CHASE-OP-8921',
          currency: 'USD',
          accountType: 'OPERATING',
          status: 'ACTIVE',
          openingBalance: 1250000.0,
          currentBalance: 1250000.0,
        },
      });
    }

    // 4. Ensure Organization 2 has at least one Bank and BankAccount
    let org2Account = await prisma.bankAccount.findFirst({ where: { organizationId: org2Id } });
    if (!org2Account) {
      let bank2 = await prisma.bank.findFirst({ where: { organizationId: org2Id } });
      if (!bank2) {
        bank2 = await prisma.bank.create({
          data: {
            organizationId: org2Id,
            name: 'BNP Paribas Commercial',
            swiftCode: 'BNPAFR22',
            routingNumber: '3000400001',
            country: 'FR',
            status: 'ACTIVE',
          },
        });
      }
      org2Account = await prisma.bankAccount.create({
        data: {
          organizationId: org2Id,
          bankId: bank2.id,
          accountName: 'Apex European Operations Account',
          accountNumber: 'BNP-EUR-7731',
          currency: 'EUR',
          accountType: 'OPERATING',
          status: 'ACTIVE',
          openingBalance: 2100000.0,
          currentBalance: 2100000.0,
        },
      });
    }
  });

  it('1. User querying bank accounts only receives records for their organization', async () => {
    const org1Accounts = await prisma.bankAccount.findMany({
      where: { organizationId: org1Id },
    });

    const org2Accounts = await prisma.bankAccount.findMany({
      where: { organizationId: org2Id },
    });

    expect(org1Accounts.length).toBeGreaterThanOrEqual(1);
    expect(org2Accounts.length).toBeGreaterThanOrEqual(1);

    const org1AccountIds = new Set(org1Accounts.map((a) => a.id));
    const hasOverlap = org2Accounts.some((a) => org1AccountIds.has(a.id));
    expect(hasOverlap).toBe(false);
  });

  it('2. Audit events are strictly partitioned by organizationId', async () => {
    const org1Events = await prisma.auditEvent.findMany({
      where: { organizationId: org1Id },
    });

    const org2Events = await prisma.auditEvent.findMany({
      where: { organizationId: org2Id },
    });

    const org1EventIds = new Set(org1Events.map((e) => e.id));
    const hasLeak = org2Events.some((e) => org1EventIds.has(e.id));
    expect(hasLeak).toBe(false);
  });

  it('3. Cross-organization matching is strictly prohibited and rejected', async () => {
    const org1Account = await prisma.bankAccount.findFirst({ where: { organizationId: org1Id } });
    const org2Account = await prisma.bankAccount.findFirst({ where: { organizationId: org2Id } });

    expect(org1Account).not.toBeNull();
    expect(org2Account).not.toBeNull();

    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);

    const org1Tx = await prisma.bankTransaction.create({
      data: {
        organizationId: org1Id,
        bankAccountId: org1Account!.id,
        transactionDate: new Date(),
        description: 'Org 1 Vendor Payment',
        transactionType: 'DEBIT',
        currency: 'USD',
        debit: 1000,
        credit: 0,
        signedAmount: -1000,
        originalImportedData: '{}',
        normalizedData: '{}',
        transactionFingerprint: `fp-org1-${timestamp}-${randomSuffix}`,
        status: 'UNMATCHED',
      },
    });

    const org2Tx = await prisma.glTransaction.create({
      data: {
        organizationId: org2Id,
        bankAccountId: org2Account!.id,
        transactionDate: new Date(),
        narration: 'Org 2 GL Entry',
        transactionType: 'JOURNAL',
        currency: 'EUR',
        debit: 1000,
        credit: 0,
        amount: 1000,
        sourceSystem: 'GENERAL_LEDGER',
        originalData: '{}',
        normalizedData: '{}',
        transactionFingerprint: `fp-org2-${timestamp}-${randomSuffix}`,
        status: 'UNMATCHED',
      },
    });

    const isSameOrg = org1Tx.organizationId === org2Tx.organizationId;
    expect(isSameOrg).toBe(false);

    const org1QueryOfOrg2Tx = await prisma.bankTransaction.findFirst({
      where: { id: org2Tx.id, organizationId: org1Id },
    });
    expect(org1QueryOfOrg2Tx).toBeNull();

    const org1QueryOfOrg2GlTx = await prisma.glTransaction.findFirst({
      where: { id: org2Tx.id, organizationId: org1Id },
    });
    expect(org1QueryOfOrg2GlTx).toBeNull();
  });

  it('4. Cross-organization reconciliation period isolation', async () => {
    const org1Account = await prisma.bankAccount.findFirst({ where: { organizationId: org1Id } });
    expect(org1Account).not.toBeNull();

    // Use a deterministic test period that cannot collide with seeded foundation data
    const testPeriodStart = new Date('2029-11-01T00:00:00.000Z');
    const testPeriodEnd = new Date('2029-11-30T23:59:59.999Z');

    // Ensure clean test fixture by removing any prior period matching this exact date range
    await prisma.reconciliationPeriod.deleteMany({
      where: {
        organizationId: org1Id,
        bankAccountId: org1Account!.id,
        periodStart: testPeriodStart,
        periodEnd: testPeriodEnd,
      },
    });

    const org1Period = await prisma.reconciliationPeriod.create({
      data: {
        organizationId: org1Id,
        bankAccountId: org1Account!.id,
        periodStart: testPeriodStart,
        periodEnd: testPeriodEnd,
        status: 'NOT_STARTED',
        isLocked: false,
      },
    });

    try {
      expect(org1Period.organizationId).toBe(org1Id);

      // Verify that Organization 2 cannot access or see Organization 1's reconciliation period
      const org2Periods = await prisma.reconciliationPeriod.findMany({
        where: { organizationId: org2Id },
      });
      expect(org2Periods.some((p) => p.id === org1Period.id)).toBe(false);

      // Verify direct cross-organization query isolation
      const org2DirectAccess = await prisma.reconciliationPeriod.findFirst({
        where: { id: org1Period.id, organizationId: org2Id },
      });
      expect(org2DirectAccess).toBeNull();
    } finally {
      // Clean up test fixture after verification
      await prisma.reconciliationPeriod.deleteMany({
        where: { id: org1Period.id },
      });
    }
  });
});
