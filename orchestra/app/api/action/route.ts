import { NextResponse } from "next/server";

/**
 * In-memory action feed for the team engine. Localhost demo only: survives
 * hot reloads via globalThis, dies with the process, no persistence wanted.
 *
 *   POST /api/action  { "who": "Ava", "what": "shipped dark mode" }
 *   GET  /api/action?since=<id>  ->  { actions, cursor }
 */
type TeamAction = { id: number; who: string; what: string; at: number };
type Store = { list: TeamAction[]; next: number };

const g = globalThis as unknown as { __teamActions?: Store };
const store: Store = (g.__teamActions ??= { list: [], next: 1 });

export async function GET(req: Request) {
  const since = Number(new URL(req.url).searchParams.get("since") ?? 0) || 0;
  return NextResponse.json({
    actions: store.list.filter((a) => a.id > since),
    cursor: store.next - 1,
  });
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // plain-text or empty bodies still register as an anonymous action
  }
  const who = String(body.who ?? body.name ?? "someone").slice(0, 40);
  const what = String(body.what ?? body.action ?? "did something").slice(0, 140);
  const action: TeamAction = { id: store.next++, who, what, at: Date.now() };
  store.list.push(action);
  if (store.list.length > 500) store.list.splice(0, store.list.length - 500);
  return NextResponse.json({ ok: true, id: action.id });
}
