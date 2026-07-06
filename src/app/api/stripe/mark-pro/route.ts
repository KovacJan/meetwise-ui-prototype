import {NextRequest, NextResponse} from "next/server";
import {revalidatePath} from "next/cache";
import {createSupabaseServerClient, createSupabaseAdminClient} from "@/app/lib/supabase-server";

export async function POST(_req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdminClient();

    const {
      data: {user},
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({error: "Unauthorized"}, {status: 401});
    }

    const {data: profile, error: profileError} = await admin
      .from("profiles")
      .select("team_id, is_manager")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile?.team_id) {
      return NextResponse.json({error: "No team found for user"}, {status: 400});
    }

    if (!profile.is_manager) {
      return NextResponse.json(
        {error: "Only team managers can change the plan"},
        {status: 403},
      );
    }

    const {error: updateError} = await admin
      .from("teams")
      .update({plan: "pro"})
      .eq("id", profile.team_id);

    if (updateError) {
      return NextResponse.json({error: updateError.message}, {status: 500});
    }

    revalidatePath("/", "layout");

    return NextResponse.json({success: true});
  } catch (err) {
    console.error("mark-pro error", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to mark team as Pro plan.",
      },
      {status: 500},
    );
  }
}

