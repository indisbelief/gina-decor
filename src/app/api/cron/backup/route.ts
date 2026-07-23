export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { del, list, put } from "@vercel/blob";
import { buildBackup, backupFilename } from "@/lib/backup";

const KEEP = 8;

export async function GET(req: NextRequest) {
  // Vercel Cron подписывает вызов заголовком Authorization: Bearer CRON_SECRET.
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dump = await buildBackup();
  // addRandomSuffix: стор публичный, суффикс делает URL неугадываемым.
  const blob = await put(`backups/${backupFilename()}`, JSON.stringify(dump), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: true,
  });

  const { blobs } = await list({ prefix: "backups/", limit: 100 });
  const sorted = blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  const stale = sorted.slice(KEEP);
  if (stale.length) await del(stale.map((b) => b.url));

  return NextResponse.json({
    ok: true,
    saved: blob.pathname,
    counts: dump.counts,
    kept: Math.min(sorted.length, KEEP),
    deleted: stale.length,
  });
}
