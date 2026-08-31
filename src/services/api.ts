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
} from '../types';

export interface AuthSession {
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
}

export interface DemoAccount {
  email: string;
  fullName: string;
  role: string;
  orgName: string;
  orgSlug: string;
  description: string;
}

const STORAGE_TOKEN_KEY = 'verifin_auth_token';
const STORAGE_EMAIL_KEY = 'verifin_auth_email';

let currentSession: AuthSession | null = null;
let sessionListeners: Array<(session: AuthSession | null) => void> = [];

export function getAuthToken(): string | null {
  return currentSession?.token || localStorage.getItem(STORAGE_TOKEN_KEY);
}

export function getCurrentSession(): AuthSession | null {
  return currentSession;
}

export function subscribeToSession(callback: (session: AuthSession | null) => void) {
  sessionListeners.push(callback);
  return () => {
    sessionListeners = sessionListeners.filter((l) => l !== callback);
  };
}

function notifySessionListeners() {
  for (const listener of sessionListeners) {
    listener(currentSession);
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> || {}),
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
  // Authentication & Session
  async getDemoAccounts(): Promise<{ accounts: DemoAccount[] }> {
    return request<{ accounts: DemoAccount[] }>('/api/auth/demo-accounts');
  },

  async login(email: string): Promise<AuthSession> {
    const session = await request<AuthSession>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    currentSession = session;
    localStorage.setItem(STORAGE_TOKEN_KEY, session.token);
    localStorage.setItem(STORAGE_EMAIL_KEY, email);
    notifySessionListeners();
    return session;
  },

  async logout(): Promise<void> {
    try {
      await request('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network failures during logout
    }
    currentSession = null;
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_EMAIL_KEY);
    notifySessionListeners();
  },

  async restoreSession(): Promise<AuthSession | null> {
    const storedEmail = localStorage.getItem(STORAGE_EMAIL_KEY) || 'admin@acmetreasury.com';
    try {
      return await api.login(storedEmail);
    } catch (err) {
      console.warn('Could not restore previous session, falling back to default admin', err);
      try {
        return await api.login('admin@acmetreasury.com');
      } catch (adminErr) {
        console.error('Failed to log in with default account', adminErr);
        return null;
      }
    }
  },

  async getCurrentUser() {
    return request<{ user: AuthSession['user']; organization: AuthSession['organization'] }>('/api/auth/me');
  },

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
