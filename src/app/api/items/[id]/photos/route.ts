export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { db } from "@/db";
import { items, photos } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getActor, logEvents } from "@/lib/events";

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

  // toNormalBuffer: буферы здесь могут оказаться на базе SharedArrayBuffer
  // (file.arrayBuffer() в проде, выдача sharp), а fetch внутри @vercel/blob
  // такие не принимает — копируем в обычный ArrayBuffer.
  const toNormalBuffer = (u8: Uint8Array) => {
    const copy = new ArrayBuffer(u8.byteLength);
    new Uint8Array(copy).set(u8);
    return copy;
  };

  const raw = new Uint8Array(await file.arrayBuffer());
  const buf = Buffer.from(toNormalBuffer(raw));
  // Миниатюра для сетки списка — чтобы не гонять оригинал 1600px.
  const thumb = await sharp(buf).resize(400, 400, { fit: "cover" }).jpeg({ quality: 70 }).toBuffer();

  const ts = Date.now();
  const [blob, thumbBlob] = await Promise.all([
    put(`items/${id}/${ts}.jpg`, toNormalBuffer(buf), {
      access: "public",
      contentType: file.type || "image/jpeg",
    }),
    put(`items/${id}/${ts}-thumb.jpg`, toNormalBuffer(thumb), {
      access: "public",
      contentType: "image/jpeg",
    }),
  ]);

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(photos)
    .where(eq(photos.itemId, id));

  const [created] = await db
    .insert(photos)
    .values({
      itemId: id,
      url: blob.url,
      thumbUrl: thumbBlob.url,
      volgorde: count,
      isHoofdfoto: count === 0,
    })
    .returning();

  await logEvents(id, getActor(req), [{ type: "photo_added", details: { thumb: thumbBlob.url } }]);
  return NextResponse.json(created, { status: 201 });
}
