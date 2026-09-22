import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
  Hash,
  Layers,
  Database,
  RefreshCw,
  Info,
  Check,
  Sliders,
} from 'lucide-react';
import { BankAccount } from '../types';

interface DataIngestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  accounts: BankAccount[];
  initialMode?: 'BANK_STATEMENT' | 'GL_IMPORT';
  onSuccess: () => void;
}

interface ColumnMapping {
  transactionDate?: string;
  valueDate?: string;
  description?: string;
  referenceNumber?: string;
  chequeNumber?: string;
  debit?: string;
  credit?: string;
  amount?: string;
  balance?: string;
  journalNumber?: string;
  accountNumber?: string;
  customerSupplier?: string;
}

interface PreviewData {
  headers: string[];
  detectedMapping: ColumnMapping;
  mappingConfidence: number;
  unmappedHeaders: string[];
  sampleRows: Record<string, unknown>[];
  totalRows: number;
  warnings: string[];
  extractionMethod: string;
}

interface IngestionSummary {
  sourceId: string;
  sourceType: string;
  filename: string;
  fileHash: string;
  fileSize: number;
  status: string;
  recordsDetected: number;
  successfullyImported: number;
  rejectedCount: number;
  duplicateCount: number;
  warningCount: number;
  pagesProcessed: number;
  extractionMethod: string;
  extractionConfidence: number;
  warnings: string[];
  totalCredits: string;
  totalDebits: string;
}

export const DataIngestionModal: React.FC<DataIngestionModalProps> = ({
  isOpen,
  onClose,
  accounts,
  initialMode = 'BANK_STATEMENT',
  onSuccess,
}) => {
  const [ingestionType, setIngestionType] = useState<'BANK_STATEMENT' | 'GL_IMPORT'>(initialMode);
  const [selectedAccountId, setSelectedAccountId] = useState<string>(accounts[0]?.id || '');
  const [sourceSystem, setSourceSystem] = useState<string>('SAP_S4HANA');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Flow steps: 'SELECT' -> 'PREVIEW' -> 'PROCESSING' -> 'RESULT'
  const [step, setStep] = useState<'SELECT' | 'PREVIEW' | 'PROCESSING' | 'RESULT'>('SELECT');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [customMapping, setCustomMapping] = useState<ColumnMapping>({});
  const [summary, setSummary] = useState<IngestionSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls', 'pdf'].includes(ext || '')) {
      setErrorMessage(`Unsupported format '.${ext}'. Supported formats are CSV, XLSX, XLS, and PDF.`);
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setErrorMessage('File size exceeds the 20 MB security limit.');
      return;
    }

    setErrorMessage(null);
    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // Preview file to detect columns and show samples
  const handleProceedToPreview = async () => {
    if (!selectedFile) return;

    setPreviewLoading(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    const endpoint =
      ingestionType === 'BANK_STATEMENT' ? '/api/statements/preview' : '/api/transactions/gl/preview';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to inspect file structure');
      }

      const extraction = data.extraction;
      setPreviewData({
        headers: extraction.headers || [],
        detectedMapping: extraction.detectedMapping || {},
        mappingConfidence: extraction.mappingConfidence || 0.8,
        unmappedHeaders: extraction.unmappedHeaders || [],
        sampleRows: data.sampleRows || [],
        totalRows: data.totalRows || 0,
        warnings: extraction.warnings || [],
        extractionMethod: extraction.extractionMethod || 'STRUCTURED_PARSER',
      });
      setCustomMapping(extraction.detectedMapping || {});
      setStep('PREVIEW');
    } catch (err: any) {
      setErrorMessage(err.message || 'Error parsing preview');
    } finally {
      setPreviewLoading(false);
    }
  };

  // Final Upload and Atomic DB Ingestion
  const handleExecuteIngestion = async () => {
    if (!selectedFile) return;

    setStep('PROCESSING');
    setErrorMessage(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (selectedAccountId) formData.append('bankAccountId', selectedAccountId);
    if (ingestionType === 'GL_IMPORT') formData.append('sourceSystem', sourceSystem);
    formData.append('columnMapping', JSON.stringify(customMapping));

    const endpoint =
      ingestionType === 'BANK_STATEMENT' ? '/api/statements/upload' : '/api/transactions/gl/upload';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.status === 409) {
        // Level 1 Duplicate file caught
        setSummary(data.summary);
        setStep('RESULT');
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Ingestion processing failed');
      }

      setSummary(data.summary);
      setStep('RESULT');
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Ingestion failed');
      setStep('PREVIEW');
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewData(null);
    setSummary(null);
    setErrorMessage(null);
    setStep('SELECT');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col border border-stone-200 overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between bg-stone-50/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center text-white shadow-xs">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-stone-900">Financial Data Ingestion Layer</h3>
              <p className="text-xs text-stone-500">
                Multi-format parsing (CSV, XLSX, PDF, OCR), SHA-256 fingerprinting, deduplication & validation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ingestion Mode Switcher */}
        {step === 'SELECT' && (
          <div className="px-6 pt-5 pb-0">
            <div className="grid grid-cols-2 gap-3 p-1 bg-stone-100 rounded-xl border border-stone-200">
              <button
                type="button"
                onClick={() => setIngestionType('BANK_STATEMENT')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                  ingestionType === 'BANK_STATEMENT'
                    ? 'bg-white text-emerald-900 shadow-xs border border-stone-200/60'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <FileText className="w-4 h-4 text-emerald-600" />
                <span>Bank Statement Ingestion</span>
              </button>

              <button
                type="button"
                onClick={() => setIngestionType('GL_IMPORT')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-2 transition-all cursor-pointer ${
                  ingestionType === 'GL_IMPORT'
                    ? 'bg-white text-emerald-900 shadow-xs border border-stone-200/60'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Database className="w-4 h-4 text-emerald-600" />
                <span>General Ledger (GL) Ingestion</span>
              </button>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center space-x-2 text-xs text-rose-800">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 flex-1 overflow-y-auto space-y-5">
          {/* STEP 1: SELECT FILE & ACCOUNT */}
          {step === 'SELECT' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Bank Account Selection */}
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                    Target Bank Account {ingestionType === 'BANK_STATEMENT' && <span className="text-rose-500">*</span>}
                  </label>
                  <select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs bg-white text-stone-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.bank.name} — {acc.accountName} ({acc.accountNumber}) [{acc.currency}]
                      </option>
                    ))}
                  </select>
                </div>

                {/* Source System (GL only) */}
                {ingestionType === 'GL_IMPORT' ? (
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">GL Source System</label>
                    <select
                      value={sourceSystem}
                      onChange={(e) => setSourceSystem(e.target.value)}
                      className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs bg-white text-stone-800 focus:outline-hidden focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
                    >
                      <option value="SAP_S4HANA">SAP S/4HANA</option>
                      <option value="ORACLE_NETSUITE">Oracle NetSuite</option>
                      <option value="MICROSOFT_DYNAMICS">Microsoft Dynamics 365</option>
                      <option value="QUICKBOOKS_ONLINE">QuickBooks Online</option>
                      <option value="WORKDAY_FINANCIALS">Workday Financials</option>
                      <option value="CUSTOM_ERP_EXPORT">Custom ERP / General Ledger Export</option>
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-stone-700 mb-1.5">Supported Formats</label>
                    <div className="flex items-center space-x-2 pt-1 text-xs text-stone-600">
                      <span className="px-2 py-0.5 bg-stone-100 border border-stone-200 rounded font-mono font-medium">.CSV</span>
                      <span className="px-2 py-0.5 bg-stone-100 border border-stone-200 rounded font-mono font-medium">.XLSX / .XLS</span>
                      <span className="px-2 py-0.5 bg-stone-100 border border-stone-200 rounded font-mono font-medium">.PDF (OCR)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Drag & Drop File Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-emerald-600 bg-emerald-50/50'
                    : selectedFile
                    ? 'border-emerald-400 bg-emerald-50/20'
                    : 'border-stone-300 hover:border-emerald-500 hover:bg-stone-50/60'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls,.pdf"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="hidden"
                />

                <div className="flex flex-col items-center justify-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    {selectedFile ? <FileSpreadsheet className="w-6 h-6" /> : <Upload className="w-6 h-6" />}
                  </div>
                  {selectedFile ? (
                    <div>
                      <p className="text-sm font-bold text-stone-900">{selectedFile.name}</p>
                      <p className="text-xs text-stone-500 font-mono mt-0.5">
                        {(selectedFile.size / 1024).toFixed(1)} KB • {selectedFile.type || 'Document'}
                      </p>
                      <span className="inline-block mt-2 text-xs font-semibold text-emerald-700 hover:underline">
                        Click or drop another file to replace
                      </span>
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-semibold text-stone-800">
                        Drop your {ingestionType === 'BANK_STATEMENT' ? 'bank statement' : 'GL export'} here, or{' '}
                        <span className="text-emerald-700 underline font-bold">browse</span>
                      </p>
                      <p className="text-xs text-stone-500 mt-1">
                        Accepts CSV, Excel (.xlsx/.xls), and PDF (with native text or vision OCR fallback) up to 20 MB
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Security & Multi-tenant Assurance */}
              <div className="p-3.5 bg-stone-50 border border-stone-200/80 rounded-xl space-y-2 text-xs text-stone-600">
                <div className="flex items-center space-x-2 text-stone-900 font-semibold">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Phase 2 Ingestion Protections</span>
                </div>
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] list-disc list-inside text-stone-500">
                  <li>Original binary preserved with SHA-256 fingerprint</li>
                  <li>Level 1 duplicate file upload detection</li>
                  <li>Level 2 transaction-level fingerprint matching</li>
                  <li>No auto-reconciliation (strictly UNMATCHED)</li>
                  <li>Zero silent discard — rejected rows preserved</li>
                </ul>
              </div>
            </div>
          )}

          {/* STEP 2: COLUMN MAPPING & PREVIEW */}
          {step === 'PREVIEW' && previewData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-stone-50 border border-stone-200 rounded-xl">
                <div>
                  <div className="text-xs font-bold text-stone-900 flex items-center space-x-2">
                    <span>{selectedFile?.name}</span>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-mono uppercase">
                      {previewData.extractionMethod}
                    </span>
                  </div>
                  <div className="text-[11px] text-stone-500 mt-0.5">
                    {previewData.totalRows} detected rows • Confidence:{' '}
                    <strong>{Math.round(previewData.mappingConfidence * 100)}%</strong>
                  </div>
                </div>

                <div className="text-right">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    <Check className="w-3.5 h-3.5 mr-1" /> Ready for Ingestion
                  </span>
                </div>
              </div>

              {/* Column Mapping Review */}
              <div className="border border-stone-200 rounded-xl p-4 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 text-xs font-bold text-stone-800">
                    <Sliders className="w-4 h-4 text-stone-500" />
                    <span>Auto-Detected Column Mapping</span>
                  </div>
                  <span className="text-[11px] text-stone-500">Adjust headers if needed</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-medium text-stone-600 mb-1">Transaction Date *</label>
                    <select
                      value={customMapping.transactionDate || ''}
                      onChange={(e) => setCustomMapping({ ...customMapping, transactionDate: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-stone-300 rounded text-xs bg-white text-stone-800"
                    >
                      <option value="">— Select Column —</option>
                      {previewData.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-stone-600 mb-1">Description / Narration *</label>
                    <select
                      value={customMapping.description || ''}
                      onChange={(e) => setCustomMapping({ ...customMapping, description: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-stone-300 rounded text-xs bg-white text-stone-800"
                    >
                      <option value="">— Select Column —</option>
                      {previewData.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-stone-600 mb-1">Reference / Cheque #</label>
                    <select
                      value={customMapping.referenceNumber || ''}
                      onChange={(e) => setCustomMapping({ ...customMapping, referenceNumber: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-stone-300 rounded text-xs bg-white text-stone-800"
                    >
                      <option value="">— Optional —</option>
                      {previewData.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-stone-600 mb-1">Debit (Money Out)</label>
                    <select
                      value={customMapping.debit || ''}
                      onChange={(e) => setCustomMapping({ ...customMapping, debit: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-stone-300 rounded text-xs bg-white text-stone-800"
                    >
                      <option value="">— Optional —</option>
                      {previewData.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-stone-600 mb-1">Credit (Money In)</label>
                    <select
                      value={customMapping.credit || ''}
                      onChange={(e) => setCustomMapping({ ...customMapping, credit: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-stone-300 rounded text-xs bg-white text-stone-800"
                    >
                      <option value="">— Optional —</option>
                      {previewData.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-stone-600 mb-1">Single Amount Column</label>
                    <select
                      value={customMapping.amount || ''}
                      onChange={(e) => setCustomMapping({ ...customMapping, amount: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-stone-300 rounded text-xs bg-white text-stone-800"
                    >
                      <option value="">— Optional (Signed) —</option>
                      {previewData.headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Sample Rows Preview Table */}
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-stone-700">Sample Extracted Records (First 5 Rows)</span>
                <div className="border border-stone-200 rounded-xl overflow-x-auto shadow-2xs max-h-48">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-stone-50 text-stone-600 border-b border-stone-200 font-semibold uppercase tracking-wider text-[10px]">
                      <tr>
                        {previewData.headers.map((h) => (
                          <th key={h} className="px-3 py-2 whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {previewData.sampleRows.slice(0, 5).map((row, idx) => (
                        <tr key={idx} className="hover:bg-stone-50/50">
                          {previewData.headers.map((h) => (
                            <td key={h} className="px-3 py-1.5 whitespace-nowrap text-stone-700 font-mono text-[11px]">
                              {String(row[h] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: PROCESSING */}
          {step === 'PROCESSING' && (
            <div className="py-16 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto animate-spin">
                <RefreshCw className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-stone-900">Executing Ingestion Pipeline...</h4>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                Computing SHA-256 fingerprint, checking file & transaction duplicates, normalizing dates & decimals,
                and persisting transactions in PostgreSQL.
              </p>
            </div>
          )}

          {/* STEP 4: RESULTS */}
          {step === 'RESULT' && summary && (
            <div className="space-y-4">
              {summary.status === 'DUPLICATE' ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-amber-900 font-bold text-sm">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <span>Duplicate File Upload Blocked</span>
                  </div>
                  <p className="text-xs text-amber-800">
                    {summary.warnings[0] ||
                      'An identical file with the exact same SHA-256 fingerprint was already uploaded previously.'}
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center space-x-2 text-emerald-950 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <span>Ingestion Completed Successfully</span>
                  </div>
                  <p className="text-xs text-emerald-800">
                    Source: <strong className="font-semibold">{summary.filename}</strong> has been processed into the
                    immutable financial ledger.
                  </p>
                </div>
              )}

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
                  <span className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold block">Detected Rows</span>
                  <span className="text-lg font-bold text-stone-900">{summary.recordsDetected}</span>
                </div>

                <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
                  <span className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold block">Imported (UNMATCHED)</span>
                  <span className="text-lg font-bold text-emerald-700">{summary.successfullyImported}</span>
                </div>

                <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
                  <span className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold block">Rejected Rows</span>
                  <span className={`text-lg font-bold ${summary.rejectedCount > 0 ? 'text-rose-700' : 'text-stone-900'}`}>
                    {summary.rejectedCount}
                  </span>
                </div>

                <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl">
                  <span className="text-[10px] text-stone-500 uppercase tracking-wider font-semibold block">Suspected Duplicates</span>
                  <span className={`text-lg font-bold ${summary.duplicateCount > 0 ? 'text-amber-700' : 'text-stone-900'}`}>
                    {summary.duplicateCount}
                  </span>
                </div>
              </div>

              {/* Checksum & Audit Info */}
              <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-stone-600">
                  <span className="flex items-center space-x-1.5 font-medium">
                    <Hash className="w-3.5 h-3.5 text-stone-400" />
                    <span>SHA-256 Checksum:</span>
                  </span>
                  <span className="font-mono text-[11px] text-stone-900 bg-stone-200/60 px-1.5 py-0.5 rounded break-all max-w-[280px]">
                    {summary.fileHash}
                  </span>
                </div>

                <div className="flex items-center justify-between text-stone-600">
                  <span className="flex items-center space-x-1.5 font-medium">
                    <Layers className="w-3.5 h-3.5 text-stone-400" />
                    <span>Extraction Method:</span>
                  </span>
                  <span className="font-mono text-stone-900">{summary.extractionMethod}</span>
                </div>

                <div className="flex items-center justify-between text-stone-600">
                  <span className="font-medium">Total Activity:</span>
                  <span className="font-mono">
                    <span className="text-emerald-700 font-semibold">+{summary.totalCredits}</span> /{' '}
                    <span className="text-rose-700 font-semibold">-{summary.totalDebits}</span>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="px-6 py-4 border-t border-stone-200 bg-stone-50 flex items-center justify-between">
          {step === 'SELECT' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-stone-300 rounded-lg text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!selectedFile || previewLoading}
                onClick={handleProceedToPreview}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all shadow-xs cursor-pointer"
              >
                {previewLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Inspecting Format...</span>
                  </>
                ) : (
                  <>
                    <span>Inspect & Preview</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </>
          )}

          {step === 'PREVIEW' && (
            <>
              <button
                type="button"
                onClick={() => setStep('SELECT')}
                className="px-4 py-2 border border-stone-300 rounded-lg text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                Back
              </button>

              <button
                type="button"
                onClick={handleExecuteIngestion}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all shadow-xs cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Execute Ingestion & Save</span>
              </button>
            </>
          )}

          {step === 'RESULT' && (
            <>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 border border-stone-300 rounded-lg text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                Upload Another File
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
