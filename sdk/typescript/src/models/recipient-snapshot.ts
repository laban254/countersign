import * as s from "../core/validation/index.js";
import type { JsonValue, Schema } from "../core/validation/schema.js";
import { status3Schema, type Status3 } from "./status3.js";

/** The recipient exactly as it was when the decision was made. */
export type RecipientSnapshot = {
  displayName?: string;
  email?: string;
  status?: Status3;
  /** Properties the service sent or accepts beyond those declared. */
  additionalProperties?: Record<string, JsonValue>;
};

const recipientSnapshotProperties: s.Shape<RecipientSnapshot> = {
  displayName: s.optional(s.string()),
  email: s.optional(s.string()),
  status: s.optional(s.lazy(() => status3Schema)),
};

export const recipientSnapshotInternalSchema: Schema<RecipientSnapshot> = s.object<RecipientSnapshot>(
  recipientSnapshotProperties,
  { additionalProperties: s.json() },
);

export const recipientSnapshotSchema: Schema<RecipientSnapshot> = s.lazySchema(() =>
  s.object<RecipientSnapshot>(
    {
      ...recipientSnapshotProperties,
      email: s.optional(s.string().check(s.email())),
    },
    { additionalProperties: s.json() },
  ),
);
