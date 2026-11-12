import * as s from "../core/validation/index.js";
import type { JsonValue, Schema } from "../core/validation/schema.js";

export type Money = {
  /** Decimal amount in major units with up to two decimals. */
  value: string;
  /** ISO currency code. The sandbox policy allows USD. @default "USD" */
  currency?: string;
  /** Properties the service sent or accepts beyond those declared. */
  additionalProperties?: Record<string, JsonValue>;
};

const moneyProperties: s.Shape<Money> = {
  value: s.string(),
  currency: s.defaulted(s.string(), "USD"),
};

export const moneyInternalSchema: Schema<Money> = s.object<Money>(moneyProperties, {
  additionalProperties: s.json(),
});

export const moneySchema: Schema<Money> = s.lazySchema(() =>
  s.object<Money>(
    {
      ...moneyProperties,
      value: s.string().check(s.pattern("^[0-9]+(\\.[0-9]{1,2})?$")),
    },
    { additionalProperties: s.json() },
  ),
);
