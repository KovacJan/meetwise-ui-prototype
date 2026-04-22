import {NextRequest, NextResponse} from "next/server";
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/app/lib/supabase-server";
import {
  generateTeamRecommendations,
  isAnyAIConfigured,
  type TeamInsightInput,
} from "@/lib/azure-ai";

export const dynamic = "force-dynamic";

function buildPeriodKey(period: string, from?: string, to?: string): string {
  if (period === "custom" && from && to) return `custom:${from}:${to}`;
  return period;
}

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  const {searchParams} = new URL(req.url);
  const period = searchParams.get("period") ?? "month";
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  const periodKey = buildPeriodKey(period, from, to);

  const admin = createSupabaseAdminClient();
  const {data: profile} = await admin
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.team_id) {
    return NextResponse.json({recommendations: [], generated_at: null});
  }

  const {data: row, error} = await admin
    .from("ai_team_recommendations")
    .select("recommendations, generated_at")
    .eq("team_id", profile.team_id)
    .eq("period_key", periodKey)
    .maybeSingle();

  if (error) {
    console.error("GET recommendations:", error);
    return NextResponse.json({recommendations: [], generated_at: null});
  }

  const recommendations = Array.isArray(row?.recommendations)
    ? row.recommendations
    : [];
  const generated_at =
    row?.generated_at != null ? String(row.generated_at) : null;

  return NextResponse.json({recommendations, generated_at});
}

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: {user},
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({error: "Unauthorized"}, {status: 401});
  }

  if (!isAnyAIConfigured()) {
    return NextResponse.json(
      {
        error: "no_ai_configured",
        message:
          "No AI provider configured. Set AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY (or OPENAI_API_KEY) in your environment.",
      },
      {status: 503},
    );
  }

  let body: TeamInsightInput & {from?: string; to?: string};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({error: "Invalid JSON body"}, {status: 400});
  }

  const admin = createSupabaseAdminClient();
  const {data: profile} = await admin
    .from("profiles")
    .select("team_id")
    .eq("id", user.id)
    .maybeSingle();

  // Enrich with real poll response aggregates for this team
  try {
    if (profile?.team_id) {
      const {data: polls} = await admin
        .from("poll_responses")
        .select("was_useful, focus_level, actual_duration_minutes")
        .in(
          "meeting_id",
          (
            await admin
              .from("meetings")
              .select("id")
              .eq("team_id", profile.team_id)
          ).data?.map((m) => m.id) ?? [],
        );

      if (polls && polls.length > 0) {
        const usefulYes = polls.filter((p) => p.was_useful === "yes").length;
        const usefulPartially = polls.filter(
          (p) => p.was_useful === "partially",
        ).length;
        const usefulNo = polls.filter((p) => p.was_useful === "no").length;
        const focusHigh = polls.filter((p) => p.focus_level === "high").length;
        const focusMedium = polls.filter(
          (p) => p.focus_level === "medium",
        ).length;
        const focusLow = polls.filter((p) => p.focus_level === "low").length;

        body = {
          ...body,
          pollSummary: {
            totalResponses: polls.length,
            usefulYes,
            usefulPartially,
            usefulNo,
            focusHigh,
            focusMedium,
            focusLow,
          },
        };
      }
    }
  } catch (e) {
    console.warn("Could not fetch poll data for recommendations:", e);
  }

  try {
    const recommendations = await generateTeamRecommendations(body);
    const generated_at = new Date().toISOString();

    if (profile?.team_id) {
      const periodKey = buildPeriodKey(body.period, body.from, body.to);
      const {error: upsertError} = await admin
        .from("ai_team_recommendations")
        .upsert(
          {
            team_id: profile.team_id,
            period_key: periodKey,
            recommendations,
            generated_at,
          },
          {onConflict: "team_id,period_key"},
        );
      if (upsertError) {
        console.error("Failed to save recommendations:", upsertError);
      }
    }

    return NextResponse.json({recommendations, generated_at});
  } catch (e) {
    console.error("Failed to generate AI recommendations:", e);
    return NextResponse.json(
      {error: "AI generation failed", message: String(e)},
      {status: 500},
    );
  }
}
