import React, { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';

interface AiFabProps {
  onOpen: () => void;
  /** Hide while the assistant (or another overlay) is open. */
  hidden?: boolean;
}

const HINT_KEY = 'countersign_ai_hint_dismissed';

function hintAlreadyDismissed(): boolean {
  try {
    return sessionStorage.getItem(HINT_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Floating "Ask AI" button available on every tab. It shows a one-time hint explaining what the
 * assistant can do (and that it cannot approve payments).
 */
export const AiFab: React.FC<AiFabProps> = ({ onOpen, hidden = false }) => {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (hintAlreadyDismissed()) return;
    const timer = setTimeout(() => setShowHint(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  const dismissHint = () => {
    setShowHint(false);
    try {
      sessionStorage.setItem(HINT_KEY, '1');
    } catch {
      // ignore
    }
  };

  const handleOpen = () => {
    dismissHint();
    onOpen();
  };

  if (hidden) return null;

  return (
    <div className="fixed bottom-5 right-4 z-40 flex flex-col items-end gap-3 sm:right-6">
      {showHint && (
        <div
          role="status"
          className="relative w-60 rounded-2xl border border-slate-200 bg-white p-3.5 pr-8 text-xs leading-relaxed text-slate-600 shadow-[0_16px_40px_-16px_rgba(15,23,42,0.35)]"
        >
          <span className="font-semibold text-slate-900">Ask the assistant</span>
          <span className="block">
            Why a payment was denied, or what would happen at a different amount. It can explain and
            simulate, but never approve.
          </span>
          <button
            onClick={dismissHint}
            aria-label="Dismiss hint"
            className="absolute right-2 top-2 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <span
            className="absolute -bottom-1.5 right-7 h-3 w-3 rotate-45 border-b border-r border-slate-200 bg-white"
            aria-hidden="true"
          />
        </div>
      )}

      <button
        onClick={handleOpen}
        aria-label="Open AI assistant"
        className="group relative inline-flex h-14 items-center gap-2 rounded-full bg-gradient-to-br from-violet-600 to-fuchsia-600 px-4 text-sm font-semibold text-white shadow-[0_14px_34px_-10px_rgba(124,58,237,0.75)] transition hover:-translate-y-0.5 hover:brightness-110 sm:px-5"
      >
        <span
          className="absolute inset-0 -z-10 animate-ping rounded-full bg-violet-500/30 [animation-duration:2.8s]"
          aria-hidden="true"
        />
        <Sparkles className="h-5 w-5" />
        <span className="hidden sm:inline">Ask AI</span>
      </button>
    </div>
  );
};
