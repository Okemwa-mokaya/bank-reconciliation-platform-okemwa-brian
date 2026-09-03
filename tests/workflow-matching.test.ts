import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from '../server/db';
import {
  proposeAutoMatchesHandler,
  createMatchHandler,
  unmatchHandler,
  submitApprovalHandler,
} from '../server/routes/reconciliationRoutes';
import { createExceptionHandler } from '../server/routes/exceptionRoutes';
import { createBankTransactionHandler } from '../server/routes/transactionRoutes';
import { getDashboardSummaryHandler } from '../server/routes/dashboardRoutes';

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

describe('Production Workflow State Machine Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('PREPARED -> REVIEWED = allowed', async () => {
    vi.spyOn(prisma.reconciliationPeriod, 'findFirst').mockResolvedValue({
      id: 'p-1',
      organizationId: 'org-1',
      status: 'PREPARED',
      isLocked: false,
    } as any);
    vi.spyOn(prisma, '$transaction').mockResolvedValue([
      { id: 'app-1', stage: 'REVIEWED', action: 'SUBMIT_REVIEW' },
      { id: 'p-1', status: 'REVIEWED', isLocked: false },
    ] as any);
    vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'user-1', email: 'rev@org.com', roles: ['REVIEWER'], permissions: ['approve_reconciliation'] },
      body: { action: 'SUBMIT_REVIEW' },
    };
    const res = createMockRes();

    await submitApprovalHandler(req as any, res as any);
    expect(res.statusCode).toBe(201);
    expect(res.jsonData.period.status).toBe('REVIEWED');
  });

  it('REVIEWED -> APPROVED = allowed', async () => {
    vi.spyOn(prisma.reconciliationPeriod, 'findFirst').mockResolvedValue({
      id: 'p-1',
      organizationId: 'org-1',
      status: 'REVIEWED',
      isLocked: false,
    } as any);
    vi.spyOn(prisma, '$transaction').mockResolvedValue([
      { id: 'app-1', stage: 'APPROVED', action: 'APPROVE' },
      { id: 'p-1', status: 'APPROVED', isLocked: false },
    ] as any);
    vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'user-1', email: 'auditor@org.com', roles: ['AUDITOR'], permissions: ['approve_reconciliation'] },
      body: { action: 'APPROVE' },
    };
    const res = createMockRes();

    await submitApprovalHandler(req as any, res as any);
    expect(res.statusCode).toBe(201);
    expect(res.jsonData.period.status).toBe('APPROVED');
  });

  it('APPROVED -> CLOSED = allowed', async () => {
    vi.spyOn(prisma.reconciliationPeriod, 'findFirst').mockResolvedValue({
      id: 'p-1',
      organizationId: 'org-1',
      status: 'APPROVED',
      isLocked: false,
    } as any);
    vi.spyOn(prisma, '$transaction').mockResolvedValue([
      { id: 'app-1', stage: 'CLOSED', action: 'CLOSE' },
      { id: 'p-1', status: 'CLOSED', isLocked: true },
    ] as any);
    vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'user-1', email: 'admin@org.com', roles: ['ADMIN'], permissions: ['approve_reconciliation'] },
      body: { action: 'CLOSE' },
    };
    const res = createMockRes();

    await submitApprovalHandler(req as any, res as any);
    expect(res.statusCode).toBe(201);
    expect(res.jsonData.period.status).toBe('CLOSED');
    expect(res.jsonData.period.isLocked).toBe(true);
  });

  it('PREPARED -> APPROVED = rejected', async () => {
    vi.spyOn(prisma.reconciliationPeriod, 'findFirst').mockResolvedValue({
      id: 'p-1',
      organizationId: 'org-1',
      status: 'PREPARED',
      isLocked: false,
    } as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'user-1', email: 'auditor@org.com', roles: ['AUDITOR'], permissions: ['approve_reconciliation'] },
      body: { action: 'APPROVE' },
    };
    const res = createMockRes();

    await submitApprovalHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('Cannot approve period from status PREPARED');
  });

  it('PREPARED -> CLOSED = rejected', async () => {
    vi.spyOn(prisma.reconciliationPeriod, 'findFirst').mockResolvedValue({
      id: 'p-1',
      organizationId: 'org-1',
      status: 'PREPARED',
      isLocked: false,
    } as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'user-1', email: 'admin@org.com', roles: ['ADMIN'], permissions: ['approve_reconciliation'] },
      body: { action: 'CLOSE' },
    };
    const res = createMockRes();

    await submitApprovalHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('Cannot close period from status PREPARED');
  });

  it('REVIEWED -> CLOSED = rejected', async () => {
    vi.spyOn(prisma.reconciliationPeriod, 'findFirst').mockResolvedValue({
      id: 'p-1',
      organizationId: 'org-1',
      status: 'REVIEWED',
      isLocked: false,
    } as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'user-1', email: 'admin@org.com', roles: ['ADMIN'], permissions: ['approve_reconciliation'] },
      body: { action: 'CLOSE' },
    };
    const res = createMockRes();

    await submitApprovalHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('Cannot close period from status REVIEWED');
  });

  it('CLOSED -> REJECT = rejected', async () => {
    vi.spyOn(prisma.reconciliationPeriod, 'findFirst').mockResolvedValue({
      id: 'p-1',
      organizationId: 'org-1',
      status: 'CLOSED',
      isLocked: true,
    } as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'user-1', email: 'auditor@org.com', roles: ['AUDITOR'], permissions: ['approve_reconciliation'] },
      body: { action: 'REJECT', comments: 'Attempting to reject closed period' },
    };
    const res = createMockRes();

    await submitApprovalHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('closed or locked');
  });

  it('locked period -> REJECT = rejected', async () => {
    vi.spyOn(prisma.reconciliationPeriod, 'findFirst').mockResolvedValue({
      id: 'p-1',
      organizationId: 'org-1',
      status: 'PREPARED',
      isLocked: true,
    } as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'user-1', email: 'auditor@org.com', roles: ['AUDITOR'], permissions: ['approve_reconciliation'] },
      body: { action: 'REJECT', comments: 'Attempting to reject locked period' },
    };
    const res = createMockRes();

    await submitApprovalHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('closed or locked');
  });

  it('APPROVED -> REJECT = rejected', async () => {
    vi.spyOn(prisma.reconciliationPeriod, 'findFirst').mockResolvedValue({
      id: 'p-1',
      organizationId: 'org-1',
      status: 'APPROVED',
      isLocked: false,
    } as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'user-1', email: 'auditor@org.com', roles: ['AUDITOR'], permissions: ['approve_reconciliation'] },
      body: { action: 'REJECT', comments: 'Attempting to reject approved period' },
    };
    const res = createMockRes();

    await submitApprovalHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('Cannot reject period from status APPROVED');
  });
});

describe('Manual Matching Topology & Status Validation', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const setupMockPeriod = () => {
    vi.spyOn(prisma.reconciliationPeriod, 'findFirst').mockResolvedValue({
      id: 'p-1',
      organizationId: 'org-1',
      bankAccountId: 'acc-1',
      status: 'PROCESSING',
      isLocked: false,
    } as any);
  };

  it('valid ONE_TO_ONE = allowed', async () => {
    setupMockPeriod();
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-1',
        organizationId: 'org-1',
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
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        reconciliationMatch: { create: vi.fn().mockResolvedValue({ id: 'm-1' }) },
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
    vi.spyOn(prisma.reconciliationMatch, 'findUnique').mockResolvedValue({
      id: 'm-1',
      matchType: 'ONE_TO_ONE',
      bankTransactions: [{ bankTransactionId: 'btx-1' }],
      glTransactions: [{ glTransactionId: 'gtx-1' }],
    } as any);
    vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(201);
    expect(res.jsonData.match.id).toBe('m-1');
  });

  it('ONE_TO_ONE with 2 bank transactions = rejected', async () => {
    setupMockPeriod();
    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        bankTransactionIds: ['btx-1', 'btx-2'],
        glTransactionIds: ['gtx-1'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('Invalid match topology: ONE_TO_ONE');
  });

  it('ONE_TO_ONE with 2 GL transactions = rejected', async () => {
    setupMockPeriod();
    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1', 'gtx-2'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('Invalid match topology: ONE_TO_ONE');
  });

  it('ONE_TO_MANY with 1 bank + 2 GL = allowed', async () => {
    setupMockPeriod();
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        signedAmount: new Prisma.Decimal('200.00'),
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
      {
        id: 'gtx-2',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        amount: new Prisma.Decimal('100.00'),
      } as any,
    ]);
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        reconciliationMatch: { create: vi.fn().mockResolvedValue({ id: 'm-2' }) },
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
    vi.spyOn(prisma.reconciliationMatch, 'findUnique').mockResolvedValue({
      id: 'm-2',
      matchType: 'ONE_TO_MANY',
      bankTransactions: [{ bankTransactionId: 'btx-1' }],
      glTransactions: [{ glTransactionId: 'gtx-1' }, { glTransactionId: 'gtx-2' }],
    } as any);
    vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_MANY',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1', 'gtx-2'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(201);
    expect(res.jsonData.match.id).toBe('m-2');
  });

  it('ONE_TO_MANY invalid cardinality rejected (1 bank, 1 GL)', async () => {
    setupMockPeriod();
    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_MANY',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('Invalid match topology: ONE_TO_MANY');
  });

  it('ONE_TO_MANY invalid cardinality rejected (2 bank, 2 GL)', async () => {
    setupMockPeriod();
    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_MANY',
        bankTransactionIds: ['btx-1', 'btx-2'],
        glTransactionIds: ['gtx-1', 'gtx-2'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('Invalid match topology: ONE_TO_MANY');
  });

  it('MANY_TO_ONE with 2 bank + 1 GL = allowed', async () => {
    setupMockPeriod();
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        signedAmount: new Prisma.Decimal('100.00'),
      } as any,
      {
        id: 'btx-2',
        organizationId: 'org-1',
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
        amount: new Prisma.Decimal('200.00'),
      } as any,
    ]);
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        reconciliationMatch: { create: vi.fn().mockResolvedValue({ id: 'm-3' }) },
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
    vi.spyOn(prisma.reconciliationMatch, 'findUnique').mockResolvedValue({
      id: 'm-3',
      matchType: 'MANY_TO_ONE',
      bankTransactions: [{ bankTransactionId: 'btx-1' }, { bankTransactionId: 'btx-2' }],
      glTransactions: [{ glTransactionId: 'gtx-1' }],
    } as any);
    vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'MANY_TO_ONE',
        bankTransactionIds: ['btx-1', 'btx-2'],
        glTransactionIds: ['gtx-1'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(201);
    expect(res.jsonData.match.id).toBe('m-3');
  });

  it('MANY_TO_ONE invalid cardinality rejected (1 bank, 1 GL)', async () => {
    setupMockPeriod();
    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'MANY_TO_ONE',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('Invalid match topology: MANY_TO_ONE');
  });

  it('MANY_TO_ONE invalid cardinality rejected (2 bank, 2 GL)', async () => {
    setupMockPeriod();
    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'MANY_TO_ONE',
        bankTransactionIds: ['btx-1', 'btx-2'],
        glTransactionIds: ['gtx-1', 'gtx-2'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('Invalid match topology: MANY_TO_ONE');
  });

  it('MANY_TO_MANY with multiple bank + multiple GL = allowed', async () => {
    setupMockPeriod();
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        signedAmount: new Prisma.Decimal('150.00'),
      } as any,
      {
        id: 'btx-2',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        signedAmount: new Prisma.Decimal('150.00'),
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
      {
        id: 'gtx-2',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        amount: new Prisma.Decimal('200.00'),
      } as any,
    ]);
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        reconciliationMatch: { create: vi.fn().mockResolvedValue({ id: 'm-4' }) },
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
    vi.spyOn(prisma.reconciliationMatch, 'findUnique').mockResolvedValue({
      id: 'm-4',
      matchType: 'MANY_TO_MANY',
      bankTransactions: [{ bankTransactionId: 'btx-1' }, { bankTransactionId: 'btx-2' }],
      glTransactions: [{ glTransactionId: 'gtx-1' }, { glTransactionId: 'gtx-2' }],
    } as any);
    vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'MANY_TO_MANY',
        bankTransactionIds: ['btx-1', 'btx-2'],
        glTransactionIds: ['gtx-1', 'gtx-2'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(201);
    expect(res.jsonData.match.id).toBe('m-4');
  });

  it('MANY_TO_MANY invalid cardinality rejected (1 bank, 2 GL)', async () => {
    setupMockPeriod();
    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'MANY_TO_MANY',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1', 'gtx-2'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('Invalid match topology: MANY_TO_MANY');
  });

  it('MANY_TO_MANY invalid cardinality rejected (2 bank, 1 GL)', async () => {
    setupMockPeriod();
    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'MANY_TO_MANY',
        bankTransactionIds: ['btx-1', 'btx-2'],
        glTransactionIds: ['gtx-1'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('Invalid match topology: MANY_TO_MANY');
  });

  it('MATCHED transaction reused = rejected', async () => {
    setupMockPeriod();
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'MATCHED',
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
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('already MATCHED');
  });

  it('EXCLUDED transaction matched = rejected', async () => {
    setupMockPeriod();
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'EXCLUDED',
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
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('is EXCLUDED');
  });

  it('UNMATCHED transaction matched = allowed', async () => {
    setupMockPeriod();
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        signedAmount: new Prisma.Decimal('500.00'),
      } as any,
    ]);
    vi.spyOn(prisma.glTransaction, 'findMany').mockResolvedValue([
      {
        id: 'gtx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        amount: new Prisma.Decimal('500.00'),
      } as any,
    ]);
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        reconciliationMatch: { create: vi.fn().mockResolvedValue({ id: 'm-5' }) },
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
    vi.spyOn(prisma.reconciliationMatch, 'findUnique').mockResolvedValue({
      id: 'm-5',
      matchType: 'ONE_TO_ONE',
      bankTransactions: [{ bankTransactionId: 'btx-1' }],
      glTransactions: [{ glTransactionId: 'gtx-1' }],
    } as any);
    vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(201);
  });

  it('valid PARTIALLY_MATCHED transaction allocation = allowed', async () => {
    setupMockPeriod();
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'PARTIALLY_MATCHED',
        signedAmount: new Prisma.Decimal('500.00'),
      } as any,
    ]);
    vi.spyOn(prisma.glTransaction, 'findMany').mockResolvedValue([
      {
        id: 'gtx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        amount: new Prisma.Decimal('300.00'),
      } as any,
    ]);
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        reconciliationMatch: { create: vi.fn().mockResolvedValue({ id: 'm-6' }) },
        bankTransactionMatch: {
          aggregate: vi.fn().mockResolvedValue({ _sum: { allocatedAmount: new Prisma.Decimal('200.00') } }),
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
    vi.spyOn(prisma.reconciliationMatch, 'findUnique').mockResolvedValue({
      id: 'm-6',
      matchType: 'ONE_TO_ONE',
      bankTransactions: [{ bankTransactionId: 'btx-1' }],
      glTransactions: [{ glTransactionId: 'gtx-1' }],
    } as any);
    vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1'],
        bankAllocations: { 'btx-1': '300.00' },
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(201);
  });

  it('over-allocation = rejected', async () => {
    setupMockPeriod();
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'PARTIALLY_MATCHED',
        signedAmount: new Prisma.Decimal('500.00'),
      } as any,
    ]);
    vi.spyOn(prisma.glTransaction, 'findMany').mockResolvedValue([
      {
        id: 'gtx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        amount: new Prisma.Decimal('300.00'),
      } as any,
    ]);
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        reconciliationMatch: { create: vi.fn().mockResolvedValue({ id: 'm-7' }) },
        bankTransactionMatch: {
          aggregate: vi.fn().mockResolvedValue({ _sum: { allocatedAmount: new Prisma.Decimal('450.00') } }), // Available only 50
        },
      });
    });

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1'],
        bankAllocations: { 'btx-1': '100.00' }, // Exceeds available 50
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('exceeds available amount');
  });

  it('PARTIALLY_MATCHED transaction without explicit allocation = rejected', async () => {
    setupMockPeriod();
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'PARTIALLY_MATCHED',
        signedAmount: new Prisma.Decimal('500.00'),
      } as any,
    ]);
    vi.spyOn(prisma.glTransaction, 'findMany').mockResolvedValue([
      {
        id: 'gtx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        amount: new Prisma.Decimal('500.00'),
      } as any,
    ]);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1'],
        // bankAllocations missing for PARTIALLY_MATCHED
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('requires an explicit allocation amount');
  });

  it('unequal bank/GL allocation totals = rejected', async () => {
    setupMockPeriod();
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-1',
        organizationId: 'org-1',
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
        amount: new Prisma.Decimal('120.00'),
      } as any,
    ]);
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        bankTransactionMatch: {
          aggregate: vi.fn().mockResolvedValue({ _sum: { allocatedAmount: new Prisma.Decimal(0) } }),
        },
        glTransactionMatch: {
          aggregate: vi.fn().mockResolvedValue({ _sum: { allocatedAmount: new Prisma.Decimal(0) } }),
        },
      });
    });

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('Group balance mismatch');
  });

  it('duplicate bank transaction IDs = HTTP 400', async () => {
    setupMockPeriod();
    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'MANY_TO_ONE',
        bankTransactionIds: ['bank-1', 'bank-1'],
        glTransactionIds: ['gl-1'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('Duplicate bank transaction IDs');
  });

  it('duplicate GL transaction IDs = HTTP 400', async () => {
    setupMockPeriod();
    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_MANY',
        bankTransactionIds: ['bank-1'],
        glTransactionIds: ['gl-1', 'gl-1'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('Duplicate GL transaction IDs');
  });

  it('PARTIALLY_MATCHED GL transaction without explicit allocation = HTTP 400', async () => {
    setupMockPeriod();
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        signedAmount: new Prisma.Decimal('500.00'),
      } as any,
    ]);
    vi.spyOn(prisma.glTransaction, 'findMany').mockResolvedValue([
      {
        id: 'gtx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'PARTIALLY_MATCHED',
        amount: new Prisma.Decimal('500.00'),
      } as any,
    ]);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1'],
        // glAllocations missing for PARTIALLY_MATCHED
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.jsonData.error).toContain('requires an explicit allocation amount in glAllocations');
  });

  it('PARTIALLY_MATCHED with valid explicit allocation = HTTP 201', async () => {
    setupMockPeriod();
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'PARTIALLY_MATCHED',
        signedAmount: new Prisma.Decimal('1000.00'),
      } as any,
    ]);
    vi.spyOn(prisma.glTransaction, 'findMany').mockResolvedValue([
      {
        id: 'gtx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        amount: new Prisma.Decimal('400.00'),
      } as any,
    ]);

    const bankTxUpdateSpy = vi.fn().mockResolvedValue({});
    const glTxUpdateSpy = vi.fn().mockResolvedValue({});

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        reconciliationMatch: { create: vi.fn().mockResolvedValue({ id: 'm-partial' }) },
        bankTransactionMatch: {
          aggregate: vi.fn().mockResolvedValue({ _sum: { allocatedAmount: new Prisma.Decimal('500.00') } }),
          create: vi.fn().mockResolvedValue({ id: 'btxm-1' }),
        },
        glTransactionMatch: {
          aggregate: vi.fn().mockResolvedValue({ _sum: { allocatedAmount: new Prisma.Decimal('0') } }),
          create: vi.fn().mockResolvedValue({ id: 'gtxm-1' }),
        },
        bankTransaction: { update: bankTxUpdateSpy },
        glTransaction: { update: glTxUpdateSpy },
        reconciliationPeriod: { update: vi.fn().mockResolvedValue({}) },
      });
    });

    vi.spyOn(prisma.reconciliationMatch, 'findUnique').mockResolvedValue({
      id: 'm-partial',
      matchType: 'ONE_TO_ONE',
      bankTransactions: [{ bankTransactionId: 'btx-1' }],
      glTransactions: [{ glTransactionId: 'gtx-1' }],
    } as any);
    vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1'],
        bankAllocations: { 'btx-1': '400.00' },
        glAllocations: { 'gtx-1': '400.00' },
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(201);
    expect(res.jsonData.match.id).toBe('m-partial');
    // Verify bank transaction was updated to PARTIALLY_MATCHED because 500 + 400 = 900 < 1000
    expect(bankTxUpdateSpy).toHaveBeenCalledWith({
      where: { id: 'btx-1' },
      data: { status: 'PARTIALLY_MATCHED' },
    });
    // GL transaction was updated to MATCHED because 0 + 400 = 400 == 400
    expect(glTxUpdateSpy).toHaveBeenCalledWith({
      where: { id: 'gtx-1' },
      data: { status: 'MATCHED' },
    });
  });
});

describe('Production Unmatch Status Recalculation Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const setupMockPeriod = () => {
    vi.spyOn(prisma.reconciliationPeriod, 'findFirst').mockResolvedValue({
      id: 'p-1',
      organizationId: 'org-1',
      bankAccountId: 'acc-1',
      status: 'PROCESSING',
      isLocked: false,
    } as any);
  };

  it('Unmatching a transaction with remaining allocation recalculates status to PARTIALLY_MATCHED', async () => {
    setupMockPeriod();
    vi.spyOn(prisma.reconciliationMatch, 'findFirst').mockResolvedValue({
      id: 'match-1',
      reconciliationPeriodId: 'p-1',
      bankTransactions: [{ bankTransactionId: 'btx-1' }],
      glTransactions: [{ glTransactionId: 'gtx-1' }],
    } as any);

    const bankTxUpdateSpy = vi.fn().mockResolvedValue({});
    const glTxUpdateSpy = vi.fn().mockResolvedValue({});
    const btxmDeleteManySpy = vi.fn().mockResolvedValue({ count: 1 });
    const gtxmDeleteManySpy = vi.fn().mockResolvedValue({ count: 1 });
    const matchDeleteSpy = vi.fn().mockResolvedValue({});

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        bankTransactionMatch: {
          deleteMany: btxmDeleteManySpy,
          aggregate: vi.fn().mockResolvedValue({
            // Remaining allocation of 200 after match-1 junction record deletion
            _sum: { allocatedAmount: new Prisma.Decimal('200.00') },
          }),
        },
        glTransactionMatch: {
          deleteMany: gtxmDeleteManySpy,
          aggregate: vi.fn().mockResolvedValue({
            // Remaining allocation of 200 after match-1 junction record deletion
            _sum: { allocatedAmount: new Prisma.Decimal('200.00') },
          }),
        },
        reconciliationMatch: {
          delete: matchDeleteSpy,
        },
        bankTransaction: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'btx-1',
            signedAmount: new Prisma.Decimal('500.00'),
          }),
          update: bankTxUpdateSpy,
        },
        glTransaction: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'gtx-1',
            amount: new Prisma.Decimal('500.00'),
          }),
          update: glTxUpdateSpy,
        },
      });
    });

    vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: { matchId: 'match-1' },
    };
    const res = createMockRes();

    await unmatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(res.jsonData.success).toBe(true);

    // Remaining allocation is 200.00 out of 500.00 => PARTIALLY_MATCHED
    expect(bankTxUpdateSpy).toHaveBeenCalledWith({
      where: { id: 'btx-1' },
      data: { status: 'PARTIALLY_MATCHED' },
    });
    expect(glTxUpdateSpy).toHaveBeenCalledWith({
      where: { id: 'gtx-1' },
      data: { status: 'PARTIALLY_MATCHED' },
    });
  });

  it('Unmatching the final allocation recalculates status to UNMATCHED', async () => {
    setupMockPeriod();
    vi.spyOn(prisma.reconciliationMatch, 'findFirst').mockResolvedValue({
      id: 'match-final',
      reconciliationPeriodId: 'p-1',
      bankTransactions: [{ bankTransactionId: 'btx-1' }],
      glTransactions: [{ glTransactionId: 'gtx-1' }],
    } as any);

    const bankTxUpdateSpy = vi.fn().mockResolvedValue({});
    const glTxUpdateSpy = vi.fn().mockResolvedValue({});

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        bankTransactionMatch: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          aggregate: vi.fn().mockResolvedValue({
            // Zero remaining allocation
            _sum: { allocatedAmount: new Prisma.Decimal('0.00') },
          }),
        },
        glTransactionMatch: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          aggregate: vi.fn().mockResolvedValue({
            _sum: { allocatedAmount: new Prisma.Decimal('0.00') },
          }),
        },
        reconciliationMatch: {
          delete: vi.fn().mockResolvedValue({}),
        },
        bankTransaction: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'btx-1',
            signedAmount: new Prisma.Decimal('500.00'),
          }),
          update: bankTxUpdateSpy,
        },
        glTransaction: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'gtx-1',
            amount: new Prisma.Decimal('500.00'),
          }),
          update: glTxUpdateSpy,
        },
      });
    });

    vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: { matchId: 'match-final' },
    };
    const res = createMockRes();

    await unmatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(200);

    // Remaining allocation is 0.00 => UNMATCHED
    expect(bankTxUpdateSpy).toHaveBeenCalledWith({
      where: { id: 'btx-1' },
      data: { status: 'UNMATCHED' },
    });
    expect(glTxUpdateSpy).toHaveBeenCalledWith({
      where: { id: 'gtx-1' },
      data: { status: 'UNMATCHED' },
    });
  });

  it('Fully allocated transaction remains MATCHED when another unrelated match is removed', async () => {
    setupMockPeriod();
    vi.spyOn(prisma.reconciliationMatch, 'findFirst').mockResolvedValue({
      id: 'match-2',
      reconciliationPeriodId: 'p-1',
      bankTransactions: [{ bankTransactionId: 'btx-2' }],
      glTransactions: [{ glTransactionId: 'gtx-2' }],
    } as any);

    const bankTxUpdateSpy = vi.fn().mockResolvedValue({});
    const glTxUpdateSpy = vi.fn().mockResolvedValue({});

    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        bankTransactionMatch: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          aggregate: vi.fn().mockResolvedValue({
            // Full allocation remaining from other match groups
            _sum: { allocatedAmount: new Prisma.Decimal('1000.00') },
          }),
        },
        glTransactionMatch: {
          deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          aggregate: vi.fn().mockResolvedValue({
            _sum: { allocatedAmount: new Prisma.Decimal('1000.00') },
          }),
        },
        reconciliationMatch: {
          delete: vi.fn().mockResolvedValue({}),
        },
        bankTransaction: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'btx-2',
            signedAmount: new Prisma.Decimal('1000.00'),
          }),
          update: bankTxUpdateSpy,
        },
        glTransaction: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'gtx-2',
            amount: new Prisma.Decimal('1000.00'),
          }),
          update: glTxUpdateSpy,
        },
      });
    });

    vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: { matchId: 'match-2' },
    };
    const res = createMockRes();

    await unmatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(200);

    // Remaining allocation equals full amount => MATCHED
    expect(bankTxUpdateSpy).toHaveBeenCalledWith({
      where: { id: 'btx-2' },
      data: { status: 'MATCHED' },
    });
    expect(glTxUpdateSpy).toHaveBeenCalledWith({
      where: { id: 'gtx-2' },
      data: { status: 'MATCHED' },
    });
  });
});

describe('Tenant Isolation Enforcement', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('foreign matchingRuleId = rejected', async () => {
    vi.spyOn(prisma.reconciliationPeriod, 'findFirst').mockResolvedValue({
      id: 'p-1',
      organizationId: 'org-1',
      bankAccountId: 'acc-1',
      status: 'PROCESSING',
      isLocked: false,
    } as any);

    // Rule belongs to org-2
    vi.spyOn(prisma.matchingRule, 'findFirst').mockResolvedValue(null);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1'],
        matchingRuleId: 'rule-foreign',
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(403);
    expect(res.jsonData.error).toContain('Matching rule belongs to another organization');
  });

  it('valid organization matchingRuleId = accepted', async () => {
    vi.spyOn(prisma.reconciliationPeriod, 'findFirst').mockResolvedValue({
      id: 'p-1',
      organizationId: 'org-1',
      bankAccountId: 'acc-1',
      status: 'PROCESSING',
      isLocked: false,
    } as any);

    vi.spyOn(prisma.matchingRule, 'findFirst').mockResolvedValue({
      id: 'rule-valid',
      organizationId: 'org-1',
      isActive: true,
    } as any);
    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-1',
        organizationId: 'org-1',
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
    vi.spyOn(prisma, '$transaction').mockImplementation(async (cb: any) => {
      return cb({
        reconciliationMatch: { create: vi.fn().mockResolvedValue({ id: 'm-rule' }) },
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
    vi.spyOn(prisma.reconciliationMatch, 'findUnique').mockResolvedValue({
      id: 'm-rule',
      matchType: 'ONE_TO_ONE',
      matchingRuleId: 'rule-valid',
      bankTransactions: [{ bankTransactionId: 'btx-1' }],
      glTransactions: [{ glTransactionId: 'gtx-1' }],
    } as any);
    vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as any);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1'],
        matchingRuleId: 'rule-valid',
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(201);
    expect(res.jsonData.match.id).toBe('m-rule');
  });

  it('foreign assignedUserId = rejected', async () => {
    vi.spyOn(prisma.user, 'findFirst').mockResolvedValue(null);

    const req = {
      organization: { id: 'org-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'] },
      body: {
        category: 'OTHER',
        priority: 'HIGH',
        riskLevel: 'MEDIUM',
        description: 'Testing assigned user isolation',
        relevantDate: '2026-03-01T00:00:00.000Z',
        assignedUserId: 'a0000000-0000-4000-8000-000000000099',
      },
    };
    const res = createMockRes();

    await createExceptionHandler(req as any, res as any);
    expect([400, 403, 404]).toContain(res.statusCode);
    expect(res.jsonData.error).toContain('Assigned user not found in organization');
  });

  it('foreign bank transaction = rejected', async () => {
    vi.spyOn(prisma.reconciliationPeriod, 'findFirst').mockResolvedValue({
      id: 'p-1',
      organizationId: 'org-1',
      bankAccountId: 'acc-1',
      status: 'PROCESSING',
      isLocked: false,
    } as any);

    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-foreign',
        organizationId: 'org-foreign',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        signedAmount: new Prisma.Decimal('100.00'),
      } as any,
    ]);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
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
    expect(res.jsonData.error).toContain('Cross-tenant bank transaction matching is strictly prohibited');
  });

  it('foreign GL transaction = rejected', async () => {
    vi.spyOn(prisma.reconciliationPeriod, 'findFirst').mockResolvedValue({
      id: 'p-1',
      organizationId: 'org-1',
      bankAccountId: 'acc-1',
      status: 'PROCESSING',
      isLocked: false,
    } as any);

    vi.spyOn(prisma.bankTransaction, 'findMany').mockResolvedValue([
      {
        id: 'btx-1',
        organizationId: 'org-1',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        signedAmount: new Prisma.Decimal('100.00'),
      } as any,
    ]);
    vi.spyOn(prisma.glTransaction, 'findMany').mockResolvedValue([
      {
        id: 'gtx-foreign',
        organizationId: 'org-foreign',
        bankAccountId: 'acc-1',
        status: 'UNMATCHED',
        amount: new Prisma.Decimal('100.00'),
      } as any,
    ]);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-foreign'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(403);
    expect(res.jsonData.error).toContain('Cross-tenant GL transaction matching is strictly prohibited');
  });

  it('foreign reconciliation period = rejected', async () => {
    vi.spyOn(prisma.reconciliationPeriod, 'findFirst').mockResolvedValue(null);

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-foreign' },
      user: { id: 'u-1', email: 'acct@org.com', roles: ['ACCOUNTANT'], permissions: ['manually_match'] },
      body: {
        matchType: 'ONE_TO_ONE',
        bankTransactionIds: ['btx-1'],
        glTransactionIds: ['gtx-1'],
      },
    };
    const res = createMockRes();

    await createMatchHandler(req as any, res as any);
    expect(res.statusCode).toBe(404);
    expect(res.jsonData.error).toContain('Reconciliation period not found');
  });
});

describe('Duplicate Detection & Decimal Precision', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('duplicate detection: same organization + same fingerprint = rejected', async () => {
    vi.spyOn(prisma.bankAccount, 'findFirst').mockResolvedValue({
      id: 'a0000000-0000-4000-8000-000000000001',
      organizationId: 'org-1',
    } as any);
    vi.spyOn(prisma.bankTransaction, 'findFirst').mockResolvedValue({
      id: 'btx-existing',
      organizationId: 'org-1',
    } as any);

    const req = {
      organization: { id: 'org-1' },
      user: { id: 'u-1', email: 'u@org.com', roles: ['ACCOUNTANT'] },
      query: { preventDuplicates: 'true' },
      body: {
        bankAccountId: 'a0000000-0000-4000-8000-000000000001',
        transactionDate: '2026-03-01T00:00:00.000Z',
        description: 'Vendor payment',
        debit: '500.00',
        credit: '0.00',
        preventDuplicates: true,
      },
    };
    const res = createMockRes();

    await createBankTransactionHandler(req as any, res as any);
    expect(res.statusCode).toBe(409);
    expect(res.jsonData.isDuplicate).toBe(true);
  });

  it('duplicate detection: different organization + same fingerprint = allowed', async () => {
    vi.spyOn(prisma.bankAccount, 'findFirst').mockResolvedValue({
      id: 'a0000000-0000-4000-8000-000000000002',
      organizationId: 'org-2',
    } as any);
    // findFirst scoped by org-2 returns null (even if org-1 has this fingerprint)
    vi.spyOn(prisma.bankTransaction, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.bankTransaction, 'create').mockResolvedValue({
      id: 'btx-new',
      organizationId: 'org-2',
    } as any);
    vi.spyOn(prisma.auditEvent, 'create').mockResolvedValue({} as any);

    const req = {
      organization: { id: 'org-2' },
      user: { id: 'u-2', email: 'u@org2.com', roles: ['ACCOUNTANT'] },
      query: { preventDuplicates: 'true' },
      body: {
        bankAccountId: 'a0000000-0000-4000-8000-000000000002',
        transactionDate: '2026-03-01T00:00:00.000Z',
        description: 'Vendor payment',
        debit: '500.00',
        credit: '0.00',
        preventDuplicates: true,
      },
    };
    const res = createMockRes();

    await createBankTransactionHandler(req as any, res as any);
    expect(res.statusCode).toBe(201);
    expect(res.jsonData.transaction.id).toBe('btx-new');
  });

  it('exact Decimal precision avoids JavaScript floating point drift (0.1, 0.2, 0.3)', () => {
    // Standard IEEE 754 fails exact match
    const jsFloat = 0.1 + 0.2;
    expect(jsFloat === 0.3).toBe(false);

    // Prisma.Decimal maintains exact financial representation
    const d1 = new Prisma.Decimal('0.1');
    const d2 = new Prisma.Decimal('0.2');
    const dTarget = new Prisma.Decimal('0.3');

    const sum = d1.plus(d2);
    expect(sum.equals(dTarget)).toBe(true);
    expect(sum.toString()).toBe('0.3');

    // Subtraction precision
    const diff = dTarget.minus(d1);
    expect(diff.equals(d2)).toBe(true);
    expect(diff.toString()).toBe('0.2');

    // High precision financial verification
    const high1 = new Prisma.Decimal('999999999.99');
    const high2 = new Prisma.Decimal('0.01');
    expect(high1.plus(high2).toFixed(2)).toBe('1000000000.00');
    expect(high1.plus(high2).equals(new Prisma.Decimal('1000000000'))).toBe(true);
  });
});

describe('Dashboard & Automatic Matching Constraints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('verifies manual matches are NOT reported as automatic matches in dashboard summary', async () => {
    vi.spyOn(prisma.bankAccount, 'count').mockResolvedValue(1);
    vi.spyOn(prisma.bankStatement, 'count').mockResolvedValue(1);
    vi.spyOn(prisma.bankTransaction, 'count')
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(5)  // matched
      .mockResolvedValueOnce(5); // unmatched
    vi.spyOn(prisma.glTransaction, 'count')
      .mockResolvedValueOnce(10) // total
      .mockResolvedValueOnce(5)  // matched
      .mockResolvedValueOnce(5); // unmatched
    vi.spyOn(prisma.exceptionRecord, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.reconciliationPeriod, 'count').mockResolvedValue(1);
    vi.spyOn(prisma.matchingRule, 'count').mockResolvedValue(1);
    vi.spyOn(prisma.bankTransaction, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.glTransaction, 'findFirst').mockResolvedValue(null);
    vi.spyOn(prisma.auditEvent, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.reconciliationPeriod, 'findMany').mockResolvedValue([]);
    vi.spyOn(prisma.bankTransaction, 'aggregate').mockResolvedValue({
      _sum: { signedAmount: new Prisma.Decimal('500.00') },
    } as any);
    vi.spyOn(prisma.glTransaction, 'aggregate').mockResolvedValue({
      _sum: { amount: new Prisma.Decimal('500.00') },
    } as any);

    const req = {
      organization: { id: 'org-1' },
      user: { id: 'u-1', roles: ['ADMIN'], permissions: ['view_dashboard'] },
    };
    const res = createMockRes();

    await getDashboardSummaryHandler(req as any, res as any);
    expect(res.statusCode).toBe(200);
    const metrics = res.jsonData.metrics;

    // Must be attributed to manual matches, NOT automatic matches
    expect(metrics.manuallyMatchedCount).toBe(10);
    expect(metrics.automaticallyMatchedCount).toBe(0);
    expect(metrics.matchedCount).toBe(10);
  });

  it('automatic matching production handler returns HTTP 501 DEFERRED with zero Prisma operations', async () => {
    const findPeriodSpy = vi.spyOn(prisma.reconciliationPeriod, 'findFirst');
    const findBankTxSpy = vi.spyOn(prisma.bankTransaction, 'findMany');
    const findGlTxSpy = vi.spyOn(prisma.glTransaction, 'findMany');
    const txSpy = vi.spyOn(prisma, '$transaction');
    const matchCreateSpy = vi.spyOn(prisma.reconciliationMatch, 'create');
    const btxMatchCreateSpy = vi.spyOn(prisma.bankTransactionMatch, 'create');
    const gtxMatchCreateSpy = vi.spyOn(prisma.glTransactionMatch, 'create');
    const btxUpdateSpy = vi.spyOn(prisma.bankTransaction, 'update');
    const gtxUpdateSpy = vi.spyOn(prisma.glTransaction, 'update');

    const req = {
      organization: { id: 'org-1' },
      params: { id: 'p-1' },
      user: { id: 'u-1', email: 'admin@org.com', roles: ['ADMIN'], permissions: ['reconcile'] },
    };
    const res = createMockRes();

    await proposeAutoMatchesHandler(req as any, res as any);

    expect(res.statusCode).toBe(501);
    expect(res.jsonData.status).toBe('DEFERRED');
    expect(res.jsonData.phase).toBe('PHASE_3_DEFERRED');
    expect(res.jsonData.error).toBe('Not Implemented');
    expect(res.jsonData.message).toBe('Automatic reconciliation engine execution is deferred to Phase 3.');

    // Prove ZERO database operations
    expect(findPeriodSpy).not.toHaveBeenCalled();
    expect(findBankTxSpy).not.toHaveBeenCalled();
    expect(findGlTxSpy).not.toHaveBeenCalled();
    expect(txSpy).not.toHaveBeenCalled();
    expect(matchCreateSpy).not.toHaveBeenCalled();
    expect(btxMatchCreateSpy).not.toHaveBeenCalled();
    expect(gtxMatchCreateSpy).not.toHaveBeenCalled();
    expect(btxUpdateSpy).not.toHaveBeenCalled();
    expect(gtxUpdateSpy).not.toHaveBeenCalled();
  });
});
