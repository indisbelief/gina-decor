"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, listPrice, type ItemDto } from "@/lib/client";
import { BottomNav } from "@/components/BottomNav";

export default function LocationsPage() {
  const [items, setItems] = useState<ItemDto[] | null>(null);

  useEffect(() => {
    api<ItemDto[]>("/api/items").then(setItems).catch(() => setItems([]));
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, { cover: string | null; count: number; som: number }>();
    for (const it of items ?? []) {
      const key = it.locatie ?? "Без места";
      if (!map.has(key)) map.set(key, { cover: null, count: 0, som: 0 });
      const g = map.get(key)!;
      if (!g.cover && it.hoofdfoto) g.cover = it.hoofdfoto;
      if (it.status !== "verkocht") {
        g.count += 1;
        g.som += parseFloat(listPrice(it) ?? "0");
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1].som - a[1].som);
  }, [items]);

  return (
    <>
      <header className="app">
        <div className="eyebrow">Gina Decor</div>
        <div className="serif" style={{ fontSize: 20, fontWeight: 700 }}>
          Локации
        </div>
      </header>
      <main className="grid" style={{ paddingTop: 14 }}>
        {items === null && <div className="empty gspan">Загружаю…</div>}
        {items !== null && groups.length === 0 && <div className="empty gspan">Пока пусто</div>}
        {groups.map(([name, g]) => (
          <Link
            key={name}
            href={`/?loc=${encodeURIComponent(name === "Без места" ? "__none" : name)}`}
            className="gcard loc-card"
          >
            <div className="gphoto">
              {g.cover ? (
                <img src={g.cover} alt={name} loading="lazy" />
              ) : (
                <div className="loc-empty">🗂</div>
              )}
            </div>
            <div className="gbody" style={{ paddingBottom: 12 }}>
              <div className="gtitle">{name}</div>
              <div className="gsub">
                {g.count} шт. · €{Math.round(g.som).toLocaleString("ru-RU")}
              </div>
            </div>
          </Link>
        ))}
      </main>
      <BottomNav />
    </>
  );
}
