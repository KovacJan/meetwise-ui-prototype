import {canCreatePollToken, createPollToken} from "@/lib/poll-token";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ?? "MeetWise <onboarding@resend.dev>";

export function getResendApiKey(): string {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is not set");
  }
  return RESEND_API_KEY;
}

type Locale = "en" | "de";

// ─── Digest (multi-meeting) email ────────────────────────────────────────────

export type DigestMeeting = {
  id: string;
  title: string;
  endTime: string;
  durationMinutes: number;
};

function formatEmailDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "de" ? "de-DE" : "en-IE", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function getPollDigestContent(
  meetings: DigestMeeting[],
  baseUrl: string,
  locale: Locale,
  teamName: string | null,
  userId: string,
): {subject: string; html: string} {
  const count = meetings.length;
  const isDE = locale === "de";

  if (!canCreatePollToken()) {
    console.warn(
      "poll digest: POLL_LINK_SECRET is not set; email links will not include a token. " +
        "Set POLL_LINK_SECRET in .env to enable tokenized links (already-answered + user-bound submit when not logged in).",
    );
  }
  const meetingRowsHtml = meetings
    .map((m) => {
      const token = createPollToken(userId, m.id);
      const basePollUrl = `${baseUrl}/${locale}/poll/${encodeURIComponent(m.id)}`;
      const pollUrl = token ? `${basePollUrl}?t=${encodeURIComponent(token)}` : basePollUrl;
      const dateStr = formatEmailDate(m.endTime, locale);
      const minLabel = isDE ? "Min" : "min";
      const btnLabel = isDE ? "Meeting bewerten →" : "Rate this meeting →";
      return `<div style="margin-bottom:14px;padding:14px 16px;border-radius:12px;background:rgba(41,45,103,0.4);border:1px solid rgba(148,163,184,0.18);">
        <p style="margin:0 0 3px 0;font-size:14px;font-weight:600;color:#E5E7EB;">${m.title}</p>
        <p style="margin:0 0 10px 0;font-size:12px;color:#9CA3AF;">${dateStr} · ${m.durationMinutes} ${minLabel}</p>
        <a href="${pollUrl}" style="display:inline-block;padding:7px 16px;border-radius:999px;background:#4F46E5;color:#F9FAFB;font-size:12px;font-weight:600;text-decoration:none;">${btnLabel}</a>
      </div>`;
    })
    .join("\n");

  const logo = `<div style="margin-bottom:24px;">
    <span style="display:inline-block;width:32px;height:32px;border-radius:12px;background:linear-gradient(135deg,#4F46E5,#22C1C3);text-align:center;line-height:32px;font-weight:700;font-size:18px;color:#F9FAFB;vertical-align:middle;">M</span>
    <span style="font-size:18px;font-weight:700;color:#F9FAFB;vertical-align:middle;margin-left:8px;">MeetWise</span>
  </div>`;

  const wrapper = (body: string) => `<html>
  <body style="margin:0;padding:0;background:#050517;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#050517;padding:32px 0;">
      <tr><td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0B1020;border-radius:16px;border:1px solid rgba(255,255,255,0.06);padding:32px;">
          <tr><td>${body}</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;

  if (isDE) {
    const subject =
      count === 1
        ? `Wie war Ihr Meeting: ${meetings[0].title}?`
        : `${count} Meetings warten auf Ihre Bewertung`;
    const heading =
      count === 1
        ? "Wie war Ihr Meeting?"
        : `Wie waren Ihre letzten ${count} Meetings?`;
    return {
      subject,
      html: wrapper(`
        ${logo}
        <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:700;color:#F9FAFB;">${heading}</h1>
        <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#9CA3AF;">
          Jede Bewertung dauert weniger als 30&nbsp;Sekunden und hilft Ihrem Team zu verstehen, welche Meetings es wert sind.
        </p>
        ${meetingRowsHtml}
        <p style="margin:20px 0 0 0;font-size:11px;color:#6B7280;">
          Sie erhalten diese E-Mail, weil Sie Mitglied${teamName ? ` des Teams „${teamName}“` : " eines MeetWise-Teams"} sind.
        </p>
      `),
    };
  }

  const subject =
    count === 1
      ? `How was your meeting: ${meetings[0].title}?`
      : `${count} recent meetings need your rating`;
  const heading =
    count === 1
      ? "How was your meeting?"
      : `How were your last ${count} meetings?`;
  return {
    subject,
    html: wrapper(`
      ${logo}
      <h1 style="margin:0 0 8px 0;font-size:20px;font-weight:700;color:#F9FAFB;">${heading}</h1>
      <p style="margin:0 0 24px 0;font-size:14px;line-height:1.6;color:#9CA3AF;">
        Each rating takes under 30 seconds and helps your team understand which meetings are worth the time.
      </p>
      ${meetingRowsHtml}
      <p style="margin:20px 0 0 0;font-size:11px;color:#6B7280;">
        You&apos;re receiving this because you&apos;re a member of${teamName ? ` the “${teamName}” team` : " a MeetWise team"}.
      </p>
    `),
  };
}

export async function sendPollDigestEmail({
  to,
  meetings,
  locale,
  teamName,
  userId,
}: {
  to: string;
  meetings: DigestMeeting[];
  locale: Locale;
  teamName?: string | null;
  userId: string;
}): Promise<void> {
  if (meetings.length === 0) return;

  const apiKey = getResendApiKey();
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const {subject, html} = getPollDigestContent(
    meetings,
    baseUrl,
    locale,
    teamName ?? null,
    userId,
  );

  const payload = {
    from: RESEND_FROM_EMAIL,
    to: [to],
    subject,
    html,
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("sendPollDigestEmail: Resend returned non-OK response", {
      status: res.status,
      to,
      subject,
      bodySnippet: text.slice(0, 500),
    });
    throw new Error(`Failed to send poll digest email: ${text}`);
  }
}

function getPollEmailContent(
  meetingTitle: string,
  pollUrl: string,
  locale: Locale,
) {
  if (locale === "de") {
    return {
      subject: `Wie war Ihr Meeting: ${meetingTitle}?`,
      html: `
  <html>
    <body style="margin:0;padding:0;background:#050517;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#050517;padding:32px 0;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0B1020;border-radius:16px;border:1px solid rgba(255,255,255,0.06);padding:32px;">
              <tr>
                <td style="text-align:left;">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
                    <div style="width:32px;height:32px;border-radius:12px;background:linear-gradient(135deg,#4F46E5,#22C1C3);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;color:#F9FAFB;">
                      M
                    </div>
                    <span style="font-size:18px;font-weight:700;color:#F9FAFB;">MeetWise</span>
                  </div>

                  <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:700;color:#F9FAFB;">Wie war Ihr Meeting?</h1>
                  <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#9CA3AF;">
                    Wir möchten verstehen, wie nützlich Ihre Meetings sind und wo Einsparpotenziale liegen.
                    Bitte beantworten Sie kurz diese Fragen zu Ihrem Meeting:
                  </p>

                  <div style="margin:0 0 16px 0;padding:12px 14px;border-radius:12px;background:rgba(41,45,103,0.6);border:1px solid rgba(148,163,184,0.35);">
                    <p style="margin:0;font-size:13px;color:#E5E7EB;">
                      <strong>Meeting:</strong> ${meetingTitle}
                    </p>
                  </div>

                  <p style="margin:0 0 20px 0;font-size:14px;color:#9CA3AF;">
                    Die Umfrage dauert weniger als 30&nbsp;Sekunden.
                  </p>

                  <a href="${pollUrl}" style="display:inline-block;margin:0 0 24px 0;padding:10px 18px;border-radius:999px;background:#4F46E5;color:#F9FAFB;font-size:13px;font-weight:600;text-decoration:none;">
                    Jetzt Meeting bewerten
                  </a>

                  <p style="margin:0;font-size:11px;color:#6B7280;">
                    Wenn die Schaltfläche nicht funktioniert, öffnen Sie bitte diesen Link in Ihrem Browser:<br />
                    <span style="word-break:break-all;color:#9CA3AF;">${pollUrl}</span>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
      `.trim(),
    };
  }

  // Default: English
  return {
    subject: `How was your meeting: ${meetingTitle}?`,
    html: `
  <html>
    <body style="margin:0;padding:0;background:#050517;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#050517;padding:32px 0;">
        <tr>
          <td align="center">
            <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#0B1020;border-radius:16px;border:1px solid rgba(255,255,255,0.06);padding:32px;">
              <tr>
                <td style="text-align:left;">
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px;">
                    <div style="width:32px;height:32px;border-radius:12px;background:linear-gradient(135deg,#4F46E5,#22C1C3);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;color:#F9FAFB;">
                      M
                    </div>
                    <span style="font-size:18px;font-weight:700;color:#F9FAFB;">MeetWise</span>
                  </div>

                  <h1 style="margin:0 0 12px 0;font-size:20px;font-weight:700;color:#F9FAFB;">How was your meeting?</h1>
                  <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#9CA3AF;">
                    We&apos;re helping you understand which meetings are worth the time and which ones aren&apos;t.
                    Please take a few seconds to answer a quick poll about this meeting:
                  </p>

                  <div style="margin:0 0 16px 0;padding:12px 14px;border-radius:12px;background:rgba(41,45,103,0.6);border:1px solid rgba(148,163,184,0.35);">
                    <p style="margin:0;font-size:13px;color:#E5E7EB;">
                      <strong>Meeting:</strong> ${meetingTitle}
                    </p>
                  </div>

                  <p style="margin:0 0 20px 0;font-size:14px;color:#9CA3AF;">
                    The poll takes less than 30 seconds.
                  </p>

                  <a href="${pollUrl}" style="display:inline-block;margin:0 0 24px 0;padding:10px 18px;border-radius:999px;background:#4F46E5;color:#F9FAFB;font-size:13px;font-weight:600;text-decoration:none;">
                    Answer meeting poll
                  </a>

                  <p style="margin:0;font-size:11px;color:#6B7280;">
                    If the button doesn&apos;t work, copy and paste this link into your browser:<br />
                    <span style="word-break:break-all;color:#9CA3AF;">${pollUrl}</span>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
    `.trim(),
  };
}

export async function sendPollEmail(
  to: string,
  meetingTitle: string,
  meetingId: string,
  locale: Locale,
) {
  const apiKey = getResendApiKey();
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  // Include locale so the URL resolves to the correct Next.js route
  // (pages live at /{locale}/poll/{meetingId})
  const pollUrl = `${baseUrl}/${locale}/poll/${encodeURIComponent(meetingId)}`;

  const {subject, html} = getPollEmailContent(meetingTitle, pollUrl, locale);

  const payload = {
    from: RESEND_FROM_EMAIL,
    to: [to],
    subject,
    html,
  };

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("sendPollEmail: Resend returned non-OK response", {
      status: res.status,
      to,
      subject,
      bodySnippet: text.slice(0, 500),
    });
    throw new Error(`Failed to send poll email: ${text}`);
  }
}

