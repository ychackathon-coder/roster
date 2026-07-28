import { NextResponse } from "next/server";
import { getUserContext } from "@/lib/auth";
import { createOrg } from "@/lib/db";

export const runtime = "nodejs";

/** Who am I, and what company am I in? Drives client-side routing. */
export async function GET() {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  return NextResponse.json({
    user: { id: ctx.userId, email: ctx.email },
    org: ctx.org
      ? { id: ctx.org.id, name: ctx.org.name, invite_code: ctx.org.invite_code, role: ctx.org.role }
      : null,
  });
}

/** Create a company. The creator becomes owner; v1 allows one org per user. */
export async function POST(req: Request) {
  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  if (ctx.org) {
    return NextResponse.json(
      { error: "already in a company", redirect: "/dashboard" },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { name?: string; display_name?: string };
  const name = body.name?.trim();
  if (!name || name.length < 2 || name.length > 60) {
    return NextResponse.json({ error: "company name must be 2-60 characters" }, { status: 400 });
  }
  const displayName = (body.display_name ?? ctx.email ?? "owner").trim().slice(0, 60);

  const org = await createOrg({ userId: ctx.userId, name, displayName });
  return NextResponse.json({
    org: { id: org.id, name: org.name, invite_code: org.invite_code },
  });
}
