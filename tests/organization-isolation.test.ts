import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../server/db';
import { seedDatabase } from '../server/seed';

describe('Multi-Tenant Organization Isolation', () => {
  let org1Id: string;
  let org2Id: string;

  beforeAll(async () => {
    await seedDatabase();

    const org1 = await prisma.organization.findUnique({ where: { slug: 'acme-treasury' } });
    const org2 = await prisma.organization.findUnique({ where: { slug: 'apex-holdings' } });

    org1Id = org1!.id;
    org2Id = org2!.id;

    // Create a bank and account in Org 2
    const apexBank = await prisma.bank.upsert({
      where: {
        organizationId_name: {
          organizationId: org2Id,
          name: 'Deutsche Bank Frankfurt',
        },
      },
      update: {},
      create: {
        organizationId: org2Id,
        name: 'Deutsche Bank Frankfurt',
        country: 'DE',
      },
    });

    await prisma.bankAccount.upsert({
      where: {
        organizationId_bankId_accountNumber: {
          organizationId: org2Id,
          bankId: apexBank.id,
          accountNumber: 'DB-EUR-0099',
        },
      },
      update: {},
      create: {
        organizationId: org2Id,
        bankId: apexBank.id,
        accountName: 'Apex Euro Operating',
        accountNumber: 'DB-EUR-0099',
        currency: 'EUR',
        openingBalance: 500000.0,
      },
    });
  });

  it('1. Strict separation of bank accounts between organizations', async () => {
    const org1Accounts = await prisma.bankAccount.findMany({
      where: { organizationId: org1Id },
    });

    const org2Accounts = await prisma.bankAccount.findMany({
      where: { organizationId: org2Id },
    });

    expect(org1Accounts.some((a) => a.accountNumber === 'DB-EUR-0099')).toBe(false);
    expect(org2Accounts.some((a) => a.accountNumber === 'CHASE-OP-8921')).toBe(false);
    expect(org2Accounts.some((a) => a.accountNumber === 'DB-EUR-0099')).toBe(true);
  });

  it('2. Enforces organization isolation on audit events', async () => {
    const uniqueAction = `ORG2_ISOLATION_TEST_${Date.now()}_${Math.random()}`;

    await prisma.auditEvent.create({
      data: {
        organizationId: org2Id,
        action: uniqueAction,
        entityType: 'TestEntity',
        entityId: 'test-123',
        reason: 'Tenant isolation verification',
      },
    });

    const org1Events = await prisma.auditEvent.findMany({
      where: { organizationId: org1Id, action: uniqueAction },
    });

    const org2Events = await prisma.auditEvent.findMany({
      where: { organizationId: org2Id, action: uniqueAction },
    });

    expect(org1Events.length).toBe(0);
    expect(org2Events.length).toBe(1);
  });
});
