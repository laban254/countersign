<!-- Generated file — do not edit; regenerated with the SDK. -->

# AgentApi — operations

Accessor: `client.agentApi` · Source: `src/resources/agent-api.ts` · 1 operation · Request and error types: namespace `AgentApi`

**Type sources**: every type an operation names, with the file that declares it and the schema value exported beside it. Import every name from `countersign-agent-api`; the `Source` path is where to **read** the shape, never what to import. `ApiError`, the runtime error family and the file vocabulary are excluded — see sdk-map.md.

### getCurrentAgent

- **Signature**: `getCurrentAgent(options?: RequestOptions): ApiPromise<Agent, AgentApi.GetCurrentAgentError>`
- **Wire**: `GET /agent/me`
- **Auth**: `agentBearer`
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `Agent`
- **Error**: `CountersignAgentApiError` with `kind: "api"`, an instance of `AgentApi.GetCurrentAgentError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [401] `Error` · `"error2"` [429] `Error` · `"error3"` [500] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

| Type | Schema value | Source |
| --- | --- | --- |
| `Agent` | `agentSchema` | `src/models/agent.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

