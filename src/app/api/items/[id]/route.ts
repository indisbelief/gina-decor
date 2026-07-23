import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { items, photos, type Item } from "@/db/schema";
import { asc, desc, eq } from "drizzle-orm";
import { getActor, logEvents, type EventInput } from "@/lib/events";

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

const PRICE_FIELDS = ["inkoopprijs", "vraagprijs", "verkoopprijs"] as const;

function diffEvents(before: Item, after: Item, body: Record<string, unknown>): EventInput[] {
  const evs: EventInput[] = [];

  if (body.status && after.status !== before.status) {
    if (after.status === "verkocht") {
      evs.push({ type: "sold", details: { price: after.verkoopprijs } });
    } else if (before.status === "verkocht") {
      evs.push({ type: "returned" });
    } else if (after.status === "gereserveerd") {
      evs.push({ type: "reserved" });
    } else {
      evs.push({ type: "status_changed", details: { from: before.status, to: after.status } });
    }
  }
  if (body.archived === true) evs.push({ type: "archived" });
  if (body.archived === false) evs.push({ type: "unarchived" });

  const statusTouched = evs.some((e) => ["sold", "returned"].includes(e.type));
  const changedFields: string[] = [];
  for (const key of EDITABLE) {
    if (!(key in body) || key === "status") continue;
    const from = before[key] == null ? "" : String(before[key]);
    const to = after[key] == null ? "" : String(after[key]);
    if (from === to) continue;
    // Цена/дата продажи при отметке «продано»/возврате уже покрыты событием.
    if (statusTouched && (key === "verkoopprijs" || key === "verkoopdatum")) continue;
    if ((PRICE_FIELDS as readonly string[]).includes(key)) {
      evs.push({ type: "price_changed", details: { field: key, from: from || null, to: to || null } });
    } else {
      changedFields.push(key);
    }
  }
  if (changedFields.length) evs.push({ type: "updated", details: { fields: changedFields } });
  return evs;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  const [before] = await db.select().from(items).where(eq(items.id, id));
  if (!before) return NextResponse.json({ error: "not found" }, { status: 404 });

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
  await logEvents(id, getActor(req), diffEvents(before, updated, body));
  return NextResponse.json(updated);
}
