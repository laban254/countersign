import React, { useState } from 'react';
import { Key, ArrowLeft } from 'lucide-react';
import { setAdminToken, setDashboardRole } from '../lib/api.ts';
import { Logo } from './Logo.tsx';

interface LoginGateProps {
  onAuthenticated: () => void;
  /** Return to the landing page. */
  onBack?: () => void;
}

/**
 * Shown when the server requires a token and the visitor chose to sign in with their own. The token
 * is kept in sessionStorage and sent as a bearer token; it is never placed in a URL.
 */
export const LoginGate: React.FC<LoginGateProps> = ({ onAuthenticated, onBack }) => {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/v1/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });

      if (!response.ok) {
        setError('That token was not recognised. Check it and try again.');
        return;
      }

      const body = await response.json().catch(() => ({}));
      setDashboardRole(body?.role === 'judge' ? 'judge' : 'admin');
      setAdminToken(token.trim());
      onAuthenticated();
    } catch {
      setError('Unable to reach the Countersign server.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#faf7f2] px-4">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_70%_at_50%_0%,rgba(249,115,22,0.16),transparent)]"
        aria-hidden="true"
      />
      <div className="relative w-full max-w-sm">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-white hover:text-slate-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to home
          </button>
        )}

        <div className="space-y-6 rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_20px_50px_-25px_rgba(15,23,42,0.35)]">
          <div className="space-y-3">
            <Logo markClassName="w-9 h-9" textClassName="text-xl" />
            <div>
              <h1 className="text-sm font-bold text-slate-900">Sign in to the control plane</h1>
              <p className="mt-0.5 text-xs text-slate-500">Enter your access token to continue.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <label className="block text-xs font-medium text-slate-700" htmlFor="admin-token">
              Access token
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-3 h-3.5 w-3.5 text-slate-400" />
              <input
                id="admin-token"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="Paste your token"
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 font-mono text-xs transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {error && (
              <p role="alert" className="text-[11px] text-rose-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={!token.trim() || isSubmitting}
              className="w-full rounded-lg bg-slate-900 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {isSubmitting ? 'Verifying...' : 'Unlock dashboard'}
            </button>
          </form>

          <p className="text-[10px] leading-relaxed text-slate-400">
            The operator configures this as <span className="font-mono">ADMIN_TOKEN</span>. Agent API
            credentials are separate bearer tokens issued once at registration.
          </p>
        </div>
      </div>
    </div>
  );
};
