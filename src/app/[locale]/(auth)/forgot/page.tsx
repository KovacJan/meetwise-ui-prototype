"use client";

import {useActionState, useState} from "react";
import {useFormStatus} from "react-dom";
import {useRouter} from "next/navigation";
import {ArrowLeft} from "lucide-react";
import {useTranslations} from "next-intl";
import GlassCard from "@/components/GlassCard";
import {requestPasswordReset, type ForgotState} from "../../../auth/forgot/actions";

const initialState: ForgotState = {error: undefined, message: undefined};

function SubmitButton({disabled}: {disabled: boolean}) {
  const {pending} = useFormStatus();
  const t = useTranslations("auth");
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="w-full mt-6 py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
    >
      {pending ? t("resetSending") : t("resetCta")}
    </button>
  );
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [state, formAction] = useActionState(requestPasswordReset, initialState);

  const validateEmail = (value: string) => {
    if (!value.trim()) return t("emailRequired");
    const basic = /\S+@\S+\.\S+/;
    if (!basic.test(value)) return t("emailInvalid");
    return "";
  };

  const handleBlur = () => {
    setTouched(true);
    const error = validateEmail(email);
    setFieldError(error || undefined);
  };

  const isFormValid = !validateEmail(email);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form action={formAction}>
        <GlassCard className="w-full max-w-md animate-scale-in">
          <button
            type="button"
            onClick={() => router.back()}
            className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            <ArrowLeft size={14} />
            <span>{t("backToLogin")}</span>
          </button>

          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl gradient-blue-cyan flex items-center justify-center font-bold text-lg text-foreground">
              M
            </div>
            <span className="text-xl font-bold text-foreground">MeetWise</span>
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-2">
            {t("resetTitle")}
          </h2>
          <p className="text-sm text-muted-foreground mb-8">
            {t("resetSubtitle")}
          </p>

          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">
              {t("email")}
              <span className="text-destructive ml-0.5">*</span>
            </label>
            <input
              type="email"
              name="email"
              required
              placeholder="you@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (touched) {
                  const error = validateEmail(e.target.value);
                  setFieldError(error || undefined);
                }
              }}
              onBlur={handleBlur}
              className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
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
            <div className="mt-4 rounded-xl border border-emerald-500/70 bg-emerald-500/20 px-4 py-3 text-sm text-emerald-400 flex items-start gap-2 shadow-lg shadow-emerald-500/30">
              <span className="mt-0.5 text-lg leading-none">✓</span>
              <p className="flex-1">{state.message}</p>
            </div>
          )}

          <SubmitButton disabled={!isFormValid} />
        </GlassCard>
      </form>
    </div>
  );
}

