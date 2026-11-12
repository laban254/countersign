import type { TokenProvider } from "./core/auth/credentials.js";
import type { CoreClientOptions } from "./core/client-options.js";

export type ClientOptions = SdkClientOptions & CoreClientOptions;

type SdkClientOptions = ServerOptions & {
  /** Agent token in the form `cs_<agentId>_<secret>`, issued once at registration. */
  readonly agentBearer?: TokenProvider | undefined;
};

type ServerOptions = {
  /** Your Countersign deployment (replace with your host) */
  readonly serverOptions?: {
    baseUrl?: string;
  };
};
