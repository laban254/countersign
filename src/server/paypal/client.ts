import crypto from 'node:crypto';

export interface PayoutRequestOptions {
  intentId: string;
  recipientEmail: string;
  recipientName?: string;
  amountMajor: number;
  currency: string;
  note: string;
}

export interface PayoutResult {
  success: boolean;
  payoutBatchId: string;
  payoutItemId: string;
  transactionId: string;
  batchStatus: string;
  itemStatus: string;
  isSimulated: boolean;
  rawResponse: Record<string, unknown>;
  error?: string;
}

export interface WebhookVerificationParams {
  transmissionId: string;
  transmissionTime: string;
  certUrl: string;
  authAlgo: string;
  transmissionSig: string;
  webhookId: string;
  webhookEvent: Record<string, unknown>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export class PayPalService {
  private clientId: string | undefined;
  private clientSecret: string | undefined;
  private env: string;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor() {
    this.clientId = process.env.PAYPAL_CLIENT_ID;
    this.clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    this.env = process.env.PAYPAL_ENV || 'sandbox';
  }

  get isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  private get baseUrl(): string {
    return this.env === 'production'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now() + 30_000) {
      return this.tokenCache.token;
    }

    const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const response = await fetchWithTimeout(`${this.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`PayPal OAuth failure (${response.status}): ${errText}`);
    }

    const data = await response.json();
    const expiresIn = Number(data.expires_in) || 300;
    this.tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + expiresIn * 1000,
    };
    return data.access_token;
  }

  async executePayout(options: PayoutRequestOptions): Promise<PayoutResult> {
    const { intentId, recipientEmail, amountMajor, currency, note } = options;
    const senderBatchId = `cs-${intentId}`;
    const senderItemId = `item-${intentId}`;

    // If live Sandbox credentials are not provided, run the deterministic
    // simulator. Production fails closed unless simulation is explicitly
    // enabled with PAYPAL_SIMULATE=true. Callers must surface `isSimulated` so
    // a simulation is never mistaken for a confirmed provider payout.
    if (!this.isConfigured) {
      if (
        process.env.NODE_ENV === 'production' &&
        process.env.PAYPAL_SIMULATE !== 'true'
      ) {
        return {
          success: false,
          payoutBatchId: '',
          payoutItemId: '',
          transactionId: '',
          batchStatus: 'FAILED',
          itemStatus: 'FAILED',
          isSimulated: false,
          rawResponse: {},
          error: 'PayPal credentials are not configured',
        };
      }

      const mockBatchId = `SB-BATCH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const mockItemId = `SB-ITEM-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const mockTxId = `8AB${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

      return {
        success: true,
        payoutBatchId: mockBatchId,
        payoutItemId: mockItemId,
        transactionId: mockTxId,
        batchStatus: 'SUCCESS',
        itemStatus: 'SUCCESS',
        isSimulated: true,
        rawResponse: {
          batch_header: {
            payout_batch_id: mockBatchId,
            batch_status: 'SUCCESS',
            time_created: new Date().toISOString(),
            sender_batch_header: {
              sender_batch_id: senderBatchId,
              email_subject: 'Payment from Countersign',
            },
            amount: { value: amountMajor.toFixed(2), currency },
          },
          items: [
            {
              payout_item_id: mockItemId,
              transaction_id: mockTxId,
              transaction_status: 'SUCCESS',
              payout_item_fee: { currency: 'USD', value: '0.25' },
              payout_item: {
                recipient_type: 'EMAIL',
                amount: { value: amountMajor.toFixed(2), currency },
                note,
                receiver: recipientEmail,
                sender_item_id: senderItemId,
              },
            },
          ],
        },
      };
    }

    try {
      const token = await this.getAccessToken();
      const payload = {
        sender_batch_header: {
          sender_batch_id: senderBatchId,
          email_subject: 'Payment from Countersign',
          email_message: 'An authorized agent payment has been sent via Countersign.',
        },
        items: [
          {
            recipient_type: 'EMAIL',
            receiver: recipientEmail,
            amount: {
              value: amountMajor.toFixed(2),
              currency,
            },
            note,
            sender_item_id: senderItemId,
          },
        ],
      };

      const res = await fetchWithTimeout(`${this.baseUrl}/v1/payments/payouts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'PayPal-Request-Id': intentId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseBody = await res.json();
      if (!res.ok) {
        return {
          success: false,
          payoutBatchId: '',
          payoutItemId: '',
          transactionId: '',
          batchStatus: 'FAILED',
          itemStatus: 'FAILED',
          isSimulated: false,
          rawResponse: responseBody,
          error: responseBody.message || `PayPal Payouts error (${res.status})`,
        };
      }

      const batchHeader = responseBody.batch_header;
      const payoutBatchId = batchHeader?.payout_batch_id || '';

      // The create response often omits item-level details. Fetch the batch
      // once so ledger/UI records contain real IDs rather than fabricated ones.
      let item: Record<string, unknown> | null = null;
      if (payoutBatchId) {
        const details = await this.getPayoutDetails(token, payoutBatchId);
        const items = details?.items;
        if (Array.isArray(items) && items.length > 0) {
          item = items[0] as Record<string, unknown>;
        }
      }

      return {
        success: true,
        payoutBatchId,
        payoutItemId: typeof item?.payout_item_id === 'string' ? item.payout_item_id : '',
        transactionId:
          typeof item?.transaction_id === 'string' ? item.transaction_id : '',
        batchStatus: batchHeader?.batch_status || 'PENDING',
        itemStatus:
          typeof item?.transaction_status === 'string' ? item.transaction_status : 'PENDING',
        isSimulated: false,
        rawResponse: responseBody,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        payoutBatchId: '',
        payoutItemId: '',
        transactionId: '',
        batchStatus: 'FAILED',
        itemStatus: 'FAILED',
        isSimulated: false,
        rawResponse: {},
        error: msg,
      };
    }
  }

  private async getPayoutDetails(
    token: string,
    payoutBatchId: string
  ): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetchWithTimeout(
        `${this.baseUrl}/v1/payments/payouts/${encodeURIComponent(payoutBatchId)}?fields=items`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) return null;
      return (await res.json()) as Record<string, unknown>;
    } catch (err) {
      console.warn('[Countersign] Unable to fetch PayPal payout details:', err);
      return null;
    }
  }

  /**
   * Fetch the current provider status of a previously submitted payout batch.
   * Returns null when credentials are missing or PayPal cannot be reached.
   */
  async fetchPayoutStatus(payoutBatchId: string): Promise<{
    batchStatus: string;
    itemStatus: string;
    payoutItemId: string;
    transactionId: string;
  } | null> {
    if (!this.isConfigured || !payoutBatchId) return null;
    try {
      const token = await this.getAccessToken();
      const details = await this.getPayoutDetails(token, payoutBatchId);
      if (!details) return null;
      const header = (details.batch_header ?? {}) as Record<string, unknown>;
      const items = Array.isArray(details.items) ? details.items : [];
      const item = (items[0] ?? {}) as Record<string, unknown>;
      return {
        batchStatus: String(header.batch_status ?? ''),
        itemStatus: String(item.transaction_status ?? ''),
        payoutItemId: String(item.payout_item_id ?? ''),
        transactionId: String(item.transaction_id ?? ''),
      };
    } catch (err) {
      console.warn('[Countersign] Unable to reconcile PayPal payout:', err);
      return null;
    }
  }

  /**
   * Ask PayPal to verify the transmission signature. The caller must pass the
   * raw `PAYPAL-*` headers and the parsed webhook event.
   */
  async verifyWebhookSignature(params: WebhookVerificationParams): Promise<boolean> {
    if (!this.isConfigured) return false;

    try {
      const token = await this.getAccessToken();
      const res = await fetchWithTimeout(
        `${this.baseUrl}/v1/notifications/verify-webhook-signature`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transmission_id: params.transmissionId,
            transmission_time: params.transmissionTime,
            cert_url: params.certUrl,
            auth_algo: params.authAlgo,
            transmission_sig: params.transmissionSig,
            webhook_id: params.webhookId,
            webhook_event: params.webhookEvent,
          }),
        }
      );

      if (!res.ok) {
        console.warn(
          `[Countersign] PayPal webhook verification failed with HTTP ${res.status}`
        );
        return false;
      }

      const data = (await res.json()) as Record<string, unknown>;
      return data.verification_status === 'SUCCESS';
    } catch (err) {
      console.warn('[Countersign] PayPal webhook verification error:', err);
      return false;
    }
  }
}

export const payPalService = new PayPalService();
