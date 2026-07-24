"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, fmtPrice, listPrice, type ItemDto } from "@/lib/client";

export default function ArchivePage() {
  const [items, setItems] = useState<ItemDto[] | null>(null);

  useEffect(() => {
    api<ItemDto[]>("/api/items?archived=1").then(setItems).catch(() => setItems([]));
  }, []);

  return (
    <>
      <header className="app">
        <Link href="/settings" className="back">
          ← Настройки
        </Link>
        <div className="serif" style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>
          Архив
        </div>
        {items !== null && (
          <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 2 }}>
            {items.length} {items.length === 1 ? "товар" : items.length < 5 ? "товара" : "товаров"} ·
            в счётах склада не участвуют
          </div>
        )}
      </header>
      <main className="grid" style={{ paddingTop: 14, paddingBottom: 40 }}>
        {items === null && <div className="empty gspan">Загружаю…</div>}
        {items !== null && items.length === 0 && (
          <div className="empty gspan">Архив пуст</div>
        )}
        {(items ?? []).map((it) => {
          const sub = [it.soort, it.locatie].filter(Boolean).join(" · ");
          return (
            <Link href={`/item/${it.id}`} className="gcard arch" key={it.id}>
              <div className="gphoto">
                {it.hoofdfoto ? (
                  <img src={it.hoofdfoto} alt={it.merk} loading="lazy" />
                ) : (
                  <div className="gcamwrap" style={{ pointerEvents: "none" }}>
                    <span style={{ fontSize: 30, opacity: 0.4 }}>🏺</span>
                  </div>
                )}
              </div>
              <div className="gbody">
                <div className="gtitle">
                  {it.merk}
                  {it.model ? ` · ${it.model}` : ""}
                </div>
                <div className="gsub">{sub || " "}</div>
              </div>
              <div className="gfoot">
                <span className="gprice serif">{fmtPrice(listPrice(it))}</span>
                <span className="arch-date">
                  {it.archivedAt
                    ? new Date(it.archivedAt).toLocaleDateString("ru-RU", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "2-digit",
                      })
                    : ""}
                </span>
              </div>
            </Link>
          );
        })}
      </main>
    </>
  );
}
