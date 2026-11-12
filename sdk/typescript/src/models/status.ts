import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** Outcome of the check: `passed`, `warning` (needs a human) or `failed` (denies the request). */
export const Status = {
  Passed: "passed",
  Warning: "warning",
  Failed: "failed",
} as const;
export type Status = (typeof Status)[keyof typeof Status] | (string & {});

export const statusSchema: EnumSchema<Status> = s.enumOf<Status>(Status);
