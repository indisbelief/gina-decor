"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, fmtPrice, relDate, type ItemDto, type ShopifySaleDto } from "@/lib/client";
import { matchLine } from "@/lib/shopify";

export default function UnmatchedPage() {
  const [sales, setSales] = useState<ShopifySaleDto[] | null>(null);
  const [items, setItems] = useState<ItemDto[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const [s, i] = await Promise.all([
      api<ShopifySaleDto[]>("/api/shopify-sales"),
      api<ItemDto[]>("/api/items"),
    ]);
    setSales(s);
    setItems(i);
  }

  useEffect(() => {
    load().catch(() => setSales([]));
  }, []);

  const stock = useMemo(() => items.filter((i) => i.status !== "verkocht" && !i.archivedAt), [items]);

  async function resolve(sale: ShopifySaleDto, item: ItemDto) {
    setBusyId(sale.id);
    setError("");
    try {
      await api("/api/shopify-sales", {
        method: "POST",
        body: JSON.stringify({ saleId: sale.id, itemId: item.id }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(sale: ShopifySaleDto) {
    if (!confirm("Скрыть эту продажу? Товар в базе отмечен не будет.")) return;
    setBusyId(sale.id);
    try {
      await api("/api/shopify-sales", {
        method: "POST",
        body: JSON.stringify({ saleId: sale.id, dismiss: true }),
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <header className="app">
        <Link href="/settings" className="back">
          ← Настройки
        </Link>
        <div className="serif" style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>
          Непривязанные продажи
        </div>
        {sales !== null && (
          <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 2 }}>
            {sales.length} из вебхука Shopify без совпадения в базе
          </div>
        )}
      </header>
      <div className="detail" style={{ paddingBottom: 60 }}>
        {error && <div className="rec-error" style={{ marginBottom: 12 }}>⚠ {error}</div>}
        {sales === null && <div className="empty">Загружаю…</div>}
        {sales?.length === 0 && <div className="empty">Всё привязано ✓</div>}
        {(sales ?? []).map((sale) => {
          const candidates = matchLine(
            { order: sale.orderName, name: sale.title, price: sale.price ? parseFloat(sale.price) : null, qty: sale.quantity, date: "" },
            stock,
          );
          return (
            <div className="imp-card" key={sale.id}>
              <div className="imp-order">
                <div className="imp-order-name">{sale.title}</div>
                <div className="imp-order-meta">
                  {sale.orderName} · {sale.orderDate ?? relDate(sale.createdAt)} · {fmtPrice(sale.price)}
                  {sale.quantity > 1 ? ` · ×${sale.quantity}` : ""}
                </div>
              </div>
              {candidates.length > 0 ? (
                <div className="imp-cands">
                  {candidates.map((m) => (
                    <button
                      key={m.item.id}
                      className="imp-cand"
                      disabled={busyId === sale.id}
                      onClick={() => resolve(sale, m.item)}
                    >
                      <div className="imp-item">
                        <span className="ov-thumb">
                          {m.item.hoofdfoto ? <img src={m.item.hoofdfoto} alt="" loading="lazy" /> : "🏺"}
                        </span>
                        <span className="imp-item-info">
                          <span className="gtitle">
                            {m.item.merk}
                            {m.item.model ? ` · ${m.item.model}` : ""}
                          </span>
                          <span className="gsub">
                            {m.item.sku} · {fmtPrice(m.item.vraagprijs ?? m.item.inkoopprijs)}
                          </span>
                        </span>
                        <span className="imp-score">{Math.round(m.score * 100)}%</span>
                      </div>
                      <div className="dup-link-hint">Привязать к этому товару</div>
                    </button>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: "var(--mute)", marginTop: 8 }}>
                  Похожих товаров в наличии не нашлось — отметьте продажу вручную в карточке.
                </p>
              )}
              <div className="imp-actions">
                <button className="btn ghost" disabled={busyId === sale.id} onClick={() => dismiss(sale)}>
                  Скрыть
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
