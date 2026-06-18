import { getTranslations } from "next-intl/server";

import { LegalDocument } from "@/components/legal/legal-document";
import { PRIVACY_POLICY_VERSION } from "@/server/consent/consent-types";

interface Section {
  heading: string;
  body: string;
}

export default async function PrivacyPolicyPage() {
  const t = await getTranslations("legal");
  const tp = await getTranslations("legal.privacy");
  const sections = tp.raw("sections") as ReadonlyArray<Section>;

  return (
    <LegalDocument
      title={tp("title")}
      version={PRIVACY_POLICY_VERSION}
      versionLabel={t("versionLabel")}
      intro={tp("intro")}
      sections={sections}
    />
  );
}
