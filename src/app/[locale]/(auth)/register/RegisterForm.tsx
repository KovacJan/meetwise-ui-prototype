"use client";

import {useLocale, useTranslations} from "next-intl";
import {useActionState, useState} from "react";
import {useFormStatus} from "react-dom";
import {useRouter} from "../../../../../i18n/navigation";
import GlassCard from "@/components/GlassCard";
import Loader from "@/components/Loader";
import PasswordInput from "@/components/PasswordInput";
import {signUp, resendConfirmation, type RegisterState} from "./actions";

const initialState: RegisterState = {};

function SubmitButton({disabled}: {disabled: boolean}) {
  const {pending} = useFormStatus();
  const t = useTranslations("auth");
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="w-full mt-6 py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
    >
      {pending ? (
        <>
          <Loader variant="inline" className="text-secondary-foreground" />
          {t("creatingAccount")}
        </>
      ) : (
        t("register")
      )}
    </button>
  );
}

function ResendButton() {
  const {pending} = useFormStatus();
  const t = useTranslations("auth");
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-3 text-sm text-secondary hover:underline font-medium disabled:opacity-60 flex items-center gap-1"
    >
      {pending ? (
        <>
          <Loader variant="inline" />
          {t("resending")}
        </>
      ) : (
        t("resendEmail")
      )}
    </button>
  );
}

export function RegisterForm({teamCode, next}: {teamCode?: string; next?: string}) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("auth");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<{email: boolean; password: boolean}>({
    email: false,
    password: false,
  });
  const [fieldErrors, setFieldErrors] = useState<{email?: string; password?: string}>({});

  const [state, formAction] = useActionState(signUp.bind(null, locale), initialState);
  const [resendState, resendAction] = useActionState(resendConfirmation, initialState);

  const validateEmail = (value: string) => {
    if (!value.trim()) return t("emailRequired");
    if (!/\S+@\S+\.\S+/.test(value)) return t("emailInvalid");
    return "";
  };

  const validatePassword = (value: string) => {
    if (!value.trim()) return t("passwordRequired");
    if (value.length < 8) return t("passwordTooShort");
    return "";
  };

  const handleEmailBlur = () => {
    setTouched((prev) => ({...prev, email: true}));
    setFieldErrors((prev) => ({...prev, email: validateEmail(email) || undefined}));
  };

  const handlePasswordBlur = () => {
    setTouched((prev) => ({...prev, password: true}));
    setFieldErrors((prev) => ({...prev, password: validatePassword(password) || undefined}));
  };

  const isFormValid = !validateEmail(email) && !validatePassword(password);
  const confirmedEmail = state.email ?? resendState.email ?? email;
  const devConfirmUrl = state.devConfirmUrl ?? resendState.devConfirmUrl;

  // Show confirmation-pending screen
  if (state.awaitingConfirmation || resendState.awaitingConfirmation) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <GlassCard className="w-full max-w-md animate-scale-in text-center">
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl gradient-blue-cyan flex items-center justify-center font-bold text-lg text-foreground">
              M
            </div>
            <span className="text-xl font-bold text-foreground">MeetWise</span>
          </div>

          <div className="w-14 h-14 rounded-full bg-secondary/20 border border-secondary/40 flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">✉️</span>
          </div>

          <h2 className="text-xl font-bold text-foreground mb-2">{t("checkEmail")}</h2>
          <p className="text-sm text-muted-foreground mb-2">{t("checkEmailSentTo")}</p>
          <p className="text-sm font-semibold text-foreground mb-6 break-all">{confirmedEmail}</p>
          <p className="text-xs text-muted-foreground mb-6">{t("confirmInstructions")}</p>

          {/* Dev-mode fallback: direct confirmation link when email delivery fails */}
          {devConfirmUrl && (
            <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left">
              <p className="text-xs font-semibold text-amber-400 mb-1">Dev mode — email not delivered</p>
              <p className="text-xs text-muted-foreground mb-2">
                Click the link below to confirm your account directly (only visible in development):
              </p>
              <a
                href={devConfirmUrl}
                className="text-xs text-secondary underline break-all"
              >
                Confirm account →
              </a>
            </div>
          )}

          {resendState.error && (
            <p className="text-xs text-destructive-foreground mb-2">{resendState.error}</p>
          )}

          <form action={resendAction}>
            <input type="hidden" name="email" value={confirmedEmail} />
            <ResendButton />
          </form>

          <div className="mt-6 pt-4 border-t border-border">
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="text-sm text-secondary hover:underline font-medium"
            >
              {t("alreadyConfirmed")}
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <GlassCard className="w-full max-w-md animate-scale-in">
        <form action={formAction}>
          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl gradient-blue-cyan flex items-center justify-center font-bold text-lg text-foreground">
              M
            </div>
            <span className="text-xl font-bold text-foreground">MeetWise</span>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-2">{t("createAccount")}</h2>
          <p className="text-sm text-muted-foreground mb-8">{t("createAccountDesc")}</p>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                {t("fullName")}<span className="text-destructive ml-0.5">*</span>
              </label>
              <input
                type="text"
                name="fullName"
                required
                placeholder={t("fullNamePlaceholder")}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                {t("email")}<span className="text-destructive ml-0.5">*</span>
              </label>
              <input
                type="email"
                name="email"
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (touched.email)
                    setFieldErrors((prev) => ({...prev, email: validateEmail(e.target.value) || undefined}));
                }}
                onBlur={handleEmailBlur}
                className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
              />
              {touched.email && fieldErrors.email && (
                <p className="mt-1 text-xs text-destructive-foreground">{fieldErrors.email}</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                {t("password")}<span className="text-destructive ml-0.5">*</span>
              </label>
              <PasswordInput
                name="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (touched.password)
                    setFieldErrors((prev) => ({...prev, password: validatePassword(e.target.value) || undefined}));
                }}
                onBlur={handlePasswordBlur}
              />
              {touched.password && fieldErrors.password && (
                <p className="mt-1 text-xs text-destructive-foreground">{fieldErrors.password}</p>
              )}
            </div>
          </div>

          {/* Pass next URL through form so the action can redirect after signup */}
          {next && <input type="hidden" name="next" value={next} />}

          {teamCode && (
            <p className="mt-4 text-xs text-muted-foreground">
              You&apos;re joining team code <span className="font-mono">{teamCode}</span> after signup.
            </p>
          )}

          {state.error && (
            <div className="mt-4 rounded-xl border border-destructive/70 bg-destructive/25 px-4 py-3 text-sm text-destructive-foreground flex items-start gap-2 shadow-lg shadow-destructive/30">
              <span className="mt-0.5 text-lg leading-none">!</span>
              <p className="flex-1">{state.error}</p>
            </div>
          )}

          <SubmitButton disabled={!isFormValid} />

          <p className="text-center text-sm text-muted-foreground mt-6">
            {t("alreadyAccount")}{" "}
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="text-secondary hover:underline font-medium"
            >
              {t("login")}
            </button>
          </p>
        </form>
      </GlassCard>
    </div>
  );
}
