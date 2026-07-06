"use client";

import {useState, useActionState, useEffect, useRef} from "react";
import {useFormStatus} from "react-dom";
import {useTranslations} from "next-intl";
import AppSidebar from "@/components/AppSidebar";
import TopBar from "@/components/TopBar";
import GlassCard from "@/components/GlassCard";
import Loader from "@/components/Loader";
import PasswordInput from "@/components/PasswordInput";
import {cn} from "@/lib/utils";
import {toast} from "sonner";
import {Pencil, Check, X, Sparkles, KeyRound, ChevronDown, ChevronUp} from "lucide-react";
import {useRouter} from "../../i18n/navigation";
import {useUser} from "@/contexts/UserContext";
import {
  updateDisplayName,
  changePassword,
  clearTeamCalendar,
  downgradePlanToFree,
  disconnectMicrosoftCalendar,
  type ProfileActionState,
  type PasswordActionState,
  type ClearCalendarState,
  type PlanActionState,
  type DisconnectCalendarState,
} from "@/app/[locale]/(dashboard)/settings/actions";

function SaveNameButton() {
  const {pending} = useFormStatus();
  const t = useTranslations("settings");
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
    >
      {pending ? <Loader variant="inline" className="text-secondary-foreground" /> : <Check size={13} />}
      {pending ? t("saving") : t("saveName")}
    </button>
  );
}

function SavePasswordButton() {
  const {pending} = useFormStatus();
  const t = useTranslations("settings");
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
    >
      {pending && <Loader variant="inline" className="text-secondary-foreground" />}
      {pending ? t("saving") : t("savePassword")}
    </button>
  );
}

function ClearCalendarButton() {
  const {pending} = useFormStatus();
  const t = useTranslations("settings");
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-destructive/40 text-xs font-semibold text-destructive-foreground hover:bg-destructive/10 disabled:opacity-60 transition-colors whitespace-nowrap"
    >
      {pending && <Loader variant="inline" className="text-destructive-foreground" />}
      {pending ? t("clearing") : t("clearCalendarButton")}
    </button>
  );
}

type RateMode = "per-member" | "average" | "none";

const teamMembers = [
  {name: "Sarah Miller", email: "sarah@company.com"},
  {name: "Tom Berger", email: "tom@company.com"},
  {name: "Lisa Chen", email: "lisa@company.com"},
  {name: "Max Weber", email: "max@company.com"},
];

const SettingsPage = () => {
  const t = useTranslations("settings");
  const {displayName, email, initials, plan, setPlan} = useUser();
  const isPro = plan === "pro";
  const router = useRouter();
  const [rateMode, setRateMode] = useState<RateMode>("average");
  const [averageRate, setAverageRate] = useState("60");
  const [memberRates, setMemberRates] = useState<Record<string, string>>(
    Object.fromEntries(teamMembers.map((m) => [m.email, "60"])),
  );
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(displayName ?? "");
  const [nameState, nameAction] = useActionState<ProfileActionState, FormData>(
    updateDisplayName,
    {},
  );
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordState, passwordAction] = useActionState<PasswordActionState, FormData>(
    changePassword,
    {},
  );
  const [clearState, clearAction] = useActionState<ClearCalendarState, FormData>(
    clearTeamCalendar,
    {},
  );
  const [planState, planAction] = useActionState<PlanActionState, FormData>(
    downgradePlanToFree,
    {},
  );
  const [disconnectState, disconnectAction] = useActionState<DisconnectCalendarState, FormData>(
    disconnectMicrosoftCalendar,
    {},
  );

  useEffect(() => {
    if (passwordState.success) {
      toast.success(t("passwordChanged"));
      setShowPasswordForm(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passwordState.success]);

  useEffect(() => {
    if (clearState.success) {
      toast.success(t("clearCalendarDone"));
    }
    if (clearState.error) {
      toast.error(clearState.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearState.success, clearState.error]);

  const planHandledRef = useRef(false);
  useEffect(() => {
    if (planState.success && !planHandledRef.current) {
      planHandledRef.current = true;
      toast.success(t("planTestDowngradeDone"));
      setPlan("free");
    }
    if (planState.error) {
      toast.error(planState.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planState.success, planState.error]);

  useEffect(() => {
    if (disconnectState.success) {
      toast.success(t("disconnectCalendarDone"));
    }
    if (disconnectState.error) {
      toast.error(disconnectState.error);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disconnectState.success, disconnectState.error]);

  const handleSave = () => {
    toast.success(t("saved"));
  };

  const rateModeOptions = [
    {value: "per-member" as const, label: t("perMember")},
    {value: "average" as const, label: t("averageRate")},
    {value: "none" as const, label: t("noRates")},
  ];

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        <TopBar />
        <main className="flex-1 w-full min-w-0 p-4 sm:p-6 lg:p-8 max-w-2xl mx-auto pb-24 md:pb-6 lg:pb-8 overflow-x-hidden">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-4 sm:mb-6">{t("title")}</h2>

          <div className="space-y-6">
            {/* Account */}
            <GlassCard className="animate-fade-in p-4 sm:p-6">
              <h3 className="font-semibold text-foreground mb-3 sm:mb-4">{t("account")}</h3>
              <div className="space-y-4">
                {/* Avatar + Name */}
                <div className="flex items-center gap-3 sm:gap-4">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold text-white shrink-0"
                    style={{
                      background: "linear-gradient(135deg, hsl(270,60%,50%), hsl(232,60%,55%))",
                    }}
                  >
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    {editingName ? (
                      <form
                        action={(fd) => {
                          nameAction(fd);
                          setEditingName(false);
                        }}
                        className="flex flex-wrap items-center gap-2 w-full"
                      >
                        <input
                          name="displayName"
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          autoFocus
                          className="min-w-0 flex-1 basis-24 px-3 py-2 rounded-lg bg-input border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          placeholder={t("namePlaceholder")}
                        />
                        <div className="flex items-center gap-1">
                          <SaveNameButton />
                        <button
                          type="button"
                          onClick={() => {
                            setEditingName(false);
                            setNameInput(displayName ?? "");
                          }}
                          className="text-muted-foreground hover:text-foreground transition-colors p-1"
                        >
                          <X size={14} />
                        </button>
                        </div>
                      </form>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {displayName ?? t("nameFallback")}
                        </p>
                        <button
                          onClick={() => {
                            setNameInput(displayName ?? "");
                            setEditingName(true);
                          }}
                          className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                          title={t("editName")}
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {email ?? ""}
                    </p>
                    {nameState.success && (
                      <p className="text-xs text-emerald-400 mt-1">{t("nameSaved")}</p>
                    )}
                    {nameState.error && (
                      <p className="text-xs text-destructive-foreground mt-1">{nameState.error}</p>
                    )}
                  </div>
                </div>

                {/* Plan badge */}
                {isPro ? (
                  <div
                    className="flex items-center gap-2 px-3 py-2 rounded-xl border"
                    style={{
                      background: "linear-gradient(135deg, hsla(45,90%,55%,0.10), hsla(32,90%,50%,0.07))",
                      borderColor: "hsla(45,90%,55%,0.25)",
                    }}
                  >
                    <Sparkles size={14} className="text-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-amber-400">{t("proPlan")}</p>
                      <p className="text-xs text-muted-foreground">{t("proPlanDesc")}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-2 glass rounded-xl">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground">{t("freePlan")}</p>
                      <p className="text-xs text-muted-foreground">{t("freePlanDesc")}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => router.push("/upgrade")}
                      className="cursor-pointer shrink-0 text-xs px-2.5 py-1 rounded-lg bg-secondary text-secondary-foreground font-semibold hover:opacity-90 transition-opacity"
                    >
                      {t("upgradePro")}
                    </button>
                  </div>
                )}

                {/* Change password section */}
                <div className="pt-2 border-t border-border/30">
                  <button
                    type="button"
                    onClick={() => setShowPasswordForm((v) => !v)}
                    className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-xl glass text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
                  >
                    <KeyRound size={14} />
                    <span className="flex-1 text-left">{t("changePassword")}</span>
                    {showPasswordForm ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {showPasswordForm && (
                    <form
                      action={(fd) => {
                        passwordAction(fd);
                      }}
                      className="mt-3 space-y-3 animate-fade-in"
                    >
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">
                          {t("currentPassword")}
                        </label>
                        <PasswordInput
                          name="currentPassword"
                          required
                          placeholder="••••••••"
                          className="py-2.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">
                          {t("newPassword")}
                        </label>
                        <PasswordInput
                          name="newPassword"
                          required
                          placeholder="••••••••"
                          className="py-2.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">
                          {t("confirmPassword")}
                        </label>
                        <PasswordInput
                          name="confirmPassword"
                          required
                          placeholder="••••••••"
                          className="py-2.5 text-sm"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <SavePasswordButton />
                        <button
                          type="button"
                          onClick={() => setShowPasswordForm(false)}
                          className="cursor-pointer px-4 py-2.5 rounded-xl glass text-sm text-muted-foreground hover:text-foreground transition-colors touch-manipulation min-h-[44px]"
                        >
                          {t("cancel")}
                        </button>
                      </div>
                      {passwordState.success && (
                        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-400 flex items-center gap-2">
                          <Check size={13} />
                          {t("passwordChanged")}
                        </div>
                      )}
                      {passwordState.error && (
                        <div className="rounded-xl border border-destructive/50 bg-destructive/15 px-4 py-2.5 text-xs text-destructive-foreground">
                          {passwordState.error}
                        </div>
                      )}
                    </form>
                  )}
                </div>

                {/* Calendar & test utilities */}
                <div className="pt-4 border-t border-border/30 space-y-4">
                  {/* Disconnect calendar */}
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="text-xs text-muted-foreground min-w-0 sm:max-w-xs">
                      {t("calendarConnectionLabel")}
                    </div>
                    <form className="shrink-0"
                      action={(fd) => {
                        fd.set("confirm", "yes");
                        disconnectAction(fd);
                      }}
                    >
                      <button
                        type="submit"
                        className="px-3.5 py-1.5 rounded-lg bg-secondary/10 text-[11px] font-semibold text-muted-foreground hover:text-secondary-foreground hover:bg-secondary transition-colors whitespace-nowrap"
                      >
                        {t("disconnectCalendarButton")}
                      </button>
                    </form>
                  </div>

                  {/* Danger zone: clear calendar items for team (managers only) */}
                  <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-destructive-foreground uppercase tracking-wide">
                          {t("clearCalendarTitle")}
                        </h4>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {t("clearCalendarDesc")}
                        </p>
                      </div>
                      <form
                        action={(fd) => {
                          fd.set("confirm", "yes");
                          clearAction(fd);
                        }}
                        className="shrink-0"
                      >
                        <ClearCalendarButton />
                      </form>
                    </div>
                    {clearState.deletedCount !== undefined &&
                      clearState.deletedCount >= 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          {t("clearCalendarSummary", {
                            count: clearState.deletedCount,
                          })}
                        </p>
                      )}
                  </div>

                  {/* Test-only: downgrade Pro plan back to Free (managers only, when Pro) */}
                  {isPro ? (
                    <div className="rounded-xl border border-amber-400/40 bg-amber-500/5 px-4 py-3 space-y-3">
                      <form
                        action={(fd) => {
                          fd.set("confirm", "yes");
                          planAction(fd);
                        }}
                        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="text-[11px] text-muted-foreground min-w-0 flex-1">
                          <span className="font-semibold text-amber-300 whitespace-nowrap">
                            {t("planTestDowngrade")}
                          </span>
                        </div>
                        <button
                          type="submit"
                          className="px-3 py-1.5 rounded-lg border border-amber-400/60 text-[11px] font-semibold text-amber-300 hover:bg-amber-500/10 transition-colors whitespace-nowrap"
                        >
                          {t("planTestDowngrade")}
                        </button>
                      </form>
                      <p className="text-[11px] text-muted-foreground">
                        {t("planTestDowngradeDesc")}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            </GlassCard>

          </div>
        </main>
      </div>
    </div>
  );
};

export default SettingsPage;
