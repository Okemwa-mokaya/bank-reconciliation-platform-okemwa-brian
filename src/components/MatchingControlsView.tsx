import React, { useState } from 'react';
import {
  MatchingCriterion,
  MatchingControlConfig,
  MatchingRule,
  ToleranceConfig,
} from '../types';
import { api } from '../services/api';
import { Sliders, ShieldCheck, CheckSquare, Plus, Save, AlertCircle } from 'lucide-react';

interface MatchingControlsViewProps {
  criteria: MatchingCriterion[];
  controls: MatchingControlConfig | null;
  rules: MatchingRule[];
  tolerances: ToleranceConfig[];
  onRefresh: () => void;
}

export const MatchingControlsView: React.FC<MatchingControlsViewProps> = ({
  criteria,
  controls,
  rules,
  tolerances,
  onRefresh,
}) => {
  const [minTotal, setMinTotal] = useState<number>(controls?.minTotalCriteria ?? 3);
  const [minStrong, setMinStrong] = useState<number>(controls?.minStrongCriteria ?? 2);
  const [isSavingControls, setIsSavingControls] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const strongCriteria = criteria.filter((c) => c.isStrong);
  const additionalCriteria = criteria.filter((c) => !c.isStrong);

  const handleUpdateControls = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingControls(true);
    setSaveMsg(null);
    try {
      await api.updateMatchingControls({
        minTotalCriteria: minTotal,
        minStrongCriteria: minStrong,
      });
      setSaveMsg('Organization matching criteria controls updated successfully.');
      onRefresh();
    } catch (err: any) {
      setSaveMsg(`Error: ${err.message}`);
    } finally {
      setIsSavingControls(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-stone-900">Matching Criteria, Controls & Tolerances</h2>
            <p className="text-xs text-stone-500">
              Configure rule priorities, strong vs additional criterion weights, and multi-tier variance tolerances
            </p>
          </div>
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-semibold bg-stone-100 text-stone-800 border border-stone-300">
            Phase 1 Foundation: Criteria, Controls & Manual Matching Active • Auto-Engine Scheduled for Phase 3
          </span>
        </div>
      </div>

      {/* Criteria Weight & Strong Flag Directory */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-stone-900 flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-amber-500" />
            <span>Matching Criteria Directory ({criteria.length} Supported Criteria)</span>
          </h3>
          <p className="text-xs text-stone-500 mt-0.5">
            System enforces that automated matching requires meeting strong criteria combined with additional verification attributes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Strong Criteria (1-4) */}
          <div className="bg-stone-50/70 border border-stone-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                Strong Criteria (Mandatory Indicators)
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                {strongCriteria.length} Defined
              </span>
            </div>

            <div className="space-y-2">
              {strongCriteria.map((c) => (
                <div key={c.id} className="bg-white border border-stone-200 rounded p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900">{c.name}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">
                      {c.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1">{c.description}</p>
                  <div className="flex items-center space-x-2 text-[10px] text-stone-400 mt-1 font-mono">
                    <span>Bank: {c.fieldSourceBank}</span> • <span>GL: {c.fieldSourceGL}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Additional Criteria (5-9) */}
          <div className="bg-stone-50/70 border border-stone-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                Additional Criteria (Supporting Indicators)
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-200 text-stone-700">
                {additionalCriteria.length} Defined
              </span>
            </div>

            <div className="space-y-2">
              {additionalCriteria.map((c) => (
                <div key={c.id} className="bg-white border border-stone-200 rounded p-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-900">{c.name}</span>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-700">
                      {c.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-500 mt-1">{c.description}</p>
                  <div className="flex items-center space-x-2 text-[10px] text-stone-400 mt-1 font-mono">
                    <span>Bank: {c.fieldSourceBank}</span> • <span>GL: {c.fieldSourceGL}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Organization Matching Controls Configuration */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-stone-900 flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-stone-700" />
              <span>Organization Matching Control Thresholds</span>
            </h3>
            <p className="text-xs text-stone-500">
              Default policy requires at least 3 total criteria and at least 2 strong criteria.
            </p>
          </div>
        </div>

        {saveMsg && (
          <div className="mb-4 text-xs p-3 rounded bg-stone-50 border border-stone-200 text-stone-800">
            {saveMsg}
          </div>
        )}

        <form onSubmit={handleUpdateControls} className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <label className="block text-stone-600 font-medium mb-1">
              Minimum Total Criteria Required
            </label>
            <input
              type="number"
              min={1}
              max={9}
              value={minTotal}
              onChange={(e) => setMinTotal(parseInt(e.target.value) || 1)}
              className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-stone-800 font-mono"
            />
            <p className="text-[10px] text-stone-400 mt-1">Default: 3 total criteria</p>
          </div>

          <div>
            <label className="block text-stone-600 font-medium mb-1">
              Minimum Strong Criteria Required
            </label>
            <input
              type="number"
              min={1}
              max={4}
              value={minStrong}
              onChange={(e) => setMinStrong(parseInt(e.target.value) || 1)}
              className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-stone-800 font-mono"
            />
            <p className="text-[10px] text-stone-400 mt-1">Default: 2 strong criteria</p>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={isSavingControls}
              className="flex items-center space-x-1.5 bg-stone-900 text-white px-4 py-2 rounded text-xs font-semibold hover:bg-stone-800 transition-colors"
            >
              <Save className="w-3.5 h-3.5 text-amber-400" />
              <span>{isSavingControls ? 'Saving...' : 'Update Controls'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Matching Rules List */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs space-y-3">
        <h3 className="text-sm font-bold text-stone-900">Active Matching Rules</h3>
        <div className="divide-y divide-stone-100">
          {rules.map((rule) => (
            <div key={rule.id} className="py-3 text-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-800">
                    Priority {rule.priority}
                  </span>
                  <span className="font-bold text-stone-900 text-sm">{rule.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      rule.isActive
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-stone-100 text-stone-500'
                    }`}
                  >
                    {rule.isActive ? 'Active' : 'Disabled'}
                  </span>
                </div>
                {rule.description && <p className="text-stone-500 text-xs mt-1">{rule.description}</p>}
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[11px] text-stone-400 font-medium">Required:</span>
                  {rule.requiredCriteria.map((c) => (
                    <span
                      key={c}
                      className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 text-[10px] font-mono border border-amber-200 font-semibold"
                    >
                      {c}
                    </span>
                  ))}
                  {rule.optionalCriteria.length > 0 && (
                    <>
                      <span className="text-[11px] text-stone-400 font-medium ml-2">Optional:</span>
                      {rule.optionalCriteria.map((c) => (
                        <span
                          key={c}
                          className="px-2 py-0.5 rounded bg-stone-100 text-stone-700 text-[10px] font-mono border border-stone-200"
                        >
                          {c}
                        </span>
                      ))}
                    </>
                  )}
                </div>
              </div>

              <div className="text-right text-stone-500 text-xs shrink-0 font-mono">
                <div>Min Total: <span className="font-bold text-stone-800">{rule.minTotalCriteria}</span></div>
                <div>Min Strong: <span className="font-bold text-stone-800">{rule.minStrongCriteria}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tolerances Matrix */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs space-y-3">
        <h3 className="text-sm font-bold text-stone-900">Tolerances Configuration</h3>
        <p className="text-xs text-stone-500">
          Amount tolerances (fixed / percent) and date tolerance windows configured at Organization, Bank Account, or Rule scope.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {tolerances.map((tol) => (
            <div key={tol.id} className="bg-stone-50 border border-stone-200 rounded-lg p-4 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-200 text-stone-800 uppercase">
                  Level: {tol.level}
                </span>
                <span className="font-semibold text-stone-600">
                  {tol.bankAccount ? tol.bankAccount.accountName : 'All Accounts'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div>
                  <span className="text-stone-500">Amount Tolerance:</span>
                  <p className="font-mono font-bold text-stone-900">
                    {tol.amountToleranceType === 'FIXED'
                      ? `$${tol.amountToleranceValue.toFixed(2)}`
                      : `${tol.amountToleranceValue}%`}
                  </p>
                </div>
                <div>
                  <span className="text-stone-500">Date Tolerance:</span>
                  <p className="font-mono font-bold text-stone-900">
                    {tol.isDateToleranceAllowed ? `±${tol.dateToleranceDays} days` : 'Exact date required'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
