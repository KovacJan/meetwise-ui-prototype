"use client";

interface LandingHeroProps {
  title: React.ReactNode;
  description: string;
  badge: string;
  primaryCta: string;
  secondaryCta: string;
  onPrimaryClick: () => void;
  onSecondaryClick: () => void;
}

export default function LandingHero({
  title,
  description,
  badge,
  primaryCta,
  secondaryCta,
  onPrimaryClick,
  onSecondaryClick,
}: LandingHeroProps) {
  return (
    <section className="relative z-20 max-w-5xl mx-auto text-center pt-12 sm:pt-24 pb-14 sm:pb-20 px-4 sm:px-6 lg:px-8">
      <div className="inline-flex items-center rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-semibold tracking-wide text-cyan-100/90 animate-fade-in">
        {badge}
      </div>

      <h1
        className="mt-5 text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight text-foreground leading-[1.02] animate-fade-in"
        style={{ animationDelay: "0.08s" }}
      >
        {title}
      </h1>

      <p
        className="mt-6 text-lg text-muted-foreground max-w-3xl mx-auto animate-fade-in"
        style={{ animationDelay: "0.15s" }}
      >
        {description}
      </p>

      <div
        className="mt-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4 animate-fade-in"
        style={{ animationDelay: "0.22s" }}
      >
        <button
          onClick={onPrimaryClick}
          className="px-8 py-3.5 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          {primaryCta}
        </button>
        <button
          onClick={onSecondaryClick}
          className="px-8 py-3.5 rounded-xl border border-white/20 bg-white/[0.03] text-sm font-medium text-foreground hover:bg-secondary/20 transition-all"
        >
          {secondaryCta}
        </button>
      </div>
    </section>
  );
}
