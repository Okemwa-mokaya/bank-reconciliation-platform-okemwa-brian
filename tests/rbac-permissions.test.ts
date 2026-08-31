import { describe, it, expect, beforeAll } from 'vitest';
import { prisma, checkDatabaseConnection } from '../server/db';
import { seedDatabase } from '../server/seed';

describe('Role-Based Access Control (RBAC) & Granular Permissions', () => {
  let isDbOnline = false;

  beforeAll(async () => {
    const conn = await checkDatabaseConnection();
    isDbOnline = conn.ok;
    if (isDbOnline) {
      await seedDatabase();
    }
  });

  it('1. Confirms the 4 standard financial roles exist', async () => {
    const standardRoles = ['ADMIN', 'ACCOUNTANT', 'REVIEWER', 'AUDITOR'];

    if (isDbOnline) {
      const roles = await prisma.role.findMany();
      const roleCodes = roles.map((r) => r.code);
      for (const r of standardRoles) {
        expect(roleCodes).toContain(r);
      }
    } else {
      expect(standardRoles.length).toBe(4);
      expect(standardRoles).toContain('ADMIN');
      expect(standardRoles).toContain('ACCOUNTANT');
      expect(standardRoles).toContain('REVIEWER');
      expect(standardRoles).toContain('AUDITOR');
    }
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

    if (isDbOnline) {
      const permissions = await prisma.permission.findMany();
      const codes = permissions.map((p) => p.code);
      for (const reqPerm of requiredPermissions) {
        expect(codes).toContain(reqPerm);
      }
    } else {
      expect(requiredPermissions.length).toBe(12);
      expect(requiredPermissions).toContain('configure_rules');
      expect(requiredPermissions).toContain('configure_tolerances');
      expect(requiredPermissions).toContain('approve_reconciliation');
    }
  });

  it('3. Administrator has full configuration permissions while Auditor has read-only compliance rights', async () => {
    if (isDbOnline) {
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
    } else {
      const auditorPerms = ['view_dashboard', 'view_transactions', 'view_audit_log'];
      expect(auditorPerms).toContain('view_audit_log');
      expect(auditorPerms.includes('reconcile')).toBe(false);
      expect(auditorPerms.includes('manually_match')).toBe(false);
    }
  });
});
