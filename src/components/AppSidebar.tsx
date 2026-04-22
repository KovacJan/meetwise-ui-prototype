"use client";

import React, {useState, useEffect} from "react";
import {cn} from "@/lib/utils";
import {Link, usePathname} from "../../i18n/navigation";
import {useTranslations} from "next-intl";
import {
  LayoutDashboard,
  BrainCircuit,
  Users,
  Settings,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
} from "lucide-react";
import {Tooltip, TooltipTrigger, TooltipContent} from "@/components/ui/tooltip";
import {useUser} from "@/contexts/UserContext";

type NavItem = {
  key: "dashboard" | "insights" | "team" | "settings" | "upgrade" | "polls";
  icon: React.ElementType;
  path: string;
  pro?: boolean;
};

const navItems: NavItem[] = [
  {key: "dashboard", icon: LayoutDashboard, path: "/dashboard"},
  {key: "insights", icon: BrainCircuit, path: "/ai-insights", pro: true},
  {key: "team", icon: Users, path: "/team"},
  {key: "polls", icon: ClipboardList, path: "/polls"},
  {key: "settings", icon: Settings, path: "/settings"},
  {key: "upgrade", icon: Sparkles, path: "/upgrade"},
];

interface AppSidebarProps {
  isEmployee?: boolean;
}

const AppSidebar = ({isEmployee}: AppSidebarProps) => {
  const tNav = useTranslations("nav");
  const pathname = usePathname();
  const {plan} = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const isPro = plan === "pro";
  const [pendingSurveys, setPendingSurveys] = useState(0);

  // Fetch pending poll count silently in the background
  const fetchPendingPolls = () => {
    fetch("/api/polls/pending-count")
      .then((r) => r.json())
      .then((d) => setPendingSurveys(d.count ?? 0))
      .catch(() => {});
  };

  useEffect(() => {
    fetchPendingPolls();
  }, []);

  // Listen for global refresh events (e.g. after calendar sync or poll submit)
  useEffect(() => {
    const handler = () => fetchPendingPolls();
    if (typeof window !== "undefined") {
      window.addEventListener("polls:refresh", handler);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("polls:refresh", handler);
      }
    };
  }, []);

  const items = isEmployee
    ? navItems.filter((i) => !["team", "upgrade"].includes(i.key))
    : navItems;

  return (
    <aside
      className={cn(
        "hidden md:flex sticky top-0 h-screen flex-col border-r border-border/50 transition-all duration-300",
        collapsed ? "w-[64px]" : "w-64",
      )}
      style={{background: "hsl(237, 56%, 10%)"}}
    >
      {/* Logo + collapse button row */}
      <div
        className={cn(
          "p-4 flex items-center gap-3 relative shrink-0",
          collapsed && "justify-center",
        )}
      >
        <div className="w-9 h-9 rounded-xl gradient-blue-cyan flex items-center justify-center font-bold text-lg text-foreground shrink-0">
          M
        </div>
        {!collapsed && <span className="text-xl font-bold text-foreground flex-1">MeetWise</span>}

        {/* Collapse/expand toggle (desktop only) */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden md:flex absolute -right-3 w-6 h-6 rounded-full items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 z-20 cursor-pointer"
          style={{
            background: "linear-gradient(135deg, hsl(232,60%,55%), hsl(190,70%,50%))",
            boxShadow: "0 2px 10px hsla(232,60%,55%,0.45), 0 0 0 2px hsl(237,56%,10%)",
          }}
          title={tNav("collapse")}
        >
          {collapsed ? (
            <ChevronRight size={11} className="text-white" />
          ) : (
            <ChevronLeft size={11} className="text-white" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const active = pathname === item.path;
          const label = tNav(item.key);
          const isPolls = item.key === "polls";
          const showBadge = isPolls && pendingSurveys > 0;

          const link = (
            <Link
              key={item.key}
              href={item.path}
              prefetch
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 cursor-pointer",
                collapsed && "justify-center px-0",
                active
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
              )}
            >
              <div className="relative shrink-0">
                <item.icon size={18} />
                {/* Pending badge dot on collapsed icon */}
                {collapsed && showBadge && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 text-[8px] font-bold text-black flex items-center justify-center leading-none">
                    {pendingSurveys > 9 ? "9+" : pendingSurveys}
                  </span>
                )}
              </div>
              {!collapsed && (
                <span className="flex-1 flex items-center gap-2">
                  {label}
                  {item.pro && !isPro && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold leading-none bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      PRO
                    </span>
                  )}
                  {/* Pending count badge in expanded mode */}
                  {showBadge && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-amber-400/20 text-amber-400 border border-amber-400/30 leading-none">
                      {pendingSurveys}
                    </span>
                  )}
                </span>
              )}
            </Link>
          );

          if (collapsed) {
            return (
              <Tooltip key={item.key} delayDuration={0}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {label}
                  {showBadge && ` (${pendingSurveys})`}
                </TooltipContent>
              </Tooltip>
            );
          }
          return link;
        })}
      </nav>

      {/* Footer */}
      <div className="shrink-0 p-3">
        {isPro ? (
          <div
            className={cn(
              "rounded-xl p-3 text-center border",
              collapsed ? "px-0 flex justify-center" : "",
            )}
            style={{
              background: "linear-gradient(135deg, hsla(45,90%,55%,0.12), hsla(32,90%,50%,0.08))",
              borderColor: "hsla(45,90%,55%,0.25)",
            }}
          >
            {collapsed ? (
              <Sparkles size={16} className="text-amber-400" />
            ) : (
              <>
                <p className="text-xs font-semibold text-amber-400 flex items-center justify-center gap-1">
                  <Sparkles size={11} /> Pro Plan
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">{tNav("unlimitedInsights")}</p>
              </>
            )}
          </div>
        ) : (
          !collapsed && (
            <div className="glass rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">
                {tNav("freePlan")}
              </p>
              <p className="text-xs font-semibold text-foreground mt-0.5">
                {tNav("freePlanAiOnly")}
              </p>
            </div>
          )
        )}
      </div>
    </aside>
  );
};

export default AppSidebar;
