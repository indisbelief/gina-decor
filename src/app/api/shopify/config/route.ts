export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appConfig } from "@/db/schema";
import {
  CONFIG_KEYS,
  clearOfflineToken,
  getOfflineToken,
  getShopifyConfig,
} from "@/lib/shopifyAdmin";

async function status() {
  const cfg = await getShopifyConfig();
  const auth = await getOfflineToken();
  // токен наружу не отдаём — только магазин и дату авторизации
  return {
    domain: cfg.domain,
    clientIdSet: !!cfg.clientId,
    clientSecretSet: !!cfg.clientSecret,
    authorized: auth ? { shop: auth.shop, obtainedAt: auth.obtainedAt, scope: auth.scope } : null,
  };
}

export async function GET() {
  return NextResponse.json(await status());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const before = await getShopifyConfig();
  const updates: [string, string][] = [];
  if (typeof body.domain === "string" && body.domain.trim()) {
    const domain = body.domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!/^[\w-]+\.myshopify\.com$/.test(domain)) {
      return NextResponse.json({ error: "Домен должен быть вида my-shop.myshopify.com" }, { status: 400 });
    }
    updates.push([CONFIG_KEYS.domain, domain]);
  }
  if (typeof body.clientId === "string" && body.clientId.trim()) {
    updates.push([CONFIG_KEYS.clientId, body.clientId.trim()]);
  }
  if (typeof body.clientSecret === "string" && body.clientSecret.trim()) {
    updates.push([CONFIG_KEYS.clientSecret, body.clientSecret.trim()]);
  }
  if (!updates.length) return NextResponse.json({ error: "Нечего сохранять" }, { status: 400 });

  for (const [key, value] of updates) {
    await db
      .insert(appConfig)
      .values({ key, value })
      .onConflictDoUpdate({ target: appConfig.key, set: { value, updatedAt: new Date() } });
  }
  // смена магазина делает сохранённый offline-токен чужим — сбрасываем
  const after = await getShopifyConfig();
  if (before.domain && after.domain !== before.domain) await clearOfflineToken();

  return NextResponse.json(await status());
}
