import { getTranslations } from "next-intl/server";

import { LegalDocument } from "@/components/legal/legal-document";
import { TERMS_VERSION } from "@/server/consent/consent-types";

interface Section {
  heading: string;
  body: string;
}

export default async function TermsPage() {
  const t = await getTranslations("legal");
  const tt = await getTranslations("legal.terms");
  const sections = tt.raw("sections") as ReadonlyArray<Section>;

  return (
    <LegalDocument
      title={tt("title")}
      version={TERMS_VERSION}
      versionLabel={t("versionLabel")}
      intro={tt("intro")}
      sections={sections}
    />
  );
}
