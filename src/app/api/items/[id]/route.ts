import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items, photos } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const [item] = await db.select().from(items).where(eq(items.id, id));
  if (!item) return NextResponse.json({ error: "not found" }, { status: 404 });
  const itemPhotos = await db
    .select()
    .from(photos)
    .where(eq(photos.itemId, id))
    .orderBy(desc(photos.isHoofdfoto), asc(photos.volgorde), asc(photos.createdAt));
  return NextResponse.json({ ...item, photos: itemPhotos });
}

const EDITABLE = [
  "merk",
  "model",
  "soort",
  "aantalDelen",
  "staat",
  "locatie",
  "inkoopprijs",
  "vraagprijs",
  "verkoopprijs",
  "inkoopdatum",
  "verkoopdatum",
  "leverancier",
  "status",
  "notities",
] as const;

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  const patch: Record<string, unknown> = {};
  for (const key of EDITABLE) {
    if (!(key in body)) continue;
    let v = body[key];
    if (typeof v === "string") v = v.trim() || null;
    if (key === "merk" && !v) {
      return NextResponse.json({ error: "Бренд обязателен" }, { status: 400 });
    }
    if (key === "aantalDelen" && v != null) v = parseInt(String(v), 10) || null;
    if (["inkoopprijs", "vraagprijs", "verkoopprijs"].includes(key) && v != null) {
      const n = parseFloat(String(v).replace(",", "."));
      v = Number.isFinite(n) ? n.toFixed(2) : null;
    }
    patch[key] = v;
  }

  // При отметке «продано» автоматически ставим дату продажи; при возврате — снимаем.
  if (body.status === "verkocht" && !body.verkoopdatum) {
    patch.verkoopdatum = new Date().toISOString().slice(0, 10);
  }
  if (body.status === "voorraad" && !("verkoopdatum" in body)) {
    patch.verkoopdatum = null;
    patch.verkoopprijs = null;
  }
  if (body.archived === true) patch.archivedAt = new Date();
  if (body.archived === false) patch.archivedAt = null;

  patch.updatedAt = new Date();

  const [updated] = await db.update(items).set(patch).where(eq(items.id, id)).returning();
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}
