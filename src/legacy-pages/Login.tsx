"use client";

import {useState} from "react";
import {useRouter} from "../../i18n/navigation";
import {useTranslations} from "next-intl";
import GlassCard from "@/components/GlassCard";

const Login = () => {
  const router = useRouter();
  const tAuth = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <GlassCard className="w-full max-w-md animate-scale-in">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl gradient-blue-cyan flex items-center justify-center font-bold text-lg text-foreground">M</div>
          <span className="text-xl font-bold text-foreground">MeetWise</span>
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-2">{tAuth("login")}</h2>
        <p className="text-sm text-muted-foreground mb-8">Sign in to your account</p>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">{tAuth("email")}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">{tAuth("password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        <button
          onClick={() => router.push("/dashboard")}
          className="w-full mt-6 py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          {tAuth("login")}
        </button>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Don't have an account?{" "}
          <button onClick={() => router.push("/register")} className="text-secondary hover:underline font-medium">
            Register
          </button>
        </p>
      </GlassCard>
    </div>
  );
};

export default Login;
