import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db';
import { verifySessionToken } from '../services/authService';

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

// Routes that do not require authentication
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/demo-accounts',
  '/api/system/health',
  '/api/system/schema-info',
  '/api/system/seed',
  '/api/health',
];

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // 1. Allow public endpoints without authentication
    const fullPath = (req.originalUrl || req.path || '').split('?')[0];
    const subPath = (req.path || '').split('?')[0];

    if (
      PUBLIC_PATHS.some((p) => fullPath === p || fullPath.startsWith(p + '/')) ||
      subPath === '/login' ||
      subPath === '/demo-accounts' ||
      fullPath.startsWith('/api/system')
    ) {
      return next();
    }

    // 2. Strict Bearer Token extraction
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized: Authentication required. Provide Authorization Bearer token.',
        code: 'AUTH_REQUIRED',
      });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized: Empty Bearer token provided.',
        code: 'INVALID_TOKEN',
      });
    }

    // 3. Server-authoritative token verification
    const session = verifySessionToken(token);
    if (!session) {
      return res.status(401).json({
        error: 'Unauthorized: Invalid or expired session token. Please log in again.',
        code: 'SESSION_EXPIRED',
      });
    }

    // 4. Fetch authenticated user from database
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
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

    if (!user || user.status !== 'ACTIVE' || !user.organization || user.organization.status !== 'ACTIVE') {
      return res.status(401).json({
        error: 'Unauthorized: User account is inactive, suspended, or not found.',
        code: 'USER_INACTIVE',
      });
    }

    // 5. Build server-verified roles & permissions
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

    // 6. STRICT: Tenant isolation is derived solely from the server-verified database record
    req.organization = {
      id: user.organization.id,
      name: user.organization.name,
      slug: user.organization.slug,
      baseCurrency: user.organization.baseCurrency,
    };

    next();
  } catch (error) {
    console.error('Auth middleware failure:', error);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
}
