import type { ReactNode } from "react";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import { Link } from "../../../../i18n/navigation";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/10 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-3 group"
            aria-label="Go to MeetWise landing page"
          >
            <div className="w-9 h-9 rounded-xl gradient-blue-cyan flex items-center justify-center font-bold text-lg text-foreground">
              M
            </div>
            <span className="text-xl font-bold text-foreground group-hover:text-secondary transition-colors">
              MeetWise
            </span>
          </Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="pt-16 sm:pt-20">{children}</main>
    </>
  );
}
