import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next");
  const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/account";
  const supabase = await createClient();
  if (!supabase) return NextResponse.redirect(new URL("/auth/sign-in?error=configuration", url.origin));
  const result = tokenHash && type
    ? await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    : code ? await supabase.auth.exchangeCodeForSession(code) : { error: new Error("Ontbrekende authenticatiecode.") };
  return NextResponse.redirect(new URL(result.error ? "/auth/sign-in?error=invalid" : destination, url.origin));
}

