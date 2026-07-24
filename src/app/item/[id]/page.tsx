"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  api,
  compressImage,
  fmtPrice,
  humanizeEvent,
  listPrice,
  relDate,
  setPendingUndo,
  type EventDto,
  type ItemDto,
  type PhotoDto,
} from "@/lib/client";
import { UndoToast, type UndoState } from "@/components/UndoToast";
import { Lightbox } from "@/components/Lightbox";

type FullItem = ItemDto & { photos: PhotoDto[] };

function ShopifyBlock({ item, onImported }: { item: FullItem; onImported: () => void }) {
  const [busy, setBusy] = useState(false);
  const sync = item.shopifySync!;
  const localSources = new Set(item.photos.map((p) => p.sourceUrl).filter(Boolean));
  const newImages = (sync.images ?? []).filter((u) => !localSources.has(u));
  const statusRu: Record<string, string> = { active: "опубликован", draft: "черновик", archived: "в архиве" };

  async function importPhotos() {
    setBusy(true);
    try {
      const res = await api<{ created: number }>(`/api/items/${item.id}/photos/import`, {
        method: "POST",
        body: JSON.stringify({ urls: newImages }),
      });
      if (!res.created) alert("Новых фото не нашлось");
      onImported();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-item" style={{ marginTop: 18 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>Shopify</div>
      <div style={{ fontSize: 13.5 }}>{sync.title}</div>
      <div style={{ fontSize: 12.5, color: "var(--mute)", marginTop: 2 }}>
        {fmtPrice(sync.price != null ? String(sync.price) : null)} в магазине ·{" "}
        {statusRu[sync.status] ?? sync.status}
      </div>
      {newImages.length > 0 && (
        <button className="btn ghost" style={{ marginTop: 10 }} disabled={busy} onClick={importPhotos}>
          {busy ? "Импортирую…" : `Импортировать фото из Shopify (${newImages.length})`}
        </button>
      )}
    </div>
  );
}

const FIELDS: { key: keyof ItemDto; label: string; type?: string }[] = [
  { key: "merk", label: "Бренд *" },
  { key: "model", label: "Модель / коллекция" },
  { key: "soort", label: "Тип (сервиз, ваза…)" },
  { key: "aantalDelen", label: "Частей в наборе", type: "number" },
  { key: "locatie", label: "Место" },
  { key: "vraagprijs", label: "Цена продажи (запрос), €", type: "number" },
  { key: "inkoopprijs", label: "Цена закупки, €", type: "number" },
  { key: "leverancier", label: "Поставщик" },
];

export default function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [item, setItem] = useState<FullItem | null>(null);
  const [saved, setSaved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [sellPrice, setSellPrice] = useState("");
  const [toast, setToast] = useState<UndoState>(null);
  const [histOpen, setHistOpen] = useState(false);
  const [events, setEvents] = useState<EventDto[] | null>(null);
  const [lbIndex, setLbIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function load() {
    setItem(await api<FullItem>(`/api/items/${id}`));
    if (histOpen) loadEvents();
  }

  async function loadEvents() {
    setEvents(await api<EventDto[]>(`/api/items/${id}/events`).catch(() => []));
  }

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (histOpen && events === null) loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histOpen]);

  function flashSaved() {
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1500);
  }

  async function patch(body: Record<string, unknown>) {
    const updated = await api<ItemDto>(`/api/items/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    setItem((prev) => (prev ? { ...prev, ...updated } : prev));
    if (events !== null) loadEvents();
    flashSaved();
    return updated;
  }

  async function saveField(key: string, value: string) {
    if (!item) return;
    const current = item[key as keyof ItemDto];
    if (String(current ?? "") === value.trim()) return;
    try {
      await patch({ [key]: value });
    } catch (e) {
      alert((e as Error).message);
      load();
    }
  }

  function snapshotStatus(it: ItemDto) {
    return { status: it.status, verkoopprijs: it.verkoopprijs, verkoopdatum: it.verkoopdatum };
  }

  async function markSold(price: string) {
    if (!item) return;
    const snap = snapshotStatus(item);
    const body: Record<string, unknown> = { status: "verkocht" };
    if (price.trim()) body.verkoopprijs = price;
    await patch(body);
    setToast({
      label: "Продано",
      undo: async () => {
        await patch(snap);
      },
    });
  }

  async function markReturned() {
    if (!item) return;
    const snap = snapshotStatus(item);
    await patch({ status: "voorraad" });
    setToast({
      label: "Возвращено в наличие",
      undo: async () => {
        await patch(snap);
      },
    });
  }

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        const blob = await compressImage(f);
        const fd = new FormData();
        fd.append("file", blob, "photo.jpg");
        await api(`/api/items/${id}/photos`, { method: "POST", body: fd });
      }
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function deletePhoto(p: PhotoDto) {
    if (!confirm("Удалить фото?")) return;
    await api(`/api/photos/${p.id}`, { method: "DELETE" });
    setLbIndex(null);
    load();
  }

  async function makeMain(p: PhotoDto) {
    await api(`/api/photos/${p.id}`, { method: "PATCH" });
    flashSaved();
    load();
  }

  async function archive() {
    // Применяем сразу; отмена — через undo-тост уже на списке.
    await api(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
    setPendingUndo({
      label: `В архиве: ${item?.merk ?? ""}`,
      undo: async () => {
        await api(`/api/items/${id}`, { method: "PATCH", body: JSON.stringify({ archived: false }) });
      },
    });
    router.push("/");
  }

  const closeToast = useCallback(() => setToast(null), []);

  async function restore() {
    await patch({ archived: false });
    setToast({
      label: "Восстановлено из архива",
      undo: async () => {
        await patch({ archived: true });
      },
    });
  }

  async function deleteForever() {
    if (!confirm("Удалить навсегда? Фото и вся история товара будут стёрты.")) return;
    if (!confirm("Точно удалить? Это действие необратимо.")) return;
    try {
      await api(`/api/items/${id}`, { method: "DELETE" });
      router.push("/archive");
    } catch (e) {
      alert((e as Error).message);
    }
  }

  if (!item) return <div className="empty">Загружаю…</div>;

  const isSold = item.status === "verkocht";
  const isArchived = !!item.archivedAt;

  return (
    <>
      <header className="app">
        <Link href={isArchived ? "/archive" : "/"} className="back">
          {isArchived ? "← Архив" : "← Склад"}
        </Link>
        <div className="serif" style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>
          {item.merk}
          {item.model ? ` · ${item.model}` : ""}
        </div>
        <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 2 }}>
          {item.sku}
          {isSold && <> · продано {item.verkoopdatum ?? ""} за {fmtPrice(item.verkoopprijs ?? listPrice(item))}</>}
        </div>
      </header>

      <div className="detail">
        {isArchived && (
          <div className="arch-banner">
            В архиве
            {item.archivedAt
              ? ` с ${new Date(item.archivedAt).toLocaleDateString("ru-RU")}`
              : ""}{" "}
            — поля доступны только для просмотра.
          </div>
        )}
        <div className="gallery">
          {item.photos.map((p, i) => (
            <div key={p.id} className={`ph ${p.isHoofdfoto ? "main" : ""}`}>
              <img
                src={p.thumbUrl ?? p.url}
                alt=""
                loading="lazy"
                onClick={() => setLbIndex(i)}
              />
            </div>
          ))}
          {!isArchived && (
            <button className="addph" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <span style={{ fontSize: 26 }}>📷</span>
              {uploading ? "Загружаю…" : "Добавить фото"}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>
        {item.photos.length > 0 && (
          <div style={{ fontSize: 12, color: "var(--mute)", marginBottom: 12 }}>
            Тап по фото — на весь экран. Главное обведено золотым.
          </div>
        )}

        <div className="row2">
          {FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <label>{f.label}</label>
              <input
                type={f.type ?? "text"}
                inputMode={f.type === "number" ? "decimal" : undefined}
                defaultValue={String(item[f.key] ?? "")}
                disabled={isArchived}
                onBlur={(e) => saveField(f.key, e.target.value)}
              />
            </div>
          ))}
          <div className="field">
            <label>Состояние</label>
            <select
              defaultValue={item.staat ?? ""}
              disabled={isArchived}
              onChange={(e) => saveField("staat", e.target.value)}
            >
              <option value="">—</option>
              <option value="nieuw">Новый</option>
              <option value="als_nieuw">Как новый</option>
              <option value="gebruikt">Б/у</option>
            </select>
          </div>
          <div className="field">
            <label>Статус</label>
            <select
              value={item.status}
              disabled={isArchived}
              onChange={(e) => {
                if (e.target.value === "verkocht") {
                  setSellOpen(true);
                  setSellPrice("");
                } else if (e.target.value === "voorraad" && isSold) {
                  markReturned();
                } else {
                  patch({ status: e.target.value });
                }
              }}
            >
              <option value="voorraad">В наличии</option>
              <option value="gereserveerd">Резерв</option>
              <option value="verkocht">Продано</option>
            </select>
          </div>
        </div>
        {isSold && (
          <div className="row2">
            <div className="field">
              <label>Цена продажи (факт), €</label>
              <input
                type="number"
                inputMode="decimal"
                defaultValue={item.verkoopprijs ?? ""}
                onBlur={(e) => saveField("verkoopprijs", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Дата продажи</label>
              <input
                type="date"
                defaultValue={item.verkoopdatum ?? ""}
                onBlur={(e) => saveField("verkoopdatum", e.target.value)}
              />
            </div>
          </div>
        )}
        <div className="field">
          <label>Заметки</label>
          <textarea
            rows={3}
            defaultValue={item.notities ?? ""}
            disabled={isArchived}
            onBlur={(e) => saveField("notities", e.target.value)}
          />
        </div>

        <div className="stack">
          {isArchived ? (
            <button className="btn primary" onClick={restore}>
              Восстановить
            </button>
          ) : (
            <>
              {!isSold ? (
                <button
                  className="btn green"
                  onClick={() => {
                    setSellOpen(true);
                    setSellPrice("");
                  }}
                >
                  Продано
                </button>
              ) : (
                <button className="btn ghost" onClick={markReturned}>
                  Вернуть в наличие
                </button>
              )}
              <button className="btn danger" onClick={archive}>
                Архивировать
              </button>
            </>
          )}
        </div>

        {item.shopifyHandle && item.shopifySync && (
          <ShopifyBlock item={item} onImported={load} />
        )}

        <div className="hist">
          <button className="hist-toggle" onClick={() => setHistOpen((v) => !v)}>
            История {histOpen ? "▴" : "▾"}
          </button>
          {histOpen && (
            <div className="hist-list">
              {events === null && <div className="empty">Загружаю…</div>}
              {events?.length === 0 && <div className="empty">Записей пока нет</div>}
              {events?.map((e) => (
                <div key={e.id} className="hist-row">
                  <div className="hist-text">{humanizeEvent(e)}</div>
                  <div className="hist-meta">
                    {relDate(e.createdAt)}
                    {e.actor ? ` · ${e.actor}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {isArchived && (
          <div className="stack" style={{ marginTop: 26 }}>
            <button className="btn danger" onClick={deleteForever}>
              Удалить навсегда
            </button>
          </div>
        )}
      </div>

      {saved && <div className="saved-note">Сохранено ✓</div>}
      <UndoToast toast={toast} onDone={closeToast} />

      {lbIndex !== null && item.photos[lbIndex] && (
        <Lightbox
          photos={item.photos}
          index={lbIndex}
          setIndex={setLbIndex}
          onClose={() => setLbIndex(null)}
          onMakeMain={makeMain}
          onDelete={deletePhoto}
        />
      )}

      {sellOpen && (
        <div className="modal-back" onClick={() => setSellOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Отметить проданным</h3>
            <div className="field">
              <label>Цена продажи, € (можно пропустить)</label>
              <input
                type="number"
                inputMode="decimal"
                placeholder={listPrice(item) ?? "0"}
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                autoFocus
              />
            </div>
            <div className="stack" style={{ marginTop: 8 }}>
              <button
                className="btn green"
                onClick={async () => {
                  await markSold(sellPrice);
                  setSellOpen(false);
                }}
              >
                Подтвердить
              </button>
              <button className="btn ghost" onClick={() => setSellOpen(false)}>
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
