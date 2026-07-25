import { NextResponse } from "next/server";
import { loadActiveProfile } from "@/lib/session-store";

export const runtime = "nodejs";

export async function GET() {
  const profile = await loadActiveProfile();
  return NextResponse.json({ profile });
}
