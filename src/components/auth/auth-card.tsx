import type { ReactNode } from "react";

import { Brand } from "@/components/layout/brand";
import { Card, CardBody } from "@/components/ui";

interface AuthCardProps {
  appName: string;
  title: string;
  description?: string;
  children: ReactNode;
  /** Secondary links rendered under the form (e.g. "Forgot password?"). */
  footer?: ReactNode;
}

/**
 * Centered card shell for the auth screens. Presentation only; theme-driven
 * tokens. Provides the page heading as an <h1> so each auth screen has a single,
 * descriptive top-level heading (WCAG 2.4.6 / 1.3.1).
 */
export function AuthCard({ appName, title, description, children, footer }: AuthCardProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Brand appName={appName} />
        </div>
        <Card>
          <CardBody className="flex flex-col gap-5 p-6">
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-2xl text-ink">{title}</h1>
              {description ? (
                <p className="font-body text-[13.5px] text-muted">{description}</p>
              ) : null}
            </div>
            {children}
          </CardBody>
        </Card>
        {footer ? (
          <div className="mt-4 text-center font-body text-[13px] text-muted">{footer}</div>
        ) : null}
      </div>
    </main>
  );
}
