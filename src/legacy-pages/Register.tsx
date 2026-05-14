"use client";

import {useState} from "react";
import {useRouter} from "../../i18n/navigation";
import {useTranslations} from "next-intl";
import GlassCard from "@/components/GlassCard";
import {Users, UserPlus} from "lucide-react";

const Register = () => {
  const router = useRouter();
  const tAuth = useTranslations("auth");
  const [step, setStep] = useState<"form" | "role">("form");
  const [teamCode, setTeamCode] = useState("");

  if (step === "role") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-2xl animate-scale-in">
          <h2 className="text-2xl font-bold text-foreground text-center mb-2">Almost there!</h2>
          <p className="text-sm text-muted-foreground text-center mb-8">How would you like to use MeetWise?</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <GlassCard onClick={() => router.push("/onboarding")} className="text-center cursor-pointer hover:border-secondary/40 transition-all">
              <div className="w-14 h-14 rounded-2xl gradient-purple-blue flex items-center justify-center mx-auto mb-4">
                <Users size={24} className="text-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Create a Team</h3>
              <p className="text-sm text-muted-foreground">Start as a manager. Set up your team and invite members.</p>
            </GlassCard>

            <GlassCard className="text-center">
              <div className="w-14 h-14 rounded-2xl gradient-blue-cyan flex items-center justify-center mx-auto mb-4">
                <UserPlus size={24} className="text-foreground" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Join a Team</h3>
              <p className="text-sm text-muted-foreground mb-4">Enter the team code shared by your manager.</p>
              <input
                value={teamCode}
                onChange={(e) => setTeamCode(e.target.value)}
                placeholder="TEAM-XXXXXX"
                className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground text-sm text-center font-mono focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
              />
              <button
                onClick={() => router.push("/onboarding")}
                className="w-full mt-3 py-2.5 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                Join
              </button>
            </GlassCard>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <GlassCard className="w-full max-w-md animate-scale-in">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-9 h-9 rounded-xl gradient-blue-cyan flex items-center justify-center font-bold text-lg text-foreground">M</div>
          <span className="text-xl font-bold text-foreground">MeetWise</span>
        </div>

        <h2 className="text-2xl font-bold text-foreground mb-2">{tAuth("register")}</h2>
        <p className="text-sm text-muted-foreground mb-8">Start tracking meeting costs today</p>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">{tAuth("email")}</label>
            <input type="email" placeholder="you@company.com" className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">{tAuth("password")}</label>
            <input type="password" placeholder="••••••••" className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50" />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1.5 block">Confirm Password</label>
            <input type="password" placeholder="••••••••" className="w-full px-4 py-3 rounded-xl bg-input border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50" />
          </div>
        </div>

        <button
          onClick={() => setStep("role")}
          className="w-full mt-6 py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
        >
          Continue
        </button>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{" "}
          <button onClick={() => router.push("/login")} className="text-secondary hover:underline font-medium">
            Sign in
          </button>
        </p>
      </GlassCard>
    </div>
  );
};

export default Register;
