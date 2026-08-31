import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission } from '../middleware/rbac';
import {
  CreateMatchingRuleSchema,
  CreateToleranceSchema,
  UpdateMatchingControlSchema,
} from '../validators/schemas';
import { recordAuditEvent } from '../services/auditService';

export const matchingRouter = Router();

// 1. Get Matching Criteria (Strong vs Additional metadata)
matchingRouter.get('/criteria', requirePermission('view_dashboard'), async (req, res) => {
  try {
    const criteria = await prisma.matchingCriterion.findMany({
      orderBy: [{ isStrong: 'desc' }, { code: 'asc' }],
    });

    const strongCriteria = criteria.filter((c) => c.isStrong);
    const additionalCriteria = criteria.filter((c) => !c.isStrong);

    res.json({
      criteria,
      summary: {
        total: criteria.length,
        strongCount: strongCriteria.length,
        additionalCount: additionalCriteria.length,
      },
    });
  } catch (error) {
    console.error('Error fetching criteria:', error);
    res.status(500).json({ error: 'Failed to fetch matching criteria' });
  }
});

// 2. Get Organization Matching Controls (Default min 3 total, min 2 strong criteria)
matchingRouter.get('/controls', requirePermission('view_dashboard'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    let controls = await prisma.matchingControlConfig.findUnique({
      where: { organizationId: orgId },
    });

    if (!controls) {
      controls = await prisma.matchingControlConfig.create({
        data: {
          organizationId: orgId,
          minTotalCriteria: 3,
          minStrongCriteria: 2,
          allowFuzzyNarration: false,
          requireExactCurrency: true,
        },
      });
    }

    res.json({ controls });
  } catch (error) {
    console.error('Error fetching matching controls:', error);
    res.status(500).json({ error: 'Failed to fetch matching controls' });
  }
});

// Update Organization Matching Controls
matchingRouter.put('/controls', requirePermission('configure_rules'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const validated = UpdateMatchingControlSchema.parse(req.body);

    const prev = await prisma.matchingControlConfig.findUnique({
      where: { organizationId: orgId },
    });

    const controls = await prisma.matchingControlConfig.upsert({
      where: { organizationId: orgId },
      update: validated,
      create: {
        organizationId: orgId,
        ...validated,
      },
    });

    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles[0],
      action: 'MATCHING_CONTROLS_UPDATED',
      entityType: 'MatchingControlConfig',
      entityId: controls.id,
      previousValue: prev,
      newValue: controls,
      reason: 'Organization matching criteria control thresholds adjusted',
    });

    res.json({ controls });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error updating matching controls:', error);
    res.status(500).json({ error: 'Failed to update matching controls' });
  }
});

// 3. List Matching Rules
matchingRouter.get('/rules', requirePermission('view_dashboard'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const rules = await prisma.matchingRule.findMany({
      where: { organizationId: orgId },
      include: {
        bankAccount: { select: { id: true, accountName: true, accountNumber: true } },
        tolerances: true,
        _count: { select: { matches: true } },
      },
      orderBy: { priority: 'asc' },
    });

    const parsedRules = rules.map((r) => ({
      ...r,
      requiredCriteria: JSON.parse(r.requiredCriteria || '[]'),
      optionalCriteria: JSON.parse(r.optionalCriteria || '[]'),
    }));

    res.json({ rules: parsedRules });
  } catch (error) {
    console.error('Error fetching matching rules:', error);
    res.status(500).json({ error: 'Failed to fetch matching rules' });
  }
});

// Create Matching Rule
matchingRouter.post('/rules', requirePermission('configure_rules'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const validated = CreateMatchingRuleSchema.parse(req.body);

    if (validated.bankAccountId) {
      const account = await prisma.bankAccount.findFirst({
        where: { id: validated.bankAccountId, organizationId: orgId },
      });
      if (!account) {
        return res.status(404).json({ error: 'Linked bank account not found in organization' });
      }
    }

    const rule = await prisma.matchingRule.create({
      data: {
        organizationId: orgId,
        bankAccountId: validated.bankAccountId || null,
        name: validated.name,
        description: validated.description || null,
        priority: validated.priority,
        isActive: validated.isActive,
        minTotalCriteria: validated.minTotalCriteria,
        minStrongCriteria: validated.minStrongCriteria,
        requiredCriteria: JSON.stringify(validated.requiredCriteria),
        optionalCriteria: JSON.stringify(validated.optionalCriteria || []),
        effectiveFrom: validated.effectiveFrom ? new Date(validated.effectiveFrom) : null,
        effectiveTo: validated.effectiveTo ? new Date(validated.effectiveTo) : null,
        createdById: req.user?.id,
      },
      include: { bankAccount: true },
    });

    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles[0],
      action: 'MATCHING_RULE_CREATED',
      entityType: 'MatchingRule',
      entityId: rule.id,
      newValue: rule,
      reason: 'Configured new automated matching rule',
    });

    res.status(201).json({
      rule: {
        ...rule,
        requiredCriteria: JSON.parse(rule.requiredCriteria),
        optionalCriteria: JSON.parse(rule.optionalCriteria || '[]'),
      },
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating matching rule:', error);
    res.status(500).json({ error: 'Failed to create matching rule' });
  }
});

// 4. List Tolerances
matchingRouter.get('/tolerances', requirePermission('view_dashboard'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const tolerances = await prisma.toleranceConfig.findMany({
      where: { organizationId: orgId },
      include: {
        bankAccount: { select: { id: true, accountName: true, accountNumber: true } },
        matchingRule: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ tolerances });
  } catch (error) {
    console.error('Error fetching tolerances:', error);
    res.status(500).json({ error: 'Failed to fetch tolerances' });
  }
});

// Create / Configure Tolerance
matchingRouter.post('/tolerances', requirePermission('configure_tolerances'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const validated = CreateToleranceSchema.parse(req.body);

    if (validated.bankAccountId) {
      const account = await prisma.bankAccount.findFirst({
        where: { id: validated.bankAccountId, organizationId: orgId },
      });
      if (!account) {
        return res.status(404).json({ error: 'Linked bank account not found in organization' });
      }
    }

    if (validated.matchingRuleId) {
      const rule = await prisma.matchingRule.findFirst({
        where: { id: validated.matchingRuleId, organizationId: orgId },
      });
      if (!rule) {
        return res.status(404).json({ error: 'Linked matching rule not found in organization' });
      }
    }

    const tolerance = await prisma.toleranceConfig.create({
      data: {
        organizationId: orgId,
        bankAccountId: validated.bankAccountId || null,
        matchingRuleId: validated.matchingRuleId || null,
        level: validated.level,
        amountToleranceType: validated.amountToleranceType,
        amountToleranceValue: validated.amountToleranceValue,
        amountToleranceMax: validated.amountToleranceMax || null,
        dateToleranceDays: validated.dateToleranceDays,
        isDateToleranceAllowed: validated.isDateToleranceAllowed,
        currencyRateTolerancePercent: validated.currencyRateTolerancePercent,
        createdById: req.user?.id,
      },
      include: {
        bankAccount: true,
        matchingRule: true,
      },
    });

    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles[0],
      action: 'TOLERANCE_CONFIGURED',
      entityType: 'ToleranceConfig',
      entityId: tolerance.id,
      newValue: tolerance,
      reason: `Tolerance configured at ${validated.level} level`,
    });

    res.status(201).json({ tolerance });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating tolerance:', error);
    res.status(500).json({ error: 'Failed to create tolerance config' });
  }
});
