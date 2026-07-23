import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, expectedToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password, name } = await req.json();
  if (!process.env.APP_PASSWORD || password !== process.env.APP_PASSWORD) {
    return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  const cookieOpts = {
    secure: true,
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  };
  res.cookies.set(COOKIE_NAME, await expectedToken(), { ...cookieOpts, httpOnly: true });
  if (typeof name === "string" && name.trim()) {
    // Имя для истории изменений — кто именно нажал «продано».
    res.cookies.set("gd_user", encodeURIComponent(name.trim().slice(0, 60)), cookieOpts);
  }
  return res;
}
