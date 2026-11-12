<!-- Generated file — do not edit; regenerated with the SDK. -->

# PaymentIntents — operations

Accessor: `client.paymentIntents` · Source: `src/resources/payment-intents.ts` · 3 operations · Request and error types: namespace `PaymentIntents`

**Type sources**: every type an operation names, with the file that declares it and the schema value exported beside it. Import every name from `countersign-agent-api`; the `Source` path is where to **read** the shape, never what to import. `ApiError`, the runtime error family and the file vocabulary are excluded — see sdk-map.md.

### createPaymentIntent

- **Signature**: `createPaymentIntent(request: PaymentIntents.CreatePaymentIntentRequest, options?: RequestOptions): ApiPromise<PaymentIntent, PaymentIntents.CreatePaymentIntentError>`
- **Wire**: `POST /agent/payment-intents`
- **Auth**: `agentBearer`
- **Request body**: `application/json` — the `body` field
- **Returns**: `PaymentIntent`
- **Error**: `CountersignAgentApiError` with `kind: "api"`, an instance of `PaymentIntents.CreatePaymentIntentError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [400] `Error` · `"error2"` [401] `Error` · `"error3"` [409] `Error` · `"paymentIntent"` [422] `PaymentIntent` · `"error4"` [429] `Error` · `"error5"` [500] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `PaymentIntents.CreatePaymentIntentRequest` (2):

| Field | Channel | Wire | Type | Req |
| --- | --- | --- | --- | --- |
| `idempotencyKey` | `header` | `Idempotency-Key` | `string` | no |
| `body` | `body` | — | `PaymentIntentRequest` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `PaymentIntentRequest` | `paymentIntentRequestSchema` | `src/models/payment-intent-request.ts` |
| `PaymentIntent` | `paymentIntentSchema` | `src/models/payment-intent.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

### getPaymentIntent

- **Signature**: `getPaymentIntent(request: PaymentIntents.GetPaymentIntentRequest, options?: RequestOptions): ApiPromise<PaymentIntent, PaymentIntents.GetPaymentIntentError>`
- **Wire**: `GET /agent/payment-intents/{id}`
- **Auth**: `agentBearer`
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `PaymentIntent`
- **Error**: `CountersignAgentApiError` with `kind: "api"`, an instance of `PaymentIntents.GetPaymentIntentError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [401] `Error` · `"error2"` [404] `Error` · `"error3"` [429] `Error` · `"error4"` [500] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `PaymentIntents.GetPaymentIntentRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `id` | `path` | `string` | yes |

| Type | Schema value | Source |
| --- | --- | --- |
| `PaymentIntent` | `paymentIntentSchema` | `src/models/payment-intent.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

### listPaymentIntents

- **Signature**: `listPaymentIntents(request?: PaymentIntents.ListPaymentIntentsRequest, options?: RequestOptions): ApiPromise<PaymentIntent[], PaymentIntents.ListPaymentIntentsError>`
- **Wire**: `GET /agent/payment-intents`
- **Auth**: `agentBearer`
- **Request body**: none — no `Content-Type` header is sent
- **Returns**: `PaymentIntent[]` — a bare `application/json` array; the success type *is* the array, not a wrapper model
- **Error**: `CountersignAgentApiError` with `kind: "api"`, an instance of `PaymentIntents.ListPaymentIntentsError` — **typed arms**, narrowed on `err.payload.kind`
- **Error arms**: `"error"` [401] `Error` · `"error2"` [429] `Error` · `"error3"` [500] `Error` · `"undeclared"` [any other] `rawBody: ArrayBuffer`

**Fields** — `PaymentIntents.ListPaymentIntentsRequest` (1):

| Field | Channel | Type | Req |
| --- | --- | --- | --- |
| `status` | `query` | `PaymentStatus` | no |

| Type | Schema value | Source |
| --- | --- | --- |
| `PaymentStatus` | `paymentStatusSchema` | `src/models/payment-status.ts` |
| `PaymentIntent` | `paymentIntentSchema` | `src/models/payment-intent.ts` |
| `Error` | `errorSchema` | `src/models/error.ts` |

