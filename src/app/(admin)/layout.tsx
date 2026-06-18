import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getSessionUser } from "@/server/auth/guards";

import "@/styles/globals.css";

/**
 * Cross-tenant admin area shell. It lives OUTSIDE `[locale]` (not localized) and
 * is reserved for the `superAdmin` operator (docs/01, docs/02 §2.1).
 *
 * Because the root layout is a transparent pass-through (the localized layout
 * owns `<html>`/`<body>` for the app), this non-localized branch provides its
 * own document shell. UI copy here is fixed Italian (the admin operator is the
 * Italian-speaking reseller); a full i18n admin is out of scope for Fase 1.
 *
 * Authoritative server-side guard:
 *  - no session → /login,
 *  - authenticated but NOT superAdmin → /dashboard (least-revealing safe default;
 *    avoids leaking the admin area's existence to ordinary users).
 *
 * The admin context is the explicit, audited cross-tenant context; every admin
 * write must be recorded (handled by the use cases in later phases).
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  if (user.role !== "superAdmin") {
    redirect("/dashboard");
  }

  return (
    <html lang="it">
      <body>
        <div className="min-h-screen bg-bg p-6">
          <div className="mx-auto max-w-5xl">{children}</div>
        </div>
      </body>
    </html>
  );
}
