import React, { useState, useEffect } from 'react';
import { BankAccount, ReconciliationPeriod, ReconciliationMatch, BankTransaction, GLTransaction } from '../types';
import { api } from '../services/api';
import { Calendar, CheckCircle2, Lock, Eye, GitMerge, FileCheck, Layers, AlertTriangle, Play, Sparkles, Plus, X } from 'lucide-react';

interface ReconciliationsViewProps {
  periods: ReconciliationPeriod[];
  onRefresh: () => void;
}

export const ReconciliationsView: React.FC<ReconciliationsViewProps> = ({ periods, onRefresh }) => {
  const [selectedPeriod, setSelectedPeriod] = useState<ReconciliationPeriod | null>(null);
  const [matches, setMatches] = useState<ReconciliationMatch[]>([]);
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [glTransactions, setGlTransactions] = useState<GLTransaction[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);
  const [isProposingAuto, setIsProposingAuto] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isCreatingPeriod, setIsCreatingPeriod] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({
    bankAccountId: '',
    periodStart: '',
    periodEnd: '',
  });

  useEffect(() => {
    if (selectedPeriod) {
      loadPeriodMatches(selectedPeriod.id);
    }
  }, [selectedPeriod]);

  const loadPeriodMatches = async (periodId: string) => {
    setIsLoadingMatches(true);
    try {
      const res = await api.getPeriodMatches(periodId);
      setMatches(res.matches);
      setBankTransactions(res.bankTransactions);
      setGlTransactions(res.glTransactions);
    } catch (err) {
      console.error('Failed to load period matches:', err);
    } finally {
      setIsLoadingMatches(false);
    }
  };

  const openCreateForm = async () => {
    setCreateError(null);
    setShowCreateForm(true);
    if (bankAccounts.length === 0) {
      setIsLoadingAccounts(true);
      try {
        const res = await api.getBankAccounts();
        setBankAccounts(res.accounts.filter((account) => account.isActive));
      } catch (err: any) {
        console.error('Failed to load bank accounts:', err);
        setCreateError(err.message || 'Failed to load bank accounts.');
      } finally {
        setIsLoadingAccounts(false);
      }
    }
  };

  const handleCreatePeriod = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError(null);

    if (!createForm.bankAccountId || !createForm.periodStart || !createForm.periodEnd) {
      setCreateError('Bank account, period start date, and period end date are required.');
      return;
    }

    const start = new Date(`${createForm.periodStart}T00:00:00`);
    const end = new Date(`${createForm.periodEnd}T23:59:59`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setCreateError('Please provide valid period dates.');
      return;
    }

    if (start > end) {
      setCreateError('Period start date cannot be after the period end date.');
      return;
    }

    setIsCreatingPeriod(true);
    try {
      const res = await api.createReconciliationPeriod({
        bankAccountId: createForm.bankAccountId,
        periodStart: start.toISOString(),
        periodEnd: end.toISOString(),
      });

      const createdPeriod = res.period;
      setShowCreateForm(false);
      setCreateForm({ bankAccountId: '', periodStart: '', periodEnd: '' });
      setActionMessage('Reconciliation period created successfully.');
      setSelectedPeriod(createdPeriod);
      onRefresh();
    } catch (err: any) {
      console.error('Failed to create reconciliation period:', err);
      setCreateError(err.message || 'Failed to create reconciliation period.');
    } finally {
      setIsCreatingPeriod(false);
    }
  };

  const handleProposeAutoMatches = async (periodId: string) => {
    setIsProposingAuto(true);
    setActionMessage(null);
    try {
      const res = await api.proposeAutoMatches(periodId);
      setActionMessage(res.message || `Auto-matching complete: proposed ${res.count} match(es).`);
      await loadPeriodMatches(periodId);
      onRefresh();
    } catch (err: any) {
      console.error('Failed to run automatic matching:', err);
      setActionMessage(`Auto-matching failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsProposingAuto(false);
    }
  };

  const handleConfirmMatch = async (matchId: string) => {
    try {
      await api.confirmMatch(matchId);
      if (selectedPeriod) {
        await loadPeriodMatches(selectedPeriod.id);
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to confirm match:', err);
    }
  };

  const handleUnmatch = async (matchId: string) => {
    try {
      await api.unmatch(matchId);
      if (selectedPeriod) {
        await loadPeriodMatches(selectedPeriod.id);
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to unmatch:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (val: number, curr = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 2,
    }).format(val);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Reconciliation Periods & Multi-Item Matches</h2>
            <p className="text-xs text-stone-500">
              Reconciliation lifecycle tracking, approval hierarchy, and topological match relationships (1:1, 1:Many, Many:Many)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300">
              Phase 3 Production Complete: Criteria Engine & Automatic Reconciliation Execution Active
            </span>
            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-stone-900 text-white text-xs font-semibold hover:bg-stone-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New Reconciliation Period
            </button>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded-lg flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="w-3.5 h-3.5" />{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-emerald-700 hover:text-emerald-950 font-bold ml-2">×</button>
        </div>
      )}

      {/* Create Period Form */}
      {showCreateForm && (
        <div className="bg-white border border-stone-300 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-stone-900">Create Reconciliation Period</h3>
              <p className="text-xs text-stone-500 mt-0.5">Define the bank account and date range that will be evaluated by the reconciliation engine.</p>
            </div>
            <button type="button" onClick={() => { setShowCreateForm(false); setCreateError(null); }} className="p-1 text-stone-400 hover:text-stone-800">
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreatePeriod} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <label className="block">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1.5">Bank Account</span>
              <select
                value={createForm.bankAccountId}
                onChange={(e) => setCreateForm((current) => ({ ...current, bankAccountId: e.target.value }))}
                disabled={isLoadingAccounts || isCreatingPeriod}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400"
              >
                <option value="">{isLoadingAccounts ? 'Loading accounts...' : 'Select bank account'}</option>
                {bankAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.bank.name} — {account.accountName} ({account.accountNumber})
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1.5">Period Start</span>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 w-3.5 h-3.5 text-stone-400" />
                <input
                  type="date"
                  value={createForm.periodStart}
                  onChange={(e) => setCreateForm((current) => ({ ...current, periodStart: e.target.value }))}
                  disabled={isCreatingPeriod}
                  className="w-full rounded-lg border border-stone-300 bg-white pl-9 pr-3 py-2 text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400"
                />
              </div>
            </label>

            <label className="block">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-stone-500 mb-1.5">Period End</span>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 w-3.5 h-3.5 text-stone-400" />
                <input
                  type="date"
                  value={createForm.periodEnd}
                  min={createForm.periodStart || undefined}
                  onChange={(e) => setCreateForm((current) => ({ ...current, periodEnd: e.target.value }))}
                  disabled={isCreatingPeriod}
                  className="w-full rounded-lg border border-stone-300 bg-white pl-9 pr-3 py-2 text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-stone-400"
                />
              </div>
            </label>

            <button
              type="submit"
              disabled={isCreatingPeriod || isLoadingAccounts || bankAccounts.length === 0}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreatingPeriod ? 'Creating...' : 'Create Period'}
            </button>
          </form>

          {createError && (
            <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {createError}
            </div>
          )}

          {!isLoadingAccounts && bankAccounts.length === 0 && !createError && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              No active bank accounts are available for this organization. Create or activate a bank account before starting a reconciliation period.
            </div>
          )}
        </div>
      )}

      {/* Periods Table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 text-stone-600 border-b border-stone-200 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Bank Account</th>
                <th className="px-4 py-3">Period Range</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Matches Found</th>
                <th className="px-4 py-3">Exceptions</th>
                <th className="px-4 py-3">Preparer / Reviewer</th>
                <th className="px-4 py-3">Lock State</th>
                <th className="px-4 py-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {periods.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-stone-500 italic">
                    No reconciliation periods configured.
                  </td>
                </tr>
              ) : (
                periods.map((p) => (
                  <tr key={p.id} className="hover:bg-stone-50/60 transition-colors">
                    <td className="px-4 py-3 font-medium text-stone-900">
                      <div>{p.bankAccount.bank.name}</div>
                      <div className="text-[11px] text-stone-500 font-mono">{p.bankAccount.accountName}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-stone-700">
                      {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                          p.status === 'APPROVED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : p.status === 'EXCEPTIONS'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-stone-800">{p._count?.matches || 0}</td>
                    <td className="px-4 py-3 font-mono font-bold text-amber-700">{p._count?.exceptions || 0}</td>
                    <td className="px-4 py-3 text-stone-600">
                      <div>Prep: {p.preparedBy?.fullName || 'System'}</div>
                      <div className="text-[10px] text-stone-400">Rev: {p.reviewedBy?.fullName || 'Pending'}</div>
                    </td>
                    <td className="px-4 py-3">
                      {p.isLocked ? (
                        <span className="inline-flex items-center text-rose-700 text-[11px] font-medium">
                          <Lock className="w-3 h-3 mr-1" /> Locked
                        </span>
                      ) : (
                        <span className="text-stone-400 text-[11px]">Open</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedPeriod(p)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold bg-stone-900 text-white hover:bg-stone-800 rounded transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Matches</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Matches Inspection Drawer */}
      {selectedPeriod && (
        <div className="bg-stone-50 border border-stone-300 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                Matches for {selectedPeriod.bankAccount.accountName} (
                {formatDate(selectedPeriod.periodStart)} – {formatDate(selectedPeriod.periodEnd)})
              </h3>
              <p className="text-xs text-stone-500">
                Topological match junction records linking bank transactions to GL journal entries
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {!selectedPeriod.isLocked && selectedPeriod.status !== 'CLOSED' && (
                <button
                  onClick={() => handleProposeAutoMatches(selectedPeriod.id)}
                  disabled={isProposingAuto}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isProposingAuto ? 'Evaluating...' : 'Run Auto-Reconciliation'}</span>
                </button>
              )}
              <button
                onClick={() => {
                  setSelectedPeriod(null);
                  setActionMessage(null);
                }}
                className="text-xs text-stone-500 hover:text-stone-800 font-semibold px-2 py-1"
              >
                Close
              </button>
            </div>
          </div>

          {actionMessage && (
            <div className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2 rounded-lg flex items-center justify-between">
              <span>{actionMessage}</span>
              <button
                onClick={() => setActionMessage(null)}
                className="text-emerald-700 hover:text-emerald-950 font-bold ml-2"
              >
                ×
              </button>
            </div>
          )}

          {isLoadingMatches ? (
            <div className="py-8 text-center text-xs text-stone-500">Loading period transactions and matches...</div>
          ) : (
            <div className="space-y-5">
              <section>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wide">Automatically Reconciled</h4>
                  <span className="text-[10px] font-semibold text-emerald-700">{matches.filter((match) => match.matchStatus === 'CONFIRMED').length} confirmed match(es)</span>
                </div>
                {matches.length === 0 ? (
                  <div className="py-5 text-center text-xs text-stone-500 italic bg-white rounded-lg border border-stone-200">
                    No matches recorded for this period yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {matches.map((match) => {
                const isOverride = match.isManualOverride || match.explanation?.includes('[MANUAL_OVERRIDE]');

                return (
                  <div key={match.id} className="bg-white border border-stone-200 rounded-lg p-4 shadow-2xs text-xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
                      <div className="flex items-center space-x-2">
                        <GitMerge className="w-4 h-4 text-emerald-600" />
                        <span className="font-bold text-stone-900 uppercase">{match.matchType} MATCH</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                            match.matchStatus === 'CONFIRMED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : match.matchStatus === 'PROPOSED'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-stone-50 text-stone-700 border border-stone-200'
                          }`}
                        >
                          {match.matchStatus}
                        </span>
                        {isOverride && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 font-bold inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            MANUAL OVERRIDE
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-3 text-stone-500 text-[11px]">
                        <span>
                          Confidence:{' '}
                          <span className="font-mono font-bold text-stone-800">
                            {Math.round(match.confidenceScore * 100)}%
                          </span>
                        </span>
                        <span>
                          Rule: <span className="font-medium text-stone-700">{match.matchingRule?.name || (isOverride ? 'Manual Override' : 'Manual')}</span>
                        </span>

                        {/* Match Action Buttons */}
                        {match.matchStatus === 'PROPOSED' && !selectedPeriod.isLocked && (
                          <div className="flex items-center space-x-1 pl-2">
                            <button
                              onClick={() => handleConfirmMatch(match.id)}
                              className="px-2 py-0.5 text-[10px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => handleUnmatch(match.id)}
                              className="px-2 py-0.5 text-[10px] font-semibold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded transition-colors"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                        {match.matchStatus === 'CONFIRMED' && !selectedPeriod.isLocked && (
                          <button
                            onClick={() => handleUnmatch(match.id)}
                            className="px-2 py-0.5 text-[10px] font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition-colors border border-rose-200 ml-1"
                          >
                            Unmatch
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Matched Criteria Pills */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-stone-500">Criteria Met:</span>
                      {JSON.parse(match.criteriaMatched || '[]').map((crit: string) => (
                        <span
                          key={crit}
                          className="px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-mono text-[10px] border border-stone-200"
                        >
                          {crit}
                        </span>
                      ))}
                    </div>

                    {match.overrideReason && (
                      <div className="text-[11px] text-amber-900 bg-amber-50/90 p-2 rounded border border-amber-200">
                        <span className="font-semibold">Override Reason:</span> {match.overrideReason}
                      </div>
                    )}

                    {match.explanation && (
                      <p className="text-[11px] text-stone-600 bg-stone-50 p-2 rounded border border-stone-100">
                        {match.explanation}
                      </p>
                    )}

                    {/* Linked Bank & GL Transaction Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                      {/* Bank Side */}
                      <div className="bg-stone-50/70 p-3 rounded-md border border-stone-200/80">
                        <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1.5">
                          Bank Transaction(s) [{match.bankTransactions.length}]
                        </div>
                        {match.bankTransactions.map((btm) => (
                          <div key={btm.id} className="text-xs space-y-0.5">
                            <div className="font-semibold text-stone-900">{btm.bankTransaction.description}</div>
                            <div className="flex justify-between text-stone-500 text-[11px]">
                              <span>Date: {formatDate(btm.bankTransaction.transactionDate)}</span>
                              <span className="font-mono font-bold text-emerald-700">
                                {formatCurrency(btm.allocatedAmount, btm.bankTransaction.currency)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* GL Side */}
                      <div className="bg-stone-50/70 p-3 rounded-md border border-stone-200/80">
                        <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider mb-1.5">
                          General Ledger Item(s) [{match.glTransactions.length}]
                        </div>
                        {match.glTransactions.map((gtm) => (
                          <div key={gtm.id} className="text-xs space-y-0.5">
                            <div className="font-semibold text-stone-900">{gtm.glTransaction.narration}</div>
                            <div className="flex justify-between text-stone-500 text-[11px]">
                              <span>Date: {formatDate(gtm.glTransaction.transactionDate)}</span>
                              <span className="font-mono font-bold text-emerald-700">
                                {formatCurrency(gtm.allocatedAmount, gtm.glTransaction.currency)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
                  </div>
                )}
              </section>

              {[
                { title: 'Unmatched Bank Transactions', items: bankTransactions.filter((tx) => tx.status === 'UNMATCHED'), type: 'BANK' },
                { title: 'Unmatched GL Transactions', items: glTransactions.filter((tx) => tx.status === 'UNMATCHED'), type: 'GL' },
                { title: 'Partially Matched Bank Transactions', items: bankTransactions.filter((tx) => tx.status === 'PARTIALLY_MATCHED'), type: 'BANK' },
                { title: 'Partially Matched GL Transactions', items: glTransactions.filter((tx) => tx.status === 'PARTIALLY_MATCHED'), type: 'GL' },
              ].map((section) => (
                <section key={section.title}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-stone-900 uppercase tracking-wide">{section.title}</h4>
                    <span className="text-[10px] font-semibold text-stone-500">{section.items.length}</span>
                  </div>
                  {section.items.length === 0 ? (
                    <div className="py-4 text-center text-xs text-stone-400 bg-white rounded-lg border border-stone-200">
                      None
                    </div>
                  ) : (
                    <div className="bg-white border border-stone-200 rounded-lg divide-y divide-stone-100">
                      {section.items.map((tx) => (
                        <div key={tx.id} className="px-4 py-3 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-medium text-stone-900">
                              {section.type === 'BANK'
                                ? (tx as BankTransaction).description
                                : (tx as GLTransaction).narration}
                            </div>
                            <span className="font-mono font-semibold text-stone-800">
                              {formatCurrency(
                                Math.abs(section.type === 'BANK' ? (tx as BankTransaction).signedAmount : (tx as GLTransaction).amount),
                                tx.currency
                              )}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-stone-500">
                            <span>{formatDate(tx.transactionDate)}</span>
                            <span>Status: {tx.status}</span>
                            {tx.referenceNumber && <span>Ref: {tx.referenceNumber}</span>}
                            {section.type === 'GL' && (tx as GLTransaction).journalNumber && (
                              <span>Journal: {(tx as GLTransaction).journalNumber}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
