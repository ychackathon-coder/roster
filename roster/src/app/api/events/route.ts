import { NextResponse } from "next/server";
import { eventsBackend, insertEvent, listEvents } from "@/lib/events";
import type { RosterEvent } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const events = await listEvents();
    return NextResponse.json({ backend: eventsBackend(), events });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as RosterEvent;
    if (!body.id || !body.request || !body.terminal_line) {
      return NextResponse.json({ error: "Invalid event payload" }, { status: 400 });
    }
    const saved = await insertEvent(body);
    return NextResponse.json({ event: saved });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
