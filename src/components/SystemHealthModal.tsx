import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Database, CheckCircle2, AlertTriangle, RefreshCw, X, Server, Layers, Cpu } from 'lucide-react';

interface SystemHealthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReseedCompleted: () => void;
}

export const SystemHealthModal: React.FC<SystemHealthModalProps> = ({
  isOpen,
  onClose,
  onReseedCompleted,
}) => {
  const [health, setHealth] = useState<any>(null);
  const [schema, setSchema] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReseeding, setIsReseeding] = useState(false);
  const [reseedMsg, setReseedMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadInfo();
    }
  }, [isOpen]);

  const loadInfo = async () => {
    setIsLoading(true);
    try {
      const [h, s] = await Promise.all([api.getSystemHealth(), api.getSchemaInfo()]);
      setHealth(h);
      setSchema(s);
    } catch (err) {
      console.error('Error fetching system info:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReseed = async () => {
    if (!confirm('Re-seed the foundation database with reference entities?')) return;
    setIsReseeding(true);
    setReseedMsg(null);
    try {
      const res = await api.reseedDatabase();
      setReseedMsg(res.message);
      await loadInfo();
      onReseedCompleted();
    } catch (err: any) {
      setReseedMsg(`Error: ${err.message}`);
    } finally {
      setIsReseeding(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/60 backdrop-blur-xs p-4">
      <div className="bg-white border border-stone-300 rounded-xl shadow-xl max-w-2xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-stone-800" />
            <h3 className="font-serif font-bold text-lg text-stone-900">
              System Health & Schema Introspection
            </h3>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-xs text-stone-500">Inspecting database schema...</div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Health & Architecture Overview */}
            <div className="bg-stone-50 border border-stone-200 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-stone-800">Database Engine Status:</span>
                <span className="inline-flex items-center space-x-1 font-bold text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{health?.status || 'HEALTHY'}</span>
                </span>
              </div>
              <div className="text-stone-600 space-y-1 pt-1 border-t border-stone-200/60">
                <div>
                  • Multi-Tenancy:{' '}
                  <span className="font-medium text-stone-800">{health?.architecture?.tenancy}</span>
                </div>
                <div>
                  • Access Control:{' '}
                  <span className="font-medium text-stone-800">{health?.architecture?.rbac}</span>
                </div>
                <div>
                  • Matching Topology:{' '}
                  <span className="font-medium text-stone-800">{health?.architecture?.matchingTopology}</span>
                </div>
                <div>
                  • Criteria Control:{' '}
                  <span className="font-medium text-stone-800">{health?.architecture?.criteriaControl}</span>
                </div>
                <div>
                  • Audit Integrity:{' '}
                  <span className="font-medium text-stone-800">{health?.architecture?.auditTrail}</span>
                </div>
              </div>
            </div>

            {/* Entity Record Statistics */}
            {schema?.entities && (
              <div>
                <h4 className="font-bold text-stone-900 mb-2 uppercase tracking-wider text-[10px] text-stone-500">
                  Database Table Row Counts
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 font-mono">
                  {Object.entries(schema.entities).map(([key, val]: [string, any]) => (
                    <div
                      key={key}
                      className="bg-stone-50 border border-stone-200 rounded p-2 flex justify-between items-center"
                    >
                      <span className="text-stone-600 text-[11px] truncate">{key}:</span>
                      <span className="font-bold text-stone-900">{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Re-seed action */}
            {reseedMsg && (
              <div className="p-2.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-xs">
                {reseedMsg}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-stone-100">
              <button
                onClick={handleReseed}
                disabled={isReseeding}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded bg-stone-100 hover:bg-stone-200 text-stone-800 font-semibold"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isReseeding ? 'animate-spin' : ''}`} />
                <span>{isReseeding ? 'Resetting...' : 'Re-seed Foundation Data'}</span>
              </button>

              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded bg-stone-900 text-white font-semibold hover:bg-stone-800"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
