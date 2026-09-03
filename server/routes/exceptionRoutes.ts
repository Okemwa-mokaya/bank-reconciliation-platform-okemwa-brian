import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission } from '../middleware/rbac';
import { CreateExceptionSchema, ResolveExceptionSchema } from '../validators/schemas';
import { recordAuditEvent } from '../services/auditService';

export const exceptionRouter = Router();

// List Exceptions
exceptionRouter.get('/', requirePermission('view_dashboard'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const { status, category, priority } = req.query;

    const where: Record<string, unknown> = { organizationId: orgId };
    if (status && typeof status === 'string') where.status = status;
    if (category && typeof category === 'string') where.category = category;
    if (priority && typeof priority === 'string') where.priority = priority;

    const exceptions = await prisma.exceptionRecord.findMany({
      where,
      include: {
        assignedUser: { select: { id: true, fullName: true, email: true } },
        bankTransaction: {
          select: {
            id: true,
            description: true,
            signedAmount: true,
            transactionDate: true,
            referenceNumber: true,
          },
        },
        glTransaction: {
          select: {
            id: true,
            narration: true,
            amount: true,
            transactionDate: true,
            journalNumber: true,
          },
        },
        reconciliationPeriod: {
          select: {
            id: true,
            periodStart: true,
            periodEnd: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ exceptions });
  } catch (error) {
    console.error('Error fetching exceptions:', error);
    res.status(500).json({ error: 'Failed to fetch exceptions' });
  }
});

// Create Exception
export const createExceptionHandler = async (req: any, res: any) => {
  try {
    const orgId = req.organization!.id;
    const validated = CreateExceptionSchema.parse(req.body);

    if (validated.reconciliationPeriodId) {
      const period = await prisma.reconciliationPeriod.findFirst({
        where: { id: validated.reconciliationPeriodId, organizationId: orgId },
      });
      if (!period || period.organizationId !== orgId) {
        return res.status(404).json({ error: 'Linked reconciliation period not found in organization' });
      }
      if (period.isLocked || period.status === 'CLOSED') {
        return res.status(403).json({ error: 'Cannot add exceptions to a locked or closed reconciliation period' });
      }
    }

    if (validated.bankTransactionId) {
      const bankTx = await prisma.bankTransaction.findFirst({
        where: { id: validated.bankTransactionId, organizationId: orgId },
        include: { bankAccount: { include: { bank: true } } },
      });
      if (
        !bankTx ||
        bankTx.organizationId !== orgId ||
        bankTx.bankAccount?.organizationId !== orgId ||
        bankTx.bankAccount?.bank?.organizationId !== orgId
      ) {
        return res.status(404).json({ error: 'Linked bank transaction not found in organization' });
      }
    }

    if (validated.glTransactionId) {
      const glTx = await prisma.glTransaction.findFirst({
        where: { id: validated.glTransactionId, organizationId: orgId },
      });
      if (!glTx || glTx.organizationId !== orgId) {
        return res.status(404).json({ error: 'Linked GL transaction not found in organization' });
      }
    }

    if (validated.assignedUserId) {
      const assignedUser = await prisma.user.findFirst({
        where: { id: validated.assignedUserId, organizationId: orgId },
      });
      if (!assignedUser || assignedUser.organizationId !== orgId) {
        return res.status(404).json({ error: 'Assigned user not found in organization' });
      }
    }

    const exception = await prisma.exceptionRecord.create({
      data: {
        organizationId: orgId,
        reconciliationPeriodId: validated.reconciliationPeriodId || null,
        bankTransactionId: validated.bankTransactionId || null,
        glTransactionId: validated.glTransactionId || null,
        category: validated.category,
        status: 'OPEN',
        priority: validated.priority,
        riskLevel: validated.riskLevel,
        assignedUserId: validated.assignedUserId || null,
        description: validated.description,
        relevantDate: new Date(validated.relevantDate),
      },
      include: {
        assignedUser: true,
      },
    });

    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles[0],
      action: 'EXCEPTION_CREATED',
      entityType: 'ExceptionRecord',
      entityId: exception.id,
      newValue: exception,
      reason: `Exception logged: ${validated.category} - ${validated.description}`,
    });

    res.status(201).json({ exception });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating exception:', error);
    res.status(500).json({ error: 'Failed to create exception record' });
  }
};

exceptionRouter.post('/', requirePermission('reconcile'), createExceptionHandler);

// Resolve Exception
exceptionRouter.patch('/:id/resolve', requirePermission('resolve_exception'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const { id } = req.params;
    const validated = ResolveExceptionSchema.parse(req.body);

    const prev = await prisma.exceptionRecord.findFirst({
      where: { id, organizationId: orgId },
      include: { reconciliationPeriod: true },
    });

    if (!prev) {
      return res.status(404).json({ error: 'Exception record not found' });
    }

    if (prev.reconciliationPeriod && (prev.reconciliationPeriod.isLocked || prev.reconciliationPeriod.status === 'CLOSED')) {
      return res.status(403).json({ error: 'Cannot modify exceptions belonging to a locked or closed reconciliation period' });
    }

    const updated = await prisma.exceptionRecord.update({
      where: { id },
      data: {
        status: validated.status,
        resolution: validated.resolution,
        resolvedDate: new Date(),
      },
    });

    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles[0],
      action: 'EXCEPTION_RESOLVED',
      entityType: 'ExceptionRecord',
      entityId: id,
      previousValue: { status: prev.status, resolution: prev.resolution },
      newValue: { status: updated.status, resolution: updated.resolution },
      reason: validated.resolution,
    });

    res.json({ exception: updated });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error resolving exception:', error);
    res.status(500).json({ error: 'Failed to resolve exception' });
  }
});
