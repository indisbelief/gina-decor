import { db } from "@/db";
import { items, photos, itemEvents } from "@/db/schema";

export async function buildBackup() {
  const [allItems, allPhotos, allEvents] = await Promise.all([
    db.select().from(items),
    db.select().from(photos),
    db.select().from(itemEvents),
  ]);
  return {
    version: 1,
    app: "gina-decor",
    createdAt: new Date().toISOString(),
    counts: { items: allItems.length, photos: allPhotos.length, itemEvents: allEvents.length },
    items: allItems,
    photos: allPhotos,
    itemEvents: allEvents,
  };
}

export function backupFilename(date = new Date()) {
  return `gina-decor-backup-${date.toISOString().slice(0, 10)}.json`;
}
