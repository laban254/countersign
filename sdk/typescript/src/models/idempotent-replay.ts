import * as s from "../core/validation/index.js";
import type { EnumSchema } from "../core/validation/schema.js";

export const IdempotentReplay = {
  True: "true",
} as const;
export type IdempotentReplay = (typeof IdempotentReplay)[keyof typeof IdempotentReplay] | (string & {});

export const idempotentReplaySchema: EnumSchema<IdempotentReplay> =
  s.enumOf<IdempotentReplay>(IdempotentReplay);
