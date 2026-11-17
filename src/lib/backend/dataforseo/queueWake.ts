import { createHash } from "node:crypto";
import { send } from "@vercel/queue";

export const DATAFORSEO_QUEUE_TOPIC = "dataforseo-collection";

export interface DataForSeoQueueMessage {
  version: 1;
  organizationId: string;
  brandId: string;
  clientRequestId: string;
}

export interface PublishDataForSeoWakeInput extends DataForSeoQueueMessage {
  idempotencySeed: string;
  delaySeconds?: number;
}

export type DataForSeoQueueSender = typeof send;

export function isDataForSeoQueueRuntimeReady(env: Record<string, string | undefined> = process.env): boolean {
  if (env.DATAFORSEO_QUEUE_ENABLED !== "true" || env.DATAFORSEO_ENABLED !== "true") return false;
  if (!env.DATAFORSEO_LOGIN || !env.DATAFORSEO_PASSWORD) return false;
  if (env.VERCEL && !env.BLOB_READ_WRITE_TOKEN && !(env.BLOB_STORE_ID && env.VERCEL_OIDC_TOKEN)) return false;
  return true;
}

function idempotencyKey(seed: string): string {
  return `dataforseo:${createHash("sha256").update(seed).digest("hex")}`;
}

export function providerTaskWakeSeed(taskIds: string[]): string {
  return `tasks:${[...taskIds].sort().join(":")}`;
}

export function followupWakeSeed(organizationId: string, brandId: string, dueAtMs: number): string {
  return `followup:${organizationId}:${brandId}:${Math.floor(dueAtMs / 60_000)}`;
}

export async function publishDataForSeoWake(
  input: PublishDataForSeoWakeInput,
  sender: DataForSeoQueueSender = send,
): Promise<{ published: boolean; messageId: string | null }> {
  if (!isDataForSeoQueueRuntimeReady()) return { published: false, messageId: null };
  const { messageId } = await sender(
    DATAFORSEO_QUEUE_TOPIC,
    {
      version: input.version,
      organizationId: input.organizationId,
      brandId: input.brandId,
      clientRequestId: input.clientRequestId,
    } satisfies DataForSeoQueueMessage,
    {
      idempotencyKey: idempotencyKey(input.idempotencySeed),
      retentionSeconds: 86_400,
      ...(input.delaySeconds ? { delaySeconds: input.delaySeconds } : {}),
    },
  );
  return { published: true, messageId };
}

export function isDataForSeoQueueMessage(value: unknown): value is DataForSeoQueueMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<DataForSeoQueueMessage>;
  return message.version === 1
    && typeof message.organizationId === "string" && message.organizationId.length > 0
    && typeof message.brandId === "string" && message.brandId.length > 0
    && typeof message.clientRequestId === "string" && message.clientRequestId.length > 0;
}
