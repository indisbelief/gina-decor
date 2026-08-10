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

const TOKEN_KEY = "shopify_access_token";
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
    clientId: process.env.SHOPIFY_CLIENT_ID ?? map.get(CONFIG_KEYS.clientId) ?? null,
    clientSecret: process.env.SHOPIFY_CLIENT_SECRET ?? map.get(CONFIG_KEYS.clientSecret) ?? null,
  };
}

/** Подпись вебхуков в новой схеме custom apps идёт client secret'ом. */
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

type CachedToken = { token: string; expiresAt: number };
let memToken: CachedToken | null = null;

export async function invalidateAccessToken() {
  memToken = null;
  try {
    await db.delete(appConfig).where(eq(appConfig.key, TOKEN_KEY));
  } catch {
    // нет кэша — нечего сбрасывать
  }
}

/**
 * Access token по client credentials grant. Токен короткоживущий:
 * кэшируем в памяти и в app_config (общий для всех инстансов),
 * обновляем за минуту до истечения.
 */
export async function getAccessToken(cfg: ShopifyConfig, force = false): Promise<string> {
  if (!cfg.domain || !cfg.clientId || !cfg.clientSecret) {
    throw new Error("Shopify не настроен: нужны домен, Client ID и Client Secret");
  }
  const now = Date.now();
  if (!force) {
    if (memToken && memToken.expiresAt - 60_000 > now) return memToken.token;
    const [row] = await db.select().from(appConfig).where(eq(appConfig.key, TOKEN_KEY));
    if (row) {
      try {
        const cached = JSON.parse(row.value) as CachedToken;
        if (cached.token && cached.expiresAt - 60_000 > now) {
          memToken = cached;
          return cached.token;
        }
      } catch {
        // битый кэш — просто обменяем заново
      }
    }
  }

  let res: Response;
  try {
    res = await fetch(`https://${cfg.domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: "client_credentials",
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    throw new Error(`Не удалось связаться с ${cfg.domain}: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 300);
    throw new Error(`Token exchange отклонён (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error("Token exchange: в ответе нет access_token");

  memToken = { token: data.access_token, expiresAt: now + (data.expires_in ?? 86400) * 1000 };
  await db
    .insert(appConfig)
    .values({ key: TOKEN_KEY, value: JSON.stringify(memToken) })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value: JSON.stringify(memToken), updatedAt: new Date() },
    });
  return memToken.token;
}

export async function adminFetch(
  cfg: ShopifyConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  if (!cfg.domain) throw new Error("Shopify не настроен: нужен домен");
  const doFetch = (token: string) =>
    fetch(`https://${cfg.domain}/admin/api/${API_VERSION}${path}`, {
      ...init,
      headers: {
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
        ...init?.headers,
      },
      signal: AbortSignal.timeout(8000),
    });

  let res = await doFetch(await getAccessToken(cfg));
  if (res.status === 401) {
    // токен мог быть отозван раньше expires_in — обменяем заново один раз
    res = await doFetch(await getAccessToken(cfg, true));
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
