"use client";

import { use, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, compressImage, listPrice, fmtPrice, type ItemDto, type PhotoDto } from "@/lib/client";

type FullItem = ItemDto & { photos: PhotoDto[] };

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
  const fileRef = useRef<HTMLInputElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function load() {
    setItem(await api<FullItem>(`/api/items/${id}`));
  }

  useEffect(() => {
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
    flashSaved();
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
    load();
  }

  async function makeMain(p: PhotoDto) {
    await api(`/api/photos/${p.id}`, { method: "PATCH" });
    load();
  }

  async function archive() {
    if (!confirm("Убрать товар в архив? Он исчезнет из списка, но данные сохранятся.")) return;
    await patch({ archived: true });
    router.push("/");
  }

  if (!item) return <div className="empty">Загружаю…</div>;

  const isSold = item.status === "verkocht";

  return (
    <>
      <header className="app">
        <Link href="/" className="back">
          ← Склад
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
        <div className="gallery">
          {item.photos.map((p) => (
            <div key={p.id} className={`ph ${p.isHoofdfoto ? "main" : ""}`}>
              <img src={p.url} alt="" onClick={() => makeMain(p)} />
              <button className="del" onClick={() => deletePhoto(p)} aria-label="Удалить фото">
                ✕
              </button>
            </div>
          ))}
          <button className="addph" onClick={() => fileRef.current?.click()} disabled={uploading}>
            <span style={{ fontSize: 26 }}>📷</span>
            {uploading ? "Загружаю…" : "Добавить фото"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>
        {item.photos.length > 1 && (
          <div style={{ fontSize: 12, color: "var(--mute)", marginBottom: 12 }}>
            Тап по фото — сделать его главным (обведено золотым).
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
                onBlur={(e) => saveField(f.key, e.target.value)}
              />
            </div>
          ))}
          <div className="field">
            <label>Состояние</label>
            <select defaultValue={item.staat ?? ""} onChange={(e) => saveField("staat", e.target.value)}>
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
              onChange={(e) => {
                if (e.target.value === "verkocht") {
                  setSellOpen(true);
                  setSellPrice("");
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
            onBlur={(e) => saveField("notities", e.target.value)}
          />
        </div>

        <div className="stack">
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
            <button className="btn ghost" onClick={() => patch({ status: "voorraad" })}>
              Вернуть в наличие
            </button>
          )}
          <button className="btn danger" onClick={archive}>
            Архивировать
          </button>
        </div>
      </div>

      {saved && <div className="saved-note">Сохранено ✓</div>}

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
                  const body: Record<string, unknown> = { status: "verkocht" };
                  if (sellPrice.trim()) body.verkoopprijs = sellPrice;
                  await patch(body);
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
