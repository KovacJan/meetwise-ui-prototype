"use client";

import {useLocale} from "next-intl";
import {usePathname, useRouter} from "i18n/navigation";
import {cn} from "@/lib/utils";

const LOCALES = ["en", "de"] as const;

export default function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  if (process.env.NODE_ENV === "development") {
    console.debug("[LanguageSwitcher] locale=%s pathname=%s", locale, pathname);
  }

  return (
    <div className="flex items-center glass rounded-lg overflow-hidden text-sm">
      {LOCALES.map((lang) => (
        <button
          type="button"
          key={lang}
          onClick={() => {
            // Stay on the same logical page, just change locale.
            // usePathname from i18n/navigation returns a path *without* locale.
            const targetPath = pathname || "/";
            router.push(targetPath, {locale: lang});
          }}
          className={cn(
            "px-3 py-1.5 transition-all duration-200 font-medium block",
            locale === lang
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
