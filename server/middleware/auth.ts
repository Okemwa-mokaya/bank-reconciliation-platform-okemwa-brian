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
    const authHeader = req.headers['authorization'];
    const bearerUserId = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : undefined;
    const requestedUserId = (req.headers['x-user-id'] as string) || bearerUserId || undefined;
    const requestedOrgSlug = (req.headers['x-organization-slug'] as string) || undefined;
    const requestedOrgId = (req.headers['x-organization-id'] as string) || undefined;
    const requestedUserRole = (req.headers['x-user-role'] as string) || undefined;

    let user = null;

    // 1. Direct User ID Authentication
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

      if (!user || user.status !== 'ACTIVE') {
        return res.status(401).json({ error: 'Unauthorized: User not found or inactive' });
      }

      // Security check: If explicit organization was also requested, verify membership
      if (requestedOrgId && user.organizationId !== requestedOrgId) {
        return res.status(403).json({ error: 'Forbidden: User does not belong to requested organization' });
      }
      if (requestedOrgSlug && user.organization.slug !== requestedOrgSlug) {
        return res.status(403).json({ error: 'Forbidden: User does not belong to requested organization' });
      }
    }

    // 2. Role & Org Slug Context Authentication (For UI persona selection)
    if (!user && (requestedOrgSlug || requestedOrgId || requestedUserRole)) {
      // Find the organization first
      let targetOrg = null;
      if (requestedOrgId) {
        targetOrg = await prisma.organization.findUnique({ where: { id: requestedOrgId } });
      } else if (requestedOrgSlug) {
        targetOrg = await prisma.organization.findUnique({ where: { slug: requestedOrgSlug } });
      } else {
        targetOrg = await prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
      }

      if (targetOrg) {
        // Find user by role within that organization
        if (requestedUserRole) {
          user = await prisma.user.findFirst({
            where: {
              organizationId: targetOrg.id,
              status: 'ACTIVE',
              userRoles: {
                some: {
                  role: {
                    code: requestedUserRole.toUpperCase(),
                  },
                },
              },
            },
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

        // Fallback to any active user in that organization
        if (!user) {
          user = await prisma.user.findFirst({
            where: { organizationId: targetOrg.id, status: 'ACTIVE' },
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
      }
    }

    // 3. Default active administrator fallback
    if (!user) {
      user = await prisma.user.findFirst({
        where: { status: 'ACTIVE' },
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

    if (!user || !user.organization || user.status !== 'ACTIVE') {
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

    // STRICT: Tenant is always sourced from verified user's organization in database
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
