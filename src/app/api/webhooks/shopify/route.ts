export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items, shopifySales, type Item } from "@/db/schema";
import { and, eq, isNull, isNotNull, ne, sql } from "drizzle-orm";
import { logEvents } from "@/lib/events";
import { getShopifyConfig, lookupHandle, verifyShopifyHmac } from "@/lib/shopifyAdmin";
import { JUNK_SUBSTRINGS, normalize } from "@/lib/shopify";

type LineItem = {
  id: number | string;
  title?: string;
  price?: string;
  quantity?: number;
  product_id?: number | string | null;
};

async function markSold(item: Item, li: LineItem, orderName: string, orderDate: string | null) {
  const price = parseFloat(String(li.price ?? ""));
  const note = `Shopify ${orderName}`;
  await db
    .update(items)
    .set({
      status: "verkocht",
      verkoopprijs: Number.isFinite(price) ? price.toFixed(2) : item.verkoopprijs,
      verkoopdatum: orderDate ?? new Date().toISOString().slice(0, 10),
      kanaal: "shopify",
      notities: sql`case when coalesce(${items.notities}, '') = '' then ${note} else ${items.notities} || E'\n' || ${note} end`,
      updatedAt: new Date(),
    })
    .where(eq(items.id, item.id));
  await logEvents(item.id, "Shopify", [
    {
      type: "sold_auto",
      details: { order: orderName, price: Number.isFinite(price) ? price.toFixed(2) : null },
    },
  ]);
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const cfg = await getShopifyConfig();
  if (!cfg.secret || !verifyShopifyHmac(raw, req.headers.get("x-shopify-hmac-sha256"), cfg.secret)) {
    return NextResponse.json({ error: "invalid hmac" }, { status: 401 });
  }
  const topic = req.headers.get("x-shopify-topic");
  if (topic !== "orders/paid") {
    return NextResponse.json({ ok: true, skipped: topic });
  }

  const order = JSON.parse(raw) as {
    id: number | string;
    name?: string;
    created_at?: string;
    processed_at?: string;
    line_items?: LineItem[];
  };
  const orderId = String(order.id);
  const orderName = String(order.name ?? `#${orderId}`);
  const orderDate = String(order.created_at ?? order.processed_at ?? "").slice(0, 10) || null;

  let matched = 0;
  let unmatched = 0;
  let duplicates = 0;

  for (const li of order.line_items ?? []) {
    const title = String(li.title ?? "").trim();
    if (!title) continue;
    if (JUNK_SUBSTRINGS.some((j) => title.toLowerCase().includes(j))) continue;

    // Дедуп: уникальность (order_id, line_item_id); повторная доставка — no-op.
    let saleRow;
    try {
      [saleRow] = await db
        .insert(shopifySales)
        .values({
          orderId,
          orderName,
          lineItemId: String(li.id),
          title,
          price: li.price != null && Number.isFinite(parseFloat(String(li.price))) ? parseFloat(String(li.price)).toFixed(2) : null,
          quantity: li.quantity ?? 1,
          orderDate,
        })
        .returning();
    } catch {
      duplicates++;
      continue;
    }

    // Матчинг: handle через Admin API; фолбэк — точное название из снапшота связки.
    let handle: string | null = null;
    if (li.product_id != null) {
      handle = await lookupHandle(cfg, String(li.product_id));
    }
    let item: Item | undefined;
    if (handle) {
      [item] = await db
        .select()
        .from(items)
        .where(and(eq(items.shopifyHandle, handle), isNull(items.archivedAt), ne(items.status, "verkocht")));
    }
    if (!item) {
      const linked = await db
        .select()
        .from(items)
        .where(and(isNotNull(items.shopifyHandle), isNull(items.archivedAt), ne(items.status, "verkocht")));
      const titleN = normalize(title);
      item = linked.find(
        (i) => normalize(((i.shopifySync as { title?: string } | null)?.title ?? "")) === titleN && titleN.length > 0,
      );
      if (item) handle = item.shopifyHandle;
    }

    if (item) {
      await markSold(item, li, orderName, orderDate);
      await db
        .update(shopifySales)
        .set({ itemId: item.id, handle, resolvedAt: new Date() })
        .where(eq(shopifySales.id, saleRow.id));
      matched++;
    } else {
      if (handle) await db.update(shopifySales).set({ handle }).where(eq(shopifySales.id, saleRow.id));
      unmatched++;
    }
  }

  return NextResponse.json({ ok: true, matched, unmatched, duplicates });
}
