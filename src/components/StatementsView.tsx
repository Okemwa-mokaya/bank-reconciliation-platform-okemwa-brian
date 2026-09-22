import React, { useState } from 'react';
import {
  FileText,
  Eye,
  CheckCircle2,
  AlertCircle,
  FileCheck,
  Layers,
  Calendar,
  Landmark,
  Upload,
  AlertTriangle,
  FileWarning,
  Hash,
  ShieldCheck,
  Percent,
} from 'lucide-react';
import { BankStatement, BankAccount } from '../types';
import { DataIngestionModal } from './DataIngestionModal';
import { RejectedRowsModal } from './RejectedRowsModal';

interface StatementsViewProps {
  statements: BankStatement[];
  accounts?: BankAccount[];
  onRefresh: () => void;
}

export const StatementsView: React.FC<StatementsViewProps> = ({
  statements,
  accounts = [],
  onRefresh,
}) => {
  const [selectedStatement, setSelectedStatement] = useState<BankStatement | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [rejectedModalTarget, setRejectedModalTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-stone-900">Statements & Data Ingestion</h2>
          <p className="text-xs text-stone-500">
            Multi-format extraction pipeline (CSV, XLSX, PDF/OCR), SHA-256 integrity, deduplication & validation
          </p>
        </div>

        <button
          onClick={() => setIsUploadOpen(true)}
          className="inline-flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          <span>Upload Bank Statement</span>
        </button>
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
                <th className="px-4 py-3">Activity</th>
                <th className="px-4 py-3">Ingestion Status</th>
                <th className="px-4 py-3">Extraction & Integrity</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {statements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-stone-500">
                    <div className="max-w-sm mx-auto space-y-2">
                      <FileText className="w-8 h-8 text-stone-300 mx-auto" />
                      <p className="font-semibold text-stone-700">No bank statements uploaded yet</p>
                      <p className="text-xs text-stone-400">
                        Upload CSV, Excel, or PDF bank statements to start the Phase 2 ingestion and normalization flow.
                      </p>
                      <button
                        onClick={() => setIsUploadOpen(true)}
                        className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-medium cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>Upload First Statement</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                statements.map((stmt) => {
                  const isDup = stmt.duplicateStatus === 'DUPLICATE' || stmt.processingStatus === 'DUPLICATE';
                  const hasWarnings = (stmt.rejectedCount ?? 0) > 0 || (stmt.duplicateCount ?? 0) > 0;

                  return (
                    <tr key={stmt.id} className="hover:bg-stone-50/60 transition-colors">
                      <td className="px-4 py-3 font-medium text-stone-900">
                        <div className="flex items-center space-x-2.5">
                          <FileText className="w-4 h-4 text-stone-500 shrink-0" />
                          <div>
                            <span className="font-semibold block">{stmt.originalFilename}</span>
                            <div className="flex items-center space-x-1.5 mt-0.5">
                              <span className="text-[10px] text-stone-400 font-mono uppercase bg-stone-100 px-1 rounded">
                                {stmt.fileType}
                              </span>
                              {stmt.fileHash && (
                                <span
                                  className="text-[10px] text-stone-400 font-mono truncate max-w-[100px]"
                                  title={`SHA-256: ${stmt.fileHash}`}
                                >
                                  #{stmt.fileHash.substring(0, 8)}...
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-medium text-stone-800">{stmt.bankAccount?.bank?.name || 'Bank'}</div>
                        <div className="text-[11px] text-stone-500 font-mono">
                          {stmt.bankAccount?.accountNumber || '—'}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-stone-600 whitespace-nowrap">
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

                      {/* Ingestion & Processing Status */}
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              isDup
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : stmt.processingStatus === 'COMPLETED_WITH_WARNINGS'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : stmt.processingStatus === 'FAILED'
                                ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            }`}
                          >
                            {stmt.processingStatus || stmt.extractionStatus}
                          </span>

                          <div className="text-[10px] text-stone-500 font-mono">
                            <span>{stmt.validCount ?? stmt.transactionCount} valid</span>
                            {(stmt.rejectedCount ?? 0) > 0 && (
                              <button
                                onClick={() =>
                                  setRejectedModalTarget({
                                    id: stmt.id,
                                    title: stmt.originalFilename,
                                  })
                                }
                                className="ml-1.5 text-rose-600 hover:underline font-bold cursor-pointer"
                              >
                                ({stmt.rejectedCount} rejected)
                              </button>
                            )}
                            {(stmt.duplicateCount ?? 0) > 0 && (
                              <span className="ml-1.5 text-amber-700 font-semibold">
                                ({stmt.duplicateCount} dups)
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Extraction & Integrity */}
                      <td className="px-4 py-3">
                        <div className="text-[11px] text-stone-600">
                          <div className="font-medium text-stone-800 flex items-center space-x-1">
                            <span>{stmt.extractionMethod || 'STRUCTURED_PARSER'}</span>
                            {stmt.extractionConfidence && (
                              <span className="text-[10px] text-stone-400 font-mono">
                                ({Math.round(Number(stmt.extractionConfidence) * 100)}%)
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-stone-400 font-mono">
                            {stmt.pages?.length || 1} page(s)
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-2">
                          {(stmt.rejectedCount ?? 0) > 0 && (
                            <button
                              onClick={() =>
                                setRejectedModalTarget({
                                  id: stmt.id,
                                  title: stmt.originalFilename,
                                })
                              }
                              title="Inspect Rejected Rows"
                              className="p-1 rounded text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                              <FileWarning className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedStatement(stmt)}
                            className="inline-flex items-center space-x-1 text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200 px-2 py-1 rounded text-xs transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Details</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Details Drawer / Modal */}
      {selectedStatement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 border border-stone-200 space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center text-stone-700">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-stone-900">{selectedStatement.originalFilename}</h3>
                  <p className="text-xs text-stone-500 font-mono">Statement ID: {selectedStatement.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStatement(null)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Audit & Integrity Box */}
            <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-stone-700 flex items-center space-x-1.5">
                  <Hash className="w-3.5 h-3.5 text-stone-400" />
                  <span>SHA-256 Checksum:</span>
                </span>
                <span className="font-mono text-stone-900 break-all max-w-sm">
                  {selectedStatement.fileHash || 'Preserved locally'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-stone-700">Extraction Pipeline:</span>
                <span className="font-mono text-stone-900">{selectedStatement.extractionMethod || 'CSV/XLSX Parser'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-stone-700">Extraction Confidence:</span>
                <span className="font-mono text-emerald-700 font-bold">
                  {selectedStatement.extractionConfidence
                    ? `${Math.round(Number(selectedStatement.extractionConfidence) * 100)}%`
                    : '100%'}
                </span>
              </div>
            </div>

            {/* Balances & Validation Details */}
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1 font-mono">
                <div className="text-stone-500">Opening Balance</div>
                <div className="text-sm font-bold text-stone-900">
                  {formatCurrency(selectedStatement.openingBalance)}
                </div>
              </div>
              <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 space-y-1 font-mono">
                <div className="text-stone-500">Closing Balance</div>
                <div className="text-sm font-bold text-stone-900">
                  {formatCurrency(selectedStatement.closingBalance)}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedStatement(null)}
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
        initialMode="BANK_STATEMENT"
        onSuccess={() => {
          onRefresh();
          setIsUploadOpen(false);
        }}
      />

      {/* Rejected Rows Inspection Modal */}
      {rejectedModalTarget && (
        <RejectedRowsModal
          isOpen={!!rejectedModalTarget}
          onClose={() => setRejectedModalTarget(null)}
          sourceTitle={rejectedModalTarget.title}
          sourceType="BANK_STATEMENT"
          sourceId={rejectedModalTarget.id}
        />
      )}
    </div>
  );
};
