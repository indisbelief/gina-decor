"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, humanizeEvent, relDate, type EventDto } from "@/lib/client";
import { BottomNav } from "@/components/BottomNav";

type Overview = {
  stock: { count: number; som: number };
  soldMonth: { count: number; som: number };
  soldQuarter: { count: number; som: number };
  top5: {
    id: string;
    sku: string;
    merk: string;
    model: string | null;
    locatie: string | null;
    prijs: number | null;
    hoofdfoto: string | null;
  }[];
  noPhoto: number;
  byLocation: { locatie: string; count: number; som: number }[];
  activity: EventDto[];
};

const eur = (n: number) => "€" + Math.round(n).toLocaleString("ru-RU");

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<Overview>("/api/overview").then(setData).catch(() => setError(true));
  }, []);

  return (
    <>
      <header className="app">
        <div className="eyebrow">Gina Decor</div>
        <div className="serif" style={{ fontSize: 20, fontWeight: 700 }}>
          Обзор
        </div>
      </header>

      <main className="ov">
        {!data && !error && <div className="empty">Загружаю…</div>}
        {error && <div className="empty">Не удалось загрузить</div>}
        {data && (
          <>
            <div className="ov-cards">
              <div className="ov-card big">
                <div className="ov-n serif">{eur(data.stock.som)}</div>
                <div className="ov-l">склад сейчас · {data.stock.count} шт.</div>
              </div>
              <div className="ov-card">
                <div className="ov-n serif">{eur(data.soldMonth.som)}</div>
                <div className="ov-l">продано за месяц · {data.soldMonth.count} шт.</div>
              </div>
              <div className="ov-card">
                <div className="ov-n serif">{eur(data.soldQuarter.som)}</div>
                <div className="ov-l">за квартал · {data.soldQuarter.count} шт.</div>
              </div>
              {data.noPhoto > 0 && (
                <div className="ov-card warn">
                  <div className="ov-n serif">{data.noPhoto}</div>
                  <div className="ov-l">товаров без фото</div>
                </div>
              )}
            </div>

            <h2 className="ov-h serif">Топ-5 в наличии</h2>
            <div className="ov-top">
              {data.top5.map((t, i) => (
                <Link key={t.id} href={`/item/${t.id}`} className="ov-top-row">
                  <span className="ov-rank serif">{i + 1}</span>
                  <span className="ov-thumb">
                    {t.hoofdfoto ? <img src={t.hoofdfoto} alt="" loading="lazy" /> : "🏺"}
                  </span>
                  <span className="ov-top-info">
                    <span className="gtitle">
                      {t.merk}
                      {t.model ? ` · ${t.model}` : ""}
                    </span>
                    <span className="gsub">
                      {t.sku}
                      {t.locatie ? ` · ${t.locatie}` : ""}
                    </span>
                  </span>
                  <span className="gprice serif">{t.prijs != null ? eur(t.prijs) : "—"}</span>
                </Link>
              ))}
            </div>

            <h2 className="ov-h serif">Стоимость по локациям</h2>
            <div className="ov-locs">
              {data.byLocation.map((l) => {
                const max = data.byLocation[0]?.som || 1;
                return (
                  <Link
                    key={l.locatie}
                    href={`/?loc=${encodeURIComponent(l.locatie === "Без места" ? "__none" : l.locatie)}`}
                    className="ov-loc-row"
                  >
                    <span className="ov-loc-name">{l.locatie}</span>
                    <span className="ov-loc-bar">
                      <span style={{ width: `${Math.max(3, (l.som / max) * 100)}%` }} />
                    </span>
                    <span className="ov-loc-som">
                      {eur(l.som)} <em>· {l.count}</em>
                    </span>
                  </Link>
                );
              })}
            </div>

            <h2 className="ov-h serif">Активность</h2>
            <div className="ov-feed">
              {data.activity.length === 0 && (
                <div className="empty">Событий пока нет — они появятся при изменениях</div>
              )}
              {data.activity.map((e) => (
                <Link key={e.id} href={`/item/${e.itemId}`} className="ov-ev">
                  <span className="ov-ev-text">
                    <b>
                      {e.merk}
                      {e.model ? ` ${e.model}` : ""}
                    </b>{" "}
                    — {humanizeEvent(e)}
                  </span>
                  <span className="ov-ev-meta">
                    {relDate(e.createdAt)}
                    {e.actor ? ` · ${e.actor}` : ""}
                  </span>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>
      <BottomNav />
    </>
  );
}
