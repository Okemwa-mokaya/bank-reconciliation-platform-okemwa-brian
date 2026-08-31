import {
  Bank,
  BankAccount,
  BankStatement,
  BankTransaction,
  GLTransaction,
  ReconciliationPeriod,
  ReconciliationMatch,
  MatchingCriterion,
  MatchingControlConfig,
  MatchingRule,
  ToleranceConfig,
  ExceptionRecord,
  AgingBucketAnalysis,
  AuditEvent,
  DashboardSummaryResponse,
  UserContext,
} from '../types';

let currentRole = 'ADMIN';
let currentOrgSlug = 'acme-treasury';

export function setCurrentRole(role: string) {
  currentRole = role;
}

export function getCurrentRole(): string {
  return currentRole;
}

export function setCurrentOrgSlug(slug: string) {
  currentOrgSlug = slug;
}

export function getCurrentOrgSlug(): string {
  return currentOrgSlug;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    'x-organization-slug': currentOrgSlug,
    'x-user-role': currentRole,
    ...options.headers,
  };

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(errData.error || `Request failed with status ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Auth & Context
  getCurrentUser: () => request<UserContext>('/api/auth/me'),
  getOrganizations: () => request<{ organizations: any[] }>('/api/auth/organizations'),

  // Dashboard
  getDashboardSummary: () => request<DashboardSummaryResponse>('/api/dashboard/summary'),

  // Bank Structure
  getBanks: () => request<{ banks: Bank[] }>('/api/bank-structure/banks'),
  getBankAccounts: () => request<{ accounts: BankAccount[] }>('/api/bank-structure/bank-accounts'),
  createBank: (data: { name: string; country: string; swiftBic?: string; routingNumber?: string }) =>
    request<{ bank: Bank }>('/api/bank-structure/banks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createBankAccount: (data: {
    bankId: string;
    accountName: string;
    accountNumber: string;
    currency: string;
    accountType: string;
    openingBalance: number;
    glAccountCode?: string;
  }) =>
    request<{ account: BankAccount }>('/api/bank-structure/bank-accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Statements
  getStatements: () => request<{ statements: BankStatement[] }>('/api/statements'),
  getStatementDetails: (id: string) => request<{ statement: BankStatement }>(`/api/statements/${id}`),

  // Transactions
  getBankTransactions: (params?: { bankAccountId?: string; status?: string }) => {
    const q = new URLSearchParams(params as any).toString();
    return request<{ transactions: BankTransaction[] }>(`/api/transactions/bank${q ? `?${q}` : ''}`);
  },
  getGLTransactions: (params?: { bankAccountId?: string; status?: string }) => {
    const q = new URLSearchParams(params as any).toString();
    return request<{ transactions: GLTransaction[] }>(`/api/transactions/gl${q ? `?${q}` : ''}`);
  },

  // Reconciliations
  getReconciliationPeriods: (params?: { bankAccountId?: string }) => {
    const q = new URLSearchParams(params as any).toString();
    return request<{ periods: ReconciliationPeriod[] }>(`/api/reconciliations/periods${q ? `?${q}` : ''}`);
  },
  getPeriodMatches: (periodId: string) =>
    request<{ matches: ReconciliationMatch[] }>(`/api/reconciliations/periods/${periodId}/matches`),

  // Matching Controls & Rules
  getMatchingCriteria: () =>
    request<{ criteria: MatchingCriterion[]; summary: { total: number; strongCount: number; additionalCount: number } }>(
      '/api/matching/criteria'
    ),
  getMatchingControls: () => request<{ controls: MatchingControlConfig }>('/api/matching/controls'),
  updateMatchingControls: (data: Partial<MatchingControlConfig>) =>
    request<{ controls: MatchingControlConfig }>('/api/matching/controls', {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  getMatchingRules: () => request<{ rules: MatchingRule[] }>('/api/matching/rules'),
  getTolerances: () => request<{ tolerances: ToleranceConfig[] }>('/api/matching/tolerances'),

  // Exceptions & Aging
  getExceptions: (params?: { status?: string; category?: string; priority?: string }) => {
    const q = new URLSearchParams(params as any).toString();
    return request<{ exceptions: ExceptionRecord[] }>(`/api/exceptions${q ? `?${q}` : ''}`);
  },
  resolveException: (id: string, resolution: string) =>
    request<{ exception: ExceptionRecord }>(`/api/exceptions/${id}/resolve`, {
      method: 'PATCH',
      body: JSON.stringify({ resolution, status: 'RESOLVED' }),
    }),
  getAgingAnalysis: (bankAccountId?: string) => {
    const q = bankAccountId ? `?bankAccountId=${bankAccountId}` : '';
    return request<{
      buckets: AgingBucketAnalysis[];
      summary: {
        totalUnmatchedBankTx: number;
        totalUnmatchedGLTx: number;
        totalOutstandingBankValue: number;
        totalOutstandingGLValue: number;
      };
    }>(`/api/aging/analysis${q}`);
  },

  // Audit Log
  getAuditLogs: (params?: { limit?: number; offset?: number; entityType?: string }) => {
    const q = new URLSearchParams(params as any).toString();
    return request<{ total: number; events: AuditEvent[] }>(`/api/audit-trail${q ? `?${q}` : ''}`);
  },

  // System
  getSystemHealth: () => request<any>('/api/system/health'),
  getSchemaInfo: () => request<any>('/api/system/schema-info'),
  reseedDatabase: () => request<{ success: boolean; message: string }>('/api/system/seed', { method: 'POST' }),
};
