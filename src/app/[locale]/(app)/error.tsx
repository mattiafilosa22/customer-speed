"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { Button, Card, CardBody } from "@/components/ui";

/**
 * Error boundary for the authenticated app segment. Without it a runtime error
 * in ANY (app) page unmounts to a blank screen (the symptom seen after deleting
 * a lead). Here it degrades to a recoverable, localized message with a retry,
 * inside the app shell. The message stays generic (no leak of internals).
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errorBoundary");

  useEffect(() => {
    // Surface for observability (Vercel runtime logs); the UI stays generic.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[640px]">
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="font-display text-xl text-ink">{t("title")}</p>
          <p className="text-muted">{t("description")}</p>
          <Button onClick={reset} className="mt-2 w-auto">
            {t("retry")}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
