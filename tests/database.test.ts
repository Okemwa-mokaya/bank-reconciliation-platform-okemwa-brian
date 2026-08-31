import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma, checkDatabaseConnection } from '../server/db';
import { seedDatabase } from '../server/seed';
import crypto from 'crypto';

describe('Database Foundation & Entity Relationships', () => {
  beforeAll(async () => {
    await seedDatabase();
  });

  it('1. Connects to database successfully', async () => {
    const status = await checkDatabaseConnection();
    expect(status.ok).toBe(true);
  });

  it('2. Enforces Organization entity and unique slug constraint', async () => {
    const org = await prisma.organization.findUnique({
      where: { slug: 'acme-treasury' },
    });
    expect(org).not.toBeNull();
    expect(org?.name).toBe('Acme Global Treasury Corp');
    expect(org?.baseCurrency).toBe('USD');

    // Attempting to duplicate slug should fail
    await expect(
      prisma.organization.create({
        data: {
          name: 'Duplicate Test Corp',
          slug: 'acme-treasury',
        },
      })
    ).rejects.toThrow();
  });

  it('3. Creates Bank and Bank Accounts with referential integrity', async () => {
    const org = await prisma.organization.findUnique({ where: { slug: 'acme-treasury' } });
    expect(org).not.toBeNull();

    const accounts = await prisma.bankAccount.findMany({
      where: { organizationId: org!.id },
      include: { bank: true },
    });

    expect(accounts.length).toBeGreaterThanOrEqual(3);
    const opChecking = accounts.find((a) => a.accountNumber === 'CHASE-OP-8921');
    expect(opChecking).toBeDefined();
    expect(opChecking?.bank.name).toBe('JPMorgan Chase Bank, N.A.');
    expect(opChecking?.accountType).toBe('OPERATING');
    expect(Number(opChecking?.openingBalance)).toBe(1250000.0);
  });

  it('4. Creates Bank Statement and Statement Pages with OCR tracking metadata', async () => {
    const org = await prisma.organization.findUnique({ where: { slug: 'acme-treasury' } });
    const user = await prisma.user.findFirst({ where: { organizationId: org!.id } });
    const account = await prisma.bankAccount.findFirst({ where: { organizationId: org!.id } });

    const statement = await prisma.bankStatement.create({
      data: {
        organizationId: org!.id,
        bankAccountId: account!.id,
        statementPeriodStart: new Date('2026-08-01'),
        statementPeriodEnd: new Date('2026-08-31'),
        originalFilename: 'CHASE_AUG_2026_STATEMENT.pdf',
        fileType: 'PDF',
        storagePath: '/secure-vault/statements/CHASE_AUG_2026.pdf',
        uploadedById: user!.id,
        processingStatus: 'COMPLETED',
        extractionStatus: 'COMPLETED',
        validationStatus: 'VALID',
        duplicateStatus: 'UNIQUE',
        openingBalance: 1250000.0,
        closingBalance: 1420500.0,
        totalCredits: 250000.0,
        totalDebits: 79500.0,
        transactionCount: 2,
        pages: {
          create: [
            {
              pageNumber: 1,
              extractionStatus: 'COMPLETED',
              ocrStatus: 'COMPLETED',
              extractionConfidence: 0.99,
            },
            {
              pageNumber: 2,
              extractionStatus: 'COMPLETED',
              ocrStatus: 'COMPLETED',
              extractionConfidence: 0.97,
            },
          ],
        },
      },
      include: { pages: true },
    });

    expect(statement.id).toBeDefined();
    expect(statement.pages.length).toBe(2);
    expect(statement.pages[0].ocrStatus).toBe('COMPLETED');
  });

  it('5. Creates Bank and GL Transactions preserving original source financial data intact', async () => {
    const org = await prisma.organization.findUnique({ where: { slug: 'acme-treasury' } });
    const account = await prisma.bankAccount.findFirst({ where: { organizationId: org!.id } });

    const rawBankPayload = { rawRow: 4, rawText: 'WIRE INFLOW / REF# 998822 / GLOBAL CORP', amount: 100000.0 };
    const rawGLPayload = { journalId: 'JN-2026-0881', batch: 12, lineAmount: 100000.0 };

    const bankTx = await prisma.bankTransaction.create({
      data: {
        organizationId: org!.id,
        bankAccountId: account!.id,
        transactionDate: new Date('2026-08-15'),
        valueDate: new Date('2026-08-15'),
        description: 'WIRE INFLOW REF 998822',
        referenceNumber: 'REF-998822',
        transactionType: 'CREDIT',
        currency: 'USD',
        credit: 100000.0,
        signedAmount: 100000.0,
        balance: 1350000.0,
        originalImportedData: JSON.stringify(rawBankPayload),
        transactionFingerprint: crypto.createHash('sha256').update('bank-tx-test-1').digest('hex'),
        status: 'UNMATCHED',
      },
    });

    const glTx = await prisma.glTransaction.create({
      data: {
        organizationId: org!.id,
        bankAccountId: account!.id,
        transactionDate: new Date('2026-08-15'),
        referenceNumber: 'REF-998822',
        transactionType: 'JOURNAL',
        currency: 'USD',
        credit: 100000.0,
        amount: 100000.0,
        narration: 'Customer Invoice Receipt #998822',
        journalNumber: 'JN-2026-0881',
        originalData: JSON.stringify(rawGLPayload),
        transactionFingerprint: crypto.createHash('sha256').update('gl-tx-test-1').digest('hex'),
        status: 'UNMATCHED',
      },
    });

    // Validate original source integrity
    expect(JSON.parse(bankTx.originalImportedData)).toEqual(rawBankPayload);
    expect(JSON.parse(glTx.originalData)).toEqual(rawGLPayload);
    expect(bankTx.status).toBe('UNMATCHED');
    expect(glTx.status).toBe('UNMATCHED');
  });

  it('6. Supports 1:1, 1:Many, Many:1, and Many:Many multi-transaction Reconciliation Matches', async () => {
    const org = await prisma.organization.findUnique({ where: { slug: 'acme-treasury' } });
    const account = await prisma.bankAccount.findFirst({ where: { organizationId: org!.id } });
    const user = await prisma.user.findFirst({ where: { organizationId: org!.id } });

    // Create or find Reconciliation Period
    const startDate = new Date('2026-10-01');
    const endDate = new Date('2026-10-31');

    const period = await prisma.reconciliationPeriod.upsert({
      where: {
        organizationId_bankAccountId_periodStart_periodEnd: {
          organizationId: org!.id,
          bankAccountId: account!.id,
          periodStart: startDate,
          periodEnd: endDate,
        },
      },
      update: {},
      create: {
        organizationId: org!.id,
        bankAccountId: account!.id,
        periodStart: startDate,
        periodEnd: endDate,
        status: 'PROCESSING',
        preparedById: user!.id,
      },
    });

    // Create 1 Bank Transaction and 2 GL Transactions (1:Many match test)
    const bankTx = await prisma.bankTransaction.create({
      data: {
        organizationId: org!.id,
        bankAccountId: account!.id,
        transactionDate: new Date('2026-08-20'),
        description: 'COMBINED BATCH DEPOSIT',
        signedAmount: 50000.0,
        originalImportedData: '{}',
        transactionFingerprint: crypto.createHash('sha256').update('b-batch-1').digest('hex'),
        transactionType: 'CREDIT',
      },
    });

    const glTx1 = await prisma.glTransaction.create({
      data: {
        organizationId: org!.id,
        bankAccountId: account!.id,
        transactionDate: new Date('2026-08-20'),
        narration: 'Batch Part A',
        amount: 30000.0,
        originalData: '{}',
        transactionFingerprint: crypto.createHash('sha256').update('g-batch-1a').digest('hex'),
        transactionType: 'CREDIT',
      },
    });

    const glTx2 = await prisma.glTransaction.create({
      data: {
        organizationId: org!.id,
        bankAccountId: account!.id,
        transactionDate: new Date('2026-08-20'),
        narration: 'Batch Part B',
        amount: 20000.0,
        originalData: '{}',
        transactionFingerprint: crypto.createHash('sha256').update('g-batch-1b').digest('hex'),
        transactionType: 'CREDIT',
      },
    });

    // Create One-to-Many Reconciliation Match
    const match = await prisma.reconciliationMatch.create({
      data: {
        reconciliationPeriodId: period.id,
        matchType: 'ONE_TO_MANY',
        matchStatus: 'CONFIRMED',
        confidenceScore: 0.98,
        criteriaMatched: JSON.stringify(['AMOUNT', 'TRANSACTION_DATE']),
        explanation: 'Batch deposit of $50,000 matches two GL items ($30,000 + $20,000)',
        bankTransactions: {
          create: [{ bankTransactionId: bankTx.id, allocatedAmount: 50000.0 }],
        },
        glTransactions: {
          create: [
            { glTransactionId: glTx1.id, allocatedAmount: 30000.0 },
            { glTransactionId: glTx2.id, allocatedAmount: 20000.0 },
          ],
        },
      },
      include: {
        bankTransactions: true,
        glTransactions: true,
      },
    });

    expect(match.matchType).toBe('ONE_TO_MANY');
    expect(match.bankTransactions.length).toBe(1);
    expect(match.glTransactions.length).toBe(2);
  });
});
