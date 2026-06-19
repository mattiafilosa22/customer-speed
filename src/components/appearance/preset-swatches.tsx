"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/cn";
import type { ThemePreset } from "@/lib/theme";
import { THEME_PRESETS, THEME_PRESET_ORDER } from "@/lib/theme-presets";

/**
 * Palette preset picker (docs/05 §5.5). A `radiogroup` of swatches; selecting one
 * applies the COMPLETE preset theme upstream. Each swatch shows the accent color
 * AND the preset name as text (not color-only), and the selected state has a
 * visible ring + `aria-checked`. Keyboard-operable via native radios.
 */
export function PresetSwatches({
  value,
  onSelect,
}: {
  value: ThemePreset;
  onSelect: (preset: ThemePreset) => void;
}) {
  const t = useTranslations("appearance.theme");
  const groupId = useId();

  return (
    <div
      role="radiogroup"
      aria-label={t("presets")}
      className="flex flex-wrap gap-2"
    >
      {THEME_PRESET_ORDER.map((preset) => {
        const id = `${groupId}-${preset}`;
        const selected = preset === value;
        const accent = THEME_PRESETS[preset].colors.accent;
        return (
          <label
            key={preset}
            htmlFor={id}
            className={cn(
              "flex cursor-pointer items-center gap-2 rounded-control border px-2.5 py-1.5",
              "font-body text-[12px] transition-colors",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
              selected ? "border-accent bg-accent-soft text-ink" : "border-line text-muted hover:text-ink",
            )}
          >
            <input
              id={id}
              type="radio"
              name={groupId}
              value={preset}
              checked={selected}
              onChange={() => onSelect(preset)}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className="size-4 shrink-0 rounded-pill border border-line"
              style={{ backgroundColor: accent }}
            />
            {t(`presetNames.${preset}` as Parameters<typeof t>[0])}
          </label>
        );
      })}
    </div>
  );
}
