import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth";
import { createRunner, orgRunners } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireOrg();
  if ("error" in auth) return auth.error;
  return NextResponse.json({ runners: await orgRunners(auth.ctx.org.id) });
}

/** Mint a runner token. Shown ONCE — only its hash is stored. */
export async function POST(req: Request) {
  const auth = await requireOrg();
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "runner").trim().slice(0, 60) || "runner";

  const { runner, token } = await createRunner({ orgId: auth.ctx.org.id, name });
  return NextResponse.json({
    runner: { id: runner.id, name: runner.name },
    token,
    note: "Save this token now — it is not shown again.",
  });
}
