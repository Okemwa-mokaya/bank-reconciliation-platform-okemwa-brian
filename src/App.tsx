import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { BankStructureView } from './components/BankStructureView';
import { StatementsView } from './components/StatementsView';
import { TransactionsView } from './components/TransactionsView';
import { ReconciliationsView } from './components/ReconciliationsView';
import { MatchingControlsView } from './components/MatchingControlsView';
import { ExceptionsAgingView } from './components/ExceptionsAgingView';
import { AuditLogView } from './components/AuditLogView';
import { SystemHealthModal } from './components/SystemHealthModal';

import { api } from './services/api';
import {
  Bank,
  BankAccount,
  BankStatement,
  BankTransaction,
  GLTransaction,
  ReconciliationPeriod,
  MatchingCriterion,
  MatchingControlConfig,
  MatchingRule,
  ToleranceConfig,
  ExceptionRecord,
  AgingBucketAnalysis,
  AuditEvent,
  DashboardSummaryResponse,
} from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [systemHealthy, setSystemHealthy] = useState<boolean>(true);
  const [isSystemModalOpen, setIsSystemModalOpen] = useState<boolean>(false);

  // Core Data States
  const [dashboardData, setDashboardData] = useState<DashboardSummaryResponse | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [glTransactions, setGlTransactions] = useState<GLTransaction[]>([]);
  const [periods, setPeriods] = useState<ReconciliationPeriod[]>([]);
  const [criteria, setCriteria] = useState<MatchingCriterion[]>([]);
  const [controls, setControls] = useState<MatchingControlConfig | null>(null);
  const [rules, setRules] = useState<MatchingRule[]>([]);
  const [tolerances, setTolerances] = useState<ToleranceConfig[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionRecord[]>([]);
  const [agingBuckets, setAgingBuckets] = useState<AgingBucketAnalysis[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [totalAuditEvents, setTotalAuditEvents] = useState<number>(0);

  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Dashboard & Banks
      const [dashRes, banksRes, accRes] = await Promise.all([
        api.getDashboardSummary(),
        api.getBanks(),
        api.getBankAccounts(),
      ]);
      setDashboardData(dashRes);
      setBanks(banksRes.banks);
      setAccounts(accRes.accounts);
      setSystemHealthy(true);

      // 2. Statements & Transactions
      const [stmtRes, bTxRes, gTxRes, perRes] = await Promise.all([
        api.getStatements(),
        api.getBankTransactions(),
        api.getGLTransactions(),
        api.getReconciliationPeriods(),
      ]);
      setStatements(stmtRes.statements);
      setBankTransactions(bTxRes.transactions);
      setGlTransactions(gTxRes.transactions);
      setPeriods(perRes.periods);

      // 3. Matching & Controls
      const [critRes, ctrlRes, rulesRes, tolRes] = await Promise.all([
        api.getMatchingCriteria(),
        api.getMatchingControls(),
        api.getMatchingRules(),
        api.getTolerances(),
      ]);
      setCriteria(critRes.criteria);
      setControls(ctrlRes.controls);
      setRules(rulesRes.rules);
      setTolerances(tolRes.tolerances);

      // 4. Exceptions, Aging & Audit
      const [excRes, agRes, audRes] = await Promise.all([
        api.getExceptions(),
        api.getAgingAnalysis(),
        api.getAuditLogs({ limit: 50 }),
      ]);
      setExceptions(excRes.exceptions);
      setAgingBuckets(agRes.buckets);
      setAuditEvents(audRes.events);
      setTotalAuditEvents(audRes.total);
    } catch (err) {
      console.error('Failed to load application state:', err);
      setSystemHealthy(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  return (
    <div className="min-h-screen bg-stone-100/70 text-stone-900 font-sans antialiased flex flex-col">
      {/* Header with Organization & Role controls */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onRefresh={loadAllData}
        onOpenSystemInfo={() => setIsSystemModalOpen(true)}
        isLoading={isLoading}
        systemHealthy={systemHealthy}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'dashboard' && (
          <DashboardView
            data={dashboardData}
            isLoading={isLoading}
            onNavigate={(tab) => setActiveTab(tab)}
          />
        )}

        {activeTab === 'banks' && (
          <BankStructureView
            banks={banks}
            accounts={accounts}
            onRefresh={loadAllData}
            orgCurrency={dashboardData?.organization?.baseCurrency || 'USD'}
          />
        )}

        {activeTab === 'statements' && (
          <StatementsView statements={statements} onRefresh={loadAllData} />
        )}

        {activeTab === 'transactions' && (
          <TransactionsView
            bankTransactions={bankTransactions}
            glTransactions={glTransactions}
            onRefresh={loadAllData}
          />
        )}

        {activeTab === 'reconciliations' && (
          <ReconciliationsView periods={periods} onRefresh={loadAllData} />
        )}

        {activeTab === 'matching-controls' && (
          <MatchingControlsView
            criteria={criteria}
            controls={controls}
            rules={rules}
            tolerances={tolerances}
            onRefresh={loadAllData}
          />
        )}

        {activeTab === 'exceptions-aging' && (
          <ExceptionsAgingView
            exceptions={exceptions}
            agingBuckets={agingBuckets}
            onRefresh={loadAllData}
          />
        )}

        {activeTab === 'audit-log' && (
          <AuditLogView events={auditEvents} total={totalAuditEvents} onRefresh={loadAllData} />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200 bg-white py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 gap-2">
          <div>
            <span className="font-semibold text-stone-700">VERIFIN Platform</span> • Phase 1 Foundation & Architecture
          </div>
          <div className="flex items-center space-x-4">
            <span>Multi-Tenant Architecture</span>
            <span>•</span>
            <span>4-Role Granular RBAC</span>
            <span>•</span>
            <span>Immutable Audit Trail</span>
          </div>
        </div>
      </footer>

      {/* System Health / Introspection Modal */}
      <SystemHealthModal
        isOpen={isSystemModalOpen}
        onClose={() => setIsSystemModalOpen(false)}
        onReseedCompleted={loadAllData}
      />
    </div>
  );
}
