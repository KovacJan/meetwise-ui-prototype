"use client";

import { useState } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Search,
  Sparkles,
  X,
} from "lucide-react";

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
  {
    id: 1,
    name: "Sprint Planning",
    date: "2025-02-20",
    duration: "60 min",
    participants: 8,
    cost: "€480",
    insight:
      "This meeting could be shortened to 30 min by sharing the backlog asynchronously beforehand.",
  },
  {
    id: 2,
    name: "Design Review",
    date: "2025-02-19",
    duration: "45 min",
    participants: 5,
    cost: "€225",
    insight:
      "Consider recording this meeting — 3 participants had no active input.",
  },
  {
    id: 3,
    name: "All Hands",
    date: "2025-02-18",
    duration: "30 min",
    participants: 25,
    cost: "€750",
    insight:
      "High cost due to team size. Could be replaced with a recorded update.",
  },
  {
    id: 4,
    name: "1:1 Manager Sync",
    date: "2025-02-18",
    duration: "30 min",
    participants: 2,
    cost: "€60",
  },
  {
    id: 5,
    name: "Client Demo",
    date: "2025-02-17",
    duration: "45 min",
    participants: 4,
    cost: "€180",
    insight: "Well-structured meeting. Consider reducing demo time by 10 min.",
  },
];

interface MeetingTableProps {
  showCost?: boolean;
  onSelectInsight?: (insight: string) => void;
}

type SortKey = "name" | "date" | "duration" | "participants" | "cost";
type SortDirection = "asc" | "desc";

function parseDurationMinutes(duration: string): number {
  const match = duration.match(/^(\d+)\s*min$/i);
  return match ? Number(match[1]) : 0;
}

function parseCost(cost: string): number {
  return Number(cost.replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0;
}

const MeetingTable = ({
  showCost = true,
  onSelectInsight,
}: MeetingTableProps) => {
  const [selected, setSelected] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [insightFilter, setInsightFilter] = useState<
    "all" | "with" | "without"
  >("all");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setSortDirection(key === "date" ? "desc" : "asc");
  };

  const query = searchTerm.trim().toLowerCase();
  const filteredMeetings = mockMeetings
    .filter((meeting) => {
      const matchesSearch =
        !query ||
        meeting.name.toLowerCase().includes(query) ||
        meeting.date.toLowerCase().includes(query) ||
        meeting.duration.toLowerCase().includes(query) ||
        String(meeting.participants).includes(query) ||
        meeting.cost.toLowerCase().includes(query) ||
        (meeting.insight ?? "").toLowerCase().includes(query);

      const matchesFilter =
        insightFilter === "all" ||
        (insightFilter === "with" ? !!meeting.insight : !meeting.insight);

      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      const multiplier = sortDirection === "asc" ? 1 : -1;

      switch (sortKey) {
        case "name":
          return (
            a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) *
            multiplier
          );
        case "date":
          return (
            (new Date(a.date).getTime() - new Date(b.date).getTime()) *
            multiplier
          );
        case "duration":
          return (
            (parseDurationMinutes(a.duration) -
              parseDurationMinutes(b.duration)) *
            multiplier
          );
        case "participants":
          return (a.participants - b.participants) * multiplier;
        case "cost":
          return (parseCost(a.cost) - parseCost(b.cost)) * multiplier;
      }
    });

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column)
      return <ArrowUpDown size={12} className="text-muted-foreground/60" />;
    return sortDirection === "asc" ? (
      <ChevronUp size={12} className="text-foreground" />
    ) : (
      <ChevronDown size={12} className="text-foreground" />
    );
  };

  return (
    <div className="glass rounded-2xl overflow-hidden animate-fade-in w-full min-w-0">
      <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border/30">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h3 className="font-semibold text-foreground text-sm sm:text-base">
            Recent Meetings
          </h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-72">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search meetings"
                className="h-10 w-full rounded-xl border border-border/50 bg-background pl-9 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-secondary/40"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex items-center gap-0.5 rounded-xl p-1 border border-border/50 bg-muted/30">
              {(
                [
                  ["all", "All"],
                  ["with", "With insight"],
                  ["without", "No insight"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setInsightFilter(id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                    insightFilter === id
                      ? "bg-secondary text-secondary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="table-scroll-mobile -mx-2 sm:mx-0">
        <table className="w-full text-sm min-w-[560px] sm:min-w-0 border-collapse">
          <thead>
            <tr className="border-b border-border/20">
              <th className="px-3 sm:px-6 py-2.5 sm:py-3 text-muted-foreground font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("name")}
                  className="flex items-center gap-1.5 text-left hover:text-foreground transition-colors"
                >
                  <span>Meeting</span>
                  <SortIcon column="name" />
                </button>
              </th>
              <th className="px-3 sm:px-6 py-2.5 sm:py-3 text-muted-foreground font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("date")}
                  className="flex items-center gap-1.5 text-left hover:text-foreground transition-colors"
                >
                  <span>Date</span>
                  <SortIcon column="date" />
                </button>
              </th>
              <th className="px-3 sm:px-6 py-2.5 sm:py-3 text-muted-foreground font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("duration")}
                  className="flex items-center gap-1.5 text-left hover:text-foreground transition-colors"
                >
                  <span>Duration</span>
                  <SortIcon column="duration" />
                </button>
              </th>
              <th className="px-3 sm:px-6 py-2.5 sm:py-3 text-muted-foreground font-medium">
                <button
                  type="button"
                  onClick={() => handleSort("participants")}
                  className="flex items-center gap-1.5 text-left hover:text-foreground transition-colors"
                >
                  <span>Participants</span>
                  <SortIcon column="participants" />
                </button>
              </th>
              {showCost && (
                <th className="px-3 sm:px-6 py-2.5 sm:py-3 text-muted-foreground font-medium">
                  <button
                    type="button"
                    onClick={() => handleSort("cost")}
                    className="flex items-center gap-1.5 text-left hover:text-foreground transition-colors"
                  >
                    <span>Cost</span>
                    <SortIcon column="cost" />
                  </button>
                </th>
              )}
              {showCost && (
                <th className="text-left px-3 sm:px-6 py-2.5 sm:py-3 text-muted-foreground font-medium">
                  AI Insight
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filteredMeetings.map((m) => (
              <tr
                key={m.id}
                className={`border-b border-border/10 transition-colors duration-150 hover:bg-muted/20 ${selected === m.id ? "bg-muted/30" : ""}`}
              >
                <td className="px-3 sm:px-6 py-3 sm:py-4 font-medium text-foreground">
                  {m.name}
                </td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 text-muted-foreground">
                  {m.date}
                </td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 text-muted-foreground">
                  {m.duration}
                </td>
                <td className="px-3 sm:px-6 py-3 sm:py-4 text-muted-foreground">
                  {m.participants}
                </td>
                {showCost && (
                  <td className="px-3 sm:px-6 py-3 sm:py-4 font-semibold text-foreground">
                    {m.cost}
                  </td>
                )}
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
                      <span className="text-muted-foreground/50 text-xs">
                        —
                      </span>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {filteredMeetings.length === 0 && (
              <tr>
                <td
                  colSpan={showCost ? 6 : 4}
                  className="px-6 py-10 text-center text-muted-foreground"
                >
                  No meetings match your search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MeetingTable;
