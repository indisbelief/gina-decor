"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  api,
  compressImage,
  fmtPrice,
  listPrice,
  takePendingUndo,
  type ItemDto,
} from "@/lib/client";
import { BottomNav } from "@/components/BottomNav";
import { SwipeCard } from "@/components/SwipeCard";
import { UndoToast, type UndoState } from "@/components/UndoToast";

type StatusFilter = "all" | "voorraad" | "verkocht";
type Sort = "date" | "price" | "brand";

export default function ListPage() {
  const router = useRouter();
  const [items, setItems] = useState<ItemDto[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loc, setLoc] = useState<string>("");
  const [brand, setBrand] = useState<string>("");
  const [sort, setSort] = useState<Sort>("date");
  const [grouped, setGrouped] = useState(false);
  const [sellItem, setSellItem] = useState<ItemDto | null>(null);
  const [sellPrice, setSellPrice] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [toast, setToast] = useState<UndoState>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const camItemId = useRef<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const data = await api<ItemDto[]>("/api/items");
      setItems(data);
      setOffline(false);
    } catch {
      // офлайн: service worker отдаст кэш, если он есть
      setOffline(true);
      if (items === null) setItems([]);
    }
  }

  useEffect(() => {
    // ?loc=... — переход с экрана «Локации»
    const param = new URLSearchParams(window.location.search).get("loc");
    if (param) setLoc(param);
    const pending = takePendingUndo();
    if (pending) setToast(pending);
    load();
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Высота sticky-панели поиска — отступ для sticky-заголовков секций.
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const set = () =>
      document.documentElement.style.setProperty("--barh", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const locaties = useMemo(
    () => Array.from(new Set((items ?? []).map((i) => i.locatie).filter(Boolean) as string[])).sort(),
    [items],
  );
  const brands = useMemo(
    () => Array.from(new Set((items ?? []).map((i) => i.merk))).sort(),
    [items],
  );

  const filtered = useMemo(() => {
    let list = items ?? [];
    if (status !== "all") list = list.filter((i) => (status === "voorraad" ? i.status !== "verkocht" : i.status === "verkocht"));
    if (loc === "__none") list = list.filter((i) => !i.locatie);
    else if (loc) list = list.filter((i) => i.locatie === loc);
    if (brand) list = list.filter((i) => i.merk === brand);
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      list = list.filter((i) =>
        [i.merk, i.model, i.soort, i.locatie, i.sku].some((f) => f?.toLowerCase().includes(s)),
      );
    }
    const sorted = [...list];
    if (sort === "date") sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (sort === "price") sorted.sort((a, b) => parseFloat(listPrice(b) ?? "0") - parseFloat(listPrice(a) ?? "0"));
    if (sort === "brand") sorted.sort((a, b) => a.merk.localeCompare(b.merk));
    return sorted;
  }, [items, q, status, loc, brand, sort]);

  // Секции по локациям (сортировка внутри — какая выбрана выше).
  const sections = useMemo(() => {
    if (!grouped || loc) return null;
    const map = new Map<string, ItemDto[]>();
    for (const it of filtered) {
      const key = it.locatie ?? "Без места";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(it);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }, [filtered, grouped, loc]);

  const stats = useMemo(() => {
    const all = items ?? [];
    const inStock = all.filter((i) => i.status !== "verkocht");
    const sum = inStock.reduce((acc, i) => acc + parseFloat(listPrice(i) ?? "0"), 0);
    return {
      voorraad: inStock.length,
      som: sum,
      verkocht: all.filter((i) => i.status === "verkocht").length,
    };
  }, [items]);

  const closeToast = useCallback(() => setToast(null), []);

  async function toggleSold(it: ItemDto, price?: string) {
    const toSold = it.status !== "verkocht";
    const snapshot = {
      status: it.status,
      verkoopprijs: it.verkoopprijs,
      verkoopdatum: it.verkoopdatum,
    };
    const body: Record<string, unknown> = { status: toSold ? "verkocht" : "voorraad" };
    if (toSold && price?.trim()) body.verkoopprijs = price;
    // оптимистичное обновление
    setItems((prev) =>
      prev?.map((i) => (i.id === it.id ? { ...i, status: toSold ? "verkocht" : "voorraad" } : i)) ?? null,
    );
    try {
      await api(`/api/items/${it.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setToast({
        label: toSold ? `Продано: ${it.merk}` : `Возвращено: ${it.merk}`,
        undo: async () => {
          await api(`/api/items/${it.id}`, { method: "PATCH", body: JSON.stringify(snapshot) });
          load();
        },
      });
    } finally {
      load();
    }
  }

  function openCamera(it: ItemDto) {
    camItemId.current = it.id;
    camRef.current?.click();
  }

  async function onCameraFile(files: FileList | null) {
    const itemId = camItemId.current;
    if (!files?.length || !itemId) return;
    setUploadingId(itemId);
    try {
      const blob = await compressImage(files[0]);
      const fd = new FormData();
      fd.append("file", blob, "photo.jpg");
      await api(`/api/items/${itemId}/photos`, { method: "POST", body: fd });
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploadingId(null);
      camItemId.current = null;
      if (camRef.current) camRef.current.value = "";
    }
  }

  function renderCard(it: ItemDto) {
    const sold = it.status === "verkocht";
    const sub = [it.soort, it.aantalDelen ? `${it.aantalDelen} ч.` : null, it.locatie]
      .filter(Boolean)
      .join(" · ");
    return (
      <SwipeCard
        key={it.id}
        rightLabel={sold ? "Вернуть" : "Продано"}
        rightColor={sold ? "var(--cobalt)" : "var(--green)"}
        onRight={() => toggleSold(it)}
        onLeft={() => router.push(`/item/${it.id}`)}
      >
        <div className={`gcard ${sold ? "sold" : ""}`}>
          <div className="gphoto">
            {it.hoofdfoto ? (
              <Link href={`/item/${it.id}`}>
                {/* hoofdfoto из API — это thumb ~400px, не оригинал */}
                <img src={it.hoofdfoto} alt={it.merk} loading="lazy" />
              </Link>
            ) : (
              <>
                <Link
                  href={`/item/${it.id}`}
                  className="gnophoto"
                  aria-label={`${it.merk} — открыть карточку`}
                />
                {/* Кнопка живёт рядом со ссылкой, а не внутри неё: тап по ней
                    не может открыть карточку даже без stopPropagation */}
                <div className="gcamwrap">
                  <button
                    className="gcam"
                    onClick={(e) => {
                      e.stopPropagation();
                      openCamera(it);
                    }}
                    disabled={uploadingId === it.id}
                    aria-label="Сделать фото"
                  >
                    📷
                  </button>
                  <span className="gcam-label">
                    {uploadingId === it.id ? "загружаю…" : "Фото"}
                  </span>
                </div>
              </>
            )}
            <span
              className={`gstatus ${
                sold ? "verkocht" : it.status === "gereserveerd" ? "reserv" : "voorraad"
              }`}
            >
              {sold ? "продано" : it.status === "gereserveerd" ? "резерв" : "в наличии"}
            </span>
          </div>
          <Link href={`/item/${it.id}`} className="gbody">
            <div className="gtitle">
              {it.merk}
              {it.model ? ` · ${it.model}` : ""}
            </div>
            <div className="gsub">{sub || " "}</div>
          </Link>
          <div className="gfoot">
            <span className="gprice serif">{fmtPrice(listPrice(it))}</span>
            {sold ? (
              <button className="gbtn undo" onClick={() => toggleSold(it)}>
                Вернуть
              </button>
            ) : (
              <button
                className="gbtn"
                onClick={() => {
                  setSellItem(it);
                  setSellPrice("");
                }}
              >
                Продано
              </button>
            )}
          </div>
        </div>
      </SwipeCard>
    );
  }

  return (
    <>
      {offline && <div className="offline-note">Нет сети — показаны сохранённые данные</div>}
      <header className="app">
        <div className="eyebrow">Gina Decor</div>
        <div className="serif" style={{ fontSize: 20, fontWeight: 700 }}>
          Склад
        </div>
        <div className="stats">
          <div className="stat">
            <div className="n">{stats.voorraad}</div>
            <div className="l">в наличии</div>
          </div>
          <div className="stat">
            <div className="n">€{Math.round(stats.som).toLocaleString("ru-RU")}</div>
            <div className="l">на складе</div>
          </div>
          <div className="stat">
            <div className="n">{stats.verkocht}</div>
            <div className="l">продано</div>
          </div>
        </div>
      </header>

      <div className="bar" ref={barRef}>
        <input
          type="search"
          placeholder="Поиск: бренд, модель, тип, место…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="chips">
          {(
            [
              ["all", "Все"],
              ["voorraad", "В наличии"],
              ["verkocht", "Продано"],
            ] as [StatusFilter, string][]
          ).map(([v, label]) => (
            <button key={v} className={`chip ${status === v ? "on" : ""}`} onClick={() => setStatus(v)}>
              {label}
            </button>
          ))}
          <button
            className={`chip ${grouped ? "on" : ""}`}
            onClick={() => setGrouped((g) => !g)}
            title="Группировать по локациям"
          >
            {grouped ? "По локациям ✓" : "По локациям"}
          </button>
          <select
            className={`chip ${loc ? "on" : ""}`}
            style={{ width: "auto", padding: "7px 10px" }}
            value={loc}
            onChange={(e) => setLoc(e.target.value)}
          >
            <option value="">Место: все</option>
            {locaties.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <select
            className={`chip ${brand ? "on" : ""}`}
            style={{ width: "auto", padding: "7px 10px" }}
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          >
            <option value="">Бренд: все</option>
            {brands.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <select
            className="chip"
            style={{ width: "auto", padding: "7px 10px" }}
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            <option value="date">Сначала новые</option>
            <option value="price">По цене</option>
            <option value="brand">По бренду</option>
          </select>
        </div>
      </div>

      <main className="grid">
        {items === null && <div className="empty gspan">Загружаю…</div>}
        {items !== null && filtered.length === 0 && <div className="empty gspan">Ничего не найдено</div>}
        {sections
          ? sections.map(([name, group]) => (
              <div key={name} className="gsection-wrap gspan">
                <div className="gsection">
                  <span>{name}</span>
                  <span className="gsection-n">{group.length}</span>
                </div>
                <div className="grid-inner">{group.map(renderCard)}</div>
              </div>
            ))
          : filtered.map(renderCard)}
      </main>

      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => onCameraFile(e.target.files)}
      />

      <UndoToast toast={toast} onDone={closeToast} />
      <BottomNav />

      {sellItem && (
        <div className="modal-back" onClick={() => setSellItem(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              Продано: {sellItem.merk}
              {sellItem.model ? ` ${sellItem.model}` : ""}
            </h3>
            <div className="field">
              <label>Цена продажи, € (можно пропустить)</label>
              <input
                type="number"
                inputMode="decimal"
                placeholder={listPrice(sellItem) ?? "0"}
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                autoFocus
              />
            </div>
            <div className="stack" style={{ marginTop: 8 }}>
              <button
                className="btn green"
                onClick={() => {
                  toggleSold(sellItem, sellPrice);
                  setSellItem(null);
                }}
              >
                Отметить проданным
              </button>
              <button className="btn ghost" onClick={() => setSellItem(null)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
