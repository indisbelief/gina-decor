export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { adminFetch, getShopifyConfig } from "@/lib/shopifyAdmin";

type WebhookRow = { id: number; topic: string; address: string };

function webhookAddress(req: NextRequest): string {
  const host = req.headers.get("host") ?? "gina-decor.vercel.app";
  return `https://${host}/api/webhooks/shopify`;
}

export async function GET(req: NextRequest) {
  const cfg = await getShopifyConfig();
  const configured = !!(cfg.domain && cfg.token && cfg.secret);
  if (!configured) {
    return NextResponse.json({ configured, connected: false });
  }
  try {
    const res = await adminFetch(cfg, "/webhooks.json");
    if (!res.ok) {
      return NextResponse.json({
        configured,
        connected: false,
        error: `Admin API ответил ${res.status} — проверьте домен и токен`,
      });
    }
    const data = (await res.json()) as { webhooks: WebhookRow[] };
    const address = webhookAddress(req);
    const ours = data.webhooks.find((w) => w.topic === "orders/paid" && w.address === address);
    return NextResponse.json({ configured, connected: !!ours, webhookId: ours?.id ?? null, address });
  } catch (e) {
    return NextResponse.json({ configured, connected: false, error: (e as Error).message });
  }
}

export async function POST(req: NextRequest) {
  const cfg = await getShopifyConfig();
  if (!cfg.domain || !cfg.token || !cfg.secret) {
    return NextResponse.json({ error: "Сначала заполните домен, токен и API secret" }, { status: 400 });
  }
  const address = webhookAddress(req);
  try {
    const res = await adminFetch(cfg, "/webhooks.json", {
      method: "POST",
      body: JSON.stringify({ webhook: { topic: "orders/paid", address, format: "json" } }),
    });
    if (res.status === 422) {
      // адрес уже зарегистрирован — считаем подключённым
      return NextResponse.json({ connected: true, already: true });
    }
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Admin API ${res.status}: ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }
    const data = (await res.json()) as { webhook: WebhookRow };
    return NextResponse.json({ connected: true, webhookId: data.webhook.id, address });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
