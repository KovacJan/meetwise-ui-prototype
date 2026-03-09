"use client";

import {useActionState, useEffect, useState} from "react";
import {useFormStatus} from "react-dom";
import Link from "next/link";
import {useTranslations} from "next-intl";
import GlassCard from "@/components/GlassCard";
import PasswordInput from "@/components/PasswordInput";
import {resetPassword, type ResetState} from "../../../auth/reset/actions";

const initialState: ResetState = {error: undefined, message: undefined};

function SubmitButton({disabled}: {disabled: boolean}) {
  const {pending} = useFormStatus();
  const t = useTranslations("auth");
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="w-full mt-6 py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
    >
      {pending ? t("resetUpdating") : t("resetUpdateCta")}
    </button>
  );
}

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [code, setCode] = useState<string | null>(null);
  const t = useTranslations("auth");
  const [state, formAction] = useActionState(resetPassword, initialState);

  const validatePassword = (value: string) => {
    if (!value.trim()) return t("passwordRequired");
    if (value.length < 8) return t("passwordTooShort");
    return "";
  };

  const handleBlur = () => {
    setTouched(true);
    const error = validatePassword(password);
    setFieldError(error || undefined);
  };

  // Read `code` query param from Supabase reset link (?code=...&type=recovery)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const {search} = window.location;
    if (!search) return;
    const params = new URLSearchParams(search);
    const value = params.get("code");
    if (value) setCode(value);
  }, []);

  const isFormValid = !validatePassword(password);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form action={formAction}>
        <GlassCard className="w-full max-w-md animate-scale-in">
          <input type="hidden" name="code" value={code ?? ""} />
          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl gradient-blue-cyan flex items-center justify-center font-bold text-lg text-foreground">
              M
            </div>
            <span className="text-xl font-bold text-foreground">MeetWise</span>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-2">
            {t("resetNewTitle")}
          </h2>
          <p className="text-sm text-muted-foreground mb-8">
            {t("resetNewSubtitle")}
          </p>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              {t("resetNewLabel")}
              <span className="text-destructive ml-0.5">*</span>
            </label>
            <PasswordInput
              name="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (touched) {
                  const error = validatePassword(e.target.value);
                  setFieldError(error || undefined);
                }
              }}
              onBlur={handleBlur}
            />
            {touched && fieldError && (
              <p className="mt-1 text-xs text-destructive-foreground">
                {fieldError}
              </p>
            )}
          </div>

          {state.error && (
            <div className="mt-4 rounded-xl border border-destructive/70 bg-destructive/25 px-4 py-3 text-sm text-destructive-foreground flex items-start gap-2 shadow-lg shadow-destructive/30">
              <span className="mt-0.5 text-lg leading-none">!</span>
              <p className="flex-1">{state.error}</p>
            </div>
          )}
          {state.message && (
            <div className="mt-4 rounded-xl border border-emerald-500/70 bg-emerald-500/20 px-4 py-3 text-sm text-emerald-400 flex flex-col gap-3 shadow-lg shadow-emerald-500/30">
              <div className="flex items-start gap-2">
                <span className="mt-0.5 text-lg leading-none">✓</span>
                <p className="flex-1">{state.message}</p>
              </div>
              <div className="flex justify-end">
                <Link
                  href="/en/login"
                  className="inline-flex items-center justify-center px-4 py-2 rounded-xl bg-secondary text-secondary-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
                >
                  {t("goToLogin")}
                </Link>
              </div>
            </div>
          )}

          {!state.message && <SubmitButton disabled={!isFormValid} />}
        </GlassCard>
      </form>
    </div>
  );
}

