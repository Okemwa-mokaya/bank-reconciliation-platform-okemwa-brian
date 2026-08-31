import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  organizationId: string;
  roles: string[];
  permissions: string[];
}

export interface AuthenticatedOrganization {
  id: string;
  name: string;
  slug: string;
  baseCurrency: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
      organization?: AuthenticatedOrganization;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const requestedUserId = (req.headers['x-user-id'] as string) || undefined;
    const requestedOrgId = (req.headers['x-organization-id'] as string) || undefined;

    let user;

    if (requestedUserId) {
      user = await prisma.user.findUnique({
        where: { id: requestedUserId },
        include: {
          organization: true,
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
      });
    }

    // Default to the first active user (Sarah Jenkins - Admin) if not specified
    if (!user) {
      user = await prisma.user.findFirst({
        where: requestedOrgId ? { organizationId: requestedOrgId } : {},
        orderBy: { createdAt: 'asc' },
        include: {
          organization: true,
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
      });
    }

    if (!user || !user.organization) {
      return res.status(401).json({ error: 'Unauthorized: No active user profile or organization found' });
    }

    const roles: string[] = user.userRoles.map((ur) => ur.role.code);
    const permissionsSet = new Set<string>();

    for (const ur of user.userRoles) {
      for (const rp of ur.role.permissions) {
        permissionsSet.add(rp.permission.code);
      }
    }

    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      organizationId: user.organizationId,
      roles,
      permissions: Array.from(permissionsSet),
    };

    req.organization = {
      id: user.organization.id,
      name: user.organization.name,
      slug: user.organization.slug,
      baseCurrency: user.organization.baseCurrency,
    };

    next();
  } catch (error) {
    console.error('Auth middleware failure:', error);
    res.status(500).json({ error: 'Internal authentication error' });
  }
}
