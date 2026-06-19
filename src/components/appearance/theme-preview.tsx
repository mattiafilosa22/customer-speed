"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";

import { type Theme, themeDataAttributes, themeToCssVars } from "@/lib/theme";
import { Button, Card, CardBody, Input, Pill } from "@/components/ui";

/**
 * Live preview of the in-progress theme (docs/05 §5.4).
 *
 * The key idea: this container re-applies the EDITED theme as inline CSS custom
 * properties + the same data-* switches the real ThemeProvider uses — but scoped
 * to THIS subtree only. So the sample widgets re-render with the candidate
 * palette/radius/button-style/density in real time, WITHOUT touching the rest of
 * the app and WITHOUT saving anything. It is the same `themeToCssVars` mapping
 * used in production, so the preview is faithful.
 *
 * Presentation only; the live theme is owned by the parent panel.
 */
export function ThemePreview({ theme }: { theme: Theme }) {
  const t = useTranslations("appearance.preview");
  const cssVars = themeToCssVars(theme) as CSSProperties;

  return (
    <div
      {...themeDataAttributes(theme)}
      style={cssVars}
      className="rounded border border-line bg-bg p-4"
      data-testid="theme-preview"
    >
      <p className="font-body text-[12px] text-muted">{t("description")}</p>
      <div className="mt-3 flex flex-col gap-3">
        <Card>
          <CardBody className="flex flex-col gap-1">
            <span className="label-mono">{t("kpiLabel")}</span>
            <span className="font-display text-3xl text-ink">{t("kpiValue")}</span>
          </CardBody>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <Button squared={theme.buttonStyle === "squared"}>{t("sampleButton")}</Button>
          <Button variant="ghost" squared={theme.buttonStyle === "squared"}>
            {t("sampleGhost")}
          </Button>
          <Pill stage="waiting-decision">{t("sampleStage")}</Pill>
        </div>

        <Input label={t("sampleInputLabel")} placeholder={t("sampleInputPlaceholder")} readOnly />
      </div>
    </div>
  );
}
