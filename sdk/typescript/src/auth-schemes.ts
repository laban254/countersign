import type { ClientOptions } from "./client-options.js";
import type { AuthScheme } from "./core/api-request.js";
import { bearerAuth } from "./core/auth/schemes.js";

export type AuthSchemes = {
  readonly agentBearer: AuthScheme;
};

export function buildAuthSchemes(options: ClientOptions): AuthSchemes {
  return {
    agentBearer: bearerAuth(options.agentBearer),
  };
}
