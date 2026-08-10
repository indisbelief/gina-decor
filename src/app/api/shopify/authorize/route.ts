export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getShopifyConfig, OAUTH_SCOPES } from "@/lib/shopifyAdmin";

/** Старт authorization code flow: state в httpOnly-куке, редирект на consent. */
export async function GET(req: NextRequest) {
  const cfg = await getShopifyConfig();
  const host = req.headers.get("host") ?? "gina-decor.vercel.app";
  if (!cfg.domain || !cfg.clientId || !cfg.clientSecret) {
    return NextResponse.redirect(
      new URL(`/settings?shopify_error=${encodeURIComponent("Сначала сохраните домен, Client ID и Client Secret")}`, `https://${host}`),
    );
  }
  const state = randomUUID();
  const url = new URL(`https://${cfg.domain}/admin/oauth/authorize`);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("scope", OAUTH_SCOPES);
  url.searchParams.set("redirect_uri", `https://${host}/api/shopify/callback`);
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  res.cookies.set("gd_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
