import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { itemEvents } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const rows = await db
    .select()
    .from(itemEvents)
    .where(eq(itemEvents.itemId, id))
    .orderBy(desc(itemEvents.createdAt))
    .limit(100);
  return NextResponse.json(rows);
}
