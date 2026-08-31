import { Router } from 'express';
import { requirePermission } from '../middleware/rbac';
import { getAuditEvents } from '../services/auditService';

export const auditRouter = Router();

// Immutable Audit Log Viewer
auditRouter.get('/', requirePermission('view_audit_log'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const { entityType, entityId, action, limit = 100, offset = 0 } = req.query;

    const { total, events } = await getAuditEvents(orgId, {
      entityType: typeof entityType === 'string' ? entityType : undefined,
      entityId: typeof entityId === 'string' ? entityId : undefined,
      action: typeof action === 'string' ? action : undefined,
      limit: Number(limit),
      offset: Number(offset),
    });

    const parsedEvents = events.map((e) => ({
      ...e,
      previousValue: e.previousValue ? JSON.parse(e.previousValue) : null,
      newValue: e.newValue ? JSON.parse(e.newValue) : null,
      metadata: e.metadata ? JSON.parse(e.metadata) : null,
    }));

    res.json({ total, events: parsedEvents });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit log entries' });
  }
});
