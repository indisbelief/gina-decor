export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { db } from "@/db";
import { items, itemEvents } from "@/db/schema";
import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";

const STOCK_PRICE = sql<number>`coalesce(${items.vraagprijs}, ${items.inkoopprijs})`;
const SOLD_PRICE = sql<number>`coalesce(${items.verkoopprijs}, ${items.vraagprijs}, ${items.inkoopprijs})`;
const IN_STOCK = and(isNull(items.archivedAt), ne(items.status, "verkocht"));

export async function GET() {
  const [stock] = await db
    .select({
      count: sql<number>`count(*)::int`,
      som: sql<number>`coalesce(sum(${STOCK_PRICE}), 0)::float`,
    })
    .from(items)
    .where(IN_STOCK);

  const soldSince = (interval: string) =>
    db
      .select({
        count: sql<number>`count(*)::int`,
        som: sql<number>`coalesce(sum(${SOLD_PRICE}), 0)::float`,
      })
      .from(items)
      .where(
        and(
          isNull(items.archivedAt),
          eq(items.status, "verkocht"),
          sql`${items.verkoopdatum} >= date_trunc(${interval}, current_date)::date`,
        ),
      );

  const [[soldMonth], [soldQuarter]] = await Promise.all([soldSince("month"), soldSince("quarter")]);

  const top5 = await db
    .select({
      id: items.id,
      sku: items.sku,
      merk: items.merk,
      model: items.model,
      locatie: items.locatie,
      prijs: STOCK_PRICE,
      hoofdfoto: sql<string | null>`(
        select coalesce(thumb_url, url) from photos p
        where p.item_id = "items"."id"
        order by p.is_hoofdfoto desc, p.volgorde asc, p.created_at asc
        limit 1
      )`,
    })
    .from(items)
    .where(IN_STOCK)
    .orderBy(sql`${STOCK_PRICE} desc nulls last`)
    .limit(5);

  const [noPhoto] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(items)
    .where(
      and(IN_STOCK, sql`not exists (select 1 from photos p where p.item_id = "items"."id")`),
    );

  const byLocation = await db
    .select({
      locatie: sql<string>`coalesce(${items.locatie}, 'Без места')`,
      count: sql<number>`count(*)::int`,
      som: sql<number>`coalesce(sum(${STOCK_PRICE}), 0)::float`,
    })
    .from(items)
    .where(IN_STOCK)
    .groupBy(sql`coalesce(${items.locatie}, 'Без места')`)
    .orderBy(sql`coalesce(sum(${STOCK_PRICE}), 0) desc`);

  const activity = await db
    .select({
      id: itemEvents.id,
      itemId: itemEvents.itemId,
      type: itemEvents.type,
      actor: itemEvents.actor,
      details: itemEvents.details,
      createdAt: itemEvents.createdAt,
      sku: items.sku,
      merk: items.merk,
      model: items.model,
      locatie: items.locatie,
    })
    .from(itemEvents)
    .innerJoin(items, eq(itemEvents.itemId, items.id))
    .orderBy(desc(itemEvents.createdAt))
    .limit(20);

  return NextResponse.json({ stock, soldMonth, soldQuarter, top5, noPhoto: noPhoto.count, byLocation, activity });
}
