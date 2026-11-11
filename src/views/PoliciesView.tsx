import React from 'react';
import { apiFetch, notify, responseError } from '../lib/api.ts';
import { Policy, PolicyVersion } from '../domain/types.ts';
import { formatUSD } from '../domain/money.ts';
import { Sparkles, CheckCircle, Pencil } from 'lucide-react';

interface PoliciesViewProps {
  policies: Policy[];
  /** Open the builder; pass a version to start from its values (an edit creates a new version). */
  onOpenPolicyBuilder: (seed?: PolicyVersion | null) => void;
  onRefresh: () => void;
}

export const PoliciesView: React.FC<PoliciesViewProps> = ({
  policies,
  onOpenPolicyBuilder,
  onRefresh,
}) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Spending Policies & Versions</h2>
          <p className="text-xs text-slate-500">
            Immutable policy versions governing transaction caps, daily limits, and countersign thresholds
          </p>
        </div>
        <button
          onClick={() => onOpenPolicyBuilder(null)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition"
        >
          <Sparkles className="w-3.5 h-3.5 text-purple-200" />
          <span>New Policy Version (AI Assisted)</span>
        </button>
      </div>

      <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        Versions are immutable so every change stays auditable. To change a limit, use{' '}
        <strong className="text-slate-700">Edit</strong>: it creates a new version starting from that version's
        values, and you review and activate the result. Agents move to the new version when it is activated.
      </p>

      <div className="space-y-6">
        {policies.map((policy) => {
          return (
            <div
              key={policy.id}
              className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden"
            >
              <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900">{policy.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{policy.description}</p>
                </div>
                <div className="text-xs font-mono text-slate-400">
                  {policy.versions.length} versions recorded
                </div>
              </div>

              {/* Versions List */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/40 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                      <th className="py-2.5 px-4">Version</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Max / Txn</th>
                      <th className="py-2.5 px-4 text-right">Daily Limit</th>
                      <th className="py-2.5 px-4 text-right">Monthly Limit</th>
                      <th className="py-2.5 px-4">Approval Mode</th>
                      <th className="py-2.5 px-4">New Recipients</th>
                      <th className="py-2.5 px-4">Change Note</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-sans">
                    {policy.versions.map((ver) => {
                      const isActive = ver.id === policy.activeVersionId;
                      return (
                        <tr
                          key={ver.id}
                          className={`hover:bg-slate-50/80 transition ${
                            isActive ? 'bg-blue-50/30 font-medium' : ''
                          }`}
                        >
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            v{ver.version}
                          </td>
                          <td className="py-3 px-4">
                            {isActive ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                <CheckCircle className="w-3 h-3" /> ACTIVE
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400 font-mono">
                                {ver.status}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-semibold text-slate-900">
                            {formatUSD(ver.maxTransactionMinor)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-800">
                            {formatUSD(ver.dailyLimitMinor)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-slate-800">
                            {formatUSD(ver.monthlyLimitMinor)}
                          </td>
                          <td className="py-3 px-4">
                            {ver.approvalMode === 'ABOVE_THRESHOLD' && (
                              <span className="text-amber-800 font-mono">
                                Above {formatUSD(ver.approvalThresholdMinor || 0)}
                              </span>
                            )}
                            {ver.approvalMode === 'ALWAYS' && (
                              <span className="text-amber-800 font-mono">Always Required</span>
                            )}
                            {ver.approvalMode === 'NEVER' && (
                              <span className="text-slate-600 font-mono">None</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {ver.allowNewRecipients ? 'Allowed (countersign)' : 'Strict allowlist only'}
                          </td>
                          <td className="py-3 px-4 text-slate-500 text-[11px]">
                            {ver.changeNote || '—'}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-3">
                              <button
                                onClick={() => onOpenPolicyBuilder(ver)}
                                title="Create a new version starting from this one's values"
                                className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-slate-600 hover:text-slate-900 font-medium hover:underline"
                              >
                                <Pencil className="w-3 h-3" /> Edit
                              </button>
                              {!isActive ? (
                                <button
                                  onClick={async () => {
                                    try {
                                      const res = await apiFetch(
                                        `/api/v1/policies/${policy.id}/versions/${ver.id}/activate`,
                                        { method: 'POST' }
                                      );
                                      if (!res.ok) {
                                        notify(await responseError(res, 'Activation failed'), 'error');
                                        return;
                                      }
                                      notify(`Policy v${ver.version} activated`);
                                      onRefresh();
                                    } catch {
                                      notify('Could not reach the server', 'error');
                                    }
                                  }}
                                  className="whitespace-nowrap text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline"
                                >
                                  Activate v{ver.version}
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400 font-mono">Current</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
