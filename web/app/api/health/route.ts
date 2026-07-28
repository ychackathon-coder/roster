import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export async function GET() {
  try {
    await pool().query("select 1");
    return NextResponse.json({ ok: true, db: "up" });
  } catch (err) {
    return NextResponse.json({ ok: false, db: String((err as Error).message) }, { status: 503 });
  }
}
