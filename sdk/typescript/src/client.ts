import { buildAuthSchemes, type AuthSchemes } from "./auth-schemes.js";
import type { ClientOptions } from "./client-options.js";
import { buildCoreClientOptions } from "./core/client-options.js";
import { RawClient } from "./core/raw-client.js";
import * as host from "./core/runtime-environment.js";
import * as s from "./core/validation/index.js";
import { AgentApi } from "./resources/agent-api.js";
import { PaymentIntents } from "./resources/payment-intents.js";
import { System } from "./resources/system.js";
import { buildServers, type Servers } from "./servers.js";

/**
 * Countersign sits between an autonomous AI agent and payment execution. An agent submits a
 * **payment intent**; Countersign authenticates the agent, evaluates the request against its
 * immutable spending policy with a deterministic engine, and returns one of three decisions:
 *
 * | Decision | HTTP status | Meaning |
 * |---|---|---|
 * | `AUTHORIZED` | `201` | Allowed. The PayPal Payouts request is submitted. |
 * | `PENDING_APPROVAL` | `201` | Within limits but needs a human countersign (threshold or new recipient). Budget is reserved. |
 * | `DENIED` | `422` | Hard policy violation. Recorded, never sent to PayPal. |
 *
 * The agent can never approve its own payment. Approvals are made by a human in the Countersign
 * console. Payout settlement is confirmed asynchronously (PayPal webhooks plus reconciliation
 * polling), so poll `GET /agent/payment-intents/{id}` for the final status.
 *
 * **Authentication.** Every agent request carries the agent's bearer token
 * (`cs_<agentId>_<secret>`), issued once when the agent is registered. The token determines which
 * agent (and therefore which policy) applies; any `agent_id` in a request body is ignored.
 *
 * **Idempotency.** Send an `Idempotency-Key` header on every `POST`. Re-sending the same key with
 * the same body returns the original intent (`200` with `Idempotent-Replay: true`). Re-using a key
 * with a different body is rejected with `409 IDEMPOTENCY_KEY_REUSED`.
 *
 * **Amounts** are decimal strings in major units (for example `"49.00"`). Currency is an ISO code;
 * the sandbox policy allows `USD`.
 *
 * This is a PayPal **Sandbox** prototype. No real money moves.
 */
export class CountersignAgentApiClient {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;
  readonly #auth: AuthSchemes;
  #paymentIntents?: PaymentIntents;
  #agentApi?: AgentApi;
  #system?: System;

  constructor(options: ClientOptions = {}) {
    this.#rawClient = new RawClient({
      ...buildCoreClientOptions(options, "COUNTERSIGN_AGENT_API_CLIENT_LOG"),
      defaultHeaders: [
        { name: "User-Agent", value: "CountersignAgentApiClient/1.0.0 TypeScript", schema: s.string() },
        { name: "X-APIMatic-Lang", value: "TypeScript", schema: s.string() },
        { name: "X-APIMatic-Package-Version", value: "1.0.0", schema: s.string() },
        { name: "X-APIMatic-Gen-Version", value: "4.0.0", schema: s.string() },
        { name: "X-APIMatic-OS", value: host.operatingSystem(), schema: s.optional(s.string()) },
        { name: "X-APIMatic-Runtime", value: host.runtimeDescription(), schema: s.optional(s.string()) },
      ],
      defaultQuery: [],
      defaultPathParams: [],
    });

    this.#servers = buildServers(options);

    this.#auth = buildAuthSchemes(options);
  }

  /**
   * Request, inspect and track agent payments.
   */
  get paymentIntents(): PaymentIntents {
    return (this.#paymentIntents ??= new PaymentIntents(this.#rawClient, this.#servers, this.#auth));
  }

  /**
   * Information about the authenticated agent.
   */
  get agentApi(): AgentApi {
    return (this.#agentApi ??= new AgentApi(this.#rawClient, this.#servers, this.#auth));
  }

  /**
   * Service health.
   */
  get system(): System {
    return (this.#system ??= new System(this.#rawClient, this.#servers));
  }
}
