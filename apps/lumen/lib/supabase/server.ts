import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabasePublicConfiguration } from "@/lib/cloud/config";

export async function createClient() {
  const configuration = getSupabasePublicConfiguration();
  if (!configuration) return null;
  const cookieStore = await cookies();
  return createServerClient(configuration.url, configuration.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot always write cookies. The middleware refreshes them.
        }
      },
    },
  });
}

export function createServiceClient() {
  const configuration = getSupabasePublicConfiguration();
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!configuration || !secret) return null;
  return createAdminClient(configuration.url, secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

