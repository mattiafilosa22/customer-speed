"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

import { type Theme, type ThemeMode, type ButtonStyle, type Density } from "@/lib/theme";
import { THEME_PRESETS } from "@/lib/theme-presets";
import { FONT_PAIRS, type FontPairId, fontPairIdOf } from "@/lib/theme-fonts";
import { validateThemeContrast } from "@/lib/contrast";
import type { ThemePreset } from "@/lib/theme";
import type { OrganizationBranding } from "@/server/organization";
import type { UpdateThemeInput, UpdateBrandingInput } from "@/server/organization";
import {
  updateBrandingAction,
  updateThemeAction,
} from "@/app/[locale]/(app)/settings/appearance/actions";
import { Button, Card, CardBody, Input, Segmented, Slider, Switch } from "@/components/ui";
import { FormAlert } from "@/components/auth/form-alert";
import { useMessage } from "@/components/auth/use-message";
import { ContrastReport } from "@/components/appearance/contrast-report";
import { ThemePreview } from "@/components/appearance/theme-preview";
import { PresetSwatches } from "@/components/appearance/preset-swatches";
import { ImageUploadField } from "@/components/appearance/image-upload-field";

/**
 * "Aspetto & brand" white-label panel (docs/05 §5.4).
 *
 * Orchestrator: owns the in-progress DRAFT (theme + brand) in local state, drives
 * the LIVE PREVIEW (the preview re-applies the draft theme as scoped CSS vars, so
 * nothing global changes until Save), runs contrast validation on every color
 * change, and persists via the Server Actions on "Salva tema". "Ripristina
 * default" resets the draft to the Indigo preset. Permission (`settings.tenant`)
 * is enforced server-side in the actions; this panel is only rendered for allowed
 * roles. No business logic beyond UI state — persistence + rules live in the use
 * cases.
 *
 * Reuse: the SAVE callbacks are injected so the same panel serves BOTH the
 * tenant's own "Aspetto & brand" page (default: the `settings.tenant` Server
 * Actions) AND the superAdmin admin area (which passes admin actions bound to a
 * TARGET tenant). The panel itself is identical in both contexts — only the
 * persistence boundary differs (Dependency Inversion at the UI edge).
 */

export interface AppearancePanelProps {
  initial: OrganizationBranding;
  /** Persist the theme. Defaults to the tenant `settings.tenant` action. */
  onSaveTheme?: (input: UpdateThemeInput) => Promise<unknown>;
  /** Persist branding. Defaults to the tenant `settings.tenant` action. */
  onSaveBranding?: (input: UpdateBrandingInput) => Promise<unknown>;
}

export function AppearancePanel({
  initial,
  onSaveTheme = updateThemeAction,
  onSaveBranding = updateBrandingAction,
}: AppearancePanelProps) {
  const t = useTranslations("appearance");
  const tt = useTranslations("appearance.theme");
  const tc = useTranslations("appearance.components");
  const tm = useMessage();

  const modeOptions: ReadonlyArray<{ value: ThemeMode; label: string }> = [
    { value: "light", label: tt("modeLight") },
    { value: "dark", label: tt("modeDark") },
    { value: "auto", label: tt("modeAuto") },
  ];
  const fontOptions: ReadonlyArray<{ value: FontPairId; label: string }> = [
    { value: "bebas-montserrat", label: tt("fontPairs.bebas-montserrat") },
    { value: "inter", label: tt("fontPairs.inter") },
    { value: "manrope", label: tt("fontPairs.manrope") },
    { value: "system", label: tt("fontPairs.system") },
  ];
  const buttonStyleOptions: ReadonlyArray<{ value: ButtonStyle; label: string }> = [
    { value: "filled", label: tc("buttonFilled") },
    { value: "squared", label: tc("buttonSquared") },
  ];
  const densityOptions: ReadonlyArray<{ value: Density; label: string }> = [
    { value: "comfortable", label: tc("densityComfortable") },
    { value: "compact", label: tc("densityCompact") },
  ];

  const [theme, setTheme] = useState<Theme>(initial.theme);
  const [appName, setAppName] = useState(initial.appName);
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [faviconUrl, setFaviconUrl] = useState<string | null>(initial.faviconUrl);
  const [markFallback, setMarkFallback] = useState(initial.markFallback ?? "");
  const [poweredBy, setPoweredBy] = useState(initial.poweredBy);

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const contrast = useMemo(() => validateThemeContrast(theme), [theme]);

  const themeMutation = useMutation({ mutationFn: onSaveTheme });
  const brandingMutation = useMutation({ mutationFn: onSaveBranding });

  // ── Theme field updaters (pure draft updates; preview reacts) ──────────────
  const patchTheme = useCallback((patch: Partial<Theme>) => {
    setSaved(false);
    setTheme((current) => ({ ...current, ...patch }));
  }, []);

  const setAccent = useCallback(
    (accent: string) => {
      setSaved(false);
      setTheme((current) => ({ ...current, colors: { ...current.colors, accent } }));
    },
    [],
  );

  const applyPreset = useCallback((preset: ThemePreset) => {
    setSaved(false);
    setTheme(THEME_PRESETS[preset]);
  }, []);

  const setFontPair = useCallback((id: FontPairId) => {
    setSaved(false);
    setTheme((current) => ({ ...current, fonts: FONT_PAIRS[id] }));
  }, []);

  const resetToDefault = useCallback(() => {
    setSaved(false);
    setError(null);
    setTheme(THEME_PRESETS.indigo);
  }, []);

  // ── Save (theme + branding) ────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setError(null);
    setSaved(false);
    try {
      await themeMutation.mutateAsync({ theme });
      await brandingMutation.mutateAsync({
        appName,
        logoUrl,
        faviconUrl,
        markFallback: markFallback.length > 0 ? markFallback : null,
        poweredBy,
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "appearance.errors.generic");
    }
  }, [theme, appName, logoUrl, faviconUrl, markFallback, poweredBy, themeMutation, brandingMutation]);

  const isSaving = themeMutation.isPending || brandingMutation.isPending;
  const blockedByContrast = !contrast.passes;
  const fontPairId = fontPairIdOf(theme.fonts);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      {/* Controls */}
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        {error ? <FormAlert tone="error">{tm(error)}</FormAlert> : null}
        {saved ? <FormAlert tone="success">{t("status.saved")}</FormAlert> : null}

        {/* Brand */}
        <section aria-labelledby="brand-heading">
          <Card>
            <CardBody className="flex flex-col gap-4">
              <h2 id="brand-heading" className="font-display text-xl text-ink">
                {t("sections.brand")}
              </h2>
              <Input
                label={t("brand.appName")}
                value={appName}
                onChange={(e) => {
                  setSaved(false);
                  setAppName(e.target.value);
                }}
                maxLength={60}
                aria-describedby="appname-hint"
              />
              <p id="appname-hint" className="-mt-2 font-body text-[12px] text-muted">
                {t("brand.appNameHint")}
              </p>

              <ImageUploadField
                label={t("brand.logo")}
                description={t("brand.logoHint")}
                value={logoUrl}
                onChange={(v) => {
                  setSaved(false);
                  setLogoUrl(v);
                }}
                uploadLabel={t("brand.upload")}
                removeLabel={t("brand.remove")}
                previewAlt={t("brand.logoAlt")}
              />

              <Input
                label={t("brand.mark")}
                value={markFallback}
                onChange={(e) => {
                  setSaved(false);
                  setMarkFallback(e.target.value.toUpperCase().slice(0, 3));
                }}
                maxLength={3}
                aria-describedby="mark-hint"
              />
              <p id="mark-hint" className="-mt-2 font-body text-[12px] text-muted">
                {t("brand.markHint")}
              </p>

              <ImageUploadField
                label={t("brand.favicon")}
                description={t("brand.faviconHint")}
                value={faviconUrl}
                onChange={(v) => {
                  setSaved(false);
                  setFaviconUrl(v);
                }}
                uploadLabel={t("brand.upload")}
                removeLabel={t("brand.remove")}
                previewAlt={t("brand.faviconAlt")}
              />

              <Switch
                label={t("brand.poweredBy")}
                checked={poweredBy}
                onCheckedChange={(v) => {
                  setSaved(false);
                  setPoweredBy(v);
                }}
              />
            </CardBody>
          </Card>
        </section>

        {/* Theme & colors */}
        <section aria-labelledby="theme-heading">
          <Card>
            <CardBody className="flex flex-col gap-4">
              <h2 id="theme-heading" className="font-display text-xl text-ink">
                {t("sections.themeColors")}
              </h2>

              <div className="flex items-end gap-3">
                <Input
                  label={t("theme.primaryColor")}
                  type="color"
                  value={theme.colors.accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="h-11 w-16 cursor-pointer p-1"
                  aria-describedby="accent-hint"
                />
                <span className="pb-3 font-mono text-[12px] text-muted">{theme.colors.accent}</span>
              </div>
              <p id="accent-hint" className="-mt-2 font-body text-[12px] text-muted">
                {t("theme.primaryColorHint")}
              </p>

              <PresetSwatches value={theme.preset} onSelect={applyPreset} />

              <Segmented
                label={t("theme.mode")}
                options={modeOptions}
                value={theme.mode}
                onValueChange={(mode) => patchTheme({ mode })}
              />

              <Segmented
                label={t("theme.typography")}
                options={fontOptions}
                value={fontPairId}
                onValueChange={setFontPair}
              />

              {/* Contrast validation — updates on every color change */}
              <ContrastReport report={contrast} />
            </CardBody>
          </Card>
        </section>

        {/* Components */}
        <section aria-labelledby="components-heading">
          <Card>
            <CardBody className="flex flex-col gap-4">
              <h2 id="components-heading" className="font-display text-xl text-ink">
                {t("sections.components")}
              </h2>

              <Slider
                label={t("components.radius")}
                description={t("components.radiusHint")}
                value={theme.radius}
                min={0}
                max={22}
                unit="px"
                onValueChange={(radius) => patchTheme({ radius })}
              />

              <Segmented
                label={t("components.buttonStyle")}
                options={buttonStyleOptions}
                value={theme.buttonStyle}
                onValueChange={(buttonStyle) => patchTheme({ buttonStyle })}
              />

              <Segmented
                label={t("components.density")}
                options={densityOptions}
                value={theme.density}
                onValueChange={(density) => patchTheme({ density })}
              />

              <Switch
                label={t("components.softShadows")}
                checked={theme.softShadows}
                onCheckedChange={(softShadows) => patchTheme({ softShadows })}
              />
            </CardBody>
          </Card>
        </section>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Button onClick={handleSave} disabled={isSaving || blockedByContrast}>
            {isSaving ? t("actions.saving") : t("actions.save")}
          </Button>
          <Button variant="ghost" onClick={resetToDefault} disabled={isSaving}>
            {t("actions.reset")}
          </Button>
        </div>
      </div>

      {/* Live preview (sticky on desktop) */}
      <aside
        aria-labelledby="preview-heading"
        className="w-full shrink-0 lg:sticky lg:top-6 lg:w-80"
      >
        <h2 id="preview-heading" className="mb-2 font-display text-xl text-ink">
          {t("preview.heading")}
        </h2>
        <ThemePreview theme={theme} />
      </aside>
    </div>
  );
}
