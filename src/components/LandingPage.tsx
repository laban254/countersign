import React from 'react';
import {
  Bot,
  Scale,
  UserCheck,
  Banknote,
  FileCheck2,
  ArrowRight,
  Github,
  Key,
  Check,
  AlertTriangle,
  X,
  ShieldCheck,
  Link2,
  Fingerprint,
  Wallet,
  Sparkles,
  Hash,
} from 'lucide-react';
import { Logo } from './Logo.tsx';

interface LandingPageProps {
  /** Public demo mode is on: "Enter demo" signs the visitor in automatically. */
  demoMode: boolean;
  /** The visitor already holds a valid session. */
  signedIn: boolean;
  isEntering: boolean;
  error: string;
  onEnter: () => void;
  /** Visitor wants to sign in with their own token instead. */
  onUseToken: () => void;
}

const steps = [
  { icon: Bot, title: 'Agent requests', body: 'An agent submits a payment intent with its own identity token.' },
  { icon: Scale, title: 'Policy decides', body: 'A deterministic engine checks limits, caps and recipients. Not a prompt.' },
  { icon: UserCheck, title: 'Human countersigns', body: 'Above the threshold, a person reviews the exact amount and payee.' },
  { icon: Banknote, title: 'PayPal pays', body: 'Only after authorization does a Payouts request go out, idempotently.' },
  { icon: FileCheck2, title: 'Ledger proves it', body: 'Every decision lands in an append-only, HMAC-chained ledger.' },
];

const features = [
  {
    icon: ShieldCheck,
    tone: 'text-blue-600 bg-blue-50',
    title: 'Deterministic guardrails',
    body: 'Per-transaction, daily and monthly caps, recipient allowlists and countersign thresholds. Invalid policies fail closed.',
  },
  {
    icon: Wallet,
    tone: 'text-emerald-600 bg-emerald-50',
    title: 'Budget reservations',
    body: 'Budget is held the moment a request is accepted, so ten concurrent requests cannot overspend a cap.',
  },
  {
    icon: Fingerprint,
    tone: 'text-violet-600 bg-violet-50',
    title: 'Approvals bound to a snapshot',
    body: 'A countersign covers the exact amount, payee and policy version, and is revalidated before money moves.',
  },
  {
    icon: Link2,
    tone: 'text-amber-600 bg-amber-50',
    title: 'Idempotent PayPal payouts',
    body: 'Three layers of idempotency, signed webhooks and reconciliation polling keep settlement exact.',
  },
  {
    icon: Hash,
    tone: 'text-slate-700 bg-slate-100',
    title: 'Tamper-evident ledger',
    body: 'Each event is chained with HMAC-SHA256 over the full record. Verify the whole chain in one click.',
  },
  {
    icon: Sparkles,
    tone: 'text-fuchsia-600 bg-fuchsia-50',
    title: 'AI that cannot spend',
    body: 'Draft policies in plain language, ask why a payment was denied, simulate outcomes. It has no approve tool.',
  },
];

const checks: { label: string; state: 'ok' | 'warn' }[] = [
  { label: 'Agent active', state: 'ok' },
  { label: 'Within $100.00 per-transaction limit', state: 'ok' },
  { label: 'Recipient approved', state: 'ok' },
  { label: 'Within $120.00 daily limit', state: 'ok' },
  { label: 'Above $40.00 approval threshold', state: 'warn' },
];

/** Decorative product preview: a decision card, a denial and a ledger entry. */
const ProductPreview: React.FC = () => (
  <div className="relative mx-auto w-full max-w-md lg:max-w-none" aria-hidden="true">
    <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-orange-500/20 via-pink-500/15 to-fuchsia-400/15 blur-2xl" />

    <div className="relative rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_-20px_rgba(15,23,42,0.35)]">
      <div className="flex items-start justify-between border-b border-slate-100 p-5">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Intent review</div>
          <div className="mt-1 text-sm font-semibold text-slate-900">Second Signature Cloud</div>
          <div className="text-[11px] font-mono text-slate-400">operations-agent · INV-2026-1101</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold font-mono tracking-tight text-slate-900">$49.00</div>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> PENDING COUNTERSIGN
          </span>
        </div>
      </div>

      <ul className="space-y-2.5 p-5">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2.5 text-xs">
            {c.state === 'ok' ? (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
              </span>
            ) : (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <AlertTriangle className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
            )}
            <span className={c.state === 'warn' ? 'font-medium text-amber-800' : 'text-slate-600'}>{c.label}</span>
          </li>
        ))}
      </ul>

      <div className="flex gap-2 border-t border-slate-100 bg-slate-50/70 p-4">
        <div className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-center text-xs font-medium text-slate-600">
          Reject
        </div>
        <div className="flex-[2] rounded-lg bg-gradient-to-r from-orange-600 to-pink-600 py-2 text-center text-xs font-semibold text-white">
          Approve &amp; dispatch payout
        </div>
      </div>
    </div>

    <div className="relative -mt-4 ml-6 rounded-xl border border-rose-200 bg-white p-4 shadow-[0_16px_40px_-18px_rgba(190,18,60,0.35)] sm:ml-12 lg:-ml-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-rose-600">
            <X className="h-3 w-3" strokeWidth={3.5} />
          </span>
          $180.00 request
        </div>
        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
          DENIED
        </span>
      </div>
      <div className="mt-2 font-mono text-[11px] text-rose-700">AMOUNT_EXCEEDS_TRANSACTION_LIMIT</div>
      <div className="mt-0.5 text-[11px] text-slate-400">Never reached PayPal.</div>
    </div>

    <div className="relative -mt-2 ml-auto mr-2 w-[88%] rounded-xl border border-slate-200 bg-slate-900 p-3.5 font-mono text-[11px] text-slate-300 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.6)] sm:mr-6">
      <div className="flex items-center justify-between text-slate-400">
        <span>#11 POLICY_EVALUATED</span>
        <span className="flex items-center gap-1 text-emerald-400">
          <ShieldCheck className="h-3 w-3" /> chain verified
        </span>
      </div>
      <div className="mt-1.5 truncate text-slate-500">prev 6351efa59a… → <span className="text-emerald-300">f1e89f4a71c3…</span></div>
    </div>
  </div>
);

export const LandingPage: React.FC<LandingPageProps> = ({
  demoMode,
  signedIn,
  isEntering,
  error,
  onEnter,
  onUseToken,
}) => {
  const primaryLabel = isEntering
    ? 'Opening console...'
    : signedIn
      ? 'Open console'
      : demoMode
        ? 'Enter live demo'
        : 'Open console';

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#faf7f2] font-sans text-slate-900">
      {/* Backdrop: soft glow plus a fading grid */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(50%_60%_at_30%_0%,rgba(249,115,22,0.18),transparent),radial-gradient(40%_50%_at_78%_5%,rgba(244,63,94,0.13),transparent)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[linear-gradient(to_right,#e9e2d8_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:44px_44px] opacity-60 [mask-image:radial-gradient(ellipse_at_top,black,transparent_72%)]"
        aria-hidden="true"
      />

      <header className="relative z-10 mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 text-xs text-slate-600">
          <a href="#how" className="hidden rounded-md px-3 py-2 hover:bg-white hover:text-slate-900 sm:block">
            How it works
          </a>
          <a href="#features" className="hidden rounded-md px-3 py-2 hover:bg-white hover:text-slate-900 sm:block">
            Features
          </a>
          <a
            href="https://github.com/laban254/countersign"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 hover:bg-white hover:text-slate-900"
          >
            <Github className="h-4 w-4" />
            <span>Source</span>
          </a>
          <button
            onClick={onEnter}
            disabled={isEntering}
            className="ml-1 rounded-lg bg-gradient-to-r from-orange-600 to-pink-600 px-3.5 py-2 font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-60"
          >
            {signedIn ? 'Console' : demoMode ? 'Live demo' : 'Console'}
          </button>
        </nav>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-3 py-1 text-[11px] font-semibold text-blue-700 shadow-sm backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
              </span>
              PayPal Payouts Sandbox · no real money moves
            </div>

            <h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight [text-wrap:balance] sm:text-5xl lg:text-[2.9rem] xl:text-[3.2rem]">
              Give AI agents the power to act,
              <span className="block bg-gradient-to-r from-orange-600 via-pink-500 to-fuchsia-600 bg-clip-text text-transparent">
                not unlimited power to spend.
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-slate-600">
              Countersign sits between autonomous agents and payment execution. Every request is checked
              against an immutable policy, routed to a human when it should be, paid through PayPal only after
              authorization, and written to a tamper-evident ledger.
            </p>

            <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
              <button
                onClick={onEnter}
                disabled={isEntering}
                className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 via-pink-500 to-fuchsia-600 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_32px_-10px_rgba(244,63,94,0.6)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-60"
              >
                <span>{primaryLabel}</span>
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </button>
              {!signedIn && (
                <button
                  onClick={onUseToken}
                  className="inline-flex items-center gap-1.5 rounded-xl px-4 py-3.5 text-xs font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
                >
                  <Key className="h-3.5 w-3.5" />
                  <span>I have an access token</span>
                </button>
              )}
            </div>
            {error && (
              <p role="alert" className="mt-3 text-xs text-rose-600">
                {error}
              </p>
            )}
            {demoMode && !signedIn && (
              <p className="mt-3 text-[11px] text-slate-400">
                Opens a pre-seeded workspace. Use the reset button in the console to start over.
              </p>
            )}

            <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-medium text-slate-500">
              {['HMAC-chained audit ledger', 'Idempotent payouts', 'Gemini-assisted, never in charge'].map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-500" strokeWidth={3} />
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <ProductPreview />
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl scroll-mt-6 px-4 pb-20 sm:px-6">
          <div className="mb-8 max-w-xl">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">How it works</div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              The agent signs the request. A human countersigns.
            </h2>
          </div>
          <ol className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div
              className="pointer-events-none absolute left-[10%] right-[10%] top-9 hidden h-px bg-gradient-to-r from-transparent via-slate-300 to-transparent lg:block"
              aria-hidden="true"
            />
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.title}
                  className="relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-600 to-pink-600 text-white shadow-sm">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="font-mono text-[10px] text-slate-300">0{index + 1}</span>
                  </div>
                  <h3 className="text-sm font-semibold">{step.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{step.body}</p>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-6 px-4 pb-20 sm:px-6">
          <div className="mb-8 max-w-xl">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-600">Built to be trusted</div>
            <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              Controls that hold up when an agent misbehaves.
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className={`mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl ${f.tone}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="text-sm font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{f.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Closing call to action */}
        <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-stone-900 via-stone-900 to-orange-950 px-6 py-12 text-center sm:px-12">
            <div
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_80%_at_25%_0%,rgba(249,115,22,0.38),transparent),radial-gradient(45%_70%_at_85%_100%,rgba(244,63,94,0.3),transparent)]"
              aria-hidden="true"
            />
            <div className="relative">
              <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                See a payment get countersigned in two minutes.
              </h2>
              <ol className="mx-auto mt-5 max-w-xl space-y-1.5 text-left text-xs text-slate-300 sm:text-sm">
                <li><span className="mr-2 font-mono text-blue-300">1</span>Run the golden demo: a $49 request queues, a $180 request is denied.</li>
                <li><span className="mr-2 font-mono text-blue-300">2</span>Approve the $49 and watch a real PayPal Sandbox payout settle.</li>
                <li><span className="mr-2 font-mono text-blue-300">3</span>Verify the ledger chain and ask the assistant why $180 was denied.</li>
              </ol>
              <button
                onClick={onEnter}
                disabled={isEntering}
                className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-100 disabled:opacity-60"
              >
                <span>{primaryLabel}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              {error && (
                <p role="alert" className="mt-3 text-xs text-rose-300">
                  {error}
                </p>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-slate-200/70">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-[11px] text-slate-400 sm:flex-row sm:px-6">
          <Logo markClassName="w-5 h-5" textClassName="text-sm" />
          <span>Sandbox prototype. Not a regulated financial service.</span>
        </div>
      </footer>
    </div>
  );
};
