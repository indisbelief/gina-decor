export const dynamic = "force-dynamic";

import { buildBackup, backupFilename } from "@/lib/backup";

export async function GET() {
  const dump = await buildBackup();
  return new Response(JSON.stringify(dump, null, 1), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${backupFilename()}"`,
    },
  });
}
