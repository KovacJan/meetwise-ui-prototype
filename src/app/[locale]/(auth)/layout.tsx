import type {ReactNode} from "react";
import LanguageSwitcher from "@/components/LanguageSwitcher";

export default function AuthLayout({children}: {children: ReactNode}) {
  return (
    <>
      {/* Fixed top-right language switcher visible on all auth pages */}
      <div className="fixed top-3 right-3 sm:top-4 sm:right-4 z-50">
        <LanguageSwitcher />
      </div>
      {children}
    </>
  );
}
