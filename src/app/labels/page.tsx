"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { api, type ItemDto } from "@/lib/client";

type Label = { item: ItemDto; svg: string };

export default function LabelsPage() {
  const [items, setItems] = useState<ItemDto[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [labels, setLabels] = useState<Label[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<ItemDto[]>("/api/items").then((data) => {
      setItems(data);
      // по умолчанию — всё, что в наличии
      setSel(new Set(data.filter((i) => i.status !== "verkocht").map((i) => i.id)));
    });
  }, []);

  const shown = useMemo(() => {
    if (!q.trim()) return items;
    const s = q.trim().toLowerCase();
    return items.filter((i) =>
      [i.merk, i.model, i.sku, i.locatie].some((f) => f?.toLowerCase().includes(s)),
    );
  }, [items, q]);

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function print() {
    setBusy(true);
    const chosen = items.filter((i) => sel.has(i.id));
    const out: Label[] = [];
    for (const item of chosen) {
      const svg = await QRCode.toString(`${window.location.origin}/item/${item.id}`, {
        type: "svg",
        margin: 0,
        errorCorrectionLevel: "M",
      });
      out.push({ item, svg });
    }
    setLabels(out);
    setBusy(false);
    setTimeout(() => window.print(), 350);
  }

  if (labels) {
    return (
      <div className="labels-print">
        <div className="labels-toolbar noprint">
          <button className="btn ghost" onClick={() => setLabels(null)}>
            ← Назад к выбору
          </button>
          <button className="btn primary" onClick={() => window.print()}>
            Печать
          </button>
        </div>
        <div className="labels-sheet">
          {labels.map(({ item, svg }) => (
            <div key={item.id} className="label">
              <div className="label-qr" dangerouslySetInnerHTML={{ __html: svg }} />
              <div className="label-sku">{item.sku}</div>
              <div className="label-brand">
                {item.merk}
                {item.model ? ` · ${item.model}` : ""}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <header className="app">
        <Link href="/settings" className="back">
          ← Настройки
        </Link>
        <div className="serif" style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>
          QR-этикетки
        </div>
        <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 2 }}>
          Выбрано: {sel.size} · QR ведёт на карточку товара
        </div>
      </header>
      <div className="detail" style={{ paddingBottom: 120 }}>
        <input
          type="search"
          placeholder="Поиск…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="chips" style={{ padding: "10px 0 4px" }}>
          <button className="chip" onClick={() => setSel(new Set(items.map((i) => i.id)))}>
            Выбрать все
          </button>
          <button
            className="chip"
            onClick={() => setSel(new Set(items.filter((i) => i.status !== "verkocht").map((i) => i.id)))}
          >
            Только в наличии
          </button>
          <button className="chip" onClick={() => setSel(new Set())}>
            Снять всё
          </button>
        </div>
        <div className="label-rows">
          {shown.map((i) => (
            <label key={i.id} className="label-row">
              <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} />
              <span className="label-row-sku">{i.sku}</span>
              <span className="label-row-name">
                {i.merk}
                {i.model ? ` · ${i.model}` : ""}
                {i.locatie ? <em> · {i.locatie}</em> : null}
              </span>
            </label>
          ))}
        </div>
        <div className="labels-cta">
          <button className="btn primary" disabled={!sel.size || busy} onClick={print}>
            {busy ? "Готовлю…" : `Печать QR (${sel.size})`}
          </button>
        </div>
      </div>
    </>
  );
}
