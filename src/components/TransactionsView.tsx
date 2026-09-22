import React, { useState } from 'react';
import { BankTransaction, GLTransaction, BankAccount } from '../types';
import {
  Layers,
  Database,
  Code,
  CheckCircle2,
  Clock,
  Filter,
  Upload,
  AlertTriangle,
  Hash,
  FileSpreadsheet,
} from 'lucide-react';
import { DataIngestionModal } from './DataIngestionModal';

interface TransactionsViewProps {
  bankTransactions: BankTransaction[];
  glTransactions: GLTransaction[];
  accounts?: BankAccount[];
  onRefresh: () => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  bankTransactions,
  glTransactions,
  accounts = [],
  onRefresh,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'bank' | 'gl'>('bank');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selectedTxRaw, setSelectedTxRaw] = useState<{ title: string; json: string } | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const formatCurrency = (val: number, curr = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
      minimumFractionDigits: 2,
    }).format(val || 0);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const filteredBankTx = bankTransactions.filter(
    (tx) => filterStatus === 'ALL' || tx.status === filterStatus
  );

  const filteredGLTx = glTransactions.filter(
    (tx) => filterStatus === 'ALL' || tx.status === filterStatus
  );

  return (
    <div className="space-y-6">
      {/* Header & Subtabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-stone-900">Ingested Financial Transactions</h2>
          <p className="text-xs text-stone-500">
            Immutable source transactions preserving raw payloads, reference tracking, fingerprints, and match statuses
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Subtab toggle */}
          <div className="bg-stone-100 p-1 rounded-lg flex space-x-1 text-xs">
            <button
              onClick={() => setActiveSubTab('bank')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                activeSubTab === 'bank'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Bank Feed ({bankTransactions.length})
            </button>
            <button
              onClick={() => setActiveSubTab('gl')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors cursor-pointer ${
                activeSubTab === 'gl'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              General Ledger ({glTransactions.length})
            </button>
          </div>

          {/* Status filter */}
          <div className="flex items-center space-x-1.5 text-xs bg-white border border-stone-200 rounded-lg px-2.5 py-1.5">
            <Filter className="w-3.5 h-3.5 text-stone-400" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-transparent font-medium text-stone-800 focus:outline-hidden cursor-pointer text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="UNMATCHED">Unmatched</option>
              <option value="MATCHED">Matched</option>
            </select>
          </div>

          {/* Ingest Action Button */}
          <button
            onClick={() => setIsUploadOpen(true)}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Ingest {activeSubTab === 'bank' ? 'Statement' : 'GL Data'}</span>
          </button>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          {activeSubTab === 'bank' ? (
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 text-stone-600 border-b border-stone-200 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Description / Narration</th>
                  <th className="px-4 py-3">Ref / Cheque #</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                  <th className="px-4 py-3 text-right">Net Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Source Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredBankTx.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-stone-500 italic">
                      No bank transactions match the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredBankTx.map((tx) => (
                    <tr key={tx.id} className="hover:bg-stone-50/60 transition-colors">
                      <td className="px-4 py-3 font-mono text-stone-700 whitespace-nowrap">
                        {formatDate(tx.transactionDate)}
                      </td>
                      <td className="px-4 py-3 font-medium text-stone-900 max-w-xs">
                        <div className="truncate">{tx.description}</div>
                        {tx.isSuspectedDuplicate && (
                          <div
                            className="inline-flex items-center space-x-1 mt-0.5 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200/80"
                            title={tx.duplicateReason || 'Suspected Duplicate Transaction'}
                          >
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span>Suspected Duplicate</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-stone-500">{tx.referenceNumber || '—'}</td>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-stone-100 text-stone-700">
                          {tx.transactionType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-stone-600">
                        {tx.debit > 0 ? formatCurrency(tx.debit, tx.currency) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-700 font-semibold">
                        {tx.credit > 0 ? formatCurrency(tx.credit, tx.currency) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-stone-900">
                        {formatCurrency(tx.signedAmount, tx.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                            tx.status === 'MATCHED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() =>
                            setSelectedTxRaw({
                              title: `Bank Transaction: ${tx.description} (${formatDate(tx.transactionDate)})`,
                              json: tx.originalImportedData,
                            })
                          }
                          className="inline-flex items-center space-x-1 text-stone-500 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 px-2 py-1 rounded text-[11px] transition-colors cursor-pointer"
                        >
                          <Code className="w-3.5 h-3.5" />
                          <span>View Raw</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-stone-50 text-stone-600 border-b border-stone-200 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Narration / Description</th>
                  <th className="px-4 py-3">Ref / Journal #</th>
                  <th className="px-4 py-3">Source System</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                  <th className="px-4 py-3 text-right">Net Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Source Payload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredGLTx.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-stone-500 italic">
                      No GL transactions match the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredGLTx.map((tx) => (
                    <tr key={tx.id} className="hover:bg-stone-50/60 transition-colors">
                      <td className="px-4 py-3 font-mono text-stone-700 whitespace-nowrap">
                        {formatDate(tx.transactionDate)}
                      </td>
                      <td className="px-4 py-3 font-medium text-stone-900 max-w-xs">
                        <div className="truncate">{tx.narration}</div>
                        {tx.isSuspectedDuplicate && (
                          <div
                            className="inline-flex items-center space-x-1 mt-0.5 text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200/80"
                            title={tx.duplicateReason || 'Suspected Duplicate Transaction'}
                          >
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span>Suspected Duplicate</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-stone-500">
                        {tx.referenceNumber || tx.journalNumber || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-stone-100 text-stone-700">
                          {tx.sourceSystem}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-stone-600">
                        {tx.debit > 0 ? formatCurrency(tx.debit, tx.currency) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-700 font-semibold">
                        {tx.credit > 0 ? formatCurrency(tx.credit, tx.currency) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-stone-900">
                        {formatCurrency(tx.amount, tx.currency)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                            tx.status === 'MATCHED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border border-amber-200'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() =>
                            setSelectedTxRaw({
                              title: `GL Transaction: ${tx.narration} (${formatDate(tx.transactionDate)})`,
                              json: tx.originalData,
                            })
                          }
                          className="inline-flex items-center space-x-1 text-stone-500 hover:text-stone-800 bg-stone-100 hover:bg-stone-200 px-2 py-1 rounded text-[11px] transition-colors cursor-pointer"
                        >
                          <Code className="w-3.5 h-3.5" />
                          <span>View Raw</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Raw Payload Modal */}
      {selectedTxRaw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 border border-stone-200 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h3 className="text-sm font-bold text-stone-900 truncate pr-2">{selectedTxRaw.title}</h3>
              <button
                onClick={() => setSelectedTxRaw(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-stone-700">Raw Immutable Payload:</span>
              <pre className="p-3 bg-stone-900 text-emerald-400 text-xs font-mono rounded-xl overflow-x-auto max-h-72">
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(selectedTxRaw.json), null, 2);
                  } catch {
                    return selectedTxRaw.json;
                  }
                })()}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedTxRaw(null)}
                className="px-4 py-2 bg-stone-900 text-white rounded-lg text-xs font-semibold hover:bg-stone-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      <DataIngestionModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        accounts={accounts}
        initialMode={activeSubTab === 'bank' ? 'BANK_STATEMENT' : 'GL_IMPORT'}
        onSuccess={() => {
          onRefresh();
          setIsUploadOpen(false);
        }}
      />
    </div>
  );
};
