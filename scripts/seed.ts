import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { items } from "../src/db/schema";
import seedData from "./seed-data.json";

type SeedRow = {
  id: number;
  brand: string;
  model: string;
  piece: string;
  setSize: string;
  location: string;
  price: number;
  sold: boolean;
};

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const db = drizzle(sql);

  const existing = await db.select({ sku: items.sku }).from(items);
  if (existing.length > 0) {
    console.log(`Таблица items уже содержит ${existing.length} записей — сид пропущен.`);
    return;
  }

  const rows = (seedData as SeedRow[]).map((r) => ({
    sku: `GD-${String(r.id).padStart(4, "0")}`,
    merk: r.brand.trim(),
    model: r.model.trim() || null,
    soort: r.piece.trim() || null,
    aantalDelen: r.setSize ? parseInt(r.setSize, 10) || null : null,
    locatie: r.location.trim() || null,
    inkoopprijs: r.price != null ? r.price.toFixed(2) : null,
    status: (r.sold ? "verkocht" : "voorraad") as "verkocht" | "voorraad",
  }));

  await db.insert(items).values(rows);
  console.log(`Импортировано ${rows.length} позиций.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
