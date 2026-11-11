import React from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  Receipt,
  Bot,
  Sliders,
  Users,
  FileSpreadsheet,
  Terminal,
  Sparkles,
  RefreshCw,
  Play,
  ShieldCheck,
  LogOut,
} from 'lucide-react';
import { Logo } from './Logo.tsx';

export type NavTab =
  | 'overview'
  | 'approvals'
  | 'payments'
  | 'agents'
  | 'policies'
  | 'recipients'
  | 'ledger'
  | 'simulator';

interface NavigationProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  pendingApprovalsCount: number;
  onToggleAi: () => void;
  onRunGoldenDemo: () => void;
  isAiOpen: boolean;
  onResetSeed: () => void;
  chainValid: boolean;
  /** Sign out and return to the landing page. */
  onExit: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onSelectTab,
  pendingApprovalsCount,
  onToggleAi,
  onRunGoldenDemo,
  isAiOpen,
  onResetSeed,
  chainValid,
  onExit,
}) => {
  const navItems: { id: NavTab; label: string; icon: React.FC<{ className?: string }>; badge?: number }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'approvals', label: 'Approvals Queue', icon: CheckSquare, badge: pendingApprovalsCount },
    { id: 'payments', label: 'Payment Intents', icon: Receipt },
    { id: 'agents', label: 'AI Agents', icon: Bot },
    { id: 'policies', label: 'Policies', icon: Sliders },
    { id: 'recipients', label: 'Recipients', icon: Users },
    { id: 'ledger', label: 'Audit Ledger', icon: FileSpreadsheet },
    { id: 'simulator', label: 'Agent Simulator', icon: Terminal },
  ];

  return (
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
      {/* Top Banner Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Identity */}
          <div className="flex items-center gap-6">
            <div
              role="button"
              tabIndex={0}
              aria-label="Go to overview"
              onClick={() => onSelectTab('overview')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectTab('overview');
                }
              }}
              className="flex items-center gap-3 cursor-pointer rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Logo compactOnMobile />
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Sandbox
              </span>
            </div>

            {/* Workspace & Chain status */}
            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 pl-4 border-l border-slate-200">
              <span className="font-medium text-slate-700">Countersign Demo Co.</span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <ShieldCheck className="w-3 h-3" />
                Ledger Chain {chainValid ? 'Verified' : 'Warning'}
              </span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Run Golden Demo Button */}
            <button
              onClick={onRunGoldenDemo}
              title="Creates the reference scenario: a $49 request that needs approval and a $180 request that is denied"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-r from-orange-600 to-pink-600 hover:brightness-110 text-white shadow-xs transition"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span className="hidden sm:inline">Run Golden Demo</span>
            </button>

            {/* AI Assistant Toggle Button */}
            <button
              onClick={onToggleAi}
              aria-label="AI Assistant"
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition ${
                isAiOpen
                  ? 'bg-purple-50 text-purple-700 border-purple-300'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-600" />
              <span className="hidden sm:inline whitespace-nowrap">AI Assistant</span>
            </button>

            {/* Reset Seed Button */}
            <button
              onClick={onResetSeed}
              title="Reset state to initial clean seed"
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          
            {/* Sign out */}
            <button
              onClick={onExit}
              title="Sign out and return to the home page"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Sign out</span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary Tab Navigation */}
      <div className="bg-slate-50/80 border-t border-slate-200/80 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex items-center space-x-1 sm:space-x-2 overflow-x-auto scrollbar-none py-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80 font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </header>
  );
};
