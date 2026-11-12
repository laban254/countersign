import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** The reviewer's decision. Null while pending. */
export const Decision1 = {
  Approved: "APPROVED",
  Rejected: "REJECTED",
} as const;
export type Decision1 = (typeof Decision1)[keyof typeof Decision1] | (string & {});

export const decision1Schema: EnumSchema<Decision1> = s.enumOf<Decision1>(Decision1);
