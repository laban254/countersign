import React, { useState } from 'react';
import { PaymentIntent, LedgerEvent } from '../domain/types.ts';
import { formatUSD } from '../domain/money.ts';
import { DecisionCard } from './DecisionCard.tsx';
import {
  X,
  Copy,
  Check,
  ShieldCheck,
  ExternalLink,
  Clock,
  ArrowRight,
} from 'lucide-react';

interface PaymentDrawerProps {
  intent: PaymentIntent | null;
  onClose: () => void;
  ledgerEvents: LedgerEvent[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onReconcile?: (id: string) => Promise<void>;
}

export const PaymentDrawer: React.FC<PaymentDrawerProps> = ({
  intent,
  onClose,
  ledgerEvents,
  onApprove,
  onReject,
  onReconcile,
}) => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!intent) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const relatedEvents = ledgerEvents.filter((e) => e.paymentIntentId === intent.id);

  return (
    <div role="dialog" aria-modal="true" aria-label="Payment details" className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
      />

      {/* Slide-over panel */}
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-white shadow-2xl border-l border-slate-200 flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div>
              <div className="text-xs font-mono text-slate-500">PAYMENT INTENT</div>
              <div className="text-sm font-bold font-mono text-slate-900 flex items-center gap-2">
                <span>{intent.id}</span>
                <button
                  onClick={() => handleCopy(intent.id, 'id')}
                  className="text-slate-400 hover:text-slate-600"
                >
                  {copiedKey === 'id' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Top Stat Summary */}
            <div className="bg-slate-900 text-white rounded-lg p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-3xl font-mono font-bold">{formatUSD(intent.amountMinor)}</div>
                  <div className="text-xs text-slate-400 mt-1 font-mono">
                    {intent.currency} · {intent.recipientSnapshot?.displayName}
                  </div>
                </div>
                <div className="text-right">
                  <span className="inline-block px-2.5 py-1 rounded text-xs font-semibold bg-white/10 text-white border border-white/20">
                    {intent.status}
                  </span>
                  <div className="text-[11px] text-slate-400 mt-1 font-mono">
                    {intent.recipientSnapshot?.email}
                  </div>
                </div>
              </div>

              {/* Pending Approval CTA if waiting */}
              {intent.status === 'PENDING_APPROVAL' && onApprove && onReject && (
                <div className="mt-4 pt-4 border-t border-slate-800 flex items-center gap-3">
                  <button
                    onClick={() => onApprove(intent.id)}
                    className="flex-1 py-2 px-3 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition text-center"
                  >
                    Countersign & Execute Payout
                  </button>
                  <button
                    onClick={() => onReject(intent.id)}
                    className="py-2 px-3 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>

            {/* Signature Decision Card */}
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Policy Verdict Evidence
              </div>
              <DecisionCard intent={intent} />
            </div>

            {/* Request Specification */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-4 space-y-2.5 text-xs">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Request Parameters
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/50">
                <span className="text-slate-500">Initiating Agent</span>
                <span className="font-mono font-medium text-slate-800">{intent.agentName} ({intent.agentId})</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/50">
                <span className="text-slate-500">Invoice Reference</span>
                <span className="font-mono text-slate-800">{intent.invoiceReference}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-200/50">
                <span className="text-slate-500">Idempotency Key</span>
                <span className="font-mono text-slate-800">{intent.idempotencyKey}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500">Timestamp</span>
                <span className="font-mono text-slate-800">{new Date(intent.createdAt).toLocaleString()}</span>
              </div>
            </div>

            {/* Approval Evidence */}
            {intent.approval && (
              <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-4 space-y-2.5 text-xs">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Countersign Verification
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200/50">
                  <span className="text-slate-500">Review Decision</span>
                  <span className="font-semibold text-slate-800">{intent.approval.decision || 'AWAITING_REVIEW'}</span>
                </div>
                {intent.approval.reviewedBy && (
                  <div className="flex justify-between py-1 border-b border-slate-200/50">
                    <span className="text-slate-500">Approved By</span>
                    <span className="text-slate-800">{intent.approval.reviewedBy}</span>
                  </div>
                )}
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Snapshot Hash</span>
                  <span className="font-mono text-slate-800 flex items-center gap-1">
                    {intent.approval.snapshotHash.substring(0, 16)}...
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 inline" />
                  </span>
                </div>
              </div>
            )}

            {/* PayPal Execution Reference */}
            {intent.payout && (
              <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    PayPal Sandbox Disbursement
                  </span>
                  <span className="text-[10px] font-mono text-blue-600 font-medium">Payouts REST API</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                  <span className="text-slate-500">Batch ID</span>
                  <span className="font-mono text-slate-800 flex items-center gap-1.5">
                    {intent.payout.payoutBatchId}
                    <button
                      onClick={() => handleCopy(intent.payout!.payoutBatchId, 'batch')}
                      className="text-slate-400 hover:text-slate-600"
                    >
                      {copiedKey === 'batch' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200/50">
                  <span className="text-slate-500">Item ID</span>
                  <span className="font-mono text-slate-800">{intent.payout.payoutItemId}</span>
                </div>
                {['PENDING', 'HELD', 'UNCLAIMED'].includes(intent.status) && (
                  <div className="flex items-center justify-between gap-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800">
                    <span>
                      Awaiting PayPal settlement. The budget stays reserved until PayPal confirms; this refreshes automatically.
                    </span>
                    {onReconcile && (
                      <button
                        disabled={isChecking}
                        onClick={async () => {
                          setIsChecking(true);
                          try {
                            await onReconcile(intent.id);
                          } finally {
                            setIsChecking(false);
                          }
                        }}
                        className="shrink-0 px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold"
                      >
                        {isChecking ? 'Checking...' : 'Check PayPal status'}
                      </button>
                    )}
                  </div>
                )}
                {intent.payout.transactionId && (
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-500">Transaction ID</span>
                    <span className="font-mono text-emerald-700 font-semibold">{intent.payout.transactionId}</span>
                  </div>
                )}
              </div>
            )}

            {/* Audit Trail Timeline */}
            <div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5 flex items-center justify-between">
                <span>Tamper-Evident Ledger Trail</span>
                <span className="text-[10px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                  Cryptographically Chained
                </span>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 bg-white">
                {relatedEvents.map((evt) => (
                  <div key={evt.id} className="p-3 text-xs flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-medium text-slate-900">{evt.eventType}</span>
                        <span className="text-[10px] px-1 py-0.2 rounded bg-slate-100 text-slate-600 font-mono">
                          {evt.actorType}
                        </span>
                      </div>
                      <div className="text-[11px] font-mono text-slate-400 mt-1">
                        prev: {evt.prevHash.substring(0, 8)}... → hash: {evt.hash.substring(0, 8)}...
                      </div>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 shrink-0">
                      {new Date(evt.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
