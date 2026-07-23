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
  volgorde: integer("volgorde").notNull().default(0),
  isHoofdfoto: boolean("is_hoofdfoto").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Photo = typeof photos.$inferSelect;
