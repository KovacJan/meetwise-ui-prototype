"use client";

import LanguageSwitcher from "@/components/LanguageSwitcher";

interface LandingNavbarProps {
  howLabel: string;
  faqLabel: string;
  onHowClick: () => void;
  onFaqClick: () => void;
  loginLabel: string;
  onLogin: () => void;
}

export default function LandingNavbar({
  howLabel,
  faqLabel,
  onHowClick,
  onFaqClick,
  loginLabel,
  onLogin,
}: LandingNavbarProps) {
  return (
    <nav className="relative z-20 flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 sm:py-5 max-w-7xl mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl gradient-blue-cyan flex items-center justify-center font-bold text-lg text-foreground">
          M
        </div>
        <span className="text-xl font-bold tracking-tight text-foreground">
          MeetWise
        </span>
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        <button
          onClick={onHowClick}
          className="hidden md:inline-flex px-3 py-2 rounded-xl text-sm font-medium text-foreground/85 hover:text-foreground hover:bg-white/10 transition-all"
        >
          {howLabel}
        </button>
        <button
          onClick={onFaqClick}
          className="hidden md:inline-flex px-3 py-2 rounded-xl text-sm font-medium text-foreground/85 hover:text-foreground hover:bg-white/10 transition-all"
        >
          {faqLabel}
        </button>
        <LanguageSwitcher />
        <button
          onClick={onLogin}
          className="px-5 py-2 rounded-xl glass text-sm font-medium text-foreground hover:bg-secondary/20 transition-all"
        >
          {loginLabel}
        </button>
      </div>
    </nav>
  );
}
