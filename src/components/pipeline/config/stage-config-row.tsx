"use client";

import { useTranslations } from "next-intl";

import type { LeadStage } from "@/generated/prisma/enums";
import type { PipelineStageConfigItem } from "@/server/pipeline";
import { DEFAULT_STAGE_TOKENS, STAGE_COLOR_CHOICES } from "@/components/pipeline/stage-tokens";

/**
 * One stage row in the configuration panel (docs/02 §2.3).
 *
 * Controls (all keyboard-operable, labelled):
 *  - up/down reorder buttons (accessible alternative to drag — docs/05 §5.6),
 *  - a `role="switch"` visibility toggle (terminal stages are disabled: they
 *    cannot be hidden — the server enforces it too),
 *  - a colour swatch group (radio semantics) to override the stage token.
 *
 * The lead count is shown so the user understands why hiding may be blocked.
 */
export function StageConfigRow({
  item,
  label,
  index,
  total,
  isFirst,
  isLast,
  onToggleVisibility,
  onMove,
  onSetColor,
}: {
  item: PipelineStageConfigItem;
  label: string;
  index: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  onToggleVisibility: (stage: LeadStage, isVisible: boolean) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onSetColor: (stage: LeadStage, colorToken: string | null) => void;
}) {
  const t = useTranslations("pipelineConfig");
  const effectiveToken = item.colorToken ?? DEFAULT_STAGE_TOKENS[item.stage];

  return (
    <div className="border-line bg-panel flex flex-wrap items-center gap-3 rounded-[var(--radius)] border p-3">
      {/* Reorder controls */}
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onMove(index, -1)}
          disabled={isFirst}
          aria-label={t("moveUp", { stage: label })}
          className="text-muted hover:text-ink focus-visible:outline-ring rounded px-1 leading-none disabled:opacity-30 focus-visible:outline-2"
        >
          <span aria-hidden="true">▲</span>
        </button>
        <button
          type="button"
          onClick={() => onMove(index, 1)}
          disabled={isLast}
          aria-label={t("moveDown", { stage: label })}
          className="text-muted hover:text-ink focus-visible:outline-ring rounded px-1 leading-none disabled:opacity-30 focus-visible:outline-2"
        >
          <span aria-hidden="true">▼</span>
        </button>
      </div>

      <span className="label-mono text-muted w-6 text-center" aria-hidden="true">
        {index + 1}/{total}
      </span>

      <span
        aria-hidden="true"
        className="h-3 w-3 rounded-full"
        style={{ backgroundColor: `var(${effectiveToken})` }}
      />

      <div className="min-w-0 flex-1">
        <p className="text-ink font-medium">{label}</p>
        <p className="label-mono text-muted">{t("leadCount", { count: item.leadCount })}</p>
      </div>

      {/* Colour swatches */}
      <fieldset className="flex items-center gap-1.5">
        <legend className="sr-only">{t("colorLegend", { stage: label })}</legend>
        {STAGE_COLOR_CHOICES.map((token) => {
          const selected = effectiveToken === token;
          return (
            <button
              key={token}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={t("colorOption", { token })}
              onClick={() => onSetColor(item.stage, token === DEFAULT_STAGE_TOKENS[item.stage] ? null : token)}
              className={[
                "h-6 w-6 rounded-full focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2",
                selected ? "ring-ink ring-2 ring-offset-2" : "",
              ].join(" ")}
              style={{ backgroundColor: `var(${token})` }}
            />
          );
        })}
      </fieldset>

      {/* Visibility switch */}
      <button
        type="button"
        role="switch"
        aria-checked={item.isVisible}
        aria-label={t("visibilityLabel", { stage: label })}
        disabled={item.isTerminal}
        onClick={() => onToggleVisibility(item.stage, !item.isVisible)}
        className={[
          "focus-visible:outline-ring relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
          item.isVisible ? "bg-accent" : "bg-line",
          item.isTerminal ? "cursor-not-allowed opacity-50" : "",
        ].join(" ")}
        title={item.isTerminal ? t("terminalLocked") : undefined}
      >
        <span
          aria-hidden="true"
          className={[
            "bg-panel inline-block h-5 w-5 rounded-full shadow transition-transform",
            item.isVisible ? "translate-x-5" : "translate-x-0.5",
          ].join(" ")}
        />
      </button>
    </div>
  );
}
