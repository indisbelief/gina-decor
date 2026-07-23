"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, fmtPrice, type ItemDto } from "@/lib/client";
import { isConfident, matchLine, parseShopifyCsv, type OrderLine } from "@/lib/shopify";

type ImportedPair = { orderName: string; lineitemName: string; itemId: string };
type Decision = { status: "confirmed" | "rejected"; itemId?: string };

const keyOf = (l: OrderLine) => `${l.order}||${l.name}`;

export default function ImportPage() {
  const [items, setItems] = useState<ItemDto[]>([]);
  const [pairs, setPairs] = useState<ImportedPair[]>([]);
  const [lines, setLines] = useState<OrderLine[] | null>(null);
  const [skippedJunk, setSkippedJunk] = useState(0);
  const [decisions, setDecisions] = useState<Map<string, Decision>>(new Map());
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [nfOpen, setNfOpen] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    try {
      const [text, allItems, imported] = await Promise.all([
        files[0].text(),
        api<ItemDto[]>("/api/items"),
        api<ImportedPair[]>("/api/shopify-imports"),
      ]);
      const parsed = parseShopifyCsv(text);
      setItems(allItems);
      setPairs(imported);
      setLines(parsed.lines);
      setSkippedJunk(parsed.skipped);
      setDecisions(new Map());
    } catch (e) {
      setError((e as Error).message);
      setLines(null);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const importedKeys = useMemo(
    () => new Set(pairs.map((p) => `${p.orderName}||${p.lineitemName}`)),
    [pairs],
  );

  // Позиции, требующие решения: не мусор и ещё не импортированы ранее.
  const actionable = useMemo(
    () => (lines ?? []).filter((l) => !importedKeys.has(keyOf(l))),
    [lines, importedKeys],
  );

  // В наличии и не подтверждены в этой сессии.
  const stock = useMemo(() => {
    const takenIds = new Set(
      Array.from(decisions.values())
        .filter((d) => d.status === "confirmed" && d.itemId)
        .map((d) => d.itemId!),
    );
    return items.filter((i) => i.status !== "verkocht" && !i.archivedAt && !takenIds.has(i.id));
  }, [items, decisions]);

  const groups = useMemo(() => {
    const confident: { line: OrderLine; match: ReturnType<typeof matchLine> }[] = [];
    const similar: { line: OrderLine; match: ReturnType<typeof matchLine> }[] = [];
    const notFound: OrderLine[] = [];
    for (const line of actionable) {
      if (decisions.has(keyOf(line))) continue;
      const match = matchLine(line, stock);
      if (!match.length) notFound.push(line);
      else if (isConfident(match)) confident.push({ line, match });
      else similar.push({ line, match });
    }
    return { confident, similar, notFound };
  }, [actionable, stock, decisions]);

  const decided = decisions.size;

  async function confirm(line: OrderLine, item: ItemDto) {
    const k = keyOf(line);
    setBusyKey(k);
    try {
      await api("/api/shopify-imports", {
        method: "POST",
        body: JSON.stringify({
          orderName: line.order,
          lineitemName: line.name,
          itemId: item.id,
          price: line.price,
          date: line.date || null,
        }),
      });
      setDecisions((prev) => new Map(prev).set(k, { status: "confirmed", itemId: item.id }));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusyKey(null);
    }
  }

  function reject(line: OrderLine) {
    setDecisions((prev) => new Map(prev).set(keyOf(line), { status: "rejected" }));
  }

  function orderCard(line: OrderLine) {
    return (
      <div className="imp-order">
        <div className="imp-order-name">{line.name}</div>
        <div className="imp-order-meta">
          {line.order} · {line.date || "без даты"} · {fmtPrice(line.price != null ? String(line.price) : null)}
          {line.qty > 1 ? ` · ×${line.qty}` : ""}
        </div>
      </div>
    );
  }

  function itemCard(item: ItemDto, score: number) {
    return (
      <div className="imp-item">
        <span className="ov-thumb">
          {item.hoofdfoto ? <img src={item.hoofdfoto} alt="" loading="lazy" /> : "🏺"}
        </span>
        <span className="imp-item-info">
          <span className="gtitle">
            {item.merk}
            {item.model ? ` · ${item.model}` : ""}
          </span>
          <span className="gsub">
            {item.sku}
            {item.soort ? ` · ${item.soort}` : ""}
            {item.locatie ? ` · ${item.locatie}` : ""} · {fmtPrice(item.vraagprijs ?? item.inkoopprijs)}
          </span>
        </span>
        <span className="imp-score">{Math.round(score * 100)}%</span>
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
          Импорт из Shopify
        </div>
        {lines !== null && (
          <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 2 }}>
            разобрано {decided} из {actionable.length}
            {skippedJunk > 0 ? ` · ${skippedJunk} служебных строк пропущено` : ""}
            {(lines.length ?? 0) - actionable.length > 0
              ? ` · ${lines.length - actionable.length} уже импортировано ранее`
              : ""}
          </div>
        )}
      </header>

      <div className="detail" style={{ paddingBottom: 60 }}>
        {lines === null && (
          <>
            <p style={{ fontSize: 13.5, color: "var(--mute)", marginBottom: 14 }}>
              Выгрузите заказы в Shopify (Orders → Export → CSV) и загрузите файл сюда.
              Совпадения нужно подтвердить вручную — без подтверждения ничего не меняется.
            </p>
            <button className="btn primary" onClick={() => fileRef.current?.click()}>
              Выбрать CSV-файл
            </button>
            {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}
          </>
        )}
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files)} />

        {lines !== null && (
          <>
            {groups.confident.length + groups.similar.length + groups.notFound.length === 0 && (
              <div className="empty">
                Всё разобрано ✓
                <div style={{ marginTop: 14 }}>
                  <button className="btn ghost" onClick={() => setLines(null)}>
                    Загрузить другой файл
                  </button>
                </div>
              </div>
            )}

            {groups.confident.length > 0 && (
              <>
                <h2 className="ov-h serif">Уверенные · {groups.confident.length}</h2>
                {groups.confident.map(({ line, match }) => {
                  const k = keyOf(line);
                  return (
                    <div className="imp-card" key={k}>
                      {orderCard(line)}
                      <div className="imp-arrow">↓</div>
                      {itemCard(match[0].item, match[0].score)}
                      <div className="imp-actions">
                        <button
                          className="btn green"
                          disabled={busyKey === k}
                          onClick={() => confirm(line, match[0].item)}
                        >
                          {busyKey === k ? "…" : "✓ Подтвердить"}
                        </button>
                        <button className="btn ghost" onClick={() => reject(line)}>
                          ✕ Не то
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {groups.similar.length > 0 && (
              <>
                <h2 className="ov-h serif">Похожие · {groups.similar.length}</h2>
                {groups.similar.map(({ line, match }) => {
                  const k = keyOf(line);
                  return (
                    <div className="imp-card" key={k}>
                      {orderCard(line)}
                      <div className="imp-cands">
                        {match.map((m) => (
                          <button
                            key={m.item.id}
                            className="imp-cand"
                            disabled={busyKey === k}
                            onClick={() => confirm(line, m.item)}
                          >
                            {itemCard(m.item, m.score)}
                          </button>
                        ))}
                      </div>
                      <div className="imp-actions">
                        <button className="btn ghost" onClick={() => reject(line)}>
                          ✕ Ничего из этого
                        </button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {groups.notFound.length > 0 && (
              <>
                <h2 className="ov-h serif" style={{ cursor: "pointer" }} onClick={() => setNfOpen((v) => !v)}>
                  Не найдено · {groups.notFound.length} {nfOpen ? "▴" : "▾"}
                </h2>
                {nfOpen && (
                  <div className="hist-list">
                    {groups.notFound.map((line) => (
                      <div className="hist-row" key={keyOf(line)}>
                        <div className="hist-text">{line.name}</div>
                        <div className="hist-meta">
                          {line.order} · {line.date} ·{" "}
                          {fmtPrice(line.price != null ? String(line.price) : null)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p style={{ fontSize: 12.5, color: "var(--mute)", marginTop: 8 }}>
                  Эти позиции не тронуты — при необходимости отметьте продажу вручную.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
