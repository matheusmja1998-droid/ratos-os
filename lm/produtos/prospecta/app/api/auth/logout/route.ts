import { NextResponse } from "next/server";
import { COOKIE_NOME } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NOME, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
