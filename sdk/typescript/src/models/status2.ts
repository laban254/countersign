import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

/** `ACTIVE` agents can request payments; `PAUSED` agents cannot; `REVOKED` is permanent. */
export const Status2 = {
  Active: "ACTIVE",
  Paused: "PAUSED",
  Revoked: "REVOKED",
} as const;
export type Status2 = (typeof Status2)[keyof typeof Status2] | (string & {});

export const status2Schema: EnumSchema<Status2> = s.enumOf<Status2>(Status2);
