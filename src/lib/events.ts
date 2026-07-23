import { NextRequest } from "next/server";
import { db } from "@/db";
import { itemEvents } from "@/db/schema";

export function getActor(req: NextRequest): string | null {
  const raw = req.cookies.get("gd_user")?.value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).slice(0, 60) || null;
  } catch {
    return null;
  }
}

export type EventInput = {
  type: string;
  details?: Record<string, unknown>;
};

export async function logEvents(itemId: string, actor: string | null, events: EventInput[]) {
  if (!events.length) return;
  try {
    await db.insert(itemEvents).values(
      events.map((e) => ({ itemId, actor, type: e.type, details: e.details ?? null })),
    );
  } catch (err) {
    // История не должна ломать основное действие.
    console.error("logEvents failed", err);
  }
}
