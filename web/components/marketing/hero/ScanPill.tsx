"use client";

import { useRef, useState } from "react";

import { PlaceholderCycler } from "@/components/marketing/hero/PlaceholderCycler";
import { validateInput } from "@/components/marketing/lib/scan";

interface Props {
  busy: boolean;
  error: string | null;
  onSubmit: (input: string) => void;
}

/** The one conversion surface on the page. */
export function ScanPill({ busy, error, onSubmit }: Props) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const message = localError ?? error;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    const problem = validateInput(value);
    setLocalError(problem);
    if (problem) {
      inputRef.current?.focus();
      return;
    }
    onSubmit(value.trim());
  };

  return (
    <div id="scan" className="w-full max-w-3xl scroll-mt-32">
      <form onSubmit={submit} className="w-full">
        <label htmlFor="scan-input" className="sr-only">
          Your company website or a short description of the business
        </label>

        <div
          className={`panel flex items-center gap-2 rounded-full py-3 pl-6 pr-3 transition-[border-color,box-shadow] duration-300 sm:gap-3 sm:py-3.5 sm:pl-8 ${focused ? "" : "pill-breathe"}`}
          style={{
            borderColor: focused ? "rgba(61, 124, 255, 0.4)" : undefined,
            boxShadow: focused ? "0 0 0 1px rgba(61, 124, 255, 0.18), 0 18px 60px -30px rgba(61, 124, 255, 0.5)" : undefined,
          }}
        >
          <div className="relative flex min-w-0 flex-1 items-center">
            {!value && !focused && <PlaceholderCycler paused={busy} />}
            <input
              ref={inputRef}
              id="scan-input"
              name="scan-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              value={value}
              placeholder="Your company website"
              onChange={(event) => {
                setValue(event.target.value);
                if (localError) setLocalError(null);
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              className="scan-input w-full min-w-0 bg-transparent py-3 font-mono text-base text-fg outline-none disabled:opacity-60 sm:text-lg"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="shrink-0 rounded-full px-6 py-3.5 font-mono text-[13px] font-medium uppercase tracking-[0.16em] text-canvas transition-[opacity,transform,box-shadow] duration-200 hover:scale-[1.04] hover:shadow-[0_0_36px_-8px_rgba(61,124,255,0.8)] active:scale-[0.98] disabled:opacity-60 sm:px-8"
            style={{ background: "var(--accent)" }}
          >
            {busy ? "Scanning" : "Scan"}
          </button>
        </div>
      </form>

      <div className="min-h-[1.5rem] px-6 pt-3 sm:px-8">
        {message ? (
          <p role="alert" className="mono-label" style={{ color: "var(--accent)" }}>
            {message}
          </p>
        ) : (
          <p className="mono-label">Paste a URL, or describe the business in a sentence</p>
        )}
      </div>
    </div>
  );
}
