import React from 'react';
import {
  Building2,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  TrendingUp,
  Percent,
  Layers,
  FileCheck2,
  Calendar,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { DashboardSummaryResponse } from '../types';

interface DashboardViewProps {
  data: DashboardSummaryResponse | null;
  isLoading: boolean;
  onNavigate: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ data, isLoading, onNavigate }) => {
  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 border-2 border-stone-300 border-t-stone-800 rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-stone-500">Querying institutional database records...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white border border-stone-200 rounded-xl p-12 text-center max-w-xl mx-auto my-12">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <h3 className="text-base font-bold text-stone-800">No Financial Records Found</h3>
        <p className="text-sm text-stone-500 mt-1">
          The selected organization currently has no database entities registered.
        </p>
      </div>
    );
  }

  const { metrics, organization, recentAuditEvents, recentReconciliationPeriods } = data;

  const formatCurrency = (val: number, curr = organization?.baseCurrency || 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 2,
    }).format(val);
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'N/A';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      {/* Executive Header Banner */}
      <div className="bg-stone-900 text-stone-100 rounded-xl p-6 shadow-xs border border-stone-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-stone-800 text-amber-400 border border-stone-700 tracking-wider">
                TENANT RECORD
              </span>
              <span className="text-xs text-stone-400">ID: {organization.id}</span>
            </div>
            <h1 className="text-2xl font-serif font-bold text-white mt-1">
              {organization.name}
            </h1>
            <p className="text-xs text-stone-400 mt-0.5">
              Operating Currency: <span className="font-semibold text-stone-200">{organization.baseCurrency}</span> • Status:{' '}
              <span className="text-emerald-400 font-medium">{organization.status}</span>
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <div className="bg-stone-800/80 rounded-lg p-3 border border-stone-700/80 text-right">
              <p className="text-xs text-stone-400">Reconciliation Completion Rate</p>
              <p className="text-xl font-bold font-mono text-emerald-400">
                {metrics.reconciliationCompletionRate}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Bank Accounts */}
        <div
          onClick={() => onNavigate('banks')}
          className="bg-white border border-stone-200 rounded-xl p-5 hover:border-stone-400 transition-colors cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Bank Accounts</span>
            <Building2 className="w-4 h-4 text-stone-400" />
          </div>
          <p className="text-2xl font-bold text-stone-900 mt-2 font-mono">{metrics.bankAccountsCount}</p>
          <div className="flex items-center justify-between mt-3 text-xs text-stone-500">
            <span>Configured accounts</span>
            <span className="text-stone-700 font-medium flex items-center">
              View <ArrowRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>
        </div>

        {/* 2. Statements Processed */}
        <div
          onClick={() => onNavigate('statements')}
          className="bg-white border border-stone-200 rounded-xl p-5 hover:border-stone-400 transition-colors cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Statements</span>
            <FileSpreadsheet className="w-4 h-4 text-stone-400" />
          </div>
          <p className="text-2xl font-bold text-stone-900 mt-2 font-mono">{metrics.statementsCount}</p>
          <div className="flex items-center justify-between mt-3 text-xs text-stone-500">
            <span>OCR & Validation status</span>
            <span className="text-stone-700 font-medium flex items-center">
              View <ArrowRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>
        </div>

        {/* 3. Ingested Transactions */}
        <div
          onClick={() => onNavigate('transactions')}
          className="bg-white border border-stone-200 rounded-xl p-5 hover:border-stone-400 transition-colors cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Processed Tx</span>
            <Layers className="w-4 h-4 text-stone-400" />
          </div>
          <p className="text-2xl font-bold text-stone-900 mt-2 font-mono">
            {metrics.totalProcessedTransactions}
          </p>
          <div className="flex items-center justify-between mt-3 text-xs text-stone-500">
            <span>
              Bank: <span className="font-semibold text-stone-700">{metrics.bankTransactionsTotal}</span> | GL:{' '}
              <span className="font-semibold text-stone-700">{metrics.glTransactionsTotal}</span>
            </span>
          </div>
        </div>

        {/* 4. Open Exceptions */}
        <div
          onClick={() => onNavigate('exceptions-aging')}
          className="bg-white border border-stone-200 rounded-xl p-5 hover:border-stone-400 transition-colors cursor-pointer shadow-2xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Open Exceptions</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-700 mt-2 font-mono">{metrics.exceptionsCount}</p>
          <div className="flex items-center justify-between mt-3 text-xs text-stone-500">
            <span>Total logged: {metrics.exceptionsTotal}</span>
            <span className="text-stone-700 font-medium flex items-center">
              Inspect <ArrowRight className="w-3 h-3 ml-0.5" />
            </span>
          </div>
        </div>
      </div>

      {/* Secondary Financial Summary Metrics: Matched, Unmatched, Outstanding Values & Oldest */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Matched vs Unmatched Volume */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs">
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Matching Progress</h3>
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-medium text-stone-700">Matched Tx</span>
              </div>
              <span className="font-mono font-bold text-stone-900">
                {metrics.matchedCount ?? metrics.automaticallyMatchedCount}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Clock className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-medium text-stone-700">Unmatched Tx</span>
              </div>
              <span className="font-mono font-bold text-stone-900">{metrics.unmatchedCount}</span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden mt-2">
              <div
                className="bg-emerald-600 h-2 rounded-full transition-all"
                style={{ width: `${Math.min(100, Math.max(0, metrics.reconciliationCompletionRate))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Total Outstanding Unmatched Value */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs">
          <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Outstanding Unmatched Value</h3>
          <p className="text-xl font-bold font-mono text-stone-900 mt-2">
            {formatCurrency(metrics.outstandingValue.combined)}
          </p>
          <div className="mt-4 space-y-1.5 text-xs text-stone-500">
            <div className="flex justify-between">
              <span>Unmatched Bank Items:</span>
              <span className="font-mono font-semibold text-stone-800">
                {formatCurrency(metrics.outstandingValue.bankTotal)}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Unmatched GL Items:</span>
              <span className="font-mono font-semibold text-stone-800">
                {formatCurrency(metrics.outstandingValue.glTotal)}
              </span>
            </div>
          </div>
        </div>

        {/* Oldest Outstanding Item */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Oldest Outstanding Item</h3>
            <Calendar className="w-4 h-4 text-stone-400" />
          </div>
          {metrics.oldestOutstandingTransaction.date ? (
            <div className="mt-2">
              <p className="text-lg font-bold font-mono text-stone-900">
                {formatDate(metrics.oldestOutstandingTransaction.date)}
              </p>
              <p className="text-xs text-stone-600 mt-1 line-clamp-1">
                {metrics.oldestOutstandingTransaction.details?.description ||
                  metrics.oldestOutstandingTransaction.details?.narration ||
                  'Unmatched item'}
              </p>
              <p className="text-xs text-amber-700 font-semibold font-mono mt-1">
                Amount:{' '}
                {formatCurrency(
                  Math.abs(
                    metrics.oldestOutstandingTransaction.details?.signedAmount ??
                      metrics.oldestOutstandingTransaction.details?.amount ??
                      0
                  )
                )}
              </p>
            </div>
          ) : (
            <p className="text-xs text-stone-500 mt-4 italic">No unmatched outstanding items currently in database.</p>
          )}
        </div>
      </div>

      {/* Active Reconciliation Periods & Recent Audit Events */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Reconciliation Periods */}
        <div className="lg:col-span-2 bg-white border border-stone-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-stone-900">Reconciliation Periods</h2>
              <p className="text-xs text-stone-500">Active monthly and multi-period workflows</p>
            </div>
            <button
              onClick={() => onNavigate('reconciliations')}
              className="text-xs font-semibold text-stone-700 hover:text-stone-900 flex items-center"
            >
              All Periods <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </button>
          </div>

          {recentReconciliationPeriods.length === 0 ? (
            <div className="text-center py-8 text-stone-500 text-xs">
              No reconciliation periods created for this organization.
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {recentReconciliationPeriods.map((period) => (
                <div key={period.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-stone-800">
                      {period.bankAccount.bank.name} - {period.bankAccount.accountName}
                    </div>
                    <div className="text-stone-500 mt-0.5">
                      Period: {formatDate(period.periodStart)} – {formatDate(period.periodEnd)}
                    </div>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        period.status === 'APPROVED'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : period.status === 'EXCEPTIONS'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}
                    >
                      {period.status}
                    </span>
                    <span className="font-mono text-stone-600">
                      Matches: <span className="font-bold text-stone-800">{period._count?.matches || 0}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Audit Trail Snippet */}
        <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-stone-900">Audit Stream</h2>
              <p className="text-xs text-stone-500">Immutable ledger log</p>
            </div>
            <button
              onClick={() => onNavigate('audit-log')}
              className="text-xs font-semibold text-stone-700 hover:text-stone-900 flex items-center"
            >
              View Log <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </button>
          </div>

          <div className="space-y-3">
            {recentAuditEvents.map((event) => (
              <div key={event.id} className="text-xs border-b border-stone-100 pb-2.5 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-stone-800 truncate">{event.action}</span>
                  <span className="text-[10px] text-stone-400 font-mono">
                    {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-stone-500 text-[11px] mt-0.5 line-clamp-1">{event.reason || event.entityType}</p>
                <div className="text-[10px] text-stone-400 mt-1">
                  Actor: <span className="font-medium text-stone-600">{event.actorEmail || 'System'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
