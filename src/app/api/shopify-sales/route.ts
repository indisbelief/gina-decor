export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items, shopifySales } from "@/db/schema";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getActor, logEvents } from "@/lib/events";

export async function GET() {
  const rows = await db
    .select()
    .from(shopifySales)
    .where(and(isNull(shopifySales.itemId), isNull(shopifySales.resolvedAt)))
    .orderBy(desc(shopifySales.createdAt));
  return NextResponse.json(rows);
}

/** Привязка непривязанной продажи к товару (или скрытие через dismiss). */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const saleId = String(body.saleId ?? "");
  if (!saleId) return NextResponse.json({ error: "saleId обязателен" }, { status: 400 });

  const [sale] = await db.select().from(shopifySales).where(eq(shopifySales.id, saleId));
  if (!sale) return NextResponse.json({ error: "Продажа не найдена" }, { status: 404 });
  if (sale.resolvedAt) return NextResponse.json({ error: "Уже обработана" }, { status: 409 });

  if (body.dismiss === true) {
    const [updated] = await db
      .update(shopifySales)
      .set({ resolvedAt: new Date() })
      .where(eq(shopifySales.id, saleId))
      .returning();
    return NextResponse.json(updated);
  }

  const itemId = String(body.itemId ?? "");
  if (!itemId) return NextResponse.json({ error: "itemId обязателен" }, { status: 400 });
  const [item] = await db.select().from(items).where(eq(items.id, itemId));
  if (!item) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  if (item.status === "verkocht") {
    return NextResponse.json({ error: "Товар уже продан" }, { status: 409 });
  }

  const note = `Shopify ${sale.orderName}`;
  await db
    .update(items)
    .set({
      status: "verkocht",
      verkoopprijs: sale.price ?? item.verkoopprijs,
      verkoopdatum: sale.orderDate ?? new Date().toISOString().slice(0, 10),
      kanaal: "shopify",
      notities: sql`case when coalesce(${items.notities}, '') = '' then ${note} else ${items.notities} || E'\n' || ${note} end`,
      updatedAt: new Date(),
    })
    .where(eq(items.id, itemId));
  await logEvents(itemId, getActor(req), [
    { type: "sold_shopify", details: { order: sale.orderName, price: sale.price } },
  ]);
  const [updated] = await db
    .update(shopifySales)
    .set({ itemId, resolvedAt: new Date() })
    .where(eq(shopifySales.id, saleId))
    .returning();
  return NextResponse.json(updated, { status: 201 });
}
