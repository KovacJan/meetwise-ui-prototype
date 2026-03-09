"use client";

import {
  LayoutDashboard,
  ClipboardList,
  BrainCircuit,
  Users,
  Settings,
  Sparkles,
} from "lucide-react";
import {useTranslations} from "next-intl";
import {Link, usePathname} from "i18n/navigation";

const navItems = [
  {key: "dashboard", icon: LayoutDashboard, path: "/dashboard"},
  {key: "polls", icon: ClipboardList, path: "/polls"},
  {key: "insights", icon: BrainCircuit, path: "/ai-insights"},
  {key: "team", icon: Users, path: "/team"},
  {key: "settings", icon: Settings, path: "/settings"},
  {key: "upgrade", icon: Sparkles, path: "/upgrade"},
] as const;

export default function MobileBottomNav() {
  const tNav = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-border/60 bg-gradient-to-t from-background to-background/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]"
      aria-label="Main navigation"
    >
      <div className="flex items-stretch justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.path;
          return (
            <Link
              key={item.key}
              href={item.path}
              prefetch
              className={`flex-1 flex flex-col items-center justify-center min-h-[52px] py-2.5 text-[11px] font-medium touch-manipulation ${
                active
                  ? "text-secondary-foreground bg-secondary/90"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40 active:bg-muted/50"
              }`}
            >
              <Icon size={20} className="mb-0.5 shrink-0" aria-hidden />
              <span className="truncate max-w-[72px]">{tNav(item.key)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

