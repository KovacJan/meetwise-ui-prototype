import {describe, it, expect} from "vitest";
import {canonicalMeetingKey} from "@/lib/canonical-meeting";

describe("canonicalMeetingKey", () => {
  it("uses ical_uid when present", () => {
    const key = canonicalMeetingKey({
      id: "a",
      start_time: "2026-02-13T08:00:00+00:00",
      ical_uid: "040000008200E00074C5B7101A82E00807EA061A505F85A011",
      series_master_id: "mailbox-series-id",
      duration_minutes: 30,
    });
    expect(key).toBe(
      "ical:040000008200E00074C5B7101A82E00807EA061A505F85A011|2026-02-13T08:00:00+00:00",
    );
  });

  it("ignores per-mailbox series_master_id and uses start+duration fallback", () => {
    const a = canonicalMeetingKey({
      id: "a",
      start_time: "2026-02-13T08:00:00+00:00",
      series_master_id: "series-mailbox-a",
      duration_minutes: 30,
    });
    const b = canonicalMeetingKey({
      id: "b",
      start_time: "2026-02-13T08:00:00+00:00",
      series_master_id: "series-mailbox-b",
      duration_minutes: 30,
    });
    expect(a).toBe("fallback:2026-02-13T08:00:00+00:00|30");
    expect(a).toBe(b);
  });
});
