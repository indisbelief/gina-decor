"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, type ItemDto } from "@/lib/client";

export default function NewItemPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    merk: "",
    model: "",
    soort: "",
    aantalDelen: "",
    locatie: "",
    vraagprijs: "",
    inkoopprijs: "",
  });

  function set(key: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const created = await api<ItemDto>("/api/items", {
        method: "POST",
        body: JSON.stringify(form),
      });
      // сразу на карточку — там кнопка «Добавить фото»
      router.push(`/item/${created.id}?new=1`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <header className="app">
        <Link href="/" className="back">
          ← Склад
        </Link>
        <div className="serif" style={{ fontSize: 20, fontWeight: 700, marginTop: 6 }}>
          Новый товар
        </div>
      </header>
      <form className="detail" onSubmit={submit}>
        <div className="field">
          <label>Бренд *</label>
          <input value={form.merk} onChange={set("merk")} autoFocus placeholder="Например: Limoges" />
        </div>
        <div className="field">
          <label>Модель / коллекция</label>
          <input value={form.model} onChange={set("model")} />
        </div>
        <div className="row2">
          <div className="field">
            <label>Тип</label>
            <input value={form.soort} onChange={set("soort")} placeholder="Сервиз, ваза…" />
          </div>
          <div className="field">
            <label>Частей</label>
            <input type="number" inputMode="numeric" value={form.aantalDelen} onChange={set("aantalDelen")} />
          </div>
        </div>
        <div className="row2">
          <div className="field">
            <label>Место</label>
            <input value={form.locatie} onChange={set("locatie")} placeholder="Section 1…" />
          </div>
          <div className="field">
            <label>Цена, €</label>
            <input type="number" inputMode="decimal" value={form.vraagprijs} onChange={set("vraagprijs")} />
          </div>
        </div>
        <div className="field">
          <label>Цена закупки, € (необязательно)</label>
          <input type="number" inputMode="decimal" value={form.inkoopprijs} onChange={set("inkoopprijs")} />
        </div>
        {error && <div className="err">{error}</div>}
        <div className="stack">
          <button className="btn primary" disabled={busy || !form.merk.trim()}>
            {busy ? "Создаю…" : "Создать → добавить фото"}
          </button>
          <Link href="/" className="btn ghost">
            Отмена
          </Link>
        </div>
        <p style={{ marginTop: 14, fontSize: 12.5, color: "var(--mute)" }}>
          Обязателен только бренд — остальное можно дозаполнить позже в карточке.
        </p>
      </form>
    </>
  );
}
