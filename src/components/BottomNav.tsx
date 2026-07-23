"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", icon: "▦", label: "Склад" },
  { href: "/locations", icon: "🗂", label: "Локации" },
  { href: "/overview", icon: "◔", label: "Обзор" },
  { href: "/settings", icon: "⚙︎", label: "Настройки" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="bnav">
      {TABS.slice(0, 2).map((t) => (
        <Link key={t.href} href={t.href} className={pathname === t.href ? "on" : ""}>
          <span className="i">{t.icon}</span>
          {t.label}
        </Link>
      ))}
      <Link href="/new" className="plus-wrap" aria-label="Добавить товар">
        <span className="plus">+</span>
      </Link>
      {TABS.slice(2).map((t) => (
        <Link key={t.href} href={t.href} className={pathname === t.href ? "on" : ""}>
          <span className="i">{t.icon}</span>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
