import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/db";
import { appConfig } from "@/db/schema";
import { inArray } from "drizzle-orm";

export type ShopifyConfig = {
  domain: string | null;
  token: string | null;
  secret: string | null;
};

export const CONFIG_KEYS = {
  domain: "shopify_domain",
  token: "shopify_admin_token",
  secret: "shopify_api_secret",
} as const;

const API_VERSION = "2025-01";

/** Конфиг интеграции: env имеет приоритет над app_config. */
export async function getShopifyConfig(): Promise<ShopifyConfig> {
  const rows = await db
    .select()
    .from(appConfig)
    .where(inArray(appConfig.key, Object.values(CONFIG_KEYS)));
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    domain: process.env.SHOPIFY_SHOP_DOMAIN ?? map.get(CONFIG_KEYS.domain) ?? null,
    token: process.env.SHOPIFY_ADMIN_TOKEN ?? map.get(CONFIG_KEYS.token) ?? null,
    secret: process.env.SHOPIFY_API_SECRET ?? map.get(CONFIG_KEYS.secret) ?? null,
  };
}

export function verifyShopifyHmac(raw: string, headerB64: string | null, secret: string): boolean {
  if (!headerB64) return false;
  const digest = createHmac("sha256", secret).update(raw, "utf8").digest();
  let header: Buffer;
  try {
    header = Buffer.from(headerB64, "base64");
  } catch {
    return false;
  }
  return header.length === digest.length && timingSafeEqual(digest, header);
}

export async function adminFetch(
  cfg: ShopifyConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  if (!cfg.domain || !cfg.token) throw new Error("Shopify не настроен: нужны домен и Admin API token");
  return fetch(`https://${cfg.domain}/admin/api/${API_VERSION}${path}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": cfg.token,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(8000),
  });
}

const handleCache = new Map<string, string | null>();

/** product_id → handle: line_items вебхука handle не содержат. */
export async function lookupHandle(cfg: ShopifyConfig, productId: string): Promise<string | null> {
  if (handleCache.has(productId)) return handleCache.get(productId)!;
  try {
    const res = await adminFetch(cfg, `/products/${productId}.json?fields=handle`);
    if (!res.ok) return null;
    const data = (await res.json()) as { product?: { handle?: string } };
    const handle = data.product?.handle ?? null;
    handleCache.set(productId, handle);
    return handle;
  } catch {
    return null;
  }
}
