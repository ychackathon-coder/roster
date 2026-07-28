/**
 * Request authentication for API routes.
 *
 * Two principals exist:
 *   - USERS: Supabase session cookie -> user id -> org membership (lib/db).
 *   - RUNNERS: Authorization: Bearer rt_... -> runners table by token hash.
 * Every data query downstream is scoped by the org id resolved HERE, never by
 * anything the client sent in a body.
 */
import { NextResponse } from "next/server";
import { supabaseServer } from "./supabase/server";
import { orgForUser, runnerByToken, touchRunner } from "./db";
import type { Org, Runner } from "./contracts";

export type UserContext = {
  userId: string;
  email: string | null;
  org: (Org & { role: string; display_name: string }) | null;
};

export async function getUserContext(): Promise<UserContext | null> {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const org = await orgForUser(data.user.id);
  return { userId: data.user.id, email: data.user.email ?? null, org };
}

/** 401 when not signed in; 409 when signed in but org-less (must onboard). */
export async function requireOrg(): Promise<
  { ctx: UserContext & { org: NonNullable<UserContext["org"]> } } | { error: NextResponse }
> {
  const ctx = await getUserContext();
  if (!ctx) {
    return { error: NextResponse.json({ error: "not signed in" }, { status: 401 }) };
  }
  if (!ctx.org) {
    return {
      error: NextResponse.json(
        { error: "no company yet", redirect: "/onboarding" },
        { status: 409 },
      ),
    };
  }
  return { ctx: ctx as UserContext & { org: NonNullable<UserContext["org"]> } };
}

export async function requireRunner(
  req: Request,
): Promise<{ runner: Runner } | { error: NextResponse }> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  const runner = token ? await runnerByToken(token) : null;
  if (!runner) {
    return { error: NextResponse.json({ error: "invalid runner token" }, { status: 401 }) };
  }
  await touchRunner(runner.id);
  return { runner };
}
