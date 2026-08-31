import React, { useState, useEffect } from 'react';
import { ReconciliationPeriod, ReconciliationMatch } from '../types';
import { api } from '../services/api';
import { Calendar, CheckCircle2, Lock, Eye, GitMerge, FileCheck, Layers } from 'lucide-react';

interface ReconciliationsViewProps {
  periods: ReconciliationPeriod[];
  onRefresh: () => void;
}

export const ReconciliationsView: React.FC<ReconciliationsViewProps> = ({ periods }) => {
  const [selectedPeriod, setSelectedPeriod] = useState<ReconciliationPeriod | null>(null);
  const [matches, setMatches] = useState<ReconciliationMatch[]>([]);
  const [isLoadingMatches, setIsLoadingMatches] = useState(false);

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
    } catch (err) {
      console.error('Failed to load period matches:', err);
    } finally {
      setIsLoadingMatches(false);
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
        <h2 className="text-lg font-bold text-stone-900">Reconciliation Periods & Multi-Item Matches</h2>
        <p className="text-xs text-stone-500">
          Reconciliation lifecycle tracking, approval hierarchy, and topological match relationships (1:1, 1:Many, Many:Many)
        </p>
      </div>

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
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                Matches for {selectedPeriod.bankAccount.accountName} (
                {formatDate(selectedPeriod.periodStart)} – {formatDate(selectedPeriod.periodEnd)})
              </h3>
              <p className="text-xs text-stone-500">
                Topological match junction records linking bank transactions to GL journal entries
              </p>
            </div>
            <button
              onClick={() => setSelectedPeriod(null)}
              className="text-xs text-stone-500 hover:text-stone-800 font-semibold"
            >
              Close
            </button>
          </div>

          {isLoadingMatches ? (
            <div className="py-8 text-center text-xs text-stone-500">Loading period matches...</div>
          ) : matches.length === 0 ? (
            <div className="py-8 text-center text-xs text-stone-500 italic bg-white rounded-lg border border-stone-200">
              No matches recorded for this period yet.
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map((match) => (
                <div key={match.id} className="bg-white border border-stone-200 rounded-lg p-4 shadow-2xs text-xs space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
                    <div className="flex items-center space-x-2">
                      <GitMerge className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold text-stone-900 uppercase">{match.matchType} MATCH</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                        {match.matchStatus}
                      </span>
                    </div>

                    <div className="flex items-center space-x-3 text-stone-500 text-[11px]">
                      <span>
                        Confidence:{' '}
                        <span className="font-mono font-bold text-stone-800">
                          {Math.round(match.confidenceScore * 100)}%
                        </span>
                      </span>
                      <span>
                        Rule: <span className="font-medium text-stone-700">{match.matchingRule?.name || 'Manual'}</span>
                      </span>
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
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
