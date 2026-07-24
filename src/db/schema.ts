import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  numeric,
  date,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const staatEnum = pgEnum("staat", ["nieuw", "als_nieuw", "gebruikt"]);
export const statusEnum = pgEnum("status", ["voorraad", "verkocht", "gereserveerd"]);

export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  sku: text("sku").unique().notNull(),
  merk: text("merk").notNull(),
  model: text("model"),
  soort: text("soort"),
  aantalDelen: integer("aantal_delen"),
  staat: staatEnum("staat"),
  locatie: text("locatie"),
  inkoopprijs: numeric("inkoopprijs", { precision: 10, scale: 2 }),
  vraagprijs: numeric("vraagprijs", { precision: 10, scale: 2 }),
  verkoopprijs: numeric("verkoopprijs", { precision: 10, scale: 2 }),
  inkoopdatum: date("inkoopdatum"),
  verkoopdatum: date("verkoopdatum"),
  leverancier: text("leverancier"),
  status: statusEnum("status").notNull().default("voorraad"),
  notities: text("notities"),
  shopifyHandle: text("shopify_handle"),
  // снапшот каталога магазина: {title, price, status, images, syncedAt}
  shopifySync: jsonb("shopify_sync"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export const photos = pgTable("photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  itemId: uuid("item_id")
    .notNull()
    .references(() => items.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  thumbUrl: text("thumb_url"),
  // откуда фото пришло при импорте (Shopify Image Src) — защита от дублей
  sourceUrl: text("source_url"),
  volgorde: integer("volgorde").notNull().default(0),
  isHoofdfoto: boolean("is_hoofdfoto").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const itemEvents = pgTable(
  "item_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    actor: text("actor"),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("item_events_item_idx").on(t.itemId), index("item_events_created_idx").on(t.createdAt)],
);

export const shopifyImports = pgTable(
  "shopify_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderName: text("order_name").notNull(),
    lineitemName: text("lineitem_name").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("shopify_imports_order_line_idx").on(t.orderName, t.lineitemName)],
);

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Photo = typeof photos.$inferSelect;
export type ItemEvent = typeof itemEvents.$inferSelect;
