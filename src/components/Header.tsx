import React, { useState, useEffect } from 'react';
import {
  Building2,
  ShieldCheck,
  Database,
  RefreshCw,
  SlidersHorizontal,
  UserCheck,
} from 'lucide-react';
import { api, AuthSession, subscribeToSession } from '../services/api';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onRefresh: () => void;
  onOpenSystemInfo: () => void;
  isLoading: boolean;
  systemHealthy: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onRefresh,
  onOpenSystemInfo,
  isLoading,
  systemHealthy,
}) => {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<any[]>([]);

  useEffect(() => {
    const unsub = subscribeToSession((newSession) => {
      setSession(newSession);
    });

    api.getDemoAccounts().then((res) => {
      if (res && res.accounts) {
        setDemoAccounts(res.accounts);
      }
    }).catch(console.error);

    return unsub;
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Executive Dashboard' },
    { id: 'banks', label: 'Banks & Accounts' },
    { id: 'statements', label: 'Statements & OCR' },
    { id: 'transactions', label: 'Ingested Transactions' },
    { id: 'reconciliations', label: 'Reconciliations' },
    { id: 'matching-controls', label: 'Matching Controls' },
    { id: 'exceptions-aging', label: 'Exceptions & Aging' },
    { id: 'audit-log', label: 'Audit Trail' },
  ];

  const handleAccountChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedEmail = e.target.value;
    try {
      await api.login(selectedEmail);
      onRefresh();
    } catch (err) {
      console.error('Failed to authenticate as selected user:', err);
    }
  };

  const currentEmail = session?.user?.email || 'admin@acmetreasury.com';
  const currentOrgName = session?.organization?.name || 'Acme Global Treasury Corp';
  const currentOrgCurrency = session?.organization?.baseCurrency || 'USD';
  const currentRole = session?.user?.roles?.[0] || 'ADMIN';

  return (
    <header className="border-b border-stone-200 bg-white sticky top-0 z-30 shadow-xs">
      {/* Top tier brand and institutional controls */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Entity Name */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-lg bg-stone-900 flex items-center justify-center text-white shadow-xs">
              <ShieldCheck className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-serif font-bold text-lg text-stone-900 tracking-tight">
                  VERIFIN
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                  POSTGRESQL HARDENED
                </span>
              </div>
              <p className="text-xs text-stone-500 font-medium">
                Bank Reconciliation & Financial Verification Platform
              </p>
            </div>
          </div>

          {/* Institutional Context & Server-Verified Authentication */}
          <div className="flex items-center space-x-3">
            {/* Authenticated Tenant Entity Badge */}
            <div className="flex items-center space-x-2 text-xs bg-stone-50 border border-stone-200 rounded-md px-2.5 py-1.5">
              <Building2 className="w-4 h-4 text-stone-500" />
              <span className="text-stone-500 font-medium hidden sm:inline">Tenant:</span>
              <span className="font-semibold text-stone-800">
                {currentOrgName} ({currentOrgCurrency})
              </span>
            </div>

            {/* Authenticated User & Role Selector (Server Bearer Token Auth) */}
            <div className="flex items-center space-x-2 text-xs bg-amber-50/60 border border-amber-200/80 rounded-md px-2.5 py-1.5">
              <UserCheck className="w-4 h-4 text-amber-700" />
              <span className="text-amber-800 font-medium hidden sm:inline">User Account:</span>
              <select
                value={currentEmail}
                onChange={handleAccountChange}
                className="bg-transparent font-semibold text-amber-900 focus:outline-none cursor-pointer"
              >
                {demoAccounts.length > 0 ? (
                  demoAccounts.map((acc) => (
                    <option key={acc.email} value={acc.email}>
                      {acc.fullName} ({acc.role} - {acc.orgName})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="admin@acmetreasury.com">Arthur Vance (ADMIN - Acme)</option>
                    <option value="accountant@acmetreasury.com">Beatrice Lin (ACCOUNTANT - Acme)</option>
                    <option value="reviewer@acmetreasury.com">Charles Montgomery (REVIEWER - Acme)</option>
                    <option value="auditor@acmetreasury.com">Diana Prince (AUDITOR - Acme)</option>
                    <option value="apex.admin@apexholdings.eu">Elena Rostova (ADMIN - Apex EUR)</option>
                  </>
                )}
              </select>
            </div>

            {/* System / Health Probe */}
            <button
              onClick={onOpenSystemInfo}
              className={`flex items-center space-x-1.5 text-xs px-2.5 py-1.5 rounded-md border font-medium transition-colors ${
                systemHealthy
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
              }`}
              title="Inspect Database Schema & Health"
            >
              <Database className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Schema & DB</span>
              <span
                className={`w-2 h-2 rounded-full ${
                  systemHealthy ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                }`}
              />
            </button>

            {/* Refresh */}
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1.5 text-stone-500 hover:text-stone-900 rounded-md hover:bg-stone-100 transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-stone-800' : ''}`} />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 overflow-x-auto py-1 scrollbar-none">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-2 text-xs font-semibold rounded-t-md whitespace-nowrap transition-colors border-b-2 ${
                  isActive
                    ? 'border-stone-900 text-stone-950 bg-stone-50/80 font-bold'
                    : 'border-transparent text-stone-600 hover:text-stone-900 hover:bg-stone-50'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
