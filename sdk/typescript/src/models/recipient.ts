import * as s from "../core/validation/index.js";
import type { JsonValue, Schema } from "../core/validation/schema.js";

export type Recipient = {
  /** Display name. Defaults to the email when omitted. */
  name?: string;
  /** PayPal receiver email. */
  email: string;
  /** Properties the service sent or accepts beyond those declared. */
  additionalProperties?: Record<string, JsonValue>;
};

const recipientProperties: s.Shape<Recipient> = {
  name: s.optional(s.string()),
  email: s.string(),
};

export const recipientInternalSchema: Schema<Recipient> = s.object<Recipient>(recipientProperties, {
  additionalProperties: s.json(),
});

export const recipientSchema: Schema<Recipient> = s.lazySchema(() =>
  s.object<Recipient>(
    {
      ...recipientProperties,
      email: s.string().check(s.email()),
    },
    { additionalProperties: s.json() },
  ),
);
