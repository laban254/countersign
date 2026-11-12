import type { AuthSchemes } from "../auth-schemes.js";
import { ApiError, type Declared, type Undeclared } from "../core/api-error.js";
import type { ApiPromise } from "../core/api-promise.js";
import type { RequestOptions } from "../core/api-request.js";
import type { RawClient } from "../core/raw-client.js";
import type { ErrorDecoders } from "../core/response-decoder.js";
import * as s from "../core/validation/index.js";
import type { Schema } from "../core/validation/schema.js";
import { errorSchema, type Error } from "../models/error.js";
import {
  paymentIntentRequestInternalSchema,
  paymentIntentRequestSchema,
  type PaymentIntentRequest,
} from "../models/payment-intent-request.js";
import { paymentIntentInternalSchema, type PaymentIntent } from "../models/payment-intent.js";
import { paymentStatusSchema, type PaymentStatus } from "../models/payment-status.js";
import type { Servers } from "../servers.js";

/**
 * Request, inspect and track agent payments.
 */
export class PaymentIntents {
  readonly #rawClient: RawClient;
  readonly #servers: Servers;
  readonly #auth: AuthSchemes;

  constructor(rawClient: RawClient, servers: Servers, auth: AuthSchemes) {
    this.#rawClient = rawClient;
    this.#servers = servers;
    this.#auth = auth;
  }

  /**
   * Request a payment
   *
   * @remarks
   * Submit a payment intent. Countersign evaluates it against the agent's active policy and
   * responds with a decision. `DENIED` intents are returned with status `422` and are never sent to
   * PayPal.
   *
   * @returns Intent accepted. `decision` is `AUTHORIZED` (payout submitted) or `PENDING_APPROVAL`
   * (waiting for a human countersign).
   *
   * @throws {@link PaymentIntents.CreatePaymentIntentError} when the API answers with an error
   * status — narrow on `err.payload.kind`
   *
   * @throws {@link CountersignAgentApiError} when no usable response was produced: a connection
   * failure, a timeout, a body that would not decode, a value that would not encode, or a
   * credential that could not be obtained
   */
  createPaymentIntent(
    request: PaymentIntents.CreatePaymentIntentRequest,
    options?: RequestOptions,
  ): ApiPromise<PaymentIntent, PaymentIntents.CreatePaymentIntentError> {
    return this.#rawClient.execute(
      {
        method: "POST",
        urlTemplate: this.#servers.default("/agent/payment-intents"),
        auth: this.#auth.agentBearer,
        pathParams: [],
        query: [],
        headers: [{ name: "Idempotency-Key", value: request.idempotencyKey, schema: s.optional(s.string()) }],
        body: { kind: "json", value: request.body, schema: paymentIntentRequestInternalSchema },
      },
      {
        success: { kind: "json", schema: paymentIntentInternalSchema },
        errorFactory: PaymentIntents.CreatePaymentIntentError,
      },
      options,
    );
  }

  /**
   * Get a payment intent
   *
   * @remarks
   * Fetch one intent, including its checks, approval, budget reservation and PayPal payout
   * reference. Poll this until `status` is terminal (`SUCCEEDED`, `FAILED`, `DENIED`, `REJECTED`,
   * `EXPIRED`, `RETURNED`, `REFUNDED`).
   *
   * @returns The payment intent.
   *
   * @throws {@link PaymentIntents.GetPaymentIntentError} when the API answers with an error status
   * — narrow on `err.payload.kind`
   *
   * @throws {@link CountersignAgentApiError} when no usable response was produced: a connection
   * failure, a timeout, a body that would not decode, a value that would not encode, or a
   * credential that could not be obtained
   */
  getPaymentIntent(
    request: PaymentIntents.GetPaymentIntentRequest,
    options?: RequestOptions,
  ): ApiPromise<PaymentIntent, PaymentIntents.GetPaymentIntentError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/agent/payment-intents/{id}"),
        auth: this.#auth.agentBearer,
        pathParams: [{ name: "id", value: request.id, schema: s.string() }],
        query: [],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: paymentIntentInternalSchema },
        errorFactory: PaymentIntents.GetPaymentIntentError,
      },
      options,
    );
  }

  /**
   * List this agent's payment intents
   *
   * @remarks
   * Returns only the authenticated agent's intents, newest first.
   *
   * @returns The agent's payment intents.
   *
   * @throws {@link PaymentIntents.ListPaymentIntentsError} when the API answers with an error
   * status — narrow on `err.payload.kind`
   *
   * @throws {@link CountersignAgentApiError} when no usable response was produced: a connection
   * failure, a timeout, a body that would not decode, a value that would not encode, or a
   * credential that could not be obtained
   */
  listPaymentIntents(
    request: PaymentIntents.ListPaymentIntentsRequest = {},
    options?: RequestOptions,
  ): ApiPromise<PaymentIntent[], PaymentIntents.ListPaymentIntentsError> {
    return this.#rawClient.execute(
      {
        method: "GET",
        urlTemplate: this.#servers.default("/agent/payment-intents"),
        auth: this.#auth.agentBearer,
        pathParams: [],
        query: [
          { name: "status", value: request.status, schema: s.optional(s.lazy(() => paymentStatusSchema)) },
        ],
        headers: [],
        body: { kind: "empty" },
      },
      {
        success: { kind: "json", schema: s.array(s.lazy(() => paymentIntentInternalSchema)) },
        errorFactory: PaymentIntents.ListPaymentIntentsError,
      },
      options,
    );
  }
}

export namespace PaymentIntents {
  export type CreatePaymentIntentRequest = {
    /**
     * Unique key for this request. Strongly recommended: without it a retry creates a second
     * intent. Re-sending the same key and body returns the original intent; a different body
     * returns `409`.
     */
    idempotencyKey?: string;
    body: PaymentIntentRequest;
  };

  export const createPaymentIntentRequestSchema: Schema<CreatePaymentIntentRequest> = s.lazySchema(() =>
    s.object<CreatePaymentIntentRequest>({
      idempotencyKey: s.optional(s.string().check(s.maxLength(200))),
      body: paymentIntentRequestSchema,
    }),
  );

  export class CreatePaymentIntentError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Declared<"paymentIntent", PaymentIntent>
      | Declared<"error4", Error>
      | Declared<"error5", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<CreatePaymentIntentError> = [
      { on: 400, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 401, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 409, kind: "error3", decode: { kind: "json", schema: errorSchema } },
      { on: 422, kind: "paymentIntent", decode: { kind: "json", schema: paymentIntentInternalSchema } },
      { on: 429, kind: "error4", decode: { kind: "json", schema: errorSchema } },
      { on: 500, kind: "error5", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type GetPaymentIntentRequest = {
    /** Payment intent id, for example `pi_9d5db09781c7f6e7`. */
    id: string;
  };

  export class GetPaymentIntentError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Declared<"error4", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<GetPaymentIntentError> = [
      { on: 401, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 404, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 429, kind: "error3", decode: { kind: "json", schema: errorSchema } },
      { on: 500, kind: "error4", decode: { kind: "json", schema: errorSchema } },
    ];
  }

  export type ListPaymentIntentsRequest = {
    /** Only return intents in this status. */
    status?: PaymentStatus;
  };

  export class ListPaymentIntentsError extends ApiError {
    declare readonly payload:
      | Declared<"error", Error>
      | Declared<"error2", Error>
      | Declared<"error3", Error>
      | Undeclared;

    static readonly errors: ErrorDecoders<ListPaymentIntentsError> = [
      { on: 401, kind: "error", decode: { kind: "json", schema: errorSchema } },
      { on: 429, kind: "error2", decode: { kind: "json", schema: errorSchema } },
      { on: 500, kind: "error3", decode: { kind: "json", schema: errorSchema } },
    ];
  }
}
