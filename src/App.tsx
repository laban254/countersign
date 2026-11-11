import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import {
  SpendingSummary,
  PaymentIntent,
  Agent,
  Policy,
  Recipient,
  LedgerEvent,
  PolicyVersion,
} from './domain/types.ts';
import { Navigation, NavTab } from './components/Navigation.tsx';
import { PaymentDrawer } from './components/PaymentDrawer.tsx';
import { LoginGate } from './components/LoginGate.tsx';
import { LandingPage } from './components/LandingPage.tsx';
import {
  apiFetch,
  clearAdminToken,
  getAdminToken,
  setAdminToken,
  setDashboardRole,
  fetchDemoAccess,
  hasEnteredConsole,
  markEnteredConsole,
  clearConsoleSession,
} from './lib/api.ts';
import { AiAssistantPanel } from './components/AiAssistantPanel.tsx';
import { AiFab } from './components/AiFab.tsx';
import { PolicyBuilderModal } from './components/PolicyBuilderModal.tsx';
import { OverviewView } from './views/OverviewView.tsx';
import { ApprovalsView } from './views/ApprovalsView.tsx';
// The grid tabs load AG Grid on demand, so the first screen stays light.
const PaymentsView = lazy(() => import('./views/PaymentsView.tsx').then((m) => ({ default: m.PaymentsView })));
import { AgentsView } from './views/AgentsView.tsx';
import { PoliciesView } from './views/PoliciesView.tsx';
import { RecipientsView } from './views/RecipientsView.tsx';
const LedgerView = lazy(() => import('./views/LedgerView.tsx').then((m) => ({ default: m.LedgerView })));
import { SimulatorView } from './views/SimulatorView.tsx';

const TAB_IDS: NavTab[] = [
  'overview',
  'approvals',
  'payments',
  'agents',
  'policies',
  'recipients',
  'ledger',
  'simulator',
];

/** The tab named by the URL hash (#/policies), or null on the landing page. */
function tabFromHash(): NavTab | null {
  const name = window.location.hash.replace(/^#\/?/, '');
  return TAB_IDS.find((t) => t === name) ?? null;
}

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<NavTab>(() => tabFromHash() ?? 'overview');
  const [isLoading, setIsLoading] = useState(true);
  const [authState, setAuthState] = useState<'checking' | 'landing' | 'required' | 'ready'>(
    'checking'
  );
  // Whether the visitor already holds a valid session (or auth is off), and whether demo mode is on.
  const [hasAccess, setHasAccess] = useState(false);
  const [authRequired, setAuthRequired] = useState(true);
  const hasAccessRef = useRef(false);
  hasAccessRef.current = hasAccess;
  const [demoMode, setDemoMode] = useState(false);
  const [isEntering, setIsEntering] = useState(false);
  const [enterError, setEnterError] = useState('');

  // Core Data
  const [spending, setSpending] = useState<SpendingSummary>({
    workspaceId: 'ws_demo_001',
    currency: 'USD',
    dailyLimitMinor: 12000,
    monthlyLimitMinor: 30000,
    dailySettledMinor: 0,
    dailyReservedMinor: 0,
    dailyAvailableMinor: 12000,
    monthlySettledMinor: 0,
    monthlyReservedMinor: 0,
    monthlyAvailableMinor: 30000,
  });

  const [stats, setStats] = useState({
    totalIntents: 0,
    pendingApprovalsCount: 0,
    activeAgentsCount: 1,
    approvedRecipientsCount: 1,
    ledgerEventsCount: 6,
    chainIntegrity: true,
  });

  const [pendingApprovals, setPendingApprovals] = useState<PaymentIntent[]>([]);
  const [recentIntents, setRecentIntents] = useState<PaymentIntent[]>([]);
  const [allIntents, setAllIntents] = useState<PaymentIntent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [ledgerEvents, setLedgerEvents] = useState<LedgerEvent[]>([]);

  // Modals / Drawers
  const [selectedIntentForDrawer, setSelectedIntentForDrawer] = useState<PaymentIntent | null>(null);
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isPolicyBuilderOpen, setIsPolicyBuilderOpen] = useState(false);
  const [policyBuilderSeed, setPolicyBuilderSeed] = useState<PolicyVersion | null>(null);
  const openPolicyBuilder = (seed: PolicyVersion | null = null) => {
    setPolicyBuilderSeed(seed);
    setIsPolicyBuilderOpen(true);
  };

  // Notification Toast
  const [toast, setToast] = useState<{ message: string; kind: 'info' | 'error' } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, kind: 'info' | 'error' = 'info') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, kind });
    toastTimer.current = setTimeout(() => setToast(null), kind === 'error' ? 6000 : 3500);
  }, []);

  // Keep the drawer selection in a ref so polling doesn't restart when it changes.
  const drawerIdRef = useRef<string | null>(null);
  drawerIdRef.current = selectedIntentForDrawer?.id ?? null;

  // Which tab is visible, read from a ref so polling does not restart on tab change.
  const tabRef = useRef<NavTab>(currentTab);
  tabRef.current = currentTab;

  const loadData = useCallback(async () => {
    // The overview payload feeds the nav badge, stats and spending on every tab.
    // Heavier lists are fetched only when the visible tab (or the drawer) needs them.
    const tab = tabRef.current;
    const drawerOpen = drawerIdRef.current !== null;
    const needIntents = tab === 'payments' || drawerOpen;
    const needRecipients = tab === 'recipients' || tab === 'simulator';
    const needLedger = tab === 'ledger' || drawerOpen;

    try {
      const [overviewRes, intentsRes, recipientsRes, ledgerRes] = await Promise.all([
        apiFetch('/api/v1/overview'),
        needIntents ? apiFetch('/api/v1/payment-intents') : null,
        needRecipients ? apiFetch('/api/v1/recipients') : null,
        needLedger ? apiFetch('/api/v1/ledger/events') : null,
      ]);

      if (overviewRes.ok) {
        const overview = await overviewRes.json();
        setSpending(overview.spending);
        setStats(overview.stats);
        setPendingApprovals(overview.pendingApprovals);
        setRecentIntents(overview.recentIntents);
        setAgents(overview.agents);
        setPolicies(overview.policies);
      }

      if (intentsRes?.ok) {
        const intents = await intentsRes.json();
        setAllIntents(intents);
        if (drawerIdRef.current) {
          const updated = intents.find((i: PaymentIntent) => i.id === drawerIdRef.current);
          if (updated) setSelectedIntentForDrawer(updated);
        }
      }

      if (recipientsRes?.ok) {
        setRecipients(await recipientsRes.json());
      }

      if (ledgerRes?.ok) {
        setLedgerEvents(await ledgerRes.json());
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch immediately when the visible tab or drawer changes so it never shows stale data.
  useEffect(() => {
    if (authState === 'ready') loadData();
  }, [currentTab, selectedIntentForDrawer?.id, authState, loadData]);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const statusRes = await fetch('/api/v1/auth/status');
        const status = await statusRes.json();
        if (cancelled) return;

        if (!cancelled) {
          setDemoMode(Boolean(status.demoMode));
          setAuthRequired(Boolean(status.authRequired));
        }

        let access = !status.authRequired;
        if (!access) {
          const token = getAdminToken();
          if (token) {
            const verifyRes = await fetch('/api/v1/auth/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token }),
            });
            if (verifyRes.ok) {
              access = true;
              const body = await verifyRes.json().catch(() => ({}));
              setDashboardRole(body?.role === 'judge' ? 'judge' : 'admin');
            } else clearAdminToken();
          }
        }
        if (cancelled) return;
        setHasAccess(access);

        // First visit in this browser session lands on the intro page; returning visitors
        // with a valid session go straight to the console.
        setAuthState(access && hasEnteredConsole() ? 'ready' : 'landing');
      } catch {
        // If the status check fails, keep the demo usable; individual requests
        // will still surface a 401 and trigger the login gate.
        if (!cancelled) setAuthState('ready');
      }
    };

    checkAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Switch tab and record it in the URL so the browser Back button works. */
  const selectTab = useCallback((tab: NavTab) => {
    setCurrentTab(tab);
    if (window.location.hash !== `#/${tab}`) {
      window.history.pushState(null, '', `#/${tab}`);
    }
  }, []);

  const showConsole = (tab: NavTab = currentTab) => {
    markEnteredConsole();
    setHasAccess(true);
    setAuthState('ready');
    if (window.location.hash !== `#/${tab}`) {
      window.history.pushState(null, '', `#/${tab}`);
    }
  };

  /** Sign out and return to the landing page. */
  const handleExit = () => {
    clearAdminToken();
    clearConsoleSession();
    setHasAccess(!authRequired);
    setIsAiOpen(false);
    setIsPolicyBuilderOpen(false);
    setSelectedIntentForDrawer(null);
    window.history.pushState(null, '', window.location.pathname);
    setAuthState('landing');
  };

  // Browser Back/Forward: tabs live in the URL hash; an empty hash is the landing page.
  useEffect(() => {
    const onNavigate = () => {
      const tab = tabFromHash();
      if (tab) {
        setCurrentTab(tab);
        setAuthState((prev) => (prev === 'landing' && hasAccessRef.current ? 'ready' : prev));
      } else {
        setAuthState((prev) => (prev === 'ready' ? 'landing' : prev));
      }
    };
    window.addEventListener('popstate', onNavigate);
    return () => window.removeEventListener('popstate', onNavigate);
  }, []);

  const handleEnterConsole = async () => {
    setEnterError('');
    if (hasAccess) {
      showConsole();
      return;
    }

    setIsEntering(true);
    try {
      const demo = await fetchDemoAccess();
      if (!demo.enabled || !demo.token) {
        setAuthState('required');
        return;
      }
      const verify = await fetch('/api/v1/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: demo.token }),
      });
      if (!verify.ok) {
        setAuthState('required');
        return;
      }
      const verifyBody = await verify.json().catch(() => ({}));
      setDashboardRole(verifyBody?.role === 'judge' ? 'judge' : 'admin');
      setAdminToken(demo.token);
      showConsole();
    } catch {
      setEnterError('Unable to reach the Countersign server. Please try again.');
    } finally {
      setIsEntering(false);
    }
  };

  useEffect(() => {
    const handleToast = (event: Event) => {
      const detail = (event as CustomEvent<{ message: string; kind?: 'info' | 'error' }>).detail;
      if (detail?.message) showToast(detail.message, detail.kind ?? 'info');
    };
    window.addEventListener('countersign:toast', handleToast);
    return () => window.removeEventListener('countersign:toast', handleToast);
  }, [showToast]);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearAdminToken();
      setAuthState('required');
    };
    window.addEventListener('countersign:unauthorized', handleUnauthorized);
    return () =>
      window.removeEventListener('countersign:unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    if (authState !== 'ready') return;
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [authState, loadData]);

  const handleRunGoldenDemo = async () => {
    try {
      const res = await apiFetch('/api/v1/seed/golden-demo', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Golden demo failed');
      await loadData();
      showToast('Golden Demo dispatched: $49.00 pending approval & $180.00 denied');
      selectTab('approvals');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Golden demo failed', 'error');
    }
  };

  const handleResetSeed = async () => {
    try {
      const res = await apiFetch('/api/v1/seed/reset', { method: 'POST' });
      if (!res.ok) throw new Error('Reset failed');
      await loadData();
      showToast('Reset state to clean initial seed');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Reset failed', 'error');
    }
  };

  const handleApproveIntent = async (id: string, comment?: string) => {
    try {
      const res = await apiFetch(`/api/v1/payment-intents/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Approval failed');
      }
      const updated = await res.json();
      await loadData();
      const status = updated?.status;
      showToast(
        status === 'SUCCEEDED'
          ? 'Payment countersigned and payout settled.'
          : status === 'PENDING'
            ? 'Payment countersigned; payout submitted and awaiting provider settlement.'
            : `Payment countersigned (${status || 'submitted'}).`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Approval failed: ${msg}`, 'error');
    }
  };

  const handleRejectIntent = async (id: string, comment?: string) => {
    try {
      const res = await apiFetch(`/api/v1/payment-intents/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Rejection failed');
      }
      await loadData();
      showToast('Payment request rejected and reservation released');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showToast(`Rejection failed: ${msg}`, 'error');
    }
  };

  const handleReconcileIntent = async (id: string) => {
    try {
      const res = await apiFetch(`/api/v1/payment-intents/${id}/reconcile`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Status check failed');
      await loadData();
      showToast(
        data.status === 'SUCCEEDED'
          ? 'PayPal confirmed the payout. Budget settled.'
          : `PayPal status: still ${String(data.status).toLowerCase()}.`
      );
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Status check failed', 'error');
    }
  };

  const activePolicy = policies[0] || null;

  if (authState === 'checking') {
    return (
      <div className="min-h-screen bg-[#faf7f2] flex items-center justify-center text-xs text-slate-500">
        Checking dashboard authentication...
      </div>
    );
  }

  if (authState === 'ready' && isLoading) {
    return (
      <div className="min-h-screen bg-[#faf7f2] flex items-center justify-center text-xs text-slate-500">
        Loading Countersign control plane...
      </div>
    );
  }

  if (authState === 'landing') {
    return (
      <LandingPage
        demoMode={demoMode}
        signedIn={hasAccess}
        isEntering={isEntering}
        error={enterError}
        onEnter={handleEnterConsole}
        onUseToken={() => setAuthState('required')}
      />
    );
  }

  if (authState === 'required') {
    return (
      <LoginGate
        onAuthenticated={() => showConsole()}
        onBack={() => setAuthState('landing')}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#faf7f2] flex flex-col font-sans">
      {/* Toast Notification */}
      {toast && (
        <div
          role={toast.kind === 'error' ? 'alert' : 'status'}
          className={`fixed top-4 right-4 z-50 max-w-sm px-4 py-2.5 rounded-lg shadow-lg border text-xs flex items-center gap-2 ${
            toast.kind === 'error'
              ? 'bg-rose-600 text-white border-rose-700'
              : 'bg-slate-900 text-white border-slate-700'
          }`}
        >
          <span className={`w-2 h-2 shrink-0 rounded-full ${toast.kind === 'error' ? 'bg-white' : 'bg-blue-400'}`}></span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Main Navigation */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={selectTab}
        pendingApprovalsCount={stats.pendingApprovalsCount}
        onToggleAi={() => setIsAiOpen((prev) => !prev)}
        onRunGoldenDemo={handleRunGoldenDemo}
        isAiOpen={isAiOpen}
        onResetSeed={handleResetSeed}
        chainValid={stats.chainIntegrity}
        onExit={handleExit}
      />

      {/* Viewport Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-28">
        <Suspense fallback={<div className="py-24 text-center text-xs text-slate-400">Loading…</div>}>
        {currentTab === 'overview' && (
          <OverviewView
            spending={spending}
            stats={stats}
            pendingApprovals={pendingApprovals}
            recentIntents={recentIntents}
            agents={agents}
            policies={policies}
            onSelectIntent={setSelectedIntentForDrawer}
            onNavigateToApprovals={() => selectTab('approvals')}
            onRunGoldenDemo={handleRunGoldenDemo}
            onOpenAssistant={() => setIsAiOpen(true)}
            onOpenPolicyBuilder={() => openPolicyBuilder()}
          />
        )}

        {currentTab === 'approvals' && (
          <ApprovalsView
            pendingIntents={pendingApprovals}
            onApprove={handleApproveIntent}
            onReject={handleRejectIntent}
            onRefresh={loadData}
          />
        )}

        {currentTab === 'payments' && (
          <PaymentsView
            intents={allIntents}
            onSelectIntent={setSelectedIntentForDrawer}
          />
        )}

        {currentTab === 'agents' && (
          <AgentsView
            agents={agents}
            policies={policies}
            onRefresh={loadData}
          />
        )}

        {currentTab === 'policies' && (
          <PoliciesView
            policies={policies}
            onOpenPolicyBuilder={openPolicyBuilder}
            onRefresh={loadData}
          />
        )}

        {currentTab === 'recipients' && (
          <RecipientsView
            recipients={recipients}
            onRefresh={loadData}
          />
        )}

        {currentTab === 'ledger' && (
          <LedgerView
            events={ledgerEvents}
            onRefresh={loadData}
          />
        )}

        {currentTab === 'simulator' && (
          <SimulatorView
            agents={agents}
            recipients={recipients}
            onRefreshAll={loadData}
          />
        )}
        </Suspense>
      </main>

      {/* Slide-over Payment Drawer */}
      <PaymentDrawer
        intent={selectedIntentForDrawer}
        onClose={() => setSelectedIntentForDrawer(null)}
        ledgerEvents={ledgerEvents}
        onApprove={handleApproveIntent}
        onReject={handleRejectIntent}
        onReconcile={handleReconcileIntent}
      />

      {/* Floating entry point to the assistant, available on every tab */}
      <AiFab onOpen={() => setIsAiOpen(true)} hidden={isAiOpen} />

      {/* Slide-over AI Assistant Panel */}
      <AiAssistantPanel
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
      />

      {/* Natural Language Policy Builder Modal */}
      <PolicyBuilderModal
        isOpen={isPolicyBuilderOpen}
        onClose={() => setIsPolicyBuilderOpen(false)}
        activePolicy={activePolicy}
        seedVersion={policyBuilderSeed}
        onVersionCreatedAndActivated={loadData}
      />
    </div>
  );
};
export default App;
