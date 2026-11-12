import * as s from "../core/validation/index.js";
import type { JsonValue, Schema } from "../core/validation/schema.js";

export type Error = {
  /** Human-readable message. */
  error: string;
  /** Stable machine-readable code, for example `UNAUTHORIZED` or `IDEMPOTENCY_KEY_REUSED`. */
  code: string;
  /** Properties the service sent or accepts beyond those declared. */
  additionalProperties?: Record<string, JsonValue>;
};

export const errorSchema: Schema<Error> = s.object<Error>(
  {
    error: s.string(),
    code: s.string(),
  },
  { additionalProperties: s.json() },
);
