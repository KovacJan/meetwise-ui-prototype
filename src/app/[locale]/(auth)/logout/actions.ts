"use server";

import {redirect} from "next/navigation";
import {createSupabaseServerClient} from "@/app/lib/supabase-server";

export async function signOut(locale: string) {
  const supabase = await createSupabaseServerClient();

  await supabase.auth.signOut();

  redirect(`/${locale}/login`);
}

