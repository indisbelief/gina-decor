"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type ItemDto } from "@/lib/client";
import { BottomNav } from "@/components/BottomNav";

function readUserCookie(): string {
  const m = document.cookie.match(/(?:^|;\s*)gd_user=([^;]*)/);
  try {
    return m ? decodeURIComponent(m[1]) : "";
  } catch {
    return "";
  }
}

type BackupStatus = {
  count: number;
  latest: { pathname: string; uploadedAt: string; size: number } | null;
};

export default function SettingsPage() {
  const [items, setItems] = useState<ItemDto[]>([]);
  const [name, setName] = useState("");
  const [nameSaved, setNameSaved] = useState(false);
  const [backup, setBackup] = useState<BackupStatus | null>(null);

  useEffect(() => {
    api<ItemDto[]>("/api/items").then(setItems).catch(() => {});
    api<BackupStatus>("/api/backup/status").then(setBackup).catch(() => {});
    setName(readUserCookie());
  }, []);

  function saveName() {
    document.cookie = `gd_user=${encodeURIComponent(name.trim().slice(0, 60))}; path=/; max-age=31536000; secure; samesite=lax`;
    setNameSaved(true);
    setTimeout(() => setNameSaved(false), 1500);
  }

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
        <div className="eyebrow">Gina Decor</div>
        <div className="serif" style={{ fontSize: 20, fontWeight: 700 }}>
          Настройки
        </div>
      </header>
      <div className="detail" style={{ paddingBottom: 110 }}>
        <div className="settings-item">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Ваше имя</div>
          <p style={{ fontSize: 13, color: "var(--mute)", marginBottom: 10 }}>
            Подписывает ваши действия в истории изменений — видно, кто отметил продажу.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя" />
            <button className="btn primary" style={{ width: "auto", padding: "10px 16px" }} onClick={saveName}>
              {nameSaved ? "✓" : "Сохранить"}
            </button>
          </div>
        </div>

        <div className="settings-item">
          <div style={{ fontWeight: 600, marginBottom: 6 }}>QR-этикетки</div>
          <p style={{ fontSize: 13, color: "var(--mute)", marginBottom: 12 }}>
            Лист с QR-кодами для коробок и полок: навёл камеру — открылась карточка.
          </p>
          <Link href="/labels" className="btn primary">
            Печать QR
          </Link>
        </div>

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
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Бэкап базы</div>
          <p style={{ fontSize: 13, color: "var(--mute)", marginBottom: 12 }}>
            Один JSON со всеми таблицами: товары, фото (ссылки), история.
            Автобэкап — раз в неделю, храним последние 8.
            {backup?.latest ? (
              <>
                <br />
                Последний автобэкап:{" "}
                {new Date(backup.latest.uploadedAt).toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "long",
                })}{" "}
                ({Math.round(backup.latest.size / 1024)} КБ, всего {backup.count})
              </>
            ) : backup ? (
              <>
                <br />
                Автобэкапов пока нет — первый будет в понедельник.
              </>
            ) : null}
          </p>
          <a href="/api/backup" className="btn primary">
            Скачать бэкап
          </a>
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
      <BottomNav />
    </>
  );
}
