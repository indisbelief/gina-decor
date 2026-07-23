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
  hoofdfoto?: string | null;
};

export type PhotoDto = {
  id: string;
  itemId: string;
  url: string;
  thumbUrl: string | null;
  volgorde: number;
  isHoofdfoto: boolean;
};

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
