export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { appConfig } from "@/db/schema";
import { CONFIG_KEYS, getShopifyConfig } from "@/lib/shopifyAdmin";

export async function GET() {
  const cfg = await getShopifyConfig();
  // токен и секрет наружу не отдаём — только факт наличия
  return NextResponse.json({
    domain: cfg.domain,
    tokenSet: !!cfg.token,
    secretSet: !!cfg.secret,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const updates: [string, string][] = [];
  if (typeof body.domain === "string" && body.domain.trim()) {
    const domain = body.domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!/^[\w-]+\.myshopify\.com$/.test(domain)) {
      return NextResponse.json({ error: "Домен должен быть вида my-shop.myshopify.com" }, { status: 400 });
    }
    updates.push([CONFIG_KEYS.domain, domain]);
  }
  if (typeof body.token === "string" && body.token.trim()) updates.push([CONFIG_KEYS.token, body.token.trim()]);
  if (typeof body.secret === "string" && body.secret.trim()) updates.push([CONFIG_KEYS.secret, body.secret.trim()]);
  if (!updates.length) return NextResponse.json({ error: "Нечего сохранять" }, { status: 400 });

  for (const [key, value] of updates) {
    await db
      .insert(appConfig)
      .values({ key, value })
      .onConflictDoUpdate({ target: appConfig.key, set: { value, updatedAt: new Date() } });
  }
  const cfg = await getShopifyConfig();
  return NextResponse.json({ domain: cfg.domain, tokenSet: !!cfg.token, secretSet: !!cfg.secret });
}
