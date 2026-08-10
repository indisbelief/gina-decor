import { createHmac, timingSafeEqual } from "crypto";
import { db } from "@/db";
import { appConfig } from "@/db/schema";
import { eq, inArray } from "drizzle-orm";

export type ShopifyConfig = {
  domain: string | null;
  clientId: string | null;
  clientSecret: string | null;
};

export const CONFIG_KEYS = {
  domain: "shopify_domain",
  clientId: "shopify_client_id",
  clientSecret: "shopify_client_secret",
} as const;

export const TOKEN_KEY = "shopify_offline_token";
const API_VERSION = "2025-01";

export const OAUTH_SCOPES = "read_orders,read_products";

/** Конфиг интеграции: env имеет приоритет над app_config. */
export async function getShopifyConfig(): Promise<ShopifyConfig> {
  const rows = await db
    .select()
    .from(appConfig)
    .where(inArray(appConfig.key, Object.values(CONFIG_KEYS)));
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    domain: process.env.SHOPIFY_SHOP_DOMAIN ?? map.get(CONFIG_KEYS.domain) ?? null,
    clientId: process.env.SHOPIFY_CLIENT_ID ?? map.get(CONFIG_KEYS.clientId) ?? null,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET ?? map.get(CONFIG_KEYS.clientSecret) ?? null,
  };
}

/** Подпись тела вебхуков — client secret приложения. */
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

/** Подпись query-параметров OAuth-callback (hex, отсортированные пары без hmac/signature). */
export function verifyOAuthQueryHmac(params: URLSearchParams, secret: string): boolean {
  const hmac = params.get("hmac");
  if (!hmac) return false;
  const message = [...params.entries()]
    .filter(([k]) => k !== "hmac" && k !== "signature")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  const digest = Buffer.from(createHmac("sha256", secret).update(message).digest("hex"));
  const header = Buffer.from(hmac);
  return digest.length === header.length && timingSafeEqual(digest, header);
}

export type OfflineToken = {
  token: string;
  shop: string;
  scope: string | null;
  obtainedAt: string;
};

/** Бессрочный offline-токен из authorization code grant. */
export async function getOfflineToken(): Promise<OfflineToken | null> {
  if (process.env.SHOPIFY_OFFLINE_TOKEN) {
    const cfg = await getShopifyConfig();
    return {
      token: process.env.SHOPIFY_OFFLINE_TOKEN,
      shop: cfg.domain ?? "",
      scope: null,
      obtainedAt: "",
    };
  }
  const [row] = await db.select().from(appConfig).where(eq(appConfig.key, TOKEN_KEY));
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.value) as OfflineToken;
    return parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveOfflineToken(t: OfflineToken) {
  await db
    .insert(appConfig)
    .values({ key: TOKEN_KEY, value: JSON.stringify(t) })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: JSON.stringify(t), updatedAt: new Date() },
    });
}

export async function clearOfflineToken() {
  await db.delete(appConfig).where(eq(appConfig.key, TOKEN_KEY));
}

export async function adminFetch(
  cfg: ShopifyConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  if (!cfg.domain) throw new Error("Shopify не настроен: нужен домен");
  const auth = await getOfflineToken();
  if (!auth) {
    throw new Error("Shopify не авторизован — нажмите «Авторизовать в Shopify» в настройках");
  }
  const res = await fetch(`https://${cfg.domain}/admin/api/${API_VERSION}${path}`, {
    ...init,
    headers: {
      "X-Shopify-Access-Token": auth.token,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401) {
    throw new Error("Shopify отверг токен — нужна повторная авторизация («Авторизовать в Shopify»)");
  }
  return res;
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
