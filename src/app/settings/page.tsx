"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type ItemDto } from "@/lib/client";

export default function SettingsPage() {
  const [items, setItems] = useState<ItemDto[]>([]);

  useEffect(() => {
    api<ItemDto[]>("/api/items").then(setItems).catch(() => {});
  }, []);

  const locaties = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) {
      if (i.locatie) counts.set(i.locatie, (counts.get(i.locatie) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  return (
    <>
      <header className="app">
        <Link href="/" className="back">
          ← Склад
        </Link>
        <div className="serif" style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>
          Настройки
        </div>
      </header>
      <div className="detail">
        <div className="settings-item">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Выгрузка</div>
          <p style={{ fontSize: 13, color: "var(--mute)", marginBottom: 12 }}>
            CSV со всеми товарами (кроме архива) — открывается в Excel и Numbers.
          </p>
          <a href="/api/export" className="btn primary">
            Скачать CSV
          </a>
        </div>

        <div className="settings-item">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Места хранения</div>
          <p style={{ fontSize: 13, color: "var(--mute)", marginBottom: 10 }}>
            Собираются автоматически из карточек товаров.
          </p>
          {locaties.length === 0 && <div style={{ color: "var(--mute)", fontSize: 13 }}>Пока пусто</div>}
          {locaties.map(([l, n]) => (
            <div
              key={l}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "8px 0",
                borderBottom: "1px solid var(--line)",
                fontSize: 14,
              }}
            >
              <span>{l}</span>
              <span style={{ color: "var(--mute)" }}>{n}</span>
            </div>
          ))}
        </div>

        <div className="settings-item">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Как установить на телефон</div>
          <p style={{ fontSize: 13, color: "var(--mute)" }}>
            iPhone: Safari → «Поделиться» → «На экран “Домой”».
            <br />
            Android: Chrome → меню ⋮ → «Добавить на гл. экран».
          </p>
        </div>
      </div>
    </>
  );
}
