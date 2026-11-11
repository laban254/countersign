import React from 'react';
import {
  SpendingSummary,
  PaymentIntent,
  Agent,
  Policy,
} from '../domain/types.ts';
import { formatUSD } from '../domain/money.ts';
import { LogoMark } from '../components/Logo.tsx';
import {
  ShieldCheck,
  Clock,
  ArrowRight,
  Play,
  Sparkles,
  Bot,
  AlertTriangle,
  Receipt,
  CheckCircle,
} from 'lucide-react';

interface OverviewViewProps {
  spending: SpendingSummary;
  stats: {
    totalIntents: number;
    pendingApprovalsCount: number;
    activeAgentsCount: number;
    approvedRecipientsCount: number;
    ledgerEventsCount: number;
    chainIntegrity: boolean;
  };
  pendingApprovals: PaymentIntent[];
  recentIntents: PaymentIntent[];
  agents: Agent[];
  policies: Policy[];
  onSelectIntent: (intent: PaymentIntent) => void;
  onNavigateToApprovals: () => void;
  onRunGoldenDemo: () => void;
  onOpenAssistant: () => void;
  onOpenPolicyBuilder: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  spending,
  stats,
  pendingApprovals,
  recentIntents,
  agents,
  onSelectIntent,
  onNavigateToApprovals,
  onRunGoldenDemo,
  onOpenAssistant,
  onOpenPolicyBuilder,
}) => {
  const dailyTotal = spending.dailySettledMinor + spending.dailyReservedMinor;
  const dailyPct = Math.min(100, Math.round((dailyTotal / (spending.dailyLimitMinor || 1)) * 100));

  const monthlyTotal = spending.monthlySettledMinor + spending.monthlyReservedMinor;
  const monthlyPct = Math.min(100, Math.round((monthlyTotal / (spending.monthlyLimitMinor || 1)) * 100));

  return (
    <div className="space-y-6">
      {/* Golden Demo Announcement / Hero Banner */}
      <div className="rounded-2xl p-6 sm:p-8 text-white shadow-[0_20px_50px_-25px_rgba(15,23,42,0.6)] relative overflow-hidden bg-gradient-to-br from-stone-900 via-stone-900 to-orange-950">
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.07] bg-[linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] bg-[size:36px_36px] [mask-image:radial-gradient(ellipse_at_right,black,transparent_75%)]"
          aria-hidden="true"
        />
        <div className="absolute -right-16 -top-24 w-96 h-96 rounded-full bg-orange-500/25 blur-3xl pointer-events-none" aria-hidden="true" />
        <div className="absolute right-40 -bottom-32 w-80 h-80 rounded-full bg-rose-500/15 blur-3xl pointer-events-none" aria-hidden="true" />
        <LogoMark className="hidden md:block absolute right-8 top-1/2 -translate-y-1/2 w-40 h-40 opacity-25 pointer-events-none" />
        <div className="relative z-10 max-w-4xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-500/15 text-blue-200 border border-blue-400/30 mb-4">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
            Reference scenario
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white [text-wrap:balance]">
            Deterministic Financial Guardrails for Autonomous Agents
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 mt-2 leading-relaxed">
            Run the reference scenario: <code className="font-mono text-blue-300">operations-agent</code> submits a
            <strong> $49.00 USD</strong> software invoice requiring human countersign (above the countersign threshold).
            Next, dispatch an unauthorized <strong>$180.00 USD</strong> request which is instantly denied by the hard transaction limit.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={onRunGoldenDemo}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-orange-500 to-pink-500 hover:brightness-110 text-white shadow-[0_8px_24px_-8px_rgba(244,63,94,0.7)] transition flex items-center gap-2"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Run Golden Demo</span>
            </button>
            <button
              onClick={onOpenPolicyBuilder}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white border border-white/20 transition flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>Draft Policy with AI</span>
            </button>
            <button
              onClick={onOpenAssistant}
              className="px-3 py-2 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/15 text-white border border-white/20 transition"
            >
              Ask Why $180 Was Denied
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Daily Limit Gauge */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition">
          <div className="flex justify-between items-start text-xs">
            <span className="font-medium text-slate-500">Daily Spend Cap</span>
            <span className="font-mono text-slate-400 text-[11px]">{dailyPct}%</span>
          </div>
          <div className="mt-2 text-3xl font-bold font-mono tracking-tight text-slate-900">
            {formatUSD(dailyTotal)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
            of {formatUSD(spending.dailyLimitMinor)} cap ({formatUSD(spending.dailyAvailableMinor)} available)
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                dailyPct > 80 ? 'bg-rose-500' : 'bg-gradient-to-r from-orange-500 to-pink-500'
              }`}
              style={{ width: `${dailyPct}%` }}
            />
          </div>
        </div>

        {/* Monthly Limit Gauge */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition">
          <div className="flex justify-between items-start text-xs">
            <span className="font-medium text-slate-500">Monthly Budget</span>
            <span className="font-mono text-slate-400 text-[11px]">{monthlyPct}%</span>
          </div>
          <div className="mt-2 text-3xl font-bold font-mono tracking-tight text-slate-900">
            {formatUSD(monthlyTotal)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
            of {formatUSD(spending.monthlyLimitMinor)} cap ({formatUSD(spending.monthlyAvailableMinor)} available)
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
            <div
              className="h-full bg-slate-900 rounded-full transition-all duration-500"
              style={{ width: `${monthlyPct}%` }}
            />
          </div>
        </div>

        {/* Pending Approvals */}
        <div
          onClick={onNavigateToApprovals}
          className={`p-5 rounded-2xl border shadow-xs hover:shadow-md cursor-pointer transition ${
            stats.pendingApprovalsCount > 0
              ? 'bg-amber-50/70 border-amber-200 hover:border-amber-300'
              : 'bg-white border-slate-200/90 hover:border-slate-300'
          }`}
        >
          <div className="flex justify-between items-start text-xs">
            <span className="font-medium text-slate-700">Pending Countersigns</span>
            {stats.pendingApprovalsCount > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
            )}
          </div>
          <div className="mt-2 text-3xl font-bold font-mono tracking-tight text-slate-900">
            {stats.pendingApprovalsCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center justify-between">
            <span>Requires human authorization</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>

        {/* Ledger Hash Chain Integrity */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs hover:shadow-md transition">
          <div className="flex justify-between items-start text-xs">
            <span className="font-medium text-slate-500">Tamper-Evident Ledger</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="mt-2 text-3xl font-bold font-mono tracking-tight text-slate-900">
            {stats.ledgerEventsCount} <span className="text-xs font-normal text-slate-500 font-sans">events</span>
          </div>
          <div className="text-[11px] text-emerald-700 mt-0.5 font-medium flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            HMAC Chain Verified
          </div>
        </div>
      </div>

      {/* Pending Approvals Callout (if any) */}
      {pendingApprovals.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-amber-950">
                {pendingApprovals.length} Payment Intent Awaiting Human Approval
              </div>
              <div className="text-xs text-amber-800">
                {pendingApprovals[0].agentName} requested {formatUSD(pendingApprovals[0].amountMinor)} to{' '}
                {pendingApprovals[0].recipientSnapshot.displayName}.
              </div>
            </div>
          </div>
          <button
            onClick={onNavigateToApprovals}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition whitespace-nowrap"
          >
            Review & Countersign
          </button>
        </div>
      )}

      {/* Recent Activity Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Recent Payment Intents</h3>
            <p className="text-xs text-slate-400">Deterministic policy evaluations and PayPal executions</p>
          </div>
          <span className="text-xs font-mono text-slate-500">{recentIntents.length} total</span>
        </div>

        {recentIntents.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No payments initiated yet. Click "Run Golden Demo" above to launch demo transactions.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-100 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-4">Date / ID</th>
                  <th className="py-2.5 px-4">Agent</th>
                  <th className="py-2.5 px-4">Recipient</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                  <th className="py-2.5 px-4">Policy Verdict</th>
                  <th className="py-2.5 px-4">Status</th>
                  <th className="py-2.5 px-4">PayPal Ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {recentIntents.map((item) => {
                  const isDenied = item.status === 'DENIED';
                  const isPending = item.status === 'PENDING_APPROVAL';
                  const isSuccess = item.status === 'SUCCEEDED';

                  return (
                    <tr
                      key={item.id}
                      onClick={() => onSelectIntent(item)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelectIntent(item);
                        }
                      }}
                      className="hover:bg-slate-50/80 cursor-pointer transition"
                    >
                      <td className="py-3 px-4 font-mono text-slate-600">
                        <div>{new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        <div className="text-[10px] text-slate-400">{item.id}</div>
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-800">
                        {item.agentName}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900">{item.recipientSnapshot.displayName}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{item.recipientSnapshot.email}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {formatUSD(item.amountMinor)}
                      </td>
                      <td className="py-3 px-4">
                        {isDenied && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            Denied
                          </span>
                        )}
                        {isPending && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Pending Approval
                          </span>
                        )}
                        {isSuccess && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            Authorized
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-[11px] text-slate-600">
                          {item.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">
                        {item.payout?.transactionId ? (
                          <span className="text-blue-600">{item.payout.transactionId.substring(0, 10)}...</span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
