export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { createRequire } from "module";
import { PassThrough, Readable } from "stream";
import { buildBackup } from "@/lib/backup";
import type { Archiver, ArchiverOptions } from "archiver";

// CJS-модуль без default-экспорта — Turbopack не пропускает обычный import.
const archiver = createRequire(import.meta.url)("archiver") as (
  format: "zip",
  options?: ArchiverOptions,
) => Archiver;

export async function GET() {
  const dump = await buildBackup();

  // level 0: jpeg уже сжат, deflate только тратит CPU и время.
  const archive = archiver("zip", { zlib: { level: 0 } });
  const pass = new PassThrough();
  archive.pipe(pass);

  archive.append(JSON.stringify(dump, null, 1), { name: "backup.json" });

  // Файлы качаем по одному: в памяти в каждый момент — один файл,
  // сам архив стримится клиенту через PassThrough.
  (async () => {
    for (const p of dump.photos) {
      const targets: [string, string][] = [[p.url, `photos/${p.id}.jpg`]];
      if (p.thumbUrl) targets.push([p.thumbUrl, `photos/${p.id}-thumb.jpg`]);
      for (const [url, name] of targets) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          archive.append(Buffer.from(await res.arrayBuffer()), { name });
        } catch {
          // недоступное фото не должно ронять весь архив
        }
      }
    }
    await archive.finalize();
  })().catch((err) => archive.destroy(err));

  const date = new Date().toISOString().slice(0, 10);
  return new Response(Readable.toWeb(pass) as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="gina-decor-full-backup-${date}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
