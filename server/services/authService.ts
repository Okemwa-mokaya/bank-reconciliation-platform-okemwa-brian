import crypto from 'crypto';
import { prisma } from '../db';

export interface UserSession {
  token: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

// In-memory server-authoritative session store for Phase 1 session tokens
const sessionStore = new Map<string, UserSession>();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// Default development accounts credentials map
export const DEV_ACCOUNTS = [
  {
    email: 'sarah.admin@acmetreasury.com',
    role: 'ADMIN',
    orgName: 'Acme Global Treasury Corp',
    orgSlug: 'acme-treasury',
    fullName: 'Sarah Jenkins',
    description: 'Full administrative access to financial configuration, users, rules, and audit logs',
  },
  {
    email: 'michael.accountant@acmetreasury.com',
    role: 'ACCOUNTANT',
    orgName: 'Acme Global Treasury Corp',
    orgSlug: 'acme-treasury',
    fullName: 'Michael Chen',
    description: 'Operations specialist: imports statements, performs matches, and resolves exceptions',
  },
  {
    email: 'elena.reviewer@acmetreasury.com',
    role: 'REVIEWER',
    orgName: 'Acme Global Treasury Corp',
    orgSlug: 'acme-treasury',
    fullName: 'Elena Rostova',
    description: 'Independent verification: reviews reconciliations, exceptions and submits stage approvals',
  },
  {
    email: 'marcus.auditor@acmetreasury.com',
    role: 'AUDITOR',
    orgName: 'Acme Global Treasury Corp',
    orgSlug: 'acme-treasury',
    fullName: 'Marcus Vance',
    description: 'Read-only compliance officer with immutable audit trail inspection rights',
  },
  {
    email: 'elena.admin@apexholdings.eu',
    role: 'ADMIN',
    orgName: 'Apex Financial Holdings LLC',
    orgSlug: 'apex-holdings',
    fullName: 'Elena Rostova (Apex Admin)',
    description: 'Tenant B Administrator for multi-tenant isolation testing',
  },
];

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const session: UserSession = {
    token,
    userId,
    createdAt: now,
    expiresAt,
  };

  sessionStore.set(token, session);
  return token;
}

export function verifySessionToken(token: string): { userId: string } | null {
  if (!token) return null;
  const session = sessionStore.get(token);
  if (!session) return null;

  if (new Date() > session.expiresAt) {
    sessionStore.delete(token);
    return null;
  }

  return { userId: session.userId };
}

export function revokeSession(token: string): boolean {
  return sessionStore.delete(token);
}

export async function loginWithEmail(email: string): Promise<{
  token: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    organizationId: string;
    roles: string[];
    permissions: string[];
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    baseCurrency: string;
  };
} | null> {
  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
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
    return null;
  }

  const token = await createSession(user.id);

  const roles: string[] = user.userRoles.map((ur) => ur.role.code);
  const permissionsSet = new Set<string>();

  for (const ur of user.userRoles) {
    for (const rp of ur.role.permissions) {
      permissionsSet.add(rp.permission.code);
    }
  }

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      organizationId: user.organizationId,
      roles,
      permissions: Array.from(permissionsSet),
    },
    organization: {
      id: user.organization.id,
      name: user.organization.name,
      slug: user.organization.slug,
      baseCurrency: user.organization.baseCurrency,
    },
  };
}
