import GlassCard from "@/components/GlassCard";
import type { LucideIcon } from "lucide-react";

interface FeatureItem {
  icon: LucideIcon;
  title: string;
  desc: string;
}

interface LandingFeaturesProps {
  title: string;
  subtitle: string;
  items: FeatureItem[];
}

export default function LandingFeatures({
  title,
  subtitle,
  items,
}: LandingFeaturesProps) {
  return (
    <section className="relative z-20 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
      <div className="text-center max-w-3xl mx-auto mb-10">
        <h2 className="text-3xl sm:text-4xl font-bold text-foreground">
          {title}
        </h2>
        <p className="mt-3 text-muted-foreground text-base">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {items.map((item) => (
          <GlassCard
            key={item.title}
            className="animate-fade-in relative overflow-hidden"
          >
            <div className="absolute -right-8 -top-10 h-24 w-24 rounded-full bg-cyan-400/10 blur-2xl" />
            <div className="w-11 h-11 rounded-xl gradient-blue-cyan flex items-center justify-center mb-4">
              <item.icon size={20} className="text-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              {item.title}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {item.desc}
            </p>
          </GlassCard>
        ))}
      </div>
    </section>
  );
}
