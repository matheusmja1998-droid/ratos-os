export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { sb } from "@/lib/db";

// zera o contador diario de disparos das instancias (roda 00h05 BRT)
export async function GET(req: Request) {
  const secret = new URL(req.url).searchParams.get("secret");
  const auth = req.headers.get("authorization") || "";
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET && !auth.includes(process.env.CRON_SECRET))
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  await sb.from("instancias").update({ disparos_hoje: 0 }).neq("id", "00000000-0000-0000-0000-000000000000");
  return NextResponse.json({ ok: true });
}
