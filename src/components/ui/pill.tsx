import { forwardRef, type HTMLAttributes } from "react";

import { cn } from "@/lib/cn";

/** Semantic tones — soft background + full-color text (docs/05 §5.3). */
export type PillTone = "ok" | "warn" | "doc" | "exec";

/** Pipeline stage keys — mirror the LeadStage enum / stage CSS tokens. */
export type PillStage =
  | "to-handle"
  | "taken"
  | "call-scheduled"
  | "waiting-docs"
  | "presentation"
  | "waiting-decision"
  | "waiting-payment"
  | "won"
  | "lost";

type BasePillProps = HTMLAttributes<HTMLSpanElement>;

interface SemanticPillProps extends BasePillProps {
  tone: PillTone;
  stage?: never;
}

interface StagePillProps extends BasePillProps {
  stage: PillStage;
  tone?: never;
}

export type PillProps = SemanticPillProps | StagePillProps;

const TONE_CLASSES: Readonly<Record<PillTone, string>> = {
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  doc: "bg-doc-soft text-doc",
  exec: "bg-exec-soft text-exec",
};

/**
 * Stage pills use the dedicated --stage-* token as the text color and a
 * color-mix soft tint of the same token as background — entirely theme-driven,
 * no hard-coded hues, and recolored per tenant.
 */
const STAGE_STYLE: Readonly<Record<PillStage, { color: string; bg: string }>> = {
  "to-handle": stageVars("--stage-to-handle"),
  taken: stageVars("--stage-taken"),
  "call-scheduled": stageVars("--stage-call-scheduled"),
  "waiting-docs": stageVars("--stage-waiting-docs"),
  presentation: stageVars("--stage-presentation"),
  "waiting-decision": stageVars("--stage-waiting-decision"),
  "waiting-payment": stageVars("--stage-waiting-payment"),
  won: stageVars("--stage-won"),
  lost: stageVars("--stage-lost"),
};

function stageVars(token: string): { color: string; bg: string } {
  return {
    color: `var(${token})`,
    bg: `color-mix(in srgb, var(${token}) 12%, var(--panel))`,
  };
}

/**
 * Status pill. Either a semantic `tone` or a pipeline `stage` (mutually
 * exclusive by type). Mono uppercase per docs/05; presentation only.
 */
export const Pill = forwardRef<HTMLSpanElement, PillProps>(function Pill(
  { className, tone, stage, style, ...props },
  ref,
) {
  const stageStyle = stage ? STAGE_STYLE[stage] : undefined;

  return (
    <span
      ref={ref}
      className={cn(
        "label-mono inline-flex items-center rounded-pill px-2.5 py-0.5",
        "leading-5",
        tone ? TONE_CLASSES[tone] : undefined,
        className,
      )}
      style={
        stageStyle
          ? { color: stageStyle.color, backgroundColor: stageStyle.bg, ...style }
          : style
      }
      {...props}
    />
  );
});
