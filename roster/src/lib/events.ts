import { promises as fs } from "fs";
import path from "path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RosterEvent } from "./types";

const LOCAL_PATH = path.join(process.cwd(), "data", "events.json");

function supabaseConfig(): { url: string; key: string } | null {
  const url =
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  if (!url || !key) return null;
  return { url, key };
}

function supabase(): SupabaseClient | null {
  const cfg = supabaseConfig();
  if (!cfg) return null;
  return createClient(cfg.url, cfg.key);
}

async function readLocal(): Promise<RosterEvent[]> {
  try {
    const raw = await fs.readFile(LOCAL_PATH, "utf8");
    return JSON.parse(raw) as RosterEvent[];
  } catch {
    return [];
  }
}

async function writeLocal(events: RosterEvent[]): Promise<void> {
  await fs.mkdir(path.dirname(LOCAL_PATH), { recursive: true });
  await fs.writeFile(LOCAL_PATH, JSON.stringify(events, null, 2) + "\n", "utf8");
}

export async function listEvents(): Promise<RosterEvent[]> {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb
      .from("events")
      .select("*")
      .order("timestamp", { ascending: false });
    if (error) throw new Error(`Supabase listEvents: ${error.message}`);
    return (data ?? []) as RosterEvent[];
  }
  const local = await readLocal();
  return [...local].sort(
    (a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp),
  );
}

export async function insertEvent(event: RosterEvent): Promise<RosterEvent> {
  const sb = supabase();
  if (sb) {
    const { data, error } = await sb.from("events").insert(event).select().single();
    if (error) throw new Error(`Supabase insertEvent: ${error.message}`);
    return data as RosterEvent;
  }
  const events = await readLocal();
  const next = [event, ...events.filter((e) => e.id !== event.id)];
  await writeLocal(next);
  return event;
}

export async function replaceAllEvents(events: RosterEvent[]): Promise<void> {
  const sb = supabase();
  if (sb) {
    const { error: delErr } = await sb.from("events").delete().neq("id", "");
    if (delErr) throw new Error(`Supabase clear: ${delErr.message}`);
    if (events.length) {
      const { error } = await sb.from("events").insert(events);
      if (error) throw new Error(`Supabase seed: ${error.message}`);
    }
    return;
  }
  await writeLocal(events);
}

export function eventsBackend(): "supabase" | "local-json" {
  return supabaseConfig() ? "supabase" : "local-json";
}
