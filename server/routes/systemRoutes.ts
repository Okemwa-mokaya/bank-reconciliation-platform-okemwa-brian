import { Router } from 'express';
import { prisma, checkDatabaseConnection } from '../db';
import { seedDatabase } from '../seed';

export const systemRouter = Router();

// Database connection health probe
systemRouter.get('/health', async (req, res) => {
  const dbStatus = await checkDatabaseConnection();
  res.json({
    status: dbStatus.ok ? 'HEALTHY' : 'UNHEALTHY',
    timestamp: new Date().toISOString(),
    phase: 'Phase 1: Foundation & Architecture',
    database: dbStatus,
    architecture: {
      orm: 'Prisma 6',
      tenancy: 'Organization Isolated (Multi-tenant ready)',
      rbac: 'Granular Permissions with 4 Standard Roles',
      matchingTopology: '1:1, 1:Many, Many:1, Many:Many supported',
      criteriaControl: 'Configurable (Min 3 Total, Min 2 Strong Criteria)',
      tolerances: 'Amount Fixed/Percent & Date Tolerance across Org/Account/Rule scopes',
      auditTrail: 'Cryptographically consistent, immutable, timestamped event log',
    },
  });
});

// Database schema introspection & entity statistics
systemRouter.get('/schema-info', async (req, res) => {
  try {
    const [
      orgs,
      users,
      roles,
      permissions,
      banks,
      accounts,
      statements,
      statementPages,
      bankTx,
      glTx,
      periods,
      matches,
      matchingRules,
      tolerances,
      exceptions,
      agingBuckets,
      auditEvents,
    ] = await Promise.all([
      prisma.organization.count(),
      prisma.user.count(),
      prisma.role.count(),
      prisma.permission.count(),
      prisma.bank.count(),
      prisma.bankAccount.count(),
      prisma.bankStatement.count(),
      prisma.statementPage.count(),
      prisma.bankTransaction.count(),
      prisma.glTransaction.count(),
      prisma.reconciliationPeriod.count(),
      prisma.reconciliationMatch.count(),
      prisma.matchingRule.count(),
      prisma.toleranceConfig.count(),
      prisma.exceptionRecord.count(),
      prisma.agingBucketConfig.count(),
      prisma.auditEvent.count(),
    ]);

    res.json({
      schemaVersion: '1.0.0-foundation',
      entities: {
        organizations: orgs,
        users: users,
        roles: roles,
        permissions: permissions,
        banks: banks,
        bankAccounts: accounts,
        bankStatements: statements,
        statementPages: statementPages,
        bankTransactions: bankTx,
        glTransactions: glTx,
        reconciliationPeriods: periods,
        reconciliationMatches: matches,
        matchingRules: matchingRules,
        toleranceConfigs: tolerances,
        exceptions: exceptions,
        agingBuckets: agingBuckets,
        auditEvents: auditEvents,
      },
    });
  } catch (error) {
    console.error('Error fetching schema info:', error);
    res.status(500).json({ error: 'Failed to fetch schema statistics' });
  }
});

// Re-seed trigger (for testing / reset)
systemRouter.post('/seed', async (req, res) => {
  try {
    await seedDatabase();
    res.json({ success: true, message: 'Database foundation seeded successfully' });
  } catch (error) {
    console.error('Error seeding database:', error);
    res.status(500).json({ error: 'Failed to seed database' });
  }
});
