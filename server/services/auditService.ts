import { prisma } from '../db';

export interface AuditEventPayload {
  organizationId: string;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function recordAuditEvent(payload: AuditEventPayload) {
  try {
    const audit = await prisma.auditEvent.create({
      data: {
        organizationId: payload.organizationId,
        actorId: payload.actorId || null,
        actorEmail: payload.actorEmail || null,
        actorRole: payload.actorRole || null,
        action: payload.action,
        entityType: payload.entityType,
        entityId: payload.entityId,
        previousValue: payload.previousValue ? JSON.stringify(payload.previousValue) : null,
        newValue: payload.newValue ? JSON.stringify(payload.newValue) : null,
        reason: payload.reason || null,
        metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
        ipAddress: payload.ipAddress || null,
        userAgent: payload.userAgent || null,
      },
    });
    return audit;
  } catch (error) {
    console.error('CRITICAL: Failed to write audit event:', error);
    // In production finance systems, audit failures must be surfaced
    throw error;
  }
}

export async function getAuditEvents(organizationId: string, filters?: {
  entityType?: string;
  entityId?: string;
  action?: string;
  limit?: number;
  offset?: number;
}) {
  const where: Record<string, unknown> = { organizationId };

  if (filters?.entityType) where.entityType = filters.entityType;
  if (filters?.entityId) where.entityId = filters.entityId;
  if (filters?.action) where.action = filters.action;

  const [total, events] = await Promise.all([
    prisma.auditEvent.count({ where }),
    prisma.auditEvent.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
      include: {
        actor: {
          select: { id: true, email: true, fullName: true },
        },
      },
    }),
  ]);

  return { total, events };
}
