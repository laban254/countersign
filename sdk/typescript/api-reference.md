# Reference

> Source: [CountersignAgentApiClient](src/client.ts)

## PaymentIntents

> Source: [PaymentIntents](src/resources/payment-intents.ts)

<details>
<summary><code>createPaymentIntent(request: PaymentIntents.CreatePaymentIntentRequest, options?: RequestOptions): ApiPromise&lt;PaymentIntent, PaymentIntents.CreatePaymentIntentError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Submit a payment intent. Countersign evaluates it against the agent's active policy and responds with
a decision. `DENIED` intents are returned with status `422` and are never sent to PayPal.


</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.paymentIntents.createPaymentIntent({
    idempotencyKey: "0b9a1c1e-2c3d-4e5f-8a9b-1c2d3e4f5a6b",
    body: {
      recipient: { name: "Second Signature Cloud", email: "vendor@example.com" },
      amount: { value: "49.00", currency: "USD" },
      description: "November software invoice",
      invoiceReference: "INV-2026-1101",
    },
  });
  // TODO: Handle 'response' of type PaymentIntent
} catch (err) {
  // TODO: Handle 'err' of type PaymentIntents.CreatePaymentIntentError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.paymentIntents
  .createPaymentIntent({
    idempotencyKey: "0b9a1c1e-2c3d-4e5f-8a9b-1c2d3e4f5a6b",
    body: {
      recipient: { name: "Second Signature Cloud", email: "vendor@example.com" },
      amount: { value: "49.00", currency: "USD" },
      description: "November software invoice",
      invoiceReference: "INV-2026-1101",
    },
  })
  .asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type PaymentIntent
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>idempotencyKey?</code> | <code>string</code> | Unique key for this request. Strongly recommended: without it a retry creates a second intent.<br>Re-sending the same key and body returns the original intent; a different body returns `409`. |
| <code>body</code> | <code>[PaymentIntentRequest](src/models/payment-intent-request.ts)</code> | - |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.paymentIntents.createPaymentIntent(request)`

- **OnSuccess**: <code>[PaymentIntent](src/models/payment-intent.ts)</code>
- **OnError**: throws <code>[PaymentIntents.CreatePaymentIntentError](src/resources/payment-intents.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.paymentIntents.createPaymentIntent(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;PaymentIntent, PaymentIntents.CreatePaymentIntentError&gt;</code>, with `result.value` of type <code>[PaymentIntent](src/models/payment-intent.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[CountersignAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>getPaymentIntent(request: PaymentIntents.GetPaymentIntentRequest, options?: RequestOptions): ApiPromise&lt;PaymentIntent, PaymentIntents.GetPaymentIntentError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Fetch one intent, including its checks, approval, budget reservation and PayPal payout reference.
Poll this until `status` is terminal (`SUCCEEDED`, `FAILED`, `DENIED`, `REJECTED`, `EXPIRED`,
`RETURNED`, `REFUNDED`).


</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.paymentIntents.getPaymentIntent({ id: "some example string" });
  // TODO: Handle 'response' of type PaymentIntent
} catch (err) {
  // TODO: Handle 'err' of type PaymentIntents.GetPaymentIntentError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.paymentIntents.getPaymentIntent({ id: "some example string" }).asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type PaymentIntent
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>id</code> | <code>string</code> | Payment intent id, for example `pi_9d5db09781c7f6e7`. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.paymentIntents.getPaymentIntent(request)`

- **OnSuccess**: <code>[PaymentIntent](src/models/payment-intent.ts)</code>
- **OnError**: throws <code>[PaymentIntents.GetPaymentIntentError](src/resources/payment-intents.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.paymentIntents.getPaymentIntent(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;PaymentIntent, PaymentIntents.GetPaymentIntentError&gt;</code>, with `result.value` of type <code>[PaymentIntent](src/models/payment-intent.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[CountersignAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

<details>
<summary><code>listPaymentIntents(request?: PaymentIntents.ListPaymentIntentsRequest, options?: RequestOptions): ApiPromise&lt;PaymentIntent[], PaymentIntents.ListPaymentIntentsError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Returns only the authenticated agent's intents, newest first.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.paymentIntents.listPaymentIntents();
  // TODO: Handle 'response' of type PaymentIntent[]
} catch (err) {
  // TODO: Handle 'err' of type PaymentIntents.ListPaymentIntentsError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.paymentIntents.listPaymentIntents().asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type PaymentIntent[]
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Parameters

<dl>
<dd>

| Name | Type | Description |
| --- | --- | --- |
| <code>status?</code> | <code>[PaymentStatus](src/models/payment-status.ts)</code> | Only return intents in this status. |

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.paymentIntents.listPaymentIntents(request)`

- **OnSuccess**: <code>[PaymentIntent](src/models/payment-intent.ts)[]</code>
- **OnError**: throws <code>[PaymentIntents.ListPaymentIntentsError](src/resources/payment-intents.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.paymentIntents.listPaymentIntents(request).asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;PaymentIntent[], PaymentIntents.ListPaymentIntentsError&gt;</code>, with `result.value` of type <code>[PaymentIntent](src/models/payment-intent.ts)[]</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[CountersignAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

## AgentApi

> Source: [AgentApi](src/resources/agent-api.ts)

<details>
<summary><code>getCurrentAgent(options?: RequestOptions): ApiPromise&lt;Agent, AgentApi.GetCurrentAgentError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Returns the agent identified by the bearer token. The token hash is never returned.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.agentApi.getCurrentAgent();
  // TODO: Handle 'response' of type Agent
} catch (err) {
  // TODO: Handle 'err' of type AgentApi.GetCurrentAgentError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.agentApi.getCurrentAgent().asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type Agent
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.agentApi.getCurrentAgent()`

- **OnSuccess**: <code>[Agent](src/models/agent.ts)</code>
- **OnError**: throws <code>[AgentApi.GetCurrentAgentError](src/resources/agent-api.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.agentApi.getCurrentAgent().asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;Agent, AgentApi.GetCurrentAgentError&gt;</code>, with `result.value` of type <code>[Agent](src/models/agent.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[CountersignAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

## System

> Source: [System](src/resources/system.ts)

<details>
<summary><code>getHealth(options?: RequestOptions): ApiPromise&lt;Health, System.GetHealthError&gt;</code></summary>

<dl>
<dd>

### Description

<dl>
<dd>

Public liveness check that also reports whether the audit ledger hash chain is intact.

</dd>
</dl>

### Direct Usage

<dl>
<dd>

```ts
try {
  const response = await client.system.getHealth();
  // TODO: Handle 'response' of type Health
} catch (err) {
  // TODO: Handle 'err' of type System.GetHealthError, discriminated with 'err.payload.kind'
}
```

</dd>
</dl>

### Usage as ApiResult

<dl>
<dd>

```ts
const result = await client.system.getHealth().asApiResult();
// TODO: Use 'result.status' and 'result.headers' to read the raw response status and headers
if (result.ok) {
  // TODO: Use 'result.value' of type Health
} else {
  // TODO: Handle 'result', discriminated with 'result.payload.kind'
}
```

</dd>
</dl>

### Response

<dl>
<dd>

**Direct**: `await client.system.getHealth()`

- **OnSuccess**: <code>[Health](src/models/health.ts)</code>
- **OnError**: throws <code>[System.GetHealthError](src/resources/system.ts)</code>, with `err.payload` discriminated on `kind`

**As ApiResult**: `await client.system.getHealth().asApiResult()`

- **OnSuccess**: <code>[ApiResult](src/core/api-promise.ts)&lt;Health, System.GetHealthError&gt;</code>, with `result.value` of type <code>[Health](src/models/health.ts)</code>
- **OnError**: `result.payload` discriminated on `kind`, with `result.message`

**Thrown**: <code>[CountersignAgentApiError](src/core/errors.ts)</code> on any operational failure — a caller abort and a programmer error stay outside the family and reach you raw

</dd>
</dl>

</dd>
</dl>

</details>

