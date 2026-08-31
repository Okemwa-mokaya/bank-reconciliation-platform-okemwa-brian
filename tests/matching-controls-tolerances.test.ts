import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../server/db';
import { seedDatabase } from '../server/seed';

describe('Matching Criteria, Controls, Rules & Tolerances', () => {
  beforeAll(async () => {
    await seedDatabase();
  });

  it('1. Verifies 9 Matching Criteria with Strong vs Additional metadata', async () => {
    const criteria = await prisma.matchingCriterion.findMany();
    expect(criteria.length).toBe(9);

    const strongCriteria = criteria.filter((c) => c.isStrong);
    const strongCodes = strongCriteria.map((c) => c.code);

    // Mandated Strong Criteria (1-4)
    expect(strongCodes).toContain('AMOUNT');
    expect(strongCodes).toContain('REFERENCE_NUMBER');
    expect(strongCodes).toContain('CHEQUE_NUMBER');
    expect(strongCodes).toContain('ACCOUNT_NUMBER');
    expect(strongCriteria.length).toBe(4);

    const additionalCriteria = criteria.filter((c) => !c.isStrong);
    const addCodes = additionalCriteria.map((c) => c.code);

    // Mandated Additional Criteria (5-9)
    expect(addCodes).toContain('TRANSACTION_DATE');
    expect(addCodes).toContain('TRANSACTION_TYPE');
    expect(addCodes).toContain('CURRENCY');
    expect(addCodes).toContain('NARRATION');
    expect(addCodes).toContain('CUSTOMER_SUPPLIER');
    expect(additionalCriteria.length).toBe(5);
  });

  it('2. Enforces Default Matching Control: min 3 total criteria, min 2 strong criteria', async () => {
    const org = await prisma.organization.findUnique({ where: { slug: 'acme-treasury' } });
    const control = await prisma.matchingControlConfig.findUnique({
      where: { organizationId: org!.id },
    });

    expect(control).not.toBeNull();
    expect(control?.minTotalCriteria).toBe(3);
    expect(control?.minStrongCriteria).toBe(2);
  });

  it('3. Configures Matching Rule with priority, required and optional criteria', async () => {
    const org = await prisma.organization.findUnique({ where: { slug: 'acme-treasury' } });
    const rules = await prisma.matchingRule.findMany({
      where: { organizationId: org!.id },
    });

    expect(rules.length).toBeGreaterThanOrEqual(2);
    const highConfRule = rules.find((r) => r.name.includes('Standard High-Confidence'));
    expect(highConfRule).toBeDefined();
    expect(highConfRule?.minTotalCriteria).toBe(3);
    expect(highConfRule?.minStrongCriteria).toBe(2);

    const reqCrit = JSON.parse(highConfRule!.requiredCriteria);
    expect(reqCrit).toContain('AMOUNT');
    expect(reqCrit).toContain('REFERENCE_NUMBER');
  });

  it('4. Configures Tolerances at Organization and Bank Account levels', async () => {
    const org = await prisma.organization.findUnique({ where: { slug: 'acme-treasury' } });
    const tolerances = await prisma.toleranceConfig.findMany({
      where: { organizationId: org!.id },
    });

    expect(tolerances.length).toBeGreaterThanOrEqual(2);

    const orgTol = tolerances.find((t) => t.level === 'ORGANIZATION');
    expect(orgTol).toBeDefined();
    expect(orgTol?.amountToleranceType).toBe('FIXED');
    expect(orgTol?.amountToleranceValue).toBe(0.05);
    expect(orgTol?.dateToleranceDays).toBe(3);
    expect(orgTol?.isDateToleranceAllowed).toBe(true);

    const accTol = tolerances.find((t) => t.level === 'BANK_ACCOUNT');
    expect(accTol).toBeDefined();
    expect(accTol?.amountToleranceValue).toBe(0.0);
  });
});
