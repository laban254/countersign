import React, { useState } from 'react';
import { apiFetch, notify, responseError, getDashboardRole, DEMO_RESTRICTED_HINT } from '../lib/api.ts';
import { Agent, Policy } from '../domain/types.ts';
import { Bot, Plus, Copy, Check, Pause, Play, ShieldAlert, Key, RotateCw, AlertTriangle, X } from 'lucide-react';

interface AgentsViewProps {
  agents: Agent[];
  policies: Policy[];
  onRefresh: () => void;
}

export const AgentsView: React.FC<AgentsViewProps> = ({ agents, policies, onRefresh }) => {
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [newAgentResult, setNewAgentResult] = useState<{ agent: Agent; rawTokenOnce: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Rotate Token State
  const [rotatingAgent, setRotatingAgent] = useState<Agent | null>(null);
  const [rotatedTokenResult, setRotatedTokenResult] = useState<string | null>(null);

  // Revoke Agent with Name Confirmation
  const [revokingAgent, setRevokingAgent] = useState<Agent | null>(null);
  const [revokeConfirmationText, setRevokeConfirmationText] = useState('');

  // Policy Switch
  const isJudge = getDashboardRole() === 'judge';
  const policyVersionLabel = (versionId: string | null) => {
    if (!versionId) return 'None';
    for (const policy of policies) {
      const found = policy.versions.find((v) => v.id === versionId);
      if (found) return `v${found.version} (${policy.name})`;
    }
    return versionId;
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    try {
      const res = await apiFetch('/api/v1/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      setNewAgentResult(data);
      setName('');
      setDescription('');
      onRefresh();
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Registration failed', 'error');
    }
  };

  const handleToggleStatus = async (agent: Agent) => {
    const nextStatus = agent.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
    try {
      const res = await apiFetch(`/api/v1/agents/${agent.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        if (res.status !== 403) notify(await responseError(res, 'Could not update the agent'), 'error');
        return;
      }
      notify(nextStatus === 'PAUSED' ? `${agent.name} paused` : `${agent.name} resumed`);
      onRefresh();
    } catch {
      notify('Could not reach the server', 'error');
    }
  };

  const handleRotateToken = async (agent: Agent) => {
    try {
      const res = await apiFetch(`/api/v1/agents/${agent.id}/rotate-token`, {
        method: 'POST',
      });
      if (!res.ok) {
        setRotatingAgent(null);
        if (res.status !== 403) notify(await responseError(res, 'Token rotation failed'), 'error');
        return;
      }
      const data = await res.json();
      setRotatedTokenResult(data.rawTokenOnce);
      onRefresh();
    } catch {
      notify('Could not reach the server', 'error');
    }
  };

  const handleConfirmRevoke = async () => {
    if (!revokingAgent || revokeConfirmationText !== revokingAgent.name) return;
    try {
      const res = await apiFetch(`/api/v1/agents/${revokingAgent.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'REVOKED' }),
      });
      setRevokingAgent(null);
      setRevokeConfirmationText('');
      if (!res.ok) {
        if (res.status !== 403) notify(await responseError(res, 'Revoke failed'), 'error');
        return;
      }
      notify(`${revokingAgent.name} revoked`);
      onRefresh();
    } catch {
      notify('Could not reach the server', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">AI Agent Identities</h2>
          <p className="text-xs text-slate-500">
            Registered autonomous agents authenticated via hashed bearer tokens
          </p>
        </div>
        <button
          onClick={() => {
            setNewAgentResult(null);
            setIsRegisterOpen(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Register New Agent</span>
        </button>
      </div>

      {isJudge && (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          Rotating tokens and pausing or revoking agents are turned off in the public demo so the shared
          environment keeps working for the next visitor. You can still register new agents.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agents.map((agent) => {
          const isActive = agent.status === 'ACTIVE';
          const isPaused = agent.status === 'PAUSED';
          const isRevoked = agent.status === 'REVOKED';

          return (
            <div
              key={agent.id}
              className="bg-white rounded-xl border border-slate-200/90 shadow-xs p-5 space-y-4"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Bot className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{agent.name}</h3>
                    <span className="text-[11px] font-mono text-slate-400">{agent.id}</span>
                  </div>
                </div>

                <div>
                  {isActive && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> ACTIVE
                    </span>
                  )}
                  {isPaused && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                      PAUSED
                    </span>
                  )}
                  {isRevoked && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                      REVOKED
                    </span>
                  )}
                </div>
              </div>

              {agent.description && (
                <p className="text-xs text-slate-600 leading-relaxed">{agent.description}</p>
              )}

              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200/80 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Token Prefix:</span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-slate-800">{agent.tokenPrefix}…</span>
                    {!isRevoked && (
                      <button
                        disabled={isJudge}
                        title={isJudge ? DEMO_RESTRICTED_HINT : undefined}
                        onClick={() => {
                          setRotatedTokenResult(null);
                          setRotatingAgent(agent);
                        }}
                        className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed"
                      >
                        <RotateCw className="w-2.5 h-2.5" /> Rotate
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Active Policy Version:</span>
                  <span className="font-mono text-blue-700 font-semibold">{policyVersionLabel(agent.activePolicyVersionId)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Last Activity:</span>
                  <span className="font-mono text-slate-700">
                    {agent.lastUsedAt ? new Date(agent.lastUsedAt).toLocaleTimeString() : 'Never'}
                  </span>
                </div>
              </div>

              {!isRevoked && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    disabled={isJudge}
                    title={isJudge ? DEMO_RESTRICTED_HINT : undefined}
                    onClick={() => handleToggleStatus(agent)}
                    className="flex-1 py-1.5 px-3 rounded text-xs font-medium border border-slate-200 hover:bg-slate-50 text-slate-700 transition flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isActive ? (
                      <>
                        <Pause className="w-3.5 h-3.5 text-amber-600" /> Pause Agent
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 text-emerald-600" /> Resume Agent
                      </>
                    )}
                  </button>
                  <button
                    disabled={isJudge}
                    title={isJudge ? DEMO_RESTRICTED_HINT : undefined}
                    onClick={() => {
                      setRevokingAgent(agent);
                      setRevokeConfirmationText('');
                    }}
                    className="py-1.5 px-3 rounded text-xs font-medium text-rose-600 hover:bg-rose-50 border border-rose-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Revoke
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Registration Modal */}
      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            {!newAgentResult ? (
              <form onSubmit={handleRegister} className="space-y-4">
                <h3 className="text-base font-bold text-slate-900">Register AI Agent</h3>
                <p className="text-xs text-slate-500">
                  Each agent receives an immutable ID and a high-entropy API token displayed once.
                </p>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Agent Name
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. procurement-agent"
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Description / Scope
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Handles weekly API subscription renewals"
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsRegisterOpen(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded"
                  >
                    Generate Agent Credentials
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <Key className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Agent Token Generated</h3>
                <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded border border-amber-200">
                  Save this token now. It is shown only once and cannot be retrieved later. Only the HMAC-SHA256 hash is stored on the server.
                </p>

                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    Bearer Token
                  </div>
                  <div className="flex items-center gap-2 p-2.5 bg-slate-100 rounded border border-slate-300 font-mono text-xs text-slate-800 break-all">
                    <span>{newAgentResult.rawTokenOnce}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(newAgentResult.rawTokenOnce);
                        setCopiedToken(true);
                        setTimeout(() => setCopiedToken(false), 2000);
                      }}
                      className="shrink-0 p-1 text-slate-500 hover:text-slate-800"
                    >
                      {copiedToken ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => setIsRegisterOpen(false)}
                    className="px-4 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded"
                  >
                    I have safely stored this token
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Rotate Token Modal */}
      {rotatingAgent && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            {!rotatedTokenResult ? (
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                  <RotateCw className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Rotate Authentication Token?</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Rotating the token for <strong>{rotatingAgent.name}</strong> will immediately invalidate all existing credentials. Active workflows must be updated with the new token.
                </p>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setRotatingAgent(null)}
                    className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleRotateToken(rotatingAgent)}
                    className="px-4 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white rounded"
                  >
                    Generate New Secret
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <Check className="w-5 h-5 stroke-[2.5]" />
                </div>
                <h3 className="text-base font-bold text-slate-900">New Token Active</h3>
                <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded border border-amber-200">
                  Previous credentials are now invalid. Copy this new token now:
                </p>

                <div className="flex items-center gap-2 p-2.5 bg-slate-100 rounded border border-slate-300 font-mono text-xs text-slate-800 break-all">
                  <span>{rotatedTokenResult}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(rotatedTokenResult);
                      setCopiedToken(true);
                      setTimeout(() => setCopiedToken(false), 2000);
                    }}
                    className="shrink-0 p-1 text-slate-500 hover:text-slate-800"
                  >
                    {copiedToken ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      setRotatingAgent(null);
                      setRotatedTokenResult(null);
                    }}
                    className="px-4 py-1.5 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Revoke Agent Friction Dialog (§12.6.4: irreversible actions deserve friction) */}
      {revokingAgent && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
            <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Revoke Agent Identity?</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              This action is permanent and cannot be undone. All future requests from this agent will fail closed with <code className="font-mono bg-slate-100 text-rose-800 px-1 py-0.5 rounded">AGENT_REVOKED</code>.
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Type <span className="font-mono font-bold text-slate-900">{revokingAgent.name}</span> to confirm:
              </label>
              <input
                type="text"
                value={revokeConfirmationText}
                onChange={(e) => setRevokeConfirmationText(e.target.value)}
                placeholder={revokingAgent.name}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded font-mono focus:ring-1 focus:ring-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRevokingAgent(null)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRevoke}
                disabled={revokeConfirmationText !== revokingAgent.name}
                className="px-4 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white rounded shadow-xs"
              >
                Permanently Revoke Agent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
