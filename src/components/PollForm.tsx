import { useState } from "react";
import { cn } from "@/lib/utils";
import GlassCard from "./GlassCard";

interface PollFormProps {
  meetingName: string;
  onSubmit: () => void;
}

const PollForm = ({ meetingName, onSubmit }: PollFormProps) => {
  const [useful, setUseful] = useState<string | null>(null);
  const [duration, setDuration] = useState("");

  return (
    <GlassCard className="max-w-lg mx-auto animate-scale-in">
      <h3 className="text-lg font-semibold text-foreground mb-1">Meeting Poll</h3>
      <p className="text-sm text-muted-foreground mb-6">{meetingName}</p>

      <div className="mb-6">
        <p className="text-sm font-medium text-foreground mb-3">Was this meeting useful?</p>
        <div className="flex gap-2">
          {["Yes", "Partially", "No"].map((opt) => (
            <button
              key={opt}
              onClick={() => setUseful(opt)}
              className={cn(
                "px-5 py-2 rounded-xl text-sm font-medium transition-all duration-200",
                useful === opt
                  ? "bg-secondary text-secondary-foreground"
                  : "glass text-muted-foreground hover:text-foreground"
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <p className="text-sm font-medium text-foreground mb-3">What was the actual meeting duration?</p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="30"
            className="w-24 px-4 py-2 rounded-xl bg-input border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-sm text-muted-foreground">minutes</span>
        </div>
      </div>

      <button
        onClick={onSubmit}
        className="w-full py-3 rounded-xl bg-secondary text-secondary-foreground font-semibold text-sm hover:opacity-90 transition-opacity"
      >
        Submit
      </button>
    </GlassCard>
  );
};

export default PollForm;
