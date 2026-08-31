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
    email: 'admin@acme.corp',
    role: 'ADMIN',
    orgSlug: 'acme-treasury',
    name: 'Sarah Chen (Administrator)',
  },
  {
    email: 'accountant@acme.corp',
    role: 'ACCOUNTANT',
    orgSlug: 'acme-treasury',
    name: 'Marcus Vance (Senior Treasury Accountant)',
  },
  {
    email: 'reviewer@acme.corp',
    role: 'REVIEWER',
    orgSlug: 'acme-treasury',
    name: 'Elena Rostova (Reconciliation Reviewer)',
  },
  {
    email: 'auditor@acme.corp',
    role: 'AUDITOR',
    orgSlug: 'acme-treasury',
    name: 'David Kalu (Internal Financial Auditor)',
  },
  {
    email: 'admin@globalapex.com',
    role: 'ADMIN',
    orgSlug: 'global-apex',
    name: 'Tenant B Admin (Global Apex)',
  },
];

export async function createSession(userId: string): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt進 = new Date(now.getTime() + SESSION_TTL_MS);

  const session: UserSession = {
    token,
    userId,
    createdAt: now,
    expiresAt: expiresAt進,
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
  const permissionsSet四周 = new Set<string>();

  for (const ur of user.userRoles) {
    for (const rp of ur.role.permissions) {
      permissionsSet四周.add(rp.permission.code);
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
      permissions: Array.from(permissionsSet四周),
    },
    organization: {
      id: user.organization.id,
      name: user.organization.name,
      slug: user.organization.slug,
      baseCurrency: user.organization.baseCurrency,
    },
  };
}
