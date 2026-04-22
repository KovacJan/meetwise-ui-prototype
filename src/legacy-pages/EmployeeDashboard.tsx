"use client";

import { useState } from "react";
import { useRouter } from "../../i18n/navigation";
import AppSidebar from "@/components/AppSidebar";
import TopBar from "@/components/TopBar";
import MeetingTable from "@/components/MeetingTable";
import GlassCard from "@/components/GlassCard";
import { Bell } from "lucide-react";

const EmployeeDashboard = () => {
  const router = useRouter();
  const [showBanner, setShowBanner] = useState(true);

  return (
    <div className="flex min-h-screen">
      <AppSidebar isEmployee />
      <div className="flex-1 flex flex-col">
        <TopBar />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {showBanner && (
            <GlassCard className="mb-6 flex items-center justify-between border border-secondary/30 animate-fade-in">
              <div className="flex items-center gap-3">
                <Bell size={18} className="text-secondary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">You have an unanswered poll</p>
                  <p className="text-xs text-muted-foreground">Sprint Planning — Feb 20</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => router.push("/poll")} className="px-4 py-2 rounded-xl bg-secondary text-secondary-foreground text-xs font-semibold hover:opacity-90 transition-opacity">
                  Answer Poll
                </button>
                <button onClick={() => setShowBanner(false)} className="px-3 py-2 rounded-xl glass text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Dismiss
                </button>
              </div>
            </GlassCard>
          )}
          <MeetingTable showCost={false} />
        </main>
      </div>
    </div>
  );
};

export default EmployeeDashboard;
