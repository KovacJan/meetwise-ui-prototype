"use client";

import {useState} from "react";
import {useLocale, useTranslations} from "next-intl";
import LanguageSwitcher from "./LanguageSwitcher";
import {signOut} from "../app/[locale]/(auth)/logout/actions";
import {ChevronDown, Sparkles, Menu, X} from "lucide-react";
import {usePathname, Link} from "i18n/navigation";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import {Tooltip, TooltipTrigger, TooltipContent} from "./ui/tooltip";
import {useUser} from "@/contexts/UserContext";
import AppSidebar from "./AppSidebar";

interface TopBarProps {
  title?: string;
}

const TopBar = ({title}: TopBarProps) => {
  const tAuth = useTranslations("auth");
  const tDash = useTranslations("dashboard");
  const tNav = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const {initials, displayName, email, plan} = useUser();
  const signOutWithLocale = signOut.bind(null, locale);
  const logoutFormId = "logout-form";
  const isPro = plan === "pro";
  const isDashboard = pathname === "/dashboard";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="flex items-center justify-between px-4 md:px-8 py-3 sm:py-4 border-b border-border/30 min-h-[52px] sm:min-h-0">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {title ? (
          <h2 className="text-base sm:text-lg font-semibold text-foreground truncate">{title}</h2>
        ) : isDashboard && displayName ? (
          <div className="hidden sm:block min-w-0">
            <h2 className="text-lg font-semibold text-foreground truncate">
              {tDash("greeting", {name: displayName})}
            </h2>
            <p className="text-xs text-muted-foreground">
              {tDash("greetingSubtitle")}
            </p>
          </div>
        ) : (
          <div className="sm:hidden flex items-center min-w-0">
            <span className="text-base font-semibold text-foreground truncate">
              {pathname === "/polls" ? tNav("polls") : pathname === "/ai-insights" ? tNav("insights") : pathname === "/team" ? tNav("team") : pathname === "/settings" ? tNav("settings") : pathname === "/upgrade" ? tNav("upgrade") : tNav("dashboard")}
            </span>
          </div>
        )}
        {!title && isDashboard && <div className="hidden sm:block" />}
      </div>
      <div className="flex items-center gap-4">
        <LanguageSwitcher />
        {/* Hidden form used by the dropdown "Sign out" item */}
        <form id={logoutFormId} action={signOutWithLocale} />
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 sm:gap-2 cursor-pointer focus:outline-none group min-h-[44px] min-w-[44px] rounded-full sm:rounded-lg sm:min-w-0 justify-center sm:justify-start"
                  aria-label={tAuth("accountSignOut")}
                >
                  {/* Avatar with optional PRO ring */}
                  <div className="relative shrink-0">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-md"
                      style={isPro ? {
                        background: "linear-gradient(135deg, hsl(45,90%,55%), hsl(32,90%,50%))",
                        boxShadow: "0 2px 12px hsla(40,90%,55%,0.50)",
                      } : {
                        background: "linear-gradient(135deg, hsl(270,60%,50%), hsl(232,60%,55%))",
                        boxShadow: "0 2px 8px hsla(260,60%,50%,0.35)",
                      }}
                    >
                      {initials}
                    </div>
                    {isPro && (
                      <span
                        className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center"
                        style={{background: "linear-gradient(135deg, hsl(45,90%,55%), hsl(32,90%,50%))"}}
                        title="Pro plan"
                      >
                        <Sparkles size={9} className="text-white" />
                      </span>
                    )}
                  </div>
                  <ChevronDown className="w-4 h-4 text-muted-foreground hidden sm:block shrink-0" aria-hidden />
                </button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {isPro ? "Pro plan — " : ""}{tAuth("accountSignOut")}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="min-w-[200px]">
            <DropdownMenuLabel>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-foreground truncate">{displayName ?? tAuth("account")}</p>
                {isPro && (
                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                    PRO
                  </span>
                )}
              </div>
              {email && <p className="text-xs text-muted-foreground font-normal truncate">{email}</p>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
              onSelect={(event) => {
                event.preventDefault();
                const form = document.getElementById(logoutFormId) as HTMLFormElement | null;
                form?.requestSubmit();
              }}
            >
              {tAuth("signOut")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Mobile drawer */}
        {mobileNavOpen && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/50 md:hidden"
              onClick={() => setMobileNavOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 w-64 bg-background md:hidden shadow-xl flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl gradient-blue-cyan flex items-center justify-center font-bold text-lg text-foreground">
                    M
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    MeetWise
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileNavOpen(false)}
                  className="inline-flex w-8 h-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  aria-label="Close navigation"
                >
                  <X size={16} />
                </button>
              </div>
              {/* Simple mobile nav list */}
              <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
                {[
                  {key: "dashboard", path: "/dashboard"},
                  {key: "polls", path: "/polls"},
                  {key: "insights", path: "/ai-insights"},
                  {key: "team", path: "/team"},
                  {key: "settings", path: "/settings"},
                  {key: "upgrade", path: "/upgrade"},
                ].map((item) => {
                  const active = pathname === item.path;
                  return (
                    <Link
                      key={item.key}
                      href={item.path}
                      prefetch
                      className={`block px-4 py-2.5 rounded-lg text-sm font-medium ${
                        active
                          ? "bg-secondary text-secondary-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                      }`}
                      onClick={() => setMobileNavOpen(false)}
                    >
                      {tNav(item.key as any)}
                    </Link>
                  );
                })}
              </nav>
              {/* Mobile footer / plan info */}
              <div className="p-3 border-t border-border/40 text-xs text-muted-foreground">
                {isPro ? (
                  <div className="flex items-center justify-between">
                    <span>{tNav("freePlan")}</span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/40 text-[10px] font-semibold">
                      PRO
                    </span>
                  </div>
                ) : (
                  <div className="text-center">
                    <p>{tNav("freePlan")}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {tNav("freePlanAiOnly")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
};

export default TopBar;
