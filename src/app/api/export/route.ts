export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { db } from "@/db";
import { items, type Item } from "@/db/schema";
import { and, asc, gte, inArray, isNull, lte, ne, eq, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

const HEADER = [
  "Artikelnr",
  "Merk",
  "Model",
  "Soort",
  "Aantal delen",
  "Locatie",
  "Leverancier",
  "Inkoopdatum",
  "Inkoopprijs",
  "Verkoopdatum",
  "Verkoopprijs",
  "Status",
  "Notities",
];

// NL-Excel: точка с запятой как разделитель, десятичная запятая,
// даты DD-MM-YYYY, UTF-8 с BOM.
function cell(v: string): string {
  return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function nlNumber(v: string | null): string {
  if (v == null || v === "") return "";
  const n = parseFloat(v);
  return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "";
}

function nlDate(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

function row(it: Item): string {
  return [
    it.sku,
    it.merk,
    it.model ?? "",
    it.soort ?? "",
    it.aantalDelen != null ? String(it.aantalDelen) : "",
    it.locatie ?? "",
    it.leverancier ?? "",
    nlDate(it.inkoopdatum),
    nlNumber(it.inkoopprijs),
    nlDate(it.verkoopdatum),
    nlNumber(it.verkoopprijs),
    it.status,
    it.notities ?? "",
  ]
    .map(cell)
    .join(";");
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const mode = p.get("mode") ?? "voorraad";
  const from = p.get("from");
  const to = p.get("to");
  const ids = p.get("ids")?.split(",").filter(Boolean);
  const label = (p.get("label") ?? new Date().toISOString().slice(0, 10)).replace(/[^\w.-]/g, "_");

  const conds: SQL[] = [isNull(items.archivedAt)];
  let orderCol: AnyPgColumn = items.sku;

  if (ids?.length) {
    conds.push(inArray(items.id, ids));
  } else if (mode === "verkocht") {
    conds.push(eq(items.status, "verkocht"));
    if (from) conds.push(gte(items.verkoopdatum, from));
    if (to) conds.push(lte(items.verkoopdatum, to));
    orderCol = items.verkoopdatum;
  } else if (mode === "ingekocht") {
    if (from) conds.push(gte(items.inkoopdatum, from));
    if (to) conds.push(lte(items.inkoopdatum, to));
    orderCol = items.inkoopdatum;
  } else {
    conds.push(ne(items.status, "verkocht"));
  }

  const rows = await db
    .select()
    .from(items)
    .where(and(...conds))
    .orderBy(asc(orderCol), asc(items.sku));

  const sumIn = rows.reduce((a, r) => a + (parseFloat(r.inkoopprijs ?? "") || 0), 0);
  const sumOut = rows.reduce((a, r) => a + (parseFloat(r.verkoopprijs ?? "") || 0), 0);
  const totaal = [
    "Totaal",
    ...Array(7).fill(""),
    sumIn.toFixed(2).replace(".", ","),
    "",
    sumOut.toFixed(2).replace(".", ","),
    "",
    "",
  ].join(";");

  const csv = "﻿" + [HEADER.join(";"), ...rows.map(row), totaal].join("\r\n");
  const modeName = ids?.length ? "selectie" : mode;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="gina-decor_${modeName}_${label}.csv"`,
    },
  });
}
