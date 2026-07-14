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
  | "presentation-2"
  | "waiting-decision"
  | "standby"
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

/** Base semantic-hue token per tone (mirrors tokens.css). */
const TONE_TOKEN: Readonly<Record<PillTone, string>> = {
  ok: "--ok",
  warn: "--warn",
  doc: "--doc",
  exec: "--exec",
};

const TONE_STYLE: Readonly<Record<PillTone, { color: string; bg: string }>> = {
  ok: pillVars(TONE_TOKEN.ok),
  warn: pillVars(TONE_TOKEN.warn),
  doc: pillVars(TONE_TOKEN.doc),
  exec: pillVars(TONE_TOKEN.exec),
};

/**
 * Stage/tone pills use the dedicated semantic token as the basis for BOTH the
 * soft tint background and the (darkened) text — entirely theme-driven, no
 * hard-coded hues, recolored per tenant. The text is the same hue darkened
 * toward black by `--pill-ink-darken` so the small mono label clears WCAG AA
 * (≥4.5:1) on the soft tint in light mode; dark mode sets the darken amount to
 * 0% (the light hue already clears AA on its dark tint). See docs/05 §5.6.
 */
const STAGE_STYLE: Readonly<Record<PillStage, { color: string; bg: string }>> = {
  "to-handle": pillVars("--stage-to-handle"),
  taken: pillVars("--stage-taken"),
  "call-scheduled": pillVars("--stage-call-scheduled"),
  "waiting-docs": pillVars("--stage-waiting-docs"),
  presentation: pillVars("--stage-presentation"),
  "presentation-2": pillVars("--stage-presentation-2"),
  "waiting-decision": pillVars("--stage-waiting-decision"),
  standby: pillVars("--stage-standby"),
  "waiting-payment": pillVars("--stage-waiting-payment"),
  won: pillVars("--stage-won"),
  lost: pillVars("--stage-lost"),
};

function pillVars(token: string): { color: string; bg: string } {
  return {
    color: `color-mix(in srgb, var(${token}), black var(--pill-ink-darken))`,
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
  const pillStyle = stage ? STAGE_STYLE[stage] : tone ? TONE_STYLE[tone] : undefined;

  return (
    <span
      ref={ref}
      className={cn(
        "label-mono inline-flex items-center rounded-pill px-2.5 py-0.5",
        "leading-5",
        className,
      )}
      style={
        pillStyle
          ? { color: pillStyle.color, backgroundColor: pillStyle.bg, ...style }
          : style
      }
      {...props}
    />
  );
});
