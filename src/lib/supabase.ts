import {createBrowserClient} from "@supabase/ssr";
import type {SupabaseClient} from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function assertEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const supabaseUrl = assertEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
const supabaseAnonKey = assertEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);

export function createSupabaseBrowserClient(): SupabaseClient {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
