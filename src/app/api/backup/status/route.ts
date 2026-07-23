export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { list } from "@vercel/blob";

export async function GET() {
  const { blobs } = await list({ prefix: "backups/", limit: 100 });
  const sorted = blobs.sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime());
  return NextResponse.json({
    count: sorted.length,
    latest: sorted[0]
      ? { pathname: sorted[0].pathname, uploadedAt: sorted[0].uploadedAt, size: sorted[0].size }
      : null,
  });
}
