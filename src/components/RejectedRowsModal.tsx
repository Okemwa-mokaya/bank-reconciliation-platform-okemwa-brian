import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, FileWarning, Search, ShieldAlert } from 'lucide-react';
import { RejectedRow } from '../types';

interface RejectedRowsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceTitle: string;
  sourceType: 'BANK_STATEMENT' | 'GL_IMPORT';
  sourceId: string;
}

export const RejectedRowsModal: React.FC<RejectedRowsModalProps> = ({
  isOpen,
  onClose,
  sourceTitle,
  sourceType,
  sourceId,
}) => {
  const [rejectedRows, setRejectedRows] = useState<RejectedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !sourceId) return;

    setLoading(true);
    setError(null);

    const endpoint =
      sourceType === 'BANK_STATEMENT'
        ? `/api/statements/${sourceId}/rejected-rows`
        : `/api/transactions/gl/imports/${sourceId}/rejected-rows`;

    fetch(endpoint)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load rejected rows');
        return res.json();
      })
      .then((data) => {
        setRejectedRows(data.rejectedRows || []);
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, sourceId, sourceType]);

  if (!isOpen) return null;

  const filteredRows = rejectedRows.filter(
    (row) =>
      row.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.errorCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      row.rawRecord.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[85vh] flex flex-col border border-stone-200 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/80">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-rose-100 flex items-center justify-center text-rose-700">
              <FileWarning className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900">Rejected Rows Inspection</h3>
              <p className="text-xs text-stone-500">
                Source: <span className="font-semibold text-stone-700">{sourceTitle}</span> (
                {sourceType === 'BANK_STATEMENT' ? 'Bank Statement' : 'General Ledger Import'})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Info Banner */}
        <div className="p-6 pb-2 space-y-4">
          <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200/80 rounded-xl text-xs text-rose-800">
            <ShieldAlert className="w-4 h-4 shrink-0 text-rose-600" />
            <span>
              These rows were preserved for audit fidelity but excluded from ledger matching due to validation errors.
              No transactions were silently discarded.
            </span>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by error reason, code, or raw content..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-stone-300 rounded-lg text-xs bg-white text-stone-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
            />
          </div>
        </div>

        {/* Content Table */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          {loading ? (
            <div className="py-12 text-center text-stone-500 text-xs">Loading rejected rows...</div>
          ) : error ? (
            <div className="py-8 text-center text-rose-600 text-xs">{error}</div>
          ) : filteredRows.length === 0 ? (
            <div className="py-12 text-center text-stone-400 text-xs italic">
              {rejectedRows.length === 0
                ? 'No rejected rows found for this upload. All records passed validation.'
                : 'No rejected rows match your search query.'}
            </div>
          ) : (
            <div className="border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-stone-50 text-stone-600 border-b border-stone-200 font-semibold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="px-3 py-2.5 w-16">Row #</th>
                    {filteredRows.some((r) => r.pageNumber) && <th className="px-3 py-2.5 w-16">Page #</th>}
                    <th className="px-3 py-2.5 w-36">Error Code</th>
                    <th className="px-3 py-2.5">Validation Reason</th>
                    <th className="px-3 py-2.5">Original Raw Record</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="hover:bg-rose-50/30 transition-colors">
                      <td className="px-3 py-2.5 font-mono text-stone-600 font-semibold">{row.rowNumber}</td>
                      {filteredRows.some((r) => r.pageNumber) && (
                        <td className="px-3 py-2.5 font-mono text-stone-500">{row.pageNumber || '—'}</td>
                      )}
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          {row.errorCode}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-stone-800 font-medium">{row.reason}</td>
                      <td className="px-3 py-2.5 font-mono text-[11px] text-stone-600 break-all max-w-xs">
                        <div className="bg-stone-50 p-1.5 rounded border border-stone-200 max-h-24 overflow-y-auto">
                          {row.rawRecord}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between text-xs text-stone-500">
          <span>
            Total Rejected: <strong className="text-stone-900">{rejectedRows.length}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-lg font-medium transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
