import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import { Server } from 'node:http';
import { authMiddleware } from '../server/middleware/auth';
import { systemRouter } from '../server/routes/systemRoutes';
import { createSession } from '../server/services/authService';
import { prisma } from '../server/db';
import * as seedModule from '../server/seed';

describe('System Endpoints Security Hardening', () => {
  let server: Server;
  let baseUrl: string;
  let adminToken: string;
  let accountantToken: string;
  let auditorToken: string;

  beforeAll(async () => {
    // 1. Setup real express app matching production mount
    const app = express();
    app.use(express.json());

    // Mount system router with real production authMiddleware
    app.use('/api/system', authMiddleware, systemRouter);

    // Public health endpoint matching server.ts
    app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 2. Generate cryptographically verified session tokens
    adminToken = await createSession('admin-usr-1');
    accountantToken = await createSession('acct-usr-1');
    auditorToken = await createSession('auditor-usr-1');

    // 3. Mock prisma.user.findUnique to return realistic user roles for these sessions
    vi.spyOn(prisma.user, 'findUnique').mockImplementation((async (args: any) => {
      const id = args.where.id;
      if (id === 'admin-usr-1') {
        return {
          id: 'admin-usr-1',
          email: 'admin@reconciliation.org',
          fullName: 'System Administrator',
          status: 'ACTIVE',
          organizationId: 'org-test',
          organization: { id: 'org-test', name: 'Test Org', slug: 'test-org', baseCurrency: 'USD', status: 'ACTIVE' },
          userRoles: [
            {
              role: {
                code: 'ADMIN',
                permissions: [{ permission: { code: 'manage_users' } }, { permission: { code: 'configure_rules' } }],
              },
            },
          ],
        } as any;
      }
      if (id === 'acct-usr-1') {
        return {
          id: 'acct-usr-1',
          email: 'acct@reconciliation.org',
          fullName: 'Staff Accountant',
          status: 'ACTIVE',
          organizationId: 'org-test',
          organization: { id: 'org-test', name: 'Test Org', slug: 'test-org', baseCurrency: 'USD', status: 'ACTIVE' },
          userRoles: [
            {
              role: {
                code: 'ACCOUNTANT',
                permissions: [{ permission: { code: 'manually_match' } }, { permission: { code: 'view_transactions' } }],
              },
            },
          ],
        } as any;
      }
      if (id === 'auditor-usr-1') {
        return {
          id: 'auditor-usr-1',
          email: 'auditor@reconciliation.org',
          fullName: 'Internal Auditor',
          status: 'ACTIVE',
          organizationId: 'org-test',
          organization: { id: 'org-test', name: 'Test Org', slug: 'test-org', baseCurrency: 'USD', status: 'ACTIVE' },
          userRoles: [
            {
              role: {
                code: 'AUDITOR',
                permissions: [{ permission: { code: 'view_audit_log' } }],
              },
            },
          ],
        } as any;
      }
      return null;
    }) as any);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // --- Seed Endpoint Tests ---
  it('1. Unauthenticated request to POST /api/system/seed is rejected (401)', async () => {
    const res = await fetch(`${baseUrl}/api/system/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Unauthorized');
    expect(body.code).toBe('AUTH_REQUIRED');
  });

  it('2. Authenticated non-admin user (ACCOUNTANT) cannot invoke POST /api/system/seed (403)', async () => {
    const res = await fetch(`${baseUrl}/api/system/seed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accountantToken}`,
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Forbidden');
    expect(body.requiredRoles).toContain('ADMIN');
  });

  it('3. Authenticated auditor cannot invoke POST /api/system/seed (403)', async () => {
    const res = await fetch(`${baseUrl}/api/system/seed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${auditorToken}`,
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Forbidden');
  });

  it('4. Authorized administrator can access POST /api/system/seed (200)', async () => {
    const seedSpy = vi.spyOn(seedModule, 'seedDatabase').mockResolvedValue(undefined as any);

    const res = await fetch(`${baseUrl}/api/system/seed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.message).toContain('seeded successfully');
    expect(seedSpy).toHaveBeenCalled();
  });

  // --- Schema Info Endpoint Tests ---
  it('5. Unauthenticated request to GET /api/system/schema-info is rejected (401)', async () => {
    const res = await fetch(`${baseUrl}/api/system/schema-info`);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain('Unauthorized');
    expect(body.code).toBe('AUTH_REQUIRED');
  });

  it('6. Unauthorized non-admin user (ACCOUNTANT) cannot access GET /api/system/schema-info (403)', async () => {
    const res = await fetch(`${baseUrl}/api/system/schema-info`, {
      headers: {
        Authorization: `Bearer ${accountantToken}`,
      },
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Forbidden');
    expect(body.requiredRoles).toContain('ADMIN');
  });

  it('7. Authorized administrator can access GET /api/system/schema-info (200)', async () => {
    vi.spyOn(prisma.organization, 'count').mockResolvedValue(2 as any);
    vi.spyOn(prisma.user, 'count').mockResolvedValue(5 as any);
    vi.spyOn(prisma.role, 'count').mockResolvedValue(4 as any);
    vi.spyOn(prisma.permission, 'count').mockResolvedValue(12 as any);
    vi.spyOn(prisma.bank, 'count').mockResolvedValue(3 as any);
    vi.spyOn(prisma.bankAccount, 'count').mockResolvedValue(6 as any);
    vi.spyOn(prisma.bankStatement, 'count').mockResolvedValue(10 as any);
    vi.spyOn(prisma.statementPage, 'count').mockResolvedValue(10 as any);
    vi.spyOn(prisma.bankTransaction, 'count').mockResolvedValue(50 as any);
    vi.spyOn(prisma.glTransaction, 'count').mockResolvedValue(50 as any);
    vi.spyOn(prisma.reconciliationPeriod, 'count').mockResolvedValue(2 as any);
    vi.spyOn(prisma.reconciliationMatch, 'count').mockResolvedValue(20 as any);
    vi.spyOn(prisma.matchingRule, 'count').mockResolvedValue(5 as any);
    vi.spyOn(prisma.toleranceConfig, 'count').mockResolvedValue(4 as any);
    vi.spyOn(prisma.exceptionRecord, 'count').mockResolvedValue(3 as any);
    vi.spyOn(prisma.agingBucketConfig, 'count').mockResolvedValue(4 as any);
    vi.spyOn(prisma.auditEvent, 'count').mockResolvedValue(100 as any);

    const res = await fetch(`${baseUrl}/api/system/schema-info`, {
      headers: {
        Authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schemaVersion).toBe('1.0.0-foundation');
    expect(body.entities).toBeDefined();
    expect(typeof body.entities.organizations).toBe('number');
    expect(body.entities.organizations).toBe(2);
  });

  // --- Public Health Endpoints Preservation Tests ---
  it('8. Public health endpoint GET /api/system/health remains accessible without authentication (200)', async () => {
    const res = await fetch(`${baseUrl}/api/system/health`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBeDefined();
    expect(body.architecture).toBeDefined();
    expect(body.phase).toContain('Phase 1');
  });

  it('9. Public health endpoint GET /api/health remains accessible without authentication (200)', async () => {
    const res = await fetch(`${baseUrl}/api/health`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.timestamp).toBeDefined();
  });
});
