interface LandingStatsProps {
  items: Array<{ label: string; value: string }>;
}

export default function LandingStats({ items }: LandingStatsProps) {
  return (
    <section className="relative z-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-16 sm:pb-20">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4 text-left"
          >
            <p className="text-2xl sm:text-3xl font-extrabold text-foreground">
              {item.value}
            </p>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              {item.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
