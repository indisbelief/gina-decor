export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

import { buildBackup } from "@/lib/backup";

// ZIP собираем вручную (метод store, без сжатия — jpeg уже сжат):
// archiver ломается под бандлером, а формат тривиален и стримится напрямую.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d = new Date()): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

type Entry = { name: Uint8Array; crc: number; size: number; offset: number };

function localHeader(name: Uint8Array, crc: number, size: number): Uint8Array {
  const { time, date } = dosDateTime();
  const b = new Uint8Array(30 + name.length);
  const v = new DataView(b.buffer);
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(4, 20, true); // version needed
  v.setUint16(6, 0x0800, true); // utf-8 имена
  v.setUint16(8, 0, true); // store
  v.setUint16(10, time, true);
  v.setUint16(12, date, true);
  v.setUint32(14, crc, true);
  v.setUint32(18, size, true);
  v.setUint32(22, size, true);
  v.setUint16(26, name.length, true);
  v.setUint16(28, 0, true);
  b.set(name, 30);
  return b;
}

function centralDirectory(entries: Entry[], cdOffset: number): Uint8Array {
  const { time, date } = dosDateTime();
  const parts: Uint8Array[] = [];
  let cdSize = 0;
  for (const e of entries) {
    const b = new Uint8Array(46 + e.name.length);
    const v = new DataView(b.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 20, true);
    v.setUint16(8, 0x0800, true);
    v.setUint16(10, 0, true);
    v.setUint16(12, time, true);
    v.setUint16(14, date, true);
    v.setUint32(16, e.crc, true);
    v.setUint32(20, e.size, true);
    v.setUint32(24, e.size, true);
    v.setUint16(28, e.name.length, true);
    v.setUint32(42, e.offset, true);
    b.set(e.name, 46);
    parts.push(b);
    cdSize += b.length;
  }
  const eocd = new Uint8Array(22);
  const v = new DataView(eocd.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, entries.length, true);
  v.setUint16(10, entries.length, true);
  v.setUint32(12, cdSize, true);
  v.setUint32(16, cdOffset, true);
  parts.push(eocd);
  const out = new Uint8Array(cdSize + 22);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

export async function GET() {
  const dump = await buildBackup();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const entries: Entry[] = [];
      let offset = 0;
      const push = async (chunk: Uint8Array) => {
        controller.enqueue(chunk);
        offset += chunk.length;
        // backpressure: не набиваем очередь, если клиент качает медленно
        while (controller.desiredSize !== null && controller.desiredSize <= 0) {
          await new Promise((r) => setTimeout(r, 25));
        }
      };
      const addFile = async (path: string, data: Uint8Array) => {
        const name = encoder.encode(path);
        const crc = crc32(data);
        entries.push({ name, crc, size: data.length, offset });
        // имя файла уже входит в буфер localHeader
        await push(localHeader(name, crc, data.length));
        await push(data);
      };

      try {
        await addFile("backup.json", encoder.encode(JSON.stringify(dump, null, 1)));
        // фото по одному: в памяти в каждый момент — один файл
        for (const p of dump.photos) {
          const targets: [string, string][] = [[p.url, `photos/${p.id}.jpg`]];
          if (p.thumbUrl) targets.push([p.thumbUrl, `photos/${p.id}-thumb.jpg`]);
          for (const [url, path] of targets) {
            try {
              const res = await fetch(url);
              if (!res.ok) continue;
              await addFile(path, new Uint8Array(await res.arrayBuffer()));
            } catch {
              // недоступное фото не должно ронять весь архив
            }
          }
        }
        controller.enqueue(centralDirectory(entries, offset));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  const date = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="gina-decor-full-backup-${date}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
