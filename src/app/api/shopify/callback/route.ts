export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  getShopifyConfig,
  saveOfflineToken,
  verifyOAuthQueryHmac,
} from "@/lib/shopifyAdmin";

/** Возврат из Shopify: state + HMAC параметров, обмен code на offline-токен. */
export async function GET(req: NextRequest) {
  const host = req.headers.get("host") ?? "gina-decor.vercel.app";
  const done = (query: string) => {
    const res = NextResponse.redirect(new URL(`/settings?${query}`, `https://${host}`));
    res.cookies.delete("gd_oauth_state");
    return res;
  };
  const fail = (msg: string) => done(`shopify_error=${encodeURIComponent(msg)}`);

  const cfg = await getShopifyConfig();
  if (!cfg.domain || !cfg.clientId || !cfg.clientSecret) return fail("Конфигурация Shopify не заполнена");

  const q = req.nextUrl.searchParams;
  const state = q.get("state");
  const cookieState = req.cookies.get("gd_oauth_state")?.value;
  if (!state || !cookieState || state !== cookieState) {
    return fail("state не совпал — начните авторизацию заново из настроек");
  }
  if (!verifyOAuthQueryHmac(q, cfg.clientSecret)) {
    return fail("подпись параметров callback не сошлась");
  }
  const shop = q.get("shop");
  if (shop !== cfg.domain) return fail(`callback пришёл от неожиданного магазина: ${shop}`);
  const code = q.get("code");
  if (!code) return fail("Shopify не передал code");

  let res: Response;
  try {
    res = await fetch(`https://${cfg.domain}/admin/oauth/access_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        code,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) {
    return fail(`обмен code не удался: ${(e as Error).message}`);
  }
  if (!res.ok) {
    const text = (await res.text()).slice(0, 200);
    return fail(`обмен code отклонён (${res.status}): ${/^\s*</.test(text) ? "ответ не JSON" : text}`);
  }
  const data = (await res.json()) as { access_token?: string; scope?: string; associated_user?: unknown };
  if (!data.access_token) return fail("в ответе нет access_token");
  if (data.associated_user) {
    // per-user (online) токен короткоживущий — нам нужен offline
    return fail("получен per-user токен вместо offline — проверьте настройки приложения");
  }

  await saveOfflineToken({
    token: data.access_token,
    shop: cfg.domain,
    scope: data.scope ?? null,
    obtainedAt: new Date().toISOString(),
  });
  return done("shopify=ok");
}
