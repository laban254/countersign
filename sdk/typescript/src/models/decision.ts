import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** The policy engine's verdict. */
export const Decision = {
  Authorized: "AUTHORIZED",
  PendingApproval: "PENDING_APPROVAL",
  Denied: "DENIED",
} as const;
export type Decision = (typeof Decision)[keyof typeof Decision] | (string & {});

export const decisionSchema: EnumSchema<Decision> = s.enumOf<Decision>(Decision);
