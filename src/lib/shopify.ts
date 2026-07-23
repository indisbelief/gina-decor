import type { ItemDto } from "./client";

export type OrderLine = {
  order: string;
  name: string;
  price: number | null;
  qty: number;
  date: string; // YYYY-MM-DD
};

export type Match = { item: ItemDto; score: number };

/** Строки-мусор в заказах: доставка, доплаты и т.п. Расширяемый список подстрок. */
export const JUNK_SUBSTRINGS = [
  "shipping",
  "verzend",
  "bezorg",
  "delivery",
  "доплата",
  "surcharge",
  "extra betaling",
  "extra payment",
  "tip",
  "fooi",
  "gift card",
  "cadeaubon",
  "insurance",
  "verzekering",
];

/**
 * Алиасы брендов: как бренд записан в базе → как он может называться в Shopify.
 * Ключи и значения сравниваются в нормализованном виде.
 */
export const BRAND_ALIASES: Record<string, string[]> = {
  cristoffle: ["christofle"],
  "van st lambert": ["val st lambert", "val saint lambert", "vsl"],
  "herend'hvngary": ["herend"],
  "anc.manufacrure royal limoges": ["royal limoges", "limoges"],
  "old paris dimoges": ["old paris", "vieux paris"],
  "pmr bavaria": ["bavaria"],
  "schumann bavaria": ["schumann"],
  "eschenhach": ["eschenbach"],
  lardo: ["lladro"],
  "carl faberge": ["faberge"],
  "fine china": [],
  nobrand: [],
};

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9а-яё ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Простой CSV-парсер (кавычки, запятые и переводы строк внутри полей). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

export function parseShopifyCsv(text: string): { lines: OrderLine[]; skipped: number } {
  const rows = parseCsv(text.replace(/^﻿/, ""));
  if (!rows.length) return { lines: [], skipped: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const cName = col("Name");
  const cLine = col("Lineitem name");
  const cPrice = col("Lineitem price");
  const cQty = col("Lineitem quantity");
  const cDate = col("Created at");
  const cFin = col("Financial Status");
  const cCancel = col("Cancelled at");
  if (cName < 0 || cLine < 0) {
    throw new Error("Не похоже на экспорт заказов Shopify: нет колонок Name / Lineitem name");
  }

  const seen = new Set<string>();
  const lines: OrderLine[] = [];
  let skipped = 0;
  // Created at / Financial Status / Cancelled at заполнены только в первой
  // строке заказа — запоминаем по мере прохода.
  let lastDate = "";
  let lastFin = "";
  let lastCancel = "";
  let lastOrder = "";

  for (const r of rows.slice(1)) {
    const order = (r[cName] ?? "").trim();
    if (order && order !== lastOrder) {
      lastOrder = order;
      lastDate = cDate >= 0 ? (r[cDate] ?? "").trim() : "";
      lastFin = cFin >= 0 ? (r[cFin] ?? "").trim().toLowerCase() : "";
      lastCancel = cCancel >= 0 ? (r[cCancel] ?? "").trim() : "";
    }
    const name = (r[cLine] ?? "").trim();
    if (!name) continue;
    const junk = JUNK_SUBSTRINGS.some((j) => name.toLowerCase().includes(j));
    if (junk || lastCancel || lastFin === "voided") {
      skipped++;
      continue;
    }
    const key = `${lastOrder}||${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const priceRaw = cPrice >= 0 ? parseFloat((r[cPrice] ?? "").replace(",", ".")) : NaN;
    lines.push({
      order: lastOrder,
      name,
      price: Number.isFinite(priceRaw) ? priceRaw : null,
      qty: cQty >= 0 ? parseInt(r[cQty] ?? "1", 10) || 1 : 1,
      date: lastDate.slice(0, 10),
    });
  }
  return { lines, skipped };
}

const TYPE_HINTS: [RegExp, string[]][] = [
  [/\bvase|vaas\b/, ["vase"]],
  [/glass|goblet|roemer|glazen/, ["glass", "goblet", "crystal", "coupe"]],
  [/servies|service|dinner\s?set|tableware/, ["servies"]],
  [/\bplate|bord\b/, ["plate"]],
  [/flatware|cutlery|bestek/, ["flatware"]],
  [/\bbowl|schaal\b/, ["bowl"]],
  [/candle|kandelaar/, ["candle"]],
  [/pitcher|\bkan\b/, ["pitcher"]],
  [/tea\s?set|theeservies/, ["teaset", "tea"]],
  [/coffee|koffie/, ["coffee"]],
  [/figurine|beeldje/, ["figurine"]],
];

const W_BRAND = 0.5;
const W_PRICE = 0.35;
const W_TYPE = 0.15;

function brandScore(lineName: string, merk: string): number {
  const nb = normalize(merk);
  if (!nb || nb === "nobrand") return 0;
  const names = [nb, ...(BRAND_ALIASES[nb] ?? []).map(normalize)];
  for (const n of names) {
    if (n && lineName.includes(n)) return 1;
  }
  for (const word of nb.split(" ")) {
    if (word.length > 3 && lineName.includes(word)) return 0.6;
  }
  return 0;
}

function priceScore(linePrice: number | null, item: ItemDto): number {
  const itemPrice = parseFloat(item.vraagprijs ?? item.inkoopprijs ?? "");
  if (linePrice == null || !Number.isFinite(itemPrice) || itemPrice <= 0) return 0.4;
  const s = 1 - Math.abs(linePrice - itemPrice) / Math.max(linePrice, itemPrice);
  return s >= 0.7 ? s : 0;
}

function typeScore(lineName: string, item: ItemDto): number {
  const soort = normalize(item.soort ?? "");
  const hints = TYPE_HINTS.filter(([re]) => re.test(lineName));
  if (!hints.length) return 0.5; // в названии нет слов типа — нейтрально
  if (!soort) return 0.3;
  return hints.some(([, words]) => words.some((w) => soort.includes(w))) ? 1 : 0;
}

/** Кандидаты для позиции заказа среди товаров в наличии, топ-3 по скору. */
export function matchLine(line: OrderLine, stock: ItemDto[]): Match[] {
  const nameN = normalize(line.name);
  return stock
    .map((item) => ({
      item,
      score:
        W_BRAND * brandScore(nameN, item.merk) +
        W_PRICE * priceScore(line.price, item) +
        W_TYPE * typeScore(nameN, item),
    }))
    .filter((m) => m.score >= 0.45)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export const CONFIDENT_SCORE = 0.78;
export const CONFIDENT_GAP = 0.12;

export function isConfident(matches: Match[]): boolean {
  if (!matches.length || matches[0].score < CONFIDENT_SCORE) return false;
  return matches.length === 1 || matches[0].score - matches[1].score >= CONFIDENT_GAP;
}
