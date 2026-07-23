export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items, shopifyImports } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getActor, logEvents } from "@/lib/events";

export async function GET() {
  const rows = await db
    .select({
      orderName: shopifyImports.orderName,
      lineitemName: shopifyImports.lineitemName,
      itemId: shopifyImports.itemId,
    })
    .from(shopifyImports);
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const orderName = String(body.orderName ?? "").trim();
  const lineitemName = String(body.lineitemName ?? "").trim();
  const itemId = String(body.itemId ?? "");
  const price = body.price != null ? parseFloat(String(body.price)) : null;
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;

  if (!orderName || !lineitemName || !itemId) {
    return NextResponse.json({ error: "orderName, lineitemName и itemId обязательны" }, { status: 400 });
  }

  const [item] = await db.select().from(items).where(eq(items.id, itemId));
  if (!item) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  if (item.status === "verkocht") {
    return NextResponse.json({ error: "Товар уже продан" }, { status: 409 });
  }

  // Пара «заказ+позиция» уникальна — повторная загрузка файла не задублирует.
  try {
    await db.insert(shopifyImports).values({ orderName, lineitemName, itemId });
  } catch {
    return NextResponse.json({ error: "Эта позиция заказа уже импортирована" }, { status: 409 });
  }

  const note = `Shopify ${orderName}`;
  const [updated] = await db
    .update(items)
    .set({
      status: "verkocht",
      verkoopprijs: price != null && Number.isFinite(price) ? price.toFixed(2) : item.verkoopprijs,
      verkoopdatum: date ?? new Date().toISOString().slice(0, 10),
      notities: sql`case when coalesce(${items.notities}, '') = '' then ${note} else ${items.notities} || E'\n' || ${note} end`,
      updatedAt: new Date(),
    })
    .where(eq(items.id, itemId))
    .returning();

  await logEvents(itemId, getActor(req), [
    { type: "sold_shopify", details: { order: orderName, price: updated.verkoopprijs } },
  ]);

  return NextResponse.json(updated, { status: 201 });
}
