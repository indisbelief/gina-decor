export const dynamic = "force-dynamic";

import { db } from "@/db";
import { items } from "@/db/schema";
import { asc, isNull } from "drizzle-orm";

const COLS = [
  "sku",
  "merk",
  "model",
  "soort",
  "aantalDelen",
  "staat",
  "locatie",
  "inkoopprijs",
  "vraagprijs",
  "verkoopprijs",
  "inkoopdatum",
  "verkoopdatum",
  "leverancier",
  "status",
  "notities",
  "createdAt",
] as const;

const HEADER = [
  "SKU",
  "Бренд",
  "Модель",
  "Тип",
  "Частей",
  "Состояние",
  "Место",
  "Цена закупки",
  "Цена продажи (запрос)",
  "Цена продажи (факт)",
  "Дата закупки",
  "Дата продажи",
  "Поставщик",
  "Статус",
  "Заметки",
  "Добавлено",
];

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const rows = await db.select().from(items).where(isNull(items.archivedAt)).orderBy(asc(items.sku));
  const lines = [
    HEADER.join(";"),
    ...rows.map((r) => COLS.map((c) => csvCell(r[c])).join(";")),
  ];
  // BOM — чтобы Excel корректно открыл UTF-8.
  const csv = "﻿" + lines.join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gina-decor-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
