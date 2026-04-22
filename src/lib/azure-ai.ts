// Azure OpenAI client with OpenAI fallback
// Azure OpenAI uses the same request/response format as OpenAI,
// but with a different endpoint and "api-key" header instead of "Authorization: Bearer".

const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT; // e.g. https://my-resource.openai.azure.com
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o";
const AZURE_API_VERSION = process.env.AZURE_OPENAI_API_VERSION ?? "2024-02-01";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export function isAzureAIConfigured(): boolean {
  return !!(
    AZURE_ENDPOINT &&
    AZURE_API_KEY &&
    !AZURE_API_KEY.startsWith("your_")
  );
}

export function isAnyAIConfigured(): boolean {
  return (
    isAzureAIConfigured() ||
    !!(OPENAI_API_KEY && !OPENAI_API_KEY.startsWith("your_"))
  );
}

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatResponse = {
  choices: Array<{message: {content: string}}>;
};

async function chatCompletion(
  messages: ChatMessage[],
  temperature = 0.4,
): Promise<string> {
  if (isAzureAIConfigured()) {
    const url = `${AZURE_ENDPOINT!.replace(/\/$/, "")}/openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=${AZURE_API_VERSION}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "api-key": AZURE_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({messages, temperature}),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Azure OpenAI error: ${text}`);
    }
    const json = (await res.json()) as ChatResponse;
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string")
      throw new Error("Unexpected Azure OpenAI response format");
    return content;
  }

  if (OPENAI_API_KEY && !OPENAI_API_KEY.startsWith("your_")) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({model: "gpt-4o-mini", messages, temperature}),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI error: ${text}`);
    }
    const json = (await res.json()) as ChatResponse;
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string")
      throw new Error("Unexpected OpenAI response format");
    return content;
  }

  throw new Error(
    "No AI provider configured. Set AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY, or OPENAI_API_KEY.",
  );
}

// ─── Per-meeting insight ──────────────────────────────────────────────────────

type MeetingForInsight = {
  title: string;
  duration_minutes: number;
  participant_count: number;
  cost?: number | null;
};

type PollResponseForInsight = {
  was_useful: "yes" | "partially" | "no";
  actual_duration_minutes: number;
  focus_level?: "high" | "medium" | "low" | null;
};

export async function generateMeetingInsight(
  meeting: MeetingForInsight,
  pollResponses: PollResponseForInsight[],
): Promise<{insight: string; efficiencyScore: number}> {
  const usefulCounts = pollResponses.reduce(
    (acc, r) => {
      acc[r.was_useful] += 1;
      return acc;
    },
    {yes: 0, partially: 0, no: 0} as Record<"yes" | "partially" | "no", number>,
  );

  const focusCounts = pollResponses.reduce(
    (acc, r) => {
      const l = r.focus_level;
      if (l === "high" || l === "medium" || l === "low") acc[l] += 1;
      return acc;
    },
    {high: 0, medium: 0, low: 0} as Record<"high" | "medium" | "low", number>,
  );

  const avgActualDuration =
    pollResponses.length > 0
      ? pollResponses.reduce((s, r) => s + r.actual_duration_minutes, 0) /
        pollResponses.length
      : meeting.duration_minutes;

  const raw = await chatCompletion(
    [
      {
        role: "system",
        content:
          "You are a meeting efficiency analyst. Be concise. Always reply with pure JSON conforming to the requested schema.",
      },
      {
        role: "user",
        content:
          "Analyze this meeting and return a JSON object with fields `insight` (max 12 words, specific) and `efficiencyScore` (0-100).\n\n" +
          `Meeting title: ${meeting.title}\n` +
          `Scheduled duration (minutes): ${meeting.duration_minutes}\n` +
          `Participant count: ${meeting.participant_count}\n` +
          `Estimated cost (EUR): ${meeting.cost ?? "unknown"}\n` +
          `Poll responses: yes=${usefulCounts.yes}, partially=${usefulCounts.partially}, no=${usefulCounts.no}\n` +
          `Focus responses: high=${focusCounts.high}, medium=${focusCounts.medium}, low=${focusCounts.low}\n` +
          `Average actual duration (minutes): ${avgActualDuration ?? "unknown"}\n\n` +
          "Respond with strict JSON only, no backticks, no extra text.",
      },
    ],
    0.4,
  );

  let parsed: {insight?: unknown; efficiencyScore?: unknown};
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Failed to parse AI insight JSON");
  }

  const insight = typeof parsed.insight === "string" ? parsed.insight : "";
  let efficiencyScore = Number(parsed.efficiencyScore);
  if (!Number.isFinite(efficiencyScore)) efficiencyScore = 0;
  efficiencyScore = Math.max(0, Math.min(100, efficiencyScore));

  return {insight, efficiencyScore};
}

// ─── Team-level recommendations ───────────────────────────────────────────────

export type AIRecommendation = {
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
  savings?: number;
};

export type TeamInsightInput = {
  totalCost: number;
  avgEfficiencyScore: number;
  totalMeetings: number;
  lowEfficiencyMeetings: number;
  topMeetings: Array<{
    title: string;
    cost: number;
    duration: number;
    people: number;
  }>;
  period: string;
  /** Optional locale code, e.g. "en" or "de" */
  locale?: string;
  pollSummary?: {
    totalResponses: number;
    usefulYes: number;
    usefulPartially: number;
    usefulNo: number;
    focusHigh: number;
    focusMedium: number;
    focusLow: number;
  };
};

export async function generateTeamRecommendations(
  data: TeamInsightInput,
): Promise<AIRecommendation[]> {
  const locale = (data.locale ?? "en").toLowerCase();
  const isGerman = locale.startsWith("de");

  const raw = await chatCompletion(
    [
      {
        role: "system",
        content: isGerman
          ? "Du bist ein Meeting-Effizienzberater. Erstelle praxisnahe, umsetzbare Empfehlungen basierend auf realen Daten. Antworte immer mit einem reinen JSON-Array, ohne zusätzlichen Text. Schreibe alle Titel und Beschreibungen auf Deutsch."
          : "You are a meeting efficiency consultant. Generate practical, actionable recommendations based on real data. Always reply with a pure JSON array, no extra text. Write all titles and descriptions in English.",
      },
      {
        role: "user",
        content:
          (isGerman
            ? `Analysiere die Meeting-Daten dieses Teams für ${data.period} und gib 4–5 kurze, umsetzbare Empfehlungen zurück.\n\n` +
              `Gesamte Meeting-Kosten: €${data.totalCost.toFixed(0)}\n` +
              `Durchschnittlicher Effizienzscore: ${data.avgEfficiencyScore.toFixed(0)}/100\n` +
              `Anzahl Meetings: ${data.totalMeetings}\n` +
              `Meetings mit geringer Effizienz (Score < 50): ${data.lowEfficiencyMeetings}\n` +
              `Teuerste Meetings: ${data.topMeetings
                .slice(0, 3)
                .map(
                  (m) =>
                    `"${m.title}" (€${m.cost.toFixed(
                      0,
                    )}, ${m.duration} Min., ${m.people} Personen)`,
                )
                .join("; ")}\n` +
              (data.pollSummary
                ? `\nUmfrageantworten (${data.pollSummary.totalResponses} insgesamt):\n` +
                  `  Nützlichkeit: ${data.pollSummary.usefulYes} ja / ${data.pollSummary.usefulPartially} teilweise / ${data.pollSummary.usefulNo} nein\n` +
                  `  Fokus: ${data.pollSummary.focusHigh} hoch / ${data.pollSummary.focusMedium} mittel / ${data.pollSummary.focusLow} niedrig\n`
                : "") +
              '\nGib nur folgendes JSON-Array zurück: [{"priority":"high"|"medium"|"low","title":"...","description":"...","savings":number_or_null}]\n' +
              "Regeln: title max. 6 Wörter; description max. 1 Satz (≤20 Wörter); savings = geschätzte EUR/Monat, null falls unbekannt."
            : `Analyze this team's meeting data for ${data.period} and return 4–5 short, actionable recommendations.\n\n` +
              `Total meeting cost: €${data.totalCost.toFixed(0)}\n` +
              `Average efficiency score: ${data.avgEfficiencyScore.toFixed(0)}/100\n` +
              `Total meetings: ${data.totalMeetings}\n` +
              `Low-efficiency meetings (score < 50): ${data.lowEfficiencyMeetings}\n` +
              `Most expensive meetings: ${data.topMeetings
                .slice(0, 3)
                .map(
                  (m) =>
                    `"${m.title}" (€${m.cost.toFixed(
                      0,
                    )}, ${m.duration} min, ${m.people} people)`,
                )
                .join("; ")}\n` +
              (data.pollSummary
                ? `\nPoll responses (${data.pollSummary.totalResponses} total):\n` +
                  `  Useful: ${data.pollSummary.usefulYes} yes / ${data.pollSummary.usefulPartially} partially / ${data.pollSummary.usefulNo} no\n` +
                  `  Focus: ${data.pollSummary.focusHigh} high / ${data.pollSummary.focusMedium} medium / ${data.pollSummary.focusLow} low\n`
                : "") +
              '\nReturn only: [{"priority":"high"|"medium"|"low","title":"...","description":"...","savings":number_or_null}]\n' +
              "Rules: title max 6 words; description max 1 sentence (≤20 words); savings = estimated EUR/month, null if unknown."),
      },
    ],
    0.5,
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Failed to parse AI recommendations JSON");
  }

  if (!Array.isArray(parsed)) throw new Error("Expected JSON array from AI");

  return (parsed as Array<Record<string, unknown>>).map((r) => ({
    priority: (["high", "medium", "low"] as const).includes(
      r.priority as "high" | "medium" | "low",
    )
      ? (r.priority as "high" | "medium" | "low")
      : "medium",
    title: typeof r.title === "string" ? r.title : "",
    description: typeof r.description === "string" ? r.description : "",
    savings:
      typeof r.savings === "number" && r.savings > 0 ? r.savings : undefined,
  }));
}
