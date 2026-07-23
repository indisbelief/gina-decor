import { config } from "dotenv";
config({ path: [".env.local", ".env"] });
const { neon } = await import("@neondatabase/serverless");
const { put } = await import("@vercel/blob");
const sharp = (await import("sharp")).default;

const sql = neon(process.env.DATABASE_URL!);
const rows = await sql`select id, url from photos where thumb_url is null`;
console.log("photos without thumb:", rows.length);
for (const r of rows) {
  const res = await fetch(r.url as string);
  const buf = Buffer.from(await res.arrayBuffer());
  const thumb = await sharp(buf).resize(400, 400, { fit: "cover" }).jpeg({ quality: 70 }).toBuffer();
  const thumbPath = (r.url as string).replace(/^https:\/\/[^/]+\//, "").replace(/\.jpg$/, "-thumb.jpg");
  const blob = await put(thumbPath, thumb, { access: "public", contentType: "image/jpeg" });
  await sql`update photos set thumb_url = ${blob.url} where id = ${r.id}`;
  console.log("thumb created:", blob.url);
}
