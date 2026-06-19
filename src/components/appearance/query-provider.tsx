"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Scoped TanStack Query provider for the appearance panel — the panel uses
 * mutations (save theme / save branding) and benefits from a small client.
 * Kept LOCAL to this subtree (the rest of the app is RSC + Server Actions), one
 * client per mount.
 */
export function AppearanceQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false },
          mutations: { retry: false },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
