"use client";

import {useActionState} from "react";
import {useFormStatus} from "react-dom";
import {useTranslations} from "next-intl";
import {
  createTeam,
  joinTeam,
  type OnboardingState,
  skipOnboarding,
} from "@/app/[locale]/(auth)/onboarding/actions";
import GlassCard from "@/components/GlassCard";
import Loader from "@/components/Loader";

interface OnboardingProps {
  locale: "en" | "de";
}

const initialState: OnboardingState = {error: undefined};

function CreateSubmitButton() {
  const {pending} = useFormStatus();
  const t = useTranslations("onboarding");
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 rounded-xl bg-secondary text-secondary-foreground text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
    >
      {pending ? (
        <>
          <Loader variant="inline" className="text-secondary-foreground" />
          {t("creatingButton")}
        </>
      ) : (
        t("createButton")
      )}
    </button>
  );
}

function JoinSubmitButton() {
  const {pending} = useFormStatus();
  const t = useTranslations("onboarding");
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full py-2.5 rounded-xl glass text-xs font-semibold text-foreground hover:bg-secondary/20 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
    >
      {pending ? (
        <>
          <Loader variant="inline" />
          {t("joiningButton")}
        </>
      ) : (
        t("joinButton")
      )}
    </button>
  );
}

const Onboarding = ({locale}: OnboardingProps) => {
  const t = useTranslations("onboarding");

  const [createState, createAction] = useActionState<OnboardingState, FormData>(
    createTeam.bind(null, locale),
    initialState,
  );

  const [joinState, joinAction] = useActionState<OnboardingState, FormData>(
    joinTeam.bind(null, locale),
    initialState,
  );

  const [skipState, skipAction] = useActionState<OnboardingState, FormData>(
    skipOnboarding.bind(null, locale),
    initialState,
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-[1.2fr,1fr] gap-6 items-start">
        <GlassCard className="animate-scale-in">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl gradient-blue-cyan flex items-center justify-center font-bold text-lg text-foreground">
              M
            </div>
            <span className="text-xl font-bold text-foreground">MeetWise</span>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-2">{t("title")}</h2>
          <p className="text-sm text-muted-foreground mb-6">{t("desc")}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Create team */}
            <form action={createAction} className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">{t("createTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("createDesc")}</p>
              <div>
                <label className="text-xs font-medium text-foreground mb-1.5 block">
                  {t("teamName")}<span className="text-destructive ml-0.5">*</span>
                </label>
                <input
                  name="teamName"
                  placeholder={t("teamNamePlaceholder")}
                  className="w-full px-3 py-2 rounded-xl bg-input border border-border text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              {/* Fixed-height error slot with standardized container */}
              <div className="min-h-[2.5rem]">
                {createState.error && (
                  <div className="rounded-xl border border-destructive/70 bg-destructive/25 px-3 py-2 text-xs text-destructive-foreground flex items-start gap-1.5">
                    <span className="shrink-0 font-bold">!</span>
                    <span>{createState.error}</span>
                  </div>
                )}
              </div>
              <CreateSubmitButton />
            </form>

            {/* Join team */}
            <form action={joinAction} className="space-y-3">
              <h3 className="text-sm font-semibold text-foreground">{t("joinTitle")}</h3>
              <p className="text-xs text-muted-foreground">{t("joinDesc")}</p>
              <div>
                <label className="text-xs font-medium text-foreground mb-1.5 block">
                  {t("teamCode")}<span className="text-destructive ml-0.5">*</span>
                </label>
                <input
                  name="teamCode"
                  placeholder={t("teamCodePlaceholder")}
                  className="w-full px-3 py-2 rounded-xl bg-input border border-border text-foreground text-xs font-mono tracking-wide focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                />
              </div>
              {/* Fixed-height error slot with standardized container */}
              <div className="min-h-[2.5rem]">
                {joinState.error && (
                  <div className="rounded-xl border border-destructive/70 bg-destructive/25 px-3 py-2 text-xs text-destructive-foreground flex items-start gap-1.5">
                    <span className="shrink-0 font-bold">!</span>
                    <span>{joinState.error}</span>
                  </div>
                )}
              </div>
              <JoinSubmitButton />
            </form>
          </div>

          {/* Skip */}
          <div className="mt-6 border-t border-border/50 pt-4">
            {skipState.error && (
              <div className="mb-3 rounded-xl border border-destructive/70 bg-destructive/25 px-3 py-2 text-xs text-destructive-foreground flex items-start gap-1.5">
                <span className="shrink-0 font-bold">!</span>
                <span>{skipState.error}</span>
              </div>
            )}
            <form action={skipAction} className="flex justify-center">
              <button
                type="submit"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("skip")}
              </button>
            </form>
          </div>
        </GlassCard>

        <GlassCard className="hidden md:block animate-fade-in">
          <h3 className="text-sm font-semibold text-foreground mb-2">{t("whatNextTitle")}</h3>
          <p className="text-xs text-muted-foreground mb-4">{t("whatNextDesc")}</p>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li>• {t("whatNextItem1")}</li>
            <li>• {t("whatNextItem2")}</li>
            <li>• {t("whatNextItem3")}</li>
            <li>• {t("whatNextItem4")}</li>
          </ul>
        </GlassCard>
      </div>
    </div>
  );
};

export default Onboarding;
