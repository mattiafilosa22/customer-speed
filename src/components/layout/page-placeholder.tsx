import type { ReactNode } from "react";

import { Card, CardBody } from "@/components/ui";

interface PagePlaceholderProps {
  title: string;
  description: ReactNode;
}

/**
 * Minimal placeholder page used by the Fase 0 routes so navigation works
 * end-to-end before real features land. Demonstrates the primitives and the
 * heading hierarchy (single <h1> per page). Replaced per feature in later
 * phases.
 */
export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <div className="mx-auto flex max-w-[1180px] flex-col gap-4">
      <h1>{title}</h1>
      <Card>
        <CardBody>
          <p className="text-muted">{description}</p>
        </CardBody>
      </Card>
    </div>
  );
}
