import * as s from "../core/validation/index.js";
import type { JsonValue, Schema } from "../core/validation/schema.js";
import { moneyInternalSchema, moneySchema, type Money } from "./money.js";
import { recipientInternalSchema, recipientSchema, type Recipient } from "./recipient.js";

export type PaymentIntentRequest = {
  recipient: Recipient;
  amount: Money;
  /** Payment memo. Defaults to `Agent Payment Intent`. */
  description?: string;
  /** Your reference for this payment. Generated when omitted. */
  invoiceReference?: string;
  /** Free-form data stored with the intent. */
  metadata?: Record<string, unknown>;
  /** Properties the service sent or accepts beyond those declared. */
  additionalProperties?: Record<string, JsonValue>;
};

const paymentIntentRequestProperties: s.Shape<PaymentIntentRequest> = {
  recipient: recipientInternalSchema,
  amount: moneyInternalSchema,
  description: s.optional(s.string()),
  invoiceReference: s.optional(s.string()),
  metadata: s.optional(s.record(s.string(), s.unknown())),
  _keysMap: {
    invoiceReference: "invoice_reference",
  },
};

export const paymentIntentRequestInternalSchema: Schema<PaymentIntentRequest> =
  s.object<PaymentIntentRequest>(paymentIntentRequestProperties, { additionalProperties: s.json() });

export const paymentIntentRequestSchema: Schema<PaymentIntentRequest> = s.lazySchema(() =>
  s.object<PaymentIntentRequest>(
    {
      ...paymentIntentRequestProperties,
      recipient: recipientSchema,
      amount: moneySchema,
      invoiceReference: s.optional(s.string().check(s.maxLength(120))),
    },
    { additionalProperties: s.json() },
  ),
);
