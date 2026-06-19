"use client";

import { useState, useTransition } from "react";

import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui";

/**
 * Disconnect control for a connected calendar provider (Fase 6). POSTs to the
 * provider's disconnect Route Handler (same-origin → cookies carry the session;
 * the handler re-enforces auth → RBAC → feature flag) and refreshes the page so
 * the status updates. No tokens are involved client-side.
 */
export function DisconnectButton({
  endpoint,
  label,
  providerName,
}: {
  endpoint: string;
  label: string;
  providerName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function handleClick() {
    setError(false);
    startTransition(async () => {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          setError(true);
          return;
        }
        router.refresh();
      } catch {
        setError(true);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClick}
        disabled={pending}
        aria-label={`${label} ${providerName}`}
      >
        {label}
      </Button>
      {error ? (
        <span role="alert" className="font-body text-[11px] text-danger-ink">
          {label}
        </span>
      ) : null}
    </div>
  );
}
