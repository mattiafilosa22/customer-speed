import { forwardRef, type LabelHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type LabelProps = LabelHTMLAttributes<HTMLLabelElement>;

/**
 * Form label — mono uppercase per docs/05 §5.2, but it is a real <label> with
 * `htmlFor` association (style is not the only signal). Required: callers pass
 * `htmlFor` matching the control id.
 */
export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, ...props },
  ref,
) {
  return (
    <label ref={ref} className={cn("label-mono text-muted block", className)} {...props} />
  );
});
