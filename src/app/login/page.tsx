"use client";

import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, name }),
    });
    if (res.ok) {
      window.location.href = "/";
    } else {
      setError("Неверный пароль");
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Gina Decor</h1>
        <p>Введите общий пароль, чтобы открыть склад</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль"
          autoFocus
        />
        <div style={{ marginTop: 10 }}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ваше имя (для истории изменений)"
            autoComplete="name"
          />
        </div>
        {error && <div className="err">{error}</div>}
        <div style={{ marginTop: 14 }}>
          <button className="btn primary" disabled={busy || !password}>
            {busy ? "Проверяю…" : "Войти"}
          </button>
        </div>
      </form>
    </div>
  );
}
