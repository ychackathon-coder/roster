import { NextResponse, type NextRequest } from "next/server";

/**
 * CORS for /api/*.
 *
 * The dashboard (hackathon-ui) is a different origin in development — roster on
 * 3456, the dashboard on 3000 or 3001 — so its fetches to /api/profile,
 * /api/events, and /api/hq are cross-origin and the browser blocks them without
 * these headers. The symptom is "roster unreachable" in the dashboard console,
 * which sends you debugging the wrong service entirely.
 *
 * Done in middleware rather than next.config headers because
 * Access-Control-Allow-Origin accepts exactly one value, and we do not know in
 * advance whether the dashboard came up on 3000 or 3001. So the request's Origin
 * is echoed back when it is allow-listed.
 *
 * Add deployed origins with DASHBOARD_ORIGINS (comma-separated). Once both apps
 * are served from one domain this becomes inert — same-origin needs no CORS.
 */
const DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3001",
];

const ALLOWED = new Set([
  ...DEV_ORIGINS,
  ...(process.env.DASHBOARD_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean),
]);

function applyCors(res: NextResponse, origin: string | null): NextResponse {
  if (origin && ALLOWED.has(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    // Without Vary, a cache can serve one origin's header to another origin.
    res.headers.set("Vary", "Origin");
    res.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type");
    res.headers.set("Access-Control-Max-Age", "86400");
  }
  return res;
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");

  // Preflight must not reach the route handler.
  if (req.method === "OPTIONS") {
    return applyCors(new NextResponse(null, { status: 204 }), origin);
  }

  return applyCors(NextResponse.next(), origin);
}

export const config = {
  matcher: "/api/:path*",
};
