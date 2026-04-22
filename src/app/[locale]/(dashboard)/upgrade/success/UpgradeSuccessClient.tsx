"use client";

import {useState} from "react";
import {useRouter} from "i18n/navigation";
import GlassCard from "@/components/GlassCard";
import {CheckCircle2, Loader2} from "lucide-react";
import {useUser} from "@/contexts/UserContext";

export default function UpgradeSuccessClient() {
  const router = useRouter();
  const {setPlan} = useUser();
  const [loading, setLoading] = useState(false);

  const handleDashboard = async () => {
    setLoading(true);
    try {
      // Best-effort: mark team as Pro immediately so server state is correct
      await fetch("/api/stripe/mark-pro", {method: "POST"});
      // Immediately reflect Pro status in the client user context
      setPlan("pro");
    } catch {
      // Ignore errors here; Stripe webhook will still update plan as fallback
    } finally {
      router.push("/dashboard");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16">
      <GlassCard className="max-w-lg mx-auto text-center animate-scale-in">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
          style={{background: "linear-gradient(135deg, hsl(232,60%,55%), hsl(190,70%,50%))"}}
        >
          <CheckCircle2 size={32} className="text-white" />
        </div>

        <div className="mb-2 inline-block px-3 py-1 rounded-full text-xs font-semibold bg-secondary/20 text-secondary border border-secondary/30">
          Pro Plan Active
        </div>

        <h2 className="text-2xl font-bold text-foreground mt-3 mb-3">
          Welcome to MeetWise Pro!
        </h2>
        <p className="text-sm text-muted-foreground mb-8">
          Your subscription is now active. Enjoy unlimited AI insights,
          full cost history, and advanced forecasting.
        </p>
        <button
          type="button"
          onClick={handleDashboard}
          disabled={loading}
          className="cursor-pointer px-8 py-3 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-70 flex items-center justify-center gap-2 mx-auto"
        >
          {loading && <Loader2 size={15} className="animate-spin" />}
          Go to dashboard
        </button>
      </GlassCard>
    </div>
  );
}
