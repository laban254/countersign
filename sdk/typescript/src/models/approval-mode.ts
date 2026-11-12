import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** When a human countersign is required: never, above a threshold, or always. */
export const ApprovalMode = {
  Never: "NEVER",
  AboveThreshold: "ABOVE_THRESHOLD",
  Always: "ALWAYS",
} as const;
export type ApprovalMode = (typeof ApprovalMode)[keyof typeof ApprovalMode] | (string & {});

export const approvalModeSchema: EnumSchema<ApprovalMode> = s.enumOf<ApprovalMode>(ApprovalMode);
