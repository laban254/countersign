import type { AuthSchemes } from "../auth-schemes.js";
import { ApiError, type Declared, type Undeclared } from "../core/api-error.js";
import type { ApiPromise } from "../core/api-promise.js";
import type { RequestOptions } from "../core/api-request.js";
import type { RawClient } from "../core/raw-client.js";
import type { ErrorDecoders } from "../core/response-decoder.js";
import { agentSchema, type Agent } from "../models/agent.js";
import { errorSchema, type Error } from "../models/error.js";
import type { Servers } from "../servers.js";

/**
 * Information about the authenticated agent.
 */
export class AgentApi {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;
  readonly #auth: AuthSchemes;

  constructor(rawClient: RawClient, servers: Servers, auth: AuthSchemes) {
    this.#rawClient = rawClient;
    this.#servers = servers;
    this.#auth = auth;
  }

  /**
   * Get the authenticated agent
   *
   * @remarks
   * Returns the agent identified by the bearer token. The token hash is never returned.
   *
   * @returns The authenticated agent.
   *
   * @throws {@link AgentApi.GetCurrentAgentError} when the API answers with an error status —
   * narrow on `err.payload.kind`
   *
   * @throws {@link CountersignAgentApiError} when no usable response was produced: a connection
   * failure, a timeout, a body that would not decode, a value that would not encode, or a
   * credential that could not be obtained
   */
  getCurrentAgent(options?: RequestOptions): ApiPromise<Agent, AgentApi.GetCurrentAgentError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/agent/me"),
        auth: this.#auth.agentBearer,
        pathParams: [],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: agentSchema },
        errorFactory: AgentApi.GetCurrentAgentError,
      },
      options,
    );
  }
}

export namespace AgentApi {
  export class GetCurrentAgentError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<GetCurrentAgentError> = [
      { on: 401, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 429, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 500, kind: "error3", decode: { kind: "json", schema: errorSchema } },
    ];
  }
}
