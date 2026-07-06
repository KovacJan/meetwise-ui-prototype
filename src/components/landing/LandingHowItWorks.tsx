interface Step {
  title: string;
  body: string;
}

interface LandingHowItWorksProps {
  sectionId?: string;
  title: string;
  subtitle: string;
  steps: Step[];
}

export default function LandingHowItWorks({
  sectionId,
  title,
  subtitle,
  steps,
}: LandingHowItWorksProps) {
  return (
    <section
      id={sectionId}
      className="relative z-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 scroll-mt-20"
    >
      <div className="rounded-3xl border border-white/12 bg-white/[0.04] px-5 sm:px-8 py-8 sm:py-10">
        <div className="max-w-3xl mb-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
            {title}
          </h2>
          <p className="mt-3 text-muted-foreground">{subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {steps.map((step, idx) => (
            <article
              key={step.title}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="w-8 h-8 rounded-full bg-secondary/20 text-secondary flex items-center justify-center text-sm font-bold mb-4">
                {idx + 1}
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                {step.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
