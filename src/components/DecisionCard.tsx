import React from 'react';
import { PaymentIntent, EvaluationCheck } from '../domain/types.ts';
import { formatUSD } from '../domain/money.ts';
import { Check, AlertTriangle, XCircle, ShieldCheck, Clock } from 'lucide-react';

interface DecisionCardProps {
  intent?: PaymentIntent;
  customChecks?: EvaluationCheck[];
  decision?: string;
  amountMinor?: number;
  recipientName?: string;
  recipientEmail?: string;
  invoiceReference?: string;
  description?: string;
  policyVersion?: number;
  explanation?: string;
  compact?: boolean;
}

export const DecisionCard: React.FC<DecisionCardProps> = ({
  intent,
  customChecks,
  decision: customDecision,
  amountMinor: customAmountMinor,
  recipientName: customRecipientName,
  recipientEmail: customRecipientEmail,
  invoiceReference: customInvoiceRef,
  description: customDesc,
  policyVersion: customPolicyVer,
  explanation: customExplanation,
  compact = false,
}) => {
  const decision = customDecision || intent?.decision || 'PENDING_APPROVAL';
  const amountMinor = customAmountMinor ?? intent?.amountMinor ?? 0;
  const recipientName = customRecipientName || intent?.recipientSnapshot?.displayName || 'Recipient';
  const recipientEmail = customRecipientEmail || intent?.recipientSnapshot?.email || '';
  const invoiceRef = customInvoiceRef || intent?.invoiceReference || '';
  const description = customDesc || intent?.description || '';
  const policyVer = customPolicyVer ?? intent?.policySnapshot?.version ?? 3;
  const explanation = customExplanation || intent?.explanation || '';
  const checks = customChecks || intent?.checks || [];

  const getStatusBadge = () => {
    switch (decision) {
      case 'AUTHORIZED':
      case 'SUCCEEDED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            AUTHORIZED
          </span>
        );
      case 'PENDING_APPROVAL':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            PENDING COUNTERSIGN
          </span>
        );
      case 'DENIED':
      case 'REJECTED':
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
            {decision}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
            {decision}
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-slate-200/80 rounded-lg shadow-xs overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50/70 border-b border-slate-100">
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          <span className="text-xs text-slate-500 font-mono">
            policy v{policyVer}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-slate-400 font-mono">
          <Clock className="w-3.5 h-3.5" />
          <span>{intent?.createdAt ? new Date(intent.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Evaluated'}</span>
        </div>
      </div>

      {/* Primary Figures */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <div>
            <div className="text-2xl font-bold font-mono tracking-tight text-slate-900">
              {formatUSD(amountMinor)} <span className="text-xs font-normal text-slate-500 font-sans">USD</span>
            </div>
            {(description || invoiceRef) && (
              <p className="text-xs text-slate-500 mt-0.5">
                {description} {invoiceRef && `· ${invoiceRef}`}
              </p>
            )}
          </div>
          <div className="sm:text-right">
            <div className="text-sm font-medium text-slate-800">{recipientName}</div>
            <div className="text-xs text-slate-400 font-mono">{recipientEmail}</div>
          </div>
        </div>
      </div>

      {/* Checks Evaluation List */}
      <div className="p-4 bg-slate-50/30">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
          <span>Deterministic Policy Checks</span>
        </div>

        <div className="space-y-2">
          {checks.map((check) => {
            const isPassed = check.status === 'passed';
            const isWarning = check.status === 'warning';
            const isFailed = check.status === 'failed';

            return (
              <div
                key={check.id}
                className="flex items-start gap-2.5 text-xs text-slate-700"
              >
                <div className="mt-0.5 shrink-0">
                  {isPassed && (
                    <div className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                      <Check className="w-2.5 h-2.5 stroke-[3]" />
                    </div>
                  )}
                  {isWarning && (
                    <div className="w-4 h-4 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                      <AlertTriangle className="w-2.5 h-2.5" />
                    </div>
                  )}
                  {isFailed && (
                    <div className="w-4 h-4 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center">
                      <XCircle className="w-2.5 h-2.5" />
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <span className={isFailed ? 'font-medium text-rose-900' : isWarning ? 'font-medium text-amber-900' : 'text-slate-700'}>
                    {check.label}
                  </span>
                  {check.detail && (
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {check.detail}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Explanation Footer */}
        {explanation && !compact && (
          <div className="mt-3.5 pt-3 border-t border-slate-200/60 text-xs text-slate-600 bg-white p-2.5 rounded border border-slate-200/50">
            <span className="font-semibold text-slate-800">Verdict: </span>
            {explanation}
          </div>
        )}
      </div>
    </div>
  );
};
