"use client";

import {
  useState,
  useActionState,
  useOptimistic,
  useTransition,
  useEffect,
} from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { useRouter } from "../../i18n/navigation";
import AppSidebar from "@/components/AppSidebar";
import TopBar from "@/components/TopBar";
import TeamCodeBox from "@/components/TeamCodeBox";
import GlassCard from "@/components/GlassCard";
import Loader from "@/components/Loader";
import {
  Trash2,
  Copy,
  Check,
  Users,
  UserPlus,
  Pencil,
  X,
  RefreshCw,
  Plus,
  Mail,
  Zap,
  Eye,
  EyeOff,
  Crown,
} from "lucide-react";
import { toast } from "sonner";
import { useUser } from "@/contexts/UserContext";
import type {
  TeamMember,
  TeamActionState,
} from "@/app/[locale]/(dashboard)/team/actions";
import {
  addMultipleTeamMembers,
  updateTeamMember,
  removeTeamMember,
  triggerCostRecalculation,
  setAverageRateForAllMembers,
  toggleMemberExclusion,
} from "@/app/[locale]/(dashboard)/team/actions";

interface TeamProps {
  teamName?: string;
  teamCode?: string;
  teamId?: string;
  shareableLink?: string;
  managerName?: string | null;
  managerEmail?: string | null;
  members: TeamMember[];
  isManager: boolean;
}

// ─── member entry for the add form ─────────────────────────────
interface MemberEntry {
  name: string;
  email: string;
}

// ─── submit buttons ────────────────────────────────────────────
function SaveButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("team");
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3 py-1 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold hover:opacity-90 disabled:opacity-60 transition-opacity"
    >
      {pending ? (
        <Loader variant="inline" className="text-secondary-foreground" />
      ) : (
        t("save")
      )}
    </button>
  );
}

function DeleteButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="text-muted-foreground hover:text-destructive disabled:opacity-40 transition-colors"
      title="Remove member"
    >
      {pending ? <Loader variant="inline" /> : <Trash2 size={14} />}
    </button>
  );
}

function ApplyRateButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("team");
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
      style={{
        background:
          "linear-gradient(135deg, hsl(232,60%,55%), hsl(190,70%,50%))",
        color: "white",
      }}
    >
      {pending ? (
        <Loader variant="inline" className="text-white" />
      ) : (
        <Zap size={11} />
      )}
      {pending ? t("applyingRate") : t("applyRate")}
    </button>
  );
}

// ─── member row ────────────────────────────────────────────────
function MemberRow({
  member,
  isManager,
  managerEmail,
}: {
  member: TeamMember;
  isManager: boolean;
  managerEmail?: string | null;
}) {
  const t = useTranslations("team");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(member.displayName);
  const [editRate, setEditRate] = useState(String(member.hourlyRate));
  const [isExcluded, setIsExcluded] = useState(member.isExcluded);
  const [updateState, updateAction] = useActionState<TeamActionState, FormData>(
    updateTeamMember,
    {},
  );
  const [removeState, removeAction] = useActionState<TeamActionState, FormData>(
    removeTeamMember,
    {},
  );

  useEffect(() => {
    if (updateState.success) setEditing(false);
  }, [updateState.success]);

  const handleToggleExclusion = async () => {
    const next = !isExcluded;
    setIsExcluded(next);
    try {
      const result = await toggleMemberExclusion(member.id, next);
      if (result && result.error) {
        // Revert on server error
        setIsExcluded(!next);
      }
    } catch {
      // Revert on unexpected failure
      setIsExcluded(!next);
    }
  };

  const statusColors: Record<string, string> = {
    active: "bg-emerald-500/20 text-emerald-400",
    pending: "bg-amber-500/20 text-amber-400",
    invited: "bg-blue-500/20 text-blue-400",
  };

  const isLead =
    !!managerEmail && member.email.toLowerCase() === managerEmail.toLowerCase();

  return (
    <div
      className={`py-3 border-b border-border/20 last:border-0 transition-opacity ${isExcluded ? "opacity-40" : ""}`}
    >
      {editing ? (
        <form
          action={updateAction}
          className="flex flex-wrap items-center gap-2"
        >
          <input type="hidden" name="memberId" value={member.id} />
          <input
            name="displayName"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="flex-1 min-w-[120px] px-3 py-1.5 rounded-lg bg-input border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder={t("namePlaceholder")}
          />
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">€</span>
            <input
              name="hourlyRate"
              type="number"
              min="0"
              step="0.01"
              value={editRate}
              onChange={(e) => setEditRate(e.target.value)}
              className="w-24 px-3 py-1.5 rounded-lg bg-input border border-border text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="0"
            />
            <span className="text-xs text-muted-foreground">/h</span>
          </div>
          <SaveButton />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={14} />
          </button>
          {updateState.error && (
            <p className="w-full text-xs text-destructive-foreground">
              {updateState.error}
            </p>
          )}
        </form>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p
                className={`text-sm font-medium truncate ${
                  isExcluded
                    ? "line-through text-muted-foreground"
                    : "text-foreground"
                }`}
              >
                {member.displayName}
              </p>
              {isLead && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  <Crown size={10} />
                  {t("managerBadge")}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {member.email}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-muted-foreground font-mono">
              €{member.hourlyRate}/h
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[member.status] ?? statusColors.pending}`}
            >
              {t(member.status as "active" | "pending" | "invited")}
            </span>
            {isManager && (
              <>
                <button
                  type="button"
                  onClick={handleToggleExclusion}
                  title={
                    isExcluded
                      ? "Include in cost calculations"
                      : "Exclude from cost calculations"
                  }
                  className={`transition-colors ${
                    isExcluded
                      ? "text-amber-400 hover:text-amber-300"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isExcluded ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditName(member.displayName);
                    setEditRate(String(member.hourlyRate));
                    setEditing(true);
                  }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  title="Edit member"
                >
                  <Pencil size={13} />
                </button>
                <form action={removeAction}>
                  <input type="hidden" name="memberId" value={member.id} />
                  <DeleteButton />
                </form>
              </>
            )}
          </div>
        </div>
      )}
      {removeState.error && (
        <p className="mt-1 text-xs text-destructive-foreground">
          {removeState.error}
        </p>
      )}
    </div>
  );
}

// ─── main component ────────────────────────────────────────────
const Team = ({
  teamName,
  teamCode,
  shareableLink,
  managerName,
  managerEmail,
  members,
  isManager,
}: TeamProps) => {
  const t = useTranslations("team");
  const router = useRouter();
  const { displayName } = useUser();

  // Copy link state
  const [linkCopied, setLinkCopied] = useState(false);

  // Add member form
  const [showAddForm, setShowAddForm] = useState(false);
  const [memberEntries, setMemberEntries] = useState<MemberEntry[]>([
    { name: "", email: "" },
  ]);
  const [sendEmails, setSendEmails] = useState(true);
  const [batchState, batchAction] = useActionState<TeamActionState, FormData>(
    addMultipleTeamMembers,
    {},
  );
  const [isBatchPending, startBatchTransition] = useTransition();

  // Average rate action
  const [setRateState, setRateAction] = useActionState<
    TeamActionState,
    FormData
  >(setAverageRateForAllMembers, {});

  // Recalc action
  const [recalcState, recalcAction] = useActionState<TeamActionState, FormData>(
    triggerCostRecalculation,
    {},
  );
  const [isPending, startTransition] = useTransition();

  // Optimistic member list
  const [optimisticMembers, addOptimistic] = useOptimistic<
    TeamMember[],
    TeamMember
  >(members, (current, newMember) => [...current, newMember]);

  const handleCopyLink = () => {
    if (!shareableLink) return;
    navigator.clipboard.writeText(shareableLink);
    setLinkCopied(true);
    toast.success(t("linkCopied"));
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const addMemberRow = () =>
    setMemberEntries((prev) => [...prev, { name: "", email: "" }]);

  const removeMemberRow = (i: number) =>
    setMemberEntries((prev) => prev.filter((_, idx) => idx !== i));

  const updateEntry = (i: number, field: "name" | "email", value: string) =>
    setMemberEntries((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)),
    );

  const handleBatchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const valid = memberEntries.filter(
      (e) => e.name.trim() && e.email.trim() && /\S+@\S+\.\S+/.test(e.email),
    );
    if (!valid.length) return;

    const fd = new FormData();
    fd.append(
      "members",
      JSON.stringify(valid.map((e) => ({ name: e.name, email: e.email }))),
    );
    startBatchTransition(async () => {
      for (const entry of valid) {
        addOptimistic({
          id: "opt-" + Date.now() + Math.random(),
          teamId: "",
          profileId: null,
          email: entry.email.trim().toLowerCase(),
          displayName: entry.name.trim(),
          hourlyRate: 0,
          status: "pending",
          isExcluded: false,
          invitedAt: null,
          joinedAt: null,
          createdAt: new Date().toISOString(),
        });
      }
      await batchAction(fd);

      // Send join emails via Resend if checked
      if (sendEmails && shareableLink && teamName) {
        try {
          const res = await fetch("/api/send-invite", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              members: valid.map((e) => ({ name: e.name, email: e.email })),
              teamName,
              senderName: displayName ?? teamName,
              joinLink: shareableLink,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            toast.error(data.error ?? t("emailSendFailed"));
          } else {
            const sent: number = data.sent ?? valid.length;
            toast.success(t("emailSentCount", { count: sent }));
          }
        } catch {
          toast.error(t("emailSendFailed"));
        }
      }

      setShowAddForm(false);
      setMemberEntries([{ name: "", email: "" }]);
    });
  };

  const validEntriesCount = memberEntries.filter(
    (e) => e.name.trim() && e.email.trim() && /\S+@\S+\.\S+/.test(e.email),
  ).length;

  // No team yet
  if (!teamCode) {
    return (
      <div className="flex min-h-screen">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <TopBar />
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto w-full flex flex-col items-center justify-center text-center pb-24 md:pb-6 lg:pb-8">
            <div className="w-16 h-16 rounded-2xl gradient-blue-cyan flex items-center justify-center mb-6">
              <Users size={28} className="text-foreground" />
            </div>
            <h2 className="text-2xl font-bold text-foreground mb-2">
              {t("noTeamTitle")}
            </h2>
            <p className="text-sm text-muted-foreground max-w-sm mb-6">
              {t("noTeamDesc")}
            </p>
            <button
              onClick={() => router.push("/onboarding")}
              className="px-6 py-3 rounded-xl bg-secondary text-secondary-foreground text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              {t("setupTeam")}
            </button>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <div className="flex-1 flex flex-col">
        <TopBar />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto w-full pb-24 md:pb-6 lg:pb-8 overflow-x-hidden">
          {/* Header */}
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              {teamName && (
                <h2 className="text-2xl font-bold text-foreground">
                  {teamName}
                </h2>
              )}
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("title")}
              </p>
              {managerName && managerEmail && (
                <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
                  <Crown size={12} className="text-amber-300" />
                  {t("managerLabel", {
                    name: managerName,
                    email: managerEmail,
                  })}
                </p>
              )}
            </div>
            {isManager && (
              <form action={recalcAction}>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/20 transition-colors disabled:opacity-60"
                  title={t("recalcTitle")}
                >
                  {isPending ? (
                    <Loader variant="inline" />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  {t("recalcCosts")}
                </button>
                {recalcState.success && (
                  <p className="mt-1 text-xs text-emerald-400">
                    {t("recalcDone")}
                  </p>
                )}
                {recalcState.error && (
                  <p className="mt-1 text-xs text-destructive-foreground">
                    {recalcState.error}
                  </p>
                )}
              </form>
            )}
          </div>

          {/* Team code + shareable link */}
          <div className="space-y-4 mb-8">
            <TeamCodeBox code={teamCode} />

            {shareableLink && (
              <GlassCard className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground mb-1">
                    {t("shareableLink")}
                  </p>
                  <p className="text-xs text-foreground font-mono break-all leading-relaxed">
                    {shareableLink}
                  </p>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="glass rounded-lg p-2.5 hover:bg-secondary/20 transition-colors shrink-0"
                >
                  {linkCopied ? (
                    <Check size={18} className="text-green-400" />
                  ) : (
                    <Copy size={18} className="text-muted-foreground" />
                  )}
                </button>
              </GlassCard>
            )}
          </div>

          {/* Members list */}
          <GlassCard className="animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-foreground">{t("members")}</h3>
              <div className="flex items-center gap-2">
                {isManager && (
                  <button
                    onClick={() => {
                      setShowAddForm((v) => !v);
                      if (!showAddForm)
                        setMemberEntries([{ name: "", email: "" }]);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                    style={
                      showAddForm
                        ? {
                            background: "hsla(0,0%,100%,0.06)",
                            color: "hsl(var(--muted-foreground))",
                          }
                        : {
                            background:
                              "linear-gradient(135deg, hsl(232,60%,55%), hsl(190,70%,50%))",
                            boxShadow: "0 2px 8px hsla(232,60%,55%,0.30)",
                            color: "white",
                          }
                    }
                  >
                    {showAddForm ? <X size={13} /> : <UserPlus size={13} />}
                    {showAddForm ? t("cancelAdd") : t("addMember")}
                  </button>
                )}
              </div>
            </div>

            {/* ── Add member form ───────────────────────────────────── */}
            {showAddForm && isManager && (
              <form onSubmit={handleBatchSubmit} className="mb-6">
                {/* Form card */}
                <div
                  className="rounded-2xl animate-scale-in"
                  style={{
                    background:
                      "linear-gradient(180deg, hsl(237,56%,12%) 0%, hsl(235,56%,15%) 100%)",
                    border: "1px solid hsla(0,0%,100%,0.10)",
                    boxShadow: "0 8px 32px hsla(232,60%,10%,0.5)",
                  }}
                >
                  {/* Header */}
                  <div
                    className="px-5 py-4 flex items-center gap-3"
                    style={{
                      background:
                        "linear-gradient(135deg, hsla(232,60%,30%,0.6), hsla(190,70%,25%,0.4))",
                      borderBottom: "1px solid hsla(0,0%,100%,0.08)",
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background:
                          "linear-gradient(135deg, hsl(232,60%,55%), hsl(190,70%,50%))",
                      }}
                    >
                      <UserPlus size={15} className="text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white leading-tight">
                        {t("addMembersTitle")}
                      </p>
                      <p className="text-xs text-white/40">
                        {t("addMembersSubtitle")}
                      </p>
                    </div>
                  </div>

                  {/* Member rows */}
                  <div className="px-5 pt-4 pb-2 space-y-3">
                    {memberEntries.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2">
                        {/* Row number badge */}
                        <div
                          className="w-6 h-6 rounded-lg shrink-0 flex items-center justify-center text-[10px] font-bold text-white/30"
                          style={{
                            background: "hsla(0,0%,100%,0.05)",
                            border: "1px solid hsla(0,0%,100%,0.07)",
                          }}
                        >
                          {i + 1}
                        </div>

                        {/* Inputs — name + email only */}
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            value={entry.name}
                            onChange={(e) =>
                              updateEntry(i, "name", e.target.value)
                            }
                            placeholder={t("namePlaceholder")}
                            required
                            className="px-3 py-2.5 rounded-xl text-sm text-white placeholder:text-white/25 outline-none transition-all"
                            style={{
                              background: "hsla(0,0%,100%,0.05)",
                              border: "1px solid hsla(0,0%,100%,0.08)",
                            }}
                          />
                          <div className="flex items-center gap-1.5">
                            <input
                              type="email"
                              value={entry.email}
                              onChange={(e) =>
                                updateEntry(i, "email", e.target.value)
                              }
                              placeholder={t("emailPlaceholder")}
                              required
                              className="flex-1 px-3 py-2.5 rounded-xl text-sm text-white placeholder:text-white/25 outline-none transition-all"
                              style={{
                                background: "hsla(0,0%,100%,0.05)",
                                border: "1px solid hsla(0,0%,100%,0.08)",
                              }}
                            />
                            {memberEntries.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeMemberRow(i)}
                                className="text-white/20 hover:text-red-400 transition-colors shrink-0"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Footer */}
                  <div
                    className="px-5 py-4 space-y-3"
                    style={{ borderTop: "1px solid hsla(0,0%,100%,0.06)" }}
                  >
                    {/* Add another row */}
                    <button
                      type="button"
                      onClick={addMemberRow}
                      className="flex items-center gap-2 text-xs text-white/30 hover:text-white/60 transition-colors"
                    >
                      <Plus size={13} />
                      {t("addAnotherMember")}
                    </button>

                    {/* Send email toggle */}
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sendEmails}
                        onChange={(e) => setSendEmails(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded shrink-0 accent-blue-500"
                      />
                      <div className="mt-[-3px]">
                        <span className="text-xs text-white/60">
                          {t("sendJoinLinks")}
                        </span>
                        <p className="text-[10px] text-white/25 mt-0.5">
                          {t("sendJoinLinksDesc")}
                        </p>
                      </div>
                    </label>

                    {/* Error */}
                    {batchState.error && (
                      <div
                        className="rounded-xl px-4 py-2.5 text-xs text-red-300"
                        style={{
                          background: "hsla(0,70%,50%,0.12)",
                          border: "1px solid hsla(0,70%,50%,0.25)",
                        }}
                      >
                        {batchState.error}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAddForm(false)}
                        className="w-full sm:w-auto px-4 py-2 rounded-xl text-xs text-white/40 hover:text-white/70 transition-colors"
                      >
                        {t("cancel")}
                      </button>

                      <button
                        type="submit"
                        disabled={isBatchPending || validEntriesCount === 0}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                        style={{
                          background:
                            "linear-gradient(135deg, hsl(232,60%,55%), hsl(190,70%,50%))",
                          boxShadow: "0 4px 12px hsla(232,60%,55%,0.25)",
                        }}
                      >
                        {isBatchPending ? (
                          <>
                            <Loader variant="inline" className="text-white" />
                            {t("adding")}
                          </>
                        ) : (
                          <>
                            <Mail size={14} />
                            {t("addMembersBtn", {
                              count: Math.max(validEntriesCount, 1),
                            })}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            )}

            {/* Member rows */}
            {optimisticMembers.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("noMembers")}
                </p>
                {isManager && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("noMembersHint")}
                  </p>
                )}
              </div>
            ) : (
              <div>
                {/* Column headers + set avg rate */}
                <div className="flex items-center justify-between pb-2 border-b border-border/30 mb-1 gap-4 flex-wrap">
                  <div className="flex gap-8">
                    <p className="text-xs text-muted-foreground font-medium">
                      {t("nameCol")}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 flex-wrap">
                    <p className="text-xs text-muted-foreground font-medium">
                      {t("rateCol")}
                    </p>
                    <p className="text-xs text-muted-foreground font-medium">
                      {t("statusCol")}
                    </p>
                    {isManager && <span className="w-10" />}
                  </div>
                </div>
                {optimisticMembers.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    isManager={isManager}
                    managerEmail={managerEmail}
                  />
                ))}
              </div>
            )}

            {/* Summary + set avg rate */}
            {optimisticMembers.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border/30 flex items-center justify-between flex-wrap gap-3">
                <p className="text-xs text-muted-foreground">
                  {t("memberCount", { count: optimisticMembers.length })}
                  {" · "}
                  {t("avgRate", {
                    rate: Math.round(
                      optimisticMembers.reduce((s, m) => s + m.hourlyRate, 0) /
                        optimisticMembers.length,
                    ),
                  })}
                </p>

                {isManager && (
                  <form
                    action={setRateAction}
                    className="flex items-center gap-2"
                  >
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {t("setRateForAll")}:
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">€</span>
                      <input
                        name="averageRate"
                        type="number"
                        min="0"
                        step="1"
                        placeholder={t("ratePlaceholder")}
                        className="w-20 px-2.5 py-1.5 rounded-lg bg-input border border-border text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-xs text-muted-foreground">/h</span>
                    </div>
                    <ApplyRateButton />
                    {setRateState.success && (
                      <span className="text-xs text-emerald-400">
                        {t("rateApplied")}
                      </span>
                    )}
                    {setRateState.error && (
                      <span className="text-xs text-destructive-foreground">
                        {setRateState.error}
                      </span>
                    )}
                  </form>
                )}
              </div>
            )}
          </GlassCard>
        </main>
      </div>
    </div>
  );
};

export default Team;
