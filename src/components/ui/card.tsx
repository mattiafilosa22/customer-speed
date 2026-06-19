import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type CardProps = HTMLAttributes<HTMLDivElement>;

/**
 * Surface primitive — panel background, hairline border, soft shadow (--sh-sm),
 * themed radius. Presentation only. Use `as`-less; consumers wrap semantics.
 */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded border border-line bg-panel shadow-sm",
        className,
      )}
      {...props}
    />
  );
});

export type CardSectionProps = HTMLAttributes<HTMLDivElement>;

/** Padded content region inside a Card. */
export const CardBody = forwardRef<HTMLDivElement, CardSectionProps>(
  function CardBody({ className, ...props }, ref) {
    return <div ref={ref} className={cn("p-4", className)} {...props} />;
  },
);
