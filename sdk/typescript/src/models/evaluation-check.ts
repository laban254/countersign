import * as s from "../core/validation/index.js";
import type { JsonValue, Schema } from "../core/validation/schema.js";
import { statusSchema, type Status } from "./status.js";

export type EvaluationCheck = {
  /** Stable identifier of the check. */
  id: string;
  /** Human-readable result of the check. */
  label: string;
  /** Outcome of the check: `passed`, `warning` (needs a human) or `failed` (denies the request). */
  status: Status;
  /** Extra context, usually present for warnings and failures. */
  detail?: string;
  /** Properties the service sent or accepts beyond those declared. */
  additionalProperties?: Record<string, JsonValue>;
};

export const evaluationCheckSchema: Schema<EvaluationCheck> = s.object<EvaluationCheck>(
  {
    id: s.string(),
    label: s.string(),
    status: statusSchema,
    detail: s.optional(s.string()),
  },
  { additionalProperties: s.json() },
);
