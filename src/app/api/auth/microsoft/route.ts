import {NextRequest, NextResponse} from "next/server";
import {cookies} from "next/headers";
import {createSupabaseServerClient} from "@/app/lib/supabase-server";
import {getMicrosoftAuthorizeUrl} from "@/lib/microsoft-graph";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: {session},
  } = await supabase.auth.getSession();

  // Require authenticated user before connecting Outlook
  if (!session) {
    const loginUrl = new URL("/en/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      {error: "Microsoft OAuth is not configured on the server"},
      {status: 500},
    );
  }

  const state = crypto.randomUUID();
  const authorizeUrl = getMicrosoftAuthorizeUrl(clientId, redirectUri, state);

  // Persist state to validate in callback
  const cookieStore = await cookies();
  cookieStore.set("ms_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60, // 10 minutes
  });

  return NextResponse.redirect(authorizeUrl);
}
