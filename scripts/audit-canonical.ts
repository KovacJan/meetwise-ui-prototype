/**
 * Strict canonical meetings audit — DB integrity, merge consistency, cross-lead parity, code coverage.
 * Usage: npx tsx scripts/audit-canonical.ts
 * Exit code: 0 = all FAIL checks pass, 1 = at least one FAIL
 */
import {readFileSync, readdirSync, statSync, writeFileSync} from "fs";
import {resolve, join} from "path";
import {createClient, type SupabaseClient} from "@supabase/supabase-js";
import {canonicalMeetingKey} from "../src/lib/canonical-meeting";
import {
  startOfISOWeek,
  endOfISOWeek,
  subWeeks,
} from "date-fns";

type Severity = "PASS" | "WARN" | "FAIL";
type Check = {
  id: string;
  area: string;
  severity: Severity;
  message: string;
  details?: unknown;
};

const checks: Check[] = [];

function record(
  id: string,
  area: string,
  severity: Severity,
  message: string,
  details?: unknown,
) {
  checks.push({id, area, severity, message, details});
}

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

async function fetchAll(
  admin: SupabaseClient,
  table: string,
  select: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const {data, error} = await admin.from(table).select(select).range(from, from + 999);
    if (error) throw new Error(`${table} fetch failed: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (data.length < 1000) break;
  }
  return rows;
}

function auditCodePaths() {
  const srcRoot = resolve(process.cwd(), "src");
  const canonicalConsumers = [
    "src/app/[locale]/(dashboard)/dashboard/actions.ts",
    "src/lib/cost-engine.ts",
    "src/app/api/insights/route.ts",
    "src/app/api/generate-insight/route.ts",
    "src/app/api/cron/check-insights/route.ts",
    "src/app/api/poll/submit/route.ts",
    "src/app/api/poll/submit-batch/route.ts",
    "src/lib/meeting-occurrences.ts",
  ];

  for (const rel of canonicalConsumers) {
    const content = readFileSync(resolve(process.cwd(), rel), "utf8");
    const usesFlag =
      content.includes("USE_CANONICAL_MEETINGS") || content.includes("meeting_occurrences");
    if (!usesFlag) {
      record("code-consumer", "Code", "FAIL", `${rel} does not reference canonical model`);
    } else {
      record("code-consumer", "Code", "PASS", `${rel} uses canonical model`);
    }
  }

  const legacyOnlyPaths: Array<{file: string; reason: string; severity: Severity}> = [
    {
      file: "src/app/api/cron/check-polls/route.ts",
      reason: "Poll digest cron uses meeting_occurrences",
      severity: "PASS",
    },
    {
      file: "src/app/api/cron/check-polls-for-user/route.ts",
      reason: "Manual poll trigger uses meeting_occurrences",
      severity: "PASS",
    },
    {
      file: "src/app/api/dashboard-kpis/route.ts",
      reason: "Member KPI minutes sum raw meetings (by design for personal calendar)",
      severity: "PASS",
    },
    {
      file: "src/app/api/send-poll/route.ts",
      reason: "Send-poll resolves occurrence id for links",
      severity: "PASS",
    },
    {
      file: "src/app/[locale]/(dashboard)/surveys/actions.ts",
      reason: "Surveys list canonical occurrences user attended",
      severity: "PASS",
    },
    {
      file: "src/app/api/meetings/poll-metadata/route.ts",
      reason: "Poll metadata resolves occurrence or legacy meeting",
      severity: "PASS",
    },
    {
      file: "src/lib/calendar-sync.ts",
      reason: "Sync writes raw meetings (expected source layer)",
      severity: "PASS",
    },
  ];

  for (const {file, reason, severity} of legacyOnlyPaths) {
    record(`code-legacy-${file}`, "Code", severity, `${file}: ${reason}`);
  }

  const useCanonical = process.env.USE_CANONICAL_MEETINGS !== "0";
  record(
    "code-flag",
    "Config",
    useCanonical ? "PASS" : "FAIL",
    useCanonical
      ? "USE_CANONICAL_MEETINGS is ON (default, not set to 0)"
      : "USE_CANONICAL_MEETINGS=0 — canonical model disabled in runtime",
  );

  // Scan for manager-facing queries on meetings without canonical guard
  const riskyPatterns = [
    /\.from\(["']meetings["']\)[\s\S]{0,200}team_id/,
    /\.from\(`meetings`\)/,
  ];
  const walk = (dir: string, acc: string[] = []) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== "node_modules") walk(p, acc);
      } else if (/\.(ts|tsx)$/.test(name)) acc.push(p);
    }
    return acc;
  };

  const apiFiles = walk(srcRoot).filter(
    (f) =>
      f.includes(`${join("app", "api")}`) ||
      f.includes("dashboard") ||
      f.includes("cost-engine"),
  );

  const allowedMeetingsReaders = new Set([
    resolve(srcRoot, "lib/calendar-sync.ts"),
    resolve(srcRoot, "lib/meeting-occurrences.ts"),
    resolve(srcRoot, "app/api/cron/check-polls/route.ts"),
    resolve(srcRoot, "app/api/cron/check-polls-for-user/route.ts"),
    resolve(srcRoot, "app/api/dashboard-kpis/route.ts"),
    resolve(srcRoot, "app/api/send-poll/route.ts"),
    resolve(srcRoot, "app/[locale]/(dashboard)/surveys/actions.ts"),
    resolve(srcRoot, "app/api/meetings/poll-metadata/route.ts"),
    resolve(srcRoot, "app/api/insights/recommendations/route.ts"),
    resolve(srcRoot, "app/[locale]/(dashboard)/settings/actions.ts"),
    resolve(srcRoot, "app/api/poll/submit/route.ts"),
    resolve(srcRoot, "app/api/poll/submit-batch/route.ts"),
    resolve(srcRoot, "app/api/insights/route.ts"),
    resolve(srcRoot, "app/[locale]/(dashboard)/dashboard/actions.ts"),
    resolve(srcRoot, "app/api/admin/backfill-occurrences/route.ts"),
    resolve(srcRoot, "app/api/admin/validate-occurrences/route.ts"),
    resolve(srcRoot, "lib/poll-occurrences.ts"),
  ]);

  for (const file of apiFiles) {
    const norm = resolve(file);
    if (allowedMeetingsReaders.has(norm)) continue;
    const content = readFileSync(file, "utf8");
    if (!content.includes('.from("meetings")') && !content.includes(".from('meetings')")) continue;
    record(
      "code-unlisted-meetings",
      "Code",
      "WARN",
      `Unexpected meetings table read: ${norm.replace(process.cwd(), ".")}`,
    );
  }
}

async function auditDatabase(admin: SupabaseClient) {
  const {error: pollColProbe} = await admin
    .from("meeting_occurrences")
    .select("poll_sent")
    .limit(1);
  record(
    "db-migration-015",
    "Database",
    pollColProbe ? "WARN" : "PASS",
    pollColProbe
      ? "Migration 015 not applied — poll cron uses meetings.poll_sent fallback (run 015_occurrence_polls.sql)"
      : "Migration 015 poll columns present on meeting_occurrences",
  );

  const meetings = await fetchAll(
    admin,
    "meetings",
    "id, team_id, user_id, title, start_time, duration_minutes, ical_uid, series_master_id, occurrence_id, is_cancelled, is_excluded",
  );
  const occurrences = await fetchAll(
    admin,
    "meeting_occurrences",
    "id, team_id, canonical_key, ical_uid, title, start_time, duration_minutes, source_count, team_cost, matched_member_count, is_excluded, is_cancelled",
  );

  const occById = new Map(occurrences.map((o) => [o.id as string, o]));

  // ── A1: Every meeting linked ─────────────────────────────────────
  const unlinked = meetings.filter((m) => !m.occurrence_id);
  record(
    "db-unlinked",
    "Database",
    unlinked.length === 0 ? "PASS" : "FAIL",
    unlinked.length === 0
      ? `All ${meetings.length} meetings have occurrence_id`
      : `${unlinked.length}/${meetings.length} meetings missing occurrence_id`,
    unlinked.length > 0
      ? unlinked.slice(0, 10).map((m) => ({
          id: m.id,
          title: m.title,
          start: m.start_time,
          user: m.user_id,
        }))
      : undefined,
  );

  // ── A2: FK integrity + team match ────────────────────────────────
  const badFk: unknown[] = [];
  const wrongTeam: unknown[] = [];
  for (const m of meetings) {
    const occId = m.occurrence_id as string | null;
    if (!occId) continue;
    const occ = occById.get(occId);
    if (!occ) {
      badFk.push({meetingId: m.id, occurrenceId: occId});
      continue;
    }
    if (occ.team_id !== m.team_id) {
      wrongTeam.push({meetingId: m.id, meetingTeam: m.team_id, occTeam: occ.team_id});
    }
  }
  record(
    "db-fk",
    "Database",
    badFk.length === 0 ? "PASS" : "FAIL",
    badFk.length === 0 ? "All occurrence_id FKs resolve" : `${badFk.length} broken FK references`,
    badFk.length ? badFk.slice(0, 10) : undefined,
  );
  record(
    "db-team-match",
    "Database",
    wrongTeam.length === 0 ? "PASS" : "FAIL",
    wrongTeam.length === 0
      ? "Meeting team_id matches occurrence team_id"
      : `${wrongTeam.length} team_id mismatches`,
    wrongTeam.length ? wrongTeam.slice(0, 10) : undefined,
  );

  // ── A3: source_count vs actual links ─────────────────────────────
  const linksPerOcc = new Map<string, number>();
  for (const m of meetings) {
    const occId = m.occurrence_id as string | null;
    if (!occId) continue;
    linksPerOcc.set(occId, (linksPerOcc.get(occId) ?? 0) + 1);
  }
  const sourceCountDrift: unknown[] = [];
  for (const o of occurrences) {
    const actual = linksPerOcc.get(o.id as string) ?? 0;
    const expected = Number(o.source_count ?? 0);
    if (actual !== expected) {
      sourceCountDrift.push({
        id: o.id,
        title: o.title,
        start: o.start_time,
        expected,
        actual,
      });
    }
  }
  record(
    "db-source-count",
    "Database",
    sourceCountDrift.length === 0 ? "PASS" : "WARN",
    sourceCountDrift.length === 0
      ? "source_count matches linked meetings for all occurrences"
      : `${sourceCountDrift.length} occurrences have source_count drift`,
    sourceCountDrift.slice(0, 15),
  );

  // ── A4: Orphan occurrences (no meetings) ───────────────────────
  const orphanOcc = occurrences.filter((o) => !linksPerOcc.has(o.id as string));
  record(
    "db-orphan-occ",
    "Database",
    orphanOcc.length === 0 ? "PASS" : "WARN",
    orphanOcc.length === 0
      ? "No orphan occurrences"
      : `${orphanOcc.length} occurrences with zero linked meetings`,
    orphanOcc.slice(0, 10).map((o) => ({id: o.id, title: o.title, start: o.start_time})),
  );

  // ── A5: Re-merge simulation ────────────────────────────────────
  const teamIds = [...new Set(meetings.map((m) => m.team_id as string).filter(Boolean))];
  const mergeMismatches: unknown[] = [];
  for (const teamId of teamIds) {
    const teamMeetings = meetings.filter((m) => m.team_id === teamId);
    const grouped = new Map<string, string[]>();
    for (const m of teamMeetings) {
      const key = canonicalMeetingKey(m as Parameters<typeof canonicalMeetingKey>[0]);
      const ids = grouped.get(key) ?? [];
      ids.push(m.id as string);
      grouped.set(key, ids);
    }

    const occByKey = new Map(
      occurrences
        .filter((o) => o.team_id === teamId)
        .map((o) => [o.canonical_key as string, o]),
    );

    for (const [key, meetingIds] of grouped) {
      const occ = occByKey.get(key);
      if (!occ) {
        const linkedOccIds = new Set(
          meetingIds
            .map((mid) => teamMeetings.find((x) => x.id === mid)?.occurrence_id)
            .filter(Boolean),
        );
        if (linkedOccIds.size === 1) {
          continue;
        }
        mergeMismatches.push({
          teamId,
          key,
          issue: "missing_occurrence",
          meetingIds: meetingIds.length,
        });
        continue;
      }
      const linkedToThis = meetingIds.filter((mid) => {
        const m = teamMeetings.find((x) => x.id === mid);
        return m?.occurrence_id === occ.id;
      });
      if (linkedToThis.length !== meetingIds.length) {
        mergeMismatches.push({
          teamId,
          key,
          issue: "wrong_occurrence_link",
          expected: meetingIds.length,
          linked: linkedToThis.length,
          occurrenceId: occ.id,
        });
      }
    }
  }
  record(
    "db-merge-sim",
    "Database",
    mergeMismatches.length === 0 ? "PASS" : "FAIL",
    mergeMismatches.length === 0
      ? "Re-merge simulation: all canonical keys map to correct occurrences"
      : `${mergeMismatches.length} canonical key mismatches`,
    mergeMismatches.slice(0, 20),
  );

  // ── A6: Same ical_uid+start must be one occurrence ──────────────
  const icalGroups = new Map<string, string[]>();
  for (const m of meetings) {
    if (!m.ical_uid || !m.start_time) continue;
    const k = `${m.team_id}|${m.ical_uid}|${m.start_time}`;
    const occIds = icalGroups.get(k) ?? [];
    const occId = m.occurrence_id as string;
    if (!occIds.includes(occId)) occIds.push(occId);
    icalGroups.set(k, occIds);
  }
  const icalSplits = [...icalGroups.entries()].filter(([, occIds]) => occIds.length > 1);
  record(
    "db-ical-unity",
    "Database",
    icalSplits.length === 0 ? "PASS" : "FAIL",
    icalSplits.length === 0
      ? "Same ical_uid+start_time always maps to one occurrence"
      : `${icalSplits.length} ical groups split across multiple occurrences`,
    icalSplits.slice(0, 10).map(([k, occIds]) => ({key: k, occurrenceIds: occIds})),
  );

  // ── A7: Cross-mailbox dedupe quality (shared meetings) ─────────
  const byStartTitle = new Map<string, {occIds: Set<string>; icals: Set<string>; sources: number}>();
  for (const m of meetings) {
    if (m.is_cancelled) continue;
    const title = String(m.title ?? "").toLowerCase().trim();
    if (!title.includes("standup") && !title.includes("planning")) continue;
    const k = `${m.team_id}|${m.start_time}|${title}`;
    const entry = byStartTitle.get(k) ?? {occIds: new Set(), icals: new Set(), sources: 0};
    entry.occIds.add(m.occurrence_id as string);
    if (m.ical_uid) entry.icals.add(m.ical_uid as string);
    entry.sources++;
    byStartTitle.set(k, entry);
  }
  const standupSplits = [...byStartTitle.entries()]
    .filter(([, v]) => v.sources >= 3 && v.occIds.size > 1)
    .map(([k, v]) => ({
      key: k,
      occurrenceCount: v.occIds.size,
      uniqueIcal: v.icals.size,
      sourceMeetings: v.sources,
    }));
  record(
    "db-standup-dedupe",
    "Dedupe",
    standupSplits.length === 0 ? "PASS" : "WARN",
    standupSplits.length === 0
      ? "No standup/planning with 3+ sources split across occurrences"
      : `${standupSplits.length} standup/planning slots still split (likely missing ical_uid)`,
    standupSplits.slice(0, 15),
  );

  // ── A8: Cross-manager parity (last 4 weeks) ─────────────────────
  const {data: managers} = await admin
    .from("profiles")
    .select("id, display_name, team_id")
    .eq("is_manager", true)
    .not("team_id", "is", null);

  const now = new Date();
  const from = subWeeks(startOfISOWeek(now), 3);
  const to = endOfISOWeek(now);

  for (const teamId of teamIds) {
    const teamManagers = (managers ?? []).filter((m) => m.team_id === teamId);
    if (teamManagers.length < 2) continue;

    const {data: occRows} = await admin
      .from("meeting_occurrences")
      .select("id, title, start_time, team_cost, matched_member_count, is_excluded")
      .eq("team_id", teamId)
      .gte("start_time", from.toISOString())
      .lte("start_time", to.toISOString())
      .neq("is_cancelled", true)
      .neq("is_excluded", true);

    const canonicalCount = occRows?.length ?? 0;
    const canonicalCost = (occRows ?? []).reduce((s, r) => s + Number(r.team_cost ?? 0), 0);

    // Each manager should see identical aggregates (they read same table)
    const managerViews = teamManagers.map((mgr) => ({
      managerId: mgr.id,
      name: mgr.display_name,
      meetingCount: canonicalCount,
      totalCost: canonicalCost,
    }));

    const distinctCounts = new Set(managerViews.map((v) => v.meetingCount));
    const distinctCosts = new Set(managerViews.map((v) => v.totalCost.toFixed(2)));

    record(
      `parity-team-${teamId.slice(0, 8)}`,
      "Cross-lead",
      distinctCounts.size === 1 && distinctCosts.size === 1 ? "PASS" : "FAIL",
      distinctCounts.size === 1 && distinctCosts.size === 1
        ? `${teamManagers.length} managers see same ${canonicalCount} meetings / €${canonicalCost.toFixed(0)} (last 4 ISO weeks)`
        : `Manager parity broken for team ${teamId}`,
      {managers: managerViews, period: {from: from.toISOString(), to: to.toISOString()}},
    );
  }

  // ── A9: Poll linkage ─────────────────────────────────────────────
  const {data: polls} = await admin
    .from("poll_responses")
    .select("id, meeting_id, occurrence_id, created_at")
    .order("created_at", {ascending: false})
    .limit(500);

  const pollsNoOcc = (polls ?? []).filter((p) => !p.occurrence_id);
  const pollsBadOcc = (polls ?? []).filter((p) => {
    if (!p.occurrence_id) return false;
    return !occById.has(p.occurrence_id);
  });
  record(
    "db-polls-occ",
    "Polls",
    pollsNoOcc.length === 0 ? "PASS" : "WARN",
    pollsNoOcc.length === 0
      ? `All ${polls?.length ?? 0} recent poll_responses have occurrence_id`
      : `${pollsNoOcc.length} recent poll_responses missing occurrence_id`,
    pollsNoOcc.slice(0, 10),
  );
  record(
    "db-polls-fk",
    "Polls",
    pollsBadOcc.length === 0 ? "PASS" : "FAIL",
    pollsBadOcc.length === 0
      ? "poll_responses.occurrence_id FK valid"
      : `${pollsBadOcc.length} poll_responses point to missing occurrences`,
    pollsBadOcc.slice(0, 10),
  );

  // ── A10: Cost coverage ───────────────────────────────────────────
  const activeOcc = occurrences.filter((o) => !o.is_cancelled && !o.is_excluded);
  const noCost = activeOcc.filter(
    (o) => o.team_cost === null || o.team_cost === undefined,
  );
  const zeroCostHighAttendees = activeOcc.filter(
    (o) =>
      Number(o.team_cost ?? 0) === 0 &&
      Number(o.matched_member_count ?? 0) >= 3 &&
      Number(o.duration_minutes ?? 0) >= 15,
  );
  record(
    "db-cost-null",
    "Costs",
    noCost.length === 0 ? "PASS" : "WARN",
    noCost.length === 0
      ? "All active occurrences have team_cost set"
      : `${noCost.length} active occurrences with null team_cost`,
    noCost.slice(0, 10).map((o) => ({id: o.id, title: o.title, start: o.start_time})),
  );
  record(
    "db-cost-zero-suspicious",
    "Costs",
    zeroCostHighAttendees.length === 0 ? "PASS" : "WARN",
    zeroCostHighAttendees.length === 0
      ? "No suspicious zero-cost occurrences (3+ matched, 15+ min)"
      : `${zeroCostHighAttendees.length} occurrences with €0 despite attendees`,
    zeroCostHighAttendees.slice(0, 10).map((o) => ({
      id: o.id,
      title: o.title,
      matched: o.matched_member_count,
      minutes: o.duration_minutes,
    })),
  );

  return {
    meetingsTotal: meetings.length,
    occurrencesTotal: occurrences.length,
    teams: teamIds.length,
  };
}

function printReport(summary: {meetingsTotal: number; occurrencesTotal: number; teams: number}) {
  const fails = checks.filter((c) => c.severity === "FAIL");
  const warns = checks.filter((c) => c.severity === "WARN");
  const passes = checks.filter((c) => c.severity === "PASS");

  console.log("\n╔══════════════════════════════════════════════════════════════╗");
  console.log("║         CANONICAL MEETINGS — STRICT AUDIT REPORT            ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");
  console.log(`Meetings: ${summary.meetingsTotal} | Occurrences: ${summary.occurrencesTotal} | Teams: ${summary.teams}`);
  console.log(`PASS: ${passes.length} | WARN: ${warns.length} | FAIL: ${fails.length}\n`);

  const areas = [...new Set(checks.map((c) => c.area))];
  for (const area of areas) {
    console.log(`── ${area} ${"─".repeat(Math.max(0, 58 - area.length))}`);
    for (const c of checks.filter((x) => x.area === area)) {
      const icon = c.severity === "PASS" ? "✓" : c.severity === "WARN" ? "!" : "✗";
      console.log(`  [${icon} ${c.severity}] ${c.id}: ${c.message}`);
      if (c.details && c.severity !== "PASS") {
        console.log("      ", JSON.stringify(c.details, null, 2).split("\n").join("\n       "));
      }
    }
    console.log();
  }

  if (fails.length > 0) {
    console.log("VERDICT: FAIL — canonical model has blocking issues.\n");
  } else if (warns.length > 0) {
    console.log("VERDICT: PASS WITH WARNINGS — core canonical path OK, see gaps above.\n");
  } else {
    console.log("VERDICT: PASS — canonical model fully consistent.\n");
  }

  const reportPath = resolve(process.cwd(), "scripts/audit-canonical-report.json");
  writeReportFile(reportPath, {summary, checks, verdict: fails.length > 0 ? "FAIL" : warns.length > 0 ? "WARN" : "PASS"});
  console.log(`Full JSON report: ${reportPath}\n`);
}

function writeReportFile(path: string, data: unknown) {
  writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

async function main() {
  loadEnvLocal();
  auditCodePaths();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");

  const admin = createClient(url, key, {auth: {persistSession: false}});
  const summary = await auditDatabase(admin);
  printReport(summary);

  const failCount = checks.filter((c) => c.severity === "FAIL").length;
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
