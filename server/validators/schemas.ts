import { z } from 'zod';

export const CreateOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must have at least 2 characters'),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug must be alphanumeric with hyphens'),
  taxId: z.string().optional(),
  baseCurrency: z.string().length(3, 'Base currency must be a 3-letter ISO code').default('USD'),
});

export const CreateBankSchema = z.object({
  name: z.string().min(2, 'Bank name is required'),
  swiftCode: z.string().optional(),
  routingNumber: z.string().optional(),
  country: z.string().min(2).default('US'),
});

export const CreateBankAccountSchema = z.object({
  bankId: z.string().uuid('Valid bank ID required'),
  accountName: z.string().min(2, 'Account name is required'),
  accountNumber: z.string().min(3, 'Account number is required'),
  currency: z.string().length(3, 'Currency must be a 3-letter ISO code').default('USD'),
  accountType: z.enum(['CHECKING', 'SAVINGS', 'OPERATING', 'PAYROLL', 'MONEY_MARKET', 'CLEARING']).default('CHECKING'),
  openingBalance: z.union([z.number(), z.string()]).default(0.0),
});

export const CreateMatchingRuleSchema = z.object({
  bankAccountId: z.string().uuid().optional().nullable(),
  name: z.string().min(2, 'Rule name is required'),
  description: z.string().optional(),
  priority: z.number().int().min(1).default(100),
  isActive: z.boolean().default(true),
  minTotalCriteria: z.number().int().min(1).default(3),
  minStrongCriteria: z.number().int().min(1).default(2),
  requiredCriteria: z.array(z.string()).min(1, 'At least one required criterion must be specified'),
  optionalCriteria: z.array(z.string()).default([]),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
});

export const CreateToleranceSchema = z.object({
  bankAccountId: z.string().uuid().optional().nullable(),
  matchingRuleId: z.string().uuid().optional().nullable(),
  level: z.enum(['ORGANIZATION', 'BANK_ACCOUNT', 'MATCHING_RULE']).default('ORGANIZATION'),
  amountToleranceType: z.enum(['FIXED', 'PERCENTAGE']).default('FIXED'),
  amountToleranceValue: z.number().min(0, 'Tolerance value cannot be negative'),
  amountToleranceMax: z.number().min(0).optional().nullable(),
  dateToleranceDays: z.number().int().min(0).max(30).default(0),
  isDateToleranceAllowed: z.boolean().default(false),
  currencyRateTolerancePercent: z.number().min(0).default(0.0),
});

export const UpdateMatchingControlSchema = z.object({
  minTotalCriteria: z.number().int().min(1).max(9).default(3),
  minStrongCriteria: z.number().int().min(1).max(4).default(2),
  allowFuzzyNarration: z.boolean().default(false),
  requireExactCurrency: z.boolean().default(true),
});

export const CreateReconciliationPeriodSchema = z.object({
  bankAccountId: z.string().uuid('Valid bank account ID required'),
  periodStart: z.string().refine((val) => !isNaN(Date.parse(val)), 'Valid start date required'),
  periodEnd: z.string().refine((val) => !isNaN(Date.parse(val)), 'Valid end date required'),
});

export const CreateExceptionSchema = z.object({
  reconciliationPeriodId: z.string().uuid().optional().nullable(),
  bankTransactionId: z.string().uuid().optional().nullable(),
  glTransactionId: z.string().uuid().optional().nullable(),
  category: z.enum([
    'TIMING_DIFFERENCE',
    'BANK_CHARGE',
    'BANK_INTEREST',
    'UNKNOWN_DEPOSIT',
    'UNKNOWN_PAYMENT',
    'REVERSAL',
    'DUPLICATE',
    'MISSING_GL',
    'MISSING_BANK_TRANSACTION',
    'OTHER',
  ]),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  assignedUserId: z.string().uuid().optional().nullable(),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  relevantDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Valid date required'),
});

export const ResolveExceptionSchema = z.object({
  resolution: z.string().min(5, 'Resolution note is required'),
  status: z.enum(['RESOLVED', 'WAIVED', 'ESCALATED']).default('RESOLVED'),
});

export const SubmitApprovalSchema = z.object({
  stage: z.enum(['PREPARED', 'REVIEWED', 'APPROVED', 'CLOSED']),
  action: z.enum(['SUBMIT_PREPARATION', 'SUBMIT_REVIEW', 'APPROVE', 'REJECT', 'CLOSE', 'REOPEN']),
  comments: z.string().optional(),
});

export const CreateAgingBucketSchema = z.object({
  name: z.string().min(2),
  minDays: z.number().int().min(0),
  maxDays: z.number().int().min(1).optional().nullable(),
  displayOrder: z.number().int().min(1),
});

export const MonetaryValueSchema = z.union([
  z.number().refine((n) => !isNaN(n) && isFinite(n), 'Invalid monetary number'),
  z.string().regex(/^-?\d+(\.\d+)?$/, 'Invalid decimal string format'),
]);

export const CreateBankTransactionSchema = z.object({
  bankAccountId: z.string().uuid('Valid bank account ID required'),
  statementId: z.string().uuid().optional().nullable(),
  statementPageId: z.string().uuid().optional().nullable(),
  transactionDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Valid transaction date required'),
  valueDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Valid value date required').optional().nullable(),
  description: z.string().min(1, 'Description is required'),
  narration: z.string().optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
  chequeNumber: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  transactionType: z.enum(['DEBIT', 'CREDIT', 'TRANSFER', 'FEE', 'INTEREST', 'REVERSAL']).default('DEBIT'),
  currency: z.string().length(3, 'Currency must be a 3-letter ISO code').default('USD'),
  debit: MonetaryValueSchema.default(0),
  credit: MonetaryValueSchema.default(0),
  signedAmount: MonetaryValueSchema.optional(),
  balance: MonetaryValueSchema.optional().nullable(),
  rawSourceData: z.record(z.string(), z.unknown()).optional(),
  preventDuplicates: z.boolean().optional().default(false),
});

export const CreateGlTransactionSchema = z.object({
  bankAccountId: z.string().uuid().optional().nullable(),
  transactionDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Valid transaction date required'),
  valueDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Valid value date required').optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
  chequeNumber: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  transactionType: z.enum(['DEBIT', 'CREDIT', 'JOURNAL', 'ADJUSTMENT']).default('JOURNAL'),
  currency: z.string().length(3, 'Currency must be a 3-letter ISO code').default('USD'),
  debit: MonetaryValueSchema.default(0),
  credit: MonetaryValueSchema.default(0),
  amount: MonetaryValueSchema.optional(),
  narration: z.string().min(1, 'Narration is required'),
  customerSupplier: z.string().optional().nullable(),
  journalNumber: z.string().optional().nullable(),
  sourceSystem: z.string().default('GENERAL_LEDGER'),
  rawSourceData: z.record(z.string(), z.unknown()).optional(),
  preventDuplicates: z.boolean().optional().default(false),
});

