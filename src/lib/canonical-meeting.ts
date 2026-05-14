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
  // Fallback for older rows (before iCalUId backfill).
  if (m.series_master_id && m.start_time)
    return `series:${m.series_master_id}|${m.start_time}`;
  // Last-resort fallback keeps rows distinct to avoid accidental over-merge.
  return `row:${m.id}|${m.start_time}|${m.title ?? ""}|${m.duration_minutes ?? 0}`;
}

export function dedupeCanonicalMeetings<T extends CanonicalMeetingFields>(
  rows: T[],
  pick: (existing: T, candidate: T) => T = (existing, candidate) =>
    Number(candidate.duration_minutes ?? 0) > Number(existing.duration_minutes ?? 0)
      ? candidate
      : existing,
): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = canonicalMeetingKey(row);
    const prev = byKey.get(key);
    byKey.set(key, prev ? pick(prev, row) : row);
  }
  return Array.from(byKey.values());
}
