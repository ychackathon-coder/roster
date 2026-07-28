/**
 * Smoke checks for the three UI surfaces: the marketing landing, the /login
 * auth card, and the middleware gate in front of /dashboard, /onboarding and
 * /join. No test signs in — this environment has no credentials — so every
 * assertion here must hold for an anonymous visitor.
 */
import { expect, test } from "@playwright/test";

// The landing hides everything behind a ~2s glyph loader on first visit, and
// /login SSRs an empty Suspense shell that only fills in after hydration;
// both need more headroom than the default expect timeout.
const HYDRATE = { timeout: 15_000 } as const;

test("landing loads with hero heading and a Sign in link", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(HYDRATE);

  // PillNav's trailing pill is the only link named "Sign in" on the landing
  // (the ActHandoff CTA to /login is named "Start onboarding").
  const signIn = page.getByRole("link", { name: "Sign in" });
  await expect(signIn).toBeVisible(HYDRATE);
  await expect(signIn).toHaveAttribute("href", "/login");
});

test("/login hydrates the auth card", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByLabel("Email")).toBeVisible(HYDRATE);
  await expect(page.getByLabel("Password")).toBeVisible(HYDRATE);
  // Both buttons render disabled until the fields are filled; visibility is
  // the hydration signal, enablement is not.
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
});

// The middleware sends anonymous visitors to /login and records where they
// were headed in ?next= so the auth card can return them after sign-in.
for (const path of ["/dashboard", "/onboarding", "/join"]) {
  test(`unauthenticated ${path} redirects to /login with next param`, async ({ page }) => {
    await page.goto(path);

    await expect(page).toHaveURL(
      (url) => url.pathname === "/login" && url.searchParams.get("next") === path,
      HYDRATE,
    );
  });
}

test("landing load emits no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // A missing favicon logs a resource 404; that is noise, not breakage.
    const source = msg.location().url ?? "";
    if (source.includes("favicon") || msg.text().includes("favicon")) return;
    errors.push(`${source} ${msg.text()}`.trim());
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(HYDRATE);
  // Let the loader resolve and the canvas/GSAP stack run its first frames;
  // runtime errors from the animation layer surface in this window.
  await page.waitForTimeout(3_000);

  expect(errors).toEqual([]);
});
