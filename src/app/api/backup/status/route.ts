export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { list } from "@vercel/blob";

async function totalSize(prefix: string): Promise<number> {
  let sum = 0;
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, limit: 1000, cursor });
    sum += page.blobs.reduce((acc, b) => acc + b.size, 0);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return sum;
}

export async function GET() {
  const [{ blobs }, photosSize] = await Promise.all([
    list({ prefix: "backups/", limit: 100 }),
    totalSize("items/"),
  ]);
  const sorted = blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  return NextResponse.json({
    count: sorted.length,
    latest: sorted[0]
      ? { pathname: sorted[0].pathname, uploadedAt: sorted[0].uploadedAt, size: sorted[0].size }
      : null,
    // примерный размер полного бэкапа: все фото + свежий дамп
    fullSize: photosSize + (sorted[0]?.size ?? 50_000),
  });
}
