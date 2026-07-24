"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { api, fmtPrice, type ItemDto } from "@/lib/client";
import {
  findDuplicates,
  isConfident,
  matchProduct,
  parseShopifyProductsCsv,
  type ShopProduct,
} from "@/lib/shopify";

type Tab = "matches" | "shopOnly" | "baseOnly";

const STATUS_RU: Record<string, string> = { active: "", draft: "черновик", archived: "архив" };

export default function ReconcilePage() {
  const [items, setItems] = useState<ItemDto[]>([]);
  const [products, setProducts] = useState<ShopProduct[] | null>(null);
  const [tab, setTab] = useState<Tab>("matches");
  const [rejected, setRejected] = useState<Map<string, Set<string>>>(new Map());
  const [linkedNow, setLinkedNow] = useState<Map<string, string>>(new Map()); // handle → itemId
  const [busyHandle, setBusyHandle] = useState<string | null>(null);
  const [linkedOpen, setLinkedOpen] = useState(false);
  const [error, setError] = useState("");
  const [cardError, setCardError] = useState<{ handle: string; message: string } | null>(null);
  const [justLinked, setJustLinked] = useState("");
  const [shopSel, setShopSel] = useState<Set<string>>(new Set());
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null);
  const [batchResult, setBatchResult] = useState<{
    added: number;
    failed: { product: ShopProduct; message: string; createdId?: string }[];
    needsDecision: number;
  } | null>(null);
  const [dupPrompts, setDupPrompts] = useState<Map<string, ItemDto[]>>(new Map());
  const [skippedHandles, setSkippedHandles] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    try {
      const [text, allItems] = await Promise.all([files[0].text(), api<ItemDto[]>("/api/items")]);
      const parsed = parseShopifyProductsCsv(text);
      if (!parsed.length) throw new Error("В файле не нашлось ни одного товара");
      setItems(allItems);
      setProducts(parsed);
      setRejected(new Map());
      setLinkedNow(new Map());
      // тихо обновляем снапшоты уже связанных, если данные в магазине изменились
      const byHandle = new Map(parsed.map((p) => [p.handle, p]));
      for (const it of allItems) {
        if (!it.shopifyHandle) continue;
        const p = byHandle.get(it.shopifyHandle);
        if (!p) continue;
        const s = it.shopifySync;
        const changed =
          !s ||
          s.title !== p.title ||
          s.price !== p.price ||
          s.status !== p.status ||
          JSON.stringify(s.images) !== JSON.stringify(p.images);
        if (changed) {
          api("/api/shopify-link", {
            method: "POST",
            body: JSON.stringify({ itemId: it.id, ...p }),
          }).catch(() => {});
        }
      }
    } catch (e) {
      setError((e as Error).message);
      setProducts(null);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const linkedHandles = useMemo(() => {
    const m = new Map<string, ItemDto>();
    for (const it of items) if (it.shopifyHandle) m.set(it.shopifyHandle, it);
    return m;
  }, [items]);

  const groups = useMemo(() => {
    const linked: { product: ShopProduct; item: ItemDto; priceDiff: boolean }[] = [];
    const matches: { product: ShopProduct; match: ReturnType<typeof matchProduct> }[] = [];
    const shopOnly: ShopProduct[] = [];
    if (!products) return { linked, matches, shopOnly, baseOnly: [] as ItemDto[] };

    const takenItemIds = new Set<string>();
    for (const it of items) if (it.shopifyHandle) takenItemIds.add(it.id);
    for (const id of linkedNow.values()) takenItemIds.add(id);

    const candidates = items.filter((i) => !i.archivedAt && !takenItemIds.has(i.id));

    for (const p of products) {
      const linkedItem = linkedHandles.get(p.handle) ?? items.find((i) => i.id === linkedNow.get(p.handle));
      if (linkedItem) {
        const dbPrice = parseFloat(linkedItem.vraagprijs ?? linkedItem.inkoopprijs ?? "");
        const priceDiff =
          p.price != null && Number.isFinite(dbPrice) && Math.abs(p.price - dbPrice) >= 0.01;
        linked.push({ product: p, item: linkedItem, priceDiff });
        continue;
      }
      const rej = rejected.get(p.handle) ?? new Set();
      const m = matchProduct(p, candidates.filter((c) => !rej.has(c.id)));
      if (m.length) matches.push({ product: p, match: m });
      else shopOnly.push(p);
    }

    const shopHandled = new Set([...linked.map((l) => l.item.id), ...linkedNow.values()]);
    const baseOnly = items.filter((i) => !i.archivedAt && !i.shopifyHandle && !shopHandled.has(i.id));
    return { linked, matches, shopOnly, baseOnly };
  }, [products, items, linkedHandles, rejected, linkedNow]);

  async function link(product: ShopProduct, item: ItemDto) {
    setBusyHandle(product.handle);
    setCardError(null);
    try {
      // Проверяем ответ сервера: связка считается созданной только если
      // handle реально записан — «немых» успехов не бывает.
      const updated = await api<ItemDto>("/api/shopify-link", {
        method: "POST",
        body: JSON.stringify({ itemId: item.id, ...product }),
      });
      if (updated.shopifyHandle !== product.handle) {
        throw new Error("Сервер не сохранил связку — попробуйте ещё раз");
      }
      setLinkedNow((prev) => new Map(prev).set(product.handle, item.id));
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, shopifyHandle: product.handle, shopifySync: { ...product, syncedAt: "" } }
            : i,
        ),
      );
      setJustLinked(`Связано: ${item.sku} ✓`);
      setTimeout(() => setJustLinked(""), 2500);
    } catch (e) {
      setCardError({ handle: product.handle, message: (e as Error).message });
    } finally {
      setBusyHandle(null);
    }
  }

  function rejectMatch(product: ShopProduct, item: ItemDto) {
    setRejected((prev) => {
      const next = new Map(prev);
      const set = new Set(next.get(product.handle) ?? []);
      set.add(item.id);
      next.set(product.handle, set);
      return next;
    });
  }

  /**
   * Создание товара из позиции магазина: товар → фото → связка.
   * Падение фото не считается ошибкой (импортируются позже из карточки);
   * при падении связки возвращаем createdId, чтобы retry не создал дубль.
   */
  async function runOne(
    product: ShopProduct,
    existingId?: string,
  ): Promise<{ ok: true; id: string; sku?: string } | { ok: false; message: string; createdId?: string }> {
    let createdId = existingId;
    let sku: string | undefined;
    try {
      if (!createdId) {
        const merk = product.vendor || product.title.split(" ").slice(0, 2).join(" ");
        const created = await api<ItemDto>("/api/items", {
          method: "POST",
          body: JSON.stringify({ merk, model: product.title, vraagprijs: product.price ?? "" }),
        });
        createdId = created.id;
        sku = created.sku;
      }
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
    if (product.images.length) {
      try {
        await api(`/api/items/${createdId}/photos/import`, {
          method: "POST",
          body: JSON.stringify({ urls: product.images }),
        });
      } catch {
        // товар уже создан; фото можно дотянуть из карточки позже
      }
    }
    try {
      const updated = await api<ItemDto>("/api/shopify-link", {
        method: "POST",
        body: JSON.stringify({ itemId: createdId, ...product }),
      });
      if (updated.shopifyHandle !== product.handle) throw new Error("связка не сохранилась");
    } catch (e) {
      return { ok: false, message: `создан без связки: ${(e as Error).message}`, createdId };
    }
    return { ok: true, id: createdId, sku };
  }

  function clearDupPrompt(handle: string) {
    setDupPrompts((prev) => {
      const next = new Map(prev);
      next.delete(handle);
      return next;
    });
  }

  async function addToBase(product: ShopProduct, opts?: { force?: boolean }) {
    if (!opts?.force) {
      const dups = findDuplicates(product, items);
      if (dups.length) {
        setDupPrompts((prev) => new Map(prev).set(product.handle, dups));
        return;
      }
    }
    clearDupPrompt(product.handle);
    setBusyHandle(product.handle);
    setCardError(null);
    const r = await runOne(product);
    if (r.ok) {
      setLinkedNow((prev) => new Map(prev).set(product.handle, r.id));
      api<ItemDto[]>("/api/items").then(setItems).catch(() => {});
      setJustLinked(`Добавлено${r.sku ? `: ${r.sku}` : ""} ✓`);
      setTimeout(() => setJustLinked(""), 2500);
    } else {
      setCardError({ handle: product.handle, message: r.message });
    }
    setBusyHandle(null);
  }

  async function runBatch(
    productsToAdd: ShopProduct[],
    existingIds?: Map<string, string>,
  ) {
    if (!productsToAdd.length) return;
    if (!confirm(`Создать ${productsToAdd.length} товаров с фото из магазина?`)) return;
    // мягкая проверка на дубли: похожие не создаём молча, а откладываем
    // в «Требуют решения»; retry (existingIds) проверку не проходит повторно
    let toCreate = productsToAdd;
    let deferred = 0;
    if (!existingIds) {
      const withDups: { p: ShopProduct; dups: ItemDto[] }[] = [];
      toCreate = [];
      for (const p of productsToAdd) {
        const dups = findDuplicates(p, items);
        if (dups.length) withDups.push({ p, dups });
        else toCreate.push(p);
      }
      deferred = withDups.length;
      if (deferred) {
        setDupPrompts((prev) => {
          const next = new Map(prev);
          for (const { p, dups } of withDups) next.set(p.handle, dups);
          return next;
        });
      }
    }
    setBatch({ done: 0, total: toCreate.length });
    setBatchResult(null);
    setCardError(null);
    let added = 0;
    let done = 0;
    const failed: { product: ShopProduct; message: string; createdId?: string }[] = [];
    // пачками по 3: фото каждого товара качаются отдельным запросом,
    // один общий POST не влез бы в лимиты serverless
    for (let i = 0; i < toCreate.length; i += 3) {
      const chunk = toCreate.slice(i, i + 3);
      const results = await Promise.all(chunk.map((p) => runOne(p, existingIds?.get(p.handle))));
      results.forEach((r, j) => {
        done++;
        if (r.ok) {
          added++;
          setLinkedNow((prev) => new Map(prev).set(chunk[j].handle, r.id));
        } else {
          failed.push({ product: chunk[j], message: r.message, createdId: r.createdId });
        }
      });
      setBatch({ done, total: productsToAdd.length });
    }
    const fresh = await api<ItemDto[]>("/api/items").catch(() => null);
    if (fresh) setItems(fresh);
    setBatch(null);
    setBatchResult({ added, failed, needsDecision: deferred });
    setShopSel(new Set());
    setJustLinked(
      `Добавлено ${added}` +
        (failed.length ? ` · Ошибки ${failed.length}` : "") +
        (deferred ? ` · Требуют решения ${deferred}` : ""),
    );
    setTimeout(() => setJustLinked(""), 3500);
  }

  function retryFailed() {
    if (!batchResult) return;
    const ids = new Map(
      batchResult.failed.filter((f) => f.createdId).map((f) => [f.product.handle, f.createdId!]),
    );
    runBatch(batchResult.failed.map((f) => f.product), ids);
  }

  function toggleShopSel(handle: string) {
    setShopSel((prev) => {
      const next = new Set(prev);
      if (next.has(handle)) next.delete(handle);
      else next.add(handle);
      return next;
    });
  }

  function shopCard(p: ShopProduct) {
    return (
      <div className="rec-shop">
        <div className="rec-img">{p.images[0] ? <img src={p.images[0]} alt="" loading="lazy" /> : "🛍"}</div>
        <div className="rec-name">{p.title}</div>
        <div className="rec-meta">
          {fmtPrice(p.price != null ? String(p.price) : null)}
          {STATUS_RU[p.status] ? <span className="badge gereserveerd" style={{ marginLeft: 6 }}>{STATUS_RU[p.status]}</span> : null}
        </div>
      </div>
    );
  }

  function dbCard(it: ItemDto) {
    return (
      <div className="rec-shop">
        <div className="rec-img">{it.hoofdfoto ? <img src={it.hoofdfoto} alt="" loading="lazy" /> : "🏺"}</div>
        <div className="rec-name">
          {it.merk}
          {it.model ? ` · ${it.model}` : ""}
        </div>
        <div className="rec-meta">
          {it.sku} · {fmtPrice(it.vraagprijs ?? it.inkoopprijs)}
          {it.status === "verkocht" && <span className="badge verkocht" style={{ marginLeft: 6 }}>продано</span>}
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
          Сверка с магазином
        </div>
        {products && (
          <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 2 }}>
            {products.length} товаров в магазине · {groups.linked.length} уже связано
          </div>
        )}
      </header>

      <div className="detail" style={{ paddingBottom: 60 }}>
        {products === null && (
          <>
            <p style={{ fontSize: 13.5, color: "var(--mute)", marginBottom: 14 }}>
              Выгрузите каталог в Shopify (Products → Export → CSV) и загрузите файл сюда.
              Подтверждённая связь сохраняется — в следующий раз сверяется только новое.
            </p>
            <button className="btn primary" onClick={() => fileRef.current?.click()}>
              Выбрать CSV-файл
            </button>
            {error && <div className="err" style={{ marginTop: 10 }}>{error}</div>}
          </>
        )}
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files)} />

        {justLinked && <div className="saved-note">{justLinked}</div>}
        {products && (
          <>
            {groups.linked.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <h2 className="ov-h serif" style={{ cursor: "pointer", marginTop: 4 }} onClick={() => setLinkedOpen((v) => !v)}>
                  Уже связаны · {groups.linked.length} {linkedOpen ? "▴" : "▾"}
                  {groups.linked.some((l) => l.priceDiff) && (
                    <span className="badge gereserveerd" style={{ marginLeft: 8 }}>
                      цены разошлись: {groups.linked.filter((l) => l.priceDiff).length}
                    </span>
                  )}
                </h2>
                {linkedOpen && (
                  <div className="hist-list">
                    {groups.linked.map(({ product, item, priceDiff }) => (
                      <Link href={`/item/${item.id}`} className="hist-row" key={product.handle} style={{ display: "block" }}>
                        <div className="hist-text">
                          {item.sku} · {product.title}
                        </div>
                        <div className="hist-meta" style={priceDiff ? { color: "var(--gold)", fontWeight: 600 } : undefined}>
                          {priceDiff
                            ? `цена разошлась: у тебя ${fmtPrice(item.vraagprijs ?? item.inkoopprijs)}, в магазине ${fmtPrice(String(product.price))}`
                            : `цена совпадает · ${fmtPrice(String(product.price))}`}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="chips" style={{ padding: "0 0 10px" }}>
              {(
                [
                  ["matches", `Совпадения · ${groups.matches.length}`],
                  ["shopOnly", `Нет в базе · ${groups.shopOnly.length}`],
                  ["baseOnly", `Нет в магазине · ${groups.baseOnly.length}`],
                ] as [Tab, string][]
              ).map(([t, label]) => (
                <button key={t} className={`chip ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
                  {label}
                </button>
              ))}
            </div>

            {tab === "matches" && (
              <>
                {groups.matches.length === 0 && <div className="empty">Непросмотренных совпадений нет</div>}
                {groups.matches.map(({ product, match }) => (
                  <div className="imp-card" key={product.handle}>
                    <div className="rec-pair">
                      {shopCard(product)}
                      {dbCard(match[0].item)}
                    </div>
                    <div style={{ textAlign: "center", fontSize: 12, color: "var(--gold)", fontWeight: 700, marginTop: 6 }}>
                      совпадение {Math.round(match[0].score * 100)}%
                      {!isConfident(match) && match.length > 1 ? ` · ещё ${match.length - 1} канд.` : ""}
                    </div>
                    {cardError?.handle === product.handle && (
                      <div className="rec-error">⚠ {cardError.message}</div>
                    )}
                    <div className="imp-actions">
                      <button
                        className="btn green"
                        disabled={busyHandle === product.handle}
                        onClick={() => link(product, match[0].item)}
                      >
                        {busyHandle === product.handle ? "…" : "✓ Это оно"}
                      </button>
                      <button className="btn ghost" onClick={() => rejectMatch(product, match[0].item)}>
                        ✕ Не то
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}

            {tab === "shopOnly" && (
              <>
                {groups.shopOnly.length === 0 && !batchResult && (
                  <div className="empty">Всё из магазина есть в базе</div>
                )}

                {groups.shopOnly.length > 0 && (
                  <div className="stack" style={{ marginTop: 0, marginBottom: 12 }}>
                    <button
                      className="btn primary"
                      disabled={!!batch}
                      onClick={() => runBatch(groups.shopOnly)}
                    >
                      {batch
                        ? `Добавляю… ${batch.done} из ${batch.total}`
                        : `Добавить все (${groups.shopOnly.length})`}
                    </button>
                    {shopSel.size > 0 && !batch && (
                      <button
                        className="btn ghost"
                        onClick={() => runBatch(groups.shopOnly.filter((p) => shopSel.has(p.handle)))}
                      >
                        Добавить выбранные ({shopSel.size})
                      </button>
                    )}
                  </div>
                )}

                {batchResult && (
                  <div className="imp-card">
                    <div style={{ fontWeight: 600 }}>
                      Добавлено {batchResult.added} · Ошибки {batchResult.failed.length}
                      {batchResult.needsDecision > 0 &&
                        ` · Требуют решения ${batchResult.needsDecision}`}
                    </div>
                    {batchResult.needsDecision > 0 && (
                      <p style={{ fontSize: 12.5, color: "var(--mute)", marginTop: 4 }}>
                        Возможные дубли не созданы — решите по карточкам ниже: связать,
                        создать или пропустить.
                      </p>
                    )}
                    {batchResult.failed.map((f) => (
                      <div className="rec-error" key={f.product.handle}>
                        <b>{f.product.title}</b>
                        <br />⚠ {f.message}
                      </div>
                    ))}
                    <div className="imp-actions">
                      {batchResult.failed.length > 0 && (
                        <button className="btn primary" disabled={!!batch} onClick={retryFailed}>
                          Повторить неудачные ({batchResult.failed.length})
                        </button>
                      )}
                      <button className="btn ghost" onClick={() => setBatchResult(null)}>
                        Закрыть
                      </button>
                    </div>
                  </div>
                )}

                {groups.shopOnly
                  .filter((p) => !skippedHandles.has(p.handle))
                  .sort((a, b) => Number(dupPrompts.has(b.handle)) - Number(dupPrompts.has(a.handle)))
                  .map((p) => {
                    const dups = dupPrompts.get(p.handle);
                    return (
                      <div className="imp-card" key={p.handle}>
                        <label className="rec-choose">
                          <input
                            type="checkbox"
                            checked={shopSel.has(p.handle)}
                            onChange={() => toggleShopSel(p.handle)}
                            disabled={!!batch}
                          />
                          <span>выбрать</span>
                        </label>
                        <div className="rec-pair single">{shopCard(p)}</div>
                        {cardError?.handle === p.handle && (
                          <div className="rec-error">⚠ {cardError.message}</div>
                        )}
                        {dups ? (
                          <>
                            <div className="dup-note">
                              Возможный дубль — похожий товар уже есть в базе:
                            </div>
                            <div className="imp-cands">
                              {dups.map((d) => (
                                <button
                                  key={d.id}
                                  className="imp-cand"
                                  disabled={busyHandle === p.handle || !!batch}
                                  onClick={async () => {
                                    await link(p, d);
                                    clearDupPrompt(p.handle);
                                  }}
                                >
                                  {dbCard(d)}
                                  <div className="dup-link-hint">Это он — связать</div>
                                </button>
                              ))}
                            </div>
                            <div className="imp-actions">
                              <button
                                className="btn primary"
                                disabled={busyHandle === p.handle || !!batch}
                                onClick={() => addToBase(p, { force: true })}
                              >
                                Всё равно создать
                              </button>
                              <button
                                className="btn ghost"
                                onClick={() => {
                                  clearDupPrompt(p.handle);
                                  setSkippedHandles((prev) => new Set(prev).add(p.handle));
                                }}
                              >
                                Пропустить
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="imp-actions">
                            <button
                              className="btn primary"
                              disabled={busyHandle === p.handle || !!batch}
                              onClick={() => addToBase(p)}
                            >
                              {busyHandle === p.handle ? "Создаю с фото…" : "Добавить в базу"}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </>
            )}

            {tab === "baseOnly" && (
              <>
                <p style={{ fontSize: 12.5, color: "var(--mute)", marginBottom: 10 }}>
                  Непроданное здесь — кандидаты на выставление в магазин.
                </p>
                {groups.baseOnly.length === 0 && <div className="empty">Пусто</div>}
                <div className="hist-list">
                  {groups.baseOnly.map((it) => (
                    <Link href={`/item/${it.id}`} className="hist-row" key={it.id} style={{ display: "block" }}>
                      <div className="hist-text">
                        {it.sku} · {it.merk}
                        {it.model ? ` · ${it.model}` : ""}
                        {it.status === "verkocht" && <span className="badge verkocht" style={{ marginLeft: 6 }}>продано</span>}
                      </div>
                      <div className="hist-meta">{fmtPrice(it.vraagprijs ?? it.inkoopprijs)}{it.locatie ? ` · ${it.locatie}` : ""}</div>
                    </Link>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
