import GlassCard from "@/components/GlassCard";

interface LandingPricingProps {
  title: string;
  subtitle: string;
  freePlanLabel: string;
  proPlanLabel: string;
  perMonthLabel: string;
  popularLabel: string;
  getStartedLabel: string;
  upgradeLabel: string;
  freeFeatures: string[];
  proFeatures: string[];
  onStartClick: () => void;
  onUpgradeClick: () => void;
}

export default function LandingPricing({
  title,
  subtitle,
  freePlanLabel,
  proPlanLabel,
  perMonthLabel,
  popularLabel,
  getStartedLabel,
  upgradeLabel,
  freeFeatures,
  proFeatures,
  onStartClick,
  onUpgradeClick,
}: LandingPricingProps) {
  return (
    <section className="relative z-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 sm:pb-24">
      <div className="text-center max-w-3xl mx-auto mb-12">
        <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
          {title}
        </h2>
        <p className="mt-3 text-muted-foreground">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <GlassCard className="animate-fade-in flex flex-col">
          <div className="flex-1">
            <h3 className="text-xl font-bold text-foreground mb-2">
              {freePlanLabel}
            </h3>
            <p className="text-3xl font-extrabold text-foreground mb-4">
              EUR0
              <span className="text-sm font-normal text-muted-foreground">
                {perMonthLabel}
              </span>
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6">
              {freeFeatures.map((feature) => (
                <li key={feature}>✓ {feature}</li>
              ))}
            </ul>
          </div>
          <button
            onClick={onStartClick}
            className="w-full py-3 rounded-xl glass text-sm font-semibold text-foreground hover:bg-secondary/20 transition-all shrink-0"
          >
            {getStartedLabel}
          </button>
        </GlassCard>

        <GlassCard className="border border-secondary/35 animate-fade-in flex flex-col relative overflow-hidden">
          <div className="absolute -right-8 -top-10 h-24 w-24 rounded-full bg-secondary/25 blur-2xl" />
          <div className="flex-1 relative">
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-xl font-bold text-foreground">
                {proPlanLabel}
              </h3>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-secondary/20 text-secondary font-medium">
                {popularLabel}
              </span>
            </div>
            <p className="text-3xl font-extrabold text-foreground mb-4">
              EUR19
              <span className="text-sm font-normal text-muted-foreground">
                {perMonthLabel}
              </span>
            </p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6">
              {proFeatures.map((feature) => (
                <li key={feature}>✓ {feature}</li>
              ))}
            </ul>
          </div>
          <button
            onClick={onUpgradeClick}
            className="w-full py-3 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-90 transition-opacity shrink-0"
          >
            {upgradeLabel}
          </button>
        </GlassCard>
      </div>
    </section>
  );
}
