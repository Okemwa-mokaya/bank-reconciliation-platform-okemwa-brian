import React, { useState } from 'react';
import { FileText, Eye, CheckCircle2, AlertCircle, FileCheck, Layers, Calendar, Landmark } from 'lucide-react';
import { BankStatement } from '../types';

interface StatementsViewProps {
  statements: BankStatement[];
  onRefresh: () => void;
}

export const StatementsView: React.FC<StatementsViewProps> = ({ statements }) => {
  const [selectedStatement, setSelectedStatement] = useState<BankStatement | null>(null);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-stone-900">Statements & OCR Tracking</h2>
          <p className="text-xs text-stone-500">
            Statement extraction pipeline, OCR confidence tracking, and page validation metadata
          </p>
        </div>
      </div>

      {/* Statements Table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-stone-50 text-stone-600 border-b border-stone-200 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">File / Statement</th>
                <th className="px-4 py-3">Bank & Account</th>
                <th className="px-4 py-3">Period</th>
                <th className="px-4 py-3">Balances (Open / Close)</th>
                <th className="px-4 py-3">Total Activity</th>
                <th className="px-4 py-3">OCR Status</th>
                <th className="px-4 py-3">Validation</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {statements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-stone-500 italic">
                    No bank statements uploaded for this organization.
                  </td>
                </tr>
              ) : (
                statements.map((stmt) => (
                  <tr key={stmt.id} className="hover:bg-stone-50/60 transition-colors">
                    <td className="px-4 py-3 font-medium text-stone-900">
                      <div className="flex items-center space-x-2">
                        <FileText className="w-4 h-4 text-stone-500 shrink-0" />
                        <div>
                          <span className="font-semibold block">{stmt.originalFilename}</span>
                          <span className="text-[10px] text-stone-400 font-mono uppercase">{stmt.fileType}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-stone-800">{stmt.bankAccount.bank.name}</div>
                      <div className="text-[11px] text-stone-500 font-mono">{stmt.bankAccount.accountNumber}</div>
                    </td>
                    <td className="px-4 py-3 text-stone-600">
                      {formatDate(stmt.statementPeriodStart)} – {formatDate(stmt.statementPeriodEnd)}
                    </td>
                    <td className="px-4 py-3 font-mono">
                      <div>Open: {formatCurrency(stmt.openingBalance)}</div>
                      <div className="font-semibold text-stone-900">Close: {formatCurrency(stmt.closingBalance)}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px]">
                      <div className="text-emerald-700">+{formatCurrency(stmt.totalCredits)}</div>
                      <div className="text-rose-700">-{formatCurrency(stmt.totalDebits)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                          stmt.extractionStatus === 'COMPLETED'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {stmt.extractionStatus} ({stmt.pages.length} pgs)
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${
                          stmt.validationStatus === 'VALID'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}
                      >
                        {stmt.validationStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedStatement(stmt)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold bg-stone-100 text-stone-700 hover:bg-stone-200 rounded transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Pages</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Statement Page Modal / Drawer */}
      {selectedStatement && (
        <div className="bg-stone-50 border border-stone-300 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                Statement Details & Page Extraction Metadata
              </h3>
              <p className="text-xs text-stone-500 font-mono">{selectedStatement.originalFilename}</p>
            </div>
            <button
              onClick={() => setSelectedStatement(null)}
              className="text-xs text-stone-500 hover:text-stone-800 font-semibold"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {selectedStatement.pages.map((page) => (
              <div key={page.id} className="bg-white border border-stone-200 rounded-lg p-4 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-900">Page {page.pageNumber}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {page.ocrStatus}
                  </span>
                </div>
                <div className="text-stone-500">
                  Extraction Confidence:{' '}
                  <span className="font-mono font-bold text-stone-800">
                    {page.extractionConfidence ? `${Math.round(page.extractionConfidence * 100)}%` : 'N/A'}
                  </span>
                </div>
                <div className="text-[11px] text-stone-400 font-mono truncate">ID: {page.id}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
