"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type ItemDto } from "@/lib/client";
import { BottomNav } from "@/components/BottomNav";

type ExportMode = "verkocht" | "ingekocht" | "voorraad";
type Period = { from: string; to: string; label: string };

function quarter(y: number, q: number): Period {
  const from = `${y}-${String(q * 3 - 2).padStart(2, "0")}-01`;
  const lastDay = new Date(y, q * 3, 0).getDate();
  const to = `${y}-${String(q * 3).padStart(2, "0")}-${lastDay}`;
  return { from, to, label: `${y}-Q${q}` };
}

function buildPresets(): { key: string; name: string; period: Period }[] {
  const now = new Date();
  const y = now.getFullYear();
  const curQ = Math.floor(now.getMonth() / 3) + 1;
  const prevQ = curQ === 1 ? { y: y - 1, q: 4 } : { y, q: curQ - 1 };
  const presets = [
    { key: "cur", name: "Текущий квартал", period: quarter(y, curQ) },
    { key: "prev", name: "Прошлый квартал", period: quarter(prevQ.y, prevQ.q) },
  ];
  for (let q = 1; q <= 4; q++) presets.push({ key: `q${q}`, name: `Q${q} ${y}`, period: quarter(y, q) });
  presets.push({
    key: "year",
    name: `Весь ${y}`,
    period: { from: `${y}-01-01`, to: `${y}-12-31`, label: `${y}` },
  });
  return presets;
}

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
  fullSize: number;
};

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(1) + " ГБ";
  if (bytes >= 1024 * 1024) return Math.round(bytes / 1024 / 1024) + " МБ";
  return Math.max(1, Math.round(bytes / 1024)) + " КБ";
}

const BIG_BACKUP = 200 * 1024 * 1024;

export default function SettingsPage() {
  const [items, setItems] = useState<ItemDto[]>([]);
  const [name, setName] = useState("");
  const [nameSaved, setNameSaved] = useState(false);
  const [backup, setBackup] = useState<BackupStatus | null>(null);
  const [expMode, setExpMode] = useState<ExportMode>("verkocht");
  const [presetKey, setPresetKey] = useState("cur");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

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

  const presets = useMemo(buildPresets, []);

  const period: Period | null = useMemo(() => {
    if (expMode === "voorraad") return null;
    if (presetKey === "custom") {
      if (!customFrom || !customTo) return null;
      return { from: customFrom, to: customTo, label: `${customFrom}_${customTo}` };
    }
    return presets.find((pr) => pr.key === presetKey)?.period ?? null;
  }, [expMode, presetKey, customFrom, customTo, presets]);

  // Превью — то же условие, что применит сервер.
  const preview = useMemo(() => {
    const active = items.filter((i) => !i.archivedAt);
    let rows: ItemDto[] = [];
    if (expMode === "voorraad") {
      rows = active.filter((i) => i.status !== "verkocht");
    } else if (period) {
      if (expMode === "verkocht") {
        rows = active.filter(
          (i) => i.status === "verkocht" && i.verkoopdatum && i.verkoopdatum >= period.from && i.verkoopdatum <= period.to,
        );
      } else {
        rows = active.filter(
          (i) => i.inkoopdatum && i.inkoopdatum >= period.from && i.inkoopdatum <= period.to,
        );
      }
    }
    const priceOf = (i: ItemDto) =>
      parseFloat(
        (expMode === "verkocht" ? i.verkoopprijs : expMode === "ingekocht" ? i.inkoopprijs : (i.vraagprijs ?? i.inkoopprijs)) ?? "",
      ) || 0;
    return { count: rows.length, som: rows.reduce((a, i) => a + priceOf(i), 0) };
  }, [items, expMode, period]);

  const exportUrl = useMemo(() => {
    const q = new URLSearchParams({ mode: expMode });
    if (period) {
      q.set("from", period.from);
      q.set("to", period.to);
      q.set("label", period.label);
    } else if (expMode === "voorraad") {
      q.set("label", `voorraad_${new Date().toISOString().slice(0, 10)}`);
    }
    return `/api/export?${q}`;
  }, [expMode, period]);

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
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Экспорт для бухгалтера</div>
          <p style={{ fontSize: 13, color: "var(--mute)", marginBottom: 10 }}>
            CSV под голландский Excel: разделитель «;», суммы с запятой, даты DD-MM-YYYY,
            заголовки на нидерландском, строка Totaal с итогами.
          </p>
          <div className="chips" style={{ padding: "2px 0 8px" }}>
            {(
              [
                ["verkocht", "Продано за период"],
                ["ingekocht", "Куплено за период"],
                ["voorraad", "Весь склад на сегодня"],
              ] as [ExportMode, string][]
            ).map(([v, name]) => (
              <button key={v} className={`chip ${expMode === v ? "on" : ""}`} onClick={() => setExpMode(v)}>
                {name}
              </button>
            ))}
          </div>
          {expMode !== "voorraad" && (
            <>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>Период (кварталы — календарные, для BTW-aangifte)</label>
                <select value={presetKey} onChange={(e) => setPresetKey(e.target.value)}>
                  {presets.map((pr) => (
                    <option key={pr.key} value={pr.key}>
                      {pr.name}
                    </option>
                  ))}
                  <option value="custom">Свой диапазон…</option>
                </select>
              </div>
              {presetKey === "custom" && (
                <div className="row2" style={{ marginBottom: 4 }}>
                  <div className="field">
                    <label>С</label>
                    <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>По</label>
                    <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                  </div>
                </div>
              )}
            </>
          )}
          <p style={{ fontSize: 13, marginBottom: 10 }}>
            {preview.count > 0 ? (
              <>
                Будет выгружено: <b>{preview.count}</b>{" "}
                {preview.count === 1 ? "позиция" : preview.count < 5 ? "позиции" : "позиций"} на{" "}
                <b>€{Math.round(preview.som).toLocaleString("ru-RU")}</b>
              </>
            ) : (
              <span style={{ color: "var(--gold)" }}>
                Ничего не найдено — файл будет пустым{expMode !== "voorraad" ? ". Проверьте период" : ""}.
              </span>
            )}
          </p>
          <a
            href={exportUrl}
            className="btn primary"
            style={preview.count === 0 || (expMode !== "voorraad" && !period) ? { opacity: 0.5, pointerEvents: "none" } : undefined}
          >
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
          <div className="stack" style={{ marginTop: 0 }}>
            <a href="/api/backup" className="btn primary">
              Скачать бэкап
            </a>
            <a href="/api/backup/full" className="btn ghost">
              Скачать полный бэкап (с фото)
              {backup ? ` · ≈${fmtSize(backup.fullSize)}` : ""}
            </a>
          </div>
          {backup && backup.fullSize > BIG_BACKUP && (
            <p style={{ fontSize: 12.5, color: "var(--gold)", marginTop: 10 }}>
              ⚠ Полный бэкап больше 200 МБ — скачивание займёт время, не закрывайте вкладку.
            </p>
          )}
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
