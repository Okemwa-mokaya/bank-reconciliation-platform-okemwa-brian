import { Router } from 'express';
import { prisma } from '../db';
import { loginWithEmail, revokeSession, DEV_ACCOUNTS } from '../services/authService';

export const authRouter = Router();

// Public: Get demo accounts available for development testing
authRouter.get('/demo-accounts', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { status: 'ACTIVE' },
      include: {
        organization: true,
        userRoles: {
          include: { role: true },
        },
      },
      orderBy: { email: 'asc' },
    });

    if (users.length > 0) {
      const accounts = users.map((u) => ({
        email: u.email,
        fullName: u.fullName,
        role: u.userRoles[0]?.role?.code || 'ADMIN',
        orgName: u.organization.name,
        orgSlug: u.organization.slug,
        description: u.userRoles[0]?.role?.description || '',
      }));
      return res.json({
        accounts,
        instructions: 'Use POST /api/auth/login with the email address to obtain a secure Bearer token.',
      });
    }
  } catch (err) {
    // If DB is offline or table is being initialized, return DEV_ACCOUNTS
  }

  res.json({
    accounts: DEV_ACCOUNTS,
    instructions: 'Use POST /api/auth/login with the email address to obtain a secure Bearer token.',
  });
});

// Public: Login with email to obtain server-verified session token
authRouter.post('/login', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Valid email is required for authentication' });
    }

    const authResult = await loginWithEmail(email);
    if (!authResult) {
      return res.status(401).json({ error: 'Invalid credentials or inactive user account' });
    }

    res.json(authResult);
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({ error: 'Login failed due to internal error' });
  }
});

// Protected: Revoke current session token
authRouter.post('/logout', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    revokeSession(token);
  }
  res.json({ message: 'Logged out successfully' });
});

// Protected: Get current authenticated user profile and organization
authRouter.get('/me', async (req, res) => {
  if (!req.user || !req.organization) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.json({
    user: req.user,
    organization: req.organization,
  });
});

// Protected: Get organizations (scoped to active organizations list)
authRouter.get('/organizations', async (req, res) => {
  try {
    const organizations = await prisma.organization.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        name: true,
        slug: true,
        baseCurrency: true,
        status: true,
      },
      orderBy: { name: 'asc' },
    });
    res.json({ organizations });
  } catch (error) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// Protected: Get users list (scoped strictly to current tenant organization)
authRouter.get('/users', async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const users = await prisma.user.findMany({
      where: { organizationId: orgId },
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
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users list' });
  }
});
