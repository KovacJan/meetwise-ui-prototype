"use client";

import {useLocale, useTranslations} from "next-intl";
import {useActionState, useState} from "react";
import {useFormStatus} from "react-dom";
import {useRouter} from "../../../../../i18n/navigation";
import GlassCard from "@/components/GlassCard";
import Loader from "@/components/Loader";
import PasswordInput from "@/components/PasswordInput";
import {signIn, resendLoginConfirmation, type LoginState} from "./actions";

const initialState: LoginState = {};

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
          {t("signingIn")}
        </>
      ) : (
        t("login")
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
      className="text-sm text-secondary hover:underline font-medium disabled:opacity-60 flex items-center gap-1"
    >
      {pending ? (
        <>
          <Loader variant="inline" />
          {t("sending")}
        </>
      ) : (
        t("resendEmail")
      )}
    </button>
  );
}

export function LoginForm({notice, next}: {notice?: string; next?: string}) {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations("auth");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<{email: boolean; password: boolean}>({
    email: false,
    password: false,
  });
  const [fieldErrors, setFieldErrors] = useState<{email?: string; password?: string}>({});

  const [state, formAction] = useActionState(
    signIn.bind(null, locale),
    initialState,
  );
  const [resendState, resendAction] = useActionState(resendLoginConfirmation, initialState);

  const validateEmail = (value: string) => {
    if (!value.trim()) return t("emailRequired");
    if (!/\S+@\S+\.\S+/.test(value)) return t("emailInvalid");
    return "";
  };

  const validatePassword = (value: string) => {
    if (!value.trim()) return t("passwordRequired");
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
  const resendEmail = state.unconfirmedEmail ?? email;
  const showResend =
    (state.needsConfirmation || state.unconfirmedEmail) && !resendState.resentConfirmation;

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

          <h2 className="text-2xl font-bold text-foreground mb-2">{t("welcomeBack")}</h2>
          <p className="text-sm text-muted-foreground mb-8">{t("signInDesc")}</p>

          {/* Pass next URL through form so action can redirect after sign-in */}
          {next && <input type="hidden" name="next" value={next} />}

          {/* Notice from callback redirect (e.g. email confirmed, expired link) */}
          {notice && (
            <div className="mb-4 rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-200 flex items-start gap-2">
              <span className="mt-0.5 shrink-0">⚠</span>
              <p className="flex-1">{notice}</p>
            </div>
          )}

          <div className="space-y-4">
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

          {state.error && (
            <div className="mt-4 rounded-xl border border-destructive/70 bg-destructive/25 px-4 py-3 text-sm text-destructive-foreground flex items-start gap-2 shadow-lg shadow-destructive/30">
              <span className="mt-0.5 text-lg leading-none">!</span>
              <p className="flex-1">{state.error}</p>
            </div>
          )}

          <SubmitButton disabled={!isFormValid} />
        </form>

        {/* Resend confirmation email */}
        {showResend && (
          <div className="mt-4 pt-4 border-t border-border">
            {resendState.error && (
              <p className="text-xs text-destructive-foreground mb-2">{resendState.error}</p>
            )}
            <p className="text-xs text-muted-foreground mb-2">
              Didn&apos;t get the confirmation email?
            </p>
            <form action={resendAction}>
              <input type="hidden" name="email" value={resendEmail} />
              <ResendButton />
            </form>
          </div>
        )}

        {resendState.resentConfirmation && (
          <div className="mt-4 rounded-xl border border-secondary/50 bg-secondary/10 px-4 py-3 text-sm text-foreground">
            ✓ Confirmation email resent to <strong>{resendState.unconfirmedEmail}</strong>.
            Please check your inbox.
          </div>
        )}

        <p className="text-center text-sm text-muted-foreground mt-6">
          {t("noAccount")}{" "}
          <button
            type="button"
            onClick={() => router.push("/register")}
            className="text-secondary hover:underline font-medium"
          >
            {t("register")}
          </button>
        </p>
        <p className="text-center text-xs text-muted-foreground mt-3">
          <button
            type="button"
            onClick={() => router.push("/forgot")}
            className="text-secondary hover:underline font-medium"
          >
            {t("forgotPassword")}
          </button>
        </p>
      </GlassCard>
    </div>
  );
}
