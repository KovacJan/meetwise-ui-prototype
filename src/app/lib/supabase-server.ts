import {createServerClient} from "@supabase/ssr";
import {createClient as createSupabaseClient, type SupabaseClient} from "@supabase/supabase-js";
import {cookies} from "next/headers";

function assertEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

/** Read at call time so `next build` does not fail when collecting route modules without env. */
function getSupabaseServerEnv() {
  return {
    url: assertEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    anonKey: assertEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    serviceRoleKey: assertEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  };
}

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const {url, anonKey} = getSupabaseServerEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
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
  const {url, serviceRoleKey} = getSupabaseServerEnv();
  return createSupabaseClient(url, serviceRoleKey);
}
