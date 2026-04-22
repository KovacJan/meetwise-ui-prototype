import {createServerClient} from "@supabase/ssr";
import {createClient as createSupabaseClient, type SupabaseClient} from "@supabase/supabase-js";
import {cookies} from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function assertEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
const supabaseAnonKey = assertEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);
const supabaseServiceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: {name: string; value: string; options?: object}[]) {
        try {
          cookiesToSet.forEach(({name, value, options}) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Ignore writes during Server Component render; middleware keeps session alive.
        }
      },
    },
  });
}

export function createSupabaseAdminClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("createSupabaseAdminClient must only be called on the server");
  }
  return createSupabaseClient(supabaseUrl, supabaseServiceRoleKey);
}
