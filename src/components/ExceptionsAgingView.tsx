import React, { useState } from 'react';
import { ExceptionRecord, AgingBucketAnalysis } from '../types';
import { api } from '../services/api';
import { AlertTriangle, Clock, CheckCircle2, ShieldAlert, ArrowRight } from 'lucide-react';

interface ExceptionsAgingViewProps {
  exceptions: ExceptionRecord[];
  agingBuckets: AgingBucketAnalysis[];
  onRefresh: () => void;
}

export const ExceptionsAgingView: React.FC<ExceptionsAgingViewProps> = ({
  exceptions,
  agingBuckets,
  onRefresh,
}) => {
  const [selectedException, setSelectedException] = useState<ExceptionRecord | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [isResolving, setIsResolving] = useState(false);
  const [resMsg, setResMsg] = useState<string | null>(null);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedException) return;
    setIsResolving(true);
    setResMsg(null);
    try {
      await api.resolveException(selectedException.id, resolutionNote);
      setResMsg('Exception marked as resolved in immutable audit log.');
      setSelectedException(null);
      setResolutionNote('');
      onRefresh();
    } catch (err: any) {
      setResMsg(`Error: ${err.message}`);
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-stone-900">Exceptions & Outstanding Aging Buckets</h2>
        <p className="text-xs text-stone-500">
          Financial exception lifecycle management and aging analysis calculated directly against unmatched database records
        </p>
      </div>

      {/* Aging Analysis Overview */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-stone-900 flex items-center space-x-2">
            <Clock className="w-4 h-4 text-stone-700" />
            <span>Outstanding Aging Analysis</span>
          </h3>
          <span className="text-xs text-stone-500 font-mono">
            Default buckets: 0–7d, 8–30d, 31–60d, 61–90d, 90+d
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {agingBuckets.map((bucket) => (
            <div
              key={bucket.bucketId}
              className="bg-stone-50 border border-stone-200 rounded-lg p-3 text-xs space-y-2 hover:border-stone-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-stone-900">{bucket.name}</span>
                <span className="text-[10px] text-stone-400 font-mono">
                  {bucket.minDays}–{bucket.maxDays !== null ? `${bucket.maxDays}d` : '+'}
                </span>
              </div>

              <p className="text-base font-bold font-mono text-stone-900">
                {formatCurrency(bucket.combinedOutstandingValue)}
              </p>

              <div className="text-[10px] text-stone-500 space-y-0.5 pt-1 border-t border-stone-200/60">
                <div>Bank Tx: {bucket.bankTransactions.count} ({formatCurrency(bucket.bankTransactions.totalValue)})</div>
                <div>GL Tx: {bucket.glTransactions.count} ({formatCurrency(bucket.glTransactions.totalValue)})</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Status Message */}
      {resMsg && (
        <div className="p-3 bg-stone-100 text-stone-800 border border-stone-200 rounded-lg text-xs">
          {resMsg}
        </div>
      )}

      {/* Exceptions Register */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-stone-900">Exception Records ({exceptions.length})</h3>
          <span className="text-xs text-stone-500">10 Standard Financial Categories</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 text-stone-600 border-b border-stone-200 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Relevant Date</th>
                <th className="px-4 py-3">Priority / Risk</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Assigned User</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {exceptions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-stone-500 italic">
                    No exceptions currently open for this organization.
                  </td>
                </tr>
              ) : (
                exceptions.map((ex) => (
                  <tr key={ex.id} className="hover:bg-stone-50/60 transition-colors">
                    <td className="px-4 py-3 font-semibold text-stone-900">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-stone-100 text-stone-800 font-mono border border-stone-200">
                        {ex.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-800 max-w-sm">{ex.description}</td>
                    <td className="px-4 py-3 font-mono text-stone-600">{formatDate(ex.relevantDate)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          ex.priority === 'HIGH' || ex.priority === 'CRITICAL'
                            ? 'bg-rose-50 text-rose-800 border border-rose-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {ex.priority} / {ex.riskLevel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          ex.status === 'RESOLVED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {ex.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-stone-600">{ex.assignedUser?.fullName || 'Unassigned'}</td>
                    <td className="px-4 py-3 text-right">
                      {ex.status !== 'RESOLVED' ? (
                        <button
                          onClick={() => setSelectedException(ex)}
                          className="px-2.5 py-1 text-xs font-semibold bg-stone-900 text-white hover:bg-stone-800 rounded transition-colors"
                        >
                          Resolve
                        </button>
                      ) : (
                        <span className="text-[11px] text-stone-400 italic">Resolved</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resolution Drawer */}
      {selectedException && (
        <div className="bg-stone-50 border border-stone-300 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-stone-900">Resolve Exception #{selectedException.id.slice(0, 8)}</h3>
            <button
              onClick={() => setSelectedException(null)}
              className="text-xs text-stone-500 hover:text-stone-800 font-semibold"
            >
              Cancel
            </button>
          </div>
          <p className="text-xs text-stone-600 mb-3">{selectedException.description}</p>
          <form onSubmit={handleResolve} className="space-y-3 text-xs">
            <div>
              <label className="block text-stone-600 font-medium mb-1">
                Resolution Explanation & Audit Note *
              </label>
              <textarea
                required
                rows={3}
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                placeholder="Explain the operational root cause, manual adjustment, or posting resolution..."
                className="w-full bg-white border border-stone-300 rounded p-2.5 focus:outline-none focus:border-stone-800"
              />
            </div>
            <div className="flex justify-end space-x-2">
              <button
                type="submit"
                disabled={isResolving}
                className="bg-emerald-700 text-white px-4 py-2 rounded text-xs font-semibold hover:bg-emerald-800"
              >
                {isResolving ? 'Recording...' : 'Confirm Resolution'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
