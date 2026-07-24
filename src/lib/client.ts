export type ItemDto = {
  id: string;
  sku: string;
  merk: string;
  model: string | null;
  soort: string | null;
  aantalDelen: number | null;
  staat: "nieuw" | "als_nieuw" | "gebruikt" | null;
  locatie: string | null;
  inkoopprijs: string | null;
  vraagprijs: string | null;
  verkoopprijs: string | null;
  inkoopdatum: string | null;
  verkoopdatum: string | null;
  leverancier: string | null;
  status: "voorraad" | "verkocht" | "gereserveerd";
  notities: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  shopifyHandle: string | null;
  shopifySync: ShopifySync | null;
  hoofdfoto?: string | null;
};

export type ShopifySync = {
  title: string;
  price: number | null;
  status: string;
  images: string[];
  syncedAt: string;
};

export type PhotoDto = {
  id: string;
  itemId: string;
  url: string;
  thumbUrl: string | null;
  sourceUrl: string | null;
  volgorde: number;
  isHoofdfoto: boolean;
};

export type EventDto = {
  id: string;
  itemId: string;
  type: string;
  actor: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  sku?: string;
  merk?: string;
  model?: string;
  locatie?: string | null;
};

const FIELD_LABEL: Record<string, string> = {
  merk: "бренд",
  model: "модель",
  soort: "тип",
  aantalDelen: "кол-во частей",
  staat: "состояние",
  locatie: "место",
  inkoopprijs: "цена закупки",
  vraagprijs: "цена (запрос)",
  verkoopprijs: "цена продажи",
  inkoopdatum: "дата закупки",
  verkoopdatum: "дата продажи",
  leverancier: "поставщик",
  notities: "заметки",
};

export function humanizeEvent(e: EventDto): string {
  const d = (e.details ?? {}) as Record<string, unknown>;
  switch (e.type) {
    case "created":
      return "создан";
    case "sold":
      return d.price ? `отмечен проданным за ${fmtPrice(String(d.price))}` : "отмечен проданным";
    case "returned":
      return "возвращён в наличие";
    case "reserved":
      return "поставлен в резерв";
    case "status_changed":
      return "статус изменён";
    case "price_changed": {
      const label = FIELD_LABEL[String(d.field)] ?? "цена";
      const to = d.to ? fmtPrice(String(d.to)) : "—";
      return `${label}: ${d.from ? fmtPrice(String(d.from)) : "—"} → ${to}`;
    }
    case "shopify_linked":
      return `связан с товаром Shopify (${d.handle ?? "?"})`;
    case "sold_shopify":
      return `продан (импорт Shopify, заказ ${d.order ?? "?"}${d.price ? " за " + fmtPrice(String(d.price)) : ""})`;
    case "photo_added":
      return "фото добавлено";
    case "photo_deleted":
      return "фото удалено";
    case "archived":
      return "убран в архив";
    case "unarchived":
      return "возвращён из архива";
    case "updated": {
      const fields = Array.isArray(d.fields) ? d.fields : [];
      return `изменено: ${fields.map((f) => FIELD_LABEL[String(f)] ?? f).join(", ")}`;
    }
    default:
      return e.type;
  }
}

export function relDate(iso: string): string {
  const then = new Date(iso);
  const today = new Date();
  const days = Math.floor(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime() -
      new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime()) /
      86400000,
  );
  const time = then.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return `сегодня ${time}`;
  if (days === 1) return `вчера ${time}`;
  if (days < 7) return `${days} дн. назад`;
  return then.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

// Передача undo-тоста между экранами (например, архив в карточке → тост в списке).
let pendingUndo: { label: string; undo: () => Promise<void> | void } | null = null;
export function setPendingUndo(p: typeof pendingUndo) {
  pendingUndo = p;
}
export function takePendingUndo() {
  const p = pendingUndo;
  pendingUndo = null;
  return p;
}

export const STAAT_LABEL: Record<string, string> = {
  nieuw: "Новый",
  als_nieuw: "Как новый",
  gebruikt: "Б/у",
};

export function fmtPrice(v: string | null | undefined): string {
  if (v == null || v === "") return "—";
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return "—";
  return "€" + n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }).replace(",00", "");
}

export function listPrice(it: ItemDto): string | null {
  return it.status === "verkocht" ? (it.verkoopprijs ?? it.vraagprijs ?? it.inkoopprijs) : (it.vraagprijs ?? it.inkoopprijs);
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData ? init?.headers : { "Content-Type": "application/json", ...init?.headers },
  });
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Ошибка ${res.status}`);
  }
  return res.json();
}

/** Сжатие фото на клиенте: максимум 1600px по длинной стороне, jpeg q=0.6. */
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Не удалось сжать фото"))),
      "image/jpeg",
      0.6,
    ),
  );
}
