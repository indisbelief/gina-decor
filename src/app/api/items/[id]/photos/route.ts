import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/db";
import { items, photos } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const [item] = await db.select({ id: items.id }).from(items).where(eq(items.id, id));
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не передан" }, { status: 400 });
  }

  const blob = await put(`items/${id}/${Date.now()}.jpg`, file, {
    access: "public",
    contentType: file.type || "image/jpeg",
  });

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(photos)
    .where(eq(photos.itemId, id));

  const [created] = await db
    .insert(photos)
    .values({
      itemId: id,
      url: blob.url,
      volgorde: count,
      isHoofdfoto: count === 0,
    })
    .returning();

  return NextResponse.json(created, { status: 201 });
}
