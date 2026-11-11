import React, { useState } from 'react';
import { apiFetch, notify, responseError } from '../lib/api.ts';
import { Recipient } from '../domain/types.ts';
import { Users, Plus, ShieldCheck, ShieldAlert, Check, X, Search, Filter } from 'lucide-react';

interface RecipientsViewProps {
  recipients: Recipient[];
  onRefresh: () => void;
}

export const RecipientsView: React.FC<RecipientsViewProps> = ({ recipients, onRefresh }) => {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');

  const [statusFilter, setStatusFilter] = useState<'ALL' | 'APPROVED' | 'BLOCKED'>('ALL');
  const [search, setSearch] = useState('');

  const filteredRecipients = recipients.filter((r) => {
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return r.displayName.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
    }
    return true;
  });

  const handleAddRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName || !email) return;

    try {
      const res = await apiFetch('/api/v1/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, email, status: 'APPROVED' }),
      });
      if (!res.ok) {
        notify(await responseError(res, 'Could not add the recipient'), 'error');
        return;
      }
      setIsAddOpen(false);
      setDisplayName('');
      setEmail('');
      notify('Recipient approved');
      onRefresh();
    } catch {
      notify('Could not reach the server', 'error');
    }
  };

  const handleToggleStatus = async (recipient: Recipient) => {
    const nextStatus = recipient.status === 'APPROVED' ? 'BLOCKED' : 'APPROVED';
    try {
      const res = await apiFetch(`/api/v1/recipients/${recipient.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        notify(await responseError(res, 'Could not update the recipient'), 'error');
        return;
      }
      notify(nextStatus === 'BLOCKED' ? `${recipient.displayName} blocked` : `${recipient.displayName} approved`);
      onRefresh();
    } catch {
      notify('Could not reach the server', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Approved Recipients Allowlist</h2>
          <p className="text-xs text-slate-500">
            Workspace-scoped vendor and service disbursement addresses verified for payment execution
          </p>
        </div>
        <button
          onClick={() => setIsAddOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Approved Recipient</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs">
          {(['ALL', 'APPROVED', 'BLOCKED'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1 rounded-md font-medium transition ${
                statusFilter === tab
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab === 'ALL' && 'All Recipients'}
              {tab === 'APPROVED' && 'Approved Only'}
              {tab === 'BLOCKED' && 'Blocked Only'}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendor or email..."
            className="pl-8 pr-3 py-1 text-xs border border-slate-300 rounded-md w-full sm:w-64 focus:ring-1 focus:ring-blue-500 font-mono"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-4">Display Name</th>
                <th className="py-2.5 px-4">PayPal Receiver Email</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Date Added</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredRecipients.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No recipients match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredRecipients.map((rec) => {
                  const isApproved = rec.status === 'APPROVED';
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition">
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {rec.displayName}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700">
                        {rec.email}
                      </td>
                    <td className="py-3 px-4">
                      {isApproved ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <Check className="w-3 h-3" /> Approved
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          <X className="w-3 h-3" /> Blocked
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {new Date(rec.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleToggleStatus(rec)}
                        className={`text-xs px-2.5 py-1 rounded font-medium border transition ${
                          isApproved
                            ? 'text-rose-600 border-rose-200 hover:bg-rose-50'
                            : 'text-emerald-700 border-emerald-200 hover:bg-emerald-50'
                        }`}
                      >
                        {isApproved ? 'Block Recipient' : 'Approve Recipient'}
                      </button>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Recipient Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Add Approved Recipient</h3>
            <p className="text-xs text-slate-500">
              New recipients are workspace-scoped and eligible for payments subject to each active policy's limit rules.
            </p>

            <form onSubmit={handleAddRecipient} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Recipient Name / Vendor
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Supabase Inc."
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  PayPal Account Email
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vendor-billing@domain.test"
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-500 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded"
                >
                  Add to Allowlist
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
