import { Router } from 'express';
import { prisma } from '../db';
import { requirePermission } from '../middleware/rbac';
import { CreateBankSchema, CreateBankAccountSchema } from '../validators/schemas';
import { recordAuditEvent } from '../services/auditService';

export const bankRouter = Router();

// List Banks
bankRouter.get('/banks', requirePermission('view_dashboard'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const banks = await prisma.bank.findMany({
      where: { organizationId: orgId },
      include: {
        _count: {
          select: { accounts: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ banks });
  } catch (error) {
    console.error('Error fetching banks:', error);
    res.status(500).json({ error: 'Failed to fetch banks' });
  }
});

// Create Bank
bankRouter.post('/banks', requirePermission('manage_users'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const validated = CreateBankSchema.parse(req.body);

    const bank = await prisma.bank.create({
      data: {
        organizationId: orgId,
        name: validated.name,
        swiftCode: validated.swiftCode || null,
        routingNumber: validated.routingNumber || null,
        country: validated.country,
      },
    });

    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles[0],
      action: 'BANK_CREATED',
      entityType: 'Bank',
      entityId: bank.id,
      newValue: bank,
      reason: 'New financial institution added to organization',
    });

    res.status(201).json({ bank });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating bank:', error);
    res.status(500).json({ error: 'Failed to create bank' });
  }
});

// List Bank Accounts
bankRouter.get('/accounts', requirePermission('view_dashboard'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const accounts = await prisma.bankAccount.findMany({
      where: { organizationId: orgId },
      include: {
        bank: true,
        _count: {
          select: {
            statements: true,
            bankTransactions: true,
            reconciliationPeriods: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ accounts });
  } catch (error) {
    console.error('Error fetching bank accounts:', error);
    res.status(500).json({ error: 'Failed to fetch bank accounts' });
  }
});

// Create Bank Account
bankRouter.post('/accounts', requirePermission('manage_users'), async (req, res) => {
  try {
    const orgId = req.organization!.id;
    const validated = CreateBankAccountSchema.parse(req.body);

    // Verify bank belongs to organization
    const bank = await prisma.bank.findFirst({
      where: { id: validated.bankId, organizationId: orgId },
    });

    if (!bank) {
      return res.status(404).json({ error: 'Bank not found in organization' });
    }

    const account = await prisma.bankAccount.create({
      data: {
        organizationId: orgId,
        bankId: validated.bankId,
        accountName: validated.accountName,
        accountNumber: validated.accountNumber,
        currency: validated.currency,
        accountType: validated.accountType,
        openingBalance: validated.openingBalance,
        currentBalance: validated.openingBalance,
        status: 'ACTIVE',
      },
      include: { bank: true },
    });

    await recordAuditEvent({
      organizationId: orgId,
      actorId: req.user?.id,
      actorEmail: req.user?.email,
      actorRole: req.user?.roles[0],
      action: 'BANK_ACCOUNT_CREATED',
      entityType: 'BankAccount',
      entityId: account.id,
      newValue: account,
      reason: 'New bank account configured',
    });

    res.status(201).json({ account });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Validation error', details: error.errors });
    }
    console.error('Error creating bank account:', error);
    res.status(500).json({ error: 'Failed to create bank account' });
  }
});
