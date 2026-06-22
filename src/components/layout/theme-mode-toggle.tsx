"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { type ResolvedMode, THEME_MODE_COOKIE } from "@/lib/theme";

/** One year, in seconds — the toggle choice persists across sessions. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

/**
 * Light/dark mode toggle (header, top-right). The choice is a USER preference
 * that overrides the tenant's stored mode, so it is always available regardless
 * of white-label config. It:
 *   - flips `data-theme` on the live theming wrapper for an instant, FOUC-free
 *     switch (tokens.css owns the light/dark palette);
 *   - persists to the `cs-theme-mode` cookie so the server renders the same mode
 *     on the next request (the (app) layout reads it).
 * Accessible: a real <button> with an `aria-pressed` state and a localized label
 * that names the action; the icon is decorative.
 */
export function ThemeModeToggle({ initialMode }: { initialMode: ResolvedMode }) {
  const t = useTranslations("theme");
  const [mode, setMode] = useState<ResolvedMode>(initialMode);

  function toggle() {
    const next: ResolvedMode = mode === "dark" ? "light" : "dark";
    setMode(next);
    document.cookie = `${THEME_MODE_COOKIE}=${next};path=/;max-age=${COOKIE_MAX_AGE};samesite=lax`;
    // Flip the outermost theming wrapper (first [data-theme] in document order).
    document.querySelector("[data-theme]")?.setAttribute("data-theme", next);
  }

  const isDark = mode === "dark";
  const label = isDark ? t("switchToLight") : t("switchToDark");

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isDark}
      aria-label={label}
      title={label}
      className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-control border border-line text-ink transition-colors hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
