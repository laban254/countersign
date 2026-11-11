import { GoogleGenAI } from '@google/genai';
import { store } from '../store.ts';
import { evaluatePolicy } from '../../domain/policy/evaluate.ts';
import {
  validatePolicyVersionInput,
  ValidatedPolicyVersionInput,
  PolicyVersionInput,
} from '../../domain/policy/validate.ts';
import { toMinor, formatUSD } from '../../domain/money.ts';
import { PolicyEvaluationResult } from '../../domain/types.ts';

/**
 * Every configured Gemini key, primary first, de-duplicated. Set GEMINI_API_KEY, optionally
 * GEMINI_API_KEY_2 (or a comma-separated GEMINI_API_KEYS). A second key from a different Google
 * project adds free-tier quota, because quota is counted per project.
 */
export function collectApiKeys(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = [env.GEMINI_API_KEY, env.AI_API_KEY, env.GEMINI_API_KEY_2, ...(env.GEMINI_API_KEYS ?? '').split(',')];
  return Array.from(new Set(raw.map((key) => (key ?? '').trim()).filter(Boolean)));
}

const aiEnabled = process.env.AI_ENABLED !== 'false';
const aiModel = process.env.AI_MODEL || 'gemini-3.5-flash';
// Tried in order when the primary model is unavailable, overloaded or slow. Set AI_MODEL_FALLBACKS
// (comma-separated) to override.
const fallbackModels = (process.env.AI_MODEL_FALLBACKS ?? 'gemini-3.6-flash,gemini-3-flash-preview,gemini-3.1-flash-lite')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const modelChain = Array.from(new Set([aiModel, ...fallbackModels]));
// Google rejects client deadlines under 10 seconds.
const AI_CALL_TIMEOUT_MS = 12_000;

const aiClients: GoogleGenAI[] = [];
if (aiEnabled) {
  for (const apiKey of collectApiKeys()) {
    try {
      // v1beta: the current and preview Gemini models are served there, not on v1.
      aiClients.push(new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1beta' } }));
    } catch (err) {
      console.warn('[Countersign AI] Failed to initialize a GoogleGenAI client:', err);
    }
  }
}
const aiClient: GoogleGenAI | null = aiClients[0] ?? null;

function isQuotaError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  const message = err instanceof Error ? err.message : String(err);
  return status === 429 || /RESOURCE_EXHAUSTED|"code"\s*:\s*429/.test(message);
}

type GenerateParams = Omit<Parameters<GoogleGenAI['models']['generateContent']>[0], 'model'>;

/**
 * Call Gemini, moving to the next model in the chain if one is retired, overloaded (503) or too slow.
 * Each attempt is time-boxed so a hung model cannot freeze the console. Throws the last error if all
 * models fail; callers then fall back to deterministic behaviour.
 */
async function generateWithFallback(params: GenerateParams) {
  if (aiClients.length === 0) throw new Error('AI client is not configured');
  let lastError: unknown;
  for (const model of modelChain) {
    for (let k = 0; k < aiClients.length; k++) {
      try {
        return await aiClients[k].models.generateContent({
          ...params,
          model,
          config: { ...params.config, httpOptions: { timeout: AI_CALL_TIMEOUT_MS } },
        });
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message.slice(0, 120) : String(err);
        // Out of quota: a key from another project may still have some. Anything else (timeout,
        // overload, retired model) won't be fixed by another key, so move on to the next model.
        if (isQuotaError(err) && k < aiClients.length - 1) {
          console.warn(`[Countersign AI] ${model} rate-limited on key ${k + 1}, trying key ${k + 2}`);
          continue;
        }
        console.warn(`[Countersign AI] ${model} failed, trying next model: ${message}`);
        break;
      }
    }
  }
  throw lastError;
}

// Remember recent model answers so repeated identical requests don't spend (rate-limited) API quota.
// Only successful model output is cached, never the deterministic fallback.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const aiCache = new Map<string, { value: unknown; expires: number }>();

function cacheGet<T>(key: string): T | undefined {
  const hit = aiCache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    aiCache.delete(key);
    return undefined;
  }
  return hit.value as T;
}

function cacheSet(key: string, value: unknown): void {
  if (aiCache.size >= 200) {
    const oldest = aiCache.keys().next().value;
    if (oldest !== undefined) aiCache.delete(oldest);
  }
  aiCache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

const normalizeKey = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ');

export interface PolicyDraftProposal extends ValidatedPolicyVersionInput {
  rationale: string;
  isAiGenerated: boolean;
}

function buildProposal(
  candidate: PolicyVersionInput,
  rationale: string,
  isAiGenerated: boolean
): PolicyDraftProposal | null {
  const validation = validatePolicyVersionInput(candidate);
  if (!validation.ok) {
    console.warn('[Countersign AI] Rejected policy proposal:', validation.errors);
    return null;
  }
  return { ...validation.value, rationale, isAiGenerated };
}

export function defaultPolicyProposal(rationale: string): PolicyDraftProposal {
  const proposal = buildProposal(
    {
      maxTransactionMinor: 10000,
      dailyLimitMinor: 12000,
      monthlyLimitMinor: 30000,
      approvalMode: 'ABOVE_THRESHOLD',
      approvalThresholdMinor: 4000,
      allowNewRecipients: false,
      currencyAllowlist: ['USD'],
    },
    rationale,
    false
  );

  if (!proposal) {
    throw new Error('Default policy proposal failed validation');
  }
  return proposal;
}

export function fallbackParsePolicy(text: string): PolicyDraftProposal {
  const lower = text.toLowerCase();

  const txnMatch =
    text.match(/(?:transaction|per transaction|single|each|txn|up to)[^\d]*\$?(\d+(?:\.\d{2})?)/i) ||
    text.match(/\$?(\d+(?:\.\d{2})?)\s*(?:per transaction|each transaction)/i);
  const dailyMatch =
    text.match(/(?:daily|per day|day)[^\d]*\$?(\d+(?:\.\d{2})?)/i) ||
    text.match(/\$?(\d+(?:\.\d{2})?)\s*(?:daily|per day|a day)/i);
  const monthlyMatch =
    text.match(/(?:monthly|per month|month)[^\d]*\$?(\d+(?:\.\d{2})?)/i) ||
    text.match(/\$?(\d+(?:\.\d{2})?)\s*(?:monthly|per month|a month)/i);
  const thresholdMatch = text.match(
    /(?:approval|approval above|above|threshold)[^\d]*\$?(\d+(?:\.\d{2})?)/i
  );

  const maxTxn = txnMatch ? toMinor(txnMatch[1]) : 10000;
  const daily = dailyMatch ? toMinor(dailyMatch[1]) : 12000;
  const monthly = monthlyMatch ? toMinor(monthlyMatch[1]) : 30000;

  let approvalMode: 'NEVER' | 'ABOVE_THRESHOLD' | 'ALWAYS' = 'ABOVE_THRESHOLD';
  let threshold: number | null = thresholdMatch ? toMinor(thresholdMatch[1]) : 4000;

  if (
    lower.includes('always require approval') ||
    lower.includes('require approval for all') ||
    lower.includes('approve every')
  ) {
    approvalMode = 'ALWAYS';
    threshold = null;
  } else if (
    lower.includes('never require approval') ||
    lower.includes('no approval needed')
  ) {
    approvalMode = 'NEVER';
    threshold = null;
  }

  const allowNewRecipients =
    lower.includes('allow new recipients') &&
    !lower.includes('do not allow new recipients') &&
    !lower.includes("don't allow new recipients");

  const proposal = buildProposal(
    {
      maxTransactionMinor: maxTxn,
      dailyLimitMinor: daily,
      monthlyLimitMinor: monthly,
      approvalMode,
      approvalThresholdMinor: threshold,
      allowNewRecipients,
      currencyAllowlist: ['USD'],
    },
    'Extracted financial limits and approval thresholds from instruction text.',
    false
  );

  // If the text produced an inconsistent configuration, fall back to the
  // validated demo defaults rather than persisting an unsafe policy.
  return (
    proposal ??
    defaultPolicyProposal(
      'Instruction text could not be parsed into a consistent policy; using validated defaults.'
    )
  );
}

export async function draftPolicyFromNL(promptText: string): Promise<PolicyDraftProposal> {
  if (!aiClient) {
    return fallbackParsePolicy(promptText);
  }

  const cacheKey = `draft:${normalizeKey(promptText)}`;
  const cached = cacheGet<PolicyDraftProposal>(cacheKey);
  if (cached) return cached;

  try {
    const systemInstruction = `You are the policy drafting engine for Countersign, an AI agent financial authorization system.
Given a user's natural language policy instructions, extract financial limits into exact JSON matching this schema:
{
  "maxTransactionMinor": integer cents (e.g. 10000 for $100.00),
  "dailyLimitMinor": integer cents (e.g. 12000 for $120.00),
  "monthlyLimitMinor": integer cents (e.g. 30000 for $300.00),
  "approvalMode": "NEVER" | "ABOVE_THRESHOLD" | "ALWAYS",
  "approvalThresholdMinor": integer cents or null (required for ABOVE_THRESHOLD),
  "allowNewRecipients": boolean,
  "currencyAllowlist": ["USD"],
  "rationale": "One sentence summarizing the extracted rules"
}
Output strict raw JSON only without markdown formatting.`;

    const response = await generateWithFallback({
      contents: [{ role: 'user', parts: [{ text: promptText }] }],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });

    const outputText = response.text?.trim() || '';
    const parsed = JSON.parse(outputText);

    const proposal = buildProposal(
      {
        maxTransactionMinor: Number(parsed.maxTransactionMinor),
        dailyLimitMinor: Number(parsed.dailyLimitMinor),
        monthlyLimitMinor: Number(parsed.monthlyLimitMinor),
        approvalMode: parsed.approvalMode,
        approvalThresholdMinor: parsed.approvalThresholdMinor,
        allowNewRecipients: Boolean(parsed.allowNewRecipients),
        currencyAllowlist: Array.isArray(parsed.currencyAllowlist)
          ? parsed.currencyAllowlist
          : ['USD'],
      },
      parsed.rationale || 'Structured policy proposal generated by the model.',
      true
    );

    if (proposal) {
      cacheSet(cacheKey, proposal);
      return proposal;
    }
    return fallbackParsePolicy(promptText);
  } catch (err) {
    console.warn(
      '[Countersign AI] Policy drafting model call error, falling back to rule-based parser:',
      err
    );
    return fallbackParsePolicy(promptText);
  }
}

export function simulatePolicy(params: {
  amountMinor: number;
  recipientEmail: string;
  currency?: string;
  agentId?: string;
}): PolicyEvaluationResult {
  const { amountMinor, recipientEmail, currency = 'USD', agentId } = params;
  const agent = agentId
    ? store.agents.get(agentId)
    : store.getDemoAgent();

  if (!agent) {
    throw new Error('No agent found to simulate against');
  }

  const policyVersion = agent.activePolicyVersionId
    ? store.policyVersions.get(agent.activePolicyVersionId) ?? null
    : null;

  let matchedRecipient = null;
  for (const recipient of store.recipients.values()) {
    if (recipient.email.toLowerCase() === recipientEmail.toLowerCase()) {
      matchedRecipient = recipient;
      break;
    }
  }

  // Dry-run simulations must not mutate state, so use the read-only snapshot.
  const spending = store.peekSpendingSummary(agent.id);

  return evaluatePolicy({
    agent,
    policyVersion,
    recipient: matchedRecipient,
    recipientEmail,
    amountMinor,
    currency,
    dailySpentAndReservedMinor:
      spending.dailySettledMinor + spending.dailyReservedMinor,
    monthlySpentAndReservedMinor:
      spending.monthlySettledMinor + spending.monthlyReservedMinor,
  });
}

function findDeniedIntent(question: string) {
  const amountMatch = question.match(/\$?(\d+(?:\.\d{2})?)/);
  const amountMinor = amountMatch ? toMinor(amountMatch[1]) : null;

  const denied = Array.from(store.paymentIntents.values())
    .filter((intent) => intent.decision === 'DENIED')
    .reverse();

  if (amountMinor !== null) {
    // If the user asked about a specific amount, do not answer with a
    // different intent merely because some other payment was denied.
    return denied.find((intent) => intent.amountMinor === amountMinor) ?? null;
  }

  return denied[0] ?? null;
}

export async function answerAssistantQuestion(question: string): Promise<{
  answer: string;
  recordReferences: { id: string; label: string; type: string }[];
  simulationResult?: PolicyEvaluationResult;
}> {
  const lower = question.toLowerCase();
  // Read-only assistant: do not run the reservation sweeper or mutate state.
  const spending = store.peekSpendingSummary();
  const activeAgent = store.getDemoAgent();
  const activePolicy = activeAgent?.activePolicyVersionId
    ? store.policyVersions.get(activeAgent.activePolicyVersionId) ?? null
    : null;

  // Simulation questions only. Avoid treating generic words like "request"
  // as a simulation trigger.
  if (
    (lower.includes('simulate') || lower.includes('what if')) &&
    !lower.includes('why ')
  ) {
    const amountMatch = question.match(/\$?(\d+(?:\.\d{2})?)/);
    const amountMinor = amountMatch ? toMinor(amountMatch[1]) : 8000;
    const sim = simulatePolicy({
      amountMinor,
      // Use the workspace's approved vendor so a what-if is judged on limits, not on a placeholder payee.
      recipientEmail: store.getDemoRecipient()?.email ?? 'vendor-sandbox@example.test',
      currency: 'USD',
    });

    const statusWord =
      sim.decision === 'AUTHORIZED'
        ? 'authorized'
        : sim.decision === 'PENDING_APPROVAL'
          ? 'queued for human approval'
          : 'denied';

    return {
      answer: `If ${activeAgent?.name || 'the agent'} requested ${formatUSD(amountMinor)} right now, the payment would be **${statusWord}** (${sim.decision}).\n\n${sim.explanation}`,
      recordReferences: [
        {
          id: activePolicy?.id || 'none',
          label: `Policy v${activePolicy?.version ?? 0}`,
          type: 'policy',
        },
        {
          id: activeAgent?.id || 'none',
          label: activeAgent?.name || 'agent',
          type: 'agent',
        },
      ],
      simulationResult: sim,
    };
  }

  if (
    lower.includes('denied') ||
    lower.includes('blocked') ||
    lower.includes('rejected')
  ) {
    const denied = findDeniedIntent(question);
    if (denied) {
      return {
        answer: `Payment ${denied.id} for ${formatUSD(denied.amountMinor)} was **${denied.decision}** under policy v${denied.policySnapshot.version}.\n\n${denied.explanation}\n\nReason code${denied.reasonCodes.length === 1 ? '' : 's'}: ${denied.reasonCodes.map((code) => `\`${code}\``).join(', ') || 'none'}. The request never reached PayPal.`,
        recordReferences: [
          { id: denied.id, label: denied.id, type: 'payment_intent' },
          {
            id: denied.policyVersionId,
            label: `Policy v${denied.policySnapshot.version}`,
            type: 'policy',
          },
        ],
      };
    }

    return {
      answer:
        'There is no denied payment intent stored in the current workspace. The active policy still enforces the configured limits deterministically.',
      recordReferences: activePolicy
        ? [
            {
              id: activePolicy.id,
              label: `Policy v${activePolicy.version}`,
              type: 'policy',
            },
          ]
        : [],
    };
  }

  if (lower.includes('summarize') || lower.includes('spend') || lower.includes('budget')) {
    return {
      answer: `**Spending Summary for Current Period**:\n• Daily limit: ${formatUSD(spending.dailyLimitMinor)} (${formatUSD(spending.dailySettledMinor)} settled, ${formatUSD(spending.dailyReservedMinor)} reserved, ${formatUSD(spending.dailyAvailableMinor)} available)\n• Monthly limit: ${formatUSD(spending.monthlyLimitMinor)} (${formatUSD(spending.monthlySettledMinor)} settled, ${formatUSD(spending.monthlyReservedMinor)} reserved, ${formatUSD(spending.monthlyAvailableMinor)} available)\n• Total recorded payment requests: ${store.paymentIntents.size}`,
      recordReferences: [
        {
          id: 'spending_metrics',
          label: 'Real-time Budget Aggregates',
          type: 'analytics',
        },
        {
          id: activePolicy?.id || 'none',
          label: `Active Policy v${activePolicy?.version ?? 0}`,
          type: 'policy',
        },
      ],
    };
  }

  if (aiClient) {
    // The answer depends on live spend, so include it in the cache key.
    const askKey = `ask:${normalizeKey(question)}|${spending.dailySettledMinor}|${spending.dailyReservedMinor}|${store.paymentIntents.size}`;
    const cachedAnswer = cacheGet<{ answer: string }>(askKey);
    try {
      if (cachedAnswer) {
        return {
          answer: cachedAnswer.answer,
          recordReferences: [
            { id: activePolicy?.id || 'none', label: `Policy v${activePolicy?.version ?? 0}`, type: 'policy' },
            { id: activeAgent?.id || 'none', label: activeAgent?.name || 'operations-agent', type: 'agent' },
          ],
        };
      }
      const prompt = `You are Countersign's read-only financial operations assistant.
Context:
- Active Agent: ${activeAgent?.name} (Status: ${activeAgent?.status})
- Active Policy: Max per txn ${formatUSD(activePolicy?.maxTransactionMinor ?? 0)}, Daily cap ${formatUSD(activePolicy?.dailyLimitMinor ?? 0)}, Monthly cap ${formatUSD(activePolicy?.monthlyLimitMinor ?? 0)}.
- Daily spend: ${formatUSD(spending.dailySettledMinor)} settled, ${formatUSD(spending.dailyReservedMinor)} reserved.
- Total payment intents: ${store.paymentIntents.size}.
Strict boundaries: You are read-only. You CANNOT approve, reject, or execute payments. Answer precisely and concisely based on this data only.

User Question: ${question}`;

      const res = await generateWithFallback({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      });

      if (res.text?.trim()) cacheSet(askKey, { answer: res.text.trim() });
      return {
        answer: res.text?.trim() || 'No response generated.',
        recordReferences: [
          {
            id: activePolicy?.id || 'none',
            label: `Policy v${activePolicy?.version ?? 0}`,
            type: 'policy',
          },
          {
            id: activeAgent?.id || 'none',
            label: activeAgent?.name || 'operations-agent',
            type: 'agent',
          },
        ],
      };
    } catch (err) {
      console.warn('[Countersign AI] Gemini assistant error:', err);
    }
  }

  return {
    answer: `Countersign is actively monitoring agent transactions. Spending is currently ${formatUSD(spending.dailySettledMinor + spending.dailyReservedMinor)} of the ${formatUSD(spending.dailyLimitMinor)} daily cap.`,
    recordReferences: activePolicy
      ? [
          {
            id: activePolicy.id,
            label: `Policy v${activePolicy.version}`,
            type: 'policy',
          },
        ]
      : [],
  };
}
