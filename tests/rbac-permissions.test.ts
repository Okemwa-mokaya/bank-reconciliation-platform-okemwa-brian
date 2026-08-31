import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../server/db';
import { seedDatabase } from '../server/seed';

describe('Role-Based Access Control (RBAC) & Granular Permissions', () => {
  beforeAll(async () => {
    await seedDatabase();
  });

  it('1. Confirms the 4 standard financial roles exist', async () => {
    const roles = await prisma.role.findMany();
    const roleCodes = roles.map((r) => r.code);

    expect(roleCodes).toContain('ADMIN');
    expect(roleCodes).toContain('ACCOUNTANT');
    expect(roleCodes).toContain('REVIEWER');
    expect(roleCodes).toContain('AUDITOR');
  });

  it('2. Confirms all 12 specification granular permissions exist', async () => {
    const requiredPermissions = [
      'view_dashboard',
      'upload_statement',
      'upload_gl',
      'view_transactions',
      'reconcile',
      'manually_match',
      'resolve_exception',
      'approve_reconciliation',
      'configure_rules',
      'configure_tolerances',
      'manage_users',
      'view_audit_log',
    ];

    const permissions = await prisma.permission.findMany();
    const codes = permissions.map((p) => p.code);

    for (const reqPerm of requiredPermissions) {
      expect(codes).toContain(reqPerm);
    }
  });

  it('3. Administrator has full configuration permissions while Auditor has read-only compliance rights', async () => {
    const adminRole = await prisma.role.findUnique({
      where: { code: 'ADMIN' },
      include: { permissions: { include: { permission: true } } },
    });

    const auditorRole = await prisma.role.findUnique({
      where: { code: 'AUDITOR' },
      include: { permissions: { include: { permission: true } } },
    });

    const adminPerms = adminRole!.permissions.map((p) => p.permission.code);
    const auditorPerms = auditorRole!.permissions.map((p) => p.permission.code);

    expect(adminPerms).toContain('manage_users');
    expect(adminPerms).toContain('configure_rules');
    expect(adminPerms).toContain('configure_tolerances');

    expect(auditorPerms).toContain('view_audit_log');
    expect(auditorPerms).toContain('view_transactions');
    expect(auditorPerms).not.toContain('upload_statement');
    expect(auditorPerms).not.toContain('reconcile');
    expect(auditorPerms).not.toContain('configure_rules');
  });
});
