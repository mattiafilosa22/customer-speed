"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Scoped TanStack Query provider for the pipeline board (docs/02 §2.3 — the
 * kanban needs optimistic stage moves with rollback). Kept LOCAL to the board
 * subtree rather than app-wide: the rest of the app is RSC + Server Actions and
 * does not need a client cache, so we avoid a global provider and its hydration
 * cost. One client instance per mount (lazy `useState` initializer).
 */
export function PipelineQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Mutations only here; no background refetch noise on the board.
          queries: { retry: false, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
