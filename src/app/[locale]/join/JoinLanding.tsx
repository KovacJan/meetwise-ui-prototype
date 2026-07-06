"use client";

import {useTranslations, useLocale} from "next-intl";
import Link from "next/link";
import GlassCard from "@/components/GlassCard";
import LanguageSwitcher from "@/components/LanguageSwitcher";
import {Users} from "lucide-react";

interface JoinLandingProps {
  teamName: string;
  teamCode: string;
  joinHref: string;
}

export default function JoinLanding({teamName, teamCode, joinHref}: JoinLandingProps) {
  const t = useTranslations("join");
  const locale = useLocale();

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      {/* Language switcher */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>

      <GlassCard className="w-full max-w-md animate-scale-in text-center">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl gradient-blue-cyan flex items-center justify-center font-bold text-lg text-foreground">
            M
          </div>
          <span className="text-xl font-bold text-foreground">MeetWise</span>
        </div>

        {/* Team icon */}
        <div className="w-16 h-16 rounded-2xl gradient-blue-cyan flex items-center justify-center mx-auto mb-6">
          <Users size={28} className="text-foreground" />
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-2">
          {t("inviteTitle")}
        </h2>
        <p className="text-base text-muted-foreground mb-1">
          {t("joinTeamLabel")}
        </p>
        <p className="text-lg font-semibold text-foreground mb-1">{teamName}</p>
        <p className="text-xs text-muted-foreground font-mono mb-8">
          {t("code")}: <span className="text-foreground">{teamCode}</span>
        </p>

        {/* Primary CTA: sign in and join */}
        <Link
          href={`/${locale}/login?next=${encodeURIComponent(joinHref)}`}
          className="block w-full py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm hover:opacity-90 transition-opacity mb-3"
        >
          {t("signInToJoin")}
        </Link>

        {/* Secondary CTA: register and join */}
        <Link
          href={`/${locale}/register?next=${encodeURIComponent(joinHref)}`}
          className="block w-full py-3 rounded-xl glass text-foreground font-semibold text-sm hover:bg-secondary/20 transition-colors"
        >
          {t("registerToJoin")}
        </Link>

        <p className="mt-6 text-xs text-muted-foreground">
          {t("alreadyMember")}{" "}
          <Link href={`/${locale}/login`} className="text-secondary hover:underline">
            {t("signIn")}
          </Link>
        </p>
      </GlassCard>
    </div>
  );
}
