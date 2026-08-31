import React, { useState } from 'react';
import { AuditEvent } from '../types';
import { ShieldCheck, Database, Clock, Code, ChevronRight, User } from 'lucide-react';

interface AuditLogViewProps {
  events: AuditEvent[];
  total: number;
  onRefresh: () => void;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ events, total }) => {
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-stone-900">Immutable Financial Audit Trail</h2>
          <p className="text-xs text-stone-500">
            Append-only, cryptographically consistent ledger capturing all configuration changes, manual matches, and approvals
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs text-stone-600 bg-stone-100 px-3 py-1.5 rounded-lg font-mono">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Total Logged Events: {total}</span>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 text-stone-600 border-b border-stone-200 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity Type & ID</th>
                <th className="px-4 py-3">Actor & Role</th>
                <th className="px-4 py-3">Reason / Context</th>
                <th className="px-4 py-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-stone-500 italic">
                    No audit events recorded yet.
                  </td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-stone-50/60 transition-colors">
                    <td className="px-4 py-3 font-mono text-stone-600 whitespace-nowrap">
                      {formatDate(ev.timestamp)}
                    </td>
                    <td className="px-4 py-3 font-bold text-stone-900">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-stone-100 text-stone-800 font-mono border border-stone-200">
                        {ev.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-stone-700">
                      <div>{ev.entityType}</div>
                      <div className="text-[10px] text-stone-400 truncate max-w-[120px]">{ev.entityId}</div>
                    </td>
                    <td className="px-4 py-3 text-stone-700">
                      <div className="font-semibold">{ev.actor?.fullName || ev.actorEmail || 'System'}</div>
                      <div className="text-[10px] text-stone-400 font-mono">{ev.actorRole || 'SYSTEM'}</div>
                    </td>
                    <td className="px-4 py-3 text-stone-600 max-w-xs truncate">{ev.reason || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedEvent(ev)}
                        className="inline-flex items-center space-x-1 px-2 py-1 text-xs font-semibold bg-stone-100 text-stone-700 hover:bg-stone-200 rounded transition-colors"
                      >
                        <Code className="w-3 h-3 text-stone-500" />
                        <span>Diff</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Differential Inspection Drawer */}
      {selectedEvent && (
        <div className="bg-stone-900 text-stone-100 border border-stone-800 rounded-xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Audit Entry: {selectedEvent.action}</span>
              </h3>
              <p className="text-xs text-stone-400 font-mono">
                Event ID: {selectedEvent.id} • {formatDate(selectedEvent.timestamp)}
              </p>
            </div>
            <button
              onClick={() => setSelectedEvent(null)}
              className="text-xs text-stone-400 hover:text-white font-semibold"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Previous State */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-rose-400 mb-1">
                Previous State (Before Action)
              </div>
              <pre className="bg-stone-950 p-3 rounded font-mono text-stone-300 overflow-x-auto border border-stone-800 text-[11px] max-h-60">
                {selectedEvent.previousValue
                  ? JSON.stringify(selectedEvent.previousValue, null, 2)
                  : '(Null - Entity Creation)'}
              </pre>
            </div>

            {/* New State */}
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
                New State (After Action)
              </div>
              <pre className="bg-stone-950 p-3 rounded font-mono text-emerald-300 overflow-x-auto border border-stone-800 text-[11px] max-h-60">
                {selectedEvent.newValue
                  ? JSON.stringify(selectedEvent.newValue, null, 2)
                  : '(Null - Entity Deletion)'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
