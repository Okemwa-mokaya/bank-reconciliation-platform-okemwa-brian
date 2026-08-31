import React, { useState } from 'react';
import { BankTransaction, GLTransaction } from '../types';
import { Layers, Database, Code, CheckCircle2, Clock, Filter } from 'lucide-react';

interface TransactionsViewProps {
  bankTransactions: BankTransaction[];
  glTransactions: GLTransaction[];
  onRefresh: () => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  bankTransactions,
  glTransactions,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'bank' | 'gl'>('bank');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [selectedTxRaw, setSelectedTxRaw] = useState<{ title: string; json: string } | null>(null);

  const formatCurrency = (val: number, curr = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: curr,
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
            Immutable source transactions preserving raw payloads, reference tracking, and match statuses
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Subtab toggle */}
          <div className="bg-stone-100 p-1 rounded-lg flex space-x-1 text-xs">
            <button
              onClick={() => setActiveSubTab('bank')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                activeSubTab === 'bank'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              Bank Feed ({bankTransactions.length})
            </button>
            <button
              onClick={() => setActiveSubTab('gl')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
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
              className="bg-transparent font-medium text-stone-800 focus:outline-none cursor-pointer text-xs"
            >
              <option value="ALL">All Statuses</option>
              <option value="UNMATCHED">Unmatched</option>
              <option value="MATCHED">Matched</option>
            </select>
          </div>
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
                      <td className="px-4 py-3 font-mono text-stone-700">{formatDate(tx.transactionDate)}</td>
                      <td className="px-4 py-3 font-medium text-stone-900 max-w-xs truncate">
                        {tx.description}
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
                              title: `Bank Transaction: ${tx.description}`,
                              json: tx.originalImportedData,
                            })
                          }
                          className="inline-flex items-center space-x-1 px-2 py-1 text-[11px] font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 rounded transition-colors"
                        >
                          <Code className="w-3 h-3 text-stone-500" />
                          <span>Raw Source</span>
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
                  <th className="px-4 py-3">GL Narration</th>
                  <th className="px-4 py-3">Ref / Journal #</th>
                  <th className="px-4 py-3">Customer / Supplier</th>
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
                    <td colSpan={10} className="px-4 py-8 text-center text-stone-500 italic">
                      No GL transactions match the current filter.
                    </td>
                  </tr>
                ) : (
                  filteredGLTx.map((tx) => (
                    <tr key={tx.id} className="hover:bg-stone-50/60 transition-colors">
                      <td className="px-4 py-3 font-mono text-stone-700">{formatDate(tx.transactionDate)}</td>
                      <td className="px-4 py-3 font-medium text-stone-900 max-w-xs truncate">{tx.narration}</td>
                      <td className="px-4 py-3 font-mono text-stone-500">
                        {tx.journalNumber || tx.referenceNumber || '—'}
                      </td>
                      <td className="px-4 py-3 text-stone-600">{tx.customerSupplier || '—'}</td>
                      <td className="px-4 py-3 font-mono text-[10px] text-stone-500">{tx.sourceSystem}</td>
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
                              title: `GL Journal Item: ${tx.narration}`,
                              json: tx.originalData,
                            })
                          }
                          className="inline-flex items-center space-x-1 px-2 py-1 text-[11px] font-medium bg-stone-100 hover:bg-stone-200 text-stone-700 rounded transition-colors"
                        >
                          <Code className="w-3 h-3 text-stone-500" />
                          <span>Raw Source</span>
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

      {/* Raw Source JSON Modal */}
      {selectedTxRaw && (
        <div className="bg-stone-900 text-stone-100 border border-stone-800 rounded-xl p-5 shadow-lg">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Database className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-bold text-white">{selectedTxRaw.title}</h3>
            </div>
            <button
              onClick={() => setSelectedTxRaw(null)}
              className="text-xs text-stone-400 hover:text-white font-semibold"
            >
              Close
            </button>
          </div>
          <p className="text-xs text-stone-400 mb-2">
            Verbatim financial source payload preserved for non-repudiation and audit compliance:
          </p>
          <pre className="bg-stone-950 p-4 rounded-lg font-mono text-xs text-emerald-400 overflow-x-auto border border-stone-800">
            {JSON.stringify(JSON.parse(selectedTxRaw.json || '{}'), null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};
