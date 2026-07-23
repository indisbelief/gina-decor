export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items } from "@/db/schema";
import { desc, isNull, sql } from "drizzle-orm";

export async function GET() {
  const rows = await db
    .select({
      item: items,
      hoofdfoto: sql<string | null>`(
        select url from photos p
        where p.item_id = ${items.id}
        order by p.is_hoofdfoto desc, p.volgorde asc, p.created_at asc
        limit 1
      )`,
    })
    .from(items)
    .where(isNull(items.archivedAt))
    .orderBy(desc(items.createdAt));

  return NextResponse.json(rows.map((r) => ({ ...r.item, hoofdfoto: r.hoofdfoto })));
}

async function nextSku(): Promise<string> {
  const [row] = await db
    .select({
      max: sql<number>`coalesce(max(nullif(regexp_replace(${items.sku}, '\\D', '', 'g'), '')::int), 0)`,
    })
    .from(items);
  return `GD-${String((row?.max ?? 0) + 1).padStart(4, "0")}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.merk || !String(body.merk).trim()) {
    return NextResponse.json({ error: "Бренд обязателен" }, { status: 400 });
  }
  const [created] = await db
    .insert(items)
    .values({
      sku: await nextSku(),
      merk: String(body.merk).trim(),
      model: body.model?.trim() || null,
      soort: body.soort?.trim() || null,
      aantalDelen: body.aantalDelen ? parseInt(body.aantalDelen, 10) || null : null,
      staat: body.staat || null,
      locatie: body.locatie?.trim() || null,
      inkoopprijs: body.inkoopprijs ? String(body.inkoopprijs) : null,
      vraagprijs: body.vraagprijs ? String(body.vraagprijs) : null,
      leverancier: body.leverancier?.trim() || null,
      notities: body.notities?.trim() || null,
      status: body.status || "voorraad",
    })
    .returning();
  return NextResponse.json(created, { status: 201 });
}
