"use client";

import { Link } from "../../../i18n/navigation";

interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

interface LegalDocumentProps {
  title: string;
  updatedAt: string;
  sections: LegalSection[];
}

export default function LegalDocument({
  title,
  updatedAt,
  sections,
}: LegalDocumentProps) {
  return (
    <main className="relative min-h-screen overflow-x-clip bg-[radial-gradient(circle_at_20%_-10%,rgba(56,189,248,.18),transparent_48%),radial-gradient(circle_at_90%_10%,rgba(99,102,241,.20),transparent_40%),linear-gradient(180deg,hsl(237,56%,13%)_0%,hsl(236,50%,17%)_42%,hsl(235,56%,21%)_100%)]">
      <div className="absolute inset-0 pointer-events-none opacity-25 [background-image:linear-gradient(hsla(0,0%,100%,0.07)_1px,transparent_1px),linear-gradient(90deg,hsla(0,0%,100%,0.07)_1px,transparent_1px)] [background-size:48px_48px]" />

      <div className="relative z-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to MeetWise
          </Link>
        </div>

        <article className="rounded-3xl border border-white/12 bg-white/[0.05] px-6 sm:px-8 py-7 sm:py-10">
          <header className="mb-8 border-b border-white/10 pb-6">
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
              {title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Last updated: {updatedAt}
            </p>
          </header>

          <div className="space-y-7">
            {sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-xl font-semibold text-foreground">
                  {section.heading}
                </h2>
                <div className="mt-2 space-y-3">
                  {section.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph}
                      className="text-sm sm:text-base leading-relaxed text-muted-foreground"
                    >
                      {paragraph}
                    </p>
                  ))}
                  {section.bullets && section.bullets.length > 0 && (
                    <ul className="list-disc pl-5 space-y-1.5 text-sm sm:text-base text-muted-foreground">
                      {section.bullets.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
