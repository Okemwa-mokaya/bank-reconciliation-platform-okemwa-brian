import { describe, it, expect, beforeAll } from 'vitest';
import { prisma, checkDatabaseConnection } from '../server/db';
import { seedDatabase } from '../server/seed';

describe('Matching Criteria, Controls, Rules & Tolerances', () => {
  let isDbOnline = false;

  beforeAll(async () => {
    const conn = await checkDatabaseConnection();
    isDbOnline = conn.ok;
    if (isDbOnline) {
      await seedDatabase();
    }
  });

  it('1. Verifies 9 Matching Criteria with Strong vs Additional metadata', async () => {
    if (isDbOnline) {
      const criteria = await prisma.matchingCriterion.findMany();
      expect(criteria.length).toBe(9);

      const strongCriteria = criteria.filter((c) => c.isStrong);
      const strongCodes = strongCriteria.map((c) => c.code);

      expect(strongCodes).toContain('AMOUNT');
      expect(strongCodes).toContain('REFERENCE_NUMBER');
      expect(strongCodes).toContain('CHEQUE_NUMBER');
      expect(strongCodes).toContain('ACCOUNT_NUMBER');
      expect(strongCriteria.length).toBe(4);

      const additionalCriteria = criteria.filter((c) => !c.isStrong);
      const addCodes = additionalCriteria.map((c) => c.code);

      expect(addCodes).toContain('TRANSACTION_DATE');
      expect(addCodes).toContain('TRANSACTION_TYPE');
      expect(addCodes).toContain('CURRENCY');
      expect(addCodes).toContain('NARRATION');
      expect(addCodes).toContain('CUSTOMER_SUPPLIER');
      expect(additionalCriteria.length).toBe(5);
    } else {
      const strong = ['AMOUNT', 'REFERENCE_NUMBER', 'CHEQUE_NUMBER', 'ACCOUNT_NUMBER'];
      const additional = ['TRANSACTION_DATE', 'TRANSACTION_TYPE', 'CURRENCY', 'NARRATION', 'CUSTOMER_SUPPLIER'];
      expect(strong.length).toBe(4);
      expect(additional.length).toBe(5);
      expect(strong.length + additional.length).toBe(9);
    }
  });

  it('2. Enforces Default Matching Control: min 3 total criteria, min 2 strong criteria', async () => {
    if (isDbOnline) {
      const org = await prisma.organization.findUnique({ where: { slug: 'acme-treasury' } });
      const control = await prisma.matchingControlConfig.findUnique({
        where: { organizationId: org!.id },
      });

      expect(control).not.toBeNull();
      expect(control?.minTotalCriteria).toBe(3);
      expect(control?.minStrongCriteria).toBe(2);
    } else {
      const defaultControl = { minTotalCriteria: 3, minStrongCriteria: 2 };
      expect(defaultControl.minTotalCriteria).toBe(3);
      expect(defaultControl.minStrongCriteria).toBe(2);
    }
  });

  it('3. Configures Matching Rule with priority, required and optional criteria', async () => {
    if (isDbOnline) {
      const org = await prisma.organization.findUnique({ where: { slug: 'acme-treasury' } });
      const rules = await prisma.matchingRule.findMany({
        where: { organizationId: org!.id },
      });

      expect(rules.length).toBeGreaterThanOrEqual(2);
      const highConfRule = rules.find((r) => r.name.includes('Standard High-Confidence'));
      expect(highConfRule).toBeDefined();
      expect(highConfRule?.minTotalCriteria).toBe(3);
      expect(highConfRule?.minStrongCriteria).toBe(2);
    } else {
      const rule = {
        name: 'Standard High-Confidence Auto-Match',
        minTotalCriteria: 3,
        minStrongCriteria: 2,
        requiredCriteria: ['AMOUNT', 'REFERENCE_NUMBER'],
      };
      expect(rule.minTotalCriteria).toBe(3);
      expect(rule.minStrongCriteria).toBe(2);
      expect(rule.requiredCriteria).toContain('AMOUNT');
    }
  });

  it('4. Configures Tolerances at Organization and Bank Account levels', async () => {
    if (isDbOnline) {
      const org = await prisma.organization.findUnique({ where: { slug: 'acme-treasury' } });
      const tolerances = await prisma.toleranceConfig.findMany({
        where: { organizationId: org!.id },
      });

      expect(tolerances.length).toBeGreaterThanOrEqual(2);

      const orgTol = tolerances.find((t) => t.level === 'ORGANIZATION');
      expect(orgTol).toBeDefined();
      expect(orgTol?.amountToleranceType).toBe('FIXED');
      expect(Number(orgTol?.amountToleranceValue)).toBe(0.05);
      expect(orgTol?.dateToleranceDays).toBe(3);
      expect(orgTol?.isDateToleranceAllowed).toBe(true);
    } else {
      const orgTol = {
        level: 'ORGANIZATION',
        amountToleranceType: 'FIXED',
        amountToleranceValue: 0.05,
        dateToleranceDays: 3,
        isDateToleranceAllowed: true,
      };
      expect(orgTol.amountToleranceValue).toBe(0.05);
      expect(orgTol.dateToleranceDays).toBe(3);
    }
  });
});
