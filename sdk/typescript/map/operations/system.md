<!-- Generated file — do not edit; regenerated with the SDK. -->

# System — operations

Accessor: `client.system` · Source: `src/resources/system.ts` · 1 operation · Request and error types: namespace `System`

**Type sources**: every type an operation names, with the file that declares it and the schema value exported beside it. Import every name from `countersign-agent-api`; the `Source` path is where to **read** the shape, never what to import. `ApiError`, the runtime error family and the file vocabulary are excluded — see sdk-map.md.

### getHealth

- **Signature**: `getHealth(options?: RequestOptions): ApiPromise<Health, System.GetHealthError>`
- **Wire**: `GET /health`
- **Auth**: none — public; no credential is sent
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `Health`
- **Error**: `CountersignAgentApiError` with `kind: "api"`, an instance of `System.GetHealthError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [500] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

| Type | Schema value | Source |
| --- | --- | --- |
| `Health` | `healthSchema` | `src/models/health.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

