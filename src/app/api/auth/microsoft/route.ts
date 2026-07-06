import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/app/lib/supabase-server";
import {
  getMicrosoftAuthorizeUrl,
  MICROSOFT_AUTH_SCOPE,
  MICROSOFT_READONLY_AUTH_SCOPE,
} from "@/lib/microsoft-graph";

export async function GET(req: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Require authenticated user before connecting Outlook
  if (!user) {
    const loginUrl = new URL("/en/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Microsoft OAuth is not configured on the server" },
      { status: 500 },
    );
  }

  const state = crypto.randomUUID();
  const url = new URL(req.url);
  const upgradeWrite = url.searchParams.get("upgrade") === "write";
  const reconnect = url.searchParams.get("reconnect") === "1";
  const authorizeUrl = getMicrosoftAuthorizeUrl(clientId, redirectUri, state, {
    scope: upgradeWrite ? MICROSOFT_AUTH_SCOPE : MICROSOFT_READONLY_AUTH_SCOPE,
    promptConsent: upgradeWrite || reconnect,
  });

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
