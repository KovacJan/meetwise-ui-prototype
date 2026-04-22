"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";

interface Meeting {
  id: number;
  name: string;
  date: string;
  duration: string;
  participants: number;
  cost: string;
  insight?: string;
}

const mockMeetings: Meeting[] = [
  { id: 1, name: "Sprint Planning", date: "2025-02-20", duration: "60 min", participants: 8, cost: "€480", insight: "This meeting could be shortened to 30 min by sharing the backlog asynchronously beforehand." },
  { id: 2, name: "Design Review", date: "2025-02-19", duration: "45 min", participants: 5, cost: "€225", insight: "Consider recording this meeting — 3 participants had no active input." },
  { id: 3, name: "All Hands", date: "2025-02-18", duration: "30 min", participants: 25, cost: "€750", insight: "High cost due to team size. Could be replaced with a recorded update." },
  { id: 4, name: "1:1 Manager Sync", date: "2025-02-18", duration: "30 min", participants: 2, cost: "€60" },
  { id: 5, name: "Client Demo", date: "2025-02-17", duration: "45 min", participants: 4, cost: "€180", insight: "Well-structured meeting. Consider reducing demo time by 10 min." },
];

interface MeetingTableProps {
  showCost?: boolean;
  onSelectInsight?: (insight: string) => void;
}

const MeetingTable = ({ showCost = true, onSelectInsight }: MeetingTableProps) => {
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="glass rounded-2xl overflow-hidden animate-fade-in w-full min-w-0">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border/30">
        <h3 className="font-semibold text-foreground text-sm sm:text-base">Recent Meetings</h3>
      </div>
      <div className="table-scroll-mobile -mx-2 sm:mx-0">
        <table className="w-full text-sm min-w-[560px] sm:min-w-0 border-collapse">
          <thead>
            <tr className="border-b border-border/20">
              <th className="text-left px-3 sm:px-6 py-2.5 sm:py-3 text-muted-foreground font-medium">Meeting</th>
              <th className="text-left px-3 sm:px-6 py-2.5 sm:py-3 text-muted-foreground font-medium">Date</th>
              <th className="text-left px-3 sm:px-6 py-2.5 sm:py-3 text-muted-foreground font-medium">Duration</th>
              <th className="text-left px-3 sm:px-6 py-2.5 sm:py-3 text-muted-foreground font-medium">Participants</th>
              {showCost && <th className="text-left px-3 sm:px-6 py-2.5 sm:py-3 text-muted-foreground font-medium">Cost</th>}
              {showCost && <th className="text-left px-3 sm:px-6 py-2.5 sm:py-3 text-muted-foreground font-medium">AI Insight</th>}
            </tr>
          </thead>
          <tbody>
            {mockMeetings.map((m) => (
              <tr
                key={m.id}
                className={`border-b border-border/10 transition-colors duration-150 hover:bg-muted/20 ${selected === m.id ? "bg-muted/30" : ""}`}
              >
                <td className="px-3 sm:px-6 py-3 sm:py-4 font-medium text-foreground">{m.name}</td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 text-muted-foreground">{m.date}</td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 text-muted-foreground">{m.duration}</td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 text-muted-foreground">{m.participants}</td>
                {showCost && <td className="px-3 sm:px-6 py-3 sm:py-4 font-semibold text-foreground">{m.cost}</td>}
                {showCost && (
                  <td className="px-3 sm:px-6 py-3 sm:py-4">
                    {m.insight ? (
                      <button
                        onClick={() => {
                          setSelected(m.id);
                          onSelectInsight?.(m.insight!);
                        }}
                        className="flex items-center gap-1.5 text-secondary hover:text-secondary/80 transition-colors"
                      >
                        <Sparkles size={14} />
                        <span className="text-xs font-medium">View</span>
                      </button>
                    ) : (
                      <span className="text-muted-foreground/50 text-xs">—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MeetingTable;
