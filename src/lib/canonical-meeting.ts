type CanonicalMeetingFields = {
  id: string;
  start_time: string;
  ical_uid?: string | null;
  series_master_id?: string | null;
  title?: string | null;
  duration_minutes?: number | null;
};

export function canonicalMeetingKey(m: CanonicalMeetingFields): string {
  // Best key: iCalUId + exact start time (stable across attendees/mailboxes).
  if (m.ical_uid && m.start_time) return `ical:${m.ical_uid}|${m.start_time}`;
  // series_master_id is mailbox-specific — do not use for team-level dedupe.
  // Fallback: same real-world slot (start + duration) merges cross-mailbox copies.
  return `fallback:${m.start_time}|${m.duration_minutes ?? 0}`;
}

export function dedupeCanonicalMeetings<T extends CanonicalMeetingFields>(
  rows: T[],
  pick: (existing: T, candidate: T) => T = (existing, candidate) => {
    const existingDuration = Number(existing.duration_minutes ?? 0);
    const candidateDuration = Number(candidate.duration_minutes ?? 0);
    if (candidateDuration > existingDuration) return candidate;
    if (candidateDuration < existingDuration) return existing;

    const existingTeamCost = Number((existing as Record<string, unknown>).team_cost ?? 0);
    const candidateTeamCost = Number((candidate as Record<string, unknown>).team_cost ?? 0);
    if (candidateTeamCost > existingTeamCost) return candidate;
    if (candidateTeamCost < existingTeamCost) return existing;

    const existingCost = Number((existing as Record<string, unknown>).cost ?? 0);
    const candidateCost = Number((candidate as Record<string, unknown>).cost ?? 0);
    if (candidateCost > existingCost) return candidate;
    if (candidateCost < existingCost) return existing;

    // Final stable tie-breaker to avoid order-dependent output across queries.
    return String(candidate.id) < String(existing.id) ? candidate : existing;
  },
): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = canonicalMeetingKey(row);
    const prev = byKey.get(key);
    byKey.set(key, prev ? pick(prev, row) : row);
  }
  return Array.from(byKey.values());
}
