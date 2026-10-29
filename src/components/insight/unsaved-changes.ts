"use client";

import { useEffect } from "react";

/**
 * Page-wide "unsaved changes" guard shared by every day draft on the page.
 *
 * - `unsaved`: edits not yet persisted (debounce pending or save in flight).
 *   Only a full unload (tab close, reload, external link) can lose them — an
 *   in-app navigation unmounts the draft, which flushes the save — so they arm
 *   the browser's native `beforeunload` prompt only.
 * - `failed`: the last save was rejected, so the edits will NOT persist on
 *   their own. Those also confirm in-app link clicks before leaving.
 *
 * One registry + one pair of listeners for the whole page, so N dirty days
 * still produce a single prompt.
 */
export type UnsavedState = "clean" | "unsaved" | "failed";

const entries = new Map<symbol, Exclude<UnsavedState, "clean">>();
let confirmMessage = "";

function onBeforeUnload(event: BeforeUnloadEvent) {
  event.preventDefault();
  // Legacy browsers only show the prompt when returnValue is set.
  event.returnValue = "";
}

function onClickCapture(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (![...entries.values()].includes("failed")) return;
  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement) || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
  if (window.confirm(confirmMessage)) return;
  // Next's <Link> skips client navigation when the event is already prevented.
  event.preventDefault();
  event.stopPropagation();
}

function register(key: symbol, state: Exclude<UnsavedState, "clean">) {
  if (entries.size === 0) {
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
  }
  entries.set(key, state);
}

function unregister(key: symbol) {
  entries.delete(key);
  if (entries.size === 0) {
    window.removeEventListener("beforeunload", onBeforeUnload);
    document.removeEventListener("click", onClickCapture, true);
  }
}

export function useUnsavedChangesGuard(state: UnsavedState, message: string) {
  useEffect(() => {
    if (state === "clean") return;
    confirmMessage = message;
    const key = Symbol("insight-draft");
    register(key, state);
    return () => unregister(key);
  }, [state, message]);
}
