import React, { useState } from 'react';
import { apiFetch } from '../lib/api.ts';
import { X, Sparkles, Check, ArrowRight, ArrowLeft, ShieldCheck, AlertCircle } from 'lucide-react';
import { Policy, PolicyVersion } from '../domain/types.ts';
import { formatUSD, toMinor, toMajor } from '../domain/money.ts';
import { DecisionCard } from './DecisionCard.tsx';

interface PolicyBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  activePolicy: Policy | null;
  /** When set, the builder opens at the review step pre-filled from this version. */
  seedVersion?: PolicyVersion | null;
  onVersionCreatedAndActivated: () => void;
}

export const PolicyBuilderModal: React.FC<PolicyBuilderModalProps> = ({
  isOpen,
  onClose,
  activePolicy,
  seedVersion = null,
  onVersionCreatedAndActivated,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [nlText, setNlText] = useState(
    'Allow the operations agent to pay approved software vendors up to $100 per transaction, $120 per day, and $300 per month. Require my approval for anything above $40. Do not allow new recipients.'
  );
  const [isParsing, setIsParsing] = useState(false);

  // Parsed fields
  const [maxTxnMajor, setMaxTxnMajor] = useState(100);
  const [dailyLimitMajor, setDailyLimitMajor] = useState(120);
  const [monthlyLimitMajor, setMonthlyLimitMajor] = useState(300);
  const [approvalMode, setApprovalMode] = useState<'NEVER' | 'ABOVE_THRESHOLD' | 'ALWAYS'>('ABOVE_THRESHOLD');
  const [thresholdMajor, setThresholdMajor] = useState(40);
  const [allowNewRecipients, setAllowNewRecipients] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [rationale, setRationale] = useState('');
  const [isAiGenerated, setIsAiGenerated] = useState(false);
  // True while the parameters come from editing an existing version rather than a drafted description.
  const [isManualEdit, setIsManualEdit] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const activeVersion = activePolicy?.versions?.find((v) => v.id === activePolicy.activeVersionId);

  // Start from the current policy (or the version being edited), not hard-coded defaults.
  React.useEffect(() => {
    if (!isOpen) return;
    const base = seedVersion ?? activeVersion;
    if (base) {
      setMaxTxnMajor(base.maxTransactionMinor / 100);
      setDailyLimitMajor(base.dailyLimitMinor / 100);
      setMonthlyLimitMajor(base.monthlyLimitMinor / 100);
      setApprovalMode(base.approvalMode);
      setThresholdMajor((base.approvalThresholdMinor ?? 4000) / 100);
      setAllowNewRecipients(base.allowNewRecipients);
      setCurrency(base.currencyAllowlist[0] ?? 'USD');
    }
    setRationale(seedVersion ? `Edited from v${seedVersion.version}` : '');
    setIsAiGenerated(false);
    setIsManualEdit(seedVersion !== null);
    setActivateError(null);
    setParseError(null);
    setStep(seedVersion ? 2 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, seedVersion?.id]);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleParseNl = async () => {
    setIsParsing(true);
    setParseError(null);
    try {
      const res = await apiFetch('/api/v1/ai/policy-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: nlText }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Policy parsing failed');
      }
      setMaxTxnMajor(toMajor(data.maxTransactionMinor));
      setDailyLimitMajor(toMajor(data.dailyLimitMinor));
      setMonthlyLimitMajor(toMajor(data.monthlyLimitMinor));
      setApprovalMode(data.approvalMode);
      setThresholdMajor(data.approvalThresholdMinor ? toMajor(data.approvalThresholdMinor) : 0);
      setAllowNewRecipients(data.allowNewRecipients);
      setRationale(data.rationale);
      setIsAiGenerated(data.isAiGenerated);
      setIsManualEdit(false);
      setStep(2);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Policy parsing failed');
    } finally {
      setIsParsing(false);
    }
  };

  const handleActivate = async () => {
    if (!activePolicy) return;
    setActivateError(null);

    try {
      // 1. Create version
      const resVersion = await apiFetch(`/api/v1/policies/${activePolicy.id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxTransactionMinor: toMinor(maxTxnMajor),
          dailyLimitMinor: toMinor(dailyLimitMajor),
          monthlyLimitMinor: toMinor(monthlyLimitMajor),
          approvalMode,
          approvalThresholdMinor: approvalMode === 'ABOVE_THRESHOLD' ? toMinor(thresholdMajor) : null,
          allowNewRecipients,
          currencyAllowlist: [currency],
          changeNote: isManualEdit
            ? `Manual edit via Policy Builder: ${rationale || 'Adjusted limits and threshold'}`
            : `Generated via Policy Builder: ${rationale || 'Adjusted limits and threshold'}`,
        }),
      });

      const newVer = await resVersion.json();
      if (!resVersion.ok) {
        throw new Error(newVer.error || 'Policy version validation failed');
      }

      // 2. Activate version
      const resActivate = await apiFetch(
        `/api/v1/policies/${activePolicy.id}/versions/${newVer.id}/activate`,
        { method: 'POST' }
      );
      const activateData = await resActivate.json();
      if (!resActivate.ok) {
        throw new Error(activateData.error || 'Policy activation failed');
      }

      onVersionCreatedAndActivated();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('Failed to create/activate policy version:', err);
      setActivateError(message);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Policy builder" className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-2xl w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <div className="text-xs font-mono text-blue-600 font-semibold uppercase tracking-wider">
              Policy Builder · Step {step} of 3
            </div>
            <div className="text-base font-bold text-slate-900">
              {step === 1 && 'Describe Financial Policy'}
              {step === 2 && 'Review Structured Controls'}
              {step === 3 && 'Human Countersign & Activation'}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <label className="block text-xs font-medium text-slate-700">
                Describe the spending limits, caps, and human countersign thresholds in natural language:
              </label>
              <textarea
                rows={4}
                value={nlText}
                onChange={(e) => setNlText(e.target.value)}
                className="w-full p-3 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                placeholder="e.g. Allow the agent to pay up to $100 per transaction, with a $120 daily cap and human approval required above $40..."
              />

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Try template:</span>
                <button
                  type="button"
                  onClick={() =>
                    setNlText(
                      'Allow the operations agent to pay approved software vendors up to $100 per transaction, $120 per day, and $300 per month. Require my approval for anything above $40. Do not allow new recipients.'
                    )
                  }
                  className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                >
                  Golden Demo Rules
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setNlText(
                      'Conservative vendor policy: $25 max per transaction, $50 daily cap, $150 monthly cap. Always require human approval for all payments.'
                    )
                  }
                  className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
                >
                  Conservative ($25/always)
                </button>
              </div>

              {parseError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                  {parseError}
                </div>
              )}
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-6">
              {rationale && !isManualEdit && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-900 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">AI Extraction:</span> {rationale}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Form controls */}
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between items-center text-xs font-medium text-slate-700 mb-1">
                      <span>Per-Transaction Limit</span>
                      {!isManualEdit && (
                        <span className="text-[10px] font-mono text-purple-600 bg-purple-50 px-1 py-0.2 rounded">
                          AI PARSED
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs text-slate-400">$</span>
                      <input
                        type="number"
                        value={maxTxnMajor}
                        onChange={(e) => setMaxTxnMajor(parseFloat(e.target.value) || 0)}
                        className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-300 rounded font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center text-xs font-medium text-slate-700 mb-1">
                      <span>Daily Limit</span>
                      {!isManualEdit && (
                        <span className="text-[10px] font-mono text-purple-600 bg-purple-50 px-1 py-0.2 rounded">
                          AI PARSED
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs text-slate-400">$</span>
                      <input
                        type="number"
                        value={dailyLimitMajor}
                        onChange={(e) => setDailyLimitMajor(parseFloat(e.target.value) || 0)}
                        className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-300 rounded font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center text-xs font-medium text-slate-700 mb-1">
                      <span>Monthly Limit</span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-xs text-slate-400">$</span>
                      <input
                        type="number"
                        value={monthlyLimitMajor}
                        onChange={(e) => setMonthlyLimitMajor(parseFloat(e.target.value) || 0)}
                        className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-300 rounded font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="text-xs font-medium text-slate-700 mb-1">Approval Mode</div>
                    <select
                      value={approvalMode}
                      onChange={(e) => setApprovalMode(e.target.value as any)}
                      className="w-full p-1.5 text-xs border border-slate-300 rounded bg-white"
                    >
                      <option value="ABOVE_THRESHOLD">Above Threshold</option>
                      <option value="ALWAYS">Always Require Approval</option>
                      <option value="NEVER">Never Require Approval</option>
                    </select>
                  </div>

                  {approvalMode === 'ABOVE_THRESHOLD' && (
                    <div>
                      <div className="text-xs font-medium text-slate-700 mb-1">Countersign Threshold</div>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-xs text-slate-400">$</span>
                        <input
                          type="number"
                          value={thresholdMajor}
                          onChange={(e) => setThresholdMajor(parseFloat(e.target.value) || 0)}
                          className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-300 rounded font-mono"
                        />
                      </div>
                    </div>
                  )}

                  <div className="pt-1">
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowNewRecipients}
                        onChange={(e) => setAllowNewRecipients(e.target.checked)}
                        className="rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>Allow payments to new recipients (forces approval)</span>
                    </label>
                  </div>
                </div>

                {/* Live Preview vs Active */}
                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Diff vs Active Version (v{activeVersion?.version || 3})
                  </div>
                  <div className="space-y-1.5 text-xs font-mono">
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-500">Max / Txn</span>
                      <span>{formatUSD(activeVersion?.maxTransactionMinor || 10000)} → {formatUSD(toMinor(maxTxnMajor))}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-500">Daily Cap</span>
                      <span>{formatUSD(activeVersion?.dailyLimitMinor || 12000)} → {formatUSD(toMinor(dailyLimitMajor))}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/60">
                      <span className="text-slate-500">Threshold</span>
                      <span>{formatUSD(activeVersion?.approvalThresholdMinor || 4000)} → {formatUSD(toMinor(thresholdMajor))}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Human Authority Guarantee</div>
                  <div className="mt-0.5">
                    {isManualEdit
                      ? 'You set these policy parameters. '
                      : 'The AI proposed these policy parameters based on your prompt. '}
                    Activating this immutable policy version is an explicit human operational action.
                  </div>
                </div>
              </div>

              {activateError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                  {activateError}
                </div>
              )}

              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Per-Transaction Hard Cap:</span>
                  <span className="font-mono font-bold text-slate-900">{formatUSD(toMinor(maxTxnMajor))}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Daily Spending Limit:</span>
                  <span className="font-mono font-bold text-slate-900">{formatUSD(toMinor(dailyLimitMajor))}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Monthly Spending Limit:</span>
                  <span className="font-mono font-bold text-slate-900">{formatUSD(toMinor(monthlyLimitMajor))}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Approval Requirement:</span>
                  <span className="font-medium text-slate-900">
                    {approvalMode === 'ABOVE_THRESHOLD'
                      ? `Above ${formatUSD(toMinor(thresholdMajor))}`
                      : approvalMode}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">New Recipients Allowed:</span>
                  <span className="font-medium text-slate-900">{allowNewRecipients ? 'Yes (requires countersign)' : 'No'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          {step > 1 ? (
            <button
              onClick={() => setStep((s) => (s - 1) as any)}
              className="px-3 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-200 transition flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
          ) : (
            <div></div>
          )}

          {step === 1 && (
            <button
              onClick={handleParseNl}
              disabled={nlText.length < 15 || isParsing}
              className="px-4 py-2 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white transition flex items-center gap-1.5 shadow-xs"
            >
              {isParsing ? (
                <>Extracting Policy Structure...</>
              ) : (
                <>
                  Parse Structured Policy <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          )}

          {step === 2 && (
            <button
              onClick={() => setStep(3)}
              className="px-4 py-2 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition flex items-center gap-1.5 shadow-xs"
            >
              Review & Proceed <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {step === 3 && (
            <button
              onClick={handleActivate}
              className="px-4 py-2 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 shadow-xs"
            >
              <Check className="w-4 h-4" /> Activate New Version
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
