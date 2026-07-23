"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { api, compressImage, fmtPrice, listPrice, type ItemDto } from "@/lib/client";

type StatusFilter = "all" | "voorraad" | "verkocht";
type Sort = "date" | "price" | "brand";

export default function ListPage() {
  const [items, setItems] = useState<ItemDto[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [loc, setLoc] = useState<string>("");
  const [brand, setBrand] = useState<string>("");
  const [sort, setSort] = useState<Sort>("date");
  const [sellItem, setSellItem] = useState<ItemDto | null>(null);
  const [sellPrice, setSellPrice] = useState("");
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const camItemId = useRef<string | null>(null);

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
    load();
    // Обновление при возврате на вкладку/экран — подтягивает фото и правки
    // второго пользователя без перезагрузки страницы.
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
    if (loc) list = list.filter((i) => i.locatie === loc);
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

  async function toggleSold(it: ItemDto, price?: string) {
    const toSold = it.status !== "verkocht";
    const body: Record<string, unknown> = { status: toSold ? "verkocht" : "voorraad" };
    if (toSold && price?.trim()) body.verkoopprijs = price;
    // оптимистичное обновление
    setItems((prev) =>
      prev?.map((i) => (i.id === it.id ? { ...i, status: toSold ? "verkocht" : "voorraad" } : i)) ?? null,
    );
    try {
      await api(`/api/items/${it.id}`, { method: "PATCH", body: JSON.stringify(body) });
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

  return (
    <>
      {offline && <div className="offline-note">Нет сети — показаны сохранённые данные</div>}
      <header className="app">
        <div className="topnav">
          <div>
            <div className="eyebrow">Gina Decor</div>
            <div className="serif" style={{ fontSize: 20, fontWeight: 700 }}>
              Склад
            </div>
          </div>
          <Link href="/settings" className="gear" aria-label="Настройки">
            ⚙︎
          </Link>
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

      <div className="bar">
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
        {filtered.map((it) => {
          const sold = it.status === "verkocht";
          const sub = [it.soort, it.aantalDelen ? `${it.aantalDelen} ч.` : null, it.locatie]
            .filter(Boolean)
            .join(" · ");
          return (
            <div className={`gcard ${sold ? "sold" : ""}`} key={it.id}>
              <div className="gphoto">
                {it.hoofdfoto ? (
                  <Link href={`/item/${it.id}`}>
                    <Image
                      src={it.hoofdfoto}
                      alt={it.merk}
                      fill
                      sizes="(max-width: 767px) 50vw, 246px"
                      style={{ objectFit: "cover" }}
                    />
                  </Link>
                ) : (
                  <button
                    className="gnophoto"
                    onClick={() => openCamera(it)}
                    disabled={uploadingId === it.id}
                    aria-label="Сделать фото"
                  >
                    <span className="cam">📷</span>
                    <span className="nophoto-badge">
                      {uploadingId === it.id ? "загружаю…" : "нет фото"}
                    </span>
                  </button>
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
                <div className="gsub">{sub || " "}</div>
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
          );
        })}
      </main>

      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => onCameraFile(e.target.files)}
      />

      <Link href="/new" className="fab" aria-label="Добавить товар">
        +
      </Link>

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
