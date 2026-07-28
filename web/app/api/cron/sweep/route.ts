import { NextResponse } from "next/server";
import { sweepStuckTasks } from "@/lib/sweep";

export const runtime = "nodejs";

/**
 * Scheduled global sweep (vercel.json crons). Vercel sends
 * Authorization: Bearer <CRON_SECRET> when the env var is set; anything else
 * is rejected so outsiders cannot drive write load through this route.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const result = await sweepStuckTasks();
  return NextResponse.json({ ok: true, ...result });
}
