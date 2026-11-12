import { ApiError, type Declared, type Undeclared } from "../core/api-error.js";
import type { ApiPromise } from "../core/api-promise.js";
import type { RequestOptions } from "../core/api-request.js";
import { noneAuth } from "../core/auth/schemes.js";
import type { RawClient } from "../core/raw-client.js";
import type { ErrorDecoders } from "../core/response-decoder.js";
import { errorSchema, type Error } from "../models/error.js";
import { healthSchema, type Health } from "../models/health.js";
import type { Servers } from "../servers.js";

/**
 * Service health.
 */
export class System {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;

  constructor(rawClient: RawClient, servers: Servers) {
    this.#rawClient = rawClient;
    this.#servers = servers;
  }

  /**
   * Service health
   *
   * @remarks
   * Public liveness check that also reports whether the audit ledger hash chain is intact.
   *
   * @returns Service is up.
   *
   * @throws {@link System.GetHealthError} when the API answers with an error status — narrow on
   * `err.payload.kind`
   *
   * @throws {@link CountersignAgentApiError} when no usable response was produced: a connection
   * failure, a timeout, a body that would not decode, a value that would not encode, or a
   * credential that could not be obtained
   */
  getHealth(options?: RequestOptions): ApiPromise<Health, System.GetHealthError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/health"),
        auth: noneAuth,
        pathParams: [],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: healthSchema },
        errorFactory: System.GetHealthError,
      },
      options,
    );
  }
}

export namespace System {
  export class GetHealthError extends ApiError {
    declare readonly payload: Declared<"error", Error> | Undeclared;

    static readonly errors: ErrorDecoders<GetHealthError> = [
      { on: 500, kind: "error", decode: { kind: "json", schema: errorSchema } },
    ];
  }
}
