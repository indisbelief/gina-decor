export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getActor, logEvents } from "@/lib/events";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const itemId = String(body.itemId ?? "");
  const handle = String(body.handle ?? "").trim();
  if (!itemId || !handle) {
    return NextResponse.json({ error: "itemId и handle обязательны" }, { status: 400 });
  }

  const [item] = await db.select().from(items).where(eq(items.id, itemId));
  if (!item) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });

  const sync = {
    title: String(body.title ?? ""),
    price: body.price != null && Number.isFinite(parseFloat(String(body.price))) ? parseFloat(String(body.price)) : null,
    status: String(body.status ?? "active"),
    images: Array.isArray(body.images) ? body.images.filter((u: unknown) => typeof u === "string").slice(0, 20) : [],
    syncedAt: new Date().toISOString(),
  };

  const isNewLink = item.shopifyHandle !== handle;
  const [updated] = await db
    .update(items)
    .set({ shopifyHandle: handle, shopifySync: sync, updatedAt: new Date() })
    .where(eq(items.id, itemId))
    .returning();

  // Обновление снапшота уже связанного товара — не событие, просто синк.
  if (isNewLink) {
    await logEvents(itemId, getActor(req), [
      { type: "shopify_linked", details: { handle, title: sync.title } },
    ]);
  }
  return NextResponse.json(updated, { status: isNewLink ? 201 : 200 });
}
