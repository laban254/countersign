import React, { useState } from 'react';
import { PaymentIntent } from '../domain/types.ts';
import { formatUSD } from '../domain/money.ts';
import { DecisionCard } from '../components/DecisionCard.tsx';
import {
  CheckSquare,
  ShieldCheck,
  Check,
  X,
  Clock,
  AlertTriangle,
  Receipt,
  AlertCircle,
} from 'lucide-react';

function formatTimeLeft(expiresAt?: string): string {
  if (!expiresAt) return 'No expiry';
  const remainingMs = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return 'Expired';
  const hours = Math.floor(remainingMs / 3_600_000);
  const minutes = Math.floor((remainingMs % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m left`;
}

function approvalReasonLabel(intent: PaymentIntent): string {
  if (intent.reasonCodes.includes('NEW_RECIPIENT_APPROVAL_REQUIRED')) {
    return 'New recipient';
  }
  if (intent.reasonCodes.includes('HUMAN_APPROVAL_REQUIRED')) {
    return 'Above threshold';
  }
  return intent.reasonCodes[0] || 'Review required';
}

interface ApprovalsViewProps {
  pendingIntents: PaymentIntent[];
  onApprove: (id: string, comment?: string) => Promise<void>;
  onReject: (id: string, comment?: string) => Promise<void>;
  onRefresh: () => void;
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({
  pendingIntents,
  onApprove,
  onReject,
  onRefresh,
}) => {
  const [selectedIntentId, setSelectedIntentId] = useState<string | null>(
    pendingIntents[0]?.id || null
  );
  const [comment, setComment] = useState('');
  const [isConfirmingApprove, setIsConfirmingApprove] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const activeIntent =
    pendingIntents.find((i) => i.id === selectedIntentId) || pendingIntents[0] || null;

  // If the selected request leaves the queue (approved elsewhere, expired,
  // rejected), tell the reviewer instead of silently swapping the detail panel.
  const [staleNotice, setStaleNotice] = useState<string | null>(null);
  const lastSeenRef = React.useRef<{ id: string; label: string } | null>(null);
  React.useEffect(() => {
    const previous = lastSeenRef.current;
    if (previous && !pendingIntents.some((i) => i.id === previous.id) && !isProcessing) {
      setStaleNotice(`${previous.label} is no longer pending (it was decided, expired or released).`);
      setIsConfirmingApprove(false);
    }
    lastSeenRef.current = activeIntent
      ? {
          id: activeIntent.id,
          label: `${formatUSD(activeIntent.amountMinor)} to ${activeIntent.recipientSnapshot.displayName}`,
        }
      : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingIntents]);

  const handleApproveConfirm = async () => {
    if (!activeIntent) return;
    setIsProcessing(true);
    try {
      await onApprove(activeIntent.id, comment);
      setIsConfirmingApprove(false);
      setComment('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!activeIntent) return;
    setIsProcessing(true);
    try {
      await onReject(activeIntent.id, comment);
      setComment('');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span>Countersign Approvals Queue</span>
            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500 text-white">
              {pendingIntents.length} pending
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            Human authorization layer: limits and thresholds enforced before money moves via PayPal
          </p>
        </div>
      </div>

      {staleNotice && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          <span>{staleNotice}</span>
          <button onClick={() => setStaleNotice(null)} className="font-semibold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {pendingIntents.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center max-w-lg mx-auto">
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3">
            <Check className="w-6 h-6 stroke-[3]" />
          </div>
          <h3 className="text-sm font-bold text-slate-900">All payment intents reviewed</h3>
          <p className="text-xs text-slate-500 mt-1">
            There are currently no agent payments awaiting human countersign.
          </p>
          <div className="mt-4">
            <span className="text-xs text-slate-400">
              Send a request above the policy's countersign threshold from the Agent Simulator to fill this queue.
            </span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left list (5 cols) */}
          <div className="lg:col-span-5 space-y-2">
            {pendingIntents.map((item) => {
              const isSelected = activeIntent?.id === item.id;
              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedIntentId(item.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedIntentId(item.id);
                    }
                  }}
                  className={`p-4 rounded-xl border cursor-pointer transition ${
                    isSelected
                      ? 'bg-white border-slate-900 shadow-sm ring-1 ring-slate-900'
                      : 'bg-white border-slate-200/90 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-base font-bold font-mono text-slate-900">
                        {formatUSD(item.amountMinor)}
                      </div>
                      <div className="text-xs font-medium text-slate-800 mt-0.5">
                        {item.recipientSnapshot.displayName}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        by {item.agentName} · {item.invoiceReference}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      {approvalReasonLabel(item)}
                    </span>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1 font-mono">
                      <Clock className="w-3 h-3" /> {formatTimeLeft(item.approval?.expiresAt)}
                    </span>
                    <span className="font-mono">{item.id}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Review Pane (7 cols) */}
          <div className="lg:col-span-7">
            {activeIntent && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-5 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-mono text-slate-400">INTENT REVIEW</div>
                    <div className="text-base font-bold text-slate-900">
                      {activeIntent.recipientSnapshot.displayName}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-mono font-bold text-slate-900">
                      {formatUSD(activeIntent.amountMinor)}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">USD</div>
                  </div>
                </div>

                <div className="p-5 space-y-5">
                  {/* DecisionCard Component */}
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                      Deterministic Checks
                    </div>
                    <DecisionCard intent={activeIntent} />
                  </div>

                  {/* Verification evidence */}
                  <div className="bg-slate-50 rounded-lg p-4 border border-slate-200/80 text-xs space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                      Immutable Evidence Snapshot
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/50">
                      <span className="text-slate-500">Recipient PayPal Email</span>
                      <span className="font-mono font-medium text-slate-800">{activeIntent.recipientSnapshot.email}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/50">
                      <span className="text-slate-500">Purpose</span>
                      <span className="text-slate-800">{activeIntent.description}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200/50">
                      <span className="text-slate-500">Snapshot Integrity Hash</span>
                      <span className="font-mono text-slate-700 flex items-center gap-1">
                        {activeIntent.approval?.snapshotHash.substring(0, 16)}...
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      </span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Budget Reservation</span>
                      <span className="font-mono text-emerald-700 font-medium">HELD ({formatUSD(activeIntent.amountMinor)})</span>
                    </div>
                  </div>

                  {/* Optional Review Comment */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Optional Reviewer Note / Audit Comment:
                    </label>
                    <input
                      type="text"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="e.g. Verified vendor invoice reference against contract"
                      className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  {/* Action Bar */}
                  <div className="pt-2 flex items-center gap-3">
                    <button
                      onClick={() => setIsConfirmingApprove(true)}
                      disabled={isProcessing}
                      className="flex-1 py-2.5 px-4 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4 stroke-[2.5]" />
                      <span>Approve & Dispatch PayPal Payout</span>
                    </button>
                    <button
                      onClick={handleReject}
                      disabled={isProcessing}
                      className="py-2.5 px-4 rounded-lg text-xs font-medium bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 border border-slate-200 transition flex items-center gap-1.5"
                    >
                      <X className="w-4 h-4" />
                      <span>Reject Request</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Dialog (§12.6.9) */}
      {isConfirmingApprove && activeIntent && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-900">
              Countersign & Authorize Payment?
            </h3>
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 text-xs space-y-1.5">
              <div className="text-lg font-mono font-bold text-slate-900">
                {formatUSD(activeIntent.amountMinor)} USD
              </div>
              <div className="text-slate-600">
                Recipient: <span className="font-semibold text-slate-800">{activeIntent.recipientSnapshot.displayName}</span> ({activeIntent.recipientSnapshot.email})
              </div>
              <div className="text-slate-500 font-mono text-[11px]">
                Agent: {activeIntent.agentName} · Policy v{activeIntent.policySnapshot.version}
              </div>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              This action submits a PayPal Sandbox Payout batch directly to the recipient's PayPal account. It cannot be reversed once processed.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setIsConfirmingApprove(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleApproveConfirm}
                disabled={isProcessing}
                className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow-xs transition"
              >
                {isProcessing ? 'Executing PayPal Payout...' : 'Confirm & Execute'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
