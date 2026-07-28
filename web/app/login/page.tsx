"use client";

/**
 * Sign in / sign up with Supabase Auth. After auth the middleware lets the user
 * into /dashboard, which routes org-less users to /onboarding.
 *
 * If the Supabase project requires email confirmation, signUp returns no
 * session — we say so instead of silently failing.
 */
import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import "./login.css";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const next = params.get("next") ?? "/dashboard";
  const supabase = supabaseBrowser();

  const finish = () => {
    // Full navigation, not router.push: the server must see the new cookies.
    window.location.assign(next);
  };

  const signIn = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    finish();
  };

  const signUp = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setBusy(false);
    if (error) return setError(error.message);
    if (!data.session) {
      setNote("Account created — check your email to confirm, then sign in.");
      return;
    }
    finish();
  };

  return (
    <main className="auth-root">
      <form className="auth-card" onSubmit={signIn}>
        <h1>Roster</h1>
        <p className="sub">Sign in to your AI workforce, or create an account.</p>

        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <input
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="at least 8 characters"
          />
        </label>

        {error && <p className="auth-error">{error}</p>}
        {note && <p className="auth-note">{note}</p>}

        <div className="auth-actions">
          <button className="auth-primary" type="submit" disabled={busy || !email || password.length < 8}>
            {busy ? "Working…" : "Sign in"}
          </button>
          <button className="auth-secondary" type="button" disabled={busy || !email || password.length < 8} onClick={signUp}>
            Create account
          </button>
        </div>

        <p className="auth-foot">
          Joining a team? Sign up first, then use your invite code at <a href="/join">/join</a>.
        </p>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
