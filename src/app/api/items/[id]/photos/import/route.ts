export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import sharp from "sharp";
import { db } from "@/db";
import { items, photos } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getActor, logEvents } from "@/lib/events";

type Params = { params: Promise<{ id: string }> };

/** Импорт фото по URL (Shopify Image Src): скачиваем, жмём, кладём в Blob. */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const [item] = await db.select({ id: items.id }).from(items).where(eq(items.id, id));
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = await req.json();
  const urls: string[] = Array.isArray(body.urls)
    ? body.urls.filter((u: unknown) => typeof u === "string" && /^https:\/\//.test(u as string)).slice(0, 20)
    : [];
  if (!urls.length) return NextResponse.json({ error: "urls обязательны" }, { status: 400 });

  const existing = await db
    .select({ sourceUrl: photos.sourceUrl })
    .from(photos)
    .where(eq(photos.itemId, id));
  const already = new Set(existing.map((p) => p.sourceUrl).filter(Boolean));
  const fresh = urls.filter((u) => !already.has(u));

  let created = 0;
  for (const url of fresh) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const src = Buffer.from(new Uint8Array(await res.arrayBuffer()));
      // тот же пайплайн, что и загрузка с телефона: оригинал ≤1600px + thumb 400
      const original = await sharp(src)
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 60 })
        .toBuffer();
      const thumb = await sharp(src).resize(400, 400, { fit: "cover" }).jpeg({ quality: 70 }).toBuffer();

      const copy = (b: Buffer) => {
        const ab = new ArrayBuffer(b.byteLength);
        new Uint8Array(ab).set(b);
        return ab;
      };
      const ts = Date.now() + created;
      const [blob, thumbBlob] = await Promise.all([
        put(`items/${id}/${ts}.jpg`, copy(original), { access: "public", contentType: "image/jpeg" }),
        put(`items/${id}/${ts}-thumb.jpg`, copy(thumb), { access: "public", contentType: "image/jpeg" }),
      ]);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(photos)
        .where(eq(photos.itemId, id));
      await db.insert(photos).values({
        itemId: id,
        url: blob.url,
        thumbUrl: thumbBlob.url,
        sourceUrl: url,
        volgorde: count,
        isHoofdfoto: count === 0,
      });
      created++;
    } catch {
      // одно битое фото не должно ронять импорт остальных
    }
  }

  if (created > 0) {
    await logEvents(id, getActor(req), [
      { type: "photo_added", details: { source: "shopify", count: created } },
    ]);
  }
  return NextResponse.json({ created, skipped: urls.length - fresh.length });
}
