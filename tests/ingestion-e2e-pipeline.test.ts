import { describe, it, expect, beforeAll } from 'vitest';
import { prisma, checkDatabaseConnection } from '../server/db';
import { seedDatabase } from '../server/seed';
import { ingestBankStatement, ingestGlData } from '../server/services/ingestion/ingestionPipeline';

describe('Phase 2 End-to-End Ingestion Pipeline (PostgreSQL Integration)', () => {
  let isDbOnline = false;
  let testOrgId = '';
  let testBankAccountId = '';
  let testUserId = '';

  beforeAll(async () => {
    const conn = await checkDatabaseConnection();
    isDbOnline = conn.ok;
    if (isDbOnline) {
      await seedDatabase();

      // Retrieve seeded organization, account, and user
      const org = await prisma.organization.findUnique({
        where: { slug: 'acme-treasury' },
        include: {
          bankAccounts: true,
          users: true,
        },
      });

      if (org && org.bankAccounts.length > 0 && org.users.length > 0) {
        testOrgId = org.id;
        testBankAccountId = org.bankAccounts[0].id;
        testUserId = org.users[0].id;
      }
    }
  });

  it('1. Successfully ingests a Bank Statement CSV with audit trail, checksums, and UNMATCHED status', async () => {
    if (!isDbOnline || !testOrgId) return;

    const uniqueNonce = Date.now();
    const csvContent = `Date,Description,Reference,Debit,Credit,Balance
2026-03-01,Client Wire Inflow,REF-WI-${uniqueNonce},,12500.00,12500.00
2026-03-02,Office Lease Payment,REF-LP-${uniqueNonce},3200.00,,9300.00
2026-03-03,Cloud Infrastructure,REF-AWS-${uniqueNonce},450.50,,8849.50
INVALID_DATE,Corrupted Row without Date,REF-BAD,100.00,,8749.50`;

    const fileBuffer = Buffer.from(csvContent, 'utf-8');
    const filename = `bank_stmt_${uniqueNonce}.csv`;

    const summary = await ingestBankStatement({
      fileBuffer,
      originalFilename: filename,
      organizationId: testOrgId,
      bankAccountId: testBankAccountId,
      uploadedById: testUserId,
    });

    // 1. Verify summary returned
    expect(summary.status).toBe('COMPLETED_WITH_WARNINGS'); // 3 valid, 1 rejected
    expect(summary.recordsDetected).toBe(4);
    expect(summary.successfullyImported).toBe(3);
    expect(summary.rejectedCount).toBe(1);
    expect(summary.fileHash).toBeDefined();

    // 2. Verify BankStatement record in database
    const statement = await prisma.bankStatement.findUnique({
      where: { id: summary.sourceId },
      include: {
        transactions: true,
        rejectedRows: true,
      },
    });
    expect(statement).not.toBeNull();
    expect(statement?.fileHash).toBe(summary.fileHash);
    expect(statement?.validCount).toBe(3);
    expect(statement?.rejectedCount).toBe(1);

    // 3. Verify BankTransactions in database strictly have UNMATCHED status
    expect(statement?.transactions.length).toBe(3);
    for (const txn of statement!.transactions) {
      expect(txn.status).toBe('UNMATCHED'); // Strict Phase 2 Constraint!
      expect(txn.transactionFingerprint).toBeDefined();
      expect(txn.originalImportedData).toBeDefined();
      expect(txn.normalizedData).toBeDefined();
    }

    // 4. Verify RejectedRow in database
    expect(statement?.rejectedRows.length).toBe(1);
    expect(statement?.rejectedRows[0].errorCode).toBe('INVALID_DATE');
    expect(statement?.rejectedRows[0].rowNumber).toBe(5);

    // 5. Verify AuditEvent created
    const audit = await prisma.auditEvent.findFirst({
      where: {
        organizationId: testOrgId,
        entityId: summary.sourceId,
        action: 'STATEMENT_INGESTION_COMPLETED',
      },
    });
    expect(audit).not.toBeNull();
  });

  it('2. Level 1 Duplicate Detection: Rejects exact re-upload of identical file hash', async () => {
    if (!isDbOnline || !testOrgId) return;

    const uniqueNonce = Date.now();
    const csvContent = `Date,Description,Reference,Debit,Credit
2026-03-05,Vendor Payment,REF-VD-${uniqueNonce},890.00,`;

    const fileBuffer = Buffer.from(csvContent, 'utf-8');
    const filename = `duplicate_test_${uniqueNonce}.csv`;

    // First upload
    const firstResult = await ingestBankStatement({
      fileBuffer,
      originalFilename: filename,
      organizationId: testOrgId,
      bankAccountId: testBankAccountId,
      uploadedById: testUserId,
    });
    expect(firstResult.status).toBe('IMPORTED');
    expect(firstResult.successfullyImported).toBe(1);

    // Attempt second upload with the exact same file
    const secondResult = await ingestBankStatement({
      fileBuffer,
      originalFilename: filename,
      organizationId: testOrgId,
      bankAccountId: testBankAccountId,
      uploadedById: testUserId,
    });

    expect(secondResult.status).toBe('DUPLICATE');
    expect(secondResult.duplicateCount).toBe(1);
    expect(secondResult.successfullyImported).toBe(0);
    expect(secondResult.warnings[0]).toContain('Duplicate file detected');

    // Verify audit event for duplicate rejection
    const dupAudit = await prisma.auditEvent.findFirst({
      where: {
        organizationId: testOrgId,
        action: 'STATEMENT_DUPLICATE_UPLOAD_REJECTED',
      },
      orderBy: { timestamp: 'desc' },
    });
    expect(dupAudit).not.toBeNull();
  });

  it('3. Successfully ingests General Ledger (GL) CSV with UNMATCHED status and metadata preservation', async () => {
    if (!isDbOnline || !testOrgId) return;

    const uniqueNonce = Date.now();
    const glCsv = `Posting Date,Journal,Account,Description,Debit,Credit,Supplier
2026-03-01,JRN-101,1010-CASH,Client Inflow Wire,,15000.00,Alpha Corp
2026-03-02,JRN-102,5020-RENT,Facility Lease Expense,3200.00,,Metropolis Properties
2026-03-03,JRN-103,6010-SAAS,Hosting Subscription,450.50,,Amazon Web Services`;

    const fileBuffer = Buffer.from(glCsv, 'utf-8');
    const filename = `gl_import_${uniqueNonce}.csv`;

    const summary = await ingestGlData({
      fileBuffer,
      originalFilename: filename,
      organizationId: testOrgId,
      bankAccountId: testBankAccountId,
      uploadedById: testUserId,
      sourceSystem: 'SAP_ERP',
    });

    expect(summary.status).toBe('IMPORTED');
    expect(summary.recordsDetected).toBe(3);
    expect(summary.successfullyImported).toBe(3);
    expect(summary.rejectedCount).toBe(0);

    // Verify GlImport in database
    const glImport = await prisma.glImport.findUnique({
      where: { id: summary.sourceId },
      include: { transactions: true },
    });
    expect(glImport).not.toBeNull();
    expect(glImport?.sourceSystem).toBe('SAP_ERP');
    expect(glImport?.fileHash).toBe(summary.fileHash);

    // Verify GL transactions have UNMATCHED status
    expect(glImport?.transactions.length).toBe(3);
    for (const glTx of glImport!.transactions) {
      expect(glTx.status).toBe('UNMATCHED');
      expect(glTx.transactionFingerprint).toBeDefined();
    }
  });

  it('4. Level 2 Duplicate Detection: Identifies potential duplicate transactions across batches without deleting', async () => {
    if (!isDbOnline || !testOrgId) return;

    const uniqueNonce = Date.now();
    // Batch 1 with transaction A
    const csv1 = `Date,Description,Reference,Debit,Credit
2026-03-12,Recurring Subscription Fee,REF-DUP-${uniqueNonce},99.00,`;
    const res1 = await ingestBankStatement({
      fileBuffer: Buffer.from(csv1, 'utf-8'),
      originalFilename: `batch_1_${uniqueNonce}.csv`,
      organizationId: testOrgId,
      bankAccountId: testBankAccountId,
      uploadedById: testUserId,
    });
    expect(res1.status).toBe('IMPORTED');
    expect(res1.duplicateCount).toBe(0);

    // Batch 2 with transaction A + transaction B (different file hash so Level 1 passes)
    const csv2 = `Date,Description,Reference,Debit,Credit
2026-03-12,Recurring Subscription Fee,REF-DUP-${uniqueNonce},99.00,
2026-03-13,New Unique Payment,REF-NEW-${uniqueNonce},250.00,`;
    const res2 = await ingestBankStatement({
      fileBuffer: Buffer.from(csv2, 'utf-8'),
      originalFilename: `batch_2_${uniqueNonce}.csv`,
      organizationId: testOrgId,
      bankAccountId: testBankAccountId,
      uploadedById: testUserId,
    });

    expect(res2.successfullyImported).toBe(2);
    expect(res2.duplicateCount).toBe(1); // Detected suspected duplicate
    expect(res2.status).toBe('COMPLETED_WITH_WARNINGS');

    // Verify database record has isSuspectedDuplicate = true
    const dupTx = await prisma.bankTransaction.findFirst({
      where: {
        statementId: res2.sourceId,
        isSuspectedDuplicate: true,
      },
    });
    expect(dupTx).not.toBeNull();
    expect(dupTx?.duplicateReason).toContain('Potential duplicate of existing transaction');
    expect(dupTx?.status).toBe('UNMATCHED'); // Still UNMATCHED, not automatically discarded
  });
});
