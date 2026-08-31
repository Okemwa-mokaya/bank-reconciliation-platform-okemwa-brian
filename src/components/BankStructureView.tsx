import React, { useState } from 'react';
import { Building2, Plus, CheckCircle2, XCircle, CreditCard, Globe, Landmark } from 'lucide-react';
import { Bank, BankAccount } from '../types';
import { api } from '../services/api';

interface BankStructureViewProps {
  banks: Bank[];
  accounts: BankAccount[];
  onRefresh: () => void;
  orgCurrency: string;
}

export const BankStructureView: React.FC<BankStructureViewProps> = ({
  banks,
  accounts,
  onRefresh,
  orgCurrency,
}) => {
  const [showAddBank, setShowAddBank] = useState(false);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Bank Form State
  const [bankName, setBankName] = useState('');
  const [bankCountry, setBankCountry] = useState('US');
  const [swiftBic, setSwiftBic] = useState('');
  const [routingNumber, setRoutingNumber] = useState('');

  // Account Form State
  const [selectedBankId, setSelectedBankId] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [accountType, setAccountType] = useState('OPERATING');
  const [openingBalance, setOpeningBalance] = useState('0');
  const [glAccountCode, setGlAccountCode] = useState('');

  const handleCreateBank = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await api.createBank({
        name: bankName,
        country: bankCountry,
        swiftBic: swiftBic || undefined,
        routingNumber: routingNumber || undefined,
      });
      setSuccessMsg(`Bank "${bankName}" registered successfully.`);
      setShowAddBank(false);
      setBankName('');
      setSwiftBic('');
      setRoutingNumber('');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create bank');
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await api.createBankAccount({
        bankId: selectedBankId,
        accountName,
        accountNumber,
        currency,
        accountType,
        openingBalance: parseFloat(openingBalance) || 0,
        glAccountCode: glAccountCode || undefined,
      });
      setSuccessMsg(`Account "${accountName}" registered successfully.`);
      setShowAddAccount(false);
      setAccountName('');
      setAccountNumber('');
      setOpeningBalance('0');
      setGlAccountCode('');
      onRefresh();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create account');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-stone-900">Banking Structure & Accounts</h2>
          <p className="text-xs text-stone-500">
            Multi-currency institutional bank entities and mapped general ledger cash accounts
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={() => {
              setShowAddBank(true);
              setShowAddAccount(false);
            }}
            className="flex items-center space-x-1.5 bg-white border border-stone-300 text-stone-700 px-3 py-2 rounded-lg text-xs font-semibold hover:bg-stone-50 transition-colors"
          >
            <Building2 className="w-4 h-4 text-stone-500" />
            <span>Add Bank</span>
          </button>

          <button
            onClick={() => {
              if (banks.length > 0) setSelectedBankId(banks[0].id);
              setShowAddAccount(true);
              setShowAddBank(false);
            }}
            className="flex items-center space-x-1.5 bg-stone-900 text-white px-3.5 py-2 rounded-lg text-xs font-semibold hover:bg-stone-800 transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>Add Bank Account</span>
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3 rounded-lg flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-bold text-rose-900">
            ✕
          </button>
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-lg flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="font-bold text-emerald-900">
            ✕
          </button>
        </div>
      )}

      {/* Add Bank Form Modal/Drawer */}
      {showAddBank && (
        <div className="bg-stone-50 border border-stone-300 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-stone-900">Register Institutional Bank</h3>
            <button onClick={() => setShowAddBank(false)} className="text-xs text-stone-500 hover:text-stone-800">
              Cancel
            </button>
          </div>
          <form onSubmit={handleCreateBank} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-stone-600 font-medium mb-1">Bank Legal Name *</label>
              <input
                type="text"
                required
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g. JPMorgan Chase"
                className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-stone-800"
              />
            </div>
            <div>
              <label className="block text-stone-600 font-medium mb-1">Country (ISO-2) *</label>
              <input
                type="text"
                required
                maxLength={2}
                value={bankCountry}
                onChange={(e) => setBankCountry(e.target.value.toUpperCase())}
                className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-stone-800"
              />
            </div>
            <div>
              <label className="block text-stone-600 font-medium mb-1">SWIFT / BIC</label>
              <input
                type="text"
                value={swiftBic}
                onChange={(e) => setSwiftBic(e.target.value.toUpperCase())}
                placeholder="CHASUS33"
                className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-stone-800"
              />
            </div>
            <div>
              <label className="block text-stone-600 font-medium mb-1">Routing Number</label>
              <input
                type="text"
                value={routingNumber}
                onChange={(e) => setRoutingNumber(e.target.value)}
                placeholder="021000021"
                className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-stone-800"
              />
            </div>
            <div className="sm:col-span-2 md:col-span-4 flex justify-end">
              <button
                type="submit"
                className="bg-stone-900 text-white px-4 py-2 rounded text-xs font-semibold hover:bg-stone-800"
              >
                Save Bank
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Add Bank Account Form Modal/Drawer */}
      {showAddAccount && (
        <div className="bg-stone-50 border border-stone-300 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-stone-900">Register Bank Account</h3>
            <button onClick={() => setShowAddAccount(false)} className="text-xs text-stone-500 hover:text-stone-800">
              Cancel
            </button>
          </div>
          <form onSubmit={handleCreateAccount} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-stone-600 font-medium mb-1">Select Bank *</label>
              <select
                required
                value={selectedBankId}
                onChange={(e) => setSelectedBankId(e.target.value)}
                className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-stone-800"
              >
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.country})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-stone-600 font-medium mb-1">Account Display Name *</label>
              <input
                type="text"
                required
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Operating Checking Account"
                className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-stone-800"
              />
            </div>
            <div>
              <label className="block text-stone-600 font-medium mb-1">Account Number *</label>
              <input
                type="text"
                required
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="CHASE-OP-8921"
                className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-stone-800 font-mono"
              />
            </div>
            <div>
              <label className="block text-stone-600 font-medium mb-1">Currency *</label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-stone-800"
              >
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="JPY">JPY - Japanese Yen</option>
                <option value="CAD">CAD - Canadian Dollar</option>
              </select>
            </div>
            <div>
              <label className="block text-stone-600 font-medium mb-1">Account Type *</label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-stone-800"
              >
                <option value="OPERATING">OPERATING</option>
                <option value="PAYROLL">PAYROLL</option>
                <option value="SAVINGS">SAVINGS</option>
                <option value="ESCROW">ESCROW</option>
                <option value="COLLECTION">COLLECTION</option>
                <option value="INVESTMENT">INVESTMENT</option>
              </select>
            </div>
            <div>
              <label className="block text-stone-600 font-medium mb-1">Opening Balance</label>
              <input
                type="number"
                step="0.01"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
                className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-stone-800 font-mono"
              />
            </div>
            <div>
              <label className="block text-stone-600 font-medium mb-1">GL Account Mapping Code</label>
              <input
                type="text"
                value={glAccountCode}
                onChange={(e) => setGlAccountCode(e.target.value)}
                placeholder="1010-CHASE-OP"
                className="w-full bg-white border border-stone-300 rounded px-2.5 py-1.5 focus:outline-none focus:border-stone-800 font-mono"
              />
            </div>
            <div className="sm:col-span-2 md:col-span-3 flex justify-end">
              <button
                type="submit"
                className="bg-stone-900 text-white px-4 py-2 rounded text-xs font-semibold hover:bg-stone-800"
              >
                Save Account
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Bank Accounts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {accounts.map((acc) => (
          <div key={acc.id} className="bg-white border border-stone-200 rounded-xl p-5 shadow-2xs hover:border-stone-300 transition-colors">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                  {acc.accountType}
                </span>
                <h3 className="text-base font-bold text-stone-900 mt-2">{acc.accountName}</h3>
                <p className="text-xs text-stone-500">{acc.bank?.name}</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center text-stone-700">
                <Landmark className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-stone-100 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-stone-500">Account Number:</span>
                <span className="font-mono font-semibold text-stone-900">{acc.accountNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">GL Mapping:</span>
                <span className="font-mono text-stone-700">{acc.glAccountCode || 'Unmapped'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Currency:</span>
                <span className="font-bold text-stone-800">{acc.currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Opening Balance:</span>
                <span className="font-mono font-bold text-stone-900">
                  {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: acc.currency,
                  }).format(acc.openingBalance)}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] text-stone-500">
              <span>
                Statements: <span className="font-semibold text-stone-800">{acc._count?.statements || 0}</span>
              </span>
              <span>
                Bank Tx: <span className="font-semibold text-stone-800">{acc._count?.bankTransactions || 0}</span>
              </span>
              <span className="flex items-center text-emerald-700">
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Active
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
