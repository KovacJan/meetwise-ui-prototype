"use client";

import {useActionState, useEffect} from "react";
import {useFormStatus} from "react-dom";
import {useTranslations} from "next-intl";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import GlassCard from "@/components/GlassCard";
import Loader from "@/components/Loader";
import {Users} from "lucide-react";
import {confirmJoinTeam, type ConfirmJoinResult} from "./actions";

interface JoinConfirmProps {
  teamName: string;
  teamCode: string;
  locale: string;
}

function JoinButton() {
  const {pending} = useFormStatus();
  const t = useTranslations("join");
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
    >
      {pending ? (
        <>
          <Loader variant="inline" className="text-secondary-foreground" />
          {t("joining")}
        </>
      ) : (
        t("confirmJoin")
      )}
    </button>
  );
}

export default function JoinConfirm({teamName, teamCode, locale}: JoinConfirmProps) {
  const t = useTranslations("join");
  const router = useRouter();

  const [state, action] = useActionState<ConfirmJoinResult | null, FormData>(
    async (_prev, _formData) => {
      return confirmJoinTeam(locale, teamCode);
    },
    null,
  );

  useEffect(() => {
    if (!state) return;

    if (state.success) {
      toast.success(t("joinedSuccess", {teamName}));
      // Brief delay so the user sees the toast before navigating
      const timer = setTimeout(() => {
        router.push(state.redirectTo);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [state, router, t, teamName]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
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
          {t("confirmTitle")}
        </h2>
        <p className="text-base text-muted-foreground mb-1">{t("joinTeamLabel")}</p>
        <p className="text-lg font-semibold text-foreground mb-1">{teamName}</p>
        <p className="text-xs text-muted-foreground font-mono mb-8">
          {t("code")}: <span className="text-foreground">{teamCode}</span>
        </p>

        {state && !state.success && (
          <div className="mb-4 rounded-xl border border-destructive/70 bg-destructive/25 px-4 py-3 text-sm text-destructive-foreground flex items-start gap-2 text-left">
            <span className="text-lg leading-none mt-0.5">!</span>
            <p className="flex-1">{state.error}</p>
          </div>
        )}

        {state?.success ? (
          <div className="py-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader variant="inline" />
            {t("redirecting")}
          </div>
        ) : (
          <form action={action}>
            <JoinButton />
          </form>
        )}

        {!state?.success && (
          <a
            href={`/${locale}/dashboard`}
            className="mt-4 block text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("skipJoin")}
          </a>
        )}
      </GlassCard>
    </div>
  );
}
