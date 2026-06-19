import { getTranslations } from "next-intl/server";

import { LegalDocument } from "@/components/legal/legal-document";
import { ManageConsentButton } from "@/components/cookie/manage-consent-button";
import { COOKIE_POLICY_VERSION } from "@/server/consent/consent-types";

interface Section {
  heading: string;
  body: string;
}

export default async function CookiePolicyPage() {
  const t = await getTranslations("legal");
  const tc = await getTranslations("legal.cookie");
  const sections = tc.raw("sections") as ReadonlyArray<Section>;

  return (
    <LegalDocument
      title={tc("title")}
      version={COOKIE_POLICY_VERSION}
      versionLabel={t("versionLabel")}
      intro={tc("intro")}
      sections={sections}
    >
      <ManageConsentButton />
    </LegalDocument>
  );
}
