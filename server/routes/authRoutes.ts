import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission } from '../middleware/rbac';
import { recordAuditEvent } from '../services/auditService';

export const authRouter = Router();

authRouter.get('/me', async (req, res) => {
  if (!req.user || !req.organization) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.json({
    user: req.user,
    organization: req.organization,
  });
});

authRouter.get('/users', async (req, res) => {
  try {
    const orgId = req.organization?.id;
    const users = await prisma.user.findMany({
      where: orgId ? { organizationId: orgId } : {},
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        userRoles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const allOrganizations = await prisma.organization.findMany({
      orderBy: { name: 'asc' },
    });

    const formattedUsers = users.map((u) => {
      const roles = u.userRoles.map((ur) => ur.role.name);
      const roleCodes = u.userRoles.map((ur) => ur.role.code);
      const permissions = Array.from(
        new Set(
          u.userRoles.flatMap((ur) =>
            ur.role.permissions.map((rp) => rp.permission.code)
          )
        )
      );

      return {
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        organizationId: u.organizationId,
        organizationName: u.organization.name,
        status: u.status,
        roles,
        roleCodes,
        permissions,
      };
    });

    res.json({
      users: formattedUsers,
      organizations: allOrganizations,
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users list' });
  }
});
