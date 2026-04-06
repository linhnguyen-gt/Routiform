/**
 * Webhook Dispatcher
 * Dispatches events to registered webhooks with HMAC-SHA256 signing and retries
 */

import crypto from "crypto";

export type WebhookEvent =
  | "request.completed"
  | "request.failed"
  | "provider.error"
  | "provider.recovered"
  | "quota.exceeded"
  | "combo.switched"
  | "test.ping";

export interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  data: Record<string, any>;
}

function signPayload(payload: string, secret: string): string {
  return `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;
}

export async function deliverWebhook(
  url: string,
  payload: WebhookPayload,
  secret?: string | null,
  maxRetries = 3
): Promise<{ success: boolean; status: number; error?: string }> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Routiform-Webhook/1.0",
    "X-Webhook-Event": payload.event,
    "X-Webhook-Timestamp": payload.timestamp,
  };

  if (secret) {
    headers["X-Webhook-Signature"] = signPayload(body, secret);
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const res = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok || res.status < 500) {
        return { success: res.ok, status: res.status };
      }

      // Server error — retry with exponential backoff
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
      }
    } catch (error: any) {
      if (attempt === maxRetries) {
        return { success: false, status: 0, error: error.message || "Network error" };
      }
      await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }

  return { success: false, status: 0, error: "Max retries exceeded" };
}

/**
 * Dispatch an event to all matching enabled webhooks
 */
export async function dispatchEvent(event: WebhookEvent, data: Record<string, any>): Promise<void> {
  // Lazy import to avoid circular deps
  const { getEnabledWebhooks, recordWebhookDelivery, disableWebhooksWithHighFailures } =
    await import("./db/webhooks");

  const webhooks = getEnabledWebhooks();
  const payload: WebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const deliveries = webhooks
    .filter((wh) => {
      const events = wh.events;
      return events.includes("*") || events.includes(event);
    })
    .map(async (wh) => {
      const result = await deliverWebhook(wh.url, payload, wh.secret);
      recordWebhookDelivery(wh.id, result.status, result.success);
      return { webhookId: wh.id, ...result };
    });

  await Promise.allSettled(deliveries);

  // Auto-disable webhooks with too many failures
  disableWebhooksWithHighFailures(10);
}
