import type { ReactNode } from "react";

interface LegalSection {
  heading: string;
  body: string;
}

interface LegalDocumentProps {
  title: string;
  version: string;
  versionLabel: string;
  intro: string;
  sections: ReadonlyArray<LegalSection>;
  children?: ReactNode;
}

/**
 * Presentational shell for a versioned legal document (privacy / cookie / terms).
 * Renders a single <h1>, the document version (proof-of-version, docs/09 §9.2)
 * and a list of sections with <h2> headings for a correct document outline
 * (WCAG 1.3.1). Content is supplied localized by the page; this component holds
 * no copy of its own.
 */
export function LegalDocument({
  title,
  version,
  versionLabel,
  intro,
  sections,
  children,
}: LegalDocumentProps) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <article className="flex flex-col gap-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-display text-3xl text-ink">{title}</h1>
          <p className="font-mono text-[12px] uppercase tracking-wide text-muted">
            {versionLabel}: {version}
          </p>
          <p className="font-body text-[14px] text-ink">{intro}</p>
        </header>

        {sections.map((section) => (
          <section key={section.heading} className="flex flex-col gap-2">
            <h2 className="font-display text-xl text-ink">{section.heading}</h2>
            <p className="font-body text-[14px] leading-relaxed text-ink">{section.body}</p>
          </section>
        ))}

        {children}
      </article>
    </main>
  );
}
