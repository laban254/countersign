import React, { useState } from 'react';
import { apiFetch, fetchDemoAccess } from '../lib/api.ts';
import { Agent, Recipient } from '../domain/types.ts';
import { Terminal, Play, Send, RefreshCw, CheckCircle, AlertTriangle, XCircle, Code } from 'lucide-react';

interface SimulatorViewProps {
  agents: Agent[];
  recipients: Recipient[];
  onRefreshAll: () => void;
}

export const SimulatorView: React.FC<SimulatorViewProps> = ({
  agents,
  recipients,
  onRefreshAll,
}) => {
  const [selectedAgentId, setSelectedAgentId] = useState(agents[0]?.id || 'agt_operations_001');
  const [agentToken, setAgentToken] = useState('');
  const [demoAgentToken, setDemoAgentToken] = useState<string | null>(null);

  // In public demo mode the server can hand out the seeded agent token with one click.
  React.useEffect(() => {
    fetchDemoAccess().then((demo) => {
      if (demo.enabled && demo.agentToken) setDemoAgentToken(demo.agentToken);
    });
  }, []);
  const [recipientEmail, setRecipientEmail] = useState(
    recipients[0]?.email || 'vendor-sandbox@example.test'
  );
  const [amountStr, setAmountStr] = useState('49.00');
  const [description, setDescription] = useState('Monthly database cluster hosting');
  const [invoiceRef, setInvoiceRef] = useState('INV-2026-1105');
  const [idempotencyKey, setIdempotencyKey] = useState(`key-${Date.now().toString().slice(-4)}`);

  const [isLoading, setIsLoading] = useState(false);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [lastHeaders, setLastHeaders] = useState<Record<string, string>>({});
  const [statusCode, setStatusCode] = useState<number | null>(null);

  const hasToken = agentToken.trim().length > 0;
  const activeAgent = agents.find((a) => a.id === selectedAgentId) || agents[0];

  const handleDispatchIntent = async (
    overrideAmount?: string,
    overrideDesc?: string,
    overrideRef?: string,
    overrideIdempotencyKey?: string
  ) => {
    setIsLoading(true);
    setLastResponse(null);
    setStatusCode(null);

    const amt = overrideAmount || amountStr;
    const desc = overrideDesc || description;
    const inv = overrideRef || invoiceRef;
    const requestKey = overrideIdempotencyKey || idempotencyKey;

    try {
      const res = await apiFetch('/api/v1/agent/payment-intents', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${agentToken.trim()}`,
          'Idempotency-Key': requestKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          agent_id: activeAgent?.id,
          recipient: {
            name: recipients.find((r) => r.email === recipientEmail)?.displayName || 'Vendor Recipient',
            email: recipientEmail,
          },
          amount: {
            value: amt,
            currency: 'USD',
          },
          description: desc,
          invoice_reference: inv,
          metadata: {
            source: 'Countersign Simulator',
          },
        }),
      });

      setStatusCode(res.status);
      const isReplay = res.headers.get('Idempotent-Replay');
      setLastHeaders({
        'content-type': res.headers.get('content-type') || 'application/json',
        'idempotent-replay': isReplay || 'false',
        status: `${res.status} ${res.statusText}`,
      });

      const body = await res.json();
      setLastResponse(body);
      onRefreshAll();
    } catch (err: unknown) {
      setLastResponse({ error: String(err) });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Terminal className="w-5 h-5 text-slate-700" />
            <span>Agent Payment Intent Simulator</span>
          </h2>
          <p className="text-xs text-slate-500">
            Interactive client simulating autonomous agents dispatching authenticated payment requests
          </p>
        </div>
      </div>

      {/* Quick Scenarios Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Scenario 1: $49 -> Pending Approval */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-bold font-mono whitespace-nowrap text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              Scenario 1: Threshold
            </span>
            <span className="text-xs font-mono font-bold text-slate-900">$49.00 USD</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Within the $100 txn limit and $120 daily cap, but exceeds the countersign threshold. Queues for human review.
          </p>
          <button
            onClick={() => {
              handleDispatchIntent(
                '49.00',
                'November software subscription',
                'INV-2026-1101',
                `scenario-${Date.now()}-${Math.random().toString(36).slice(2)}`
              );
            }}
            disabled={isLoading || !hasToken}
            className="w-full py-2 px-3 rounded-md text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed bg-slate-900 hover:bg-slate-800 text-white transition flex items-center justify-center gap-1.5 shadow-xs"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Dispatch $49.00</span>
          </button>
        </div>

        {/* Scenario 2: $180 -> Hard Limit Denied */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-bold font-mono whitespace-nowrap text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
              Scenario 2: Limit Breach
            </span>
            <span className="text-xs font-mono font-bold text-slate-900">$180.00 USD</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Exceeds the $100.00 per-transaction cap. The deterministic policy engine denies immediately. Money never moves.
          </p>
          <button
            onClick={() => {
              handleDispatchIntent(
                '180.00',
                'Server cluster reservation',
                'INV-2026-1102',
                `scenario-${Date.now()}-${Math.random().toString(36).slice(2)}`
              );
            }}
            disabled={isLoading || !hasToken}
            className="w-full py-2 px-3 rounded-md text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed bg-rose-600 hover:bg-rose-500 text-white transition flex items-center justify-center gap-1.5 shadow-xs"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Dispatch $180.00</span>
          </button>
        </div>

        {/* Scenario 3: $80 -> Daily Cap Check */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-bold font-mono whitespace-nowrap text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
              Scenario 3: Aggregate Cap
            </span>
            <span className="text-xs font-mono font-bold text-slate-900">$80.00 USD</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Passes per-transaction limit, but if $49 has already settled, $49 + $80 = $129, breaching the $120 daily cap!
          </p>
          <button
            onClick={() => {
              handleDispatchIntent(
                '80.00',
                'Dev infrastructure quota expansion',
                'INV-2026-1103',
                `scenario-${Date.now()}-${Math.random().toString(36).slice(2)}`
              );
            }}
            disabled={isLoading || !hasToken}
            className="w-full py-2 px-3 rounded-md text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed bg-amber-600 hover:bg-amber-500 text-white transition flex items-center justify-center gap-1.5 shadow-xs"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Dispatch $80.00</span>
          </button>
        </div>

        {/* Scenario 4: Concurrency Stress Test */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-bold font-mono whitespace-nowrap text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
              Scenario 4: Race Condition
            </span>
            <span className="text-xs font-mono font-bold text-slate-900">10× $20 USD</span>
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            Fires 10 concurrent requests to test transactional budget reservations. Exactly 6 succeed up to the $120 cap!
          </p>
          <button
            onClick={async () => {
              setIsLoading(true);
              const batchPromises = Array.from({ length: 10 }).map((_, i) =>
                apiFetch('/api/v1/agent/payment-intents', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${agentToken.trim()}`,
                    'Content-Type': 'application/json',
                    'Idempotency-Key': `race-${Date.now()}-${i}`,
                  },
                  body: JSON.stringify({
                    agent_id: activeAgent?.id,
                    recipient: { name: recipients[0]?.displayName || 'Second Signature Cloud', email: recipients[0]?.email || recipientEmail },
                    amount: { value: '20.00', currency: 'USD' },
                    description: `Concurrent batch item #${i + 1}`,
                    invoice_reference: `INV-CONCUR-${i + 1}`,
                  }),
                }).then((r) => r.json())
              );
              const results = await Promise.all(batchPromises);
              setIsLoading(false);
              const allowed = results.filter((r) => r.decision === 'AUTHORIZED' || r.decision === 'PENDING_APPROVAL').length;
              const denied = results.filter((r) => r.decision === 'DENIED').length;
              setStatusCode(200);
              setLastResponse({
                summary: `Concurrency Test Completed: ${allowed} Allowed/Reserved, ${denied} Denied`,
                results,
              });
              onRefreshAll();
            }}
            disabled={isLoading || !hasToken}
            className="w-full py-2 px-3 rounded-md text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed bg-purple-600 hover:bg-purple-500 text-white transition flex items-center justify-center gap-1.5 shadow-xs"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Run 10× Concurrency</span>
          </button>
        </div>
      </div>

      {/* Custom Intent Dispatcher & Live Log */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Form (5 cols) */}
        <div className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Custom Request Parameters</h3>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Select Agent
            </label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full p-2 text-xs border border-slate-300 rounded bg-white font-mono"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.status})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Agent Bearer Token (required; issued once at registration)
            </label>
            <input
              type="password"
              value={agentToken}
              onChange={(e) => setAgentToken(e.target.value)}
              placeholder="cs_agt_..._secret (paste the one-time token)"
              className="w-full p-2 text-xs border border-slate-300 rounded font-mono"
            />
            {demoAgentToken && !hasToken && (
              <button
                type="button"
                onClick={() => setAgentToken(demoAgentToken)}
                className="mt-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-blue-600 hover:bg-blue-700 text-white"
              >
                Use demo agent token
              </button>
            )}
            {!hasToken && (
              <p className="mt-1 text-[11px] text-amber-700">
                {demoAgentToken
                  ? 'Click "Use demo agent token" above, or paste your own to enable requests.'
                  : <>Paste an agent token to enable requests. Tokens look like <span className="font-mono">cs_&lt;agentId&gt;_&lt;secret&gt;</span>; create one in AI Agents.</>}
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Recipient Email (PayPal Receiver)
            </label>
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              className="w-full p-2 text-xs border border-slate-300 rounded font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Amount (USD)
              </label>
              <input
                type="text"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="w-full p-2 text-xs border border-slate-300 rounded font-mono font-bold"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Invoice Reference
              </label>
              <input
                type="text"
                value={invoiceRef}
                onChange={(e) => setInvoiceRef(e.target.value)}
                className="w-full p-2 text-xs border border-slate-300 rounded font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Description / Payment Memo
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-2 text-xs border border-slate-300 rounded"
            />
          </div>

          <div>
            <div className="flex justify-between items-center text-xs font-medium text-slate-700 mb-1">
              <span>Idempotency-Key Header</span>
              <button
                type="button"
                onClick={() => setIdempotencyKey(`key-${Date.now().toString().slice(-4)}`)}
                className="text-[11px] text-blue-600 hover:underline"
              >
                Regenerate
              </button>
            </div>
            <input
              type="text"
              value={idempotencyKey}
              onChange={(e) => setIdempotencyKey(e.target.value)}
              className="w-full p-2 text-xs border border-slate-300 rounded font-mono text-slate-600"
            />
          </div>

          <button
            onClick={() => handleDispatchIntent()}
            disabled={isLoading || !hasToken}
            className="w-full py-2.5 px-4 rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white shadow-xs transition flex items-center justify-center gap-2"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isLoading ? 'Evaluating Policy...' : 'POST /api/v1/agent/payment-intents'}</span>
          </button>
        </div>

        {/* Live HTTP Response Inspector (7 cols) */}
        <div className="lg:col-span-7 bg-slate-900 text-slate-200 rounded-xl p-5 shadow-xs font-mono text-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
              <span className="text-slate-400 text-xs font-sans">Live HTTP Response Inspector</span>
            </div>
            {statusCode && (
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  statusCode === 201
                    ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700'
                    : 'bg-rose-900/60 text-rose-300 border border-rose-700'
                }`}
              >
                HTTP {statusCode}
              </span>
            )}
          </div>

          {lastResponse ? (
            <div className="space-y-4">
              {/* Response Headers */}
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                  Response Headers
                </div>
                <div className="bg-slate-950 p-3 rounded border border-slate-800 space-y-1 text-[11px] text-slate-400">
                  {Object.entries(lastHeaders).map(([k, v]) => (
                    <div key={k}>
                      <span className="text-slate-500">{k}:</span> <span className="text-slate-300">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Response Body */}
              <div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">
                  JSON Response Body
                </div>
                <pre className="bg-slate-950 p-3.5 rounded border border-slate-800 overflow-x-auto text-emerald-400 max-h-72 text-[11px] leading-relaxed">
                  {JSON.stringify(lastResponse, null, 2)}
                </pre>
              </div>
            </div>
          ) : (
            <div className="py-20 text-center text-slate-500">
              Click any of the scenarios or submit a custom intent to inspect the live response, reason codes, and idempotency headers.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
