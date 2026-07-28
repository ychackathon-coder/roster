import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth";
import { joinOrg } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (ctx.org) {
    return NextResponse.json(
      { error: "already in a company", redirect: "/dashboard" },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { code?: string; display_name?: string };
  const code = body.code?.trim();
  const displayName = body.display_name?.trim();
  if (!code) return NextResponse.json({ error: "invite code required" }, { status: 400 });
  if (!displayName) return NextResponse.json({ error: "display name required" }, { status: 400 });

  const org = await joinOrg({ userId: ctx.userId, code, displayName: displayName.slice(0, 60) });
  if (!org) return NextResponse.json({ error: "invalid invite code" }, { status: 404 });

  return NextResponse.json({ ok: true, org: { id: org.id, name: org.name } });
}
