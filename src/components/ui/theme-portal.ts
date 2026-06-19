"use client";

import { useSyncExternalStore } from "react";

/**
 * Resolves the element that carries the active theme scope (`[data-theme]`,
 * set by ThemeProvider) so Radix overlays can portal INTO it.
 *
 * Why: the dark/light palette lives on the `[data-theme]` wrapper (tokens.css
 * keys `[data-theme="dark"]` off it). Radix `Portal` defaults to `document.body`
 * — OUTSIDE that wrapper — so a portaled dropdown/dialog would resolve the
 * light `:root` tokens even in dark mode (white panel on a dark app). Pointing
 * the Portal `container` at the theme wrapper keeps overlays correctly themed in
 * BOTH modes.
 *
 * Implemented with `useSyncExternalStore` (not setState-in-effect): the server
 * snapshot is `undefined` (no DOM → Radix falls back to its default body portal,
 * matching the SSR HTML), and the client snapshot resolves the wrapper after
 * hydration. The wrapper element is stable for the app's lifetime, so a no-op
 * subscription is correct.
 */
const EMPTY_SUBSCRIBE = (): (() => void) => () => {};

function getClientContainer(): HTMLElement | undefined {
  return document.querySelector<HTMLElement>("[data-theme]") ?? undefined;
}

function getServerContainer(): undefined {
  return undefined;
}

export function useThemeContainer(): HTMLElement | undefined {
  return useSyncExternalStore(EMPTY_SUBSCRIBE, getClientContainer, getServerContainer);
}
