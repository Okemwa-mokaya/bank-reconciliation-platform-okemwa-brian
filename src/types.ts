export interface Organization {
  id: string;
  name: string;
  slug: string;
  taxId?: string | null;
  baseCurrency: string;
  status: string;
  createdAt: string;
}

export interface UserContext {
  id: string;
  email: string;
  fullName: string;
  organizationId: string;
  roles: string[];
  permissions: string[];
}

export interface Bank {
  id: string;
  name: string;
  code?: string | null;
  country: string;
  swiftBic?: string | null;
  routingNumber?: string | null;
  accounts?: BankAccount[];
}

export interface BankAccount {
  id: string;
  organizationId: string;
  bankId: string;
  accountName: string;
  accountNumber: string;
  currency: string;
  accountType: string;
  openingBalance: number;
  currentBalance?: number | null;
  glAccountCode?: string | null;
  isActive: boolean;
  bank: Bank;
  _count?: {
    statements: number;
    bankTransactions: number;
    glTransactions: number;
  };
}

export interface StatementPage {
  id: string;
  pageNumber: number;
  extractionStatus: string;
  ocrStatus: string;
  extractionConfidence?: number | null;
}

export interface BankStatement {
  id: string;
  bankAccountId: string;
  statementPeriodStart: string;
  statementPeriodEnd: string;
  originalFilename: string;
  fileType: string;
  processingStatus: string;
  extractionStatus: string;
  validationStatus: string;
  duplicateStatus: string;
  openingBalance: number;
  closingBalance: number;
  totalCredits: number;
  totalDebits: number;
  transactionCount: number;
  createdAt: string;
  bankAccount: {
    id: string;
    accountName: string;
    accountNumber: string;
    bank: { name: string };
  };
  pages: StatementPage[];
}

export interface BankTransaction {
  id: string;
  organizationId: string;
  bankAccountId: string;
  transactionDate: string;
  valueDate?: string | null;
  description: string;
  referenceNumber?: string | null;
  chequeNumber?: string | null;
  accountNumber?: string | null;
  transactionType: string;
  currency: string;
  debit: number;
  credit: number;
  signedAmount: number;
  balance?: number | null;
  originalImportedData: string;
  status: string;
  bankAccount?: { accountName: string; accountNumber: string };
}

export interface GLTransaction {
  id: string;
  organizationId: string;
  bankAccountId?: string | null;
  transactionDate: string;
  referenceNumber?: string | null;
  transactionType: string;
  currency: string;
  debit: number;
  credit: number;
  amount: number;
  narration: string;
  customerSupplier?: string | null;
  journalNumber?: string | null;
  sourceSystem: string;
  originalData: string;
  status: string;
  bankAccount?: { accountName: string; accountNumber: string } | null;
}

export interface ReconciliationPeriod {
  id: string;
  bankAccountId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  isLocked: boolean;
  preparedBy?: { fullName: string; email: string } | null;
  reviewedBy?: { fullName: string; email: string } | null;
  approvedBy?: { fullName: string; email: string } | null;
  bankAccount: {
    id: string;
    accountName: string;
    accountNumber: string;
    currency: string;
    bank: { name: string };
  };
  _count?: {
    matches: number;
    exceptions: number;
  };
}

export interface ReconciliationMatch {
  id: string;
  matchType: string;
  matchStatus: string;
  confidenceScore: number;
  criteriaMatched: string;
  tolerancesApplied?: string | null;
  explanation?: string | null;
  createdAt: string;
  matchingRule?: { name: string } | null;
  bankTransactions: {
    id: string;
    allocatedAmount: number;
    bankTransaction: BankTransaction;
  }[];
  glTransactions: {
    id: string;
    allocatedAmount: number;
    glTransaction: GLTransaction;
  }[];
}

export interface MatchingCriterion {
  id: string;
  code: string;
  name: string;
  description: string;
  isStrong: boolean;
  fieldSourceBank: string;
  fieldSourceGL: string;
}

export interface MatchingControlConfig {
  id: string;
  minTotalCriteria: number;
  minStrongCriteria: number;
  allowFuzzyNarration: boolean;
  requireExactCurrency: boolean;
}

export interface MatchingRule {
  id: string;
  name: string;
  description?: string | null;
  priority: number;
  isActive: boolean;
  minTotalCriteria: number;
  minStrongCriteria: number;
  requiredCriteria: string[];
  optionalCriteria: string[];
  bankAccount?: { id: string; accountName: string; accountNumber: string } | null;
  _count?: { matches: number };
}

export interface ToleranceConfig {
  id: string;
  level: string;
  amountToleranceType: string;
  amountToleranceValue: number;
  amountToleranceMax?: number | null;
  dateToleranceDays: number;
  isDateToleranceAllowed: boolean;
  currencyRateTolerancePercent: number;
  bankAccount?: { id: string; accountName: string; accountNumber: string } | null;
  matchingRule?: { id: string; name: string } | null;
}

export interface ExceptionRecord {
  id: string;
  category: string;
  status: string;
  priority: string;
  riskLevel: string;
  description: string;
  resolution?: string | null;
  relevantDate: string;
  resolvedDate?: string | null;
  assignedUser?: { fullName: string; email: string } | null;
  bankTransaction?: {
    description: string;
    signedAmount: number;
    referenceNumber?: string | null;
  } | null;
  glTransaction?: {
    narration: string;
    amount: number;
    journalNumber?: string | null;
  } | null;
}

export interface AgingBucketAnalysis {
  bucketId: string;
  name: string;
  minDays: number;
  maxDays: number | null;
  displayOrder: number;
  bankTransactions: {
    count: number;
    totalValue: number;
  };
  glTransactions: {
    count: number;
    totalValue: number;
  };
  combinedOutstandingValue: number;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actorId?: string | null;
  actorEmail?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: any;
  newValue?: any;
  reason?: string | null;
  metadata?: any;
  actor?: { fullName: string; email: string } | null;
}

export interface DashboardMetrics {
  bankAccountsCount: number;
  statementsCount: number;
  totalProcessedTransactions: number;
  bankTransactionsTotal: number;
  glTransactionsTotal: number;
  matchedCount: number;
  manuallyMatchedCount?: number;
  automaticallyMatchedCount: number;
  unmatchedCount: number;
  exceptionsCount: number;
  exceptionsTotal: number;
  reconciliationPeriodsCount: number;
  reconciliationPeriodsApproved: number;
  activeMatchingRulesCount: number;
  outstandingValue: {
    bankTotal: number;
    glTotal: number;
    combined: number;
  };
  oldestOutstandingTransaction: {
    date: string | null;
    details: any | null;
  };
  reconciliationCompletionRate: number;
}

export interface DashboardSummaryResponse {
  organization: Organization;
  metrics: DashboardMetrics;
  recentAuditEvents: AuditEvent[];
  recentReconciliationPeriods: ReconciliationPeriod[];
}
