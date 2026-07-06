"use client";

import { Link } from "../../../i18n/navigation";

interface LandingFooterProps {
  tagline: string;
  legalLabel: string;
  privacyLabel: string;
  termsLabel: string;
}

export default function LandingFooter({
  tagline,
  legalLabel,
  privacyLabel,
  termsLabel,
}: LandingFooterProps) {
  return (
    <footer className="relative z-20 border-t border-white/10 bg-black/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-xs sm:text-sm text-muted-foreground">{tagline}</p>

        <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm">
          <span className="text-white/40">{legalLabel}</span>
          <Link
            href="/privacy-policy"
            className="text-foreground/85 hover:text-foreground transition-colors"
          >
            {privacyLabel}
          </Link>
          <Link
            href="/terms-of-use"
            className="text-foreground/85 hover:text-foreground transition-colors"
          >
            {termsLabel}
          </Link>
        </div>
      </div>
    </footer>
  );
}
