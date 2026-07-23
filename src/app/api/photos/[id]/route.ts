import { NextRequest, NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { db } from "@/db";
import { photos } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const [photo] = await db.delete(photos).where(eq(photos.id, id)).returning();
  if (!photo) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    await del(photo.url);
  } catch {
    // Файл в Blob мог быть удалён вручную — запись в БД важнее.
  }

  if (photo.isHoofdfoto) {
    const [next] = await db
      .select()
      .from(photos)
      .where(eq(photos.itemId, photo.itemId))
      .orderBy(photos.volgorde)
      .limit(1);
    if (next) {
      await db.update(photos).set({ isHoofdfoto: true }).where(eq(photos.id, next.id));
    }
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const [photo] = await db.select().from(photos).where(eq(photos.id, id));
  if (!photo) return NextResponse.json({ error: "not found" }, { status: 404 });

  await db
    .update(photos)
    .set({ isHoofdfoto: false })
    .where(and(eq(photos.itemId, photo.itemId), ne(photos.id, id)));
  const [updated] = await db
    .update(photos)
    .set({ isHoofdfoto: true })
    .where(eq(photos.id, id))
    .returning();
  return NextResponse.json(updated);
}
