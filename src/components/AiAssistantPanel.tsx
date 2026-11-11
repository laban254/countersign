import React, { useState } from 'react';
import { apiFetch } from '../lib/api.ts';
import { X, Sparkles, Send, ShieldAlert, CheckCircle, Bot, ArrowRight } from 'lucide-react';
import { DecisionCard } from './DecisionCard.tsx';
import { PolicyEvaluationResult } from '../domain/types.ts';

interface AiAssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  role: 'user' | 'assistant';
  text: string;
  references?: { id: string; label: string; type: string }[];
  simulationResult?: PolicyEvaluationResult;
}

/**
 * Renders the small markdown subset assistants emit: **bold**, `code` and "* " bullets.
 * Built from React elements (never raw HTML), so model output cannot inject markup.
 */
const RichText: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        const bullet = /^\s*[*-]\s+/.test(line);
        const body = bullet ? line.replace(/^\s*[*-]\s+/, '') : line;
        const parts = body.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
        return (
          <div key={i} className={bullet ? 'flex gap-2 pl-1' : undefined}>
            {bullet && <span aria-hidden="true">•</span>}
            <span>
              {parts.map((part, j) =>
                part.startsWith('**') && part.endsWith('**') ? (
                  <strong key={j} className="font-semibold text-slate-900">
                    {part.slice(2, -2)}
                  </strong>
                ) : part.startsWith('`') && part.endsWith('`') ? (
                  <code key={j} className="rounded bg-slate-200/70 px-1 py-0.5 font-mono text-[11px] text-slate-800">
                    {part.slice(1, -1)}
                  </code>
                ) : (
                  <React.Fragment key={j}>{part}</React.Fragment>
                )
              )}
            </span>
          </div>
        );
      })}
    </>
  );
};

export const AiAssistantPanel: React.FC<AiAssistantPanelProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      text: "Hello, I am Countersign's financial control assistant. I can inspect stored policy evaluations, explain why payments were denied, or simulate how a payment request would be evaluated before an agent submits it.",
      references: [
        { id: 'agt_operations_001', label: 'operations-agent', type: 'agent' },
      ],
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSend = async (queryText?: string) => {
    const textToSend = queryText || input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', text: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    if (!queryText) setInput('');
    setIsLoading(true);

    try {
      const res = await apiFetch('/api/v1/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: textToSend }),
      });

      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: data.answer,
          references: data.recordReferences,
          simulationResult: data.simulationResult,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: 'Unable to reach assistant service. Countersign deterministic enforcement remains fully active.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const presetQueries = [
    'Why was the $180 payment denied?',
    'What if this agent requested $80?',
    'Summarize spend this month',
  ];

  return (
    <div role="dialog" aria-label="AI Assistant" className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-white shadow-2xl border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Control Plane Assistant</div>
            <div className="text-[10px] text-slate-500 flex items-center gap-1">
              <ShieldAlert className="w-3 h-3 text-amber-500" />
              <span>Read-only · cannot approve or execute payouts</span>
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-200"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Preset Chips */}
      <div className="px-4 py-2.5 bg-slate-50/60 border-b border-slate-100 flex flex-wrap gap-1.5">
        {presetQueries.map((q, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(q)}
            className="text-[11px] px-2.5 py-1 rounded-full bg-white text-slate-700 border border-slate-200 hover:border-purple-300 hover:text-purple-700 transition"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[90%] p-3.5 rounded-lg text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-slate-900 text-white font-medium'
                  : 'bg-slate-50 border border-slate-200 text-slate-800'
              }`}
            >
              <div className="space-y-1.5">{m.role === 'user' ? m.text : <RichText text={m.text} />}</div>

              {/* Simulation Result Card if dry-run happened */}
              {m.simulationResult && (
                <div className="mt-3 pt-3 border-t border-slate-200">
                  <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">
                    Live Dry-Run Evaluation:
                  </div>
                  <DecisionCard
                    customChecks={m.simulationResult.checks}
                    decision={m.simulationResult.decision}
                    explanation={m.simulationResult.explanation}
                    policyVersion={m.simulationResult.policyVersion}
                    compact
                  />
                </div>
              )}
            </div>

            {/* Citations / Grounded Record References */}
            {m.references && m.references.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {m.references.map((ref, rIdx) => (
                  <span
                    key={rIdx}
                    className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200"
                  >
                    ref: {ref.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="text-xs text-slate-400 italic flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
            Evaluating policy state and stored records...
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3.5 border-t border-slate-200 bg-white">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask why a payment was denied, simulate an amount..."
            className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="p-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-md transition"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
