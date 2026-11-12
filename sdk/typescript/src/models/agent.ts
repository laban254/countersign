import * as s from "../core/validation/index.js";
import type { JsonValue, Schema } from "../core/validation/schema.js";
import { status2Schema, type Status2 } from "./status2.js";

export type Agent = {
  /** Unique agent id. */
  id?: string;
  /** Workspace the agent belongs to. */
  workspaceId?: string;
  /** Display name of the agent. */
  name?: string;
  /** What the agent does. */
  description?: string;
  /**
   * Non-secret prefix of the agent's bearer token (`cs_<agentId>`). The secret part is shown only
   * once at registration.
   */
  tokenPrefix?: string;
  /** `ACTIVE` agents can request payments; `PAUSED` agents cannot; `REVOKED` is permanent. */
  status?: Status2;
  /** Id of the policy version currently applied to this agent. Null if none. */
  activePolicyVersionId?: string | null;
  /** When the agent was registered (UTC). */
  createdAt?: Date;
  /** When the agent last called the API (UTC). Null if never. */
  lastUsedAt?: Date | null;
  /** Properties the service sent or accepts beyond those declared. */
  additionalProperties?: Record<string, JsonValue>;
};

export const agentSchema: Schema<Agent> = s.object<Agent>(
  {
    id: s.optional(s.string()),
    workspaceId: s.optional(s.string()),
    name: s.optional(s.string()),
    description: s.optional(s.string()),
    tokenPrefix: s.optional(s.string()),
    status: s.optional(s.lazy(() => status2Schema)),
    activePolicyVersionId: s.optionalNullable(s.string()),
    createdAt: s.optional(s.dateTime()),
    lastUsedAt: s.optionalNullable(s.dateTime()),
  },
  { additionalProperties: s.json() },
);
