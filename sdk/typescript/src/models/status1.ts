import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** `HELD` while pending, `SETTLED` once PayPal confirms, `RELEASED` or `EXPIRED` if not spent. */
export const Status1 = {
  Held: "HELD",
  Settled: "SETTLED",
  Released: "RELEASED",
  Expired: "EXPIRED",
} as const;
export type Status1 = (typeof Status1)[keyof typeof Status1] | (string & {});

export const status1Schema: EnumSchema<Status1> = s.enumOf<Status1>(Status1);
